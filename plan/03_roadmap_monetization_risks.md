# Plan 03 — 26-Week Roadmap, Monetization, Unit Economics & Risk Register

**Parent Blueprint:** [`BLUEPRINT.md`](./BLUEPRINT.md) · **Detailed Step-by-Step Execution Plan:** [`04_execution_plan_render_and_impeccable_ui.md`](./04_execution_plan_render_and_impeccable_ui.md)  
**Commercial Mandate:** Keep the core itinerary builder, WhatsApp guest sharing, offline PWA caching, and UPI expense splitting **100% free** (avoiding Roadtrippers' 3-stop cap and Wanderlog's $39.99/yr offline paywall), while monetizing high-intent outbound/domestic trips through ultra-affordable INR micro-passes and contextual affiliate attach.

---

## 1. Phased Engineering Roadmap (26 Weeks / 3 Phases)

### Phase 1: MVP — Render Multi-Service Foundation, Impeccable Web/PWA & Offline Core (Weeks 1–10)
* **Team Topology:** 1 Full-Stack Lead (`backend/` Fastify + Render/Cloudflare/Mumbai S3 Infra), 1 Frontend/Design Engineer (`frontend/` Next.js SSR + MapLibre + Impeccable UI + Offline PWA).
* **Sprint Deliverables:**
  * **Weeks 1–3:** Register `itinbee.com`/`.in`/`.app`, configure Cloudflare DNS/CDN/Turnstile/R2 + root `render.yaml` Blueprint (`itinbee-frontend`, `itinbee-backend`, `itinbee-db` PostGIS, `itinbee-kv` Redis in `singapore`) + AWS S3 `ap-south-1` KMS vault; run Impeccable `concept-seed` & lock surface Direction Contracts; ship Phone OTP / Google Auth and the **zero-signup `IndexedDB` live sandbox on `/`**.
  * **Weeks 4–6:** Responsive Split-Screen MapLibre + Protomaps Workbench (`/trip/[id]`) with *The Multi-Modal Transit Spine*, fractional-index timeline + HLC `POST /v1/trips/:id/sync` offline delta-sync, **`<150KB` WhatsApp SSR share links** (`itinbee.com/t/<shortId>`, `<1.5s` Indian 4G FCP, lazy MapLibre), 1-tap WhatsApp text digest, and live-URL QR printable PDF.
  * **Weeks 7–8:** *Scout Bee* Ingestion Dropzone + `trips@itinbee.com` email stream + deterministic regex/PDF parsers for **IRCTC, IndiGo, Air India, redBus, MMT, Airbnb** (with client-side WebP/PDF compression rejecting/downsampling `>10MB` camera scans) + GCP Vertex AI `asia-south1` Gemini Flash fallback.
  * **Weeks 9–10:** Offline sync hardening (`deleted_at` tombstones, `(sort_key, id)` tie-break, orphan-to-shortlist rule), AWS S3 `ap-south-1` KMS + WebCrypto AES-GCM offline vault (`50MB/trip` free quota, Aadhaar last-4 masking, public auto-redaction), **Family/Elder Card (`A / अ`)** view, Impeccable `first-viewport` + `detect --json` + `impeccable-finish-reviewer` + `DESIGN.md` documentation pass, and public web beta.
* **Phase 1 Exit Gate:** 100 beta trips created across Goa, Himachal, and Varanasi templates; `p95` share-link LCP `<1.5s` (`<150KB` initial SSR payload) on throttled 4G; `>=90%` exact extraction accuracy on IRCTC/IndiGo/redBus test corpus; `ship` verdict from `impeccable-finish-reviewer`; zero PII leakage on public tokens.

### Phase 2: Group Virality, UPI Splits & WhatsApp Bot (Weeks 11–18)
* **Sprint Deliverables:**
  * **Weeks 11–13:** **Unlimited UPI Expense Ledger** (`kitty_pools`, append-only adjustments, equal/exact/tag-exclude, FASTag fuel/toll, multi-currency FX) + `<=₹2,000` `upi://pay` deep-link settlement + `>₹2,000`/iOS 1-tap copy-VPA fallback + debt simplification.
  * **Weeks 14–15:** **Group Polls & Real-Time Co-Editing** (`@fastify/websocket` + `itinbee-kv` Redis Pub/Sub sync, Shortlist Idea Cards, 1-tap Cloudflare Turnstile + Guest Name / Google One-Tap poll voting at `₹0` OTP cost); promote BullMQ into a dedicated Render `type: worker` service (`rootDir: backend`) as parse volume grows.
  * **Weeks 16–18:** **WhatsApp Cloud API Bot** (forward ticket/screenshot directly in WhatsApp) + **oEmbed/Captions & YouTube Transcript Reel-to-Stops** + **Hindi/Hinglish voice capture** + 20 cloneable India templates (`sitemap-trips.xml` SEO loop) + PWA Web Share Target integration.
* **Phase 2 Exit Gate:** WhatsApp share-to-viewer conversion `>=35%`; `>=15%` viewer-to-new-trip K-factor lift; offline conflict resolution validated across 50 simulated concurrent offline edits.

### Phase 3: Outbound Readiness, Monetization & Native Wrapper Expansion (Weeks 19–26)
* **Sprint Deliverables:**
  * **Weeks 19–21:** **100% Free** outbound corridor checklists (**Vietnam, Thailand, Malaysia, Japan, UAE, Schengen**) with contextual **eSIM / forex card / travel insurance / activity affiliate cards**, offline regional Protomaps packs, and 50+ programmatic SEO corridor guides.
  * **Weeks 22–24:** **Itinbee Trip Pass (`₹49 Domestic` / `₹99 Outbound`)** & **Itinbee Pro (`₹399–₹499/yr`)** via Razorpay/UPI Autopay, integrating **licensed B2B Indian Rail/PNR status APIs** (IRCTC-authorized TIES/PSP aggregator) & **AviationStack/AeroDataBox** flight status alerts, multi-passport 6-month expiry tracking, and 1GB/5GB encrypted family vaults.
  * **Weeks 25–26:** Expanded Indic localization (Tamil, Telugu, Marathi, Bengali, Gujarati), OpenTelemetry + Sentry + PostHog observability, creator launch campaign, and optional native Android/iOS Play Store / App Store companions consuming `itinbee-backend` APIs.
* **Phase 3 Exit Gate (SLOs):** `99.9%` API availability; `p95` sync latency `<250ms` from India; ingestion job completion `<6s`; positive contribution margin per 1,000 MAU.

---

## 2. Monetization Strategy & Unit Economics

### 2.1 Pricing Architecture (Designed for Indian Willingness-to-Pay)

| Tier | Price (INR) | Included Capabilities | Strategic Rationale |
|---|---|---|---|
| **Itinbee Free (Core)** | **₹0 forever** | Unlimited trips & stops, offline PWA itinerary & `.pmtiles`, **50MB/trip** compressed encrypted PNR/ticket vault, WhatsApp SSR share links, Family/Elder Card, Turnstile/Google group polls, unlimited UPI expense splits (`<=₹2,000` intent + `>₹2,000` copy fallback), **100% free corridor outbound checklists & affiliate cards**, up to 10 AI/OCR parses/trip. | Captures viral WhatsApp distribution, Splitwise/Wanderlog refugees, and top-of-funnel outbound affiliate monetization without paywalling readiness checklists. |
| **Itinbee Trip Pass (Domestic)** | **₹49** per trip *(group-shared)* | Unlimited Reel/Voice/OCR imports for that trip, **1GB** group-shared encrypted vault, and **B2B-API-backed live train/flight status & delay WhatsApp alerts** (up to **15 utility alerts** & **6 B2B status polls** per trip, enforced via Redis/BullMQ hard per-trip quota). | Ultra-low impulse UPI purchase (~cost of one airport chai) split across the group—solves India's subscription fatigue. |
| **Itinbee Trip Pass (Outbound)** | **₹99** per trip *(group-shared)* | All Domestic Trip Pass perks + **automated multi-passport 6-month expiry & e-visa deadline tracking**, live international flight delay alerts, and multi-currency receipt OCR. | Monetizes high-intent $23.4B outbound trips with genuine automation while keeping basic corridor checklists free. |
| **Itinbee Pro (Annual)** | **₹399–₹499 / year** *(~85% cheaper than Wanderlog/TripIt $39–$49/yr)* | Unlimited Trip Passes across all trips, **5GB** encrypted family passport/ID vault, automated multi-passport 6-month expiry alerts, priority WhatsApp bot ingestion, and up to 100 B2B flight/rail alerts/yr. | Captures frequent domestic flyers & Tier-1/2/3 outbound families at an accessible Indian price point. |

### 2.2 Contextual Non-Intrusive Affiliate & Fintech Attach
Grounded in R1's **32.8M outbound departures** (`US$16.4B` outbound spend) and **53% Tier-2/3 forex demand**:
* **Free Outbound Corridor Cards:** Shown on all outbound trips (free tier included) for Vietnam, Thailand, Malaysia, Japan, UAE, and Schengen—surfacing **Travel eSIMs**, **Zero-Markup Forex Cards**, **Travel Insurance**, and **Klook/Viator/GetYourGuide attraction passes**.
* **Domestic Activity & Stay Links:** Contextual links to **Thrillophilia / Klook** experiences inside *Shortlist Idea Cards* while keeping user-imported PNRs 100% neutral.

### 2.3 Per-MAU Cost Control & Illustrative Unit Economics (INR)
* **Zero-Fee Open Maps & POI Architecture:** MapLibre + Protomaps on R2 + open Overture/Foursquare OS/OSM Photon/Wikidata POIs keep map/POI API costs near **$0** with zero Google Places API bills.
* **Lean Render Starter Stack:** `itinbee-frontend` ($7) + `itinbee-backend` ($7) + `itinbee-db` ($7) + `itinbee-kv` ($7) totals **$28/mo (~₹2,380/mo)** for the entire warm base cluster; amortized across even ≥2,000 MAU, per-1,000-MAU base Render + Mumbai S3 KMS overhead sits within `₹1,250`.
* **Deterministic Parsing & Zero-OTP Guest Polls:** `70%+` of Indian tickets parse via regex at **$0 LLM cost**, and guest polls use Cloudflare Turnstile (**₹0 OTP cost**).

#### Illustrative Per-1,000-MAU Monthly Unit Economics (Phase 3 Steady State)
*Assumptions: 1,000 MAU = ~350 active trips/month (~300 domestic, ~50 outbound); 18% GST included in sticker prices (`₹49` → `₹41.53` ex-GST; `₹99` → `₹83.90` ex-GST; `₹499/yr` → `₹422.88` ex-GST); Razorpay standard fee `2% + 18% GST = 2.36%` of gross ticket (`₹1.16` on `₹49`, `₹2.34` on `₹99`, `₹11.78` on `₹499`).*

| Line Item | Volume / Assumption per 1,000 MAU / Mo | Unit Net (INR) | Monthly Total (INR) |
|---|---|---|---|
| **Rev 1: Domestic Trip Pass (`₹49`)** | 4.5% MAU attach (45 passes) | `₹40.37` net (`₹41.53 − ₹1.16`) | **`₹1,817`** |
| **Rev 2: Outbound Trip Pass (`₹99`)** | 1.5% MAU attach (15 passes) | `₹81.56` net (`₹83.90 − ₹2.34`) | **`₹1,223`** |
| **Rev 3: Itinbee Pro (`₹499/yr`)** | 1.2% MAU active (12 users, amortized `/12`) | `₹34.26/mo` (`₹411.10/yr ÷ 12`) | **`₹411`** |
| **Rev 4: Outbound Affiliate Attach** | 10 users/mo (eSIM/forex/insurance/Klook) | `₹120` avg net commission | **`₹1,200`** |
| **Total Net Revenue / 1,000 MAU** | *Blended ₹4.65 net ARPU / MAU / mo* | — | **`₹4,651`** |
| **COGS 1: Render `singapore` Cluster + Mumbai S3 KMS** | Amortized Render Starter services + PostGIS + Redis + S3/R2 | Amortized cluster share | `(₹1,250)` |
| **COGS 2: Auth OTP & Utility WhatsApp** | 150 sandbox/vault OTPs + 600 Pass/Pro alerts (Turnstile polls = `₹0`) | `₹0.15` / msg (incl. GST+BSP) | `(₹113)` |
| **COGS 3: Vertex AI Gemini Flash & OCR** | ~240 fallback calls (`30%` of ~800 parses) | `₹0.12` / call | `(₹29)` |
| **COGS 4: B2B Rail/PNR & Flight Status API** | 72 paid trips × 6 polls = ~432 calls (IRCTC TIES/PSP + AeroDataBox) | `₹0.45` / blended poll | `(₹194)` |
| **COGS 5: Open POI Search Index** | Shared Photon / Overture search index share | Amortized index/RAM share | `(₹280)` |
| **Total Variable + Infra COGS** | — | — | **`(₹1,866)`** |
| **Contribution Margin / 1,000 MAU** | **Positive even excluding affiliates (`+₹1,585`)** | — | **`+₹2,785` (`59.9%`)** |

*Per-Pass Unit Check:* A single `₹49` Domestic Trip Pass nets `₹40.37` against `~₹4.50` in incremental WhatsApp alerts (`15`-alert cap × `₹0.15` = `₹2.25`), B2B rail/flight polling (`6`-poll cap ≈ `₹1.80`), and S3 storage (`~₹0.45`), yielding **`+₹35.87` (~89% incremental pass margin)**.

---

## 3. Risk Register & Concrete Mitigations

| Risk | Severity | Likelihood | Mitigation Strategy |
|---|---|---|---|
| **1. Render Cold Starts or Cross-Region DB Latency** | High | Medium | Never run production on Render Free tier (which sleeps after 15m and drops WebSockets every 5m); pin **all** Render services (`frontend`, `backend`, `db`, `kv`) to `singapore` on Starter+ plans and front `itinbee-frontend` with Cloudflare's Indian edge PoPs. |
| **2. WhatsApp Business API Conversation Costs Spike** | High | Medium | Use the WhatsApp bot strictly as a **user-initiated ingestion inbox** (24h customer service window) and push all viewing/voting onto `itinbee.com/t/<shortId>` SSR web links. |
| **3. OTA Super-App Feature Copy (MMT Myra / ixigo PLAN)** | High | High | OTAs are structurally conflicted from becoming neutral multi-platform vaults. Defend via **OTA-agnostic trust, UPI split ledger, offline PWA vault, and Elder Card simplicity**. |
| **4. LLM Hallucination on PNR / Flight / Train Times** | Critical | Medium | Run deterministic regex parsers for IRCTC/IndiGo/redBus first; enforce strict schema validation; flag any field `<0.85` confidence in amber alongside the original PDF thumbnail. |
| **5. IRCTC / Airline Email Drift & Reel Scraping Blocks** | Medium | High | Versioned CI regression corpus of anonymized Indian tickets; zero IRCTC or IG/YT video scraping (use **IRCTC-authorized TIES/PSP B2B APIs** for paid alerts and **oEmbed + captions/screenshots + YT transcripts** for Reels). |
| **6. Map/POI Licensing & DPDPA 2023 Vault Security** | Critical | Low | Open MapLibre + Protomaps + Overture/Foursquare OS/Photon POIs (zero Google Places API mixing); **AWS S3 `ap-south-1` (Mumbai)** KMS encryption + WebCrypto AES-GCM offline wrapping + Aadhaar last-4 masking + default public redaction. |

---

## 4. Go-To-Market (GTM) Launch Loop

1. **WhatsApp K-Factor Engine:** Every shared itinerary footer and Elder Card carries *"Organised on Itinbee 🐝 — Plan your free trip in 30s"*, plus 1-click **"Clone this itinerary"** on public SEO guides.
2. **Programmatic SEO & AI Discoverability:** Publish 200+ curated Indian & outbound templates under `/guides/*` and `sitemap-trips.xml` alongside live `/llms.txt` and `robots.txt` AI-crawler access.
3. **Creator Reel Partnerships:** Equip 50 micro/mid-tier Indian travel creators (Spiti, Goa, Vietnam, Thailand, Spiritual circuits) with affiliate-enabled Itinbee template links inside their Instagram Reel & YouTube descriptions.
