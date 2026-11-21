---
name: "Itinbee"
description: "OTA-agnostic, WhatsApp-native, offline-first travel itinerary platform, open-map route builder, and UPI expense ledger."
colors:
  trunk: "#0E5A47"
  trunk-light: "#1C7D63"
  trunk-deep: "#073026"
  trunk-dark: "#062119"
  saffron: "#F2A71B"
  vermilion: "#C7361F"
  navy: "#14213D"
  paper: "#F6EBD3"
  paper-light: "#FFF7E4"
  paper-dark: "#EAD9B5"
  paper-edge: "#CBB68A"
  paper-ink: "#4F4533"
  jade: "#0F766E"
  jade-wash: "#F0FDFA"
  honey-deep: "#B45309"
  honey-wash: "#FEF3C7"
typography:
  display:
    fontFamily: "Big Shoulders Display, Public Sans, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "0.005em"
  headline:
    fontFamily: "Big Shoulders Display, Public Sans, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 900
    lineHeight: 0.98
    letterSpacing: "0.005em"
  title:
    fontFamily: "Source Sans 3, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Source Sans 3, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  compact:
    fontFamily: "Public Sans, Source Sans 3, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.paper-light}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "11px 24px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.navy}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "11px 20px"
  chip-day:
    backgroundColor: "{colors.saffron}"
    textColor: "{colors.navy}"
    typography: "{typography.headline}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  chip-confirmed:
    backgroundColor: "{colors.jade-wash}"
    textColor: "{colors.jade}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
---

# Design System: Itinbee

## Overview

**Creative North Star: "Trunk Labels"**

Itinbee treats every trip as a lacquered steamer trunk and every destination or stop as a die-cut label pasted onto it, tied to real map pins by numbered ink leader lines. On Persuade and Browse surfaces (`/`, `/explore`, `/destinations`, `/create`), the world owns the stage: deep lacquered trunk green, chamfered paper luggage tags on twine, die-cut gloss photo labels in varied silhouettes, rubber-stamp postmarks, and perforated tear-strips.

On Operate and Read surfaces (`/trip/[id]` and `/t/[shortId]`), ambition shifts to precision and daytime legibility. The trunk’s dark bar anchors workspace navigation while warm paper surfaces, tabular dispatch times, color-blind-safe day pins, and bilingual English / हिन्दी Elder Cards carry complex multi-modal Indian and international itineraries without visual fatigue. Itinbee refuses generic stock-hero search bars, identical icon-card grids, gradient text, and fabricated ratings or testimonials.

**Key Characteristics:**
- Committed lacquered trunk green (`#0E5A47`) paired with warm cut-paper tags (`#F6EBD3`) and navy stamp ink (`#14213D`).
- Heavy condensed display lettering (`Big Shoulders Display`) contrasted against humanist UI prose (`Source Sans 3`) and tabular mono readouts (`JetBrains Mono`).
- Four recurring die-cut destination label silhouettes (`arch`, `notch`, `oval`, `round`) carrying attributed Wikimedia Commons photography.
- Dual-register density: expressive `16px–19px` editorial rhythm on discovery pages; calm `14px–15px` 3-pane workspace in the Trip Editor; `>=18px` high-contrast daylight legibility on WhatsApp Elder Cards.

## Colors

A tactile full-palette system drawn from lacquered trunks, brass hardware, rag luggage tags, saffron day-stamps, and vermilion sealing ink.

### Primary
- **Lacquered Trunk Green** (`#0E5A47`, center lift `#1C7D63`, dark bar `#062119`): Owns major Persuade stages, page headers, and workspace top bars.
- **Stamped Vermilion** (`#C7361F`): Reserved for the single primary stamp action (`Build my trip`, `Read & plan my trip`, `Use this itinerary`, `Share`) and active route pins.

### Secondary
- **Marigold Saffron** (`#F2A71B`): Brand wordmark, duration chips (`4D`, `7D`), active tab underlines, and text selection highlight.
- **Signal Jade** (`#0F766E` on `#F0FDFA`): Confirmed PNR chips (`CNF`), verified map pins, dietary tags (`pure_veg`, `satvik`), and live sync pills.

### Tertiary
- **Tempered Amber** (`#B45309` on `#FEF3C7`): Pacing warnings, low-confidence parser fields requiring human review, and `RAC`/`WL` advisories.

### Neutral
- **Luggage Tag Paper** (`#F6EBD3`, highlight `#FFF7E4`, edge `#CBB68A`): Primary reading card, filter bar, and composer surface.
- **Postmark Navy Ink** (`#14213D`): Primary foreground ink on paper, structural borders (`1.5px–2px`), leader lines, and rubber-stamp postmarks.
- **Warm Rag Ink** (`#4F4533`): Secondary prose and metadata on paper, tinted from the paper hue rather than neutral gray.

### Named Rules
**The One Stamp Rule.** Stamped Vermilion (`#C7361F`) appears on one primary action per region plus numbered route pins—never across rows of secondary buttons.
**The Tinted Secondary Rule.** Secondary copy on trunk green uses translucent paper (`rgba(246, 235, 211, 0.85)`); secondary copy on paper uses Warm Rag Ink (`#4F4533`), never neutral gray.

## Typography

**Display Font:** `Big Shoulders Display` (with `Public Sans`, `system-ui`, `sans-serif` fallback)
**Body Font:** `Source Sans 3` and `Public Sans` (with `Kohinoor Devanagari`, `Noto Sans Devanagari`, `system-ui` fallback)
**Label/Mono Font:** `JetBrains Mono` (`tabular-nums`)

**Character:** Condensed poster authority in headlines paired with open, warm humanist prose that stays effortless across English, Hinglish, and Devanagari scripts.

### Hierarchy
- **Display** (`900`, `2.75rem–3.75rem`, line-height `0.95`): Hero claims, section headers, and destination titles.
- **Headline** (`900`, `1.875rem–2.25rem`, line-height `0.98`): Itinerary card titles, day headers, and luggage-tag subheads.
- **Title** (`700`, `1.125rem`, line-height `1.35`): Stop titles, filter legends, and review section headers.
- **Body** (`400–600`, `1rem`, line-height `1.55`, measure `60–68ch`): Descriptions, notes, and form controls (`>=18px` with `1.7` line-height in Elder Card mode).
- **Label** (`600`, `0.75rem`, `tabular-nums`): Clock times (`06:45`), PNR masks, transit distances/durations, and currency amounts.

### Named Rules
**The No-Kicker Rule.** Headings carry their own weight without uppercase eyebrow or kicker labels stacked above them.
**The Tabular Dispatch Rule.** Every clock time, PNR mask, distance, duration, vote count, and INR/FX figure uses `JetBrains Mono` with `tabular-nums`.

## Layout

Public pages (`/`, `/explore`, `/destinations`, `/create`) alternate between lacquered trunk stages and warm paper bands inside a `1280px` container (`20px` mobile padding, `32px` desktop padding). The first viewport on desktop (`>=1024px`) frames a `1280×804px` trunk stage beneath a `64px` navigation bar and closes with a `32px` agate open-data credits strip (`900px` total height, scaled smoothly via CSS zoom between `1024px` and `1279px` and stacked cleanly below `1024px`).

The Trip Editor (`/trip/[id]`) uses a full-viewport 3-pane desktop workspace (Day Timeline · Explore Places Discovery · Synchronized OpenFreeMap Vector Route Map) that collapses into a single-row segmented switch (`Plan` | `Places` | `Map`) on mobile with `44px` minimum coarse-pointer hit targets.

## Elevation & Depth

Depth comes from physical paper stock resting over lacquered trunk panels: soft downward ambient drop-shadows with subtle blur rather than zero-blur neobrutalist block offsets or decorative glassmorphism.

### Shadow Vocabulary
- **Luggage Tag Lift** (`drop-shadow: 0 22px 22px rgba(3, 18, 14, 0.55)`): Primary hanging composer tag over trunk green.
- **Die-Cut Label Lift** (`box-shadow: 0 14px 26px rgba(3, 18, 14, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.75)`): Destination labels and itinerary cards.
- **Stamp Press** (`box-shadow: 0 6px 14px -2px rgba(98, 24, 12, 0.55)`): Primary vermilion stamp button, compressing on `:active`.

## Shapes

- **Chamfered Luggage Tag** (`clip-path: polygon(52px 0, calc(100% - 52px) 0, 100% 52px, 100% 100%, 0 100%, 0 52px)` with centered brass grommet hole and `2px dashed` perforation).
- **Die-Cut Silhouettes:** Four distinct destination frames—`arch` (`16px 16px 999px 999px`), `oval` (`50%`), `round` (`18px`), and `notch` (radial-gradient side ticket cutouts)—bordered by `7px` paper stock and `1.5px` navy keylines.
- **Restrained Rotation:** Destination labels rotate at most `±4deg` on Persuade stages and `0deg` inside dense Operate lists.

## Components

### Buttons
- **Shape:** Gently rounded corners (`8px`), `2px solid #14213D` stroke on primary stamps, `1.5px solid` on outline actions, minimum `48px` height.
- **Primary (`.btn-stamp`):** Stamped Vermilion (`#C7361F`) with `#FFFDF8` bold text (`11px 24px` padding) and soft warm blur shadow.
- **Hover / Focus:** Lifts `-1px` on hover (`#D63F26`), settles `+1px` on press, and shows a `3px solid` high-contrast `:focus-visible` outline (`#F2A71B` on trunk, `#14213D` on paper).
- **Secondary (`.btn-line`):** Transparent ground with current-ink `1.5px` border and subtle wash on hover.

### Chips
- **Style:** Pill radius (`9999px`), `1.5px solid rgba(20, 33, 61, 0.4)` on `#EFE0BE` paper stock (`44px` min-height on coarse pointers).
- **State:** Selected filter chips invert to `#14213D` ground with `#F6EBD3` text (`aria-pressed="true"`). Duration chips use `#F2A71B` saffron with `#14213D` condensed numerals.

### Cards / Containers
- **Corner Style:** `14px` outer radius on itinerary cards and workspace panels; chamfered top corners on luggage tags.
- **Background:** `#F6EBD3` / `#FFF7E4` paper stock with `1.5px–2px solid #14213D` structural framing.
- **Internal Padding:** `16px–24px` on itinerary cards; `24px–42px` on primary composer tags.

### Inputs / Fields
- **Style:** `#FFFDF8` cream paper ground, `2px solid rgba(20, 33, 61, 0.6)` border, `8px` radius, `>=16px` font size to prevent iOS zoom.
- **Focus:** `3px solid #14213D` outline with `2px` offset.
- **Error / Disabled:** `#A82E19` border with linked `aria-describedby` message after blur/submit; `0.6` opacity when disabled.

### Navigation
- **Style:** Solid `#062119` trunk-dark header (`64px` height) with `1px` saffron-tinted bottom rule, honey bee-pin mark + `itinbee` condensed wordmark, links to `Explore`, `Destinations`, `Create`, `My trips`, `Sign in`, and a pill `Plan a trip` CTA. Collapses into an accessible `<details>` menu below `768px`.

### Die-Cut Destination Label (Signature Component)
Wraps a verified destination photograph inside a `7px` paper border (`arch`, `notch`, `oval`, or `round`) with a subtle diagonal gloss sheen, a `1.5px` navy-ruled footer displaying the condensed uppercase place name and saffron day-count badge (`7D`), and an optional numbered navy pin badge (`1`, `2`) that connects to route insets via dashed saffron-on-navy SVG leader lines.

## Do's and Don'ts

### Do:
- **Do** pair every destination photograph and map view with visible open-data attribution (`© OpenStreetMap contributors`, `Wikivoyage / Wikipedia CC BY-SA`, `Wikimedia Commons`).
- **Do** label non-user itineraries explicitly as `Itinbee template` or `Sample workspace` and show a `Popular` badge derived from open-data signals rather than star ratings.
- **Do** indicate active tabs with both color (`#F2A71B`) and a `3px` bottom border shape so state remains clear in forced-colors and color-blind views.
- **Do** suppress entrance and camera fly animations whenever `prefers-reduced-motion: reduce` is active.

### Don't:
- **Don't** place kickers or uppercase eyebrow labels above `h1`–`h3` headings.
- **Don't** use `Impact` or generic system display fallbacks, gradient text, decorative backdrop-blur navbars, one-sided card border stripes, hard `4px 4px 0` offset shadows, or nested cards.
- **Don't** fabricate user counts, reviews, star ratings, or testimonials, or call Google Places APIs.
- **Don't** import `maplibre-gl` eagerly in SSR bundles for `/`, `/explore`, `/destinations`, or `/t/[shortId]`.
