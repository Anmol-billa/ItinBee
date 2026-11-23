/**
 * Hand-written mirror of plan/05_api_contracts_import_explore.md (Import jobs).
 * The zod source of truth lives in backend/src/modules/import/intent.ts.
 */

export type GroupType = 'solo' | 'couple' | 'family' | 'friends' | 'seniors' | 'mixed';
export type BudgetTier = 'budget' | 'mid' | 'premium';
export type Pace = 'relaxed' | 'moderate' | 'packed';
export type TransportMode = 'any' | 'train' | 'flight' | 'drive' | 'bus' | 'combo';

export interface JourneyPlace {
  name: string;
  city?: string;
  hubCode?: string;
  country?: string;
  destinationSlug?: string;
  lat?: number;
  lng?: number;
  resolved: boolean;
}

export interface TransitLegSpec {
  mode: 'rail' | 'flight' | 'bus' | 'highway_cab' | 'hill_cab' | 'ferry';
  title: string;
  carrierName?: string;
  vehicleCode?: string;
  fromName: string;
  fromCode?: string;
  fromLat: number;
  fromLng: number;
  toName: string;
  toCode?: string;
  toLat: number;
  toLng: number;
  departureTime: string;
  arrivalTime: string;
  durationMins: number;
  distanceKm: number;
  dayOffset?: number;
  overnightHaltCity?: string;
  coachOrTerminal?: string;
  approxFareInr?: number;
  advisory?: string;
  source: 'live_api' | 'verified_timetable' | 'ors_road' | 'ai_grounded';
}

export interface TransitRouteOption {
  id: string;
  direction: 'outbound' | 'return';
  modeCategory: 'train' | 'flight' | 'drive' | 'bus' | 'combo';
  summaryLabel: string;
  totalDurationMins: number;
  transitDaysRequired: number;
  totalDistanceKm: number;
  approxFareInr?: number;
  recommended?: boolean;
  feasibilityWarning?: string;
  legs: TransitLegSpec[];
}

export interface IntentDestination {
  name: string;
  country?: string;
  nights?: number;
  order: number;
  /** 0..1 */
  confidence: number;
  destinationSlug?: string;
  lat?: number;
  lng?: number;
  resolved: boolean;
}

export interface IntentMustInclude {
  name: string;
  sourceQuote: string;
  placeRefId?: string;
  lat?: number;
  lng?: number;
  resolved: boolean;
}

export interface BookingSummaryObject {
  headline: string;
  routeLabel?: string;
  vehicleNumber?: string;
  vehicleName?: string;
  operatorName?: string;
  coach?: string;
  seatOrBerth?: string;
  terminalOrPlatform?: string;
  boardingPoint?: string;
  propertyName?: string;
}

export interface IntentBooking {
  itemKind: string;
  title: string;
  provider: string;
  startIso?: string;
  endIso?: string;
  summary: string | BookingSummaryObject;
  lowConfidenceFields: string[];
}

export type BookingAnchor = IntentBooking;

/**
 * Formats a `BookingAnchor.summary` (either a plain string in local preview
 * or a structured `BookingSummaryObject` from the backend) into a clean human-readable string.
 */
export function formatBookingSummary(
  summary: string | BookingSummaryObject | Record<string, unknown> | null | undefined
): string {
  if (!summary) return '';
  if (typeof summary === 'string') return summary.trim();
  if (typeof summary === 'object') {
    const rec = summary as Record<string, unknown>;
    const str = (key: string) =>
      typeof rec[key] === 'string' && (rec[key] as string).trim()
        ? (rec[key] as string).trim()
        : null;
    const headline = str('headline') || str('propertyName') || str('routeLabel');
    const vehicle = str('vehicleNumber') || str('vehicleName') || str('operatorName');
    const route = headline && str('routeLabel') && str('routeLabel') !== headline ? str('routeLabel') : null;
    const coachVal = str('coach');
    const coach = coachVal
      ? /^coach\b/i.test(coachVal)
        ? coachVal
        : `Coach ${coachVal}`
      : null;
    const terminal = str('terminalOrPlatform');
    const seat = str('seatOrBerth');
    return [headline, route, vehicle, terminal, coach, seat].filter(Boolean).join(' · ');
  }
  return String(summary);
}

export interface IntentQuestion {
  id: string;
  question: string;
  options?: string[];
}

export interface TripIntent {
  title: string;
  origin?: JourneyPlace | null;
  returnPoint?: JourneyPlace | null;
  roundTrip?: boolean;
  transportMode?: TransportMode;
  selectedOutboundOptionId?: string | null;
  selectedReturnOptionId?: string | null;
  routeOptions?: {
    outbound: TransitRouteOption[];
    return: TransitRouteOption[];
  };
  destinations: IntentDestination[];
  dates: {
    start: string | null;
    end: string | null;
    lengthDays: number | null;
    flexibleMonth: number | null;
  };
  travellers: {
    count: number | null;
    group: GroupType | null;
    hasChildren: boolean | null;
    hasSeniors: boolean | null;
  };
  budget: { amount: number | null; currency: string | null; tier: BudgetTier | null };
  interests: string[];
  pace: Pace | null;
  diet: string[];
  mustInclude: IntentMustInclude[];
  avoid: string[];
  bookings: IntentBooking[];
  assumptions: string[];
  /** max 3 */
  clarifyingQuestions: IntentQuestion[];
}

export type JobStatus = 'queued' | 'understanding' | 'needs_review' | 'building' | 'done' | 'failed';
export type JobMode = 'ai' | 'basic';

export interface JobState {
  id: string;
  status: JobStatus;
  mode: JobMode;
  intent?: TripIntent;
  tripId?: string;
  shortId?: string;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
}

export type DetectedKind =
  | 'destination'
  | 'place'
  | 'dates'
  | 'travellers'
  | 'booking'
  | 'budget'
  | 'interest';

export interface DayItem {
  title: string;
  kind: string;
  lat?: number;
  lng?: number;
  startTime?: string;
  placeRefId?: string;
}

export type JobEvent =
  | { type: 'status'; data: { status: JobStatus; mode: JobMode } }
  | { type: 'detected'; data: { kind: DetectedKind; label: string; resolved?: boolean } }
  | { type: 'intent'; data: { intent: TripIntent } }
  | { type: 'day'; data: { dayNumber: number; title: string; items: DayItem[] } }
  | { type: 'done'; data: { tripId: string; shortId: string } }
  | { type: 'error'; data: { code: string; message: string } };

export const JOB_EVENT_TYPES = ['status', 'detected', 'intent', 'day', 'done', 'error'] as const;

export interface ImportFilePayload {
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface CreateJobBody {
  text?: string;
  urls?: string[];
  files?: ImportFilePayload[];
  locale?: 'en' | 'hi';
  baseTripSlug?: string;
}

export interface CreateJobResponse {
  jobId: string;
  status: 'queued';
  eventsUrl: string;
}

export interface ConfirmBody {
  intent: TripIntent;
  answers?: Record<string, string>;
}

/** Row returned by GET /v1/geo/autocomplete (results[]). */
export interface GeoSuggestion {
  id: string;
  source: 'destination' | 'photon';
  slug: string | null;
  name: string;
  secondary: string;
  kind: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  packStatus: string | null;
}

export type ConnectionState = 'live' | 'reconnecting' | 'polling' | 'offline';

export const LIMITS = {
  textChars: 20_000,
  urls: 5,
  files: 3,
  totalBytes: 8 * 1024 * 1024,
} as const;
