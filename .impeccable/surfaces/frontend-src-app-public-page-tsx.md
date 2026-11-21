---
version: 1
slug: "frontend-src-app-public-page-tsx"
primary_target: "frontend/src/app/(public)/page.tsx"
related_targets: ["frontend/src/app/(public)/explore/page.tsx","frontend/src/app/(public)/destinations/page.tsx","frontend/src/app/(public)/create/page.tsx","frontend/src/app/trip/[id]/page.tsx","frontend/src/app/t/[shortId]/page.tsx"]
---

# Itinbee public surfaces: landing, Explore, Create (plus editor and share)

- **Scope & Visitor Modes:** `/` is Persuade. `/explore` and `/explore/[slug]` are Persuade-leaning browse surfaces. `/create` is a guided Operate flow in the same world. `/trip/[id]` is the Operate editor: calm, compact working UI with only the world's palette, labels and stamps as brand detail. `/t/[shortId]` is Read (Elder Card, high legibility).
- **Audience & Job:** Indian travellers (20–55) deciding where to go and how to plan it. They arrive from WhatsApp, search or Instagram on a phone and must understand within seconds that they can type or paste anything and get a mapped, day-by-day trip.
- **Proof / content:** Real destinations and itineraries from the Itinbee template library (labelled as templates), real map data credits, photographs with attribution. No invented testimonials, user counts or ratings (PRODUCT.md).
- **Constraints:** hero LCP image preloaded, no MapLibre in the landing bundle, prefers-reduced-motion, WCAG 2.2 AA, 44px touch targets, Hindi-safe line heights, open-data attribution in the footer strip.
- **Decisions pending:** photography sourcing for destination labels (Commons/Unsplash, build-time), final template list.

## Direction contract

THESIS: Every trip is a lacquered trunk and every stop is a die-cut label pasted on it. The page refuses the category's full-bleed photo hero with a search bar and makes the composer a luggage tag among destination labels.

OWN-WORLD: Lacquered trunk green (#0E5A47) panels with strap and brass-corner details, label paper (#F6EBD3), saffron (#F2A71B) day-count chips and brand, vermilion (#E2432B) for the one stamped action, ink navy (#14213D) for outlines, text and rubber-stamp postmarks. Die-cut gloss labels in varied silhouettes (arch, ticket-notch, oval, rounded) carrying real destination photographs, each with a condensed display name and a day-count chip. Display: Big Shoulders Display (heavy, condensed). UI/body: Source Sans 3. Numbered ink leader lines. A thin agate credits strip.

STORY: The visitor reads "Tell us where. We'll build the trip.", types or pastes anything into the tag, presses the stamped Build my trip button, and sees how labels (stops) tie to map pins by numbered leader lines. They can browse template labels by place and duration, and every action leads into Create or Explore.

FIRST VIEWPORT: A full-bleed trunk lid under a 64px nav. Centered, a 560px luggage tag hangs from a string and holds the display headline, the composer (textarea, example chips on a perforated line) and the vermilion Build my trip button with a secondary Browse itineraries link. Four photo labels of different silhouettes (Spiti, Hampi, Kyoto, Alleppey) sit left and right at restrained rotations (max 4 degrees), two numbered leader lines run from labels to a small map inset at bottom right, and the agate credits strip closes the viewport.

FORM: Trunk Labels, position 4 on my ordered list of 7 grounded candidates, seed:9b80a8a92b026f7e.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Craft overrides (decided while building)

- No kicker or eyebrow above the headline (craft-floor ban); the sketch's eyebrow is dropped.
- No hard offset shadow on the stamp button; depth is a soft offset blur.
- Nav is a solid trunk-dark bar; no decorative blur.
