# R2 — International Competitor Analysis (Wayplot.com & Direct Platforms)

**Verification Date:** 2026-11-19 (`14:32Z`–`14:37Z` UTC)  
**Scope:** Deep technical and product inspection of **Wayplot.com**, plus **9 direct international itinerary competitors** (**Wanderlog, TripIt, Mindtrip, Polarsteps, Stippl, Pilot, Roadtrippers, Layla, Tripsy**) and the **Google Maps/Travel & Sabre TripCase** ecosystem baseline—covering **features**, **infrastructure**, and **market positioning**, alongside explicit **Adopt / Avoid / Localize** takeaways for **Itinbee** (`plan/BLUEPRINT.md`).

---

## 1. Deep-Dive: Wayplot.com (Live Inspection)

### 1.1 Observed Facts (DNS, HTTP, CSP, Assets & Runtime)

* **DNS & Edge Network (`dig` & `curl` on `2026-11-19T14:32:01Z`–`14:33:16Z`):**
  * `https://wayplot.com/` → `HTTP/2 200`, `server: cloudflare`, `cf-cache-status: DYNAMIC`, `cf-ray: a5cfec01fe61965d-MRS`, `cache-control: public, max-age=0, must-revalidate`, `x-frame-options: DENY`, `alt-svc: h3=":443"; ma=86400`.
  * `dig wayplot.com A` → `104.21.30.169`, `172.67.173.66` (Cloudflare Anycast).
  * `dig wayplot.com NS` → `lilyana.ns.cloudflare.com.`, `west.ns.cloudflare.com.`.
  * `dig wayplot.com MX` → `14 route3.mx.cloudflare.net.`, `75 route2.mx.cloudflare.net.`, `78 route1.mx.cloudflare.net.` (Cloudflare Email Routing).
  * `dig wayplot.com TXT` → `"google-site-verification=1t20pdLGsTuF2JoRneNLkROquk-iwu5LJVXOgSVCFeU"`, `"v=spf1 include:_spf.mx.cloudflare.net ~all"`.
  * **Missing `www.` DNS record:** `dig +short www.wayplot.com` returned empty; `curl https://www.wayplot.com` failed with `* Could not resolve host: www.wayplot.com`.
  * **Single Microservice (`geo.wayplot.com`):** `https://geo.wayplot.com/` returned `HTTP/2 302` → `/health`; `https://geo.wayplot.com/health` returned verbatim JSON:
    `{"status":"healthy","version":"1.0.0","environment":"production","timestamp":"2026-11-19T14:33:15.960Z","colo":"MRS","requestId":"e760d544-93b9-4fcd-b355-02a8926e173b"}` (Cloudflare Worker running at edge PoP `MRS`).
* **Site Inventory, `robots.txt` & `sitemap.xml`:**
  * `https://wayplot.com/robots.txt` declares `# Wayplot - Free Trip Planner / # Launched: January 2026`, explicitly permits AI crawlers (`GPTBot`, `ChatGPT-User`, `Google-Extended`, `Anthropic-AI`, `Claude-Web`, `PerplexityBot`, `Bytespider`, `CCBot`), and references `/llms.txt` and `/llms-full.txt`.
  * **Live HTTP status checks (`2026-11-19`):**
    * `HTTP 200`: `/`, `/how-it-works/`, `/privacy/`, `/cookies/`, `/accessibility/`, `/uae/`, `/uae/dubai/`, `/uae/abu-dhabi/`, `/greece/crete/`.
    * **`HTTP 404` (broken references):** `/llms.txt` and `/llms-full.txt` both return the custom 404 HTML page despite being listed in `robots.txt` and `sitemap.xml`.
  * Homepage verbatim positioning: *"190+ attractions across 3 destinations • New: Crete, Greece"*, *"100% Free | No Sign-up | Works Offline"*, *"Dubai, UAE (72 Places)"*, *"Crete, Greece (87 Places)"*, *"UAE: Dubai + Abu Dhabi (106 Places • 2 Cities)"*, *"Abu Dhabi (34 attractions)"*; Paris, Tokyo, and New York are marked *"Coming Soon"*.
* **Frontend Stack & Content Security Policy (`/uae/dubai/`):**
  * **CSP Header:** Allows scripts from `'self'`, `unpkg.com`, `cdnjs.cloudflare.com`, `www.googletagmanager.com`, `*.google-analytics.com`; map tiles/images from `*.basemaps.cartocdn.com`, `*.cartocdn.com`; network connections to `https://api.frankfurter.app`, `https://geo.wayplot.com`, `*.basemaps.cartocdn.com`.
  * **Loaded Client Libraries:**
    * `https://unpkg.com/react@18/umd/react.production.min.js` + `react-dom` (UMD CDN React 18)
    * `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` (Leaflet map + CARTO basemaps)
    * `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` (client-side PDF generation)
    * `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` (client-side QR generation)
    * Tailwind CSS (`/dist/output.css`), `/core/utils.js`, `/core/data-loader.js`, `/core/pdf-generator.js`, `/dist/js/components.js`, `/dist/js/app-core.js`, `/src/pwa-install.js`, and Cloudflare Web Analytics (`static.cloudflareinsights.com/beacon.min.js`).
  * **PWA Manifest (`/assets/favicon/site.webmanifest`):** `"name": "Wayplot - UAE Trip Planner"`, `"display": "standalone"`, `"related_applications": []` (no native iOS or Android apps).
* **Data Model, Travel Math, FX & Privacy:**
  * **Static JSON Architecture (`/core/data-loader.js`):** Fetches `destination.json`, `activities.json` (72 places in Dubai), and `bases.json` (18 hotel bases in Dubai) purely client-side.
  * **LocalStorage Persistence (`/privacy/` & `app-core.js`):** Privacy policy (updated Jan 2026; cites GDPR/CCPA/UAE PDPL) confirms itinerary keys (`${d}-hotel`, `${d}-travel-mode`, `${d}-favorites`, `${d}-plan-days`, `${d}-currency`) *"is stored only on your device and is not transmitted to our servers unless you explicitly choose to share it."*
  * **Travel Time Math (`/core/utils.js`):** Computes client-side `haversineDistance()` × `distanceMultiplier: 1.3` across `driving` (`30 km/h + 5m`), `transit` (`25 km/h + 10m walk`), and `walking` (`4.5 km/h`), with peak-hour multipliers (`7–10am: 1.4x`, `5–8pm: 1.5x`). Turn-by-turn routing delegates externally to `https://www.google.com/maps/dir/?api=1&...`.
  * **Currency Conversion:** Queries `https://api.frankfurter.app/latest` across 12 currencies (`AED, USD, EUR, GBP, INR, CNY, JPY, AUD, CAD, CHF, SGD, SEK`), explicitly including **`INR: { symbol: '₹', name: 'Indian Rupee' }`**.
  * **Geocoding & Maps Link Parsing:** `utils.js` references `// Address search (Mapbox)` and `// Location search (Geo Worker API)` via `geo.wayplot.com`, plus regex matching for Google Maps links (`maps.app.goo.gl`, `goo.gl/maps`, `google.com/maps`, `g.page/`).
  * **PDF-Only Sharing (`/core/pdf-generator.js` & FAQ):** Generates an A4 PDF with a QR code pointing to `config.pdf.qrUrl` (e.g., `https://wayplot.com/uae/dubai`—the generic destination root, **not** a serialized user itinerary) and calls `navigator.share({ files: [file] })`. The FAQ positions sharing as downloading a PDF to paste into ChatGPT, Claude, or Gemini. No live URL sharing, cloud sync, or group co-editing exists.

### 1.2 Bounded Inference on Wayplot's Architecture

* **What Observed Facts Prove:** Wayplot is deliberately built for **near-zero marginal infrastructure cost**—no user auth database, no Google Distance Matrix API per-pair billing, no LLM inference bill, and no app-store maintenance.
* **Resulting Structural Ceilings:**
  1. **Zero Collaborative / Link Sharing:** Because state resides solely in one device's `localStorage` and the PDF QR links only to a static city landing page, Wayplot cannot support multi-user group planning or WhatsApp co-editing.
  2. **Slow Destination Coverage:** Curating static JSON datasets limits Wayplot to 3 destinations 10 months after its Jan 2026 launch.
  3. **Brittle Indian/Asian Transit Math:** Straight-line `1.3× Haversine` math breaks down on mountain switchbacks (Himachal/Ladakh), expressways, ferries, and inter-city rail/bus corridors.

---

## 2. Direct International Competitors (9 Live-Verified Platforms + Ecosystem Baseline)

All DNS, HTTP header, and official pricing/platform checks below were executed live on `2026-11-19T14:33Z–14:37Z`.

### 2.1 Wanderlog (`https://wanderlog.com/`, Travelchime Inc.)
* **Infrastructure Signals:** IP `165.22.139.103`, `Server: nginx/1.24.0 (Ubuntu)`, `X-Powered-By: Express`; marketing stack combines Webflow + AWS CloudFront (`d3e54v103j8qbb.cloudfront.net`) + Azure CDN (`itin-compiled.azureedge.net/webflow/initWebflow.js`). Web, iOS, and Android apps; integrates Google Maps SDK. Detects Indian IP locale on `/pro`, suggesting `हिन्दी` (`বাংলা`, `ਪੰਜਾਬੀ` also listed).
* **Features & Positioning:** Map-first split-screen itinerary, real-time Google-Docs-style group co-editing, inline expense splitting, unlimited trips free. **Wanderlog Pro** (~$39.99/yr promo, $49.99/yr standard) paywalls **offline mobile access, route optimization, automatic Gmail inbox sync, Google Maps export, unlimited attachments, and unlimited AI**.

### 2.2 TripIt (`https://www.tripit.com/web`, SAP Concur)
* **Infrastructure Signals:** DNS CNAME `san-ipv6.tripit.com.edgekey.net.` → `e4512.dscb.akamaiedge.net.` (`23.10.224.90`, Akamai Edge); HTTP `server: envoy` → `nginx`; marketing site uses **Drupal** + TrustArc. Native iOS, Android, Web + SAP Concur TripLink REST APIs.
* **Features & Positioning:** Gold-standard automated email parsing (`plans@tripit.com` + Gmail/Outlook/Yahoo OAuth Inbox Sync), master chronological timeline, calendar sync, neighborhood safety scores, 3 docs/trip free. **TripIt Pro (`$49 PER YEAR` live-verified at `/web/pro/pricing`)** unlocks real-time flight/gate/baggage alerts, fare refund tracking, seat finder, terminal maps, 25 docs/trip, and passport renewal reminders (often bundled via corporate SAP Concur). Lacks AI discovery, map planning, and group expense splitting.

### 2.3 Mindtrip (`https://mindtrip.ai/`, Mindtrip, Inc.)
* **Infrastructure Signals:** Cloudflare (`104.20.36.96`, `172.66.151.234`, `cf-ray: ...-DEL`) → **Heroku** (`via: 2.0 heroku-router`) → **Next.js** (`x-powered-by: Next.js`, `/_next/static/chunks/...`). Privacy Policy updated **10 November 2026**. **Platform Gap:** Web + **iOS app only — NO official Android app**.
* **Features & Positioning:** Agentic conversational AI + interactive maps (11M+ POIs claimed), "Start Anywhere" ingestion (TikTok, YouTube, Instagram, Reddit, blogs), Mindtrip Flights & Stays via **Sabre Mosaic™** + **PayPal** agentic commerce + Priceline/Viator affiliates, B2B DMO/hotel embeds (*Mindtrip for Hotels*). Backed by Costanoa, Capital One Ventures, United Airlines Ventures, Amex Ventures, and Forerunner. Free consumer usage monetized via OTA/affiliate commerce and B2B SaaS.

### 2.4 Polarsteps (`https://www.polarsteps.com/`)
* **Infrastructure Signals:** Marketing built on **Framer** (`framerusercontent.com`); app backend runs on **AWS** (`34.250.124.102`, `108.132.185.14`, `108.133.0.221`) using Python **Uvicorn** (`server: uvicorn`) with `cdn.prod.polarsteps.com`. Uses **Mapbox Maps SDK & GL JS** (online/offline vector tiles), RudderStack, and Datadog.
* **Features & Positioning:** Claims *"23M+ travelers"* and *"4.7 (460K RATINGS)"*. Low-battery (<4%) automatic offline GPS tracker, AI/editor planner, intimate circle/friends/public sharing, Trip Reels. **100% free & ad-free**; monetizes primarily via **Travel Books** (printed photo books via Peecho). Built for *tracking and reliving* trips rather than granular pre-trip logistics or group bill splitting.

### 2.5 Stippl (`https://www.stippl.io/`)
* **Infrastructure Signals:** Cloudflare (`104.26.9.63`, `172.67.71.98`) → **Fly.io** (`via: 1.1 fly.io`, Amsterdam PoP `ams`). Vite/React SPA embedding **Google Maps JS API** (`places,geometry`), Fathom + Cloudflare Analytics. Programmatic SEO via `sitemap-trips-0.xml`..`sitemap-trips-2.xml` across 7 languages (`en, nl, de, fr, es, it, pt`).
* **Features & Positioning:** Claims *"1.5M+ travelers"*. Drag-and-drop multi-city route planner, AI itinerary builder, co-planning, packing lists, split-bill tracker, travel reels, eSIMs, and creator affiliate tools (Booking.com, GetYourGuide). **Free tier + Stippl Pro (~€4.99–€5/mo)** for unlimited AI plans, PDF export, calendar sync, email reservation forwarding, and CSV expense export.

### 2.6 Pilot (`https://www.pilotplans.com/`, `https://app.pilotplans.com`)
* **Infrastructure Signals:** Cloudflare (`104.26.14.145`, `104.26.15.145`, `172.67.71.186`), Webflow marketing, VWO A/B testing, and `https://mcp.pilotplans.com/webmcp.js` (WebMCP). Web, iOS, and Android apps.
* **Features & Positioning:** Social group trip workspace with **group voting**, threaded comments, notes, checklists, attachments, PDF export, AI builder, and 2M+ private hotel deals. Keeps core planner **100% free** ("everyday basics are not gated behind paywalls"); monetizes via hotel deals, "pay-what-you-want" business planning, and custom corporate retreats (~$49/person/night+).

### 2.7 Roadtrippers (`https://roadtrippers.com/`, `https://maps.roadtrippers.com`)
* **Infrastructure Signals:** Cloudflare (`141.193.213.11`, `104.26.3.251`) + **WP Engine** (WordPress + React `react-components.min.js`), OneTrust consent. Web, iOS, Android, and Apple CarPlay.
* **Features & Positioning:** Claims *"7M+ Points of Interest | 42M+ Trips Planned | 1M+ Downloads | 4.8 (60K+ Reviews)"*. **Roadtrippers Autopilot™** AI route planner, Campendium RV overlays, clearance/grade routing. Strict 4-tier paywall verified at `/membership/`:
  * **Free ($0/yr):** 1 saved trip, **max 3 stops/trip**.
  * **Basic ($35.99/yr or $11.99/mo):** 3 trips, 20 stops/trip.
  * **Pro ($49.99/yr or $16.99/mo):** 5 trips, 50 stops/trip.
  * **Premium ($59.99/yr or $19.99/mo):** Unlimited trips, 150 stops/trip, export, collaboration, navigation, offline maps.

### 2.8 Layla (`https://layla.ai/`)
* **Infrastructure Signals:** DNS `216.150.1.1` (Vercel Anycast); HTTP `server: Vercel`, `x-vercel-id: bom1::...` (Mumbai edge PoP), `HTTP/2 429` with `x-vercel-mitigated: challenge` (Vercel Bot Firewall).
* **Features & Positioning:** Berlin-based; merged with **Roam Around** (Feb 2024) and **acquired by Expedia Group on July 31, 2026** (verified via PhocusWire/Dealroom). Conversational AI + short-video inspiration + live flight/hotel pricing + optional human advisor handoff. Web, iOS, Android. Monetizes via Expedia OTA funnel + Layla Premium (~$49.99/yr or $9.99/mo).

### 2.9 Tripsy (`https://tripsy.app/`, `web.tripsy.app`, `tripsy.help`)
* **Infrastructure Signals:** Marketing on **Framer** (`server: Framer/3e471b4`); `web.tripsy.app` uses AWS ACM/CloudFront; `tripsy.help` behind Cloudflare. Footer exposes `Tripsy MCP` (`Claude, Cursor, Codex, ChatGPT, Grok Bot, Gemini, Raycast`) and importers (`Import from TripIt`, `Import from TripCase`).
* **Platform Gap (Live-Verified verbatim on `/android` & `/web`):** *"There's no native Android app yet. You can already view your Tripsy itineraries in a browser at my.tripsy.app. View online. Create and edit in the Tripsy app."* — **Apple-only (iOS/iPadOS/macOS/watchOS) for creation/editing; zero Android app.**
* **Features & Positioning (Verified at `/pro`):** Free tier includes unlimited trips, cloud sync, unlimited guests, and expense management. **Tripsy Pro** costs **$39/yr** ($19/yr 50%-off promo) or **$199 Lifetime** ($149 promo) for email forwarding (`Smart Import`), flight alerts, weather, and document insights.

### 2.10 Ecosystem Baseline (Google & Sabre TripCase)
* **Google Maps / Travel:** *Google Trips* app is retired; Gmail surfaces bookings into Calendar/Maps and Gemini "Ask Maps" adds conversational/Hindi search, but Google provides **no collaborative trip workspace**, and custom Google Maps routes cap at **9 stops**.
* **Sabre TripCase Retirement:** Retired **April 1, 2025** (user data deleted July 1, 2025), driving displaced users toward TripIt, Tripsy, and Wanderlog.

---

## 3. Side-by-Side Comparison Matrix

| Platform | Creation UX | Sharing & Collaboration | Mobile / Offline | Bookings / Parsing | Observed Infra & Tech Signals | Monetization & Price | Critical Gap for Indian Travellers |
|---|---|---|---|---|---|---|---|
| **Wayplot** (`wayplot.com`) | Drag-and-drop curated POIs + hotel base; Haversine time | **PDF + generic city QR only**; no live URL, no co-edit | PWA (`localStorage` offline); **no native apps** | None (manual Google Maps link for base) | Cloudflare CDN & Worker (`geo.wayplot.com`), React 18 UMD, Leaflet+CARTO, jsPDF, Frankfurter FX | **100% Free** | Only 3 destinations (Dubai/Abu Dhabi/Crete); no URL sharing or co-editing; no bookings/expenses |
| **Wanderlog** | Map-first split view + drag-and-drop + AI chat | Live link, real-time co-edit, expense split | Web, iOS, Android; **offline = Pro** | Gmail auto-scan (Pro), forwarding, Maps sync | Ubuntu nginx + Express; Webflow/CloudFront/Azure CDN; Google Maps SDK | Freemium; **Pro $39.99–$49.99/yr** | Offline, Gmail sync & route optimization paywalled in USD; weak IRCTC/redBus parsing |
| **TripIt** (SAP Concur) | Automated chronological timeline from email | View/calendar sync, shared trip feed; no voting | Web, iOS, Android; offline on mobile | `plans@` forwarding + OAuth Inbox Sync | Akamai Edge, Envoy/nginx, Drupal CMS, Concur REST APIs | Free; **Pro $49/yr** (or Concur bundle) | No discovery, no map builder, no group bill split, weak Indian bus/homestay support |
| **Mindtrip** | Conversational AI + TikTok/IG/YT link ingestion + map | Shareable trips & itineraries | Web + **iOS only (NO Android)** | Sabre Mosaic + PayPal + Priceline/Viator | Cloudflare → Heroku → Next.js; OpenAI multimodal; 11M+ POI DB | Free consumer; **OTA affiliate + B2B SaaS** | **No Android app**; Western OTA bias; blind spots for Indian rail/bus/seasonal travel |
| **Polarsteps** | Auto GPS route tracker + basic AI/step planner | Friends & family feed + Trip Reels | iOS, Android, Web viewer; **offline GPS** | Manual stays/transport; no email parser | Framer marketing; AWS + Python **Uvicorn** API; **Mapbox SDK/GL** | Free & ad-free; **Print Travel Books** (Peecho) | Built for *tracking/reliving*, weak pre-trip hourly logistics & group bill splitting |
| **Stippl** | Visual multi-city route + drag-and-drop + AI | Co-planning, packing lists, split bills, reels | Web, iOS, Android | Email forwarding (Pro), Booking/GYG/eSIM affiliates | Cloudflare → **Fly.io (ams)**; Vite/React SPA; **Google Maps JS API** | Freemium; **Pro ~€4.99–€5/mo** + affiliates | Euro pricing; PDF & email import paywalled; no UPI/WhatsApp-native guest flow |
| **Pilot** | Social workspace (notes, lists, AI builder, map) | Real-time co-edit, **group voting**, comments | Web, iOS, Android (offline sync) | Private group hotel rates (2M+ hotels); file/email parse | Cloudflare, Webflow, `webmcp.js` | Free core; **hotel deals & corporate retreats** | Western hotel-block focus; lacks India rail/bus/UPI expense ledger |
| **Roadtrippers** | Route corridor discovery + Autopilot™ AI | Co-edit & offline maps gated to **Premium** | Web, iOS, Android, CarPlay | Campground/RV booking (Campendium) | Cloudflare + **WP Engine** (WP+React) | 4-tier: Free (3 stops!) → **$59.99/yr Premium** | US/RV-centric; 3-stop free limit unusable; lacks non-car/rail/flight workflows |
| **Layla** (Expedia) | AI chat + creator short-video inspiration | Shareable AI itineraries; advisor handoff | Web, iOS, Android | Live Expedia/OTA flight & hotel booking | **Vercel** (`bom1` Mumbai PoP, bot firewall); LLM multi-agent | Free chat; **Expedia commissions + ~$49.99/yr** | Top-of-funnel OTA sales engine post-Expedia acquisition; weak post-booking utility |
| **Tripsy** | Polished calendar timeline + Smart Import | Guest sharing, calendar sync | **Apple-only edit** + view-only web (**NO Android**) | Email forward (`Smart Import`), TripIt/TripCase import | Framer marketing; AWS CloudFront/ACM (`web.tripsy.app`); Tripsy MCP | Free; **Pro $39/yr ($19 promo)** / $199 Life | **No Android app**, no web editing, no AI discovery or group expense splitting |

---

## 4. Strategic Takeaways for Itinbee (Adopt / Avoid / Localize)

1. **ADOPT (Proven Mechanics Worth Incorporating):**
   * *From Wayplot:* **Zero-signup instant sandbox** ("plan immediately, sign in only to sync/share"), **client-side local-first persistence**, **INR-ready multi-currency estimation**, and **QR-linked downloadable PDFs** (upgrading the QR to point to the *live trip URL* rather than a static city page).
   * *From Wanderlog & Stippl:* **Split-screen map + day-by-day drag-and-drop timeline**, **inline group expense tracking**, and **programmatic SEO public trip templates** (`sitemap` acquisition loop).
   * *From Pilot:* **Group voting & lightweight consensus** to resolve WhatsApp planning deadlocks without paywalling core collaboration.
   * *From TripIt & Mindtrip:* **Automated confirmation parsing** (email forwarding + PDF/screenshot upload) and **social-link ingestion** (Instagram Reels / YouTube Shorts → pinned itinerary stops).
   * *From Polarsteps:* **Low-friction offline caching** and clean, ad-free visual trip recaps.

2. **AVOID (Verified Competitor Traps):**
   * **Apple-Only Exclusion (Tripsy, Mindtrip mobile):** India requires **Android-first native + mobile-responsive SSR web** so any WhatsApp recipient can view and vote in one tap without installing an app.
   * **Wayplot's Static JSON & PDF-Only Dead End:** Without cloud-backed share URLs, custom place additions, and multi-user sync, users churn after a single PDF download.
   * **Roadtrippers' 3-Stop Free Cap & USD $49–$60/yr Paywalls:** Core trip creation, sharing, offline caching, and UPI splitting must remain free; monetize via contextual outbound/domestic affiliates and low-cost INR trip passes (₹49–₹99/trip or ₹399–₹499/yr Pro).
   * **Wayplot's Technical Hygiene Gaps:** Avoid broken `/llms.txt` 404s and missing `www.` DNS records; ship clean canonical redirects and live AI/SEO discovery endpoints.

3. **LOCALIZE (Unclaimed Indian White Space):**
   * **WhatsApp-Native Sharing & Zero-Login Guest Voting:** 1-tap WhatsApp OpenGraph preview cards, formatted WhatsApp text digests, and zero-login browser voting.
   * **Indian Multi-Modal Booking Ingestion:** Hybrid regex + LLM parsers tuned for **IRCTC (PNR/coach/berth)**, **redBus/AbhiBus**, **IndiGo/Air India/Akasa**, **MMT/Goibibo/Cleartrip/EaseMyTrip**, and **Zostel/Airbnb** PDFs, emails, and WhatsApp forwards.
   * **UPI-Native Expense Splitting:** Unlimited INR splits (including unequal dietary/alcohol rules, FASTag fuel pools, upfront kitties, and outbound FX) with 1-tap **`upi://pay`** deep-link settlement.
   * **India-Realistic Transit & Offline Resilience:** Multi-modal legs (Flight + Train + Bus + Cab/Ferry), calibrated Indian mountain/highway travel times (replacing naive 30 km/h Haversine), and full offline ticket/ID/visa vaulting for hill stations and international roaming zones.

---

## 5. Caveats & Independent Verification Method

* **Caveats:** Observations reflect live public pages, HTTP/DNS/CSP inspection, official pricing/help documentation, and corroborated industry reports as of `2026-11-19`; authenticated backend internals were not reverse-engineered. `layla.ai` returned `HTTP/2 429` (`x-vercel-mitigated: challenge`) to automated HTTP clients, so Layla's Expedia acquisition (July 31, 2026) and features were corroborated via Vercel Mumbai PoP (`bom1`) headers and PhocusWire/Dealroom reporting.
* **Verification Commands:**
  * Wayplot stack & endpoints: `curl -sI https://wayplot.com/ https://wayplot.com/uae/dubai/ && curl -sL https://geo.wayplot.com/health && dig +short www.wayplot.com`
  * Wayplot broken `/llms.txt`: `curl -s -o /dev/null -w "%{http_code}\n" https://wayplot.com/llms.txt` (`404`)
  * Competitor platform/pricing checks: `curl -sI https://mindtrip.ai/ https://www.stippl.io/ https://roadtrippers.com/ https://layla.ai/ https://tripsy.app/` and inspect `tripit.com/web/pro/pricing`, `roadtrippers.com/membership/`, `tripsy.app/pro`, `tripsy.app/android`, `tripsy.app/web`, `polarsteps.com`.
