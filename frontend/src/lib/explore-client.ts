import { SAMPLE_WORKSPACES } from '@/data/sample-trips';
import { SHOWCASE } from '@/data/showcase';
import { getPhoto } from '@/lib/photos';
import type { TripWorkspace } from '@/lib/types';

/* ----- Contract types (plan/05_api_contracts_import_explore.md) ----- */

export interface ImageCredit {
  url: string;
  author: string;
  license: string;
  sourceUrl: string;
}

export type BudgetTier = 'budget' | 'mid' | 'premium';

export interface ExploreCard {
  slug: string;
  title: string;
  summary: string;
  coverImage: ImageCredit | null;
  durationDays: number;
  stopCount: number;
  destinations: Array<{ slug: string; name: string }>;
  tripTypes: string[];
  budgetTier: BudgetTier | null;
  bestMonths: number[];
  origin: 'template' | 'user';
  /** True for the built-in sample itineraries shown before the template library is published. */
  sample?: boolean;
  authorName?: string;
  cloneCount: number;
  publishedAt: string;
}

export interface ExploreDetailItem {
  id: string;
  kind: 'stay' | 'transit' | 'activity' | 'meal' | 'note';
  title: string;
  notes: string;
  lat: number | null;
  lng: number | null;
  startTime: string | null;
  durationMins: number | null;
  placeRefId: string | null;
  image?: ImageCredit;
}

export interface ExploreDetail extends ExploreCard {
  days: Array<{ dayNumber: number; title: string; items: ExploreDetailItem[] }>;
  mapAttribution: string;
  /** Where "Use this itinerary" goes when the clone API is not available (sample itineraries). */
  openHref?: string;
}

export interface ExploreResult {
  items: ExploreCard[];
  nextCursor: string | null;
  total: number;
  facets: { durations: Record<string, number>; types: Record<string, number> };
  /** True when the live Explore API was not reachable and sample itineraries are shown. */
  fallback: boolean;
}

export interface ExploreQuery {
  dest?: string;
  q?: string;
  days?: string;
  type?: string;
  budget?: string;
  month?: string;
  sort?: 'popular' | 'newest' | 'shortest';
  cursor?: string;
}

export const DURATION_BUCKETS = [
  { id: '1-3', label: '1–3 days' },
  { id: '4-6', label: '4–6 days' },
  { id: '7-10', label: '7–10 days' },
  { id: '11-', label: '10+ days' },
] as const;

export const TRIP_TYPES = [
  'family', 'couple', 'friends', 'solo', 'pilgrimage', 'adventure', 'food', 'heritage',
] as const;

export const BUDGETS: Array<{ id: BudgetTier; label: string }> = [
  { id: 'budget', label: 'Budget' },
  { id: 'mid', label: 'Mid-range' },
  { id: 'premium', label: 'Premium' },
];

/* ----- Helpers ----- */

function apiBase(): string {
  const internal = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || '127.0.0.1:4000';
  const normalized = internal.startsWith('http') ? internal : `http://${internal}`;
  return normalized.replace(/\/+$/, '');
}

export function parseDays(range: string | undefined): [number, number] | null {
  if (!range) return null;
  const m = /^(\d*)-(\d*)$/.exec(range);
  if (!m) return null;
  const min = m[1] ? Number(m[1]) : 0;
  const max = m[2] ? Number(m[2]) : Number.POSITIVE_INFINITY;
  return [min, max];
}

export function queryToSearchParams(q: ExploreQuery): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v) sp.set(k, String(v));
  }
  return sp;
}

/* ----- Live API with sample fallback ----- */

export async function fetchExplore(query: ExploreQuery): Promise<ExploreResult> {
  try {
    const res = await fetch(`${apiBase()}/v1/explore?${queryToSearchParams(query).toString()}`, {
      ...(process.env.NODE_ENV === 'production'
        ? { next: { revalidate: 60 } }
        : { cache: 'no-store' }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as Omit<ExploreResult, 'fallback'>;
      return { ...data, fallback: false };
    }
  } catch (err) {
    // Handle TimeoutError, AbortError, or offline network errors gracefully
    void err;
  }
  return sampleExplore(query);
}

export async function fetchExploreDetail(slug: string): Promise<ExploreDetail | null> {
  try {
    const res = await fetch(`${apiBase()}/v1/explore/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return (await res.json()) as ExploreDetail;
    if (res.status !== 404) return sampleDetail(slug);
  } catch (err) {
    void err;
    return sampleDetail(slug);
  }
  return sampleDetail(slug);
}

/* ----- Sample itineraries (used only until the template library is published) ----- */

interface SampleMeta {
  photoSlug: string;
  destinations: Array<{ slug: string; name: string }>;
  tripTypes: string[];
  budgetTier: BudgetTier;
  bestMonths: number[];
  summary: string;
}

const SAMPLE_META: Record<string, SampleMeta> = {
  'rishi-lnd-4d': {
    photoSlug: 'rishikesh',
    destinations: [
      { slug: 'uttarakhand', name: 'Uttarakhand' },
      { slug: 'rishikesh', name: 'Rishikesh' },
      { slug: 'mussoorie', name: 'Mussoorie' },
    ],
    tripTypes: ['friends', 'family'],
    budgetTier: 'mid',
    bestMonths: [9, 10, 11, 2, 3, 4],
    summary: 'Ganga aarti at Haridwar, ghat walks in Rishikesh and a slow ridge stay in Landour, by train and hill cab.',
  },
  'goa-south-5d': {
    photoSlug: 'goa',
    destinations: [{ slug: 'goa', name: 'Goa' }],
    tripTypes: ['friends', 'couple'],
    budgetTier: 'mid',
    bestMonths: [11, 12, 1, 2],
    summary: 'South Goa without the crowds: Agonda cliff stay, Cabo de Rama and Fontainhas, reached by the Konkan rail line.',
  },
  'kashi-snr-3d': {
    photoSlug: 'varanasi',
    destinations: [
      { slug: 'uttar-pradesh', name: 'Uttar Pradesh' },
      { slug: 'varanasi', name: 'Varanasi' },
    ],
    tripTypes: ['pilgrimage', 'family', 'heritage'],
    budgetTier: 'budget',
    bestMonths: [10, 11, 12, 1, 2, 3],
    summary: 'A paced Kashi yatra for seniors: sugam darshan, Ganga aarti and Sarnath, with rest buffers and veg notes.',
  },
  'vietnam-7d': {
    photoSlug: 'ha-long-bay',
    destinations: [
      { slug: 'vietnam', name: 'Vietnam' },
      { slug: 'ha-noi', name: 'Hanoi' },
      { slug: 'ha-long-bay', name: 'Ha Long Bay' },
    ],
    tripTypes: ['friends', 'couple', 'food'],
    budgetTier: 'mid',
    bestMonths: [10, 11, 12, 1, 2, 3, 4],
    summary: 'Hanoi Old Quarter, a Ha Long Bay night and Da Nang to Hoi An, planned in INR from Bengaluru.',
  },
};

function dayCount(ws: TripWorkspace): number {
  const real = ws.days.filter((d) => !d.deletedAt).length;
  const m = /\((\d+)D\)/.exec(ws.trip.destinationSummary);
  return m ? Number(m[1]) : real;
}

function sampleCard(shortId: string, ws: TripWorkspace): ExploreCard {
  const meta = SAMPLE_META[shortId]!;
  const photo = getPhoto(meta.photoSlug);
  return {
    slug: shortId,
    title: ws.trip.title,
    summary: meta.summary,
    coverImage: { url: photo.src, author: photo.author, license: photo.license, sourceUrl: photo.sourceUrl },
    durationDays: dayCount(ws),
    stopCount: ws.items.filter((i) => !i.deletedAt && i.kind !== 'note').length,
    destinations: meta.destinations,
    tripTypes: meta.tripTypes,
    budgetTier: meta.budgetTier,
    bestMonths: meta.bestMonths,
    origin: 'template',
    sample: true,
    cloneCount: 0,
    publishedAt: ws.trip.createdAt,
  };
}

function matchesSample(card: ExploreCard, q: ExploreQuery): boolean {
  if (q.dest) {
    const d = q.dest.toLowerCase();
    const showcase = SHOWCASE.find((s) => s.slug === d);
    const hit = card.destinations.some(
      (x) => x.slug === d || (showcase && x.name.toLowerCase().includes(showcase.name.toLowerCase().split(' ')[0]!))
    );
    if (!hit) return false;
  }
  if (q.q) {
    const hay = `${card.title} ${card.summary} ${card.destinations.map((d) => d.name).join(' ')}`.toLowerCase();
    if (!q.q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false;
  }
  const range = parseDays(q.days);
  if (range && (card.durationDays < range[0] || card.durationDays > range[1])) return false;
  if (q.type) {
    const want = q.type.split(',');
    if (!want.some((t) => card.tripTypes.includes(t))) return false;
  }
  if (q.budget && card.budgetTier !== q.budget) return false;
  if (q.month && !card.bestMonths.includes(Number(q.month))) return false;
  return true;
}

function sampleExplore(query: ExploreQuery): ExploreResult {
  const all = Object.entries(SAMPLE_WORKSPACES)
    .filter(([key]) => SAMPLE_META[key])
    .map(([key, ws]) => sampleCard(key, ws));
  let items = all.filter((c) => matchesSample(c, query));
  if (query.sort === 'shortest') items = [...items].sort((a, b) => a.durationDays - b.durationDays);

  const facets = { durations: {} as Record<string, number>, types: {} as Record<string, number> };
  for (const c of all) {
    for (const b of DURATION_BUCKETS) {
      const [min, max] = parseDays(b.id)!;
      if (c.durationDays >= min && c.durationDays <= max) facets.durations[b.id] = (facets.durations[b.id] ?? 0) + 1;
    }
    for (const t of c.tripTypes) facets.types[t] = (facets.types[t] ?? 0) + 1;
  }
  return { items, nextCursor: null, total: items.length, facets, fallback: true };
}

function sampleDetail(slug: string): ExploreDetail | null {
  const ws = SAMPLE_WORKSPACES[slug];
  if (!ws || !SAMPLE_META[slug]) return null;
  const card = sampleCard(slug, ws);
  const days = ws.days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((d) => ({
      dayNumber: d.dayNumber,
      title: d.themeTitle,
      items: ws.items
        .filter((i) => i.dayId === d.id && !i.deletedAt)
        .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.sortKey.localeCompare(b.sortKey))
        .map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          notes: i.notes,
          lat: i.lat,
          lng: i.lng,
          startTime: i.startTime,
          durationMins: i.durationMins,
          placeRefId: i.placeRefId,
        })),
    }));
  return { ...card, days, mapAttribution: ws.trip.mapAttribution, openHref: `/trip/${slug}` };
}
