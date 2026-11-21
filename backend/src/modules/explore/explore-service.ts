import type pg from 'pg';
import { redactAadhaarNumbers } from '../../security/aadhaar-redactor.js';
import {
  getSharedPgPool,
  releaseSharedPgPool,
} from '../../store/shared-pool.js';
import type { PlacesServices } from '../places/places-module.js';
import { estimateLegTransit } from '../places/providers/openrouteservice.js';
import { haversineMeters } from '../places/util/geo.js';
import type { TripStore } from '../../store/repository.js';
import {
  LOCAL_PHOTO_CREDITS,
  materializeTemplates,
} from './template-catalog.js';
import type {
  ExploreBudgetTier,
  ExploreCard,
  ExploreDay,
  ExploreDetail,
  ExploreFacets,
  ExploreListResponse,
  ExploreQueryInput,
  ImageCredit,
} from './types.js';

const DEST_SLUG_ALIASES: Record<string, string> = {
  'ha-noi': 'hanoi',
  'ha-long-bay': 'ha-long',
  'halong-bay': 'ha-long',
  halong: 'ha-long',
  'swaraj-dweep': 'havelock',
  'havelock-island': 'havelock',
  puducherry: 'pondicherry',
  pondy: 'pondicherry',
  alappuzha: 'alleppey',
  cochin: 'kochi',
  banaras: 'varanasi',
  kashi: 'varanasi',
  'leh-ladakh': 'ladakh',
  andaman: 'andaman-nicobar',
  andamans: 'andaman-nicobar',
  uae: 'united-arab-emirates',
  uk: 'united-kingdom',
  sohra: 'cherrapunji',
  mcleodganj: 'dharamshala',
  mysore: 'mysuru',
  madikeri: 'coorg',
  kodagu: 'coorg',
  udhagamandalam: 'ooty',
};

const DURATION_BUCKETS: ReadonlyArray<{ id: string; min: number; max: number }> = [
  { id: '1-3', min: 1, max: 3 },
  { id: '4-6', min: 4, max: 6 },
  { id: '7-10', min: 7, max: 10 },
  { id: '11-', min: 11, max: Number.POSITIVE_INFINITY },
];

/**
 * Strips/redacts personal booking identifiers (Aadhaar, raw PNR digits, Coach/Chair Car/Bogie,
 * and Berth/Seat assignments in both English and Devanagari Hindi) from public Explore previews
 * and cloned templates.
 */
export function sanitizeExplorePublicText(raw: string | undefined | null): string {
  if (!raw) return '';
  let out = redactAadhaarNumbers(raw).redactedText;

  // 1. Explicit PNR / Booking Ref / पीएनआर tokens
  out = out.replace(
    /(?:\b(?:pnr|booking\s*(?:id|ref|reference)|confirmation\s*code|tin)\b|पीएनआर)\s*(?:no\.?|number|संख्या|नं\.?|#|:|-)?\s*[A-Za-z0-9\u0966-\u096F-]{5,16}/giu,
    ''
  );

  // 2. Bare 10-digit IRCTC PNRs (ASCII or Devanagari digits)
  out = out.replace(/(?<![\d+])\d{10}(?!\d)/g, '');
  out = out.replace(/[\u0966-\u096F]{10}/gu, '');

  // 3. Parenthetical coach/seat groups e.g. "(Chair Car C4)", "(कोच B4, बर्थ 32)"
  out = out.replace(
    /\(\s*(?:coach|chair\s*car|bogie|कोच|बोगी|सीट|बर्थ)[^)]*\)/giu,
    ''
  );

  // 4. Inline English Coach / Chair Car / Bogie tokens
  out = out.replace(
    /\b(?:coach|chair\s*car|bogie)\s*(?:no\.?|#|:)?\s*[A-Z]{1,3}[-\s]?\d{1,2}\b[,.;]?/gi,
    ''
  );

  // 5. Inline Hindi कोच / बोगी tokens
  out = out.replace(
    /(?:कोच|बोगी)\s*(?:संख्या|नं\.?|:|-)?\s*[A-Za-z0-9\u0966-\u096F-]{1,6}[,.;।]?/gu,
    ''
  );

  // 6. Inline English Berth / Seat tokens ("Seats 21–22", "Berth 32 Lower", "Seat 12A")
  out = out.replace(
    /\b(?:berths?|seats?)\s*(?:no\.?|number|#|:)?\s*[A-Z]?\d{1,3}[A-Z]?(?:\s*[–\-/,&]\s*[A-Z]?\d{1,3}[A-Z]?)*(?:\s*(?:lower|upper|middle|side\s+lower|side\s+upper|window|aisle))?\b[,.;]?/gi,
    ''
  );

  // 7. Inline Hindi सीट / बर्थ tokens
  out = out.replace(
    /(?:सीटें?|सीट|बर्थ)\s*(?:संख्या|नं\.?|:|-)?\s*[A-Za-z0-9\u0966-\u096F–\-,/]{1,12}(?:\s*(?:लोअर|अपर|मिडिल|साइड\s*लोअर|साइड\s*अपर))?[,.;।]?/gu,
    ''
  );

  // Clean up leftover empty brackets, leading punctuation, and extra spaces
  out = out
    .replace(/\(\s*[,;:\-–—]*\s*\)/g, '')
    .replace(/\s+([,.;।])/g, '$1')
    .replace(/^[,\s;:\-–—]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return out;
}

export function sanitizeElderSummaryI18n(
  i18n: { en?: string; hi?: string } | undefined | null
): { en?: string; hi?: string } | undefined {
  if (!i18n) return undefined;
  const en = i18n.en ? sanitizeExplorePublicText(i18n.en) : undefined;
  const hi = i18n.hi ? sanitizeExplorePublicText(i18n.hi) : undefined;
  if (!en && !hi) return undefined;
  return {
    ...(en ? { en } : {}),
    ...(hi ? { hi } : {}),
  };
}

function sanitizeExploreDays(days: ExploreDay[]): ExploreDay[] {
  return days.map((d) => ({
    ...d,
    items: d.items.map((it) => {
      const sanitizedElder = sanitizeElderSummaryI18n(it.elderSummaryI18n);
      return {
        ...it,
        notes: sanitizeExplorePublicText(it.notes),
        ...(sanitizedElder ? { elderSummaryI18n: sanitizedElder } : { elderSummaryI18n: undefined }),
      };
    }),
  }));
}

export function parseDaysFilter(raw: string | undefined): [number, number] | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const exact = /^\d+$/.exec(trimmed);
  if (exact) {
    const n = Number(trimmed);
    return [n, n];
  }
  const m = /^(\d*)-(\d*)$/.exec(trimmed);
  if (!m) return null;
  const min = m[1] ? Number(m[1]) : 0;
  const max = m[2] ? Number(m[2]) : Number.POSITIVE_INFINITY;
  if (min > max) return null;
  return [min, max];
}

function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const m = Buffer.from(cursor, 'base64url').toString('utf8').match(/^o:(\d+)$/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

interface StoredExploreEntry {
  card: ExploreCard;
  detail: ExploreDetail;
  sourceTripId?: string;
}

export interface PublishTripParams {
  tripId: string;
  requesterUserId: string | null;
  slug?: string;
  summary?: string;
  tripTypes: string[];
  budgetTier?: ExploreBudgetTier | null;
  bestMonths?: number[];
  coverImage?: ImageCredit | null;
}

export class ExplorePublishError extends Error {
  constructor(
    public readonly statusCode: 400 | 401 | 403 | 404,
    message: string
  ) {
    super(message);
    this.name = 'ExplorePublishError';
  }
}

const PG_HYDRATION_TTL_MS = 5_000;

export class ExploreService {
  private readonly entries = new Map<string, StoredExploreEntry>();
  private readonly aliasToSlug = new Map<string, string>();
  private readonly slugByTripId = new Map<string, string>();
  private pool: pg.Pool | null = null;
  private readonly sharedDatabaseUrl: string | null = null;
  private lastPgHydratedAt = 0;

  constructor(
    private readonly deps: {
      store: TripStore;
      places: PlacesServices;
      databaseUrl?: string;
      forceLocalStore?: boolean;
    }
  ) {
    // Seed the curated templates in memory immediately
    for (const tpl of materializeTemplates()) {
      this.entries.set(tpl.card.slug, {
        card: tpl.card,
        detail: tpl.detail,
      });
      for (const alias of tpl.aliases) {
        this.aliasToSlug.set(alias, tpl.card.slug);
      }
    }

    if (!deps.forceLocalStore && deps.databaseUrl) {
      this.sharedDatabaseUrl = deps.databaseUrl;
      this.pool = getSharedPgPool(deps.databaseUrl, 'web');
    }
  }

  private async ensureHydrated(): Promise<void> {
    if (!this.pool) return;
    if (Date.now() - this.lastPgHydratedAt <= PG_HYDRATION_TTL_MS) return;
    this.lastPgHydratedAt = Date.now();
    try {
      const res = await this.pool.query(
        'SELECT slug, trip_id, origin, card_payload, days_payload, clone_count, published_at FROM explore_published_entries'
      );
      for (const row of res.rows) {
        const slug = String(row.slug);
        const card = row.card_payload as ExploreCard;
        const rawDays = (row.days_payload as ExploreDay[]) ?? [];
        const days = sanitizeExploreDays(rawDays);
        card.summary = sanitizeExplorePublicText(card.summary);
        card.cloneCount = Number(row.clone_count ?? card.cloneCount ?? 0);
        card.publishedAt = new Date(String(row.published_at)).toISOString();
        const detail: ExploreDetail = {
          ...card,
          days,
          mapAttribution: '© OpenStreetMap contributors',
        };
        this.entries.set(slug, {
          card,
          detail,
          sourceTripId: row.trip_id ? String(row.trip_id) : undefined,
        });
        if (row.trip_id) {
          this.slugByTripId.set(String(row.trip_id), slug);
        }
      }
    } catch {
      // Table may not be migrated yet in standalone dev; continue with in-memory catalog
    }
  }

  private resolveSlug(slug: string): string {
    const clean = slug.trim().toLowerCase();
    return this.aliasToSlug.get(clean) ?? clean;
  }

  /**
   * Resolves a destination filter slug into itself + all hierarchical descendants
   * (e.g. `india` -> all Indian states & cities; `rajasthan` -> jaipur, udaipur, jodhpur, jaisalmer, pushkar).
   */
  public async resolveDestinationTreeSlugs(rawDest: string): Promise<{
    slugs: Set<string>;
    knownInTree: boolean;
  }> {
    const clean = rawDest.trim().toLowerCase();
    const canonical = DEST_SLUG_ALIASES[clean] ?? clean;
    const slugs = new Set<string>([clean, canonical]);

    // Also include reverse aliases pointing to canonical
    for (const [alias, target] of Object.entries(DEST_SLUG_ALIASES)) {
      if (target === canonical) slugs.add(alias);
    }

    const dest = await this.deps.places.repo.getDestinationBySlug(canonical);
    if (!dest) {
      return { slugs, knownInTree: false };
    }
    const subtree = await this.deps.places.places.subtreeIds(dest);
    for (const d of subtree.destinations) {
      slugs.add(d.slug);
    }
    return { slugs, knownInTree: true };
  }

  public async list(query: ExploreQueryInput): Promise<ExploreListResponse> {
    await this.ensureHydrated();

    let allowedDestSlugs: Set<string> | null = null;
    let rawDestNeedle: string | null = null;
    let knownDestInTree = false;

    if (query.dest?.trim()) {
      rawDestNeedle = query.dest.trim().toLowerCase();
      const resolved = await this.resolveDestinationTreeSlugs(rawDestNeedle);
      allowedDestSlugs = resolved.slugs;
      knownDestInTree = resolved.knownInTree;
    }

    const qTokens = query.q
      ?.trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean) ?? [];

    // 1. Filter by destination hierarchy + search query (facet computation base)
    const baseMatched: ExploreCard[] = [];
    for (const entry of this.entries.values()) {
      const card = entry.card;
      if (allowedDestSlugs) {
        const directHit = card.destinations.some((d) => allowedDestSlugs!.has(d.slug));
        const fallbackSlugHit =
          !knownDestInTree &&
          rawDestNeedle !== null &&
          (card.slug.includes(rawDestNeedle) ||
            card.title.toLowerCase().includes(rawDestNeedle.replace(/-/g, ' ')));
        if (!directHit && !fallbackSlugHit) continue;
      }

      if (qTokens.length > 0) {
        const haystack = [
          card.title,
          card.summary,
          card.destinations.map((d) => `${d.name} ${d.slug}`).join(' '),
          card.tripTypes.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!qTokens.every((tok) => haystack.includes(tok))) continue;
      }

      baseMatched.push(card);
    }

    // 2. Compute facets across baseMatched
    const facets: ExploreFacets = { durations: {}, types: {} };
    for (const b of DURATION_BUCKETS) {
      facets.durations[b.id] = 0;
    }
    for (const card of baseMatched) {
      for (const b of DURATION_BUCKETS) {
        if (card.durationDays >= b.min && card.durationDays <= b.max) {
          facets.durations[b.id] = (facets.durations[b.id] ?? 0) + 1;
        }
      }
      for (const t of card.tripTypes) {
        facets.types[t] = (facets.types[t] ?? 0) + 1;
      }
    }

    // 3. Apply duration, tripTypes, budgetTier, and month filters
    const daysRange = parseDaysFilter(query.days);
    const wantedTypes = query.type
      ? query.type
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      : [];

    let filtered = baseMatched.filter((card) => {
      if (daysRange) {
        if (card.durationDays < daysRange[0] || card.durationDays > daysRange[1]) {
          return false;
        }
      }
      if (wantedTypes.length > 0) {
        const lowerCardTypes = card.tripTypes.map((t) => t.toLowerCase());
        if (!wantedTypes.some((wt) => lowerCardTypes.includes(wt))) {
          return false;
        }
      }
      if (query.budget && card.budgetTier !== query.budget) {
        return false;
      }
      if (query.month !== undefined && !card.bestMonths.includes(query.month)) {
        return false;
      }
      return true;
    });

    // 4. Sort
    const sort = query.sort ?? 'popular';
    filtered = [...filtered].sort((a, b) => {
      if (sort === 'newest') {
        return (
          b.publishedAt.localeCompare(a.publishedAt) ||
          b.cloneCount - a.cloneCount
        );
      }
      if (sort === 'shortest') {
        return (
          a.durationDays - b.durationDays ||
          b.cloneCount - a.cloneCount
        );
      }
      // popular
      return (
        b.cloneCount - a.cloneCount ||
        b.publishedAt.localeCompare(a.publishedAt)
      );
    });

    const total = filtered.length;
    const limit = Math.min(Math.max(query.limit ?? 24, 1), 60);
    const offset = decodeCursor(query.cursor);
    const page = filtered.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const nextCursor = nextOffset < total ? encodeCursor(nextOffset) : null;

    return {
      items: page,
      nextCursor,
      total,
      facets,
    };
  }

  public async getDetail(slug: string): Promise<ExploreDetail | null> {
    await this.ensureHydrated();
    const resolved = this.resolveSlug(slug);
    const entry = this.entries.get(resolved);
    if (!entry) return null;
    return {
      ...entry.detail,
      summary: sanitizeExplorePublicText(entry.detail.summary),
      days: sanitizeExploreDays(entry.detail.days),
      cloneCount: entry.card.cloneCount,
    };
  }

  public async cloneIntoStore(
    slug: string,
    ownerId: string
  ): Promise<{ tripId: string; shortId: string } | null> {
    await this.ensureHydrated();
    const resolved = this.resolveSlug(slug);
    const entry = this.entries.get(resolved);
    if (!entry) return null;

    const detail = entry.detail;
    const sanitizedDays = sanitizeExploreDays(detail.days);
    const daysInput = sanitizedDays.map((d) => ({
      dayNumber: d.dayNumber,
      themeTitle: d.title,
      pacingLevel: (d.items.length <= 3
        ? 'relaxed'
        : d.items.length >= 5
          ? 'packed'
          : 'moderate') as 'relaxed' | 'moderate' | 'packed',
    }));

    const itemsInput: Array<{
      dayNumber: number;
      kind: ExploreDetail['days'][number]['items'][number]['kind'];
      title: string;
      notes: string;
      lat: number | null;
      lng: number | null;
      placeRefId: string | null;
      startTime: string | null;
      durationMins: number | null;
      transitMeta?: Record<string, unknown>;
      elderSummaryI18n?: { en?: string; hi?: string };
    }> = [];

    for (const day of sanitizedDays) {
      let prevCoord: { lat: number; lng: number; title: string } | null = null;
      for (const it of day.items) {
        let transitMeta: Record<string, unknown> = {};
        if (prevCoord && it.lat !== null && it.lng !== null) {
          const est = estimateLegTransit({
            origin: { lat: prevCoord.lat, lng: prevCoord.lng, name: prevCoord.title },
            destination: { lat: it.lat, lng: it.lng, name: it.title },
            departureTimeHHMM: it.startTime ?? undefined,
          });
          transitMeta = {
            mode: est.mode,
            distanceKm: est.distanceKm,
            estimatedDurationMins: est.estimatedDurationMins,
            advisory: est.advisory,
            googleMapsUrl: est.googleMapsUrl,
          };
        }
        if (it.lat !== null && it.lng !== null) {
          prevCoord = { lat: it.lat, lng: it.lng, title: it.title };
        }
        itemsInput.push({
          dayNumber: day.dayNumber,
          kind: it.kind,
          title: it.title,
          notes: it.notes,
          lat: it.lat,
          lng: it.lng,
          placeRefId: it.placeRefId,
          startTime: it.startTime,
          durationMins: it.durationMins,
          transitMeta,
          ...(it.elderSummaryI18n ? { elderSummaryI18n: it.elderSummaryI18n } : {}),
        });
      }
    }

    const ws = await this.deps.store.claimSandboxTrip({
      ownerId,
      title: detail.title,
      destinationSummary: `${detail.destinations.map((d) => d.name).join(' · ')} (${detail.durationDays}D)`,
      homeCurrency: 'INR',
      elderModeEnabled: detail.tripTypes.includes('pilgrimage'),
      days: daysInput,
      items: itemsInput,
    });

    entry.card.cloneCount += 1;
    entry.detail.cloneCount = entry.card.cloneCount;

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO explore_published_entries (slug, trip_id, origin, card_payload, days_payload, clone_count, published_at)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
           ON CONFLICT (slug)
           DO UPDATE SET clone_count = EXCLUDED.clone_count, card_payload = EXCLUDED.card_payload, updated_at = NOW()`,
          [
            entry.card.slug,
            entry.sourceTripId ?? null,
            entry.card.origin,
            JSON.stringify(entry.card),
            JSON.stringify(sanitizedDays),
            entry.card.cloneCount,
            entry.card.publishedAt,
          ]
        );
      } catch {
        // Ignore optional PG sync failure when running without migration 008
      }
    }

    return { tripId: ws.trip.id, shortId: ws.trip.shortId };
  }

  public async publishTrip(params: PublishTripParams): Promise<ExploreCard> {
    if (!params.requesterUserId) {
      throw new ExplorePublishError(
        401,
        'Authentication required to publish an itinerary'
      );
    }

    await this.ensureHydrated();
    const ws = await this.deps.store.getTripWorkspace(
      params.tripId,
      params.requesterUserId
    );
    if (!ws) {
      throw new ExplorePublishError(404, 'Trip not found');
    }

    const member = ws.members.find((m) => m.userId === params.requesterUserId);
    if (!member || (member.role !== 'owner' && member.role !== 'editor')) {
      throw new ExplorePublishError(
        403,
        'Only trip owners or editors can publish this itinerary'
      );
    }

    const activeDays = ws.days
      .filter((d) => !d.deletedAt)
      .sort((a, b) => a.dayNumber - b.dayNumber);
    if (activeDays.length === 0) {
      throw new ExplorePublishError(400, 'Cannot publish an empty trip with no days');
    }

    // Reuse existing slug if republishing the same trip
    const existingSlug = this.slugByTripId.get(params.tripId);
    let slug = existingSlug ?? (params.slug ? slugify(params.slug) : '');
    if (!slug) {
      const base = slugify(ws.trip.title) || 'trip';
      slug = this.entries.has(base) ? `${base}-${ws.trip.shortId.slice(-4)}` : base;
    }

    const days: ExploreDay[] = activeDays.map((d) => ({
      dayNumber: d.dayNumber,
      title: d.themeTitle || `Day ${d.dayNumber}`,
      items: ws.items
        .filter((it) => it.dayId === d.id && !it.deletedAt && !it.isShortlist)
        .sort(
          (a, b) =>
            (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
            a.sortKey.localeCompare(b.sortKey)
        )
        .map((it) => {
          const sanitizedElder = sanitizeElderSummaryI18n(it.elderSummaryI18n);
          return {
            id: it.id,
            kind: it.kind,
            title: it.title,
            notes: sanitizeExplorePublicText(it.notes),
            lat: it.lat,
            lng: it.lng,
            startTime: it.startTime,
            durationMins: it.durationMins,
            placeRefId: it.placeRefId,
            ...(sanitizedElder ? { elderSummaryI18n: sanitizedElder } : {}),
          };
        }),
    }));

    // Infer destinations from destinationSummary + item coordinates against seeded PlacesRepository
    const allSeedDests = await this.deps.places.repo.listDestinations({});
    const summaryLower = `${ws.trip.title} ${ws.trip.destinationSummary}`.toLowerCase();
    const matchedDests: Array<{ slug: string; name: string }> = [];

    for (const d of allSeedDests) {
      if (d.kind === 'country') continue;
      if (
        summaryLower.includes(d.name.toLowerCase()) ||
        d.aliases.some((al) => al.length >= 4 && summaryLower.includes(al.toLowerCase()))
      ) {
        matchedDests.push({ slug: d.slug, name: d.name });
      }
    }

    if (matchedDests.length === 0) {
      const firstGeoItem = ws.items.find(
        (it) => !it.deletedAt && it.lat !== null && it.lng !== null
      );
      if (firstGeoItem && firstGeoItem.lat !== null && firstGeoItem.lng !== null) {
        const nearest = allSeedDests
          .filter((d) => d.kind === 'city' || d.kind === 'area' || d.kind === 'region')
          .map((d) => ({
            d,
            dist: haversineMeters(
              { lat: firstGeoItem.lat!, lng: firstGeoItem.lng! },
              { lat: d.lat, lng: d.lng }
            ),
          }))
          .sort((a, b) => a.dist - b.dist)[0];
        if (nearest && nearest.dist < 150_000) {
          matchedDests.push({ slug: nearest.d.slug, name: nearest.d.name });
        }
      }
    }
    if (matchedDests.length === 0) {
      matchedDests.push({
        slug: 'india',
        name: ws.trip.destinationSummary || 'India',
      });
    }

    let coverImage: ImageCredit | null = params.coverImage ?? null;
    if (!coverImage) {
      for (const md of matchedDests) {
        if (LOCAL_PHOTO_CREDITS[md.slug]) {
          coverImage = LOCAL_PHOTO_CREDITS[md.slug]!;
          break;
        }
      }
      coverImage ??= LOCAL_PHOTO_CREDITS.jaipur!;
    }

    const ownerMember = ws.members.find((m) => m.role === 'owner') ?? member;
    const nowIso = new Date().toISOString();
    const stopCount = days.reduce(
      (acc, d) => acc + d.items.filter((i) => i.kind !== 'note').length,
      0
    );

    const prevCloneCount = existingSlug
      ? (this.entries.get(existingSlug)?.card.cloneCount ?? 0)
      : 0;

    const rawSummary =
      params.summary?.trim() ||
      ws.trip.destinationSummary ||
      `${activeDays.length}-day itinerary across ${matchedDests.map((d) => d.name).join(', ')}.`;

    const card: ExploreCard = {
      slug,
      title: ws.trip.title,
      summary: sanitizeExplorePublicText(rawSummary),
      coverImage,
      durationDays: activeDays.length,
      stopCount,
      destinations: matchedDests.slice(0, 5),
      tripTypes: params.tripTypes.length > 0 ? params.tripTypes : ['friends'],
      budgetTier: params.budgetTier ?? 'mid',
      bestMonths:
        params.bestMonths && params.bestMonths.length > 0
          ? params.bestMonths
          : [10, 11, 12, 1, 2, 3],
      origin: 'user',
      authorName: ownerMember?.displayName || 'Traveller',
      cloneCount: prevCloneCount,
      publishedAt: nowIso,
    };

    const detail: ExploreDetail = {
      ...card,
      days,
      mapAttribution: ws.trip.mapAttribution,
    };

    this.entries.set(slug, { card, detail, sourceTripId: params.tripId });
    this.slugByTripId.set(params.tripId, slug);
    this.lastPgHydratedAt = Date.now();

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO explore_published_entries (slug, trip_id, origin, card_payload, days_payload, clone_count, published_at, updated_at)
           VALUES ($1, $2, 'user', $3::jsonb, $4::jsonb, $5, $6, NOW())
           ON CONFLICT (slug)
           DO UPDATE SET
             card_payload = EXCLUDED.card_payload,
             days_payload = EXCLUDED.days_payload,
             updated_at = NOW()`,
          [
            slug,
            params.tripId,
            JSON.stringify(card),
            JSON.stringify(days),
            card.cloneCount,
            nowIso,
          ]
        );
      } catch {
        // Ignore optional PG sync failure if migration 008 not applied
      }
    }

    return card;
  }

  public async close(): Promise<void> {
    if (this.sharedDatabaseUrl && this.pool) {
      this.pool = null;
      await releaseSharedPgPool(this.sharedDatabaseUrl, 'web');
    }
  }
}
