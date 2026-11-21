import { CACHE_TTL, cached, type GeoCache } from '../geo-cache.js';
import { clean, normalizeName } from '../util/text.js';
import type { HttpClient } from '../util/http.js';
import type { AutocompleteSuggestion, PhotonProvider } from './types.js';

export const DEFAULT_PHOTON_BASE_URL = 'https://photon.komoot.io';
/** Languages the public Photon instance accepts for `lang` (others yield HTTP 400). */
const PHOTON_LANGS = new Set(['en', 'de', 'fr', 'it']);

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    type?: string;
    countrycode?: string;
    country?: string;
    state?: string;
    county?: string;
    city?: string;
    district?: string;
    locality?: string;
    street?: string;
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

/** Maps a Photon GeoJSON feature to a typeahead suggestion (null for street/house level noise). */
export function mapPhotonFeature(feat: PhotonFeature): AutocompleteSuggestion | null {
  const coords = feat.geometry?.coordinates;
  const p = feat.properties;
  const name = clean(p?.name);
  if (!coords || !p || !name) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const type = p.type ?? '';
  // streets and plain buildings are noise for destination typeahead; POIs also arrive as type "house"
  if (type === 'street') return null;
  if (type === 'house' && ['building', 'highway', 'place'].includes(p.osm_key ?? '')) return null;

  let kind: AutocompleteSuggestion['kind'] = 'place';
  if (type === 'country') kind = 'country';
  else if (type === 'state') kind = 'state';
  else if (type === 'city' || (p.osm_key === 'place' && ['city', 'town', 'village'].includes(p.osm_value ?? '')))
    kind = 'city';
  else if (type === 'district' || type === 'locality' || type === 'county') kind = 'area';

  const context =
    kind === 'place'
      ? [p.city ?? p.district ?? p.locality, p.state, p.country]
      : kind === 'country'
        ? []
        : kind === 'state'
          ? [p.country]
          : [p.state, p.country];
  const secondary = context
    .map((x) => clean(x))
    .filter((x, i, arr): x is string => x !== null && x !== name && arr.indexOf(x) === i)
    .join(', ');

  const osmType = (p.osm_type ?? 'N').toUpperCase();
  return {
    id: `photon:${osmType}:${p.osm_id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`}`,
    name,
    secondary,
    kind,
    lat,
    lng,
    countryCode: p.countrycode ? p.countrycode.toUpperCase() : null,
    osmKey: p.osm_key ?? null,
    osmValue: p.osm_value ?? null,
    source: 'photon',
  };
}

export class PhotonClient implements PhotonProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    private readonly cache: GeoCache,
    baseUrl?: string
  ) {
    this.baseUrl = (baseUrl?.trim() || DEFAULT_PHOTON_BASE_URL).replace(/\/+$/, '');
  }

  async autocomplete(
    query: string,
    options: { lat?: number; lng?: number; lang?: string; limit?: number } = {}
  ): Promise<{ suggestions: AutocompleteSuggestion[]; cached: boolean }> {
    const q = query.trim();
    if (q.length < 2) return { suggestions: [], cached: true };
    const lang = options.lang && PHOTON_LANGS.has(options.lang) ? options.lang : 'en';
    const limit = Math.min(Math.max(options.limit ?? 8, 1), 15);
    const hasBias = options.lat !== undefined && options.lng !== undefined;
    // coarse bias bucket (~11 km) keeps the cache effective while still biasing results
    const biasKey = hasBias
      ? `${(options.lat as number).toFixed(1)},${(options.lng as number).toFixed(1)}`
      : 'none';
    const key = `photon:v1:${q.toLowerCase()}|${lang}|${biasKey}|${limit}`;

    const { value, hit } = await cached(
      this.cache,
      key,
      'photon',
      CACHE_TTL.photon,
      async () => {
        const url = new URL(`${this.baseUrl}/api`);
        url.searchParams.set('q', q);
        url.searchParams.set('limit', String(limit + 4));
        url.searchParams.set('lang', lang);
        if (hasBias) {
          url.searchParams.set('lat', String(options.lat));
          url.searchParams.set('lon', String(options.lng));
          url.searchParams.set('location_bias_scale', '0.4');
        }
        const json = await this.http.getJson<PhotonResponse>(url.toString(), {
          timeoutMs: 6000,
          retries: 1,
        });
        const out: AutocompleteSuggestion[] = [];
        const seen = new Set<string>();
        for (const f of json.features ?? []) {
          const s = mapPhotonFeature(f);
          if (!s || seen.has(s.id)) continue;
          // Photon returns the same city as place + administrative boundary: keep the first
          const dedupeKey = `${normalizeName(s.name)}|${s.countryCode ?? ''}|${s.kind === 'place' ? 'p' : 'g'}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          seen.add(s.id);
          out.push(s);
          if (out.length >= limit) break;
        }
        return out;
      }
    );
    return { suggestions: value, cached: hit };
  }
}
