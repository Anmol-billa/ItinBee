import crypto from 'node:crypto';
import { CACHE_TTL, cached, type GeoCache } from '../geo-cache.js';
import type { HttpClient } from '../util/http.js';
import type { LatLng } from '../types.js';
import type { OverpassElement, OverpassProvider } from './types.js';

/** Tags we keep (everything else is dropped before caching to keep geo_cache rows small). */
const KEEP_TAG_PREFIXES = ['name', 'addr:', 'diet:', 'contact:'];
const KEEP_TAGS = new Set([
  'amenity',
  'tourism',
  'historic',
  'natural',
  'leisure',
  'building',
  'cuisine',
  'website',
  'url',
  'opening_hours',
  'phone',
  'email',
  'wikidata',
  'wikipedia',
  'wikimedia_commons',
  'image',
  'description',
  'religion',
  'denomination',
  'heritage',
  'wheelchair',
  'stars',
  'internet_access',
  'outdoor_seating',
  'takeaway',
  'brand',
  'fee',
  'ele',
  'artwork_type',
  'memorial',
  'castle_type',
  'sport',
  'attraction',
]);

export function pruneTags(tags: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (KEEP_TAGS.has(k) || KEEP_TAG_PREFIXES.some((p) => k.startsWith(p))) out[k] = v;
  }
  return out;
}

const AMENITY_FOOD = 'restaurant|cafe|bar|pub|nightclub|biergarten|fast_food|food_court|ice_cream';
const TOURISM =
  'attraction|museum|gallery|viewpoint|zoo|theme_park|aquarium|artwork|hotel|hostel|guest_house|motel|apartment|resort|camp_site|chalet|alpine_hut|wilderness_hut';
const HISTORIC =
  'castle|fort|monument|archaeological_site|ruins|palace|manor|city_gate|tower|tomb|temple|building|battlefield|citywalls|memorial|church|monastery|shrine';
const NATURAL = 'peak|waterfall|beach|cave_entrance|hot_spring|bay|volcano|glacier|spring|cliff|valley';

/** One bounded Overpass QL query for everything a Destination Pack needs. */
export function buildOverpassQuery(center: LatLng, radiusM: number, maxElements = 8000): string {
  const around = `(around:${Math.round(radiusM)},${center.lat.toFixed(5)},${center.lng.toFixed(5)})`;
  return [
    '[out:json][timeout:90];',
    '(',
    `  nwr["amenity"~"^(${AMENITY_FOOD})$"]["name"]${around};`,
    `  nwr["tourism"~"^(${TOURISM})$"]["name"]${around};`,
    `  nwr["historic"~"^(${HISTORIC})$"]["name"]${around};`,
    `  nwr["natural"~"^(${NATURAL})$"]["name"]${around};`,
    `  nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]${around};`,
    `  nwr["amenity"~"^(place_of_worship|theatre|arts_centre)$"]["name"]${around};`,
    ');',
    `out center ${maxElements};`,
  ].join('\n');
}

interface OverpassJson {
  elements?: Array<{
    type: 'node' | 'way' | 'relation';
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }>;
  remark?: string;
}

export function parseOverpassJson(json: OverpassJson): OverpassElement[] {
  const out: OverpassElement[] = [];
  for (const el of json.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined || !el.tags?.name) continue;
    out.push({ type: el.type, id: el.id, lat, lng, tags: pruneTags(el.tags) });
  }
  return out;
}

export class OverpassClient implements OverpassProvider {
  constructor(
    private readonly http: HttpClient,
    private readonly cache: GeoCache,
    private readonly endpoints: string[],
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms))
  ) {}

  async fetchPois(
    center: LatLng,
    radiusM: number,
    options: { refresh?: boolean } = {}
  ): Promise<OverpassElement[]> {
    const query = buildOverpassQuery(center, radiusM);
    const key = `overpass:v1:${crypto.createHash('sha1').update(query).digest('hex').slice(0, 20)}`;
    const { value } = await cached(
      this.cache,
      key,
      'overpass',
      CACHE_TTL.overpass,
      () => this.runWithFailover(query),
      { refresh: options.refresh }
    );
    return value;
  }

  /** Tries each mirror in turn with backoff between rounds (Overpass answers 429/504 under load). */
  private async runWithFailover(query: string): Promise<OverpassElement[]> {
    if (this.endpoints.length === 0) throw new Error('No Overpass endpoints configured');
    const errors: string[] = [];
    const rounds = 2;
    for (let round = 0; round < rounds; round += 1) {
      for (const endpoint of this.endpoints) {
        try {
          const res = await this.http.request(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            body: `data=${encodeURIComponent(query)}`,
            timeoutMs: 100_000,
            retries: 0,
          });
          const json = (await res.json()) as OverpassJson;
          // Overpass returns HTTP 200 with a "remark" when it ran out of time/memory: treat as failure.
          if (json.remark && /(timed out|out of memory|runtime error)/i.test(json.remark)) {
            throw new Error(`overpass remark: ${json.remark.slice(0, 120)}`);
          }
          return parseOverpassJson(json);
        } catch (err) {
          errors.push(`${new URL(endpoint).host}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (round < rounds - 1) await this.sleep(4000 * (round + 1));
    }
    throw new Error(`All Overpass mirrors failed (${errors.join('; ')})`);
  }
}
