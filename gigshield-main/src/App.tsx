import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Shield, 
  ChevronRight, 
  CloudRain, 
  Wind, 
  Thermometer, 
  Wallet, 
  CheckCircle2, 
  AlertTriangle,
  History,
  User,
  MapPin,
  IndianRupee,
  Activity
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { GoogleGenAI, Type } from "@google/genai";
import {
  calculatePremium,
  effectiveForecastDays,
} from "./lib/premium";

const LS_RISK_MODIFIER = "gigshield_zone_risk_modifier";

function predictQuoteDisruptions(probability: number, zone: string): string[] {
  const month = new Date().getMonth();
  const out: string[] = [];
  if (probability > 0.35) out.push("Rain");
  if (zone.startsWith("Delhi") || month >= 9 || month <= 1) out.push("AQI");
  if (month >= 3 && month <= 6) out.push("Heat");
  if (out.length === 0) out.push("Local delays");
  return [...new Set(out)].slice(0, 4);
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

declare global {
  interface Window {
    Razorpay: any;
  }
}

// --- Types ---
interface Rider {
  id: string;
  name: string;
  phone: string;
  platformId: string;
  zone: string;
  earnings: number;
  upiId: string;
}

interface Policy {
  id: string;
  riderId: string;
  premium: number;
  status: 'active' | 'expired';
  startDate: string;
  endDate: string;
  zone: string;
}

interface Claim {
  id: string;
  policyId: string;
  amount: number;
  status: "paid" | "pending";
  timestamp: string;
  type: string;
  reason?: string;
}

export default function App() {
  const [rider, setRider] = useState<Rider | null>(() => {
    const saved = localStorage.getItem("gigshield_rider");
    return saved ? JSON.parse(saved) : null;
  });
  const [admin, setAdmin] = useState<{ id: string; email: string } | null>(() => {
    const saved = localStorage.getItem("gigshield_admin");
    return saved ? JSON.parse(saved) : null;
  });
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [adminClaims, setAdminClaims] = useState<Claim[]>([]);
  const [view, setView] = useState<'dashboard' | 'history' | 'zones' | 'profile' | 'admin'>('dashboard');
  const [step, setStep] = useState(-3); // -3: Start, -2: Login vs New, 21: OTP login
  const [loading, setLoading] = useState(false);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [allRiders, setAllRiders] = useState<Rider[]>([]);
  const [allPolicies, setAllPolicies] = useState<Policy[]>([]);
  const [riderPolicies, setRiderPolicies] = useState<Policy[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [weather, setWeather] = useState<{ temp: number; rain: number; aqi: number; isMock: boolean } | null>(null);
  const [adminLogin, setAdminLogin] = useState({ user: "", pass: "" });
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPolicyDetails, setShowPolicyDetails] = useState(false);
  const [showManualClaim, setShowManualClaim] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    platformId: "",
    zone: "Mumbai - Dharavi",
    earnings: 5000,
    upiId: ""
  });

  const [quote, setQuote] = useState<{
    premium: number;
    aiRisk: {
      riskScore: number;
      reasoning: string;
      predictedDisruptions: string[];
      bandLabel?: string;
    };
    breakdown: {
      base: number;
      expenseLoading: number;
      riskBuffer: number;
      earningsAdjustment: number;
      claimsAdjustment: number;
      shapSummary: string;
      probability: number;
      forecastBreachDays: number;
      riskModifier: number;
    };
  } | null>(null);
  const [missedAnythingText, setMissedAnythingText] = useState("");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginOtp, setLoginOtp] = useState("");
  const [loginOtpSent, setLoginOtpSent] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // Simplified zone detection based on coordinates
        // Mumbai: 19.0760, 72.8777
        // Delhi: 28.6139, 77.2090
        // Bengaluru: 12.9716, 77.5946
        // Hyderabad: 17.3850, 78.4867
        
        let detectedZone = "Mumbai - Dharavi";
        if (latitude > 25) detectedZone = "Delhi - Okhla";
        else if (latitude < 15) {
          if (longitude > 77.6) detectedZone = "Bengaluru - Koramangala";
          else detectedZone = "Hyderabad - Gachibowli";
        }
        
        setFormData(prev => ({ ...prev, zone: detectedZone }));
        setDetecting(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Failed to detect location. Please select manually.");
        setDetecting(false);
      }
    );
  };

  useEffect(() => {
    if (rider) {
      fetchClaims();
      fetchWeather();
      fetchPolicy();
      fetchPolicyHistory();
      fetchNotifications();
      // Refresh weather every 10 minutes
      const interval = setInterval(() => {
        fetchWeather();
        fetchNotifications();
      }, 10 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [rider]);

  const fetchPolicyHistory = async () => {
    if (!rider) return;
    try {
      const res = await fetch(`/api/policies/history/${rider.id}`);
      const data = await res.json();
      setRiderPolicies(data);
    } catch (err) {
      console.error("Failed to fetch policy history", err);
    }
  };

  const fetchNotifications = async () => {
    if (!rider) return;
    try {
      const res = await fetch(`/api/notifications/${rider.id}`);
      const data = await res.json();
      setNotifications(data);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  };

  const markNotificationsRead = async () => {
    if (!rider) return;
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId: rider.id })
      });
      fetchNotifications();
    } catch (err) {
      console.error("Failed to mark notifications read", err);
    }
  };

  const cancelPolicy = async () => {
    if (!policy) return;
    if (!confirm("Are you sure you want to cancel your protection? You will lose coverage for the rest of the week.")) return;
    try {
      const res = await fetch("/api/policies/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId: policy.id })
      });
      const data = await res.json();
      if (data.status === "success") {
        setPolicy(null);
        setShowPolicyDetails(false);
        fetchPolicy();
        fetchPolicyHistory();
      }
    } catch (err) {
      console.error("Failed to cancel policy", err);
    }
  };

  useEffect(() => {
    if (admin) {
      fetchAdminStats();
      fetchAllRiders();
      fetchAllPolicies();
      fetchAdminClaims();
      setView('admin');
    }
  }, [admin]);

  useEffect(() => {
    if (!admin) return;
    const id = window.setInterval(() => {
      void fetchAdminClaims();
      void fetchAdminStats();
      void fetchAllPolicies();
      void fetchAllRiders();
    }, 20000);
    return () => clearInterval(id);
  }, [admin]);

  const fetchAllPolicies = async () => {
    try {
      const res = await fetch("/api/admin/policies");
      const data = await res.json();
      setAllPolicies(data);
    } catch (err) {
      console.error("Failed to fetch all policies", err);
    }
  };

  const fetchPolicy = async () => {
    if (!rider) return;
    try {
      const res = await fetch(`/api/policies/${rider.id}`);
      const data = await res.json();
      setPolicy(data);
    } catch (err) {
      console.error("Failed to fetch policy", err);
    }
  };

  const fetchWeather = async () => {
    if (!rider) return;
    try {
      const res = await fetch(`/api/weather?zone=${encodeURIComponent(rider.zone)}`);
      const data = await res.json();
      setWeather(data);
    } catch (err) {
      console.error("Failed to fetch weather", err);
    }
  };

  const fetchAllRiders = async () => {
    try {
      const res = await fetch("/api/admin/riders");
      const data = await res.json();
      setAllRiders(data);
    } catch (err) {
      console.error("Failed to fetch all riders", err);
    }
  };

  const fetchAdminStats = async () => {
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      setAdminStats(data);
    } catch (err) {
      console.error("Failed to fetch admin stats", err);
    }
  };

  const fetchAdminClaims = async () => {
    try {
      const res = await fetch("/api/admin/claims");
      const data = await res.json();
      setAdminClaims(data);
    } catch (err) {
      console.error("Failed to fetch admin claims", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("gigshield_rider");
    localStorage.removeItem("gigshield_admin");
    setRider(null);
    setAdmin(null);
    setPolicy(null);
    setAdminLogin({ user: "", pass: "" });
    setView('dashboard');
    setStep(-3);
  };

  const fetchClaims = async () => {
    if (!rider) return;
    try {
      const res = await fetch(`/api/claims/${rider.id}`);
      const data = await res.json();
      setClaims(data);
    } catch (err) {
      console.error("Failed to fetch claims", err);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      setRider(data);
      localStorage.setItem("gigshield_rider", JSON.stringify(data));
      
      // After registration, directly trigger policy activation
      if (quote) {
        await activatePolicy(data);
      } else {
        setStep(4);
      }
    } catch (err) {
      alert("Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const applyWeekRolloverModifier = async () => {
    if (!rider?.id) return;
    try {
      const cRes = await fetch(`/api/claims/${rider.id}`);
      const cl = await cRes.json();
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const hadPaid =
        Array.isArray(cl) &&
        cl.some(
          (c: { timestamp: string; status?: string; amount?: number }) =>
            new Date(c.timestamp).getTime() > weekAgo &&
            c.status === "paid" &&
            (c.amount ?? 0) > 0
        );
      const cur = Number(localStorage.getItem(LS_RISK_MODIFIER) || "0");
      const next = Math.min(1, Math.max(-0.5, cur + (hadPaid ? 0.1 : -0.05)));
      localStorage.setItem(LS_RISK_MODIFIER, String(next));
    } catch {
      /* ignore */
    }
  };

  const getQuote = async (zone: string, earnings: number) => {
    setLoading(true);
    try {
      const riskMod = Number(localStorage.getItem(LS_RISK_MODIFIER) || "0");
      let breachDays = 0;
      try {
        const fdRes = await fetch(
          `/api/forecast-days?zone=${encodeURIComponent(zone)}`
        );
        const fd = await fdRes.json();
        breachDays =
          typeof fd.forecastDays === "number" ? fd.forecastDays : 0;
      } catch {
        breachDays = 0;
      }

      const effectiveDays = effectiveForecastDays(breachDays, riskMod);

      let pastClaimCount = 0;
      if (rider?.id) {
        try {
          const cRes = await fetch(`/api/claims/${rider.id}`);
          const cl = await cRes.json();
          pastClaimCount = Array.isArray(cl)
            ? cl.filter(
                (c: { status?: string; amount?: number }) =>
                  c.status === "paid" || (c.amount && c.amount > 0)
              ).length
            : 0;
        } catch {
          /* ignore */
        }
      }

      const p = calculatePremium(effectiveDays, earnings, pastClaimCount);
      const prob = p.probability;

      setQuote({
        premium: p.gross,
        aiRisk: {
          riskScore: Math.round(prob * 100),
          reasoning: `OpenWeather 5-day forecast: ${breachDays} day(s) with rain >20mm/h or temp >42°C (IST days). Stored next-week zone risk modifier: ${riskMod >= 0 ? "+" : ""}${(riskMod * 100).toFixed(0)} percentage points (${riskMod > 0 ? "disruption last week raised" : riskMod < 0 ? "quiet week lowered" : "neutral carryover"}).`,
          predictedDisruptions: predictQuoteDisruptions(prob, zone),
          bandLabel: p.bandLabel,
        },
        breakdown: {
          base: p.breakdown.bandBase,
          expenseLoading: p.breakdown.expenseLoading,
          riskBuffer: p.breakdown.riskBuffer,
          earningsAdjustment: p.breakdown.earningsAdjustment,
          claimsAdjustment: p.breakdown.pastClaims,
          shapSummary: p.shapSummary,
          probability: prob,
          forecastBreachDays: breachDays,
          riskModifier: riskMod,
        },
      });
    } catch (err) {
      console.error("Quote failed", err);
    } finally {
      setLoading(false);
    }
  };

  const activatePolicy = async (currentRider?: any) => {
    const activeRider = currentRider || rider;
    console.log("Activating policy for:", activeRider?.id, "Quote:", quote?.premium);
    if (!activeRider || !quote) {
      console.warn("Missing rider or quote for activation");
      return;
    }
    setLoading(true);
    
    try {
      // 1. Create Razorpay Order
      const orderRes = await fetch("/api/payment/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: quote.premium })
      });
      const order = await orderRes.json();

      if (order.error) {
        // Fallback for demo if Razorpay is not configured
        console.warn("Razorpay not configured, proceeding with mock activation");
        await finalizePolicy(activeRider);
        return;
      }

      // 2. Open Razorpay Checkout
      const options = {
        key: process.env.RAZORPAY_KEY_ID || "rzp_test_mock",
        amount: order.amount,
        currency: order.currency,
        name: "GigShield",
        description: "Weekly Income Protection Premium",
        order_id: order.id,
        handler: async function (response: any) {
          console.log("Payment successful:", response.razorpay_payment_id);
          // 3. Verify Payment
          const verifyRes = await fetch("/api/payment/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response)
          });
          const verifyData = await verifyRes.json();

          if (verifyData.status === "success") {
            await finalizePolicy(activeRider);
          } else {
            alert("Payment verification failed");
          }
        },
        prefill: {
          contact: activeRider.phone,
        },
        theme: {
          color: "#2563eb",
        },
      };

      const rzp = (window as any).Razorpay ? new (window as any).Razorpay(options) : null;
      if (rzp) {
        rzp.open();
      } else {
        console.warn("Razorpay SDK not found, proceeding with mock activation");
        await finalizePolicy(activeRider);
      }
    } catch (err) {
      console.error("Payment flow failed", err);
      // Fallback for demo
      console.warn("Proceeding with mock activation due to error");
      await finalizePolicy(activeRider);
    } finally {
      setLoading(false);
    }
  };

  const finalizePolicy = async (currentRider?: any) => {
    const activeRider = currentRider || rider;
    if (!activeRider || !quote) return;
    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId: activeRider.id, premium: quote.premium, zone: activeRider.zone })
      });
      const data = await res.json();
      setPolicy(data);
      setStep(5); // Success
    } catch (err) {
      alert("Policy activation failed");
    }
  };

  // --- UI Components ---

  const triggerSim = async (type: string) => {
    if (!rider && !admin) return;
    const zone = rider?.zone || "Mumbai - Dharavi"; // Default for admin testing
    setLoading(true);
    
    try {
      // 1. Get AI Impact Analysis for the Trigger
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the economic impact of a ${type} disruption in ${zone} for delivery riders. 
        Estimate the number of hours of work lost for a typical rider during this event.
        Return a JSON object with:
        - hoursLost: number (e.g. 2.5, 4.0)
        - impactSeverity: "Low" | "Medium" | "High"
        - reasoning: short explanation of the impact.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hoursLost: { type: Type.NUMBER },
              impactSeverity: { type: Type.STRING },
              reasoning: { type: Type.STRING }
            }
          }
        }
      });

      const impact = JSON.parse(response.text);
      console.log("AI Impact Analysis:", impact);

      // 2. Send trigger with AI-calculated impact factor
      await fetch("/api/admin/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone, type, value: 100, impactFactor: impact.hoursLost })
      });

      if (rider) fetchClaims();
      fetchAdminStats();
      if (admin) fetchAdminClaims();
      
      if (admin) {
        alert(`AI Analysis: ${impact.reasoning}\nEstimated Hours Lost: ${impact.hoursLost}h\nSeverity: ${impact.impactSeverity}`);
      }
    } catch (err) {
      console.error("AI Trigger Analysis failed", err);
      // Fallback
      await fetch("/api/admin/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone, type, value: 100 })
      });
      if (rider) fetchClaims();
      fetchAdminStats();
      if (admin) fetchAdminClaims();
    } finally {
      setLoading(false);
    }
  };

  const onboardingSteps = [-3, -2, 0, 1, 4, 5, 10, 21] as const;
  const showOnboardingShell =
    (!rider && !admin && (onboardingSteps as readonly number[]).includes(step)) ||
    (rider && step >= 0);

  if (showOnboardingShell) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-6 flex flex-col justify-center max-w-md mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-900/20">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">GigShield</h1>
          <p className="text-neutral-400 mt-2">Parametric Income Protection</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {step === -3 && !rider && (
            <motion.div
              key="startLanding"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">Income protection for delivery partners</h2>
                <p className="text-sm text-neutral-400">
                  Automatic payouts when hyperlocal disruptions hit your zone — no claim forms.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(-2)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl text-lg shadow-lg shadow-blue-900/30 transition-colors"
              >
                Start
              </button>
            </motion.div>
          )}

          {step === -2 && !rider && (
            <motion.div 
              key="roleSelect"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-xl font-bold text-center">How do you want to continue?</h2>
              <div className="grid grid-cols-1 gap-4">
                <button 
                  type="button"
                  onClick={() => {
                    setLoginOtpSent(false);
                    setLoginOtp("");
                    setStep(21);
                  }}
                  className="bg-neutral-900 border border-neutral-700 p-6 rounded-2xl flex flex-col items-center gap-3 hover:border-blue-500 transition-all group text-left"
                >
                  <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center group-hover:bg-blue-600/30">
                    <User className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="text-center w-full">
                    <p className="font-bold text-white">Login</p>
                    <p className="text-xs text-neutral-400">Full name + phone — we&apos;ll verify with OTP (demo: 123456)</p>
                  </div>
                </button>
                <button 
                  type="button"
                  onClick={() => setStep(0)}
                  className="bg-blue-600 border border-blue-500 p-6 rounded-2xl flex flex-col items-center gap-3 hover:bg-blue-500 transition-all group shadow-lg shadow-blue-900/20"
                >
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center group-hover:bg-white/20">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-white">New rider</p>
                    <p className="text-xs text-blue-100">Zone & earnings → weekly premium → pay & activate</p>
                  </div>
                </button>
                <button 
                  type="button"
                  onClick={() => setStep(10)}
                  className="bg-neutral-900 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center gap-2 hover:border-purple-600/50 transition-all"
                >
                  <p className="text-sm font-bold text-purple-400">Insurer admin</p>
                  <p className="text-[10px] text-neutral-500">Dashboard & triggers</p>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setStep(-3)}
                className="w-full text-neutral-500 text-sm hover:text-white"
              >
                ← Back
              </button>
            </motion.div>
          )}

          {step === 10 && (
            <motion.div 
              key="adminLogin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold">Admin Login</h2>
                <p className="text-xs text-neutral-500 mt-1">Enter your credentials to continue</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Username</label>
                  <input 
                    type="text" 
                    placeholder="admin"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-purple-600 outline-none"
                    value={adminLogin.user}
                    onChange={e => setAdminLogin({...adminLogin, user: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Password</label>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-purple-600 outline-none"
                    value={adminLogin.pass}
                    onChange={e => setAdminLogin({...adminLogin, pass: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    if (adminLogin.user === "admin" && adminLogin.pass === "admin") {
                      const adminData = { id: "admin-1", email: "admin@gigshield.com" };
                      setAdmin(adminData);
                      localStorage.setItem("gigshield_admin", JSON.stringify(adminData));
                      setView('admin');
                    } else {
                      alert("Invalid credentials. Try admin/admin");
                    }
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2"
                >
                  Login <ChevronRight className="w-5 h-5" />
                </button>
                <button 
                  type="button"
                  onClick={() => setStep(-2)}
                  className="w-full text-neutral-500 text-sm font-medium hover:text-white transition-colors"
                >
                  Back
                </button>
              </div>
            </motion.div>
          )}

          {step === 21 && (
            <motion.div
              key="riderLoginOtp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <div className="text-center mb-1">
                <h2 className="text-xl font-bold">Login</h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Use the same name and phone you registered with. Demo seed:{" "}
                  <span className="text-blue-400 font-mono">Amit Kumar</span> /{" "}
                  <span className="text-blue-400 font-mono">9999999999</span> — OTP{" "}
                  <span className="text-blue-400 font-mono">123456</span>
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-400">Full name</label>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="As on your registration"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-600 outline-none"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-400">Phone number</label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="e.g. 9999999999"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-600 outline-none"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  if (!loginName.trim() || !loginPhone.trim()) {
                    alert("Enter name and phone.");
                    return;
                  }
                  setLoading(true);
                  try {
                    const res = await fetch("/api/auth/request-otp", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: loginName.trim(),
                        phone: loginPhone.trim(),
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      alert(data.error || "Could not send OTP.");
                      return;
                    }
                    setLoginOtpSent(true);
                    alert(`OTP sent (demo). Enter: ${data.demoOtp ?? "123456"}`);
                  } catch {
                    alert("Could not reach server.");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send OTP"}
              </button>
              {loginOtpSent && (
                <div className="space-y-2 pt-1">
                  <label className="text-sm font-medium text-neutral-400">Enter OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="123456"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-600 outline-none tracking-widest font-mono"
                    value={loginOtp}
                    onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              )}
              <button
                type="button"
                disabled={loading || !loginOtpSent}
                onClick={async () => {
                  if (!loginOtp.trim()) {
                    alert("Enter the OTP.");
                    return;
                  }
                  setLoading(true);
                  try {
                    const res = await fetch("/api/auth/login", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: loginName.trim(),
                        phone: loginPhone.trim(),
                        otp: loginOtp.trim(),
                      }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      alert(data.error || "Login failed.");
                      return;
                    }
                    const riderData = data;
                    setRider(riderData);
                    localStorage.setItem("gigshield_rider", JSON.stringify(riderData));
                    setLoginPhone("");
                    setLoginName("");
                    setLoginOtp("");
                    setLoginOtpSent(false);
                    setStep(-3);
                    setView("dashboard");
                  } catch {
                    alert("Could not reach server.");
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? "Verifying…" : "Verify & continue"}{" "}
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginOtpSent(false);
                  setLoginOtp("");
                  setStep(-2);
                }}
                className="w-full text-neutral-500 text-sm font-medium hover:text-white transition-colors"
              >
                Back
              </button>
            </motion.div>
          )}

          {step === 0 && (
            <motion.div 
              key="step0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <p className="text-xs text-neutral-500 text-center">
                Step 1 of 3 — we use this for your premium (forecast risk) and payouts.
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-neutral-400">Operating Zone</label>
                    <button 
                      onClick={detectLocation}
                      disabled={detecting}
                      className="text-[10px] text-blue-500 font-bold uppercase flex items-center gap-1 hover:text-blue-400 disabled:opacity-50"
                    >
                      <MapPin className={cn("w-3 h-3", detecting && "animate-bounce")} />
                      {detecting ? "Detecting..." : "Detect Location"}
                    </button>
                  </div>
                  <select 
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-600 outline-none"
                    value={formData.zone}
                    onChange={e => setFormData({...formData, zone: e.target.value})}
                  >
                    <option>Mumbai - Dharavi</option>
                    <option>Delhi - Okhla</option>
                    <option>Bengaluru - Koramangala</option>
                    <option>Hyderabad - Gachibowli</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Weekly Earnings (Target)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                    <input 
                      type="number" 
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 pl-12 focus:ring-2 focus:ring-blue-600 outline-none"
                      value={formData.earnings}
                      onChange={e => setFormData({...formData, earnings: parseInt(e.target.value)})}
                    />
                  </div>
                  <p className="text-xs text-neutral-500">This helps us calculate your disruption payouts.</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setStep(4);
                  getQuote(formData.zone, formData.earnings);
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                See my weekly premium <ChevronRight className="w-5 h-5" />
              </button>
              <button 
                type="button"
                onClick={() => setStep(-2)}
                className="w-full text-neutral-500 text-xs font-medium hover:text-white transition-colors"
              >
                Cancel & Back
              </button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold">Finalize Protection</h2>
                <p className="text-xs text-neutral-500 mt-1">Enter your details to activate the policy</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Full Name</label>
                  <input 
                    type="text" 
                    placeholder="John Doe"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-600 outline-none"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Phone Number</label>
                  <input 
                    type="tel" 
                    placeholder="+91 98765 43210"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-600 outline-none"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">Platform ID (Zepto/Blinkit)</label>
                  <input 
                    type="text" 
                    placeholder="EX: ZEP-4421"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-600 outline-none"
                    value={formData.platformId}
                    onChange={e => setFormData({...formData, platformId: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-400">UPI ID (for instant payouts)</label>
                  <input 
                    type="text" 
                    placeholder="rider@upi"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-600 outline-none"
                    value={formData.upiId}
                    onChange={e => setFormData({...formData, upiId: e.target.value})}
                  />
                </div>
              </div>
              <button 
                onClick={handleRegister}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50"
              >
                {loading ? "Activating..." : "Pay & Activate Policy"}
              </button>
              <button 
                onClick={() => setStep(4)}
                className="w-full text-neutral-500 text-xs font-medium hover:text-white transition-colors"
              >
                Back to Quote
              </button>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              {!quote ? (
                <div className="text-center py-12 space-y-4">
                  <Activity className="w-12 h-12 text-blue-500 animate-pulse mx-auto" />
                  <p className="text-neutral-400">Calculating premium from zone, season, and live conditions…</p>
                </div>
              ) : (
                <>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase font-bold">Weekly Premium</p>
                        <p className="text-4xl font-bold text-blue-500">₹{quote.premium}</p>
                      </div>
                      <div className="bg-blue-600/10 text-blue-500 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                        <Activity className="w-3 h-3" /> Band pricing
                      </div>
                    </div>

                    <div className="bg-blue-900/20 border border-blue-800/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-blue-400 font-bold text-xs uppercase tracking-wider">
                        <Shield className="w-4 h-4" />
                        SHAP-style breakdown
                      </div>
                      <p className="text-xs text-amber-100/95 font-medium leading-relaxed">
                        {quote.breakdown.shapSummary}
                      </p>
                      <p className="text-xs text-blue-100/90 leading-relaxed italic">
                        "{quote.aiRisk.reasoning}"
                      </p>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase font-bold">Risk Score</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full",
                                  quote.aiRisk.riskScore > 70 ? "bg-red-500" : quote.aiRisk.riskScore > 40 ? "bg-orange-500" : "bg-green-500"
                                )}
                                style={{ width: `${quote.aiRisk.riskScore}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold">{quote.aiRisk.riskScore}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-500 uppercase font-bold">Predicted Triggers</p>
                          <div className="flex gap-1 flex-wrap">
                            {quote.aiRisk.predictedDisruptions.map((d: string) => (
                              <span key={d} className="text-[9px] bg-blue-800/40 px-1.5 py-0.5 rounded text-blue-200 font-bold uppercase border border-blue-700/30">{d}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <p className="text-[10px] text-neutral-500">
                        Forecast breach days: {quote.breakdown.forecastBreachDays}/7 · Modifier:{" "}
                        {(quote.breakdown.riskModifier * 100).toFixed(0)} pts
                      </p>
                      <div className="flex justify-between text-sm text-neutral-400">
                        <span>Band base (₹35–₹110 @ ₹5k)</span>
                        <span className="text-white">₹{quote.breakdown.base}</span>
                      </div>
                      <div className="flex justify-between text-sm text-neutral-400">
                        <span>Expense loading (20%)</span>
                        <span className="text-orange-400">+₹{quote.breakdown.expenseLoading}</span>
                      </div>
                      <div className="flex justify-between text-sm text-neutral-400">
                        <span>Risk buffer (15%)</span>
                        <span className="text-orange-400">+₹{quote.breakdown.riskBuffer}</span>
                      </div>
                      <div className="flex justify-between text-sm text-neutral-400">
                        <span>Earnings vs baseline</span>
                        <span className={quote.breakdown.earningsAdjustment >= 0 ? "text-white" : "text-green-400"}>
                          {quote.breakdown.earningsAdjustment >= 0 ? "+" : "−"}₹{Math.abs(quote.breakdown.earningsAdjustment)}
                        </span>
                      </div>
                      {quote.breakdown.claimsAdjustment > 0 && (
                        <div className="flex justify-between text-sm text-neutral-400">
                          <span>Past paid claims</span>
                          <span className="text-red-400">+₹{quote.breakdown.claimsAdjustment}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (rider) {
                        activatePolicy();
                      } else {
                        setStep(1);
                      }
                    }}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-900/20 transition-all"
                  >
                    {loading ? "Processing..." : "Protect My Income"}
                  </button>
                </>
              )}
            </motion.div>
          )}

          {step === 5 && (
            <motion.div 
              key="step5"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className="w-20 h-20 bg-green-600/20 border border-green-600/30 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Policy Active!</h2>
                <p className="text-neutral-400 mt-2">You are now protected against hyperlocal disruptions.</p>
              </div>
              <button 
                onClick={() => {
                  setStep(-3);
                  setView('dashboard');
                  fetchPolicy();
                  fetchClaims();
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20"
              >
                Go to Dashboard
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-24">
      {/* Header */}
      <header className="p-6 flex justify-between items-center border-b border-neutral-900 sticky top-0 bg-neutral-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-500" />
          <span className="font-bold text-lg">GigShield</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button 
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (!showNotifications) markNotificationsRead();
              }}
              className="w-10 h-10 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800 relative"
            >
              <Activity className="w-5 h-5 text-neutral-400" />
              {notifications.some(n => !n.read) && (
                <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-neutral-950" />
              )}
            </button>
            
            <AnimatePresence>
              {showNotifications && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-72 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-4 z-50"
                >
                  <h4 className="text-xs font-bold text-neutral-500 uppercase mb-3">Notifications</h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-neutral-500 text-center py-4">No notifications yet.</p>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                          <p className="text-xs font-bold text-blue-400">{n.title}</p>
                          <p className="text-[10px] text-neutral-400 mt-1">{n.message}</p>
                          <p className="text-[9px] text-neutral-600 mt-2">{new Date(n.timestamp).toLocaleTimeString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="w-10 h-10 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800">
            <User className="w-5 h-5 text-neutral-400" />
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-md mx-auto">
        {view === 'admin' ? (
          admin ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Admin Panel</h2>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-500" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Pricing & Payout Intelligence</h3>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                    <p className="text-xs font-bold text-blue-400 mb-1">Dynamic Pricing Model</p>
                    <p className="text-[10px] text-neutral-500 leading-relaxed">
                      Gemini-3-Flash calculates weekly premiums by analyzing hyperlocal risk factors (monsoon history, traffic density, AQI trends) for each zone.
                    </p>
                  </div>
                  <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800">
                    <p className="text-xs font-bold text-green-400 mb-1">Parametric Payout Engine</p>
                    <p className="text-[10px] text-neutral-500 leading-relaxed">
                      Payouts are dynamically calculated based on trigger severity. The model estimates "Economic Hours Lost" to ensure fair compensation without manual claims.
                    </p>
                  </div>
                </div>
              </div>

              {adminStats && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                    <p className="text-xs text-neutral-500 uppercase font-bold">Active Riders</p>
                    <p className="text-2xl font-bold">{adminStats.activeRiders}</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                    <p className="text-xs text-neutral-500 uppercase font-bold">Loss Ratio</p>
                    <p className="text-2xl font-bold text-blue-500">{adminStats.lossRatio}%</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                    <p className="text-xs text-neutral-500 uppercase font-bold">Total Premiums</p>
                    <p className="text-xl font-bold">₹{adminStats.totalPremiums}</p>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
                    <p className="text-xs text-neutral-500 uppercase font-bold">Total Payouts</p>
                    <p className="text-xl font-bold text-red-500">₹{adminStats.totalPayouts}</p>
                  </div>
                </div>
              )}

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Disruption Controls (Parametric Triggers)</h3>
                <p className="text-[10px] text-neutral-500 italic">Simulate hyperlocal events to test automated payouts.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <button onClick={() => triggerSim('Rain')} className="w-full bg-neutral-800 p-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 hover:bg-neutral-700">
                      <CloudRain className="w-4 h-4 text-blue-500" /> Rain ({'>'}5mm)
                    </button>
                  </div>
                  <div className="space-y-1">
                    <button onClick={() => triggerSim('AQI')} className="w-full bg-neutral-800 p-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 hover:bg-neutral-700">
                      <Wind className="w-4 h-4 text-green-500" /> AQI ({'>'}200)
                    </button>
                  </div>
                  <div className="space-y-1">
                    <button onClick={() => triggerSim('Heat')} className="w-full bg-neutral-800 p-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 hover:bg-neutral-700">
                      <Thermometer className="w-4 h-4 text-orange-500" /> Heat ({'>'}40°C)
                    </button>
                  </div>
                  <div className="space-y-1">
                    <button onClick={() => triggerSim('Traffic')} className="w-full bg-neutral-800 p-3 rounded-xl text-xs font-medium flex items-center justify-center gap-2 hover:bg-neutral-700">
                      <Activity className="w-4 h-4 text-purple-500" /> Traffic ({'>'}80%)
                    </button>
                  </div>
                  <button onClick={() => triggerSim('Flood')} className="col-span-2 bg-red-900/20 p-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 text-red-400 hover:bg-red-900/30 border border-red-900/30">
                    <AlertTriangle className="w-4 h-4" /> Trigger Flood Alert (Critical)
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Registered Riders</h3>
                <div className="space-y-2">
                  {allRiders.length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-4">No riders registered yet.</p>
                  ) : (
                    allRiders.map(r => (
                      <div key={r.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-blue-600/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-xs font-bold">{r.platformId}</p>
                            <p className="text-[10px] text-neutral-500">{r.zone}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold">₹{r.earnings}/wk</p>
                          <p className="text-[10px] text-neutral-500">{r.phone}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Recent Events</h3>
                <div className="space-y-2">
                  {adminStats?.recentEvents.map((e: any) => (
                    <div key={e.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center">
                          <Activity className="w-4 h-4 text-neutral-500" />
                        </div>
                        <div>
                          <p className="text-xs font-bold">{e.type}</p>
                          <p className="text-[10px] text-neutral-500">{e.zone}</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-neutral-500">{new Date(e.timestamp).toLocaleTimeString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">All Claims</h3>
                <div className="space-y-2">
                  {adminClaims.length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-4">No claims processed yet.</p>
                  ) : (
                    adminClaims.map((c: Claim) => (
                      <div key={c.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded flex items-center justify-center",
                            c.type === 'Rain' ? "bg-blue-500/10 text-blue-500" : "bg-orange-500/10 text-orange-500"
                          )}>
                            {c.type === 'Rain' ? <CloudRain className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold">₹{c.amount} - {c.type}</p>
                            <p className="text-[10px] text-neutral-500">{new Date(c.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded font-bold uppercase",
                          c.status === "pending"
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-green-500/10 text-green-500"
                        )}>
                          {c.status === "pending" ? "Pending" : "Paid"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-500">Active Policies</h3>
                <div className="space-y-2">
                  {allPolicies.length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-4">No active policies.</p>
                  ) : (
                    allPolicies.map(p => (
                      <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold">Policy {p.id}</p>
                          <p className="text-[10px] text-neutral-500">Rider: {p.riderId}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-blue-500">₹{p.premium}</p>
                          <p className="text-[10px] text-neutral-500 uppercase font-bold">{p.status}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {admin && (
                <button 
                  onClick={handleLogout}
                  className="w-full bg-red-900/20 hover:bg-red-900/30 border border-red-900/30 text-red-500 font-bold py-4 rounded-2xl transition-colors mt-8"
                >
                  Logout Admin
                </button>
              )}
            </motion.div>
          ) : (
            <div className="text-center py-20 space-y-4">
              <AlertTriangle className="w-12 h-12 text-orange-500 mx-auto" />
              <p className="text-neutral-400">Admin access required.</p>
              <button 
                onClick={handleLogout}
                className="text-blue-500 font-bold"
              >
                Go Back
              </button>
            </div>
          )
        ) : (
          rider ? (
            <>
              {view === 'dashboard' && (
                <>
                  {/* Status Card */}
                  <div 
                    onClick={() => setShowPolicyDetails(true)}
                    className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 shadow-xl shadow-blue-900/20 relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="relative z-10">
                      <div className="flex justify-between items-start mb-8">
                        <div>
                          <p className="text-blue-100 text-sm font-medium mb-1">Weekly Protection</p>
                          <h2 className="text-3xl font-bold">{policy ? "Active" : "Inactive"}</h2>
                        </div>
                        <div className="bg-white/20 backdrop-blur-md rounded-full px-3 py-1 text-xs font-bold">
                          {policy ? "VIEW DETAILS" : "MON - SUN"}
                        </div>
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-blue-100 text-xs mb-1">Total Payouts (This Week)</p>
                          <p className="text-2xl font-bold">₹{claims.reduce((acc, c) => acc + c.amount, 0)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-blue-100 text-xs mb-1">Weekly Premium</p>
                          <p className="text-lg font-bold">₹{policy?.premium || 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {showPolicyDetails && policy && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-6"
                      >
                        <div className="flex justify-between items-center">
                          <h3 className="font-bold">Policy Details</h3>
                          <button onClick={() => setShowPolicyDetails(false)} className="text-neutral-500">✕</button>
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Policy ID</span>
                            <span className="font-mono">{policy.id}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Coverage Period</span>
                            <span>{new Date(policy.startDate).toLocaleDateString()} - {new Date(policy.endDate).toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Zone</span>
                            <span>{policy.zone}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-neutral-500">Status</span>
                            <span className={`font-bold uppercase ${
                              policy.status === 'active' ? 'text-green-500' : 
                              policy.status === 'cancelled' ? 'text-red-500' : 'text-neutral-500'
                            }`}>
                              {policy.status}
                            </span>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-neutral-800">
                          <p className="text-[10px] text-neutral-500 leading-relaxed mb-4">
                            This is a parametric insurance policy. Payouts are triggered automatically when hyperlocal data (Rain, AQI, Heat, Traffic) exceeds predefined thresholds in your zone.
                          </p>
                          <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 mb-4">
                            <p className="text-[10px] text-neutral-400">
                              <span className="font-bold text-blue-400">Note:</span> Policy updates (zone, earnings) are handled via renewal to maintain actuarial consistency.
                            </p>
                          </div>
                          <button 
                            onClick={cancelPolicy}
                            className="w-full py-3 text-red-500 text-xs font-bold border border-red-900/30 rounded-xl hover:bg-red-900/10 transition-colors"
                          >
                            Cancel Protection
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!policy && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-orange-500">No Active Protection</p>
                          <p className="text-xs text-neutral-400">Your weekly protection is not active. Stay protected against local disruptions.</p>
                        </div>
                      </div>
                      <button 
                        onClick={async () => {
                          if (riderPolicies.length > 0) {
                            await applyWeekRolloverModifier();
                            const last = riderPolicies[0];
                            setFormData({ ...formData, zone: last.zone, earnings: last.earnings });
                            setStep(4);
                            getQuote(last.zone, last.earnings);
                          } else {
                            setStep(0);
                          }
                        }}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold py-3 rounded-xl transition-colors"
                      >
                        {riderPolicies.length > 0 ? "Renew Protection" : "Get Protected Now"}
                      </button>
                    </div>
                  )}

                  {policy && (
                    <div className="bg-blue-600/10 border border-blue-600/20 rounded-2xl p-4 flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Zero-Touch Protection Active</p>
                        <p className="text-xs text-neutral-400">Claims are triggered automatically based on local disruptions. No paperwork required.</p>
                      </div>
                    </div>
                  )}

                  {/* Real-time Monitoring */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">Live Monitoring</h3>
                      <div className="flex gap-2 items-center">
                        <button
                          type="button"
                          onClick={() => void fetchWeather()}
                          className="text-[10px] text-emerald-500 font-bold uppercase"
                        >
                          Refresh
                        </button>
                        <button 
                          type="button"
                          onClick={() => setShowManualClaim(!showManualClaim)}
                          className="text-[10px] text-blue-500 font-bold uppercase"
                        >
                          Did we miss anything?
                        </button>
                      </div>
                    </div>
                    
                    {showManualClaim && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3 mb-4"
                      >
                        <p className="text-sm font-semibold text-white">Did we miss anything?</p>
                        <p className="text-xs text-neutral-400">
                          If you lost earnings from a disruption our sensors didn&apos;t pick up, tell us in your own words. Our team will review within 24–48 hours.
                        </p>
                        <textarea
                          className="w-full min-h-[100px] bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-600 resize-y placeholder:text-neutral-600"
                          placeholder="e.g. Dark store closed for 4 hours yesterday due to local strike — I couldn’t work…"
                          value={missedAnythingText}
                          onChange={(e) => setMissedAnythingText(e.target.value)}
                        />
                        <button 
                          type="button"
                          onClick={async () => {
                            if (!rider || !policy) {
                              alert("Active policy required.");
                              return;
                            }
                            const message = missedAnythingText.trim();
                            if (!message) {
                              alert("Please describe what happened.");
                              return;
                            }
                            try {
                              const res = await fetch("/api/claims/manual", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  riderId: rider.id,
                                  policyId: policy.id,
                                  message,
                                }),
                              });
                              if (!res.ok) throw new Error("fail");
                              setMissedAnythingText("");
                              setShowManualClaim(false);
                              fetchClaims();
                              fetchAdminClaims();
                              alert("Thanks — submitted for review.");
                            } catch {
                              alert("Could not submit — check server.");
                            }
                          }}
                          className="w-full bg-blue-600 py-2 rounded-lg text-xs font-bold"
                        >
                          Submit for review
                        </button>
                      </motion.div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center gap-2">
                        <CloudRain className="w-5 h-5 text-blue-400" />
                        <span className="text-xs text-neutral-400">Rain</span>
                        <span className="text-sm font-bold">{weather ? `${weather.rain}mm/h` : "--"}</span>
                      </div>
                      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center gap-2">
                        <Wind className="w-5 h-5 text-green-400" />
                        <span className="text-xs text-neutral-400">AQI</span>
                        <span className="text-sm font-bold">{weather ? weather.aqi : "--"}</span>
                      </div>
                      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col items-center gap-2">
                        <Thermometer className="w-5 h-5 text-orange-400" />
                        <span className="text-xs text-neutral-400">Temp</span>
                        <span className="text-sm font-bold">{weather ? `${weather.temp}°C` : "--"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Claim History Snapshot */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">Recent Payouts</h3>
                      <button onClick={() => setView('history')} className="text-xs text-blue-500 font-medium">View All</button>
                    </div>
                    <div className="space-y-3">
                      {claims.length === 0 ? (
                        <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-2xl p-8 text-center">
                          <History className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
                          <p className="text-sm text-neutral-500">No disruptions detected yet.</p>
                        </div>
                      ) : (
                        claims.slice(0, 3).map(claim => (
                          <motion.div 
                            key={claim.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex justify-between items-center"
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                claim.type === 'Rain' ? "bg-blue-500/10 text-blue-500" : 
                                claim.type === 'AQI' ? "bg-green-500/10 text-green-500" : "bg-orange-500/10 text-orange-500"
                              )}>
                                {claim.type === 'Rain' ? <CloudRain className="w-5 h-5" /> : 
                                 claim.type === 'AQI' ? <Wind className="w-5 h-5" /> : <Thermometer className="w-5 h-5" />}
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{claim.type} Disruption</p>
                                <p className="text-xs text-neutral-500">{new Date(claim.timestamp).toLocaleTimeString()}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-green-500">+₹{claim.amount}</p>
                              <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-tighter">Sent to UPI</p>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              {view === 'history' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8 pb-24"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center">
                        <Shield className="w-6 h-6 text-blue-500" />
                      </div>
                      <h2 className="text-2xl font-bold">Policy History</h2>
                    </div>
                    <div className="space-y-3">
                      {riderPolicies.length === 0 ? (
                        <p className="text-xs text-neutral-500 text-center py-8">No policy history found.</p>
                      ) : (
                        riderPolicies.map(p => (
                          <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex justify-between items-center">
                            <div>
                              <p className="text-xs font-bold">{p.zone} Protection</p>
                              <p className="text-[10px] text-neutral-500 mt-1">
                                {new Date(p.startDate).toLocaleDateString()} - {new Date(p.endDate).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-bold text-blue-500">₹{p.premium}</p>
                              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                p.status === 'active' ? 'bg-green-500/20 text-green-500' : 
                                p.status === 'cancelled' ? 'bg-red-500/20 text-red-500' : 'bg-neutral-800 text-neutral-500'
                              }`}>
                                {p.status}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-600/10 rounded-xl flex items-center justify-center">
                        <History className="w-6 h-6 text-green-500" />
                      </div>
                      <h2 className="text-2xl font-bold">Payout History</h2>
                    </div>
                    <div className="space-y-3">
                      {claims.length === 0 ? (
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center">
                          <History className="w-12 h-12 text-neutral-800 mx-auto mb-4" />
                          <p className="text-neutral-500 font-medium">No payouts found yet.</p>
                          <p className="text-xs text-neutral-600 mt-1">Your automated claims will appear here.</p>
                        </div>
                      ) : (
                        [...claims]
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .map(claim => (
                            <motion.div 
                              key={claim.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex justify-between items-center"
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "w-12 h-12 rounded-xl flex items-center justify-center",
                                  claim.type === 'Rain' ? "bg-blue-500/10 text-blue-500" : 
                                  claim.type === 'AQI' ? "bg-green-500/10 text-green-500" : 
                                  claim.type === 'Heat' ? "bg-orange-500/10 text-orange-500" : "bg-purple-500/10 text-purple-500"
                                )}>
                                  {claim.type === 'Rain' ? <CloudRain className="w-6 h-6" /> : 
                                   claim.type === 'AQI' ? <Wind className="w-6 h-6" /> : 
                                   claim.type === 'Heat' ? <Thermometer className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
                                </div>
                                <div>
                                  <p className="font-bold text-sm">{claim.type} Disruption</p>
                                  <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
                                    {new Date(claim.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • {new Date(claim.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-green-500 text-lg">+₹{claim.amount}</p>
                                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-tighter">Settled</p>
                              </div>
                            </motion.div>
                          ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {view === 'zones' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <h2 className="text-2xl font-bold">Coverage Zones</h2>
                  <div className="space-y-4">
                    {[
                      { name: "Mumbai - Dharavi", risk: "High", status: "Active" },
                      { name: "Delhi - Okhla", risk: "Very High", status: "Active" },
                      { name: "Bengaluru - Koramangala", risk: "Moderate", status: "Active" },
                      { name: "Hyderabad - Gachibowli", risk: "Moderate", status: "Active" }
                    ].map(z => (
                      <div key={z.name} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex justify-between items-center">
                        <div>
                          <p className="font-semibold">{z.name}</p>
                          <div className="flex gap-2 mt-1">
                            <span className={cn(
                              "text-[10px] uppercase font-bold px-2 py-0.5 rounded",
                              z.risk === 'Very High' ? "bg-red-500/20 text-red-500" :
                              z.risk === 'High' ? "bg-orange-500/20 text-orange-500" : "bg-blue-500/20 text-blue-500"
                            )}>
                              {z.risk} Risk
                            </span>
                            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-green-500/20 text-green-500">
                              {z.status}
                            </span>
                          </div>
                        </div>
                        <MapPin className="w-5 h-5 text-neutral-700" />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {view === 'profile' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <h2 className="text-2xl font-bold">Profile</h2>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center">
                        <User className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{rider?.name || rider?.platformId}</p>
                        <p className="text-sm text-neutral-500">{rider?.phone}</p>
                      </div>
                    </div>
                    <div className="space-y-4 pt-6 border-t border-neutral-800">
                      <div>
                        <p className="text-xs text-neutral-500 uppercase font-bold">UPI ID</p>
                        <p className="font-medium">{rider?.upiId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 uppercase font-bold">Weekly Earnings Target</p>
                        <p className="font-medium">₹{rider?.earnings}</p>
                      </div>
                      <div>
                        <p className="text-xs text-neutral-500 uppercase font-bold">Operating Zone</p>
                        <p className="font-medium">{rider?.zone}</p>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="w-full bg-red-900/20 hover:bg-red-900/30 border border-red-900/30 text-red-500 font-bold py-4 rounded-2xl transition-colors"
                  >
                    Logout
                  </button>
                </motion.div>
              )}
            </>
          ) : (
            <div className="text-center py-20 space-y-4">
              <Activity className="w-12 h-12 text-blue-500 mx-auto animate-pulse" />
              <p className="text-neutral-400">Loading your protection dashboard...</p>
            </div>
          )
        )}
      </main>

      {/* Navigation */}
      {rider && !admin && (
        <nav className="fixed bottom-0 left-0 right-0 bg-neutral-950/80 backdrop-blur-md border-t border-neutral-900 p-4 flex justify-around items-center z-10">
          <button 
            onClick={() => setView('dashboard')}
            className={cn("flex flex-col items-center gap-1", view === 'dashboard' ? "text-blue-500" : "text-neutral-500")}
          >
            <Shield className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Shield</span>
          </button>
          <button 
            onClick={() => setView('history')}
            className={cn("flex flex-col items-center gap-1", view === 'history' ? "text-blue-500" : "text-neutral-500")}
          >
            <History className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">History</span>
          </button>
          <button 
            onClick={() => setView('zones')}
            className={cn("flex flex-col items-center gap-1", view === 'zones' ? "text-blue-500" : "text-neutral-500")}
          >
            <MapPin className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Zones</span>
          </button>
          <button 
            onClick={() => setView('profile')}
            className={cn("flex flex-col items-center gap-1", view === 'profile' ? "text-blue-500" : "text-neutral-500")}
          >
            <User className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase">Profile</span>
          </button>
        </nav>
      )}
    </div>
  );
}
