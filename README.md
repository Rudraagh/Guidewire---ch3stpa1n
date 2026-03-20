# GigShield
### Parametric Income Insurance for Q-Commerce Delivery Partners

> Automated income protection for Zepto / Blinkit / Dunzo riders against hyperlocal disruptions — no claim filing, no paperwork, instant payouts.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Persona & Scenarios](#2-persona--scenarios)
3. [How GigShield Works — Core Workflow](#3-how-gigshield-works--core-workflow)
4. [Insurance Model](#4-insurance-model)
5. [Weekly Premium Model](#5-weekly-premium-model)
6. [Parametric Trigger System](#6-parametric-trigger-system)
7. [AI & ML Integration](#7-ai--ml-integration)
8. [Fraud, Adversarial & Spoofing Detection](#8-fraud-adversarial--spoofing-detection)
9. [Adversarial Defense & Anti-Spoofing Strategy](#9-adversarial-defense--anti-spoofing-strategy)
   - [9.1 Differentiating Genuine Riders from Spoofers](#91-the-three-real-attack-vectors-and-their-defenses)
   - [9.2 Detecting a Coordinated Fraud Ring](#92-detecting-a-coordinated-ring--the-graph-layer)
   - [9.3 UX Balance — Flagged Claims Without Penalizing Honest Riders](#93-ux-balance--handling-flagged-accounts-without-penalizing-honest-riders)
   - [9.4 GPS Spoofing Prevention — Technical Layer](#94-gps-spoofing-prevention--technical-layer)
   - [9.5 Real-Time Continuous Verification Architecture](#95-real-time-continuous-verification-architecture)
10. [Automated Claims & Payout Pipeline](#10-automated-claims--payout-pipeline)
11. [Integration Capabilities](#11-integration-capabilities)
12. [Tech Stack](#12-tech-stack)
13. [Development Plan](#13-development-plan)

---

## 1. Problem Statement

Q-Commerce delivery partners (Zepto, Blinkit, Dunzo) operate on a fundamentally different model from food delivery riders. They work in tight hyperlocal zones around dark stores, completing 20–40 short-distance deliveries per day. Their income is entirely per-order based and has zero protection against external disruptions.

When a disruption hits — waterlogging near a dark store, a zone-level curfew, an AQI spike that halts platform operations — a rider can lose 3–6 hours of earning time in a single event. With no employer, no sick pay, and no safety net, the full financial loss falls on them.

**GigShield pays them automatically when this happens. No claim filing. No waiting. No paperwork.**

Key constraints this product strictly respects:
- Coverage is for **lost income only** — no health, life, accident, or vehicle repair coverage
- All triggers are **parametric and external** — payouts are based on verified environmental/operational data, not the worker's word
- Pricing is structured on a **weekly basis** to match the gig worker's earning cycle

---

## 2. Persona & Scenarios

### Chosen Persona: Q-Commerce Delivery Partner

**Why Q-Commerce over Food or E-Commerce?**

Q-Commerce riders are uniquely vulnerable because:
- Their zone is hyperlocal (2–3 km radius from a dark store) — a disruption in their specific pin code matters, a city-wide average does not
- Platforms like Zepto and Blinkit have a documented history of suspending operations in specific pin codes during extreme weather or AQI spikes — this creates a **verifiable, platform-level trigger** with zero fraud risk
- Their high delivery volume (20–40 orders/day) means even a 3-hour disruption is a significant income loss relative to a food delivery rider who does 8–12 orders/day

### Scenario A — Hyperlocal Waterlogging

Rajan works out of a Blinkit dark store in Dharavi, Mumbai. On a Tuesday in July, heavy rainfall causes waterlogging specifically in his zone. Blinkit suspends deliveries from his dark store at 11am. GigShield's scheduler detects rainfall > 20mm/hr in his pin code at 11:15am, cross-references that no other dark store in adjacent zones has suspended, computes a high confidence score, and automatically triggers a claim. By 11:30am, ₹180 is in Rajan's UPI account for the 3 hours of lost earnings.

### Scenario B — AQI-Triggered Platform Halt

Priya works for Zepto in Delhi during November. AQI in her zone crosses 350 — Zepto officially pauses operations in her delivery area. GigShield detects the AQI threshold breach via CPCB data, validates it against the platform suspension signal, and fires a payout within 20 minutes. Priya didn't open the app. She didn't file anything.

### Scenario C — Zone-Level Bandh

Arjun's dark store zone in Bengaluru experiences a local transport strike on a Monday morning. Traffic API data shows near-zero movement in his pin code. No pickups or drops are being completed by any rider in the zone. GigShield's consensus mechanism detects that 80%+ of active riders in the zone are stationary, confirms the disruption, and auto-initiates claims for all of them simultaneously.

### Scenario D — Extreme Heat

In May, Hyderabad sees temperatures cross 44°C for three consecutive days. Dunzo reduces operating hours to avoid rider safety complaints. GigShield detects the temperature threshold breach and adjusts payouts proportionally to the hours of reduced operations.

---

## 3. How GigShield Works — Core Workflow

There are two distinct loops running in the system simultaneously.

### Loop 1 — Weekly Policy Loop (Premium & Onboarding)

```
Monday morning
     │
     ▼
Scheduler pulls 7-day weather + AQI forecast for every active zone
     │
     ▼
ML model computes P(disruption this week) per rider zone
     │
     ▼
Premium engine calculates weekly premium = f(probability, severity, loading)
     │
     ▼
Rider receives premium quote in app → pays → policy activates for the week
     │
     ▼
Policy record written to DB with zone, earnings baseline, payout cap, week boundaries
```

### Loop 2 — Real-Time Monitoring Loop (Trigger & Payout)

```
Every 30 minutes, all week
     │
     ▼
Scheduler pulls current weather + AQI + traffic data for every active policy zone
     │
     ▼
Parametric rules engine checks thresholds per zone
     │
     ▼
Threshold crossed? → Compute trigger confidence score
     │
     ├── Confidence < 0.6 → Queue for manual review
     │
     └── Confidence ≥ 0.6 → Pass to fraud engine
                                   │
                          Fraud checks pass?
                                   │
                          ├── Flagged → Hold + review
                          │
                          └── Clean → Compute payout (deterministic math)
                                            │
                                            ▼
                                   Fire payout via payment gateway
                                            │
                                            ▼
                                   Push notification to rider
                                            │
                                            ▼
                                   Log event to analytics dashboard
```

### Onboarding Flow

Onboarding is the foundation of system integrity. Every downstream component — fraud detection, trigger validation, payout routing — depends on onboarding data being trustworthy.

```
Rider downloads app
     │
     ▼
Phone number verification (OTP)
     │
     ▼
Platform ID entry (Zepto/Blinkit employee/partner ID)
     │
     ▼
Aadhaar-based identity verification (via DigiLocker API or mock)
     │
     ▼
Dark store zone selection → pin code assigned → zone risk profile loaded
     │
     ▼
Weekly earnings declaration (self-declared, range-bounded: ₹2,000–₹15,000/week)
     │
     ▼
UPI ID / bank account verification (payout destination locked at onboarding)
     │
     ▼
Device fingerprint recorded (for multi-account detection)
     │
     ▼
Risk profile generated → first weekly premium quoted
```

---

## 4. Insurance Model

### What GigShield Insures

GigShield insures **lost working hours caused by verified external disruptions**. It does not insure health, accidents, vehicle damage, or any event caused by the rider's own actions.

### Payout Calculation (Deterministic — No ML)

When a disruption is confirmed, the payout amount is computed as:

```
Hourly Rate = Declared Weekly Earnings ÷ Weekly Working Hours
Payout = Hours Lost × Hourly Rate × Payout Ratio
```

- **Hours lost** — duration of disruption above threshold, capped at 8 hours/day
- **Hourly rate** — derived from the rider's declared earnings at onboarding
- **Payout ratio** — fixed at 0.80 (80% of lost earnings, contractually defined)

**Example:** Rider earns ₹5,000/week over 50 hours → ₹100/hour. Disruption lasts 4 hours. Payout = 4 × 100 × 0.8 = **₹320**

### Payout Caps (Correlated Loss Protection)

To prevent fund insolvency during mass disruption events (e.g. entire city floods):

| Cap Type | Limit |
|---|---|
| Per event | ₹400 maximum |
| Per day | ₹400 maximum |
| Per week | 3 disruption days maximum |
| Per week (monetary) | ₹1,000 maximum |

### Reserve Fund Mechanism

A fixed percentage (15%) of every premium collected is routed to a reserve fund. This reserve is drawn upon only when weekly payouts exceed weekly premiums collected — i.e. during a mass disruption event. The reserve fund balance is displayed in real time on the admin dashboard.

### Policy Lifecycle Rules

- Policy is active from Monday 00:00 to Sunday 23:59 (IST)
- Mid-week joins are pro-rated (days remaining ÷ 7 × weekly premium)
- Zone changes mid-week are not permitted — take effect on next Monday
- Disruption events that straddle two policy weeks (start Saturday, end Sunday) are attributed to the week in which the majority of hours fell
- Non-renewal means monitoring stops at Sunday 23:59 — no coverage gap claims accepted

---

## 5. Weekly Premium Model

### Why Weekly

Gig workers operate week-to-week. Many do not have stable monthly income. A weekly premium of ₹40–100 is psychologically and financially accessible in a way that a ₹300–400 monthly premium is not. It also aligns premium collection with the natural earnings cycle — riders get paid weekly by platforms, so the premium deduction happens at the same time.

### Actuarial Structure

The premium is grounded in a frequency-severity model:

```
Pure Premium = P(disruption this week) × E(hours lost | disruption) × Hourly Rate × Payout Ratio
Gross Premium = Pure Premium × (1 + Expense Loading) × (1 + Risk Buffer)
```

- **Expense loading** — 20% (API costs, infra, payment gateway fees)
- **Risk buffer** — 15% (reserve fund contribution + correlated loss padding)

### What Drives P(disruption this week)

This probability is the output of the ML model (see Section 7). Its key inputs are:

- 7-day rainfall forecast for the rider's pin code
- 7-day AQI forecast
- 7-day temperature forecast
- Month of year (encodes seasonal risk)
- Zone's historical disruption frequency (derived from IMD + CPCB historical data)

### Premium Bands

After the ML model outputs a probability, premiums fall into bands:

| Risk Probability | Band | Base Premium |
|---|---|---|
| 0.00 – 0.20 | Very Low | ₹35/week |
| 0.21 – 0.40 | Low | ₹50/week |
| 0.41 – 0.60 | Moderate | ₹70/week |
| 0.61 – 0.80 | High | ₹90/week |
| 0.81 – 1.00 | Very High | ₹110/week |

### Earnings Adjustment

The base band premium is adjusted by the rider's declared earnings relative to a ₹5,000/week baseline:

```
Final Premium = Band Base × (Declared Earnings ÷ 5000)
```

A rider earning ₹8,000/week pays 1.6× the band base. A rider earning ₹3,000/week pays 0.6× the band base.

### Solvency Validation

Before launch, we run a simulation over 1,000 synthetic riders across 6 cities using 5 years of IMD + CPCB historical data. We apply the premium formula and payout rules to every historical week and verify that the fund remains positive across all scenarios including the worst recorded monsoon seasons. Loss ratio (payouts ÷ premiums) is targeted at ≤ 65%.

---

## 6. Parametric Trigger System

### What "Parametric" Means Here

A parametric trigger fires based on a measurable external parameter crossing a predefined threshold — not based on the rider's report or claim. The rider cannot influence whether a trigger fires. Either the rainfall exceeded 20mm/hr in their zone or it did not.

### Disruption Thresholds

| Disruption Type | Parameter | Threshold | Min Duration |
|---|---|---|---|
| Heavy rain | Rainfall rate | > 20mm/hr | 1 hour |
| Flooding proxy | Rainfall accumulation | > 50mm in 6hrs | — |
| Extreme heat | Temperature | > 42°C | 3 hours |
| Poor AQI | Air Quality Index | > 300 | 2 hours |
| Severe AQI | Air Quality Index | > 400 | 1 hour |
| Platform suspension | Verified ops halt signal | Zone-level halt | Any |
| Traffic paralysis | Movement index | < 10% of baseline | 2 hours |

### Trigger Confidence Score

A raw threshold breach does not immediately fire a claim. A confidence score (0–1) is computed first:

```
Confidence = w1 × Source Proximity Score
           + w2 × Multi-Source Agreement Score
           + w3 × Cross-Rider Corroboration Score
           + w4 × Historical Plausibility Score
```

- **Source proximity** — how far is the weather station from the rider's pin code (closer = higher score)
- **Multi-source agreement** — do OpenWeatherMap and IMD/CPCB both confirm the event
- **Cross-rider corroboration** — what % of active riders in the same 500m zone are showing zero activity (inactivity consensus)
- **Historical plausibility** — is this type of event historically plausible for this zone and month

| Confidence Score | Action |
|---|---|
| ≥ 0.75 | Auto-approve → proceed to fraud check |
| 0.50 – 0.74 | Soft-approve → proceed but flag for post-hoc review |
| < 0.50 | Hold → manual review queue |

### Data Source Hierarchy

The scheduler follows a defined fallback chain to ensure monitoring never silently fails:

```
Primary: OpenWeatherMap API (weather) + AQICN API (AQI)
     │
     └── If unavailable or stale (> 45 min old):
         Fallback: IMD open data endpoint + CPCB API
              │
              └── If both unavailable:
                  Safe-fail: Mark zone as "data unavailable"
                  Do NOT fire triggers. Do NOT deny coverage.
                  Log incident. Retry in 15 minutes.
```

---

## 7. AI & ML Integration

### Model 1 — Risk Assessment Model (Premium Calculation)

**Purpose:** Estimate P(disruption this week) for a given rider zone and week.

**Algorithm:** XGBoost (Gradient Boosted Trees) — chosen over neural networks because the data is tabular and structured. Trees consistently outperform deep learning on this type of data and are easier to explain.

**What it predicts:** Binary classification — will at least one qualifying disruption event occur in this zone this week? Output is a calibrated probability.

**Feature Vector:**

| Feature | Type | Source |
|---|---|---|
| Pin code risk tier | Categorical | Historical IMD/CPCB data, precomputed |
| City | Categorical | Onboarding |
| Month of year | Ordinal | System date |
| Days with rainfall forecast > 15mm | Integer | OpenWeatherMap 7-day forecast |
| Peak rainfall forecast (mm) | Float | OpenWeatherMap 7-day forecast |
| Days with temperature forecast > 42°C | Integer | OpenWeatherMap 7-day forecast |
| Average AQI forecast | Float | AQICN 7-day forecast |
| Days with AQI forecast > 300 | Integer | AQICN 7-day forecast |
| Distance from nearest weather station (km) | Float | Computed at onboarding |
| Historical disruption frequency (same month, past 3 years) | Float | Precomputed from IMD/CPCB |
| Rider tenure on platform (weeks) | Integer | Onboarding timestamp |

**Training Data:** Constructed from IMD historical rainfall records and CPCB historical AQI data for 6 major cities (Mumbai, Delhi, Bengaluru, Chennai, Hyderabad, Kolkata) over 5 years. Labels are generated by applying disruption thresholds to historical weather values. Approximately 15,000+ labeled city-week records.

**Explainability:** SHAP (SHapley Additive exPlanations) values are computed for every prediction and surfaced in the rider-facing app. Instead of just showing a premium, the app shows:

> "Your premium this week is ₹87 because:
> Heavy rain forecast on 3 days (+₹24) · July is historically high-risk in your zone (+₹18) · Your earnings are above average (+₹10)"

**Retraining:** After 8+ weeks of live operation, actual disruption event logs feed back into the training set. The model retrains on a monthly cadence. Precision and recall on disruption prediction are tracked over time in the admin dashboard.

---

### Model 2 — Anomaly Detection (Fraud)

**Purpose:** Detect statistically unusual claim patterns that rules alone would miss.

**Algorithm:** Isolation Forest — an unsupervised anomaly detection algorithm that identifies outliers in feature space without requiring labeled fraud examples.

**Features used:**
- Claim frequency per rider (rolling 4-week window)
- Zone's historical disruption rate vs rider's personal claim rate
- Time between policy activation and first claim
- Number of distinct devices associated with this account
- GPS activity pattern in the hour before a claim trigger

**Output:** Anomaly score per rider. High anomaly scores are reviewed by the fraud rules engine before payout is released.

---

### Data Pipeline Architecture

The ML and monitoring systems are supported by a scheduler-driven data pipeline:

```
Every 30 minutes:
  → Pull current weather + AQI for all active zones
  → Write to TimescaleDB (time-series optimised PostgreSQL extension)
  → Trigger rules engine evaluation per zone
  → Write trigger events + confidence scores to events table

Every Monday 06:00 IST:
  → Pull 7-day forecast for all registered zones
  → Run XGBoost model for all riders with active or pending policies
  → Compute weekly premiums
  → Push premium quotes to rider app via notification

Monthly (first Sunday):
  → Pull new disruption event logs from past 4 weeks
  → Append to training dataset
  → Retrain XGBoost model
  → Evaluate precision/recall on held-out validation set
  → Deploy new model if performance improves
  → Log model version to audit trail
```

**Why TimescaleDB:** Weather and AQI readings are time-series data — you're writing a new reading every 30 minutes for every active zone. TimescaleDB (a PostgreSQL extension) handles this natively with automatic partitioning and fast time-range queries. A regular relational database will degrade significantly at scale with this access pattern.

---

## 8. Fraud, Adversarial & Spoofing Detection

### The Parametric Advantage

Because GigShield's triggers are based on external verified data (not the rider's report), the primary fraud vectors of traditional insurance are largely eliminated. The rider cannot fake the weather. However, several attack surfaces remain:

### Attack Surface 1 — Fake Location / GPS Spoofing

**Threat:** A rider registers a pin code in a high-risk flood-prone zone but actually operates in a low-risk zone. When the high-risk zone triggers, they collect a payout despite not being affected.

**Detection:**
- At onboarding, GPS coordinates are recorded and cross-validated against the declared pin code
- During active policy weeks, periodic background GPS checks (opt-in, privacy-respecting) verify the rider is operating within their declared zone
- If GPS coordinates consistently fall outside the declared zone, the account is flagged for zone mismatch review
- Mapbox Geofencing API defines the permissible operating radius around each dark store

### Attack Surface 2 — Multiple Accounts (Duplicate Claims)

**Threat:** One person creates multiple rider accounts to collect multiple payouts for the same disruption event.

**Detection:**
- Phone number is unique per account (verified via OTP)
- Aadhaar number is unique per account (verified at onboarding)
- Device fingerprint is recorded — multiple accounts from the same device are flagged immediately
- UPI ID / bank account is unique per account — same payout destination across multiple accounts triggers an alert

### Attack Surface 3 — Claim Rate Anomalies

**Threat:** A legitimate rider in a low-risk zone claims disruptions at a rate inconsistent with that zone's historical disruption frequency.

**Detection:** Isolation Forest model (see Section 7) computes an anomaly score based on the rider's claim frequency vs zone baseline. Riders whose personal claim rate is more than 2 standard deviations above their zone's historical rate are flagged.

### Attack Surface 4 — Cross-Rider Consensus Violation

**Threat:** A trigger fires in a zone but the majority of other riders in that zone are actively completing deliveries — suggesting the disruption either didn't occur or was highly localised.

**Detection:** The cross-rider corroboration component of the confidence score (Section 6) addresses this directly. If 80%+ of active riders in a 500m radius are showing normal delivery activity, the trigger confidence score drops significantly and the claim moves to manual review.

### Attack Surface 5 — Timing Manipulation

**Threat:** A rider activates a policy immediately before a known disruption (e.g. buys coverage at 9am when a flood warning was announced at 8am).

**Detection:**
- Policy activation to first claim minimum window: 6 hours
- Claims filed within 6 hours of policy activation are automatically held for manual review
- If a major weather event is publicly forecast (e.g. IMD red alert issued), a zone-level premium surge is applied and new policies in that zone are restricted until the event passes

### Fraud Decision Flow

```
Trigger fires → Confidence score computed
     │
     ▼
Fraud engine checks:
  [ ] GPS zone match
  [ ] Account uniqueness (phone + Aadhaar + device)
  [ ] Claim velocity anomaly score < threshold
  [ ] Cross-rider consensus supports disruption
  [ ] Policy age > 6 hours
     │
All pass → Auto-approve payout
Any fail → Hold + flag for manual review
2+ fails → Auto-reject + account review initiated
```

---

## 9. Adversarial Defense & Anti-Spoofing Strategy

### The Architectural Insight That Changes Everything

Before describing defenses, it's worth stating the key insight clearly: **in a truly parametric system, GPS spoofing at claim time is not the real attack vector.**

GigShield's triggers fire based on external weather and AQI data — not on anything the worker reports or does. When it rains heavily in Zone X, every active policy registered to Zone X triggers automatically. A worker sitting at home cannot spoof their GPS at claim time to collect a payout, because their zone was locked at onboarding. The weather data is external. There is nothing for them to manipulate at the moment of payout.

The real attack surface is earlier and more fundamental: **onboarding and policy registration.** A syndicate of 500 bad actors doesn't spoof GPS during a storm. They register fake or misrepresented policies in high-risk zones before the storm, then collect legitimate-looking payouts when the parametric trigger fires.

This means every defense below lives at the **front door** — onboarding and policy activation — not at the cash register. An honest rider who passes onboarding correctly never encounters any of this friction during their normal use.

---

### 9.1 The Three Real Attack Vectors and Their Defenses

#### Attack Vector 1 — Fake Zone Registration

A worker who operates in a low-risk zone registers their policy claiming they work in a high-risk, flood-prone zone. When that zone triggers, they collect a payout even though their real income was never affected.

**Defense: Dark Store Binding**

A Q-Commerce rider is not just "in a zone" — they are assigned to a specific dark store by Zepto or Blinkit. That dark store has a fixed, verifiable address. At onboarding, the rider enters their platform partner ID. GigShield cross-references that partner ID against our dark store registry and derives the policy zone from the dark store's location — not from anything the rider declares.

The rider cannot choose their zone. Zone = dark store assignment. This single structural decision eliminates the most common zone fraud attack entirely.

In our current implementation, the dark store registry is a manually curated database of dark store locations across our 6 pilot cities. In production, this would be maintained via a platform data partnership.

**Defense: One-Time Policy Activation Location Check**

At policy activation each Monday morning, GigShield performs a single GPS check — not continuous tracking, just one verification that the rider's device is physically within 3km of their registered dark store at the time they activate their weekly policy. If they are activating from 40km away, the policy is held pending verification.

This check is:
- One-time per week, not continuous surveillance
- Transparent — riders are told upfront this check happens
- Invisible to honest riders who activate from near their dark store

---

#### Attack Vector 2 — Synthetic Identity and Policy Farming

A syndicate creates hundreds of fake rider accounts, all registered to a high-risk zone. They pay the weekly premium (e.g. ₹80 × 500 accounts = ₹40,000). When the zone triggers a payout of ₹300 per account, they collect ₹1,50,000. Net profit ₹1,10,000 per trigger event. This is a pure financial arbitrage attack on the insurance pool.

**Defense Layer 1: Aadhaar Uniqueness**

One Aadhaar number = one account, permanently. Aadhaar numbers are hashed and stored at onboarding. Any attempt to create a second account with the same Aadhaar is silently rejected. Running this attack requires 500 unique, real Aadhaar numbers — a meaningful barrier.

**Defense Layer 2: Platform Partner ID Uniqueness**

One Zepto/Blinkit partner ID = one account. Valid partner IDs are issued by the platform to real, verified delivery partners. Fabricating valid partner IDs requires compromising the platform's own systems — well beyond the sophistication of a typical fraud syndicate.

**Defense Layer 3: Device Fingerprint Graph**

Every device that onboards with GigShield gets a fingerprint (hardware ID, screen resolution, OS build, installed font set). This fingerprint is stored and linked to the account. If multiple accounts are ever created or logged in from the same device, they become linked nodes in our device graph. A fraud ring rotating accounts across the same hardware will surface as a connected component in the graph even if each account individually appears clean.

**Defense Layer 4: Registration Velocity Monitoring**

Real organic platform growth does not look like 50 new accounts appearing in one pin code over 48 hours. GigShield monitors registration rate per zone continuously. A spike in registrations in a specific zone — especially one that correlates with a publicly announced IMD weather alert — flags the entire cohort for manual review before their policies activate.

The key signal: **legitimate riders buy insurance before they know a specific event is coming, not after.** A cohort that registers in a high-risk zone within 48 hours of a red alert being issued publicly is suspicious by definition.

**Defense Layer 5: Zone Concentration Cap**

Each dark store zone has a maximum number of active policies it can hold, set at approximately 150% of the estimated number of actual riders operating from that dark store. When a zone hits its cap, new applications are queued. This limits the maximum liability exposure of any single zone during a trigger event regardless of how many fake accounts have been created.

**Defense Layer 6: Zone-Level Claim Rate Anomaly**

When a trigger fires, GigShield computes the claim rate for that zone — what percentage of active policies are triggering. Real disruptions affect most riders in a zone, but not all (some are on leave, some work different shifts, some are in adjacent areas). A claim rate above 75% in a single zone for a single event is statistically implausible for a genuine rider population and automatically triggers a zone-wide payout hold pending review.

---

#### Attack Vector 3 — Threshold Gaming

A sophisticated syndicate studies GigShield's parametric thresholds (e.g. rain > 20mm/hr triggers payout). They identify which zones trigger most frequently historically and concentrate legitimate-looking policies there. They are not cheating the trigger — they are making strategic bets on high-frequency disruption zones.

This is the hardest attack to fully prevent because it blurs into legitimate behavior. A real rider in a flood-prone zone should also be buying coverage there.

**Defense: Dynamic Premium Adjustment by Zone Concentration**

As policy concentration in a zone increases, the premium for new policies in that zone increases proportionally. This is basic supply/demand logic applied to insurance risk. If a zone has 3× its expected rider count in active policies, the premium for that zone rises to reflect the concentrated liability. This degrades the economics of the attack — the syndicate's expected return falls as they concentrate, making the attack self-limiting.

**Defense: Payout Cap per Zone per Event**

Even if threshold gaming succeeds in concentrating policies, per-event payout caps per zone limit the maximum damage. If Zone X has 300 active policies but the zone cap is set at ₹60,000 per event, the maximum loss per trigger event is bounded regardless of concentration.

---

### 9.2 Detecting a Coordinated Ring — The Graph Layer

Individual account checks catch individual bad actors. A coordinated ring deliberately keeps each individual account below individual anomaly thresholds. The ring structure itself is the signal — and detecting it requires analyzing relationships between accounts, not just each account in isolation.

**The account relationship graph:**

GigShield maintains a live graph where:
- Nodes = rider accounts
- Edges = shared attributes (same device, same UPI ID, same bank account, onboarded within the same 6-hour window, registered to the same zone within 48 hours of a weather alert)

**What we look for in the graph:**

| Graph pattern | What it means |
|---|---|
| Cluster of accounts sharing a device | Same person running multiple accounts |
| Cluster sharing a UPI ID or bank account | Payout consolidation — multiple fake accounts funneling money to one person |
| Cluster with synchronized onboarding timestamps | Coordinated mass registration, likely scripted |
| Cluster concentrated in one zone registered post-alert | Classic policy farming setup |
| Star pattern — one account linked to many via shared attributes | A coordinator running a ring |

**Implementation:**

We implement this using a lightweight **Graph Neural Network (GNN)** with PyTorch Geometric. Nodes have feature vectors derived from account attributes. The GNN is trained to classify subgraphs as ring-like or organic using synthetic training data generated from known fraud patterns.

When a subgraph is classified as ring-like, all member accounts are simultaneously flagged — even if each one individually scored clean on Isolation Forest. The ring structure is the evidence.

---

### 9.3 UX Balance — Handling Flagged Accounts Without Penalizing Honest Riders

**The core principle: the fraud system's worst failure mode is a false positive, not a false negative.**

A genuine rider who was caught in a flood and didn't get paid will not only churn — they will tell every other rider in their dark store. Given that Q-Commerce riders are a tight-knit community (same dark store, same WhatsApp groups), one bad experience propagates fast. The fraud system must be calibrated to strongly prefer false negatives over false positives.

**Flagging is never rejection — it is a hold with a clock.**

When any account is flagged, the action is always a time-bounded hold with a human-readable reason, not an outright rejection. The rider's communication is always "We're verifying your claim — you'll hear back within X hours" — never "your claim was rejected for fraud."

**The graduated response system:**

| Severity | Trigger condition | System action | Rider-facing message | Resolution time |
|---|---|---|---|---|
| Soft hold | One weak signal | Auto-review after 2 hours, release if no new signals | "Verifying your claim" | ≤ 2 hours |
| Medium hold | Two moderate signals | Secondary automated check | "Verifying your claim" | ≤ 4 hours |
| Hard hold | One strong signal or 3+ weak signals | Manual review queue | "Verifying your claim — our team is reviewing" | ≤ 12 hours |
| Suspension | Ring detection or confirmed farming | Account suspended, payout blocked | Clear explanation + appeal pathway | Per appeal |

**The honest network drop problem:**

During a real heavy rain event, cell towers in the affected zone get congested. GPS signals jump erratically. A genuine rider's phone may show GPS anomalies — location jumping, signal loss, inaccurate positioning — that look superficially similar to spoofing signals.

GigShield handles this with a **weather-context GPS tolerance layer:**

- When a trigger fires in a zone, the system simultaneously records the severity of the weather event
- GPS anomalies that occur during a confirmed high-severity event (e.g. red alert rainfall) are weighted significantly lower as fraud signals than identical anomalies on a clear day
- The GPS zone match boundary expands from the strict registered pin code to a 1.5km buffer during active disruption events
- If a soft hold was applied due to GPS anomaly during a confirmed disruption, and the disruption is subsequently verified at high confidence, the hold is automatically cleared and payout released without human intervention

**The appeal pathway:**

- Rider submits appeal in-app within 72 hours of a hold or suspension
- No documents required — a brief description of what they were doing is sufficient
- Photo evidence is optional and never required
- Human review within 24 hours
- If upheld: payout released immediately + ₹25 goodwill credit for the inconvenience
- After 3 upheld appeals in a rider's history: their fraud sensitivity threshold is permanently lowered — the system learns they are a genuine user and treats them accordingly

**What GigShield commits to never doing:**

- Never accusing a rider of fraud in any rider-facing communication unless suspending with cause
- Never requiring document uploads or in-person verification for standard claims
- Never penalizing future premiums based on holds that were cleared
- Never silently denying a claim — every hold and rejection produces a notification with a reason and a next step
- Never using a hold as a permanent denial by default — every hold has a defined resolution clock

---

### 9.4 GPS Spoofing Prevention — Technical Layer

#### How GPS Spoofing Actually Works on Android

Consumer GPS spoofing on Android works through the OS-level **mock location** developer setting. Apps like Fake GPS or GPS JoyStick register themselves as mock location providers and override the device's real GPS chip output with a fabricated coordinate. The attack is cheap, requires no root access on modern Android, and is widely used.

This gives us a clear detection surface — the OS itself knows when a location is being mocked.

On iOS, spoofing requires either a jailbroken device or a Mac running Xcode's location simulation. This is meaningfully harder, which is why the realistic threat model in the Indian Q-Commerce context is primarily Android.

#### Detection Layer 1 — Mock Location Flag

Android's `Location` object exposes `isMock()` (Android 12+) or `isFromMockProvider()` (older Android). When true, the location is provably coming from a software mock provider rather than the hardware GPS chip.

In our React Native implementation, we wrap this in a native module using `react-native-background-geolocation`. Every location event received by the backend is tagged with a `mock: true/false` field derived from this hardware-level flag. Any location event tagged `mock: true` is immediately discarded and the session risk score is escalated.

This check alone defeats the majority of consumer spoofing apps. Advanced apps attempt to suppress this flag by operating at the kernel level — which requires root access. Root detection (below) handles that case.

#### Detection Layer 2 — Google Play Integrity API

Google Play Integrity API tells you three things about the device making a request:

- Whether the app binary is genuine and unmodified (not a repackaged APK)
- Whether the device has a certified, unmodified Android build (not rooted, not a custom ROM)
- Whether the app is running in a genuine Android environment (not an emulator)

A rooted device can suppress the `isMock()` flag. The Play Integrity API catches the root itself. Combined, these two checks cover both the casual spoofer (mock location flag) and the sophisticated spoofer (rooted device suppressing the flag).

Called at policy activation and once per session start. The integrity verdict is stored with the session record.

#### Detection Layer 3 — Sensor Fusion Consistency Score

A real device physically present at location X will have multiple independent sensors all agreeing with each other. A spoofed GPS overrides only the GPS output — it cannot simultaneously override all other signals.

For every location update, the backend computes a sensor fusion consistency score across:

| Signal | What we check |
|---|---|
| Cell tower triangulation | Does independent cell tower positioning agree with GPS within ~400m? |
| WiFi positioning | Do visible WiFi networks match networks known to exist near the declared coordinates? |
| Accelerometer | Does motion sensor activity match the movement implied by consecutive GPS coordinates? |
| GPS speed plausibility | Is the speed between consecutive coordinates physically possible on a delivery bike in city traffic? |
| Location jitter | Does the GPS show natural micro-variance (±5–15m for a stationary device) or unnaturally perfect static precision? |
| Altitude consistency | Does reported altitude match the known terrain elevation at the declared coordinates? |

Each signal votes independently. The fusion score is the weighted agreement across all signals. A spoofer sitting at home with a fake coordinate in Koramangala will have cell towers pointing to their real location, WiFi networks belonging to their home area, near-zero accelerometer activity, and unnaturally static GPS precision. The score collapses.

This score feeds directly into the live session risk score maintained per worker in Redis.

#### Detection Layer 4 — Speed Impossibility Check

Simple backend logic, no ML required. If two consecutive GPS coordinates imply a travel speed that is physically impossible — more than 60 km/h in a dense urban zone, or a coordinate jump of 3km in under 60 seconds — the update is flagged as a teleport event.

One teleport event = soft flag. Two within a session = hard flag. Three = session suspended pending review.

#### Detection Layer 5 — Basal Location Profile (Prior Delivery History + UPI SMS)

This is GigShield's most durable anti-spoofing layer. The core insight: **a spoofer can fake their live GPS stream, but they cannot retroactively fake weeks of delivery history.**

**Prior delivery history fingerprint:**

After a rider's first 2 weeks on the platform, their delivery activity builds a location fingerprint — which zones they operate in, at what times of day, what their typical movement radius looks like, how long they stay near the dark store. This fingerprint is stored as a probability distribution over zones and time windows.

When a live session's location data deviates significantly from the rider's historical fingerprint — a rider who has spent every weekday morning within 1.5km of their Dharavi dark store for 4 weeks suddenly pinging from Bandra — the deviation is flagged as a zone drift anomaly. The severity scales with how far outside their historical distribution the current location falls.

New riders (first 2 weeks) have no fingerprint yet. They fall back on zone-level consensus and sensor fusion alone — slightly lower trust until the fingerprint builds naturally through genuine activity. A fraudster who has never actually worked in a declared zone cannot fabricate 6 weeks of authentic delivery movement placing them there.

---

### 9.5 Real-Time Continuous Verification Architecture

The fraud and spoofing detection above depends on a continuous, reliable stream of worker state data. This section describes how that stream is built — the architecture that makes "real-time" mean something precise rather than just a marketing claim.

#### What Real-Time Actually Means Here

Real-time in GigShield's context means: **continuously knowing, with high confidence, whether a worker is genuinely present and active in their zone during a disruption window.**

This is not the same as constant GPS polling every second. Naïve constant polling drains battery, gets spoofed easily on slow connections, and creates more noise than signal. The correct architecture is near-real-time with intelligent adaptive sampling — data flows continuously but efficiently.

#### Worker Session State Machine

Each active worker is modeled as a continuously updated state machine in Redis:

```
States:
  INACTIVE        — policy active, worker not yet detected in zone
  ACTIVE          — worker present and moving, normal delivery pattern
  STATIONARY      — worker present but not moving (break, dark store wait)
  DISRUPTION_ZONE — disruption event active in worker's zone
  FLAGGED         — session risk score above threshold, under review
  DISCONNECTED    — connection lost, buffered data being awaited

Transitions:
  INACTIVE → ACTIVE          on first valid location update near dark store
  ACTIVE → STATIONARY        on movement velocity dropping below threshold for 5+ minutes
  ACTIVE → DISRUPTION_ZONE   on parametric trigger firing in worker's zone
  ANY → FLAGGED              on risk score crossing threshold
  ANY → DISCONNECTED         on WebSocket connection drop
  DISCONNECTED → (previous)  on reconnection with valid buffered data
```

Redis stores the current state, last known coordinates, last update timestamp, current session risk score, and movement history buffer for each active worker. TTL is set to 7 days (policy week duration).

#### Persistent Connection — WebSockets over REST

The app maintains a persistent WebSocket connection to the backend via Socket.IO for the duration of each active policy week. This replaces the polling model entirely.

Benefits over REST polling:
- No repeated HTTP handshake overhead
- Server can push disruption alerts to the device instantly
- Session state is maintained server-side with low latency updates
- Connection drops are detectable immediately (vs polling where a dropped worker just stops sending)

On connection drop: the app falls back to local buffering (see below) and attempts reconnection every 30 seconds.

#### Adaptive Location Sampling

The app does not sample at a fixed rate. Sampling frequency adapts to context:

| Worker state | Sampling interval | Rationale |
|---|---|---|
| Stationary (no active disruption) | Every 60 seconds | Battery conservation, low information value |
| Moving (active delivery) | Every 10 seconds | Captures delivery trip pattern |
| Disruption event active in zone | Every 5 seconds | Maximum precision during eligibility window |
| Session flagged | Every 5 seconds | Increased scrutiny |
| Disconnected / reconnecting | Local buffer, flush on reconnect | Network unavailable |

Implemented via `react-native-background-geolocation` running as a foreground service with a persistent notification. This is mandatory on modern Android to prevent the OS from killing the location service during aggressive battery optimization. The notification is minimal and rider-friendly: "GigShield is verifying your coverage zone."

Data is batched — the app accumulates 3–5 location readings locally and sends them as a single payload every 10–30 seconds rather than one HTTP/WS call per reading. This reduces connection overhead while maintaining near-real-time fidelity.

#### Handling Network Drops (India Reality)

Network connectivity in Indian urban areas is genuinely unreliable — cell tower congestion during storms, dead zones in dense buildings near dark stores, carrier switching. GigShield's architecture treats disconnection as a normal operating condition, not an exception.

When the WebSocket connection drops:
- The app continues sampling locally at the current adaptive rate
- All readings are stored in a local SQLite buffer with precise device timestamps
- The buffer holds a maximum of 15 minutes of readings (older readings are dropped)
- On reconnection, the buffered payload is flushed to the server with original timestamps intact

On the backend, buffered data is validated before acceptance:
- Timestamps must be continuous — no gaps larger than the declared sampling interval
- Speed between consecutive buffered points must be physically plausible
- The reconnection event itself is logged with its duration — extended disconnection during a disruption event is noted but not penalized (network degradation is expected during storms)
- Buffered data submitted more than 20 minutes after the fact is rejected — it cannot be reliably distinguished from data generated offline to game a trigger

#### Inline Risk Score Updates

Fraud scoring does not happen as a batch check at payout time. Every incoming location update triggers a lightweight risk score update on the live session:

```
On each location update received:
  1. Run mock location flag check
  2. Run speed plausibility check against previous coordinate
  3. Update sensor fusion consistency score
  4. Compare against basal location profile (zone drift check)
  5. Update session risk score in Redis (weighted rolling average)
  6. If score crosses soft threshold → flag session state
  7. If score crosses hard threshold → suspend session, notify admin
```

This means by the time a parametric trigger fires and a claim is initiated, the session's risk score already reflects the full history of that session's location behavior — not just a snapshot at the moment of the trigger. A fraudster who has been pinging from an implausible location for 2 hours before the trigger fires will have a degraded risk score long before the payout decision is made.

#### Geofencing as the Eligibility Engine

Mapbox Geofencing API defines the boundary of each dark store's delivery zone. The geofence is the primary eligibility check — when a disruption trigger fires, the backend queries Redis for all workers currently in `ACTIVE` or `STATIONARY` state within the relevant geofence, cross-checks their session risk scores, and initiates claims only for workers who are both inside the zone and above the minimum trust threshold.

Workers who are outside their geofence when the trigger fires — regardless of reason — are not eligible for that event's payout. This is clearly communicated in the policy terms at onboarding.

---

## 10. Automated Claims & Payout Pipeline

### Claim Lifecycle

```
TRIGGERED → CONFIDENCE_CHECK → FRAUD_CHECK → APPROVED / HELD / REJECTED
     │                                              │
     │                                         APPROVED
     │                                              │
     │                                    Payout computed
     │                                    (deterministic math)
     │                                              │
     │                                    Payment gateway called
     │                                    (Razorpay Payout API)
     │                                              │
     │                                    UPI / bank transfer initiated
     │                                              │
     │                                    Push notification sent to rider
     │                                              │
     └──────────────────────────────────── Event logged to dashboard
```

### Payout Processing

- **Target SLA:** Payout initiated within 20 minutes of trigger confirmation
- **Payment method:** UPI (primary), bank transfer (fallback)
- **Gateway:** Razorpay Payout API (sandbox for development, production for live)
- **Failure handling:** If payment fails, retry 3 times at 5-minute intervals. If all retries fail, flag for manual payout and notify rider.

### Grievance & Dispute Flow

Fully automated systems need a human override path for edge cases:

- Rider can raise a dispute within 48 hours of a non-triggered disruption they believe should have qualified
- Dispute submission requires: date/time, description, optional photo evidence
- Admin reviews against raw weather/AQI logs for that zone and time window
- Admin can manually approve a payout with a note logged to the audit trail
- Response SLA: 72 hours

### Notifications

| Event | Channel | Timing |
|---|---|---|
| Policy activated | Push + SMS | Immediately |
| Disruption detected in zone | Push | Within 5 min of trigger |
| Claim auto-approved | Push + SMS | Immediately |
| Payout initiated | Push + SMS | Immediately |
| Payout confirmed | Push | On gateway confirmation |
| Claim held for review | Push | Immediately |
| Policy expiring | Push | Sunday 6pm |

---

## 11. Integration Capabilities

### Weather & Environmental Data

| API | Purpose | Tier Used |
|---|---|---|
| **OpenWeatherMap API** | Current weather, 7-day forecast, historical data per coordinates | Free tier (60 calls/min) |
| **AQICN (World Air Quality Index) API** | Real-time and forecast AQI by city / coordinates | Free tier (1,000 calls/day) |
| **IMD Open Data** | Historical rainfall records for Indian cities (training data) | Public / free |
| **CPCB API** | Historical AQI records for Indian cities (training data) | Public / free |

### Geolocation & Mapping

| API | Purpose | Tier Used |
|---|---|---|
| **Mapbox API** | Zone boundary definition, geofencing, GPS validation, dark store mapping | Free tier (50,000 map loads/month) |
| **Google Maps Directions API** | Traffic movement index for zone-level paralysis detection | Free tier ($200/month credit) |

### Identity & Payments

| API / Service | Purpose | Tier Used |
|---|---|---|
| **Razorpay Payout API** | Automated UPI / bank payouts to riders | Sandbox for development |
| **Razorpay Payment API** | Weekly premium collection from riders | Sandbox for development |
| **DigiLocker API** | Aadhaar-based identity verification at onboarding | Sandbox / mock |
| **Firebase Auth** | Phone OTP verification | Spark (free) tier |

### Platform Integration (Simulated)

Q-Commerce platforms (Zepto, Blinkit) do not expose public APIs for worker data. The following are simulated in our implementation:

| Simulated Signal | How We Simulate It | What It Would Be in Production |
|---|---|---|
| Rider earnings data | Self-declared at onboarding, range-validated | Platform API returning weekly earnings |
| Platform ops suspension signal | Mock JSON endpoint returning zone-level halt events | Zepto/Blinkit webhook or API |
| Active delivery status | Mock rider activity feed | Platform real-time delivery status API |
| Dark store locations | Hardcoded + manually mapped for 6 cities | Platform-provided dark store registry |

### Internal Services

| Service | Purpose | Technology |
|---|---|---|
| **TimescaleDB** | Time-series storage for weather readings and trigger events | PostgreSQL extension |
| **Redis** | Job queue for scheduler tasks, rate limiting, session cache | Redis OSS |
| **Node-cron** | Scheduler for 30-minute monitoring loop and weekly premium jobs | Node.js library |
| **Python ML Service** | XGBoost model serving + Isolation Forest fraud scoring | FastAPI |

---

## 12. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Mobile App | React Native | Single codebase for iOS + Android; rider-facing interface |
| Background Location | react-native-background-geolocation | Foreground service for continuous adaptive location tracking; exposes Android `isMock()` flag natively |
| Real-Time Connection | Socket.IO (WebSockets) | Persistent connection for continuous worker session state; replaces REST polling entirely |
| Web Dashboard | React | Admin analytics dashboard + rider web portal |
| Backend API | Node.js + Express | High-concurrency WebSocket handling, trigger monitoring, session state management |
| ML Service | Python + FastAPI | XGBoost (premium), Isolation Forest (fraud), GNN (ring detection), SHAP (explainability) |
| Primary Database | PostgreSQL | Policies, claims, riders, payouts, basal location profiles |
| Time-Series Store | TimescaleDB | Weather readings, AQI readings, trigger events, per-worker location history |
| Live Session Store | Redis | Worker state machine per session, risk scores, geofence membership, WebSocket session registry |
| Local Device Buffer | SQLite (on-device) | Offline location buffering during network drops; flushed on reconnection |
| Scheduler | Node-cron | Weather polling loop, weekly premium job, monthly ML retraining trigger |
| Payments | Razorpay | Premium collection + automated payouts |
| Maps + Geofencing | Mapbox | Zone boundary definition, dark store geofences, GPS validation |
| Device Integrity | Google Play Integrity API | Root detection, app tampering detection, emulator detection |
| Auth | Firebase Auth | Phone OTP at onboarding |
| Graph ML | PyTorch Geometric | GNN for fraud ring detection across account relationship graph |
| Hosting | AWS EC2 / Railway | Backend + ML service deployment |


---

*GigShield — built for the riders who keep your groceries moving.*
