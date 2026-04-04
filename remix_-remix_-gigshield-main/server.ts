import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import Razorpay from "razorpay";
import crypto from "crypto";
import {
  computePayout,
  weeklyPaidForPolicy,
  dailyPaidForPolicy,
  istDateKey,
} from "./payout";

const ZONE_COORDS: Record<string, { lat: number; lon: number }> = {
  "Mumbai - Dharavi": { lat: 19.033, lon: 72.8515 },
  "Delhi - Okhla": { lat: 28.5462, lon: 77.2732 },
  "Bengaluru - Koramangala": { lat: 12.9352, lon: 77.6245 },
  "Hyderabad - Gachibowli": { lat: 17.4401, lon: 78.3489 },
};

/** Rough US AQI estimate from PM2.5 µg/m³ (OpenWeather air pollution). */
function pm25ToAqi(pm25: number): number {
  if (pm25 <= 0) return 0;
  if (pm25 <= 12) return Math.round((50 / 12) * pm25);
  if (pm25 <= 35.4) return Math.round(50 + (100 - 51) / (35.4 - 12.1) * (pm25 - 12.1));
  if (pm25 <= 55.4) return Math.round(101 + (150 - 101) / (55.4 - 35.5) * (pm25 - 35.5));
  if (pm25 <= 150.4) return Math.round(151 + (200 - 151) / (150.4 - 55.5) * (pm25 - 55.5));
  if (pm25 <= 250.4) return Math.round(201 + (300 - 201) / (250.4 - 150.5) * (pm25 - 150.5));
  if (pm25 <= 350.4) return Math.round(301 + (400 - 301) / (350.4 - 250.5) * (pm25 - 250.5));
  if (pm25 <= 500.4) return Math.round(401 + (500 - 401) / (500.4 - 350.5) * (pm25 - 350.5));
  return 500;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Razorpay
let razorpay: Razorpay | null = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // --- In-memory store (not a real DB — data is lost when the server restarts) ---
  let riders: any[] = [];
  let policies: any[] = [];
  let triggerEvents: any[] = [];
  let claims: any[] = [];
  let notifications: any[] = [];

  function normalizePhone(p: string): string {
    return String(p || "").replace(/\D/g, "");
  }

  function phonesMatch(stored: string, input: string): boolean {
    const a = normalizePhone(stored);
    const b = normalizePhone(input);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 10 && b.length >= 10 && a.slice(-10) === b.slice(-10)) return true;
    return false;
  }

  function namesMatch(storedName: string, inputName: string): boolean {
    const norm = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/\s*\(seed\)\s*/gi, "")
        .replace(/\s+/g, " ");
    const s = norm(storedName);
    const i = norm(inputName);
    if (!i) return false;
    if (s === i) return true;
    if (s.startsWith(i) || i.startsWith(s)) return true;
    const sf = s.split(" ")[0];
    const inf = i.split(" ")[0];
    if (sf && inf && sf === inf) return true;
    return false;
  }

  const DEMO_OTP = "123456";
  const pendingOtps = new Map<string, string>();

  (function seedDemoRider() {
    const seedId = "R-SEED-DEMO";
    if (riders.some((r) => r.id === seedId)) return;
    const r = {
      id: seedId,
      name: "Amit Kumar (seed)",
      phone: "9999999999",
      platformId: "ZEP-SEED-01",
      zone: "Mumbai - Dharavi",
      earnings: 5000,
      upiId: "seed.rider@upi",
    };
    riders.push(r);
    policies.push({
      id: "P-SEED-DEMO",
      riderId: seedId,
      premium: 80,
      status: "active",
      zone: r.zone,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  })();

  app.get("/api/riders/lookup", (req, res) => {
    const raw = String(req.query.phone || "");
    if (!normalizePhone(raw)) {
      return res.status(400).json({ error: "phone required" });
    }
    const rider = riders.find((r) => phonesMatch(r.phone, raw));
    if (!rider) {
      return res.status(404).json({ error: "no account for this number" });
    }
    res.json(rider);
  });

  /** Demo OTP login — SMS not wired; OTP is always 123456 after a successful request. */
  app.post("/api/auth/request-otp", (req, res) => {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "");
    const n = normalizePhone(phone);
    if (!name) return res.status(400).json({ error: "name required" });
    if (!n) return res.status(400).json({ error: "phone required" });
    const rider = riders.find((r) => phonesMatch(r.phone, phone));
    if (!rider || !namesMatch(rider.name, name)) {
      return res
        .status(404)
        .json({ error: "No rider matches this name and phone. Try new rider signup." });
    }
    pendingOtps.set(n, DEMO_OTP);
    res.json({ ok: true, demoOtp: DEMO_OTP, message: "Demo: enter OTP below" });
  });

  app.post("/api/auth/login", (req, res) => {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "");
    const otp = String(req.body.otp || "").trim();
    const n = normalizePhone(phone);
    if (!name) return res.status(400).json({ error: "name required" });
    if (!n) return res.status(400).json({ error: "phone required" });
    if (!otp) return res.status(400).json({ error: "otp required" });
    if (!pendingOtps.has(n)) {
      return res.status(400).json({ error: "Tap Send OTP first" });
    }
    if (otp !== pendingOtps.get(n)) {
      return res.status(401).json({ error: "Wrong OTP. Demo OTP is 123456" });
    }
    pendingOtps.delete(n);
    const rider = riders.find((r) => phonesMatch(r.phone, phone));
    if (!rider || !namesMatch(rider.name, name)) {
      return res.status(403).json({ error: "name/phone mismatch" });
    }
    res.json(rider);
  });

  // --- API Routes ---

  app.post("/api/register", (req, res) => {
    const rider = { ...req.body, id: `R-${Date.now()}` };
    riders.push(rider);
    res.json(rider);
  });

  async function fetchLiveMetrics(
    zone: string,
    apiKey: string
  ): Promise<{ temp: number; rain: number; aqi: number } | null> {
    const coords = ZONE_COORDS[zone] || ZONE_COORDS["Mumbai - Dharavi"];
    const weatherRes = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric`
    );
    const airRes = await axios.get(
      `https://api.openweathermap.org/data/2.5/air_pollution?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}`
    );
    const pm25 = airRes.data?.list?.[0]?.components?.pm2_5 ?? 0;
    return {
      temp: Math.round(weatherRes.data.main.temp),
      rain: weatherRes.data.rain ? weatherRes.data.rain["1h"] || 0 : 0,
      aqi: pm25ToAqi(pm25),
    };
  }

  // --- OpenWeather Integration ---
  app.get("/api/weather", async (req, res) => {
    const { zone } = req.query;
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey || apiKey === "YOUR_OPENWEATHER_API_KEY") {
      return res.json({
        temp: 32,
        rain: 2,
        aqi: 142,
        isMock: true
      });
    }

    try {
      const z = String(zone || "Mumbai - Dharavi");
      const metrics = await fetchLiveMetrics(z, apiKey);
      if (!metrics) throw new Error("no metrics");
      res.json({ ...metrics, isMock: false });
    } catch (error) {
      console.error("Weather API Error:", error);
      res.json({ temp: 30, rain: 0, aqi: 120, isMock: true });
    }
  });

  /** Count distinct calendar days (IST) in OWM 5-day/3hr forecast breaching rain or heat thresholds. */
  app.get("/api/forecast-days", async (req, res) => {
    const zone = String(req.query.zone || "Mumbai - Dharavi");
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey || apiKey === "YOUR_OPENWEATHER_API_KEY") {
      return res.json({ forecastDays: 2, isMock: true });
    }
    try {
      const coords = ZONE_COORDS[zone] || ZONE_COORDS["Mumbai - Dharavi"];
      const fc = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${coords.lat}&lon=${coords.lon}&appid=${apiKey}&units=metric`
      );
      const list = fc.data.list as Array<{
        dt: number;
        main: { temp: number };
        rain?: { "3h"?: number };
      }>;
      const dayAgg = new Map<string, { maxTemp: number; maxRainHr: number }>();
      for (const item of list) {
        const key = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(item.dt * 1000));
        const rain3h = item.rain?.["3h"] ?? 0;
        const rainPerHour = rain3h / 3;
        const cur = dayAgg.get(key) || { maxTemp: -273, maxRainHr: 0 };
        cur.maxTemp = Math.max(cur.maxTemp, item.main.temp);
        cur.maxRainHr = Math.max(cur.maxRainHr, rainPerHour);
        dayAgg.set(key, cur);
      }
      let breachDays = 0;
      for (const v of dayAgg.values()) {
        if (v.maxTemp > 42 || v.maxRainHr > 20) breachDays++;
      }
      res.json({ forecastDays: breachDays, isMock: false });
    } catch (e) {
      console.error("forecast-days", e);
      res.json({ forecastDays: 1, isMock: true });
    }
  });

  // --- Razorpay Integration ---
  app.post("/api/payment/order", async (req, res) => {
    const { amount, currency = "INR" } = req.body;

    if (!razorpay) {
      return res.status(400).json({ error: "Razorpay not configured" });
    }

    try {
      const order = await razorpay.orders.create({
        amount: amount * 100, // Amount in paise
        currency,
        receipt: `receipt_${Date.now()}`,
      });
      res.json(order);
    } catch (error) {
      console.error("Razorpay Order Error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/payment/verify", (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET || "";

    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature === razorpay_signature) {
      res.json({ status: "success" });
    } else {
      res.status(400).json({ status: "failure" });
    }
  });

  app.post("/api/quote", async (req, res) => {
    const { zone, earnings, aiRisk, riderId } = req.body;
    
    // 1. Base Premium
    const basePremium = 45;
    
    // 2. Earnings Adjustment (Higher earnings = higher protection cost)
    const earningsAdjustment = (earnings / 5000) * 15;
    
    // 3. Past Claims Adjustment (Simulated)
    let claimsAdjustment = 0;
    if (riderId) {
      const riderPolicies = policies.filter(p => p.riderId === riderId).map(p => p.id);
      const riderClaimsCount = claims.filter(c => riderPolicies.includes(c.policyId)).length;
      claimsAdjustment = riderClaimsCount * 5; // Increase premium by ₹5 for each past claim
    }

    // 4. AI Risk Analysis (from frontend or default)
    const risk = aiRisk || { riskScore: 50, premiumAdjustment: 0, reasoning: "Standard risk profile applied.", predictedDisruptions: ["Rain"] };
    
    const finalPremium = Math.max(35, Math.round(basePremium + risk.premiumAdjustment + earningsAdjustment + claimsAdjustment));
    
    res.json({ 
      premium: finalPremium, 
      aiRisk: risk,
      breakdown: {
        base: basePremium,
        aiAdjustment: risk.premiumAdjustment,
        earningsAdjustment: Math.round(earningsAdjustment),
        claimsAdjustment
      }
    });
  });

  app.post("/api/policies", (req, res) => {
    const policy = { 
      ...req.body, 
      id: `P-${Date.now()}`,
      status: 'active',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    // Mark previous active policies as expired for this rider
    policies.forEach(p => {
      if (p.riderId === req.body.riderId && p.status === 'active') {
        p.status = 'expired';
      }
    });
    policies.push(policy);
    res.json(policy);
  });

  app.get("/api/policies/history/:riderId", (req, res) => {
    const riderPolicies = policies.filter(p => p.riderId === req.params.riderId);
    res.json(riderPolicies.reverse());
  });

  app.get("/api/policies/:riderId", (req, res) => {
    const policy = policies.find(p => p.riderId === req.params.riderId && p.status === 'active');
    res.json(policy || null);
  });

  app.get("/api/claims/:riderId", (req, res) => {
    const riderPolicies = policies.filter(p => p.riderId === req.params.riderId).map(p => p.id);
    const riderClaims = claims.filter(c => riderPolicies.includes(c.policyId));
    res.json(riderClaims);
  });

  const triggerThresholds: Record<string, number> = {
    Rain: 20,
    AQI: 300,
    Heat: 42,
    Traffic: 80,
    Flood: 1,
  };

  const defaultHoursLost: Record<string, number> = {
    Rain: 3,
    AQI: 2,
    Heat: 2,
    Traffic: 2.5,
    Flood: 5,
  };

  const lastAutoTriggerMs = new Map<string, number>();
  const AUTO_COOLDOWN_MS = 45 * 60 * 1000;

  function processParametricTrigger(
    zone: string,
    type: string,
    value: number,
    body: { impactFactor?: number; source?: string }
  ) {
    const threshold = triggerThresholds[type] ?? 0;
    const isTriggered = value >= threshold;

    const event = {
      id: `E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      zone,
      type,
      value,
      timestamp: new Date().toISOString(),
      confidence: 0.92,
      isTriggered,
      source: body.source || "api",
    };
    triggerEvents.push(event);

    if (!isTriggered) {
      return {
        message: "Event logged but threshold not met.",
        event,
        affectedCount: 0,
      };
    }

    const affectedPolicies = policies.filter(
      (p) => p.zone === zone && p.status === "active"
    );
    const nowIso = new Date().toISOString();
    const todayKey = istDateKey(nowIso);

    for (const policy of affectedPolicies) {
      const rider = riders.find((r) => r.id === policy.riderId);
      if (!rider) continue;

      const hoursLost =
        typeof body.impactFactor === "number" &&
        !Number.isNaN(body.impactFactor) &&
        body.impactFactor > 0
          ? body.impactFactor
          : defaultHoursLost[type] ?? 2;

      const weeklyPaid = weeklyPaidForPolicy(claims, rider.id, policy.id);
      const dailyPaid = dailyPaidForPolicy(
        claims,
        rider.id,
        policy.id,
        todayKey
      );

      const { raw, payout, capped } = computePayout(
        rider.earnings,
        hoursLost,
        weeklyPaid,
        dailyPaid
      );

      if (payout <= 0) {
        notifications.push({
          id: `N-${Date.now()}-${rider.id}-${type}`,
          riderId: rider.id,
          title: "Disruption detected — payout capped",
          message: `Your ${type} trigger matched, but weekly/daily/event caps left ₹0 for this payout (raw would be ₹${Math.round(raw)}).`,
          timestamp: nowIso,
          read: false,
          type: "info",
        });
        continue;
      }

      const claim = {
        id: `C-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        policyId: policy.id,
        riderId: rider.id,
        eventId: event.id,
        amount: payout,
        status: "paid" as const,
        timestamp: nowIso,
        type,
        reason: `Automated payout for ${type} in ${zone}.${capped ? " (capped)" : ""}`,
      };
      claims.push(claim);

      notifications.push({
        id: `N-${Date.now()}-${rider.id}`,
        riderId: rider.id,
        title: "Instant payout — transferred to UPI",
        message: `₹${payout} sent to your registered UPI for ${type} (${body.source || "trigger"}).`,
        timestamp: nowIso,
        read: false,
        type: "payout",
      });
    }

    return {
      message: `Triggered ${type} in ${zone}. ${affectedPolicies.length} policies evaluated.`,
      event,
      affectedCount: affectedPolicies.length,
    };
  }

  app.post("/api/admin/trigger", (req, res) => {
    const { zone, type, value } = req.body;
    const out = processParametricTrigger(zone, type, Number(value), {
      impactFactor: req.body.impactFactor,
      source: "admin",
    });
    res.json(out);
  });

  app.post("/api/claims/manual", (req, res) => {
    const { riderId, policyId, message } = req.body;
    const text = String(message ?? "").trim();
    if (!text) {
      return res.status(400).json({ error: "Message required" });
    }
    const riderRow = riders.find((r) => r.id === riderId);
    if (!riderRow) {
      return res.status(404).json({ error: "Rider not found" });
    }
    const pol =
      policies.find((p) => p.id === policyId && p.riderId === riderId) ||
      policies.find((p) => p.riderId === riderId && p.status === "active");
    if (!pol) {
      return res.status(404).json({ error: "Policy not found" });
    }
    const claim = {
      id: `M-${Date.now()}`,
      policyId: pol.id,
      riderId,
      amount: 0,
      status: "pending" as const,
      timestamp: new Date().toISOString(),
      type: "Review",
      reason: `Did we miss anything: ${text}`,
    };
    claims.push(claim);
    res.json(claim);
  });

  async function runLiveWeatherCheck() {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey || apiKey === "YOUR_OPENWEATHER_API_KEY") return;

    const zoneSet = new Set<string>();
    for (const p of policies) {
      if (p.status === "active") zoneSet.add(p.zone);
    }
    const zones = [...zoneSet];
    if (zones.length === 0) return;

    const now = Date.now();
    for (const zone of zones) {
      try {
        const metrics = await fetchLiveMetrics(zone, apiKey);
        if (!metrics) continue;

        const tryFire = (t: string, v: number) => {
          const key = `${zone}|${t}`;
          if (now - (lastAutoTriggerMs.get(key) || 0) < AUTO_COOLDOWN_MS) return;
          if (v < (triggerThresholds[t] ?? Infinity)) return;
          lastAutoTriggerMs.set(key, now);
          processParametricTrigger(zone, t, v, { source: "weather-poll" });
        };

        tryFire("Rain", metrics.rain);
        tryFire("Heat", metrics.temp);
        tryFire("AQI", metrics.aqi);
      } catch (e) {
        console.error("live weather check", zone, e);
      }
    }
  }

  app.get("/api/notifications/:riderId", (req, res) => {
    const riderNotifications = notifications.filter(n => n.riderId === req.params.riderId);
    res.json(riderNotifications.slice(-10).reverse());
  });

  app.post("/api/notifications/read", (req, res) => {
    const { riderId } = req.body;
    notifications.forEach(n => {
      if (n.riderId === riderId) n.read = true;
    });
    res.json({ status: "ok" });
  });

  app.post("/api/policies/cancel", (req, res) => {
    const { policyId } = req.body;
    const policy = policies.find(p => p.id === policyId);
    if (policy) {
      policy.status = 'cancelled';
      res.json({ status: "success", message: "Policy cancelled." });
    } else {
      res.status(404).json({ error: "Policy not found" });
    }
  });

  // --- Admin Stats ---
  app.get("/api/admin/stats", (req, res) => {
    const totalPremiums = policies.reduce((acc, p) => acc + p.premium, 0);
    const totalPayouts = claims.reduce((acc, c) => acc + c.amount, 0);
    const lossRatio = totalPremiums > 0 ? (totalPayouts / totalPremiums) * 100 : 0;
    
    res.json({
      activeRiders: riders.length,
      activePolicies: policies.filter(p => p.status === 'active').length,
      totalPremiums,
      totalPayouts,
      lossRatio: Math.round(lossRatio),
      claimsByZone: triggerEvents.length,
      recentEvents: triggerEvents.slice(-5).reverse()
    });
  });

  // Get All Policies (Admin)
  app.get("/api/admin/policies", (req, res) => {
    res.json(policies);
  });

  // Get All Riders (Admin)
  app.get("/api/admin/riders", (req, res) => {
    res.json(riders);
  });

  app.get("/api/admin/claims", (req, res) => {
    res.json([...claims].reverse());
  });

  // --- Vite Middleware (dynamic import avoids tsx on Windows breaking on @vitejs/plugin-react resolution) ---
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer, loadEnv } = await import("vite");
    const { default: react } = await import("@vitejs/plugin-react");
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    const env = loadEnv("development", __dirname, "");
    const vite = await createViteServer({
      configFile: false,
      root: __dirname,
      server: { middlewareMode: true },
      appType: "spa",
      plugins: [react(), tailwindcss()],
      define: {
        "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY ?? ""),
      },
      resolve: {
        alias: { "@": path.resolve(__dirname, ".") },
      },
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`GigShield Server running on http://localhost:${PORT}`);
    void runLiveWeatherCheck();
    setInterval(() => void runLiveWeatherCheck(), 5 * 60 * 1000);
  });
}

startServer();
