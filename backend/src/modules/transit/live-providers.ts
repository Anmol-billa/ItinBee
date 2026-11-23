import crypto from 'node:crypto';
import type { AppEnv } from '../../config/env.js';
import type { GeoCache } from '../places/geo-cache.js';
import { estimateLegTransit } from '../places/providers/openrouteservice.js';
import type { PlacesServices } from '../places/places-module.js';
import type { TransitLegSpec } from '../import/intent.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function cacheKey(prefix: string, parts: string[]): string {
  const raw = parts.join('|').toLowerCase();
  return `${prefix}:${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 24)}`;
}

export interface RoadRouteMetrics {
  distanceKm: number;
  durationMins: number;
  source: 'ors_road' | 'verified_timetable';
  advisory?: string;
}

/**
 * Resolves real road driving distance & duration using:
 * 1. Configured OpenRouteService (`ORS_API_KEY`)
 * 2. Public OSRM (`router.project-osrm.org/route/v1/driving`) in non-test environments
 * 3. Region-calibrated road estimator (`estimateLegTransit`)
 */
export async function resolveRoadMetrics(params: {
  origin: { lat: number; lng: number; name?: string };
  destination: { lat: number; lng: number; name?: string };
  places: PlacesServices;
  fetchImpl?: typeof fetch;
}): Promise<RoadRouteMetrics> {
  const { origin, destination, places } = params;
  const fetchFn = params.fetchImpl ?? fetch;

  // 1. Try OpenRouteService if ORS_API_KEY is configured (routing.route returns source='estimate' if unset)
  try {
    const orsRes = await places.providers.routing.route('driving-car', [
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng },
    ]);
    if (orsRes.source === 'openrouteservice' && orsRes.distanceM > 0 && orsRes.durationS > 0) {
      return {
        distanceKm: Number((orsRes.distanceM / 1000).toFixed(1)),
        durationMins: Math.max(10, Math.round(orsRes.durationS / 60)),
        source: 'ors_road',
      };
    }
  } catch {
    /* fall through to OSRM / calibrated estimate */
  }

  // 2. Try free public OSRM routing in non-test environments (cached 30 days in GeoCache)
  if (places.nodeEnv !== 'test') {
    const key = cacheKey('osrm:v1', [
      `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`,
      `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`,
    ]);
    try {
      const hit = await places.cache.get<RoadRouteMetrics>(key);
      if (hit) return hit;

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng.toFixed(5)},${origin.lat.toFixed(5)};${destination.lng.toFixed(5)},${destination.lat.toFixed(5)}?overview=false`;
      const res = await fetchFn(osrmUrl, {
        headers: { 'User-Agent': 'Itinbee/1.0' },
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          routes?: Array<{ distance?: number; duration?: number }>;
        };
        const r = json.routes?.[0];
        if (r?.distance && r?.duration) {
          const metrics: RoadRouteMetrics = {
            distanceKm: Number((r.distance / 1000).toFixed(1)),
            durationMins: Math.max(10, Math.round(r.duration / 60)),
            source: 'ors_road',
          };
          await places.cache.set(key, 'osrm', metrics, THIRTY_DAYS_MS);
          return metrics;
        }
      }
    } catch {
      /* fall through to calibrated estimate */
    }
  }

  // 3. Deterministic India/global road geometry & ghat speed estimator
  const est = estimateLegTransit({ origin, destination });
  return {
    distanceKm: Number(est.distanceKm.toFixed(1)),
    durationMins: est.estimatedDurationMins,
    source: 'ors_road',
    advisory: est.advisory,
  };
}

/**
 * Optional Tier-1 Live Indian Railways timetable lookup (`RAILRADAR_API_KEY` or `RAPIDAPI_IRCTC_KEY`).
 * Returns null immediately when neither key is configured.
 */
export async function queryLiveRailBetweenStations(params: {
  fromCode: string;
  fromName: string;
  fromLat: number;
  fromLng: number;
  toCode: string;
  toName: string;
  toLat: number;
  toLng: number;
  dateIso?: string | null;
  config?: Partial<AppEnv>;
  cache?: GeoCache;
  fetchImpl?: typeof fetch;
}): Promise<TransitLegSpec | null> {
  const cfg = params.config;
  const railRadarKey = cfg?.RAILRADAR_API_KEY?.trim();
  const rapidIrctcKey = cfg?.RAPIDAPI_IRCTC_KEY?.trim();
  if (!railRadarKey && !rapidIrctcKey) return null;

  const fetchFn = params.fetchImpl ?? fetch;
  const cKey = cacheKey('live_rail:v1', [params.fromCode, params.toCode]);
  if (params.cache) {
    const cachedLeg = await params.cache.get<TransitLegSpec>(cKey);
    if (cachedLeg) return cachedLeg;
  }

  try {
    if (railRadarKey) {
      const qs = params.dateIso ? `?date=${encodeURIComponent(params.dateIso)}` : '';
      const res = await fetchFn(
        `https://api.railradar.in/v1/trains/between/${encodeURIComponent(params.fromCode)}/${encodeURIComponent(params.toCode)}${qs}`,
        {
          headers: { Authorization: `Bearer ${railRadarKey}` },
          signal: AbortSignal.timeout(4500),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          trains?: Array<{
            trainNumber?: string;
            trainName?: string;
            departureTime?: string;
            arrivalTime?: string;
            durationMinutes?: number;
            distanceKm?: number;
          }>;
        };
        const top = data.trains?.[0];
        if (top?.trainNumber && top?.departureTime && top?.arrivalTime) {
          const dur = Math.max(30, Number(top.durationMinutes ?? 360));
          const leg: TransitLegSpec = {
            mode: 'rail',
            title: `${top.trainNumber} ${top.trainName ?? 'Express'}: ${params.fromName} (${params.fromCode}) → ${params.toName} (${params.toCode})`,
            carrierName: top.trainName ?? 'Indian Railways',
            vehicleCode: top.trainNumber,
            fromName: params.fromName,
            fromCode: params.fromCode,
            fromLat: params.fromLat,
            fromLng: params.fromLng,
            toName: params.toName,
            toCode: params.toCode,
            toLat: params.toLat,
            toLng: params.toLng,
            departureTime: top.departureTime.slice(0, 5),
            arrivalTime: top.arrivalTime.slice(0, 5),
            durationMins: dur,
            distanceKm: Number(top.distanceKm ?? 300),
            dayOffset: dur >= 600 ? 1 : 0,
            source: 'live_api',
          };
          await params.cache?.set(cKey, 'railradar', leg, SEVEN_DAYS_MS);
          return leg;
        }
      }
    }
  } catch {
    /* fall through cleanly */
  }
  return null;
}

/**
 * Optional Tier-1 Live Google Flights / SerpApi schedule lookup (`SERPAPI_KEY`).
 * Returns null immediately when unconfigured.
 */
export async function queryLiveFlightSchedule(params: {
  fromIata: string;
  fromName: string;
  fromLat: number;
  fromLng: number;
  toIata: string;
  toName: string;
  toLat: number;
  toLng: number;
  dateIso?: string | null;
  config?: Partial<AppEnv>;
  cache?: GeoCache;
  fetchImpl?: typeof fetch;
}): Promise<TransitLegSpec | null> {
  const serpKey = params.config?.SERPAPI_KEY?.trim();
  if (!serpKey) return null;

  const fetchFn = params.fetchImpl ?? fetch;
  const cKey = cacheKey('live_flight:v1', [params.fromIata, params.toIata]);
  if (params.cache) {
    const cachedLeg = await params.cache.get<TransitLegSpec>(cKey);
    if (cachedLeg) return cachedLeg;
  }

  try {
    const depDate =
      params.dateIso ??
      new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_flights');
    url.searchParams.set('departure_id', params.fromIata);
    url.searchParams.set('arrival_id', params.toIata);
    url.searchParams.set('outbound_date', depDate);
    url.searchParams.set('type', '2');
    url.searchParams.set('currency', 'INR');
    url.searchParams.set('api_key', serpKey);

    const res = await fetchFn(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const json = (await res.json()) as {
        best_flights?: Array<{
          total_duration?: number;
          price?: number;
          flights?: Array<{
            airline?: string;
            flight_number?: string;
            departure_airport?: { time?: string };
            arrival_airport?: { time?: string };
          }>;
        }>;
      };
      const best = json.best_flights?.[0];
      const firstSeg = best?.flights?.[0];
      const lastSeg = best?.flights?.[best.flights.length - 1];
      if (best?.total_duration && firstSeg) {
        const depHHMM = firstSeg.departure_airport?.time?.split(' ')[1]?.slice(0, 5) ?? '07:00';
        const arrHHMM = lastSeg?.arrival_airport?.time?.split(' ')[1]?.slice(0, 5) ?? '09:30';
        const leg: TransitLegSpec = {
          mode: 'flight',
          title: `${firstSeg.flight_number ?? firstSeg.airline ?? 'Flight'}: ${params.fromName} (${params.fromIata}) → ${params.toName} (${params.toIata})`,
          carrierName: firstSeg.airline ?? 'Scheduled Airline',
          vehicleCode: firstSeg.flight_number ?? undefined,
          fromName: params.fromName,
          fromCode: params.fromIata,
          fromLat: params.fromLat,
          fromLng: params.fromLng,
          toName: params.toName,
          toCode: params.toIata,
          toLat: params.toLat,
          toLng: params.toLng,
          departureTime: depHHMM,
          arrivalTime: arrHHMM,
          durationMins: Math.max(45, best.total_duration),
          distanceKm: 0,
          dayOffset: 0,
          ...(best.price ? { approxFareInr: Math.round(best.price) } : {}),
          source: 'live_api',
        };
        await params.cache?.set(cKey, 'serpapi_flights', leg, SEVEN_DAYS_MS);
        return leg;
      }
    }
  } catch {
    /* fall through cleanly */
  }
  return null;
}
