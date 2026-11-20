# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Separate Render services in standalone top-level folders — `frontend/` (Next.js App Router, TypeScript, Tailwind CSS, MapLibre GL JS, Dexie.js IndexedDB PWA) and `backend/` (Fastify, TypeScript, PostgreSQL 16 + PostGIS, Render Key Value / Redis + BullMQ), provisioned together via a root `render.yaml` Blueprint in Render's `singapore` region.

## Users

- **Trip Architects (Lead Planners, ages 24–55):** Organising Indian domestic, hill-station, or multi-city family and friend trips across scattered bookings (IRCTC trains, IndiGo/Air India flights, redBus, and unbranded homestays) while fielding repetitive questions in WhatsApp groups.
- **Friend Crews & Unscripted Explorers (ages 20–35):** Turning shared Instagram Reels, YouTube Shorts, and links into a realistic day-by-day route, voting on stays/dates without forcing group members to sign up, and splitting unequal group expenses (veg vs. non-veg, alcohol, FASTag fuel, shared trip kitty) settled via UPI.
- **Multi-Generational & Pilgrimage Families (including 60+ Senior Travellers):** Needing a zero-login, high-legibility, read-only itinerary card or printable QR-linked PDF (with Hindi/Indic toggle, pure-veg/Jain notes, darshan slots, and accessibility/rest buffers) opened directly inside WhatsApp.
- **Tier-1/2/3 Indian Outbound Travellers:** Coordinating multi-currency INR-anchored budgets, offline tickets, e-visa deadlines, and corridor readiness checklists for Vietnam, Thailand, Malaysia, Japan, UAE, and Europe.

## Product Purpose

**Itinbee** turns chaotic WhatsApp travel threads, scattered Indian transport/stay tickets, and social inspiration links into one shared, offline-ready itinerary and group expense ledger. Success means a planner can draft a trip immediately with zero signup wall, share a sub-1.5s link into WhatsApp where any friend or elder relative can view or vote in one tap without creating an account, access critical tickets offline in low-signal zones, and settle group bills over UPI without daily entry caps.

## Positioning

An **OTA-agnostic, WhatsApp-native, offline-first trip workspace** built specifically around Indian multi-modal travel realities rather than closed booking carts or USD annual subscriptions:
- Combines **Wayplot-style instant zero-signup local sandbox** with seamless cloud sync and live shareable URLs (`itinbee.com/t/<shortId>`).
- Ingests fragmented **Indian bookings** (IRCTC PNRs/coach/berth, IndiGo/Air India, redBus, MakeMyTrip, homestay PDFs/screenshots via `trips@itinbee.com` or upload) alongside **Instagram Reel / YouTube oEmbed & caption stops**.
- Ships a dual **Builder View** and **Family / Elder Card View** (with automatic PNR/ID redaction on public links) plus **unlimited inline UPI expense splitting** (`upi://pay` deep links and dynamic QR/VPA copy fallbacks).

## Operating Context

- **Primary Distribution & Collaboration Loop:** Links are opened predominantly inside the **WhatsApp in-app browser (Android WebView and iOS Safari View Controller)** over variable Indian 4G/5G, rail Wi-Fi, or hill-station mobile networks (Himachal, Uttarakhand, Ladakh, Northeast, Konkan).
- **Offline Dead Zones & Roaming:** Users actively check itineraries, boarding details, homestay pins, and log group expenses with intermittent or zero connectivity via PWA Service Worker + `IndexedDB` delta-sync.
- **Real Artefacts Handled:** 10-digit IRCTC PNRs (CNF/RAC/WL, coach/berth), 6-character airline PNRs, redBus boarding points, masked Aadhaar (last-4 only) / passport expiry metadata, multi-currency expenses anchored to INR (`₹`), and UPI VPAs.

## Capabilities and Constraints

- **Separate Service Topology on Render:** Repository strictly separates `frontend/` (Next.js SSR/PWA web service) and `backend/` (Fastify API, WebSockets, and BullMQ background worker) as independent Render services in the `singapore` region (`~35–55ms` RTT from India), backed by Render Managed PostgreSQL (`postgis` extension) and Render Key Value (`redis`).
- **Performance Budget:** Public share routes (`/t/[shortId]`) must ship `<150KB` initial SSR payload for `<1.5s` First Contentful Paint on 4G, lazy-loading interactive `MapLibre GL` + `Protomaps (.pmtiles)` vector tiles only when the user opens the live map.
- **Open-Data Geospatial ToS Compliance:** Zero Google Places API data rendered on MapLibre or cached in PostGIS; uses `MapLibre GL` + `Protomaps` (`© OpenStreetMap contributors`) + open POI datasets (`Overture Maps Places`, `Foursquare OS Places`, `OSM Photon`, `Wikidata`), handing off turn-by-turn navigation via zero-key outbound Google Maps Universal URLs (`api=1`).
- **Privacy & Regulatory Guardrails (DPDPA 2023):** Public share links enforce `redact_pii = true` by default (masking PNRs to last 3 chars); Aadhaar numbers mask first 8 digits on extraction; zero automated scraping of IRCTC or social video streams; encrypted PII document blobs use envelope encryption (AWS S3 `ap-south-1` Mumbai KMS recommended if strict domestic ID vault residency is enabled alongside Render `singapore` compute).
- **Monetization Model (Planned, Undecided Launch Timing):** Core itinerary creation, WhatsApp guest viewing/Turnstile polls, offline PWA sync, and unlimited UPI ledger remain `₹0` free; paid tiers planned as INR Trip Passes (`₹49` Domestic / `₹99` Outbound, group-shared) and `₹399–₹499/yr` Pro plus contextual outbound affiliate cards.

## Brand Commitments

- **Product Name & Domains:** **Itinbee** (`itinbee.com`, with `itinbee.in`, `itinbee.co.in`, and `itinbee.app` verified unregistered as of `2026-11-20T05:30Z`; internal repo directory remains `/Users/anmolbilla/TripSeam`).
- **Mascot Commitment:** Features a **bee mascot** representing industrious, low-stress trip coordination (gathering scattered tickets/stops into one organised hive/plan without feeling childish or gamified).
- **Competitor Product Benchmarks Referenced by Founder:**
  - *Wayplot (`wayplot.com`):* Instant zero-signup local-first sandbox and clean printable QR-linked PDF (while fixing its 3-city cap and lack of live URLs).
  - *Wanderlog & Stippl:* Split-screen map + day-by-day drag-and-drop timeline, inline expense ledger, and public cloneable itinerary templates.
  - *Pilot:* Lightweight group voting and consensus without paywalling core co-planning.
  - *TripIt & Mindtrip:* Automated email/PDF confirmation parsing and social-link-to-map-pin capture.
  - *Tripsy & Polarsteps:* High-craft chronological clarity and effortless offline reliability.

## Evidence on Hand

- Market, competitor, naming, and architecture research in `/Users/anmolbilla/TripSeam`:
  - `01_india_market_analysis.md` (46 live-verified Indian travel market & competitor sources)
  - `02_international_competitor_analysis.md` (live technical & UX teardown of Wayplot + 9 global peers)
  - `03_naming_analysis.md` (live RDAP/WHOIS/DNS naming audit)
  - `plan/BLUEPRINT.md` and `plan/01..03` specifications
- **Explicit Absences (Must Not Fabricate):** No live users, testimonials, customer counts, App Store ratings, B2B airline/IRCTC partner contracts, or custom bee mascot illustration assets exist yet. Any sample trips (e.g., Goa, Rishikesh–Landour, Spiti, Vietnam) shown on landing or sandbox surfaces must be clearly presented as sample/template itineraries, never fake user testimonials or fabricated traction metrics.

## Product Principles

1. **Value Before Account:** Anyone can build a real itinerary in the browser sandbox or view/vote on a shared WhatsApp link in seconds before ever seeing a login prompt.
2. **Built for the Whole WhatsApp Group:** Every trip serves both the detail-oriented *Trip Architect* (Builder View) and the non-technical parent or friend opening a link on mobile data (Elder / Guest Card View).
3. **Offline & Network Honesty:** Assume flaky train/mountain signal and mid-range Android WebViews—local writes never block on the network, and public links paint fast before heavy maps hydrate.
4. **OTA-Neutral Utility:** Itinbee organises bookings from every rail, bus, airline, and homestay channel neutrally rather than pushing users into a single booking funnel.
5. **Deterministic First, AI Where Needed:** Structured Indian tickets parse deterministically and cheaply first; AI extraction flags low-confidence fields transparently for 1-tap human confirmation.

## Accessibility & Inclusion

- **Senior & Multi-Generational Readability:** Dedicated *Family / Elder Card* mode with generous typography (`>=18px` body), high-contrast daylight legibility (outdoor glare at stations/ghats/airports), zero-jargon hierarchy, and bilingual English + Hindi (`हिन्दी`) script support (`line-height` safe for Devanagari matras).
- **Touch & Motor Ergonomics:** Minimum `44×44px` tap targets on mobile web, keyboard-accessible timeline reordering alternatives alongside drag-and-drop, and `WCAG 2.2 AA` contrast across both Builder and Share surfaces.
