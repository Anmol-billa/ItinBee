import { env } from '../../config/env.js';
import {
  CURATED_OPEN_POIS,
  buildGoogleMapsPlaceUrl,
  type OpenPoiRecord,
} from './curated-india-pois.js';

export interface PoiSearchResult extends OpenPoiRecord {
  googleMapsUrl: string;
  score: number;
}

/**
 * 100% Open-Data POI Search (Overture Maps Places / Foursquare OS / OSM Photon / Wikidata).
 * Zero Google Places API calls are ever executed—eliminating GMP §3.2.3 / §14.2 ToS conflicts
 * and allowing permanent offline IndexedDB & PostGIS caching.
 */
export async function searchOpenPois(params: {
  query: string;
  lat?: number;
  lng?: number;
  limit?: number;
}): Promise<PoiSearchResult[]> {
  const q = params.query.trim().toLowerCase();
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);

  if (!q) {
    return CURATED_OPEN_POIS.slice(0, limit).map((poi) => ({
      ...poi,
      googleMapsUrl: buildGoogleMapsPlaceUrl(poi.lat, poi.lng, poi.name),
      score: 1,
    }));
  }

  const tokens = q.split(/\s+/).filter(Boolean);

  const scored: PoiSearchResult[] = [];
  for (const poi of CURATED_OPEN_POIS) {
    const haystack = [
      poi.name,
      poi.nameHi ?? '',
      poi.city,
      poi.region,
      poi.category,
      poi.address,
      ...poi.aliases,
    ]
      .join(' ')
      .toLowerCase();

    let score = 0;
    if (poi.name.toLowerCase().startsWith(q)) score += 12;
    if (poi.city.toLowerCase().startsWith(q)) score += 9;
    if (haystack.includes(q)) score += 6;

    for (const token of tokens) {
      if (poi.name.toLowerCase().includes(token)) score += 4;
      else if (poi.city.toLowerCase().includes(token)) score += 3;
      else if (haystack.includes(token)) score += 2;
    }

    if (score > 0 && params.lat !== undefined && params.lng !== undefined) {
      const distDeg = Math.hypot(poi.lat - params.lat, poi.lng - params.lng);
      if (distDeg < 1.5) score += 3;
    }

    if (score > 0) {
      scored.push({
        ...poi,
        googleMapsUrl: buildGoogleMapsPlaceUrl(poi.lat, poi.lng, poi.name),
        score,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Optional self-hosted OSM Photon open-data enrichment (ODbL, zero Google Places API)
  if (scored.length < limit && env.PHOTON_BASE_URL) {
    try {
      const url = new URL('/api', env.PHOTON_BASE_URL);
      url.searchParams.set('q', params.query);
      url.searchParams.set('limit', String(limit - scored.length));
      if (params.lat !== undefined && params.lng !== undefined) {
        url.searchParams.set('lat', String(params.lat));
        url.searchParams.set('lon', String(params.lng));
      }

      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const geojson = (await res.json()) as {
          features?: Array<{
            geometry?: { coordinates?: [number, number] };
            properties?: {
              osm_id?: number;
              osm_type?: string;
              name?: string;
              city?: string;
              state?: string;
              countrycode?: string;
              osm_value?: string;
            };
          }>;
        };

        for (const feat of geojson.features ?? []) {
          const coords = feat.geometry?.coordinates;
          const props = feat.properties;
          if (!coords || !props?.name) continue;
          const [lng, lat] = coords;
          scored.push({
            placeRefId: `photon:${props.osm_type ?? 'N'}:${props.osm_id ?? Math.abs(Math.round(lat * 10000))}`,
            name: props.name,
            city: props.city ?? '',
            region: props.state ?? '',
            countryCode: (props.countrycode ?? 'IN').toUpperCase(),
            category: 'heritage',
            lat,
            lng,
            address: [props.name, props.city, props.state].filter(Boolean).join(', '),
            dietaryHints: [],
            accessibilityNotes: '',
            terrainZone: 'highway',
            sourceDataset: 'osm_photon',
            aliases: [],
            googleMapsUrl: buildGoogleMapsPlaceUrl(lat, lng, props.name),
            score: 1,
          });
        }
      }
    } catch {
      // Fall back gracefully to curated open POIs if Photon instance is unreachable
    }
  }

  return scored.slice(0, limit);
}

/**
 * Resolves candidate stop text (e.g. from Reel caption or ticket city) to the closest open POI.
 */
export function matchBestCuratedPoi(text: string): PoiSearchResult | null {
  const lower = text.toLowerCase();
  let best: PoiSearchResult | null = null;

  for (const poi of CURATED_OPEN_POIS) {
    let score = 0;
    if (lower.includes(poi.name.toLowerCase())) score += 10;
    for (const alias of poi.aliases) {
      if (lower.includes(alias.toLowerCase())) score += 7;
    }
    if (lower.includes(poi.city.toLowerCase()) && score > 0) {
      score += 3;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = {
        ...poi,
        googleMapsUrl: buildGoogleMapsPlaceUrl(poi.lat, poi.lng, poi.name),
        score,
      };
    }
  }
  return best;
}
