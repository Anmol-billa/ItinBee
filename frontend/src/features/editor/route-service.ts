import { browserApiBase } from '@/lib/api-base';
import {
  buildRouteCacheKey,
  buildStraightLineFallback,
  formatRouteLabel,
  selectRouteProfile,
  type LatLngPoint,
  type RouteLegResult,
  type RouteProfile,
} from '@/features/map/map-utils';

interface BackendRouteResponse {
  profile: RouteProfile;
  distanceM: number;
  durationS: number;
  coordinates: Array<[number, number]>;
  source: 'openrouteservice' | 'estimate';
}

const resolvedCache = new Map<string, RouteLegResult>();
const inflightRequests = new Map<string, Promise<RouteLegResult>>();

export function getCachedRouteLeg(
  origin: LatLngPoint,
  destination: LatLngPoint
): RouteLegResult | undefined {
  const profile = selectRouteProfile(origin, destination);
  const key = buildRouteCacheKey(profile, [origin, destination]);
  return resolvedCache.get(key);
}

export async function fetchRouteLeg(
  origin: LatLngPoint,
  destination: LatLngPoint
): Promise<RouteLegResult> {
  const profile = selectRouteProfile(origin, destination);
  const key = buildRouteCacheKey(profile, [origin, destination]);

  const cached = resolvedCache.get(key);
  if (cached) return cached;

  const inflight = inflightRequests.get(key);
  if (inflight) return inflight;

  const reqPromise = (async (): Promise<RouteLegResult> => {
    try {
      const res = await fetch(`${browserApiBase()}/v1/geo/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile,
          coordinates: [
            { lat: origin.lat, lng: origin.lng },
            { lat: destination.lat, lng: destination.lng },
          ],
        }),
        signal: AbortSignal.timeout(4500),
      });

      if (!res.ok) {
        throw new Error(`route_http_${res.status}`);
      }

      const data = (await res.json()) as BackendRouteResponse;
      const coords =
        Array.isArray(data.coordinates) && data.coordinates.length >= 2
          ? data.coordinates
          : ([
              [origin.lng, origin.lat],
              [destination.lng, destination.lat],
            ] as Array<[number, number]>);

      const leg: RouteLegResult = {
        key,
        profile: data.profile ?? profile,
        distanceM: data.distanceM,
        durationS: data.durationS,
        coordinates: coords,
        source: data.source ?? 'estimate',
        label: formatRouteLabel({
          distanceM: data.distanceM,
          durationS: data.durationS,
          profile: data.profile ?? profile,
          source: data.source ?? 'estimate',
        }),
      };
      resolvedCache.set(key, leg);
      return leg;
    } catch {
      const fallback = buildStraightLineFallback(origin, destination);
      resolvedCache.set(key, fallback);
      return fallback;
    } finally {
      inflightRequests.delete(key);
    }
  })();

  inflightRequests.set(key, reqPromise);
  return reqPromise;
}
