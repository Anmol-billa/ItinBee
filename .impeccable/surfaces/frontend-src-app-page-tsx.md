---
version: 1
slug: "frontend-src-app-page-tsx"
primary_target: "frontend/src/app/page.tsx"
related_targets: ["frontend/src/app/trip/[id]/page.tsx","frontend/src/app/t/[shortId]/page.tsx"]
---

# Itinbee Web Workspace & Share Surfaces

- **Scope & Visitor Modes:** `/` (`Persuade` → `Operate` live zero-signup sandbox), `/trip/[id]` (`Operate` collaborative trip workbench), and `/t/[shortId]` (`Read` + lightweight `Operate` WhatsApp guest itinerary, zero-OTP polls, and `A / अ` Elder Card).
- **Audience & Job:** Indian Trip Architects, friend crews, and multi-generational families turning scattered IRCTC/IndiGo/redBus bookings and Reels into one offline-ready timeline, voting via WhatsApp without login walls, and settling unequal group bills via UPI.
- **Constraints:** `<150KB` initial SSR payload on `/t/[shortId]`, lazy-loaded MapLibre GL + OpenStreetMap/Overture open POIs (zero Google Places API calls), automatic PNR/Aadhaar redaction on guest views, and standalone `frontend/` deployment on Render (`singapore`).

## Direction contract

THESIS: An ultra-clean, calm, compact travel workbench that opens directly into a live Indian multi-modal itinerary sandbox on the first viewport, refusing bloated hero marketing, oversized typography, and decorative card grids.
OWN-WORLD: Warm alabaster ground (`#FCFCFA`) and quiet stone sidebar (`#F5F5F2`) separated by `1px` `#E7E5E0` hairlines, `#18181B` ink, compact `12.5px–13.5px` `Public Sans` UI rows paired with `11.5px` tabular `JetBrains Mono` codes/amounts, surgical `#D97706` raw-honey focus accents, `#0F766E` confirmed transit chips, and fine two-tone SVG Scout Bee micro-illustrations.
STORY: Visitors immediately edit a real Rishikesh–Landour, South Goa, Varanasi, or Vietnam route (or paste an IRCTC/flight/Reel snippet into the Scout bar), verify calibrated transit legs on the synchronized map, toggle the high-contrast bilingual Elder Card, split INR/FX bills via UPI, and claim a `<1.5s` WhatsApp link.
FIRST VIEWPORT: Compact `48px` top bar (Scout Bee SVG mark + `itinbee`, sample route pills, `+ Blank Trip`, primary `Share link` button) over a clean 3-pane workbench (`228px` day/tab rail + Scout drop input, airy central `13px` day timeline with calibrated transit spine connectors, and `400px` synchronized route map strip) anchored by an `11px` local-sandbox status footer.
FORM: `seed: none (pinned)` "I want a much cleaner and minimalist UI with smaller text" / "Discard all the UI options you gave me and start with building from scratch" (implementing PRODUCT.md's Wayplot/Wanderlog split-screen zero-signup sandbox commitment)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
