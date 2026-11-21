import type { PlaceCategory } from './types.js';

export interface PopularitySignals {
  /** Trailing Wikipedia pageviews (0 when there is no article). */
  pageviews: number;
  /** Wikidata sitelink count (0 when unknown). */
  sitelinks: number;
  /** 0-1: presence of wikipedia/wikidata/website/opening_hours/... */
  tagCompleteness: number;
  /** 0-1: Wikivoyage listing prominence (0 when not listed). */
  wikivoyageProminence: number;
}

export const POPULARITY_WEIGHTS = {
  pageviews: 0.35,
  sitelinks: 0.25,
  tagCompleteness: 0.2,
  wikivoyage: 0.2,
} as const;

export interface CompletenessFlags {
  hasWikipedia: boolean;
  hasWikidata: boolean;
  hasWebsite: boolean;
  hasOpeningHours: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  hasDescription: boolean;
  hasImage: boolean;
}

export function tagCompleteness(f: CompletenessFlags): number {
  const score =
    (f.hasWikipedia ? 0.2 : 0) +
    (f.hasWikidata ? 0.15 : 0) +
    (f.hasWebsite ? 0.2 : 0) +
    (f.hasOpeningHours ? 0.15 : 0) +
    (f.hasPhone ? 0.07 : 0) +
    (f.hasAddress ? 0.08 : 0) +
    (f.hasDescription ? 0.1 : 0) +
    (f.hasImage ? 0.05 : 0);
  return Math.min(1, score);
}

/** Wikivoyage prominence: being listed at all counts, longer write-ups count more. */
export function wikivoyageProminence(listed: boolean, contentLength: number): number {
  if (!listed) return 0;
  return 0.5 + 0.5 * Math.min(1, contentLength / 300);
}

/**
 * Popularity in [0, 1], normalised per destination: log-scaled pageviews and sitelinks are scaled by the
 * destination maximum, blended with completeness and Wikivoyage prominence, and the blend is divided by the
 * destination's best score so the most popular place scores 1.
 */
export function computePopularity(signals: readonly PopularitySignals[]): number[] {
  if (signals.length === 0) return [];
  const maxLogPv = Math.max(1e-9, ...signals.map((s) => Math.log1p(s.pageviews)));
  const maxLogSl = Math.max(1e-9, ...signals.map((s) => Math.log1p(s.sitelinks)));
  const raw = signals.map(
    (s) =>
      POPULARITY_WEIGHTS.pageviews * (Math.log1p(s.pageviews) / maxLogPv) +
      POPULARITY_WEIGHTS.sitelinks * (Math.log1p(s.sitelinks) / maxLogSl) +
      POPULARITY_WEIGHTS.tagCompleteness * s.tagCompleteness +
      POPULARITY_WEIGHTS.wikivoyage * s.wikivoyageProminence
  );
  const max = Math.max(1e-9, ...raw);
  return raw.map((r) => Math.round((r / max) * 1000) / 1000);
}

export interface RankInput {
  id: string;
  category: PlaceCategory;
  subtype: string | null;
  popularity: number;
}

export const RANK_CATEGORY_DECAY = 0.9;
export const RANK_SUBTYPE_DECAY = 0.85;

/**
 * Diversity-aware ordering. Each category's best item gets a full base score; every additional pick from the
 * same category (or from the same subtype beyond two) is discounted, so the unfiltered feed interleaves
 * categories and a category list does not become ten identical temples.
 * Returns ids best-first together with a monotone rank score in (0, 1].
 */
export function rankWithDiversity(items: readonly RankInput[]): Array<{ id: string; rankScore: number }> {
  if (items.length === 0) return [];
  const maxByCategory = new Map<PlaceCategory, number>();
  for (const it of items) {
    maxByCategory.set(it.category, Math.max(maxByCategory.get(it.category) ?? 0, it.popularity));
  }
  const base = new Map<string, number>();
  for (const it of items) {
    const max = Math.max(maxByCategory.get(it.category) ?? 0, 1e-9);
    base.set(it.id, 0.5 * it.popularity + 0.5 * (it.popularity / max));
  }

  const remaining = [...items].sort((a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id));
  const catCount = new Map<PlaceCategory, number>();
  const subCount = new Map<string, number>();
  const ordered: string[] = [];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < remaining.length; i += 1) {
      const it = remaining[i] as RankInput;
      const cc = catCount.get(it.category) ?? 0;
      const sk = `${it.category}:${it.subtype ?? ''}`;
      const sc = subCount.get(sk) ?? 0;
      const score =
        (base.get(it.id) as number) *
        RANK_CATEGORY_DECAY ** cc *
        RANK_SUBTYPE_DECAY ** Math.max(0, sc - 1);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const [picked] = remaining.splice(bestIdx, 1) as [RankInput];
    catCount.set(picked.category, (catCount.get(picked.category) ?? 0) + 1);
    const sk = `${picked.category}:${picked.subtype ?? ''}`;
    subCount.set(sk, (subCount.get(sk) ?? 0) + 1);
    ordered.push(picked.id);
  }

  const n = ordered.length;
  return ordered.map((id, idx) => ({ id, rankScore: Math.round(((n - idx) / n) * 10000) / 10000 }));
}
