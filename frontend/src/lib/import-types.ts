/**
 * Hand-written mirror of plan/05_api_contracts_import_explore.md (Import jobs).
 * The zod source of truth lives in backend/src/modules/import/intent.ts.
 */

export type GroupType = 'solo' | 'couple' | 'family' | 'friends' | 'seniors' | 'mixed';
export type BudgetTier = 'budget' | 'mid' | 'premium';
export type Pace = 'relaxed' | 'moderate' | 'packed';

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

export interface IntentBooking {
  itemKind: string;
  title: string;
  provider: string;
  startIso?: string;
  endIso?: string;
  summary: string;
  lowConfidenceFields: string[];
}

export interface IntentQuestion {
  id: string;
  question: string;
  options?: string[];
}

export interface TripIntent {
  title: string;
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
