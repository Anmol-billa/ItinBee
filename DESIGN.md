---
name: "Itinbee"
description: "OTA-agnostic, WhatsApp-native, offline-first travel itinerary workbench and UPI expense ledger."
colors:
  honey: "#D97706"
  honey-deep: "#B45309"
  honey-wash: "#FEF3C7"
  jade: "#0F766E"
  jade-wash: "#F0FDFA"
  canvas: "#FCFCFA"
  canvas-subtle: "#F5F5F2"
  canvas-elevated: "#FFFFFF"
  canvas-muted: "#EFECE6"
  line: "#E7E5E0"
  line-strong: "#D6D3CD"
  ink: "#18181B"
  ink-secondary: "#57534E"
  ink-tertiary: "#655F5B"
typography:
  display:
    fontFamily: "Public Sans, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Public Sans, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Public Sans, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.57
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Public Sans, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.54
  compact:
    fontFamily: "Public Sans, Kohinoor Devanagari, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.45
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas-elevated}"
    typography: "{typography.compact}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "{colors.canvas-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.compact}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  nav-tab-active:
    backgroundColor: "{colors.canvas-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  chip-confirmed:
    backgroundColor: "{colors.jade-wash}"
    textColor: "{colors.jade}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  chip-advisory:
    backgroundColor: "{colors.honey-wash}"
    textColor: "{colors.honey-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  card-stop:
    backgroundColor: "{colors.canvas-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "14px"
  input-field:
    backgroundColor: "{colors.canvas-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.compact}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  dialog-surface:
    backgroundColor: "{colors.canvas-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: Itinbee

## Overview

**Creative North Star: "The Calibrated Field Dispatch"**

Itinbee treats multi-modal travel planning like a railway timetable crossed with a calm architectural notebook. Opening directly into the workbench defined in `frontend/tailwind.config.ts` and `frontend/src/app/globals.css`, Warm Alabaster (`#FCFCFA`) and Quiet Stone (`#F5F5F2`) planes separated by `1px` `#E7E5E0` hairlines keep IRCTC PNRs, coach and berth numbers, mountain switchback advisories, and UPI splits scannable without visual noise.

One shared palette powers two registers: compact `11px–13px` rows in `frontend/src/components/workbench/WorkbenchClient.tsx` for Trip Architects, and high-contrast `18px` bilingual English and Hindi sheets in `frontend/src/components/share/ElderCardView.tsx` and `frontend/src/components/share/GuestShareClient.tsx` for WhatsApp WebViews. Hero billboards, kickers above headings, gradient text, hard offset shadows, and nested icon-card grids are rejected; brand warmth lives in surgical amber accents and the two-tone vector linework of `frontend/src/components/mascot/ScoutBeeMark.tsx`.

**Key Characteristics:**
- Warm-paper tonal planes (`#FCFCFA` ground, `#F5F5F2` rails, `#FFFFFF` cards) divided by `1px` `#E7E5E0` hairlines.
- Compact `11px–14px` `Public Sans` UI copy paired with `JetBrains Mono` tabular numerals.
- Dual-register legibility expanding to `18px` copy (`1.7` Devanagari line-height) in Elder Card mode.
- Surgical accents: Charcoal Ink (`#18181B`) primary CTAs, Raw Honey (`#D97706`) and Tempered Amber (`#B45309`) focus and advisories, Signal Jade (`#0F766E`) verified state.
- Themed browser surfaces (`#FEF3C7` selection, `#B45309` caret and `:focus-visible` ring, `7px` stone scrollbars, native `<dialog>` backdrop).

## Colors

A daylight-calibrated warm paper palette anchored by Charcoal Ink and accented only for focus, advisories, or verified tickets.

### Primary
- **Raw Honey** (`#D97706`): Active corridor map pin fill and Scout Bee thorax mark in `frontend/src/components/mascot/ScoutBeeMark.tsx`.
- **Tempered Amber** (`#B45309`): Keyboard `:focus-visible` `2px` outline, text caret, Elder Card clocks, and transit or parser advisory text.
- **Honeycomb Tint** (`#FEF3C7`): Text `::selection` highlight, Scout Bee body fill, and wash behind switchback or low-confidence parser chips.

### Secondary
- **Signal Jade** (`#0F766E`): Confirmed PNR status, PII redaction shield, live online Wi-Fi indicator, open kitty status, and vegetarian/satvik tags.
- **Mint Mist** (`#F0FDFA`): Soft wash paired with Signal Jade (`#0F766E`) on confirmed booking and kitty badges.

### Neutral
- **Warm Alabaster** (`#FCFCFA`) & **Quiet Stone** (`#F5F5F2`): Root stage ground and recessed navigation, map, and form planes.
- **Crisp Paper** (`#FFFFFF`) & **Pressed Linen** (`#EFECE6`): Elevated stop rows, cards, inputs, dialogs, and secondary hover wash.
- **Warm Hairline** (`#E7E5E0`) & **Calibrated Rule** (`#D6D3CD`): Default `1px` structural borders and active stop, transit spine, and Scout flight-path rules.
- **Charcoal Ink** (`#18181B`), **Warm Graphite** (`#57534E`), **Stone Agate** (`#655F5B`): Primary (`17.25:1` on `#FCFCFA`), secondary (`7.43:1`), and placeholder/attribution (`4.80:1` on `#FFFFFF`) inks.

### Named Rules
**The Ink-Leads-Action Rule.** Primary structural buttons (`Share link`, `Add stop`, `Post`, `Log`) use Charcoal Ink (`#18181B`) with Crisp Paper (`#FFFFFF`) text, keeping Raw Honey (`#D97706`) and Tempered Amber (`#B45309`) rare and diagnostic.

**The Semantic Jade Rule.** Signal Jade (`#0F766E`) on Mint Mist (`#F0FDFA`) appears strictly on verified trust states — confirmed PNRs, PII masking, live sync, open kitty balances, and dietary tags.

## Typography

**Display & Body Font:** `Public Sans` (self-hosted variable WOFF2 `400–700` at `frontend/public/fonts/public-sans-latin.woff2` and `frontend/public/fonts/public-sans-latin-ext.woff2`, with `Kohinoor Devanagari`, `Noto Sans Devanagari`, `system-ui`, `sans-serif` fallbacks)
**Label/Mono Font:** `JetBrains Mono` (self-hosted variable WOFF2 `400–600` at `frontend/public/fonts/jetbrains-mono-latin.woff2` and `frontend/public/fonts/jetbrains-mono-latin-ext.woff2`, with `ui-monospace`, `monospace`)

**Character:** High-x-height civic sans copy keeps Indian place names effortless to scan, while `JetBrains Mono` aligns departure clocks, masked PNRs, and rupee balances cleanly.

### Hierarchy
- **Display** (`600`, `1.5rem` / `24px`, line-height `1.33`, tracking `-0.025em`): Elder Card trip title.
- **Headline** (`600`, `1.25rem` / `20px`, line-height `1.4`, tracking `-0.025em`): Workbench (`18px–20px`) and guest share title.
- **Title** (`600`, `0.875rem` / `14px`, line-height `1.57`, tracking `-0.015em`): Day, modal, and section headings.
- **Body** (`400–500`, `0.8125rem` / `13px`, line-height `1.54`): Default `body`, rail tabs, and stop titles; steps up to `18px` (`1.55` English / `1.7` Hindi line-height) in `ElderCardView`.
- **Compact** (`400–500`, `0.75rem` / `12px`, line-height `1.5`): Stop notes, inputs, toolbar buttons, and ledger rows.
- **Label** (`500`, `0.6875rem` / `11px`, line-height `1.45`, `tabular-nums`): Clocks, PNRs, day codes, transit connectors, and telemetry.

### Named Rules
**The Tabular Dispatch Rule.** Every clock time, PNR mask, vehicle code, vote count, and currency figure renders in `JetBrains Mono` with `tabular-nums`.

**The Dual-Register Scale Rule.** Builder views cap headings at `20px` and UI copy at `11px–14px`, while Elder Card views enforce `18px` summaries and `1.7` Devanagari line-height.

## Layout

Desktop (`>=1024px`) runs a 3-pane workbench (`232px` rail + `minmax(0, 1fr)` stage + `396px` map) below a sticky `48px` header. Timeline rows use `@container timeline (inline-size > 34rem)` (`544px`) in `frontend/src/app/globals.css` to switch `.stop-row-grid` from `1fr` to `5.5rem minmax(0, 1fr) auto`. Guest Share (`frontend/src/app/t/[shortId]/page.tsx`) uses a `1024px` split (`360px` sticky map) or `672px` Elder Card sheet; `<1024px` uses a safe-area bottom bar and `44px` coarse-pointer targets.

## Elevation & Depth

Paper value steps (`#F5F5F2` recessed behind `#FCFCFA` and `#FFFFFF`) and `1px` `#E7E5E0` borders carry depth, backed by two Charcoal Ink shadows and a `rgba(24, 24, 27, 0.36)` `2px`-blurred `<dialog>::backdrop`.

### Shadow Vocabulary
- **Panel Lift** (`box-shadow: 0 2px 8px -2px rgba(24, 24, 27, 0.05), 0 1px 2px 0 rgba(24, 24, 27, 0.03)`): Active rail tab, view toggle, highlighted stop, and POI popover.
- **Dialog Float** (`box-shadow: 0 18px 42px -10px rgba(24, 24, 27, 0.14), 0 4px 12px -2px rgba(24, 24, 27, 0.06)`): Native `<dialog>` modals and toasts.

### Named Rules
**The Hairline-Over-Shadow Rule.** Resting cards, stop rows, and trays sit flat inside `1px` `#E7E5E0` borders; shadows mark active selection or modals only.

## Shapes

Tight corners (`4px` chips, `6px` controls, `8px` cards/maps, `12px` modals and Elder Card, `9999px` index pins and scrollbars) pair with full-perimeter `1px` borders, dashed route polylines (`frontend/src/components/map/LazyRouteMap.tsx`), and `1.6–1.7` stroke Lucide icons (`12px–16px`).

## Components

### Buttons
- **Shape & Primary:** `6px` radius; `#18181B` fill with `#FFFFFF` `12px` medium text (`6px 12px` padding).
- **Secondary & Focus:** `#FFFFFF` fill with `1px` `#E7E5E0` border (`4px 10px` padding); `:focus-visible` draws a `2px` `#B45309` ring (`2px` offset); `.icon-hit` adds a `-6px` touch halo.

### Chips
- **Style & State:** `4px` radius (`2px 6px` padding); `#F0FDFA` / `#0F766E` for confirmed PNRs and dietary tags, `#FEF3C7` / `#B45309` for transit and parser advisories.

### Cards / Containers
- **Style:** `8px` stop and ledger cards (`14px` padding) and `12px` `ElderCardView` (`20px–28px` padding) on `#FFFFFF` with `1px` `#E7E5E0` borders; highlighted stops add `#D6D3CD` and Panel Lift.

### Inputs / Fields
- **Style & Focus:** `6px` radius, `1px solid #E7E5E0`, `#FFFFFF` fill (`#FCFCFA` in Scout box), `12px` `#18181B` text, `#655F5B` placeholder, `#B45309` `:focus-visible` ring.

### Navigation
- **Chrome:** `48px` header (`ScoutBeeMark` + `15px` `itinbee`, route pills, `Elder Card (अ/A)`, `Share link`), `232px` `#F5F5F2` rail, SVG schematic map upgrading on click to `frontend/src/components/map/MapLibreImpl.tsx`, `1px` `#D6D3CD` transit spine, and native `<dialog>` (`frontend/src/components/ui/ModalDialog.tsx`).

## Do's and Don'ts

### Do:
- **Do** open task and sandbox routes directly into live itinerary data on `#FCFCFA` and `#F5F5F2` with `1px` `#E7E5E0` borders.
- **Do** set clocks, PNRs, vehicle codes, indices, and INR/FX amounts in `JetBrains Mono` (`tabular-nums`).
- **Do** keep compact text `>=4.5:1` (`#18181B` on `#FFFFFF`, `#FFFFFF` on `#B45309` at `5.02:1`, or `#18181B` on `#D97706` at `5.56:1`).
- **Do** step `ElderCardView` up to `18px` with `1.7` Devanagari line-height and route view switches via `frontend/src/lib/view-transition.ts`.

### Don't:
- **Don't** place kickers or uppercase eyebrow labels above headings.
- **Don't** pair `#FFFFFF` on `#D97706` (`3.19:1`) or `#78716C` on `#F5F5F2` (`4.39:1`) for `11px–12px` text.
- **Don't** strip the `#B45309` `:focus-visible` ring on inputs without an explicit `:focus-visible` replacement.
- **Don't** use one-sided card border stripes, hard offset shadows, gradient text, or nested card grids.
- **Don't** load `maplibre-gl` eagerly on initial paint or call Google Places APIs.
