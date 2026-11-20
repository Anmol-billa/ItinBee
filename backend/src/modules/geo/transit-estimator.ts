import { buildGoogleMapsDirectionsUrl } from './curated-india-pois.js';

export type TransitProfile =
  | 'metro_peak'
  | 'hill_switchback'
  | 'indian_highway'
  | 'coastal_road'
  | 'walk';

export interface TransitEstimateInput {
  origin: { lat: number; lng: number; name?: string };
  destination: { lat: number; lng: number; name?: string };
  profile?: TransitProfile;
  departureTimeHHMM?: string;
}

export interface TransitEstimateResult {
  profile: TransitProfile;
  straightLineKm: number;
  distanceMultiplier: number;
  estimatedRoadKm: number;
  calibratedSpeedKmh: number;
  bufferMins: number;
  estimatedDurationMins: number;
  advisories: string[];
  googleMapsUrl: string;
  attribution: string;
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function isHillStationCoord(lat: number, lng: number): boolean {
  // Himalayan belt (Uttarakhand, Himachal, J&K, Ladakh, Sikkim/Arunachal) + Nilgiris/Munnar
  if (lat >= 29.5 && lat <= 35.0 && lng >= 74.0 && lng <= 81.5) return true;
  if (lat >= 26.8 && lat <= 28.5 && lng >= 88.0 && lng <= 94.0) return true;
  if (lat >= 10.0 && lat <= 11.6 && lng >= 76.5 && lng <= 77.3) return true;
  return false;
}

/**
 * India-Calibrated Transit Estimator (Plan 02 §5):
 * - `metro_peak`: `18 km/h` calibrated urban speed (`1.35x` road geometry + 8m pickup buffer)
 * - `hill_switchback`: `1.9x` switchback distance multiplier at `22 km/h` (replacing naive 1.3x @ 30 km/h)
 * - `indian_highway`: `1.32x` road multiplier at `48 km/h` (+ 20m FASTag/chai break over 150km)
 * - `coastal_road`: `1.4x` Konkan/Goa winding road multiplier at `32 km/h`
 * - Zero-key outbound Google Maps `api=1` directions URL.
 */
export function estimateIndiaTransit(
  input: TransitEstimateInput
): TransitEstimateResult {
  const straightLineKm = haversineKm(input.origin, input.destination);

  let profile: TransitProfile = input.profile ?? 'indian_highway';
  if (!input.profile) {
    if (
      isHillStationCoord(input.origin.lat, input.origin.lng) ||
      isHillStationCoord(input.destination.lat, input.destination.lng)
    ) {
      profile = 'hill_switchback';
    } else if (straightLineKm <= 25) {
      profile = 'metro_peak';
    }
  }

  let distanceMultiplier = 1.32;
  let calibratedSpeedKmh = 48;
  let bufferMins = 10;
  const advisories: string[] = [];

  switch (profile) {
    case 'metro_peak':
      distanceMultiplier = 1.35;
      calibratedSpeedKmh = 18;
      bufferMins = 8;
      advisories.push('Calibrated for Indian metro peak traffic (18 km/h average).');
      break;
    case 'hill_switchback':
      distanceMultiplier = 1.9;
      calibratedSpeedKmh = 22;
      bufferMins = 15;
      advisories.push(
        'Mountain switchback calibration applied (1.9x ghat road factor at 22 km/h).'
      );
      break;
    case 'coastal_road':
      distanceMultiplier = 1.4;
      calibratedSpeedKmh = 32;
      bufferMins = 10;
      advisories.push('Coastal/ghat two-lane road calibration applied (32 km/h).');
      break;
    case 'walk':
      distanceMultiplier = 1.25;
      calibratedSpeedKmh = 4.2;
      bufferMins = 0;
      break;
    case 'indian_highway':
    default:
      distanceMultiplier = 1.32;
      calibratedSpeedKmh = 48;
      bufferMins = straightLineKm * 1.32 > 150 ? 25 : 10;
      if (straightLineKm * 1.32 > 150) {
        advisories.push('Includes 25m highway toll / chai halt buffer.');
      }
      break;
  }

  const estimatedRoadKm = Number((straightLineKm * distanceMultiplier).toFixed(2));
  const rawDriveMins = (estimatedRoadKm / calibratedSpeedKmh) * 60;
  const estimatedDurationMins = Math.max(
    5,
    Math.round(rawDriveMins + bufferMins)
  );

  // Hill nightfall advisory
  if (profile === 'hill_switchback' && input.departureTimeHHMM) {
    const [hhStr, mmStr] = input.departureTimeHHMM.split(':');
    const hh = Number(hhStr);
    const mm = Number(mmStr || '0');
    if (Number.isFinite(hh)) {
      const depTotalMins = hh * 60 + mm;
      const arrTotalMins = depTotalMins + estimatedDurationMins;
      if (depTotalMins >= 16 * 60 + 30 || arrTotalMins >= 19 * 60) {
        advisories.push(
          'Hill sunset advisory: leg extends past 19:00 IST—consider departing before 15:00 on ghat roads.'
        );
      }
    }
  }

  // Delhi airport terminal transfer warning
  const combinedNames = `${input.origin.name ?? ''} ${input.destination.name ?? ''}`.toLowerCase();
  if (combinedNames.includes('del t1') && (combinedNames.includes('del t2') || combinedNames.includes('del t3'))) {
    advisories.push(
      'DEL Terminal Transfer Warning: T1 and T2/T3 are 7 km apart—allow at least 45–60 mins shuttle buffer.'
    );
  }

  const googleMapsUrl = buildGoogleMapsDirectionsUrl(
    input.origin,
    input.destination,
    profile === 'walk' ? 'walking' : 'driving'
  );

  return {
    profile,
    straightLineKm: Number(straightLineKm.toFixed(2)),
    distanceMultiplier,
    estimatedRoadKm,
    calibratedSpeedKmh,
    bufferMins,
    estimatedDurationMins,
    advisories,
    googleMapsUrl,
    attribution: '© OpenStreetMap contributors',
  };
}
