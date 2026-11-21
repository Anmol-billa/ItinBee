/** Lower-cases, strips diacritics/punctuation and generic noise words so "The Hawa Mahal (Palace of Winds)" ~ "hawa mahal". */
export function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(the|of|de|la|le|el|al|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameTokens(input: string): string[] {
  return normalizeName(input)
    .split(' ')
    .filter((t) => t.length > 1);
}

/** True when the shorter token set is (almost) entirely contained in the longer one. */
export function namesSimilar(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hit = 0;
  for (const t of small) if (large.has(t)) hit += 1;
  if (small.size === 1) {
    // single-token names must match exactly a token and the other name must not be much longer
    return hit === 1 && large.size <= 3;
  }
  return hit / small.size >= 0.8;
}

export function slugify(input: string): string {
  return normalizeName(input).replace(/\s+/g, '-').slice(0, 80);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function clean(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const v = value.replace(/\s+/g, ' ').trim();
  return v.length > 0 ? v : null;
}

const LOWERCASE_CONNECTORS = new Set([
  'and',
  'of',
  'in',
  'at',
  'the',
  'by',
  'to',
  'on',
  'for',
  'de',
  'la',
  'du',
  'des',
  'ki',
  'ka',
  'ke',
]);

/**
 * Ensures place/city titles are properly title-cased ("hanoi" -> "Hanoi", "north goa" -> "North Goa")
 * without clobbering mixed-case names like "McLeodganj" or acronyms like "MG" / "DEL".
 */
export function toTitleCasePlaceName(input: string): string {
  const trimmed = input.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return trimmed
    .split(' ')
    .map((word, idx) => {
      if (!word) return word;
      // Preserve words that already carry uppercase letters (acronyms, camelCase, proper nouns)
      if (word !== word.toLowerCase()) return word;
      if (idx > 0 && LOWERCASE_CONNECTORS.has(word)) return word;
      return word.replace(/^(\p{L})/u, (m) => m.toUpperCase());
    })
    .join(' ');
}

/**
 * Slices text cleanly at word boundaries (never chopping mid-word).
 */
export function sliceAtWordBoundary(input: string, maxChars: number): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  const cut = normalized.slice(0, Math.max(1, maxChars - 1));
  const lastSpace = cut.lastIndexOf(' ');
  const safe = lastSpace >= Math.min(12, Math.floor(maxChars * 0.4)) ? cut.slice(0, lastSpace) : cut;
  return `${safe.replace(/[,;:\-–—]+$/, '').trimEnd()}…`;
}

/**
 * Extracts a clean, readable quote around `[matchStart, matchStart + matchLen]` aligned to sentence
 * and word boundaries so substrings never begin mid-word (e.g. never `"ust visit Amber Fort"`).
 */
export function extractCleanQuote(
  text: string,
  matchStart: number,
  matchLen: number,
  maxChars = 90
): string {
  if (!text) return '';
  const matchEnd = Math.min(text.length, matchStart + matchLen);

  // Locate enclosing line / sentence boundaries
  let sentStart = matchStart;
  while (sentStart > 0 && !/[\n.!?;]/.test(text[sentStart - 1]!)) {
    sentStart -= 1;
  }
  let sentEnd = matchEnd;
  while (sentEnd < text.length && !/[\n.!?;]/.test(text[sentEnd]!)) {
    sentEnd += 1;
  }

  const fullClause = text.slice(sentStart, sentEnd).replace(/\s+/g, ' ').trim();
  if (fullClause.length <= maxChars && fullClause.length > 0) {
    return fullClause;
  }

  // Otherwise build a window around the match snapped strictly to whole words
  let winStart = Math.max(sentStart, matchStart - 24);
  if (winStart > sentStart) {
    // If we landed mid-word, step left up to 12 chars to include the start of that word (e.g. "Must"),
    // otherwise advance to the next space so we never slice mid-word.
    let backWord = winStart;
    while (backWord > sentStart && backWord > winStart - 12 && !/\s/.test(text[backWord - 1]!)) {
      backWord -= 1;
    }
    if (backWord === sentStart || /\s/.test(text[backWord - 1]!)) {
      winStart = backWord;
    } else {
      while (winStart < matchStart && !/\s/.test(text[winStart]!)) {
        winStart += 1;
      }
    }
  }
  while (winStart < matchStart && /[\s,;:\-–—]/.test(text[winStart]!)) {
    winStart += 1;
  }

  let winEnd = Math.min(sentEnd, Math.max(matchEnd + 24, winStart + maxChars));
  if (winEnd < sentEnd && /\S/.test(text[winEnd] ?? '')) {
    const prevSpace = text.lastIndexOf(' ', winEnd);
    if (prevSpace >= matchEnd) {
      winEnd = prevSpace;
    } else {
      while (winEnd < sentEnd && /\S/.test(text[winEnd]!)) {
        winEnd += 1;
      }
    }
  }

  const snippet = text.slice(winStart, winEnd).replace(/\s+/g, ' ').trim();
  const prefix = winStart > sentStart ? '…' : '';
  const suffix = winEnd < sentEnd ? '…' : '';
  return `${prefix}${snippet.replace(/[,;:\-–—]+$/, '')}${suffix}`;
}

/**
 * Ensures image objects never carry empty or non-HTTP(S) URLs (`{ url: "" }` -> `null`).
 */
export function sanitizeImageObject<T extends { url: string }>(
  img: T | null | undefined
): T | null {
  if (!img || typeof img.url !== 'string') return null;
  let url = img.url.trim();
  if (!url) return null;
  if (url.startsWith('//')) {
    url = `https:${url}`;
  }
  if (!/^https?:\/\/\S+/i.test(url)) {
    return null;
  }
  return url === img.url ? img : { ...img, url };
}
