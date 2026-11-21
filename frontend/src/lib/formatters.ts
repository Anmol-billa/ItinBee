/**
 * Shared human-readable enum formatters, destination summary day-count sync,
 * and PII / seat / PNR redaction helpers for English & Hindi Elder Cards.
 */

const TAG_LABELS: Record<string, string> = {
  pure_veg: 'Pure Veg',
  'pure-veg': 'Pure Veg',
  vegetarian: 'Vegetarian',
  veg: 'Vegetarian',
  satvik: 'Satvik',
  sattvic: 'Satvik',
  veg_friendly: 'Veg Friendly',
  'veg-friendly': 'Veg Friendly',
  veg_options: 'Veg Friendly',
  'veg-options': 'Veg Friendly',
  veg_prebook: 'Veg (Pre-book)',
  'veg-prebook': 'Veg (Pre-book)',
  vegan_chay: 'Vegan / Chay',
  'vegan-chay': 'Vegan / Chay',
  shojin_veg: 'Shojin Veg',
  'shojin-veg': 'Shojin Veg',
  eggless_options: 'Eggless',
  'eggless-options': 'Eggless',
  eggless: 'Eggless',
  non_drinker: 'No Alcohol',
  'non-drinker': 'No Alcohol',
  no_alcohol: 'No Alcohol',
  'no-alcohol': 'No Alcohol',
  jain: 'Jain',
  jain_available: 'Jain',
  'jain-available': 'Jain',
  'jain-friendly': 'Jain',
  jain_friendly: 'Jain',
  vegan: 'Vegan',
  halal: 'Halal',
  seafood: 'Seafood',
  wheelchair: 'Wheelchair Friendly',
  wheelchair_accessible: 'Wheelchair Friendly',
  'wheelchair-accessible': 'Wheelchair Friendly',
  step_free: 'Step-Free',
  'step-free': 'Step-Free',
  low_stairs: 'Low Stairs',
  'low-stairs': 'Low Stairs',
  minimal_stairs: 'Low Stairs',
  elevator: 'Lift Access',
  lift: 'Lift Access',
};

export function formatDietaryTag(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const key = trimmed.toLowerCase();
  if (TAG_LABELS[key]) return TAG_LABELS[key]!;
  const normalizedKey = key.replace(/[\s-]+/g, '_');
  if (TAG_LABELS[normalizedKey]) return TAG_LABELS[normalizedKey]!;
  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Redacts PNR, Coach, Berth, and Seat tokens from English and Hindi (Devanagari)
 * Elder Card / Guest Share strings so switching `/t/[shortId]` to Hindi never leaks
 * passenger coach/seat/PNR details.
 */
export function redactSharedSummaryText(input: string | null | undefined): string {
  if (!input) return '';
  let out = input;

  // English PNR / Coach / Seat / Berth patterns
  out = out.replace(/\bPNR\s*[:#-]?\s*[A-Za-z0-9•*-]{4,}\b/gi, '');
  out = out.replace(/\bCoach\s+[A-Za-z0-9-]+\b/gi, '');
  out = out.replace(/\bSeats?\s+[0-9A-Za-z][0-9A-Za-z,\s–—-]*(?=[),.।;]|$)/gi, '');
  out = out.replace(/\bBerths?\s+[0-9A-Za-z][0-9A-Za-z,\s–—-]*(?=[),.।;]|$)/gi, '');

  // Hindi / Devanagari पीएनआर / कोच / सीट / बर्थ patterns (requires number/code after कोच/सीट/बर्थ so "सीट पर" stays intact)
  out = out.replace(/पीएनआर\s*[:#-]?\s*[A-Za-z0-9•*\u0966-\u096F-]{4,}/g, '');
  out = out.replace(/कोच\s+[A-Za-z0-9\u0966-\u096F-]+/g, '');
  out = out.replace(
    /सीट(?:ें|ों)?\s+[0-9A-Za-z\u0966-\u096F][0-9A-Za-z\u0966-\u096F,\s–—-]*(?=[),.।;]|$)/g,
    ''
  );
  out = out.replace(
    /बर्थ\s+[0-9A-Za-z\u0966-\u096F][0-9A-Za-z\u0966-\u096F,\s–—-]*(?=[),.।;]|$)/g,
    ''
  );

  // Clean up leftover empty brackets, stray commas/dots inside parentheses, and extra spaces
  out = out
    .replace(/\(\s*[,·;–—-]*\s*\)/g, '')
    .replace(/\(\s*[,·;–—-]+\s*/g, '(')
    .replace(/\s*[,·;–—-]+\s*\)/g, ')')
    .replace(/\s+([,।.;)])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return out;
}

/**
 * Updates any `(ND)` suffix/token in `destinationSummary` (e.g. `"Munnar (3D)"` -> `"Munnar (4D)"`)
 * whenever days are added or deleted locally.
 */
export function syncDestinationSummaryDays(
  destinationSummary: string,
  dayCount: number
): string {
  if (!destinationSummary || dayCount < 1) return destinationSummary;
  if (/\(\d+D\)/i.test(destinationSummary)) {
    return destinationSummary.replace(/\(\d+D\)/gi, `(${dayCount}D)`);
  }
  return destinationSummary;
}

/**
 * Checks whether an image URL is non-empty and safe to render.
 */
export function isNonEmptyImageUrl(url: string | null | undefined): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return trimmed.startsWith('/') || /^https?:\/\/\S+/i.test(trimmed);
}
