# Plan 02 — Render Multi-Service Architecture (`frontend/` & `backend/`), Offline Sync & Data Model

**Parent Blueprint:** [`BLUEPRINT.md`](./BLUEPRINT.md) · **Product Context:** [`../PRODUCT.md`](../PRODUCT.md)  
**Architectural Goal:** Deliver sub-1.5s WhatsApp WebView performance across Indian 4G networks, zero-data-loss offline PWA editing in Ladakh/Spiti/trains, accurate Indian booking ingestion at minimal LLM cost, clean Render multi-service isolation (`frontend/` and `backend/`), and **DPDPA 2023** compliance.

---

## 1. Render Multi-Service Topology & Standalone Folder Decision

### 1.1 Why Separate Render Services (`frontend/` + `backend/`) Beat a Monolith
1. **WhatsApp `<1.5s` SSR Latency Protection:** Public share cards (`itinbee.com/t/<shortId>`) run on **`itinbee-frontend`** (`rootDir: frontend`), dedicating 100% of its Node event loop to `<150KB` SSR HTML/CSS rendering without ever stalling when users upload 10MB IRCTC/IndiGo PDFs or run OCR on **`itinbee-backend`** (`rootDir: backend`).
2. **Stateful WebSockets & Queue Isolation:** `itinbee-backend` (Fastify + `@fastify/websocket` + BullMQ) holds persistent co-editing WebSocket rooms and async ingestion workers cleanly, scaling independently of stateless SSR traffic.
3. **Zero-Downtime Scoped Deploys (`buildFilter`):** Commits inside `frontend/**` rebuild only `itinbee-frontend` (~90s) without dropping active WebSockets or interrupting BullMQ jobs on `itinbee-backend`, and each folder runs standard `npm ci && npm run build` with zero monorepo hoisting fragility.
4. **Type Safety Without Cross-Folder Build Coupling:** `backend/` auto-generates `openapi.json` from its Fastify + Zod schemas (`@fastify/swagger`), and `frontend/` runs `openapi-typescript` to generate zero-runtime-cost types (`frontend/src/lib/api-schema.d.ts`).

### 1.2 Stack & Regional Cloud Layout (`singapore` + Cloudflare India + Mumbai Vault)

| Layer | Selected Technology & Folder | Engineering & India Rationale |
|---|---|---|
| **Frontend Service (`itinbee-frontend`)** | **Next.js (App Router, React 19)** + TypeScript + Tailwind CSS (`rootDir: frontend`, Render Starter, `singapore`) | Ships `<150KB` initial SSR HTML/CSS + static route SVG for `<1.5s` Indian 4G FCP; lazy-loads `MapLibre GL` + `.pmtiles` on tap; calls Fastify over Render's private network (`http://itinbee-backend:10000`, `<2ms` RTT). |
| **Backend Service (`itinbee-backend`)** | **Fastify (Node.js 22 + TypeScript)** + `@fastify/websocket` + inline MVP BullMQ (`rootDir: backend`, Render Starter, `singapore`) | Warm 24/7 (avoiding Render Free tier's 15-min spin-down & 5-min WS disconnects); splits out a dedicated Render `type: worker` in Phase 2 via `render.yaml` with zero code rewrite. |
| **Primary Database (`itinbee-db`)** | **Render Managed PostgreSQL 16 + PostGIS** (`singapore`) | Co-located in `singapore` private network (`CREATE EXTENSION IF NOT EXISTS postgis;`); ACID ledger + `GEOGRAPHY(Point, 4326)` spatial queries. |
| **Cache, Queue & Pub/Sub (`itinbee-kv`)** | **Render Managed Key Value (Redis-compatible)** (`singapore`, `noeviction`) | Multi-instance WebSocket Pub/Sub, Turnstile rate limits, **hard per-trip `15`-alert / `6`-B2B-poll Trip Pass quotas**, FX & open-POI response cache, and BullMQ queues. |
| **Indian Edge CDN & Inbound Mail** | **Cloudflare DNS/CDN + R2 + Email Routing** (`itinbee.com`) | Mumbai/Chennai/Delhi PoPs cache static bundles, ISR guides, and non-PII **Protomaps `.pmtiles`** on R2; enforces `www.` → apex `301` redirect; streams `trips@itinbee.com` MIME payloads statelessly over TLS to `itinbee-backend`. |
| **DPDPA 2023 PII Vault & AI Residency** | **AWS S3 `ap-south-1` (Mumbai, SSE-KMS)** + **GCP Vertex AI `asia-south1` (Mumbai, ZDR)** | Keeps KMS-encrypted booking PDFs & masked IDs physically inside India (`ap-south-1`), pins Gemini Flash fallback to Mumbai (`asia-south1`, zero data retention), and serves open POIs without external Google Places API calls. |

---

## 2. Offline-First PWA Sync & Conflict Resolution

### 2.1 Local Storage Engine & Client Key Wrapping (`frontend/`)
* **PWA Storage:** **IndexedDB** (`Dexie.js`) + Workbox/Serwist Service Worker caching the app shell, active trip projections, map pins, expense ledger entries, regional `.pmtiles` slices, and unauthenticated Wayplot-style sandbox drafts.
* **Client Vault Encryption:** Compressed booking PDFs (`50MB/trip` free quota; client-side WebP/PDF downsampling for `>10MB` camera scans) fetched via short-lived pre-signed AWS S3 `ap-south-1` URLs can be cached offline wrapped with **WebCrypto `AES-GCM` (256-bit)** derived via `PBKDF2`/`HKDF` from a user vault PIN/passphrase. **Raw unmasked Aadhaar scans are never persisted in browser `IndexedDB`**, and Aadhaar numbers are masked to the last 4 digits on extraction. *(When optional native Android/iOS shells ship later, keys bind to Android Keystore / iOS Keychain biometrics.)*

### 2.2 Delta-Sync Protocol & Merge Rules (`POST /v1/trips/:id/sync`)
1. **Local-First Writes:** Every mutation (add stop, reorder day, log ₹420 chai expense, toggle checklist item) writes immediately to local `IndexedDB` with `client_op_id` (UUIDv7), `hlc_timestamp` (Hybrid Logical Clock), and `base_seq`.
2. **Batch Sync:** When connectivity resumes, the client pushes pending ops and pulls server ops where `server_seq > last_seen_seq`.
3. **Deterministic Conflict Resolution:**
   * **Timeline Ordering & Collision Tie-Break:** Fractional indexing (`sort_key` lexorank string) with deterministic **`(sort_key, id)`** tuple tie-breaking when two offline clients insert at the exact same slot.
   * **Tombstones & Orphan-to-Shortlist Rule:** `trip_days` and `itinerary_items` use `deleted_at (timestamptz nullable)` tombstones. If User A adds/moves an item into a `trip_day` deleted offline by User B (`deleted_at IS NOT NULL`), the sync resolver sets `day_id = NULL, is_shortlist = true`—preserving the stop in the *Shortlist Drawer* instead of dropping user data.
   * **Scalar Fields:** Field-level Last-Write-Wins (LWW) using monotonic `server_seq` (HLC tie-break).
   * **Financial Ledger (`expenses`):** **Append-only immutable ledger** keyed by `client_op_id`—offline edits write compensating entries (`entry_type = 'adjustment'`, `reverses_expense_id`) rather than overwriting payment history.

---

## 3. Hybrid Booking & Social Ingestion Pipeline (`backend/`)

```text
Inbound Input (Scout Dropzone PDF/Image / Forwarded Email trips@itinbee.com / WhatsApp Media / oEmbed Link)
       │
       ├──► [Stage 1: Source Classifier & Text Extractor]
       │      ├── Email HTML/Text -> strip signatures/CSS (stateless stream from Cloudflare -> itinbee-backend)
       │      ├── PDF -> pdf-parse text extraction (client-side WebP/PDF compression first)
       │      ├── Image/Screenshot -> OCR + mandatory Aadhaar first-8-digit redaction
       │      └── Social Links -> Official oEmbed + YouTube transcripts + user-shared captions (no video scraping)
       │
       ├──► [Stage 2: Deterministic Template & Regex Parsers ($0 LLM cost, ~70%+ volume)]
       │      ├── IRCTC e-Ticket / SMS (10-digit PNR, Train No, Coach/Berth, Quota, Dep/Arr)
       │      ├── IndiGo / Air India / Akasa Air / SpiceJet (6-char PNR, Flight No, Terminal)
       │      ├── redBus / AbhiBus (TIN/Ticket No, Operator, Boarding Point, Seat No)
       │      └── MMT / Goibibo / Cleartrip / EaseMyTrip / Airbnb / Zostel structured templates
       │      └──► Confidence == 1.0? -> Write Booking Entity & Emit Confirmation Card
       │
       ├──► [Stage 3: Structured LLM Fallback (GCP Vertex AI asia-south1 Mumbai — Gemini Flash, ZDR)]
       │      ├── Handles messy screenshots, local homestay WhatsApp chats, or oEmbed/transcript text
       │      ├── Strict JSON schema + field-level confidence score (`0.0–1.0`)
       │      └── Fields < 0.85 confidence highlighted in amber in UI for 1-tap human verification
       │
       └──► [Stage 4 (Trip Pass / Pro Only): Licensed B2B Transport Status Poller]
              ├── Rail PNR / Running Status: IRCTC-authorized TIES / Principal Service Provider B2B partner feed
              └── Flight Status: AviationStack / AeroDataBox (Redis-cached, T-24h/4h/1h)
```

---

## 4. Core Data Model & API Surface

### 4.1 Core PostgreSQL / PostGIS Entities (`itinbee-db`)

| Table | Key Columns & Types | Indexes & Encryption Boundaries |
|---|---|---|
| `users` | `id (uuid PK)`, `phone_hash (text nullable)`, `google_sub_hash (text nullable)`, `phone_enc (bytea nullable)`, `email_enc (bytea nullable)`, `display_name`, `preferred_lang (en/hi/ta/te/mr/...)`, `upi_vpa_enc (bytea)`, `tier (free/pro)`, `created_at` | Partial unique indexes `WHERE phone_hash IS NOT NULL` & `WHERE google_sub_hash IS NOT NULL`; PII (`phone_enc`, `email_enc`, `upi_vpa_enc`) envelope-encrypted via AWS KMS (`ap-south-1`) DEKs. |
| `trips` | `id (uuid PK)`, `short_id (varchar(12) unique)`, `title`, `destination_summary`, `start_date`, `end_date`, `home_currency (char(3) default 'INR')`, `is_public_template (bool)`, `elder_mode_enabled (bool)`, `latest_seq (bigint)` | `short_id` B-tree unique; `is_public_template` partial index for `sitemap-trips.xml`. |
| `trip_members` | `trip_id (uuid FK)`, `user_id (uuid FK)`, `role (owner/editor/contributor/viewer)`, `vault_access (bool)`, `dietary_tags (text[])`, `joined_at` | Composite PK `(trip_id, user_id)`. |
| `trip_days` | `id (uuid PK)`, `trip_id (uuid FK)`, `day_number (int)`, `date (date)`, `theme_title`, `pacing_level (relaxed/moderate/packed)`, `deleted_at (timestamptz nullable)` | Partial index `(trip_id, day_number) WHERE deleted_at IS NULL`. |
| `itinerary_items` | `id (uuid PK)`, `trip_id (uuid FK)`, `day_id (uuid FK nullable)`, `kind (stay/transit/activity/meal/note)`, `title`, `location GEOGRAPHY(Point, 4326)`, `place_ref_id`, `sort_key (text)`, `start_time`, `duration_mins`, `dietary_flags (text[])`, `accessibility_notes (text)`, `elder_summary_i18n (jsonb)`, `is_shortlist (bool)`, `deleted_at (timestamptz nullable)` | GIST spatial index on `location`; B-tree `(trip_id, day_id, sort_key, id)` for deterministic tie-break; tombstoned days orphan items to `is_shortlist = true`. |
| `bookings` | `id (uuid PK)`, `trip_id (uuid FK)`, `item_id (uuid FK)`, `provider (irctc/indigo/redbus/mmt/airbnb/manual)`, `pnr_enc (bytea)`, `pnr_last3 (char(3))`, `passenger_meta_enc (bytea)`, `status (confirmed/rac/wl/cancelled)`, `raw_doc_s3_key (text)`, `parser_confidence (real)`, `co_traveller_consent_at (timestamptz nullable)` | `pnr_enc` & `passenger_meta_enc` **KMS-encrypted**; raw docs stored in **AWS S3 `ap-south-1`**; public viewer APIs return only `pnr_last3` masked (`••••••842`). |
| `polls` & `poll_votes` | `polls(id, trip_id, question, options jsonb, closes_at)` \| `poll_votes(id, poll_id, voter_id uuid nullable, guest_session_hash text nullable, guest_display_name text, option_id, created_at)` | Zero-OTP Turnstile guest voters (`guest_session_hash`) or signed-in `voter_id`; partial unique indexes on `(poll_id, voter_id, option_id)` & `(poll_id, guest_session_hash, option_id)`. |
| `kitty_pools` | `id (uuid PK)`, `trip_id (uuid FK)`, `title (text)`, `custodian_id (uuid FK)`, `currency (char(3) default 'INR')`, `initial_contribution_minor (bigint)`, `status (open/settled)`, `created_at` | Index `(trip_id)` — backs upfront shared trip cash/UPI pools referenced by `expenses.kitty_pool_id`. |
| `expenses` | `id (uuid PK)`, `trip_id (uuid FK)`, `client_op_id (uuid unique)`, `entry_type (charge/adjustment/settlement)`, `reverses_expense_id (uuid FK nullable)`, `paid_by (uuid FK)`, `kitty_pool_id (uuid FK nullable)`, `amount_minor (bigint)`, `currency (char(3))`, `inr_equivalent_minor (bigint)`, `fx_rate (numeric)`, `split_mode (equal/exact/shares/tag_exclude)`, `splits (jsonb)`, `upi_txn_ref`, `created_at` | Immutable append-only ledger; `client_op_id` idempotency; `reverses_expense_id` self-FK for compensating adjustments. |
| `share_tokens` | `token (varchar(24) PK)`, `trip_id (uuid FK)`, `scope (public_viewer/elder_card/poll_voter/invite_editor)`, `redact_pii (bool default true)`, `expires_at` | Index `(trip_id)`. |

### 4.2 REST & WebSocket API Summary (`itinbee-backend`)
* **Health & OpenAPI:** `GET /health` (Render health check), `GET /openapi.json` (dev/CI contract sync for `frontend/`).
* **Sandbox & Auth:** `POST /v1/auth/otp/request`, `POST /v1/auth/otp/verify`, `POST /v1/auth/google`, `POST /v1/trips/claim-sandbox`.
* **Trips, Polls & Share Views:** `POST /v1/trips`, `GET /v1/t/:shortId` (`<150KB` redaction-aware payload fetched by `itinbee-frontend` over Render private network), `GET /v1/trips/:id/offline-bundle`, `POST /v1/trips/:id/polls`, `POST /v1/t/:shortId/polls/:pollId/vote` (Cloudflare Turnstile-verified).
* **Sync & Realtime:** `POST /v1/trips/:id/sync`, `WSS /v1/trips/:id/live` (live co-editing cursors, poll updates, expense additions via `itinbee-kv` Redis Pub/Sub).
* **Ingestion & Live Status:** `POST /v1/ingest/file`, `POST /v1/ingest/link`, `POST /v1/webhooks/whatsapp`, `POST /v1/webhooks/inbound-email`, `GET /v1/trips/:id/bookings/:bookingId/live-status`.
* **Expenses, Kitty & UPI:** `POST /v1/trips/:id/kitty-pools`, `POST /v1/trips/:id/expenses`, `GET /v1/trips/:id/settlements` (`<=₹2,000` `upi://pay?...` URIs + `>₹2,000` formatted VPA/amount copy payloads).

---

## 5. Map, Routing & Indian Travel-Time Calibration

1. **Base Map Rendering & Lazy Hydration:** **MapLibre GL JS** backed by self-hosted **Protomaps (`.pmtiles`)** vector tiles derived from OpenStreetMap on Cloudflare R2 *(displaying visible `"© OpenStreetMap contributors"` attribution per ODbL)*—cutting tile-view cost to near **$0** and enabling compact offline regional map slices (~15–40 MB). On `itinbee.com/t/<shortId>`, initial paint renders `<150KB` SSR HTML/CSS + a lightweight static route SVG, **lazy-loading MapLibre GL + `.pmtiles` only on user tap (*"Interactive Map"*)**.
2. **100% Open-Data POI Search & Permanent Offline Caching (Zero Google Places API Calls):** All POI search, autocomplete, geo-grounding, and persistent metadata (`place_ref_id`, `lat/lng`, `category`, `address`, `hours`) use open datasets: [**Overture Maps Places**](https://docs.overturemaps.org/guides/places/) (`CDLA-Permissive-2.0`/`Apache-2.0`), [**Foursquare Open Source Places**](https://opensource.foursquare.com/os-places/) (`Apache-2.0`), [**self-hosted OSM Photon**](https://github.com/komoot/photon) (`ODbL`), and **Wikidata** (`CC0`). Zero Google Places API data is rendered on MapLibre or cached in PostGIS (eliminating [GMP Terms §3.2.3](https://cloud.google.com/maps-platform/terms) & [Service Specific Terms §14.2](https://cloud.google.com/maps-platform/terms/maps-service-terms) conflicts and 30-day `lat/lng` TTLs), while turn-by-turn navigation hands off cleanly via zero-key outbound **Google Maps Universal URLs (`api=1`)**.
3. **India-Calibrated Transit Estimator:** Metro peak `18 km/h` vs. hill-station switchback factor `1.9×` distance at `22 km/h` (replacing Wayplot's naive flat `1.3×` at `30 km/h`), grounded in parsed IRCTC / IndiGo / redBus schedules when booked.

---

## 6. Security, DPDPA 2023 Compliance & SEO Hygiene

1. **DPDPA 2023 Hybrid Residency & Encryption:**
   * Singapore is permitted for cross-border compute under DPDPA 2023, while **encrypted booking PDFs & masked IDs reside physically in AWS S3 `ap-south-1` (Mumbai)** under per-trip AWS KMS DEKs, and **Stage-3 Gemini Flash inference runs in GCP Vertex AI `asia-south1` (Mumbai)** with zero data retention.
   * Extracted Aadhaar numbers mask the first 8 digits immediately; raw unmasked Aadhaar scans are never persisted in browser `IndexedDB`; multi-passenger ticket uploads strip/mask third-party co-traveller ages/genders unless consented, backed by 30-day post-trip purge reminders and `DELETE /v1/users/me`.
   * Every `itinbee.com/t/<shortId>` share link enforces `redact_pii = true` unless an authenticated member with `vault_access = true` fetches via signed bearer token.
2. **IRCTC, Maps & DNS/SEO Hygiene:**
   * **Zero automated IRCTC scraping** (user-forwarded PDFs/emails/SMS on Free; licensed IRCTC-authorized TIES/PSP B2B feeds on Trip Pass/Pro).
   * Enforce `301` redirect between `www.itinbee.com` and `itinbee.com` via Cloudflare, and serve live `HTTP 200` `/llms.txt`, `/robots.txt`, and `sitemap-trips-*.xml` from `itinbee-frontend`.
