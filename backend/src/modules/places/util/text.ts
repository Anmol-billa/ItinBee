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
