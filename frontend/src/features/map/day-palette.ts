export const DAY_PALETTE = [
  '#C7361F', // Day 1 — Vermilion
  '#0E5A47', // Day 2 — Trunk Green
  '#1D4ED8', // Day 3 — Cobalt Blue
  '#9333EA', // Day 4 — Royal Plum
  '#B45309', // Day 5 — Deep Amber
  '#0F766E', // Day 6 — Signal Teal
  '#BE185D', // Day 7 — Mulberry Rose
] as const;

export type DayPaletteHex = (typeof DAY_PALETTE)[number];

export const DAY_PALETTE_LABELS = [
  'Vermilion',
  'Trunk Green',
  'Cobalt',
  'Plum',
  'Amber',
  'Teal',
  'Mulberry',
] as const;

/**
 * Returns a deterministic, color-blind-distinguishable hex color for a 1-indexed trip day.
 * Every color in DAY_PALETTE guarantees >= 4.5:1 contrast against #FFFFFF text.
 */
export function getDayColor(dayNumber: number): DayPaletteHex {
  const normalized = Number.isFinite(dayNumber) && dayNumber >= 1 ? Math.floor(dayNumber) : 1;
  const idx = (normalized - 1) % DAY_PALETTE.length;
  return DAY_PALETTE[idx]!;
}

export function getDayPaletteLabel(dayNumber: number): string {
  const normalized = Number.isFinite(dayNumber) && dayNumber >= 1 ? Math.floor(dayNumber) : 1;
  const idx = (normalized - 1) % DAY_PALETTE_LABELS.length;
  return DAY_PALETTE_LABELS[idx]!;
}

export function buildDayColorLookup(
  days: ReadonlyArray<{ id: string; dayNumber: number }>
): Map<string, { dayNumber: number; color: DayPaletteHex }> {
  const map = new Map<string, { dayNumber: number; color: DayPaletteHex }>();
  for (const d of days) {
    map.set(d.id, {
      dayNumber: d.dayNumber,
      color: getDayColor(d.dayNumber),
    });
  }
  return map;
}
