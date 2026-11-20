# Plan 01 — UX Flows, Impeccable UI Surfaces & India-First Product Features

**Parent Blueprint:** [`BLUEPRINT.md`](./BLUEPRINT.md) · **Product Context:** [`../PRODUCT.md`](../PRODUCT.md)  
**Design Mandate:** Eliminate tab, screenshot, and WhatsApp group chaos so any Indian Trip Architect can assemble a multi-modal itinerary in under **3 minutes** and share it with 15 relatives or friends in **1 tap**—crafted through the **Impeccable UI** system with zero forced app installs or login walls for viewers.

---

## 1. Effortless Itinerary Creation Flows

### 1.1 Zero-Signup Instant Sandbox (Inspired by Wayplot, Upgraded for Cloud Continuity)
* **First-Screen Flow (`/`):** Visiting `itinbee.com` drops the user directly into a live, interactive **Split-Screen Sandbox Workbench** (Map + Day-by-Day Timeline pre-loaded with switchable sample Indian routes plus a *Blank Trip / Drop Ticket or Reel* action) without a login modal.
* **Local Persistence → Seamless Claim:** Unauthenticated edits save immediately in browser `IndexedDB` (`Dexie.js`). The moment the user taps **"Share to WhatsApp"** or **"Sync Across Devices"**, a single **Phone OTP (WhatsApp/SMS) or Google Sign-In** sheet upgrades the local trip UUID to a cloud-synced workspace on `itinbee-backend` without losing a single stop.

### 1.2 Four India-Native Ingestion Channels

| Channel | User Action | Processing & UX Result |
|---|---|---|
| **1. Scout Dropzone, WhatsApp Bot & Email (`trips@itinbee.com`)** | User drops/uploads or forwards an IRCTC SMS/PDF, redBus ticket PDF, IndiGo boarding pass, MMT/Goibibo/Zostel/Airbnb confirmation email, or screenshot. | Replies within **3–5 seconds** with a structured confirmation card (*"Added Train 12951 Rajdhani • Coach B4, Berths 32/35 • Departs 17:00"*), highlighting any `<0.85` confidence fields in amber for 1-tap verification and slotting it onto the exact trip day. |
| **2. Social Reel / Short-to-Stops ("Start Anywhere")** | User pastes an Instagram Reel, YouTube Short, or blog URL into `+ Add from Link`, pastes a caption, or uploads a screenshot. | Extracts places via **official oEmbed metadata, YouTube transcripts, and user-shared captions/screenshots** (no brittle datacenter video scraping) and geo-grounds them against **Overture / Foursquare OS / OSM Photon / Wikidata POIs** (with 1-tap MapLibre pin drop fallback) as **"Idea Cards"** in the *Shortlist Drawer*. |
| **3. Hindi / Hinglish Voice-to-Timeline** | User holds the Web Speech / mic button and speaks naturally (*"Day 2 subah 7 baje Hadimba Temple, phir Old Manali cafe, shaam ko Mall Road"*). | Multilingual speech-to-text + structured extraction creates time-ordered stop cards with veg/cafe categories and estimated hill-road buffers. |
| **4. 1-Tap Cloneable India & Outbound Templates** | User picks from verified starter packs: *Rishikesh–Landour 4D*, *South Goa Monsoon Crew 5D*, *Spiti 7D Roadtrip*, *Varanasi–Ayodhya Senior Yatra*, *Vietnam 7D*, *Thailand 5D*, *Dubai 4D*. | Clones an editable template (explicitly labeled *Sample / Template Itinerary* per `PRODUCT.md` honesty rules) pre-loaded with calibrated transit durations, dietary/weather notes, and outbound visa/eSIM checklists. |

### 1.3 Multi-Modal Transport & Unbranded Stay Cards
* **Dedicated Indian Leg Types:** Flight (terminal, PNR, baggage allowance), Train (IRCTC Train #, Coach, Berth, CNF/RAC/WL badge—parsed statically on Free tier, refreshed via licensed B2B Rail APIs on Trip Pass/Pro), Bus (Operator, boarding landmark, seat #), Self-Drive/Rental Cab (driver name/phone, FASTag estimate), Ferry/Metro, and **Unbranded Homestay/Ashram Card** (address pin, host WhatsApp number, Wi-Fi/check-in rules, advance paid).
* **Indian Reality Buffers:** Automatically inserts check-in/out gaps, airport terminal transfer warnings (DEL T1 vs T2/T3), and hill-station sunset arrival advisories.

---

## 2. WhatsApp-First Sharing & Group Collaboration

### 2.1 Zero-Login Mobile Web Guest Links (`itinbee.com/t/<shortId>`)
* **Built for WhatsApp WebView & Indian 4G:** Clicking a shared link opens a server-rendered page (`<1.5s` First Contentful Paint, `<150KB` initial SSR HTML/CSS + lightweight static route SVG/snapshot) directly inside WhatsApp's in-app browser—**no app download or signup required to read**. Heavy client bundles (**MapLibre GL + `.pmtiles`**) **lazy-load only when the user taps "Interactive Map"**.
* **Rich OpenGraph Preview Cards:** Pasting `itinbee.com/t/goa-dec-7x9` into WhatsApp renders an OpenGraph preview with trip cover, dates, stop count, and planner name (*"Ananya shared: Goa 4D Crew Plan • 14–17 Dec • 9 stops"*).
* **1-Tap Text Digest Export:** **"Copy WhatsApp Summary"** generates a clean, structured day-by-day message with times, stay pins, and a link back to the live map/polls.

### 2.2 Lightweight Group Voting & Co-Editing
* **Resolving "Who's Coming & Where Are We Staying?":** Trip Architects drop 2–4 candidate stays, dates, or restaurants into a **Trip Poll** and share the link to WhatsApp.
* **1-Tap Guest Action (`₹0` OTP Cost):** Co-travellers tap *Vote*, *Going / Maybe / Out*, or leave a pin note after a **Cloudflare Turnstile + Guest Display Name** check (backed by rate-limited signed cookie/IP) or **Google One-Tap**—preventing bot spam and SMS/WhatsApp OTP cost bleed.
* **Role-Based Permissions:** `Owner / Co-Editor` (full timeline, booking, and ledger edit rights), `Contributor` (Wishlist Idea Cards, voting, expense logging), and `Viewer` (default public link: read-only timeline, map, and polls—**zero sensitive PNR/ID exposure**).

### 2.3 Dual-View Sharing: *Builder View* vs. *Family / Elder Card*
Addressing R1's **47.7% (~48%) pilgrimage/religious share of domestic overnight trips** (MoSPI/NSO DTES), multi-generational family travel (*Timeless Travellers* 60+), and **98% Indic content consumption**:
* **Builder View (Default for Planners/Friends):** Synchronized MapLibre canvas, drag-and-drop + keyboard-reorderable day blocks, Shortlist & Polls, UPI ledger, and attached bookings.
* **Family / Elder Card (`A / अ` 1-Tap Toggle):** Strips away editing chrome and financial clutter to render a **high-contrast daylight-legible `>=18px` card** (with **English + `हिन्दी` toggle** and Devanagari-safe `line-height`), highlighting only:
  1. Wake-up / departure / meal times,
  2. **Pure-Veg / Jain / Satvik meal tags** and nearby restaurant pins,
  3. **Accessibility & Senior Pacing Notes** (elevator/stair counts, walking distance, temple *darshan* slot timings, afternoon rest blocks),
  4. Emergency contact & stay address in local script for auto/cab drivers.
* **QR-Linked Printable PDF:** Exports a clean A4/mobile-friendly PDF (upgrading Wayplot's offline PDF utility) whose embedded QR code points to **`itinbee.com/t/<shortId>`** (the live trip URL).

### 2.4 Privacy-Safe PNR & Document Redaction
* Public/WhatsApp share tokens (`role = viewer`) **automatically mask** PNR numbers (`PNR: ••••••842`), passenger ages/genders, Aadhaar/passport numbers, and ticket barcodes. Only authenticated trip members explicitly granted `vault_access` can unlock encrypted booking PDFs.

---

## 3. Offline Vault & UPI-Native Expense Ledger

### 3.1 Free Hill-Station & Roaming Offline PWA Vault
* **Always-Free Offline Mode (`50MB/trip` Vault):** One toggle (*"Make Available Offline"*) caches the trip timeline, vector map region (`Protomaps .pmtiles` via Service Worker Cache Storage), stay/driver phone numbers, and compressed booking PDFs (**50MB per-trip free quota** with client-side WebP/PDF downsampling for `>10MB` camera scans). Cached ticket PDFs in the PWA are wrapped client-side via **WebCrypto AES-GCM** (derived from user session/passphrase; raw unmasked Aadhaar scans are never persisted in browser `IndexedDB`, and Aadhaar numbers mask first 8 digits on extraction).
* **100% Free Outbound Readiness Checklists & Affiliate Utility:** Auto-attaches corridor checklists for **Vietnam, Thailand, Malaysia, Japan, UAE, and Schengen** (passport validity reminders, e-visa PDF slot, travel insurance, zero-markup forex, eSIM cards) at **₹0**.

### 3.2 Unlimited Group Expense Ledger & `upi://pay` Settlement
* **Zero Daily Caps:** Unlimited expenses, receipt attachments, and multi-trip history for free (capturing Splitwise 4/day cap refugees).
* **Indian Group Split Modes:** *Equal*, *Exact*, *Shares/Weights*, **Tag-Based Exclusions** (*"Exclude non-drinkers / vegetarians"*), **Car Fuel & FASTag Pool**, and **Upfront "Trip Kitty" Pool**, plus multi-currency FX (`THB`, `VND`, `AED`, `JPY`, `EUR`, `USD` → `INR`).
* **1-Tap UPI Deep-Link Settlement (`<=₹2,000` vs. `>₹2,000`):**
  * **Settlements `<=₹2,000` (Android mobile web):** Renders **"Pay ₹1,450 via UPI"** (`upi://pay?pa=<payee_vpa>&pn=<name>&am=<amount>&cu=INR&tn=Itinbee+<shortId>`) + dynamic scannable UPI QR.
  * **Settlements `>₹2,000`, iOS, or Restricted WebViews:** Promotes **1-tap "Copy UPI ID + Exact Amount"** + dynamic QR to avoid TPAP P2P `>₹2,000` gallery/intent blocks, paired with manual *"Mark as Paid (Ref/Screenshot)"*.

---

## 4. Impeccable UI Frontend Architecture & Scout Bee Mascot System

Built under Impeccable (`PRODUCT.md`, `.impeccable/config.json` `"buildPath": "code"`), `frontend/` separates surfaces strictly by **Visitor Mode**:

| Route / Surface | Impeccable Mode | Competitor Inspiration Synthesized | Core Structural & Signature UI Rule |
|---|---|---|---|
| **`/` (Home & Live Sandbox)** | **`Persuade` → `Operate`** | **Wayplot** (instant local sandbox) + **Mindtrip** ("Start Anywhere" dropbar) + **Stippl** (cloneable corridor guides) | **First viewport IS the working sandbox**, never a generic SaaS split hero. Visitors drag stops on a real sample Indian route or drop a ticket/Reel immediately. |
| **`/trip/[id]` (Collaborative Workbench)** | **`Operate`** | **Wanderlog** (split map + day timeline + inline expenses) + **Pilot** (polls) + **TripIt / Tripsy** (crisp PNR cards) | Standard, fast web controls + committed shell palette + **Signature Move: *The Multi-Modal Transit Spine*** linking day stops with calibrated rail/flight/hill-cab connectors illuminated on the MapLibre canvas. |
| **`/t/[shortId]` (WhatsApp Guest & Elder Card)** | **`Read` + Light `Operate`** | **Polarsteps** (calm, ad-free story hierarchy) + **Pilot** (1-tap guest voting) + **Wayplot** (printable QR PDF) | `<150KB` SSR payload, zero visual clutter, prominent `Itinerary & Polls` ↔ `Family / Elder Card (A / अ)` switch, and daylight-high-contrast typography (`WCAG 2.2 AA`). |

### Scout Bee Mascot Discipline
* **Craft Technique:** Drawn as crisp two-tone editorial vector linework (`SVG` strokes + subtle hatch/tint wash)—never generic 3D emoji bees, stock clip-art, or gamified badges.
* **Earned Placement Only:** Appears in (1) the `Itinbee` header mark, (2) the *Scout Ingestion Dropzone* (tracing a subtle dotted flight connector while parsing a PDF/Reel), (3) the *"Hive synced · Ready offline"* status pill, and (4) empty shortlist / all-settled ledger states. Never overlays map pins, timeline rows, or the *Family / Elder Card*.
* **Mandatory Pre-Code Gate:** Before writing UI components, run `impeccable concept-seed` per surface, lock the 6-block `## Direction contract` in `.impeccable/surfaces/`, avoid Impeccable's overused default font list, and close each surface with `first-viewport`, `detect --json`, `impeccable-finish-reviewer`, and `impeccable-documenter` (`DESIGN.md` + `.impeccable/design.json`).
