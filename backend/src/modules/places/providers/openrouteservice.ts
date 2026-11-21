import crypto from 'node:crypto';
import {
  estimateIndiaTransit,
  type TransitProfile,
} from '../../geo/transit-estimator.js';
import { CACHE_TTL, cached, type GeoCache } from '../geo-cache.js';
import { decodePolyline, encodePolyline } from '../util/geo.js';
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

export function routeCacheKey(profile: RouteProfile, coords: LatLng[]): string {
  const canonical = `${profile}|${coords.map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`).join(';')}`;
  return `ors:v1:${crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 24)}`;
}

/** Fallback built on the India-calibrated transit estimator: sums legs, geometry is the straight polyline. */
export function estimateRoute(profile: RouteProfile, coords: LatLng[]): RouteResult {
  const transitProfile: TransitProfile | undefined = profile === 'foot-walking' ? 'walk' : undefined;
  let distanceM = 0;
  let durationS = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1] as LatLng;
    const b = coords[i] as LatLng;
    const est = estimateIndiaTransit({ origin: a, destination: b, profile: transitProfile });
    distanceM += est.estimatedRoadKm * 1000;
    durationS += est.estimatedDurationMins * 60;
  }
  const lngLat = coords.map((c): [number, number] => [c.lng, c.lat]);
  return {
    profile,
    distanceM: Math.round(distanceM),
    durationS: Math.round(durationS),
    geometry: encodePolyline(lngLat),
    geometryFormat: 'polyline5',
    coordinates: lngLat,
    source: 'estimate',
    cached: false,
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
