import { categorizeWikipedia } from './categorize.js';
import type { DestinationPackService } from './pack-service.js';
import { isPackBuildable } from './pack-builder.js';
import type { AutocompleteSuggestion, PlacesProviders } from './providers/types.js';
import type { PlacesRepository } from './repository.js';
import type {
  DestinationKind,
  DestinationRecord,
  PackStatus,
  PlaceCategory,
  PlaceRecord,
} from './types.js';
import { haversineMeters } from './util/geo.js';
import { namesSimilar, normalizeName } from './util/text.js';

export interface PlaceQueryParams {
  category?: PlaceCategory;
  q?: string;
  near?: { lat: number; lng: number; radiusM?: number };
  bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  limit: number;
  cursor?: string;
}

export interface LivePlace {
  id: string;
  name: string;
  category: PlaceCategory;
  subtype: string | null;
  lat: number;
  lng: number;
  description: string | null;
  wikipediaTitle: string | null;
  wikidataId: string | null;
  imageUrl: string | null;
  distanceM: number;
}

export interface ListPlacesResult {
  destination: DestinationRecord;
  status: PackStatus;
  /** `pack`: served from the stored pack. `live`: temporary Wikipedia geosearch fallback while building. */
  source: 'pack' | 'live';
  aggregate: boolean;
  total: number;
  nextCursor: string | null;
  places: Array<{ place: PlaceRecord; distanceM: number | null }>;
  live: LivePlace[];
}

export interface UnifiedSuggestion {
  id: string;
  source: 'destination' | 'photon';
  slug: string | null;
  name: string;
  secondary: string;
  kind: DestinationKind | AutocompleteSuggestion['kind'];
  lat: number;
  lng: number;
  countryCode: string | null;
  packStatus: PackStatus | null;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const m = Buffer.from(cursor, 'base64url').toString('utf8').match(/^o:(\d+)$/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

const KIND_BOOST: Record<DestinationKind, number> = {
  city: 8,
  area: 6,
  region: 5,
  state: 3,
  country: 2,
};

export class PlacesService {
  constructor(
    private readonly repo: PlacesRepository,
    private readonly providers: PlacesProviders,
    private readonly packs: DestinationPackService
  ) {}

  async ancestors(dest: DestinationRecord): Promise<DestinationRecord[]> {
    const chain: DestinationRecord[] = [];
    let cur = dest;
    for (let i = 0; i < 6 && cur.parentId; i += 1) {
      const parent = await this.repo.getDestinationById(cur.parentId);
      if (!parent) break;
      chain.unshift(parent);
      cur = parent;
    }
    return chain;
  }

  /** The destination plus all of its descendants (so "Rajasthan" aggregates Jaipur, Udaipur, ...). */
  async subtreeIds(dest: DestinationRecord): Promise<{ ids: string[]; destinations: DestinationRecord[] }> {
    const destinations: DestinationRecord[] = [dest];
    for (let i = 0; i < destinations.length && destinations.length < 200; i += 1) {
      const kids = await this.repo.listChildren((destinations[i] as DestinationRecord).id);
      destinations.push(...kids);
    }
    return { ids: destinations.map((d) => d.id), destinations };
  }

  /** Cheap live fallback (one cached Wikipedia geosearch + page details) used while a pack is building. */
  async liveNearby(dest: DestinationRecord, limit = 30): Promise<LivePlace[]> {
    const hits = await this.providers.wikipedia.geosearch({ lat: dest.lat, lng: dest.lng }, 10_000, 100);
    const titles = hits.map((h) => h.title);
    const details = await this.providers.wikipedia.pageDetails(titles.slice(0, 100));
    const out: LivePlace[] = [];
    for (const h of hits) {
      const d = details[h.title];
      const cat = categorizeWikipedia(d?.description ?? null, h.title);
      if (!cat) continue;
      out.push({
        id: `live:wp:${h.pageId}`,
        name: h.title.replace(/\s+\([^)]*\)$/, ''),
        category: cat.category,
        subtype: cat.subtype,
        lat: h.lat,
        lng: h.lng,
        description: d?.description ?? null,
        wikipediaTitle: d?.title ?? h.title,
        wikidataId: d?.wikidataId ?? null,
        imageUrl: d?.thumbnailUrl ?? null,
        distanceM: Math.round(h.distM),
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  async listPlaces(dest: DestinationRecord, params: PlaceQueryParams): Promise<ListPlacesResult> {
    const aggregate = !isPackBuildable(dest.kind);
    const offset = decodeCursor(params.cursor);
    const { ids, destinations } = aggregate
      ? await this.subtreeIds(dest)
      : { ids: [dest.id], destinations: [dest] };

    let status: PackStatus;
    if (aggregate) {
      status = destinations.some((d) => d.packStatus === 'ready') ? 'ready' : 'none';
    } else {
      status = this.packs.effectiveStatus(dest);
      if (status === 'none' || status === 'stale') {
        // idempotent: no-op while building / fresh / inside the retry cooldown, so repeated reads never double-build
        const req = await this.packs.requestBuild(dest).catch(() => null);
        if (req?.enqueued && dest.packBuiltAt === null) status = 'building';
      }
    }
    const hasPack = aggregate || dest.packBuiltAt !== null;

    const result = await this.repo.queryPlaces({
      destinationIds: ids,
      category: params.category,
      q: params.q,
      near: params.near ? { ...params.near, radiusM: params.near.radiusM ?? 5000 } : undefined,
      bbox: params.bbox,
      limit: params.limit,
      offset,
    });
    const nextOffset = offset + result.rows.length;
    const nextCursor = nextOffset < result.total ? encodeCursor(nextOffset) : null;

    if (!hasPack) {
      // no pack yet: stored rows (e.g. curated seeds) + a live Wikipedia geosearch fallback
      let live = await this.liveNearby(dest).catch(() => [] as LivePlace[]);
      if (params.category) live = live.filter((l) => l.category === params.category);
      if (params.q) {
        const q = params.q.toLowerCase();
        live = live.filter((l) => l.name.toLowerCase().includes(q));
      }
      live = live.filter((l) => !result.rows.some((r) => namesSimilar(r.place.name, l.name)));
      return {
        destination: dest,
        status,
        source: 'live',
        aggregate,
        total: result.total + live.length,
        nextCursor,
        places: result.rows,
        live: live.slice(0, Math.max(0, params.limit - result.rows.length)),
      };
    }

    return {
      destination: dest,
      status,
      source: 'pack',
      aggregate,
      total: result.total,
      nextCursor,
      places: result.rows,
      live: [],
    };
  }

  /** Local destinations (instant) merged with cached Photon results. */
  async autocomplete(
    query: string,
    options: { lat?: number; lng?: number; lang?: string; limit?: number }
  ): Promise<{ results: UnifiedSuggestion[]; cached: boolean; photonAvailable: boolean }> {
    const q = query.trim();
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 15);
    const qn = normalizeName(q);

    const locals = await this.repo.listDestinations({ q });
    const scored = locals
      .map((d) => {
        const names = [d.name, d.slug.replace(/-/g, ' '), ...d.aliases];
        let score = 0;
        for (const n of names) {
          const nn = normalizeName(n);
          if (nn === qn) score = Math.max(score, 100);
          else if (nn.startsWith(qn)) score = Math.max(score, 60);
          else if (nn.split(' ').some((w) => w.startsWith(qn))) score = Math.max(score, 45);
          else if (nn.includes(qn)) score = Math.max(score, 25);
        }
        score += KIND_BOOST[d.kind];
        if (options.lat !== undefined && options.lng !== undefined) {
          const km = haversineMeters({ lat: options.lat, lng: options.lng }, d) / 1000;
          if (km < 300) score += 6;
          else if (km < 1500) score += 2;
        }
        return { d, score };
      })
      .filter((x) => x.score > KIND_BOOST[x.d.kind])
      .sort((a, b) => b.score - a.score || a.d.name.localeCompare(b.d.name))
      .slice(0, 6);

    const results: UnifiedSuggestion[] = [];
    for (const { d } of scored) {
      const chain = await this.ancestors(d);
      results.push({
        id: `dest:${d.slug}`,
        source: 'destination',
        slug: d.slug,
        name: d.name,
        secondary: chain
          .map((c) => c.name)
          .reverse()
          .join(', '),
        kind: d.kind,
        lat: d.lat,
        lng: d.lng,
        countryCode: d.countryCode,
        packStatus: d.packStatus,
      });
    }

    let cached = false;
    let photonAvailable = true;
    try {
      const photon = await this.providers.photon.autocomplete(q, {
        lat: options.lat,
        lng: options.lng,
        lang: options.lang,
        limit,
      });
      cached = photon.cached;
      for (const s of photon.suggestions) {
        const dup = results.some(
          (r) =>
            r.source === 'destination' &&
            (namesSimilar(r.name, s.name) || (r.slug !== null && normalizeName(s.name) === r.slug.replace(/-/g, ' '))) &&
            haversineMeters(r, s) < 40_000
        );
        if (dup) continue;
        results.push({
          id: s.id,
          source: 'photon',
          slug: null,
          name: s.name,
          secondary: s.secondary,
          kind: s.kind,
          lat: s.lat,
          lng: s.lng,
          countryCode: s.countryCode,
          packStatus: null,
        });
      }
    } catch {
      photonAvailable = false;
    }
    return { results: results.slice(0, limit), cached, photonAvailable };
  }
}
