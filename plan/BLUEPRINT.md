# `/plan` — Itinbee App Plan, Render Architecture & Impeccable UI Blueprint

**Confirmed Launch Brand:** **Itinbee** (`itinbee.com` / `.in` / `.app`, featuring the **Scout Bee** mascot; repository directory codename: `TripSeam`; `Tripeseam` rejected per [`03_naming_analysis.md`](../03_naming_analysis.md))  
**Product Truth & Impeccable Config:** [`../PRODUCT.md`](../PRODUCT.md) · [`../.impeccable/config.json`](../.impeccable/config.json) (`"buildPath": "code"`, platform: `web`)  
**Document Role:** Canonical single source of truth for R4. Specialized specifications live in:
- [01 — UX Flows, Impeccable UI Surfaces & India-First Features](./01_ux_flows_and_india_features.md)
- [02 — Render Multi-Service Architecture (`frontend/` & `backend/`), Offline Sync & Data Model](./02_system_architecture_and_data.md)
- [03 — 26-Week Roadmap, Monetization & Risk Register](./03_roadmap_monetization_risks.md)
- [04 — Detailed Step-by-Step Execution Plan (Render + Impeccable UI)](./04_execution_plan_render_and_impeccable_ui.md)

---

## 1. Product Vision & Strategic Wedge

**Itinbee** is an **OTA-agnostic, WhatsApp-native, offline-first collaborative trip workspace (mobile-first Web / PWA)** built for Indian domestic, multi-generational, and outbound travellers.

Rather than competing with MakeMyTrip (53.8% OTA share), ixigo, or Thrillophilia on inventory discounting—or charging Western USD SaaS subscriptions ($39.99–$59.99/yr) like Wanderlog, TripIt, and Roadtrippers—Itinbee owns the **post-inspiration and post-booking coordination layer**:
1. **Zero-friction creation** (no mandatory signup to test-build in the live browser sandbox, WhatsApp/`trips@itinbee.com` forwarding, IRCTC/redBus/IndiGo/MMT PDF & screenshot parsing via the *Scout Bee* dropzone, Reel/YouTube oEmbed & caption extraction, Hindi/Hinglish voice capture, and cloneable India templates).
2. **Zero-login WhatsApp group sharing & voting** (`<150KB` SSR mobile web cards at `itinbee.com/t/<shortId>` loading in `<1.5s` on Indian 4G, zero-OTP Turnstile group polls, dual *Builder* vs. *Family/Elder Card* views, and auto-redacted PNRs).
3. **Free hill-station & roaming offline vault + UPI ledger** (local `IndexedDB` + Service Worker PWA delta-sync, WebCrypto/KMS-encrypted PNR/ticket cache, and unlimited group bill splits with `upi://pay` deep-link settlement).

---

## 2. Target Personas (Grounded in R1 & `PRODUCT.md`)

| Persona | R1 Behavioral Anchor | Primary Itinbee Jobs-to-be-Done |
|---|---|---|
| **Trip Architects** *(Lead Planners)* | Women & primary planners (24–55) organizing family or mixed-group budgets & logistics (*How India Travels 2025*). | Pull scattered IRCTC, flight, cab, and ~70% unbranded homestay bookings into one timeline; share clean views without fielding 50 WhatsApp questions. |
| **Friend Crews / Unscripted Explorers** | Young professionals & college groups (20s–30s) trapped in WhatsApp reel-spam & Splitwise's 4-expense/day cap. | Turn Reel/YouTube links & captions into map pins, run 1-tap stay/date polls inside WhatsApp, and settle unequal veg/alcohol/fuel/kitty splits via UPI. |
| **Multi-Gen & Spiritual Families** *(Timeless Travellers)* | **47.7% (~48%)** of domestic overnight trips are for pilgrimage/religious purposes (MoSPI/NSO DTES); senior *Timeless Travellers* (60+) travelling in multi-gen groups with *Trip Architects* & *Next-gen Co-pilots*. | Receive a large-font (`>=18px`), Indic-capable, read-only *Family/Elder Card* or QR-linked PDF with darshan slots, pure-veg/Jain notes, and pacing buffers—no app install required. |
| **Tier-1/2/3 Outbound Travellers** | 53% of outbound forex demand & 63% of agent-booked outbound trips come from non-metros (Vietnam, Thailand, Japan, UAE). | Track e-visas, passport expiry, forex balances, eSIM setup, and multi-currency INR-converted budgets offline on roaming. |

---

## 3. Master R1 & R2 → R4 Traceability Matrix

Every core product, UI, and infrastructure decision in Itinbee traces directly to verified R1 market realities and R2 international competitor benchmarks:

| Design Choice in Itinbee (`/plan`) | R1 India Market Insight (Evidence) | R2 International Competitor Lesson (Adopt / Avoid / Localize) | Spec Reference |
|---|---|---|---|
| **Zero-Signup Live Sandbox on `/` (`Persuade` → `Operate`)** | 83% of Indian travellers embrace AI/digital planning tools; cold-start signup walls kill top-of-funnel curiosity. | **Adopt Wayplot** (`localStorage` zero-signup sandbox) — **Avoid** Wayplot's permanent browser trap by migrating `IndexedDB` guest drafts into cloud sync on phone/Google sign-in. | [`01_ux_flows` §1](./01_ux_flows_and_india_features.md#1-effortless-itinerary-creation-flows) |
| **Mobile-First Web / PWA (`frontend/`) + Separate API (`backend/`) on Render** | 1,092.79M internet subscribers; links open inside WhatsApp's Android/iOS in-app browsers across mid-range devices. | **Avoid Tripsy & Mindtrip** (Apple-only apps excluding ~95% of India). Ship separate Next.js SSR `frontend/` and Fastify `backend/` services on Render (`singapore`) fronted by Cloudflare India edge. | [`02_system_arch` §1](./02_system_architecture_and_data.md#1-render-multi-service-topology--standalone-folder-decision) |
| **Zero-Login WhatsApp Guest Web Links + Polls** | 535–550M Indian WhatsApp users; friend/family plans stall in chaotic group chats without consensus. | **Adopt Pilot** (group voting) + **Stippl** (public SEO trip pages) — **Avoid Wayplot** (PDF-only sharing with generic city QR and zero live URL). | [`01_ux_flows` §2](./01_ux_flows_and_india_features.md#2-whatsapp-first-sharing--group-collaboration) |
| **Hybrid Regex + Gemini Flash Parser (`trips@itinbee.com`, WhatsApp, Scout Dropzone)** | Extreme fragmentation across IRCTC (82.57L daily logins, no open consumer API), redBus (+25% YoY), IndiGo/Air India (91.7% air duopoly), and ~70% unbranded stays. | **Adopt TripIt** (`plans@` email ingestion) + **Mindtrip** ("Start Anywhere" social links-to-stops) — **Localize** with IRCTC PNR/coach/berth, redBus, and Indian OTA templates (zero IRCTC scraping). | [`02_system_arch` §3](./02_system_architecture_and_data.md#3-hybrid-booking--social-ingestion-pipeline) |
| **Free Offline-First PWA Sync + Encrypted Ticket Vault** | Hill-station dead zones (Himachal, Spiti, Uttarakhand, Northeast) and outbound roaming zones; 32.8M outbound departures. | **Adopt Polarsteps & Wayplot** (offline-first caching) — **Avoid Wanderlog & Roadtrippers** ($39.99–$59.99/yr offline paywalls). | [`02_system_arch` §2](./02_system_architecture_and_data.md#2-offline-first-pwa-sync--conflict-resolution) |
| **Unlimited Inline Group Ledger + `upi://pay` Deep Links** | Splitwise 4-expense/day free cap fallout; 55.49 Cr UPI users (₹314.23L Cr FY26); unequal veg/alcohol, FASTag fuel, and kitty splits. | **Adopt Wanderlog & Stippl** (inline expense tracking) + **Wayplot** (Frankfurter INR FX support) — **Localize** with zero caps and 1-tap `<=₹2,000` UPI intent + `>₹2,000` copy-VPA fallback. | [`01_ux_flows` §3](./01_ux_flows_and_india_features.md#3-offline-vault--upi-native-expense-ledger) |
| **Dual-View Sharing ("Builder" vs. "Family/Elder Card") & Impeccable UI** | 98% Indic language content access; **47.7% (~48%)** of domestic overnight trips are pilgrimage/religious (MoSPI/NSO DTES), alongside multi-gen family travel (*Timeless Travellers* 60+). | **Adopt Wanderlog** (locale-aware Hindi hints) & **Wayplot** (clean printable PDF with QR) — **Localize** with Impeccable `Read` clarity, `A / अ` toggle, veg/Jain/accessibility tags, and live-URL QR. | [`01_ux_flows` §2.3 & §4](./01_ux_flows_and_india_features.md#4-impeccable-ui-frontend-architecture--scout-bee-mascot-system) |
| **Calibrated Hill/Highway Routing + Open MapLibre/POI Stack** | Mountain switchbacks (Manali–Leh, Rishikesh–Badrinath) and multi-modal train+bus+cab legs break straight-line distance math. | **Avoid Wayplot** (naive 1.3× Haversine at 30 km/h) & **Avoid Google Places API mixing** (GMP Terms §3.2.3 / §14.2). Use MapLibre + Protomaps + 100% open **Overture / Foursquare OS / OSM Photon / Wikidata** POIs + outbound Google Maps URLs (`api=1`). | [`02_system_arch` §5](./02_system_architecture_and_data.md#5-map-routing--indian-travel-time-calibration) |
| **INR Micro-Passes (₹49–₹99/trip) + Free Outbound Affiliate Attach** | Low Indian WTP for $40–$60/yr SaaS; 53% Tier-2/3 outbound forex demand & $23.4B outbound spend (Vietnam, Thailand, Japan, UAE). | **Avoid Roadtrippers** (3-stop free cap) & **Avoid Layla/MMT** (pure OTA cart lock-in). Keep utility core + outbound checklists free; monetize eSIM/forex/insurance attach + Trip Pass/Pro power perks. | [`03_roadmap` §2](./03_roadmap_monetization_risks.md#2-monetization-strategy--unit-economics) |
| **Technical Hygiene: `www.` 301, Live `/llms.txt`, Render `singapore` + Mumbai KMS Vault** | Indian PII/PNR/passport vaulting requires strict encryption & DPDPA 2023 compliance. | **Avoid Wayplot's mistakes** (missing `www.` DNS record and HTTP 404 `/llms.txt`) while **Adopting Stippl/Pilot/Tripsy** (`sitemap-trips` SEO + AI discoverability). | [`02_system_arch` §1 & §6](./02_system_architecture_and_data.md#6-security-dpdpa-2023-compliance--seo-hygiene) |

---

## 4. High-Level Multi-Service Architecture (Render `singapore` + Cloudflare India + Mumbai Vault)

```text
[Indian Traveller Browsers & WhatsApp WebViews]
 ├── Mobile & Desktop Web/PWA (Zero-Signup IndexedDB Sandbox + Service Worker Offline Sync)
 └── WhatsApp Cloud API Bot + Inbound Email (trips@itinbee.com -> stateless Cloudflare Email Worker)
        │
        ▼ (Cloudflare Indian Edge: Mumbai / Chennai / Delhi — 301 www, Turnstile, R2 .pmtiles CDN)
[Render Region: singapore — Isolated Private Network (root render.yaml Blueprint)]
 ├── Service 1: itinbee-frontend (rootDir: frontend | Next.js App Router <150KB SSR + Impeccable UI)
 │      └── Calls Fastify over Render Private Network (http://itinbee-backend:10000, <2ms RTT)
 ├── Service 2: itinbee-backend  (rootDir: backend  | Fastify + @fastify/websocket + Inline BullMQ)
 │      ├── Itinerary, Turnstile Polls & Elder Card Projection Service
 │      ├── Delta-Sync Engine (HLC + monotonic server_seq + tombstones + (sort_key, id) tie-break)
 │      ├── Hybrid Ingestion Pipeline (Regex/PDF Parsers -> GCP Vertex AI asia-south1 Gemini Flash)
 │      ├── Expense & UPI Service (Append-only ledger, kitty pools, <=₹2,000 upi://pay + copy fallback)
 │      └── Vault & Redaction Service (AWS S3 ap-south-1 Mumbai KMS envelope encryption)
 ├── Database:  itinbee-db (Render Managed PostgreSQL 16 + PostGIS)
 └── Key Value: itinbee-kv (Render Managed Redis — WS Pub/Sub, rate limits, Trip Pass quotas, FX/POI cache)
```

---

## 5. Internal Consistency & Verification Guardrails

All `/plan` documents adhere to one unified specification:
* **Primary Brand, Mascot & Domain:** `Itinbee` (`itinbee.com`, `trips@itinbee.com`, `itinbee.com/t/<shortId>`) with the **Scout Bee** mascot; `TripSeam` is strictly the local workspace folder name.
* **Separate Render Services & Standalone Folders:** `frontend/` and `backend/` live as completely independent top-level directories with zero cross-folder relative code imports (`backend/` exports `openapi.json` → `frontend/` generates types via `openapi-typescript`), deployed as separate warm Render Starter services in `singapore`.
* **Free Tier Promise:** Unlimited trips, unlimited stops, offline PWA itinerary & **50MB/trip** encrypted ticket vault (with client-side WebP/PDF compression), WhatsApp guest viewing & zero-OTP Turnstile/Google polls, **corridor-specific outbound readiness checklists & contextual affiliate cards**, and unlimited UPI expense splits are **100% free** across all specifications.
* **Paid Tier Scope:** **Itinbee Trip Pass** (`₹49 Domestic` / `₹99 Outbound` per trip, group-shared) and **Itinbee Pro** (`₹399–₹499/yr`) unlock only power-user extras: unlimited AI/Reel/OCR imports, 1GB/5GB encrypted family vault, automated multi-passport 6-month expiry tracking (`₹99 Outbound` & `Pro`), and **B2B-API-backed live flight/rail status & delay WhatsApp alerts** (zero scraping).
