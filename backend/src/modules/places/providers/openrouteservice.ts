import crypto from 'node:crypto';
import { buildGoogleMapsDirectionsUrl } from '../../geo/curated-india-pois.js';
import { estimateIndiaTransit } from '../../geo/transit-estimator.js';
import { CACHE_TTL, cached, type GeoCache } from '../geo-cache.js';
import { decodePolyline, encodePolyline, haversineMeters } from '../util/geo.js';
import type { HttpClient } from '../util/http.js';
import type { LatLng } from '../types.js';
import type { RouteProfile, RouteResult, RoutingProvider } from './types.js';

export const ORS_BASE_URL = 'https://api.openrouteservice.org';

interface OrsDirectionsResponse {
  routes?: Array<{
    summary?: { distance?: number; duration?: number };
    geometry?: string;
  }>;
}

/** India sovereign bounding box (lat 6.5..37.1, lng 68.1..97.4). */
export function isInsideIndiaBbox(coord: LatLng): boolean {
  return (
    coord.lat >= 6.5 &&
    coord.lat <= 37.1 &&
    coord.lng >= 68.1 &&
    coord.lng <= 97.4
  );
}

export interface EstimatedLegSummary {
  mode: 'walk' | 'hill_cab' | 'metro_cab' | 'highway_cab';
  distanceKm: number;
  estimatedDurationMins: number;
  durationS: number;
  advisory: string;
  googleMapsUrl: string;
  isWalking: boolean;
  inIndia: boolean;
}

/**
 * Region-aware transit estimator used across `/v1/geo/route`, Stage-B itinerary scheduling,
 * and Explore template cloning:
 * - `< 1.8 km` straight-line (or explicit `'foot-walking'`): `1.28x` walking distance at `4.8 km/h`
 *   with `"Estimated walking distance"`.
 * - Inside India (`lat 6.5..37.1, lng 68.1..97.4`): uses `estimateIndiaTransit` (metro peak / hill ghat / highway).
 * - International (Kyoto, Bali, Dubai, Singapore, Europe, etc.): neutral `1.3x` road geometry at
 *   `32 km/h` urban (`<= 25 km`) or `60 km/h` intercity (`> 25 km`) with `"Estimated road transit"`.
 */
export function estimateLegTransit(params: {
  origin: LatLng & { name?: string };
  destination: LatLng & { name?: string };
  profile?: RouteProfile;
  departureTimeHHMM?: string;
}): EstimatedLegSummary {
  const { origin, destination, profile, departureTimeHHMM } = params;
  const straightKm = haversineMeters(origin, destination) / 1000;
  const inIndia = isInsideIndiaBbox(origin) && isInsideIndiaBbox(destination);

  if (profile === 'foot-walking' || straightKm < 1.8) {
    const walkKm = Number((straightKm * 1.28).toFixed(2));
    const durationS = Math.max(60, Math.round((walkKm / 4.8) * 3600));
    return {
      mode: 'walk',
      distanceKm: walkKm,
      estimatedDurationMins: Math.max(2, Math.round(durationS / 60)),
      durationS,
      advisory: 'Estimated walking distance',
      googleMapsUrl: buildGoogleMapsDirectionsUrl(origin, destination, 'walking'),
      isWalking: true,
      inIndia,
    };
  }

  if (inIndia) {
    const est = estimateIndiaTransit({
      origin,
      destination,
      departureTimeHHMM,
    });
    return {
      mode:
        est.profile === 'hill_switchback'
          ? 'hill_cab'
          : est.profile === 'indian_highway'
            ? 'highway_cab'
            : 'metro_cab',
      distanceKm: est.estimatedRoadKm,
      estimatedDurationMins: est.estimatedDurationMins,
      durationS: est.estimatedDurationMins * 60,
      advisory: est.advisories[0] ?? 'Estimated road transit',
      googleMapsUrl: est.googleMapsUrl,
      isWalking: false,
      inIndia: true,
    };
  }

  // Outside India (Kyoto, Tokyo, Bali, Dubai, Singapore, Hanoi, Paris, etc.)
  const roadKm = Number((straightKm * 1.3).toFixed(2));
  const speedKmh = straightKm <= 25 ? 32 : 60;
  const bufferMins = straightKm <= 25 ? 5 : 10;
  const rawDriveMins = (roadKm / speedKmh) * 60 + bufferMins;
  const estimatedDurationMins = Math.max(5, Math.round(rawDriveMins));

  return {
    mode: straightKm <= 25 ? 'metro_cab' : 'highway_cab',
    distanceKm: roadKm,
    estimatedDurationMins,
    durationS: estimatedDurationMins * 60,
    advisory: 'Estimated road transit',
    googleMapsUrl: buildGoogleMapsDirectionsUrl(origin, destination, 'driving'),
    isWalking: false,
    inIndia: false,
  };
}

export function routeCacheKey(profile: RouteProfile, coords: LatLng[]): string {
  const canonical = `${profile}|${coords.map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join(';')}`;
  return `ors:v1:${crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 24)}`;
}

/** Estimator fallback when `ORS_API_KEY` is unset or ORS is unreachable: sums legs, geometry is the straight polyline. */
export function estimateRoute(profile: RouteProfile, coords: LatLng[]): RouteResult {
  let distanceM = 0;
  let durationS = 0;
  let allWalking = true;
  let leadAdvisory = 'Estimated road transit';

  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1] as LatLng;
    const b = coords[i] as LatLng;
    const leg = estimateLegTransit({ origin: a, destination: b, profile });
    distanceM += leg.distanceKm * 1000;
    durationS += leg.durationS;
    if (!leg.isWalking) {
      allWalking = false;
      leadAdvisory = leg.advisory;
    } else if (i === 1) {
      leadAdvisory = leg.advisory;
    }
  }

  const lngLat = coords.map((c): [number, number] => [c.lng, c.lat]);
  return {
    profile: allWalking ? 'foot-walking' : profile,
    distanceM: Math.round(distanceM),
    durationS: Math.round(durationS),
    geometry: encodePolyline(lngLat),
    geometryFormat: 'polyline5',
    coordinates: lngLat,
    source: 'estimate',
    cached: false,
    advisory: allWalking ? 'Estimated walking distance' : leadAdvisory,
  };
}

export class OpenRouteServiceClient implements RoutingProvider {
  constructor(
    private readonly http: HttpClient,
    private readonly cache: GeoCache,
    private readonly apiKey: string | undefined,
    private readonly baseUrl: string = ORS_BASE_URL
  ) {}

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async route(profile: RouteProfile, coordinates: LatLng[]): Promise<RouteResult> {
    if (coordinates.length < 2) throw new Error('At least two coordinates are required');
    if (!this.apiKey) return estimateRoute(profile, coordinates);

    try {
      const { value, hit } = await cached(
        this.cache,
        routeCacheKey(profile, coordinates),
        'openrouteservice',
        CACHE_TTL.ors,
        async (): Promise<RouteResult> => {
          const json = await this.http.postJson<OrsDirectionsResponse>(
            `${this.baseUrl}/v2/directions/${profile}`,
            {
              coordinates: coordinates.map((c) => [c.lng, c.lat]),
              instructions: false,
              geometry_simplify: false,
            },
            {
              headers: { Authorization: this.apiKey as string },
              timeoutMs: 12_000,
              retries: 1,
            }
          );
          const r = json.routes?.[0];
          if (!r?.summary || typeof r.geometry !== 'string') {
            throw new Error('OpenRouteService returned no route');
          }
          return {
            profile,
            distanceM: Math.round(r.summary.distance ?? 0),
            durationS: Math.round(r.summary.duration ?? 0),
            geometry: r.geometry,
            geometryFormat: 'polyline5',
            coordinates: decodePolyline(r.geometry),
            source: 'openrouteservice',
            cached: false,
          };
        }
      );
      return { ...value, cached: hit };
    } catch {
      // network error, quota exhausted (429), bad key, unroutable point: degrade gracefully
      return estimateRoute(profile, coordinates);
    }
  }
}
