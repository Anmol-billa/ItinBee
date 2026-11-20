# Plan 04 — Detailed Step-by-Step Execution Plan (Render Multi-Service + Impeccable UI)

**Parent Blueprint:** [`BLUEPRINT.md`](./BLUEPRINT.md) · **Product Context:** [`../PRODUCT.md`](../PRODUCT.md) · **Workflow Config:** [`../.impeccable/config.json`](../.impeccable/config.json)  
**Purpose:** Concrete, dependency-ordered engineering and design execution runbook for building and shipping **Itinbee** (`itinbee.com`) across standalone `frontend/` and `backend/` folders on Render (`singapore` region).

---

## Execution Dependency Graph

```text
[Stage 0: Pre-Flight DNS, Cloudflare, Mumbai S3 KMS & Repo Scaffold]
       │
       ├──────────────────────────────────────────────────────┐
       ▼                                                      ▼
[Stage 1: Impeccable World Roll & Surface Contracts]   [Stage 2: backend/ Core, PostGIS & OpenAPI]
       │                                                      │
       │                                                      ▼
       │                                               [Stage 3: backend/ HLC Sync, Open POIs & Indian Parsers]
       │                                                      │
       └──────────────────────────┬───────────────────────────┘
                                  ▼
         [Stage 4: frontend/ Shell, OpenAPI Types & Offline IndexedDB Engine]
                                  │
                                  ▼
         [Stage 5: Impeccable UI Build (/ Sandbox, /trip/[id], /t/[shortId] & Elder Card)]
                                  │
                                  ▼
         [Stage 6: Unlimited UPI Ledger, Kitty Pools & Zero-OTP Turnstile Polls]
                                  │
                                  ▼
         [Stage 7: Impeccable Finish Review (first-viewport + detect + finish-reviewer + DESIGN.md)]
                                  │
                                  ▼
         [Stage 8: Render singapore Blueprint Provisioning, Cloudflare Cutover & Smoke Gates]
```

---

## Stage 0 — Pre-Flight Infrastructure, Domain Lock & Repo Root Setup (Days 1–2)

### Tasks
1. **Domain & Brand Asset Lock:**
   * Register `itinbee.com`, `itinbee.in`, `itinbee.co.in`, and `itinbee.app`; run IP India Trademark Public Search across Classes 9, 39, and 42.
   * Add `itinbee.com` to Cloudflare DNS: configure Page/Redirect Rule `https://www.itinbee.com/*` → `301` `https://itinbee.com/$1` (eliminating Wayplot's `www.` `NXDOMAIN` defect).
2. **External Storage, Turnstile & Mumbai Residency Resources:**
   * **Cloudflare R2:** Create non-PII bucket `itinbee-public-tiles` for Protomaps `.pmtiles` regional extracts (India + SE Asia/UAE) and public template covers with `Range`-header CORS enabled for `https://itinbee.com`.
   * **Cloudflare Turnstile & Email Routing:** Create Turnstile site/secret keys for zero-OTP poll voting; configure Email Worker forwarding `trips@itinbee.com` raw MIME streams over TLS to `https://api.itinbee.com/v1/webhooks/inbound-email`.
   * **AWS `ap-south-1` (Mumbai):** Create private bucket `itinbee-vault-ap-south-1` (block all public ACLs) and symmetric KMS key `alias/itinbee-vault-master` for envelope encryption of booking PDFs and masked IDs.
   * **GCP `asia-south1` (Mumbai):** Enable Vertex AI Gemini Flash endpoint with Zero Data Retention (ZDR) for Stage-3 parser fallback.
3. **Repository Root & Local Dev Parity (`/`):**
   * Author `.gitignore` (ignoring `node_modules/`, `.next/`, `dist/`, `.env*`, `.impeccable/config.local.json`, while explicitly tracking `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`, `.impeccable/surfaces/`, `.impeccable/design.json`, `.impeccable/live/config.json`, and `.impeccable/critique/ignore.md`).
   * Author `docker-compose.dev.yml` spinning up local `postgis/postgis:16-3.4` (`5432`) and `valkey/valkey:7.2` (`6379`) so `frontend/` and `backend/` run identically locally before touching Render.
   * Author root `render.yaml` Blueprint declaring `itinbee-db` (`basic-256mb`), `itinbee-kv` (`starter`, `noeviction`), `itinbee-backend` (`rootDir: backend`, `starter`), and `itinbee-frontend` (`rootDir: frontend`, `starter`)—all pinned to `region: singapore`.

### Stage 0 Exit Gate
* `docker compose -f docker-compose.dev.yml up -d` passes health checks for PostGIS and Redis; `render.yaml` validates cleanly against Render's Blueprint schema; zero cross-folder workspaces exist at root (`frontend/` and `backend/` remain 100% standalone).

---

## Stage 1 — Impeccable Visual World Workshop & Surface Contracts (Days 3–4, Pre-Frontend Code)

Per Impeccable's workflow (`new-work.md` & `new-work-world.md`), **zero frontend component code is written until the visual world and surface contracts are locked**.

### Tasks
1. **Run `concept-seed` & Resolve Visual World:**
   * Derive 7 culturally grounded visual directions spanning at least 3 distinct material families from the Indian traveller's real world (e.g., Indian Railways reservation timetable typography & Konkan/Himalayan cartographic route boards, brass/enamel travel tokens & dockets, vernacular highway milestone signage, modern architectural travel journals—avoiding AI SaaS clichés and literal honeycomb-wallpaper overload).
   * Execute `/Users/anmolbilla/.gemini/config/skills/impeccable/scripts/impeccable concept-seed --scope direction --mode persuade` (for `/`) and `--mode operate` (for `/trip/[id]`).
   * Fuse and weigh dealt catalog challengers on audience identification and product clarity, present the raised lead + alternates to the founder, and lock the winning direction.
2. **Persist 6-Block Surface Direction Contracts (`.impeccable/surfaces/`):**
   * Write and verify surface briefs via `impeccable surface-brief write` for:
     * `frontend/src/app/page.tsx` (`Persuade` → `Operate`: Live Zero-Signup Sandbox Workbench in the first viewport).
     * `frontend/src/app/trip/[id]/page.tsx` (`Operate`: Split Map + *Multi-Modal Transit Spine* Workbench).
     * `frontend/src/app/t/[shortId]/page.tsx` (`Read` + Light `Operate`: `<150KB` WhatsApp Guest Share & `A / अ` *Family / Elder Card*).
   * Confirm every surface brief carries `THESIS`, `OWN-WORLD`, `STORY`, `FIRST VIEWPORT`, `FORM` (with `seed:` reference), and verbatim `FINISH` condition, and verify typography avoids Impeccable's overused default font list (`Inter`, `Plus Jakarta Sans`, `DM Sans`, `Outfit`, `Space Grotesk`, `Fraunces`, `Playfair Display`, etc.) while supporting crisp Latin + Devanagari (`हिन्दी`) pairing.
3. **Author Bespoke Scout Bee Vector Grammar Specs:**
   * Define the 4 earned states of the **Scout Bee** (`Header Flight-Loop Glyph`, `Scout Ingestion Dropzone`, `Hive Offline Synced Pill`, `Empty Shortlist / All-Settled Vignette`) as two-tone line + hatch `SVG` primitives.

### Stage 1 Exit Gate
* `impeccable surface-brief read` returns verified 6-block contracts for all three primary routes before a single line of JSX/CSS is authored.

---

## Stage 2 — Standalone Backend Core, PostGIS Schema & OpenAPI Contract (`backend/`, Days 5–10)

*(Can execute in parallel with Stage 1.)*

### Tasks
1. **Scaffold `backend/` Standalone Service:**
   * Initialize `backend/package.json` (`fastify`, `@fastify/cors`, `@fastify/cookie`, `@fastify/websocket`, `@fastify/swagger`, `fastify-type-provider-zod`, `zod`, `pg`, `ioredis`, `bullmq`, `@aws-sdk/client-s3`, `@aws-sdk/client-kms`, `vitest`, `tsx`).
   * Configure `GET /health` returning DB + Redis readiness and `npm run generate:openapi` emitting `backend/openapi.json` without needing external network access.
2. **Author & Test SQL Migrations (`backend/migrations/`):**
   * `001_extensions.sql`: `CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgcrypto;`
   * `002_users_and_trips.sql`: `users` (KMS-encrypted `phone_enc`, `email_enc`, `upi_vpa_enc`), `trips` (`short_id`, `latest_seq`, `elder_mode_enabled`), `trip_members`, `share_tokens` (`redact_pii default true`).
   * `003_days_and_items.sql`: `trip_days` (`deleted_at`), `itinerary_items` (`GEOGRAPHY(Point, 4326)` GIST index, `(trip_id, day_id, sort_key, id)` composite index, `dietary_flags`, `accessibility_notes`, `elder_summary_i18n`).
   * `004_bookings_and_vault.sql`: `bookings` (`pnr_enc`, `pnr_last3`, `passenger_meta_enc`, `raw_doc_s3_key`, `parser_confidence`).
   * `005_polls_kitty_expenses.sql`: `polls`, `poll_votes` (Turnstile `guest_session_hash` partial unique index), `kitty_pools`, and immutable append-only `expenses` (`client_op_id`, `entry_type`, `reverses_expense_id`).
3. **Implement Core Auth, Sandbox Claim & Redacted Guest Endpoints:**
   * `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/google`.
   * `POST /v1/trips/claim-sandbox` (atomically imports client `IndexedDB` trip, days, and stops under the newly authenticated user).
   * `GET /v1/t/:shortId` (ultra-fast single-query projection stripping `pnr_enc`, `raw_doc_s3_key`, and co-traveller PII, returning only `pnr_last3` `••••••842` in `<20ms`).

### Stage 2 Exit Gate
* `(cd backend && npm ci && npm run build && npm test)` passes 100%; `backend/openapi.json` generates cleanly; security integration test proves `GET /v1/t/:shortId` never leaks full PNRs, S3 keys, or unmasked IDs.

---

## Stage 3 — Delta-Sync Engine, Open POI Index & Hybrid Indian Ticket Parsers (`backend/`, Days 11–17)

### Tasks
1. **HLC Delta-Sync & Realtime WebSocket Rooms (`backend/src/modules/sync/`):**
   * Implement `POST /v1/trips/:id/sync`: processes batched client operations (`client_op_id` idempotency), assigns monotonic `server_seq`, enforces fractional `sort_key` + `(sort_key, id)` tie-break, and applies the **orphan-to-shortlist rule** (`day_id = NULL, is_shortlist = true`) whenever an item targets a tombstoned day (`deleted_at IS NOT NULL`).
   * Implement `WSS /v1/trips/:id/live` bridged over `itinbee-kv` Redis Pub/Sub so co-editors across multiple Render backend instances receive live stop moves, poll votes, and expense entries.
2. **3-Stage Indian Booking & Social Ingestion Pipeline (`backend/src/modules/ingest/`):**
   * Wire inline BullMQ worker (`RUN_INLINE_WORKER=true` in `server.ts`, plus standalone `src/worker-entry.ts` for future dedicated Render `type: worker` scaling).
   * **Stage 1:** `pdf-parse` text extractor, image OCR preprocessor with **mandatory regex masking of first 8 digits of any 12-digit Aadhaar pattern**, and official Instagram/YouTube oEmbed + transcript fetcher.
   * **Stage 2 ($0 LLM Deterministic Parsers):** Build tested parsers for **IRCTC** (10-digit PNR, train no/name, coach/berth, CNF/RAC/WL, dep/arr), **IndiGo / Air India / Akasa** (6-char PNR, flight no, terminal, baggage), **redBus / AbhiBus** (TIN, operator, boarding landmark, seat), and **MMT / Goibibo / Airbnb** confirmations.
   * **Stage 3 (Mumbai Vertex AI Fallback):** Structured JSON-schema call to GCP Vertex AI `asia-south1` Gemini Flash when Stage-2 confidence `< 1.0`, emitting per-field confidence (`0.0–1.0`).
   * **KMS Vault Module:** Per-trip DEK envelope encryption uploading compressed PDFs/images strictly to `itinbee-vault-ap-south-1` (`50MB/trip` free quota enforcement).
3. **Open POI Search & India Transit Calibration (`backend/src/modules/geo/`):**
   * Expose `GET /v1/places/search` backed by Redis-cached open POI datasets (`Overture Maps Places` + `Foursquare OS Places` + self-hosted `OSM Photon` + `Wikidata`—zero Google Places API calls) and `IndiaTransitEstimator` (`18 km/h` metro peak, `1.9×` distance @ `22 km/h` mountain switchback factor).

### Stage 3 Exit Gate
* `>=90%` field-level extraction accuracy across a 30-fixture anonymized Indian ticket corpus (IRCTC, IndiGo, Air India, redBus, MMT); 50-client concurrent offline sync fuzz test converges identically with zero lost stops.

---

## Stage 4 — Standalone Frontend Shell, Contract Sync & Offline PWA Engine (`frontend/`, Days 18–22)

### Tasks
1. **Scaffold `frontend/` Standalone Service:**
   * Initialize `frontend/package.json` (`next`, `react`, `react-dom`, `tailwindcss`, `dexie`, `@serwist/next`, `maplibre-gl`, `pmtiles`, `qrcode`, `jspdf`, `openapi-typescript`, `vitest`, `@playwright/test`).
   * Add `npm run sync:api-types` (`openapi-typescript ../backend/openapi.json -o src/lib/api-schema.d.ts`) and commit the generated `.d.ts` so `itinbee-frontend` builds completely standalone inside `rootDir: frontend` on Render.
2. **Dual-Network Fetch Layer & Offline `IndexedDB` Engine (`frontend/src/lib/`):**
   * Configure server-component fetcher routing SSR calls (`GET /v1/t/:shortId`) through `http://${process.env.INTERNAL_API_URL}` (`<2ms` Render `singapore` private network) and browser mutations/WSS through `process.env.NEXT_PUBLIC_API_URL`.
   * Build `offline-db.ts` (`Dexie.js`): stores sandbox & synced trips, days, fractional-indexed items, outbox mutations (`client_op_id`, HLC clock), and WebCrypto `AES-GCM` wrapped ticket blobs, plus client-side canvas/PDF compression rejecting or downsampling `>10MB` camera scans prior to upload.
   * Configure Service Worker (`@serwist/next`) caching static route shells and opted-in regional `.pmtiles` byte-ranges.
3. **Curated Sample Routes & SEO/AI Discovery Endpoints:**
   * Author 4 rich, realistic sample datasets in `frontend/src/data/sample-trips.ts` (*Rishikesh–Landour 4D*, *South Goa Monsoon Crew 5D*, *Varanasi–Ayodhya Senior Yatra 3D*, *Vietnam 7D from Bengaluru*), explicitly badged *Sample Itinerary*.
   * Add live `HTTP 200` `/llms.txt`, `/robots.txt`, `manifest.webmanifest`, and dynamic `sitemap-trips.xml`.

### Stage 4 Exit Gate
* `(cd frontend && npm ci && npm run build)` succeeds with zero external path imports; offline airplane-mode Playwright test confirms creating, reordering, and reloading a sandbox trip persists 100% in `IndexedDB`.

---

## Stage 5 — Impeccable UI Implementation Across All 3 Surfaces (`frontend/`, Days 23–31)

Built strictly against Stage 1's locked `.impeccable/surfaces/` Direction Contracts:

### Tasks
1. **Surface A — `/` Home & Live Zero-Signup Sandbox (`Persuade` → `Operate`):**
   * Implement the first-viewport live Sandbox Workbench (refusing generic SaaS hero chrome): top route switcher (*Rishikesh–Landour*, *South Goa*, *Varanasi Darshan*, *Vietnam 7D*, *+ Blank Trip*), interactive day timeline + synchronized lazy MapLibre preview, **Scout Bee Universal Dropzone** (drop IRCTC/flight PDF or paste Reel/YouTube link), and 1-tap **Share to WhatsApp** claim flow.
   * Below the fold: cloneable Indian & outbound corridor blueprints (`/guides/[slug]`) with real route topology and calibrated travel durations.
2. **Surface B — `/trip/[id]` Collaborative Trip Workspace (`Operate`):**
   * Implement desktop Split-Screen + mobile thumb-zone **Bottom-Sheet Map / Timeline Switcher** (`>=44×44px` touch targets, full keyboard reordering).
   * Build the `Operate` signature move: **The Multi-Modal Transit Spine**—connecting stops with calibrated rail/flight/bus/hill-cab connectors (`IRCTC CNF B2-34`, `Mountain Cab 1.9× · 2h 30m`), nightfall/layover advisories, amber `<0.85` parser-confidence verification pills, and 1-tap outbound Google Maps (`api=1`) navigation handoff + visible `© OpenStreetMap contributors` attribution.
   * Build the bespoke two-tone `SVG` **Scout Bee** micro-states (header flight-loop mark, ingestion dropzone progress flight line, *"Hive synced · Ready offline"* pill, and empty shortlist vignette).
3. **Surface C — `/t/[shortId]` WhatsApp Guest Share & Elder Card (`Read` + Light `Operate`):**
   * Enforce strict `<150KB` initial SSR HTML + CSS + static SVG route strip; wrap `LazyMapLibreCanvas` in `next/dynamic({ ssr: false })` triggered only on tapping *"Interactive Map"*.
   * Generate dynamic WhatsApp OpenGraph metadata (`og:title`, `og:description`, route summary image).
   * Build the 1-tap **`Itinerary & Polls` ↔ `Family / Elder Card (A / अ)`** toggle: renders `>=18px` daylight-high-contrast (`WCAG 2.2 AA+`) bilingual (`English` / `हिन्दी`) cards with pure-veg/Jain badges, stair/lift/darshan notes, local-script stay address card for cab/auto drivers, masked PNRs (`••••••842`), 1-tap WhatsApp text digest copy, and client-side QR-linked A4 PDF export (`qrcode` + `jspdf` pointing to `https://itinbee.com/t/<shortId>`).

### Stage 5 Exit Gate
* Automated bundle-budget check proves `/t/[shortId]` initial gzipped transfer `<150KB` with zero `maplibre-gl` chunks loaded before interaction; Devanagari line-height and `WCAG 2.2 AA` contrast verified across both modes.

---

## Stage 6 — Unlimited UPI Expense Ledger, Kitty Pools & Zero-OTP Polls (Days 32–36)

### Tasks
1. **Zero-OTP Group Polls (`backend/` + `frontend/`):**
   * Implement Shortlist Idea Cards + 2–4 option stay/date/activity polls inside `/trip/[id]` and `/t/[shortId]`.
   * Gate guest votes on `/t/[shortId]` behind **Cloudflare Turnstile + Guest Display Name** (or Google One-Tap) with signed HTTP-only voter session cookies (`₹0` SMS/WhatsApp OTP cost).
2. **Indian Group Expense Ledger & `upi://pay` Settlement:**
   * Build inline expense logger supporting *Equal*, *Exact*, *Shares*, **1-tap Dietary/Alcohol Tag Exclusions** (*"Exclude vegetarians / non-drinkers"*), **Car Fuel & FASTag Pool**, **Upfront Trip Kitty Pool**, and cached Frankfurter multi-currency FX (`THB`, `VND`, `AED`, `JPY`, `EUR`, `USD` → `INR`).
   * Implement min-cash-flow debt simplification (`GET /v1/trips/:id/settlements`) and dual-mode UPI settlement cards:
     * `<=₹2,000`: 1-tap `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=Itinbee+<shortId>` intent button + dynamic scannable UPI QR.
     * `>₹2,000` or iOS/restricted WebViews: primary **1-tap Copy UPI ID + Exact Amount** button + dynamic QR + *"Mark as Settled (UTR/Ref)"* compensating ledger entry.

### Stage 6 Exit Gate
* Unit and E2E tests pass across unequal dietary splits, kitty deductions, compensating offline adjustments, and `<=₹2,000` vs. `>₹2,000` UPI URI generation.

---

## Stage 7 — Impeccable Finish Review & `DESIGN.md` Documentation Gate (Days 37–39)

Per Impeccable's `FINISH` contract (`new-work.md` §7), **unreviewed and undocumented UI is unfinished**.

### Tasks
1. **Automated Viewport Capture & Anti-Slop Detector:**
   * Run `/Users/anmolbilla/.gemini/config/skills/impeccable/scripts/impeccable first-viewport` across `/`, `/trip/[id]`, and `/t/[shortId]` at desktop (`1440×900`), mobile (`390×844`), and WhatsApp WebView (`360×740`), settling entrance animations first and validating every screenshot in `.impeccable/review/`.
   * Drive interactive states (Scout dropzone active, amber confidence review, Elder Card `हिन्दी` toggle, UPI settle sheet, offline banner, overlong Indian place/train names) to confirm zero clipping or overlap.
   * Run `/Users/anmolbilla/.gemini/config/skills/impeccable/scripts/impeccable detect --json` across `frontend/src/` and fix mechanical findings in one batch.
2. **Independent `impeccable-finish-reviewer` & `impeccable-documenter`:**
   * Spawn a fresh `impeccable-finish-reviewer` subagent (zero inherited build-thread bias) with `PRODUCT.md`, `.impeccable/surfaces/` contracts, and `.impeccable/review/` captures; resolve any `fix` batch and re-verify until `disposition: ship` is recorded.
   * Spawn `impeccable-documenter` to generate token-bearing **`DESIGN.md`** and **`.impeccable/design.json`** from the shipped frontend system and commit them to Git.

### Stage 7 Exit Gate
* `impeccable-finish-reviewer` returns `ship`; `DESIGN.md` and `.impeccable/design.json` exist and pass `impeccable doctor`.

---

## Stage 8 — Render `singapore` Provisioning, Cloudflare Cutover & Launch Verification (Days 40–42)

### Tasks
1. **Render Blueprint Deployment (`singapore`):**
   * Connect repository in Render Dashboard → **New Blueprint Instance** reading root `render.yaml`.
   * Verify `itinbee-db`, `itinbee-kv`, `itinbee-backend`, and `itinbee-frontend` all provision inside `singapore`.
   * Run post-provision PostGIS + schema migration job against `itinbee-db` (`npm run migrate:deploy` inside `itinbee-backend`), confirming `SELECT PostGIS_Version();` succeeds.
   * Populate secret env groups on Render (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `KMS_KEY_ID`, `GOOGLE_VERTEX_CREDENTIALS`, `TURNSTILE_SECRET_KEY`, `JWT_SECRET`).
2. **Custom Domain, TLS & Scoped `buildFilter` Verification:**
   * Bind `itinbee.com` → `itinbee-frontend` and `api.itinbee.com` → `itinbee-backend`; verify Cloudflare `www.itinbee.com` → `301` `https://itinbee.com` and `HTTP 200` on `/llms.txt` and `/health`.
   * Test pushing a `frontend/`-only commit to confirm `itinbee-backend` skips rebuild (`buildFilter` working), and vice versa.
3. **End-to-End Production Smoke Suite (From Indian Network / Throttled 4G Profile):**
   * Measure `https://itinbee.com/t/<sampleShortId>` inside Android WhatsApp WebView: verify `<150KB` initial transfer, `<1.5s` FCP, `<5ms` internal `itinbee-frontend` → `itinbee-backend` SSR fetch, masked PNRs, working Turnstile poll vote, `A / अ` Elder Card switch, live WebSocket co-edit sync across two browsers, and encrypted PDF upload to `itinbee-vault-ap-south-1`.
