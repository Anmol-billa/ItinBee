export type RouteProfile = 'driving-car' | 'foot-walking';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface RouteLegResult {
  key: string;
  profile: RouteProfile;
  distanceM: number;
  durationS: number;
  /** [lng, lat] pairs matching GeoJSON LineString */
  coordinates: Array<[number, number]>;
  source: 'openrouteservice' | 'estimate' | 'fallback';
  label: string;
}

export interface DayRouteSegment {
  id: string;
  dayId: string;
  dayNumber: number;
  fromStopId: string;
  toStopId: string;
  color: string;
  coordinates: Array<[number, number]>;
  solid: boolean;
  distanceM: number;
  durationS: number;
  label: string;
}

export interface CandidateMapPlace {
  id: string;
  refId: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  popularity: number;
  description: string | null;
  whyVisit: string | null;
  address: string | null;
  typicalDurationMins: number | null;
  dietaryHints: string[];
  image: {
    url: string;
    author: string | null;
    license: string | null;
    licenseUrl: string | null;
    sourceUrl: string | null;
  } | null;
}

const EARTH_RADIUS_KM = 6371;

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function haversineKm(a: LatLngPoint, b: LatLngPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Selects walking profile for short hops (< 1.5 km straight-line), driving otherwise.
 */
export function selectRouteProfile(a: LatLngPoint, b: LatLngPoint): RouteProfile {
  return haversineKm(a, b) < 1.5 ? 'foot-walking' : 'driving-car';
}

export function buildRouteCacheKey(
  profile: RouteProfile,
  coordinates: ReadonlyArray<LatLngPoint>
): string {
  const serialized = coordinates
    .map((c) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`)
    .join(';');
  return `${profile}:${serialized}`;
}

export function formatDurationCompact(durationS: number): string {
  const mins = Math.max(1, Math.round(durationS / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`;
}

export function formatDistanceKm(distanceM: number): string {
  const km = distanceM / 1000;
  if (km < 1) return `${Math.max(50, Math.round(distanceM / 10) * 10)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatRouteLabel(params: {
  distanceM: number;
  durationS: number;
  profile: RouteProfile;
  source: 'openrouteservice' | 'estimate' | 'fallback';
}): string {
  if (params.source === 'fallback') {
    const km = params.distanceM / 1000;
    const approx = km < 1 ? `${Math.max(50, Math.round(params.distanceM))} m` : `${km.toFixed(1)} km`;
    return `~${approx} straight-line`;
  }
  const dur = formatDurationCompact(params.durationS);
  const dist = formatDistanceKm(params.distanceM);
  return `${dur} · ${dist}`;
}

/**
 * Builds a deterministic client-side straight-line fallback when /v1/geo/route is offline.
 */
export function buildStraightLineFallback(a: LatLngPoint, b: LatLngPoint): RouteLegResult {
  const profile = selectRouteProfile(a, b);
  const km = haversineKm(a, b);
  const distanceM = Math.round(km * 1000);
  // Estimate duration conservatively for pacing checks even when offline:
  // walking ~4.5 km/h with 1.25x path factor; driving ~26 km/h with 1.35x road factor + 5m buffer
  const estHours =
    profile === 'foot-walking'
      ? (km * 1.25) / 4.5
      : (km * 1.35) / 26 + 5 / 60;
  const durationS = Math.max(60, Math.round(estHours * 3600));
  const key = buildRouteCacheKey(profile, [a, b]);

  return {
    key,
    profile,
    distanceM,
    durationS,
    coordinates: [
      [a.lng, a.lat],
      [b.lng, b.lat],
    ],
    source: 'fallback',
    label: formatRouteLabel({ distanceM, durationS, profile, source: 'fallback' }),
  };
}

/**
 * Builds a universal zero-key Google Maps URL for a day's ordered stops.
 */
export function buildDayGoogleMapsUrl(
  stops: ReadonlyArray<{ lat: number | null; lng: number | null; title?: string }>
): string | null {
  const geo = stops.filter(
    (s): s is { lat: number; lng: number; title?: string } =>
      isValidCoordinate(s.lat, s.lng)
  );
  if (geo.length === 0) return null;
  if (geo.length === 1) {
    const only = geo[0]!;
    return `https://www.google.com/maps/search/?api=1&query=${only.lat.toFixed(6)},${only.lng.toFixed(6)}`;
  }

  const origin = geo[0]!;
  const destination = geo[geo.length - 1]!;
  const middle = geo.slice(1, -1).slice(0, 9); // Google Maps universal URL supports up to 9 intermediate waypoints reliably

  let totalKm = 0;
  for (let i = 1; i < geo.length; i++) {
    totalKm += haversineKm(geo[i - 1]!, geo[i]!);
  }
  const travelmode = totalKm < 2.2 ? 'walking' : 'driving';

  const qs = new URLSearchParams({
    api: '1',
    origin: `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`,
    destination: `${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`,
    travelmode,
  });
  if (middle.length > 0) {
    qs.set(
      'waypoints',
      middle.map((m) => `${m.lat.toFixed(6)},${m.lng.toFixed(6)}`).join('|')
    );
  }
  return `https://www.google.com/maps/dir/?${qs.toString()}`;
}

export function computeCentroid(points: ReadonlyArray<LatLngPoint>): LatLngPoint | null {
  const valid = points.filter((p) => isValidCoordinate(p.lat, p.lng));
  if (valid.length === 0) return null;
  const sum = valid.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: Number((sum.lat / valid.length).toFixed(6)),
    lng: Number((sum.lng / valid.length).toFixed(6)),
  };
}

export function computeBoundingBoxString(
  points: ReadonlyArray<LatLngPoint>,
  padDeg = 0.08
): string | null {
  const valid = points.filter((p) => isValidCoordinate(p.lat, p.lng));
  if (valid.length === 0) return null;
  const lats = valid.map((p) => p.lat);
  const lngs = valid.map((p) => p.lng);
  const west = Math.max(-180, Math.min(...lngs) - padDeg);
  const south = Math.max(-90, Math.min(...lats) - padDeg);
  const east = Math.min(180, Math.max(...lngs) + padDeg);
  const north = Math.min(90, Math.max(...lats) + padDeg);
  return `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Safely checks WebGL availability before constructing maplibregl.Map so headless
 * browsers and restricted WebViews cleanly fall back to SchematicRouteMap without uncaught errors.
 */
export function isWebGLSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    if (!('WebGLRenderingContext' in window)) return false;
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}
