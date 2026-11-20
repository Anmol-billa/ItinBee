const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length; // 62
const MIN_CHAR = ALPHABET[0]!; // '0'
const MAX_CHAR = ALPHABET[BASE - 1]!; // 'z'
const MID_CHAR = ALPHABET[Math.floor(BASE / 2)]!; // 'V'

function charIndex(ch: string): number {
  const idx = ALPHABET.indexOf(ch);
  return idx === -1 ? 0 : idx;
}

/**
 * Generates a lexorank fractional `sort_key` strictly between `prev` and `next`
 * using ASCII-ordered base-62 characters so PostgreSQL `ORDER BY sort_key ASC, id ASC`
 * and JS string comparison produce identical results.
 */
export function betweenSortKeys(
  prev?: string | null,
  next?: string | null
): string {
  const a = prev && prev.length > 0 ? prev : '';
  const b = next && next.length > 0 ? next : '';

  if (!a && !b) {
    return 'V0';
  }
  if (!a) {
    // Strictly before `b`
    let i = 0;
    while (i < b.length && b[i] === MIN_CHAR) {
      i++;
    }
    if (i < b.length) {
      const idx = charIndex(b[i]!);
      if (idx > 1) {
        return b.slice(0, i) + ALPHABET[Math.floor(idx / 2)]!;
      }
      return b.slice(0, i) + MIN_CHAR + MID_CHAR;
    }
    return MIN_CHAR + MID_CHAR;
  }
  if (!b) {
    // Strictly after `a`
    const lastIdx = charIndex(a[a.length - 1]!);
    if (lastIdx < BASE - 2) {
      const step = Math.min(lastIdx + 2, BASE - 2);
      return a.slice(0, -1) + ALPHABET[step]!;
    }
    return a + MID_CHAR;
  }

  // If offline clients passed equal or inverted bounds, append midpoint safely after `a`
  if (a >= b) {
    return a + MID_CHAR;
  }

  let prefix = '';
  let i = 0;
  while (true) {
    const ca = i < a.length ? charIndex(a[i]!) : 0;
    const cb = i < b.length ? charIndex(b[i]!) : BASE;

    if (ca === cb) {
      prefix += ALPHABET[ca]!;
      i++;
      continue;
    }

    if (cb - ca > 1) {
      const mid = Math.floor((ca + cb) / 2);
      return prefix + ALPHABET[mid]!;
    }

    // Adjacent characters (`cb - ca === 1`): step deeper on `a` branch
    prefix += ALPHABET[ca]!;
    i++;
    // Now find midpoint between `a.slice(i)` and full base (`MAX_CHAR...`)
    while (i < a.length && charIndex(a[i]!) === BASE - 1) {
      prefix += MAX_CHAR;
      i++;
    }
    const nextA = i < a.length ? charIndex(a[i]!) : 0;
    const midAfter = Math.floor((nextA + BASE) / 2);
    return prefix + ALPHABET[midAfter]!;
  }
}

export function generateInitialSortKeys(count: number): string[] {
  const keys: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < count; i++) {
    const next = betweenSortKeys(prev, null);
    keys.push(next);
    prev = next;
  }
  return keys;
}

/**
 * Deterministic `(sort_key, id)` tuple tie-break when two offline clients
 * concurrently insert items at the exact same `sort_key` slot.
 */
export function compareBySortKeyAndId(
  a: { sortKey: string; id: string },
  b: { sortKey: string; id: string }
): number {
  if (a.sortKey < b.sortKey) return -1;
  if (a.sortKey > b.sortKey) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
