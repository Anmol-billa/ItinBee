import { SHOWCASE } from '@/data/showcase';
import { SAMPLE_WORKSPACES } from '@/data/sample-trips';
import { getBaseUrl } from '@/lib/api-client';
import { saveLocalWorkspace } from '@/lib/offline-db';
import { runSse, type SseMessage } from '@/lib/sse-stream';
import type { CurrencyCode, TripWorkspace } from '@/lib/types';
import {
  JOB_EVENT_TYPES,
  type ConfirmBody,
  type ConnectionState,
  type CreateJobBody,
  type CreateJobResponse,
  type DayItem,
  type GeoSuggestion,
  type IntentDestination,
  type JobEvent,
  type JobState,
  type TripIntent,
} from '@/lib/import-types';

export * from '@/lib/import-types';

/** When set at build time the client talks to Next route handlers under /api/mock/import. */
export const IMPORT_MOCK = process.env.NEXT_PUBLIC_IMPORT_MOCK === '1';

export const GUEST_TOKEN_KEY = 'itinbee_guest_token';
export const AUTH_TOKEN_KEY = 'itinbee_auth_token';
const LOCAL_PREVIEW_KEY = 'itinbee_local_preview';

/** Maps a contract path (/v1/...) to a URL. Mock mode strips /v1 and /import and targets the mock handlers. */
export function importUrl(path: string): string {
  if (IMPORT_MOCK) {
    return `/api/mock/import${path.replace(/^\/v1(\/import)?/, '')}`;
  }
  return `${getBaseUrl()}${path}`;
}

export class ImportApiError extends Error {
  status: number;
  code: string;
  resetAt?: string;
  constructor(status: number, code: string, message: string, resetAt?: string) {
    super(message);
    this.name = 'ImportApiError';
    this.status = status;
    this.code = code;
    this.resetAt = resetAt;
  }
}

let memoryToken: string | null = null;
let guestPromise: Promise<void> | null = null;
let localPreviewMemory = false;

export function syncImportAuthToken(token: string | null): void {
  memoryToken = token;
  if (!token) {
    guestPromise = null;
  }
}

export function isLocalPreviewEnabled(): boolean {
  if (IMPORT_MOCK) return false;
  if (localPreviewMemory) return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(LOCAL_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLocalPreviewEnabled(enabled: boolean): void {
  localPreviewMemory = enabled;
  if (typeof window === 'undefined') return;
  try {
    if (enabled) window.sessionStorage.setItem(LOCAL_PREVIEW_KEY, '1');
    else window.sessionStorage.removeItem(LOCAL_PREVIEW_KEY);
  } catch {
    /* storage blocked */
  }
}

function readToken(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const authToken = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (authToken) {
        memoryToken = authToken;
        return authToken;
      }
      if (IMPORT_MOCK) {
        return window.sessionStorage.getItem(GUEST_TOKEN_KEY);
      }
    } catch {
      /* storage blocked */
    }
    return null;
  }
  return memoryToken;
}

function authHeaders(): Record<string, string> {
  const t = readToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function parseError(res: Response): Promise<ImportApiError> {
  let body: { code?: string; error?: string; message?: string; resetAt?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  const code = body.code || body.error || (res.status === 429 ? 'quota_exceeded' : `http_${res.status}`);
  return new ImportApiError(
    res.status,
    code,
    body.message || (typeof body.error === 'string' ? body.error : '') || `Request failed (${res.status})`,
    body.resetAt
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(importUrl(path), {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new ImportApiError(
      0,
      'network',
      'Could not reach the Itinbee API server. Check that the backend is running, retry, or switch to offline preview.'
    );
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

/* ----- Explicit user-activated offline preview engine (never silent) ----- */

interface PreviewJob {
  id: string;
  createdAt: number;
  text: string;
  hasFiles: boolean;
  confirmedIntent?: TripIntent;
  tripId?: string;
}

const previewJobs = new Map<string, PreviewJob>();

const FALLBACK_COORDS: Record<string, { lat: number; lng: number; countryCode: string; kind: string; secondary: string }> = {
  'spiti-valley': { lat: 32.2461, lng: 78.0349, countryCode: 'IN', kind: 'region', secondary: 'Himachal Pradesh, India' },
  hampi: { lat: 15.335, lng: 76.46, countryCode: 'IN', kind: 'city', secondary: 'Karnataka, India' },
  kyoto: { lat: 35.0116, lng: 135.7681, countryCode: 'JP', kind: 'city', secondary: 'Japan' },
  alleppey: { lat: 9.4981, lng: 76.3388, countryCode: 'IN', kind: 'city', secondary: 'Kerala, India' },
  jaipur: { lat: 26.9124, lng: 75.7873, countryCode: 'IN', kind: 'city', secondary: 'Rajasthan, India' },
  udaipur: { lat: 24.5854, lng: 73.7125, countryCode: 'IN', kind: 'city', secondary: 'Rajasthan, India' },
  varanasi: { lat: 25.3176, lng: 82.9739, countryCode: 'IN', kind: 'city', secondary: 'Uttar Pradesh, India' },
  goa: { lat: 15.2993, lng: 74.124, countryCode: 'IN', kind: 'state', secondary: 'India' },
  ladakh: { lat: 34.1526, lng: 77.5771, countryCode: 'IN', kind: 'region', secondary: 'Ladakh, India' },
  munnar: { lat: 10.0889, lng: 77.0595, countryCode: 'IN', kind: 'city', secondary: 'Kerala, India' },
  rishikesh: { lat: 30.0869, lng: 78.2676, countryCode: 'IN', kind: 'city', secondary: 'Uttarakhand, India' },
  darjeeling: { lat: 27.041, lng: 88.2663, countryCode: 'IN', kind: 'city', secondary: 'West Bengal, India' },
  bali: { lat: -8.4095, lng: 115.1889, countryCode: 'ID', kind: 'region', secondary: 'Indonesia' },
  'ha-long-bay': { lat: 20.9101, lng: 107.1839, countryCode: 'VN', kind: 'region', secondary: 'Vietnam' },
  lisbon: { lat: 38.7223, lng: -9.1393, countryCode: 'PT', kind: 'city', secondary: 'Portugal' },
  'ha-noi': { lat: 21.0278, lng: 105.8342, countryCode: 'VN', kind: 'city', secondary: 'Vietnam' },
  manali: { lat: 32.2432, lng: 77.1892, countryCode: 'IN', kind: 'city', secondary: 'Himachal Pradesh, India' },
  kasol: { lat: 32.0099, lng: 77.3149, countryCode: 'IN', kind: 'city', secondary: 'Himachal Pradesh, India' },
  jodhpur: { lat: 26.2389, lng: 73.0243, countryCode: 'IN', kind: 'city', secondary: 'Rajasthan, India' },
  jaisalmer: { lat: 26.9157, lng: 70.9083, countryCode: 'IN', kind: 'city', secondary: 'Rajasthan, India' },
};

export function localGeoSuggestions(q: string): GeoSuggestion[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const showcaseHits: GeoSuggestion[] = SHOWCASE.filter((d) =>
    `${d.name} ${d.region} ${d.slug}`.toLowerCase().includes(needle)
  ).map((d) => {
    const geo = FALLBACK_COORDS[d.slug] ?? {
      lat: 20.5937,
      lng: 78.9629,
      countryCode: 'IN',
      kind: 'city',
      secondary: d.region,
    };
    return {
      id: `dest:${d.slug}`,
      source: 'destination' as const,
      slug: d.slug,
      name: d.name,
      secondary: geo.secondary,
      kind: geo.kind,
      lat: geo.lat,
      lng: geo.lng,
      countryCode: geo.countryCode,
      packStatus: null,
    };
  });

  const extraEntries: Array<[string, string]> = [
    ['manali', 'Manali'],
    ['kasol', 'Kasol'],
    ['jodhpur', 'Jodhpur'],
    ['jaisalmer', 'Jaisalmer'],
  ];
  for (const [slug, name] of extraEntries) {
    if (showcaseHits.some((h) => h.slug === slug)) continue;
    const geo = FALLBACK_COORDS[slug]!;
    if (`${name} ${geo.secondary}`.toLowerCase().includes(needle)) {
      showcaseHits.push({
        id: `dest:${slug}`,
        source: 'destination',
        slug,
        name,
        secondary: geo.secondary,
        kind: geo.kind,
        lat: geo.lat,
        lng: geo.lng,
        countryCode: geo.countryCode,
        packStatus: null,
      });
    }
  }
  return showcaseHits.slice(0, 6);
}

function buildLocalPreviewIntent(text: string, hasFiles: boolean): TripIntent {
  const lower = text.toLowerCase();
  const matched: IntentDestination[] = [];
  for (const d of SHOWCASE) {
    const firstWord = d.name.toLowerCase().split(' ')[0]!;
    if (lower.includes(d.name.toLowerCase()) || (firstWord.length >= 4 && lower.includes(firstWord))) {
      const geo = FALLBACK_COORDS[d.slug];
      matched.push({
        name: d.name,
        country: geo?.countryCode === 'IN' ? 'India' : d.region,
        order: matched.length,
        confidence: 0.9,
        destinationSlug: d.slug,
        lat: geo?.lat,
        lng: geo?.lng,
        resolved: Boolean(geo),
      });
    }
  }
  if (matched.length === 0) {
    const rishikesh = FALLBACK_COORDS.rishikesh!;
    matched.push({
      name: 'Rishikesh',
      country: 'India',
      order: 0,
      confidence: 0.72,
      destinationSlug: 'rishikesh',
      lat: rishikesh.lat,
      lng: rishikesh.lng,
      resolved: true,
    });
  }
  const daysMatch = text.match(/(\d+)\s*(?:day|night|d\b)/i);
  const lengthDays = daysMatch ? Math.min(30, Math.max(1, Number(daysMatch[1]))) : 4;
  const group =
    /friends/i.test(text)
      ? 'friends'
      : /honeymoon|couple|wife|husband/i.test(text)
        ? 'couple'
        : /parents|seniors|elder/i.test(text)
          ? 'seniors'
          : /family|kids/i.test(text)
            ? 'family'
            : /solo/i.test(text)
              ? 'solo'
              : null;

  return {
    title:
      matched.length > 1
        ? `${matched[0]!.name} & ${matched[1]!.name}`
        : `${matched[0]!.name} itinerary`,
    destinations: matched.slice(0, 4),
    dates: {
      start: null,
      end: null,
      lengthDays,
      flexibleMonth: /dec/i.test(text) ? 12 : /jun/i.test(text) ? 6 : /oct/i.test(text) ? 10 : null,
    },
    travellers: {
      count: group === 'couple' ? 2 : group === 'friends' ? 4 : group === 'family' ? 4 : null,
      group,
      hasChildren: /kids|children/i.test(text) ? true : null,
      hasSeniors: /parents|seniors|elder|65/i.test(text) ? true : null,
    },
    budget: {
      amount: null,
      currency: 'INR',
      tier: /luxury|premium|boutique/i.test(text) ? 'premium' : /budget|backpack/i.test(text) ? 'budget' : 'mid',
    },
    interests: [
      ...(/food|cafe/i.test(text) ? ['Food', 'Cafes'] : ['Local sights']),
      ...(/trek|mountain/i.test(text) ? ['Mountains'] : []),
      ...(/temple|darshan|aarti|yatra/i.test(text) ? ['Spiritual'] : []),
    ],
    pace: /relax|slow|parents|elder/i.test(text) ? 'relaxed' : 'moderate',
    diet: /jain/i.test(text) ? ['Jain'] : /veg/i.test(text) ? ['Vegetarian'] : [],
    mustInclude: [],
    avoid: [],
    bookings: hasFiles
      ? [
          {
            itemKind: 'transit',
            title: 'Attached ticket anchor',
            provider: 'Ticket upload',
            summary: 'Parsed locally in offline preview mode — verify times in editor.',
            lowConfidenceFields: ['startIso'],
          },
        ]
      : [],
    assumptions: [
      'Offline preview mode: deterministic parser used while backend is unreachable',
      `${lengthDays}-day moderate pace with morning & evening anchors`,
    ],
    clarifyingQuestions: group
      ? []
      : [
          {
            id: 'who',
            question: 'Who is travelling on this trip?',
            options: ['Solo', 'Couple', 'Family', 'Friends'],
          },
        ],
  };
}

function chooseFallbackTripSlug(destinations: IntentDestination[]): string {
  const names = destinations.map((d) => `${d.destinationSlug ?? ''} ${d.name}`.toLowerCase()).join(' ');
  if (names.includes('goa')) return 'goa-south-5d';
  if (names.includes('varanasi') || names.includes('kashi')) return 'kashi-snr-3d';
  if (names.includes('vietnam') || names.includes('hanoi') || names.includes('ha-long')) return 'vietnam-7d';
  return 'rishi-lnd-4d';
}

async function persistPreviewWorkspace(intent: TripIntent, generatedDays: Array<{ dayNumber: number; title: string; items: DayItem[] }>): Promise<string> {
  const baseSlug = chooseFallbackTripSlug(intent.destinations);
  const template = SAMPLE_WORKSPACES[baseSlug] ?? SAMPLE_WORKSPACES['rishi-lnd-4d']!;
  const clone = structuredClone(template);
  const now = new Date().toISOString();
  const draftId = `local-${Date.now().toString(36)}`;
  const destSummary = `${intent.destinations.map((d) => d.name).join(' · ')} (${generatedDays.length}D)`;

  const customWs: TripWorkspace = {
    ...clone,
    trip: {
      ...clone.trip,
      id: draftId,
      shortId: baseSlug,
      title: intent.title || clone.trip.title,
      destinationSummary: destSummary,
      startDate: intent.dates.start,
      endDate: intent.dates.end,
      elderModeEnabled: Boolean(intent.travellers.hasSeniors ?? true),
      isSample: false,
      createdAt: now,
      updatedAt: now,
    },
  };
  await saveLocalWorkspace(draftId, customWs);
  return baseSlug;
}

/* ----- Public API ----- */

/** POST /v1/auth/guest. Called once and cached; the server is idempotent per cookie. */
export function createGuestSession(): Promise<void> {
  if (isLocalPreviewEnabled()) return Promise.resolve();
  if (readToken()) return Promise.resolve();
  if (typeof window !== 'undefined') {
    try {
      if (window.sessionStorage.getItem(GUEST_TOKEN_KEY)) return Promise.resolve();
    } catch {
      /* ignore */
    }
  }
  if (!guestPromise) {
    guestPromise = request<{ token?: string }>('/v1/auth/guest', { method: 'POST', body: '{}' })
      .then((r) => {
        if (r.token) {
          try {
            if (!window.localStorage.getItem(AUTH_TOKEN_KEY)) {
              window.sessionStorage.setItem(GUEST_TOKEN_KEY, r.token);
            }
          } catch {
            /* storage blocked */
          }
        }
      })
      .catch((err) => {
        guestPromise = null; // allow retry
        throw err;
      });
  }
  return guestPromise;
}

export async function createImportJob(body: CreateJobBody): Promise<CreateJobResponse> {
  if (isLocalPreviewEnabled()) {
    const jobId = `preview_${Math.random().toString(36).slice(2, 9)}`;
    previewJobs.set(jobId, {
      id: jobId,
      createdAt: Date.now(),
      text: [body.text ?? '', ...(body.urls ?? [])].join(' '),
      hasFiles: Boolean(body.files?.length),
    });
    return { jobId, status: 'queued', eventsUrl: `/v1/import/jobs/${jobId}/events` };
  }
  // In live mode, POST /v1/import/jobs atomically mints the HttpOnly guest session cookie if needed,
  // avoiding an extra cold-start preflight round-trip. Keep explicit preflight only in mock mode.
  if (IMPORT_MOCK) {
    await createGuestSession();
  }
  return request<CreateJobResponse>('/v1/import/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getJob(jobId: string): Promise<JobState> {
  if (jobId.startsWith('preview_')) {
    const pj = previewJobs.get(jobId);
    if (!pj) {
      return Promise.reject(new ImportApiError(404, 'not_found', 'This local preview session ended. Start a new one below.'));
    }
    const intent = pj.confirmedIntent ?? buildLocalPreviewIntent(pj.text, pj.hasFiles);
    const now = new Date().toISOString();
    return Promise.resolve({
      id: pj.id,
      status: pj.tripId ? 'done' : pj.confirmedIntent ? 'building' : 'needs_review',
      mode: 'basic',
      intent,
      tripId: pj.tripId,
      shortId: pj.tripId,
      createdAt: new Date(pj.createdAt).toISOString(),
      updatedAt: now,
    });
  }
  return request<JobState>(`/v1/import/jobs/${encodeURIComponent(jobId)}`);
}

export async function confirmJob(jobId: string, body: ConfirmBody): Promise<{ status: 'building' }> {
  if (jobId.startsWith('preview_')) {
    const pj = previewJobs.get(jobId);
    if (!pj) throw new ImportApiError(404, 'not_found', 'This local preview session ended.');
    pj.confirmedIntent = body.intent;
    return { status: 'building' };
  }
  await createGuestSession();
  return request<{ status: 'building' }>(`/v1/import/jobs/${encodeURIComponent(jobId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function geoAutocomplete(q: string, signal?: AbortSignal): Promise<GeoSuggestion[]> {
  if (q.trim().length < 2) return [];
  if (isLocalPreviewEnabled()) {
    return localGeoSuggestions(q);
  }
  try {
    const res = await request<{ results: GeoSuggestion[] }>(
      `/v1/geo/autocomplete?q=${encodeURIComponent(q)}&limit=6`,
      { signal }
    );
    return res.results ?? [];
  } catch (err) {
    if (signal?.aborted) return [];
    if (err instanceof ImportApiError && (err.status === 0 || err.status >= 500)) {
      return localGeoSuggestions(q);
    }
    throw err;
  }
}

export interface ManualTripInput {
  title: string;
  destinationSummary?: string;
  startDate?: string | null;
  endDate?: string | null;
  daysCount?: number;
  homeCurrency?: CurrencyCode;
  elderModeEnabled?: boolean;
}

export async function createManualTrip(input: ManualTripInput): Promise<{ tripId: string; shortId: string; offlinePreview?: boolean }> {
  if (isLocalPreviewEnabled()) {
    const baseSlug = chooseFallbackTripSlug([{ name: input.destinationSummary ?? input.title, order: 0, confidence: 1, resolved: false }]);
    const template = SAMPLE_WORKSPACES[baseSlug] ?? SAMPLE_WORKSPACES['rishi-lnd-4d']!;
    const now = new Date().toISOString();
    const draftId = `local-${Date.now().toString(36)}`;
    await saveLocalWorkspace(draftId, {
      ...structuredClone(template),
      trip: {
        ...template.trip,
        id: draftId,
        shortId: baseSlug,
        title: input.title,
        destinationSummary: input.destinationSummary || template.trip.destinationSummary,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        homeCurrency: input.homeCurrency ?? 'INR',
        elderModeEnabled: input.elderModeEnabled ?? true,
        isSample: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    return { tripId: baseSlug, shortId: baseSlug, offlinePreview: true };
  }

  await createGuestSession();
  const res = await request<{ trip: { id: string; shortId: string } }>('/v1/trips', {
    method: 'POST',
    body: JSON.stringify({
      title: input.title,
      destinationSummary: input.destinationSummary,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      daysCount: input.daysCount ?? 3,
      homeCurrency: input.homeCurrency ?? 'INR',
      elderModeEnabled: input.elderModeEnabled ?? true,
    }),
  });
  return { tripId: res.trip.id, shortId: res.trip.shortId };
}

/** Parses one SSE message into a typed event, or null for unknown/invalid ones. */
export function toJobEvent(m: SseMessage): JobEvent | null {
  if (!(JOB_EVENT_TYPES as readonly string[]).includes(m.event)) return null;
  try {
    return { type: m.event, data: JSON.parse(m.data) } as JobEvent;
  } catch {
    return null;
  }
}

/** Synthetic events from a polled JobState, for when streaming is unavailable. */
export function eventsFromJobState(prev: JobState | null, next: JobState): JobEvent[] {
  const out: JobEvent[] = [];
  if (!prev || prev.status !== next.status || prev.mode !== next.mode) {
    out.push({ type: 'status', data: { status: next.status, mode: next.mode } });
  }
  if (next.intent && !prev?.intent) out.push({ type: 'intent', data: { intent: next.intent } });
  if (next.status === 'done' && next.tripId) {
    out.push({ type: 'done', data: { tripId: next.tripId, shortId: next.shortId ?? next.tripId } });
  }
  if (next.status === 'failed') {
    out.push({
      type: 'error',
      data: next.error ?? { code: 'failed', message: 'We could not finish this trip.' },
    });
  }
  return out;
}

export interface StreamHandlers {
  onEvent: (e: JobEvent) => void;
  onConnection?: (s: ConnectionState) => void;
}

export interface StreamOptions {
  /** Return true when this event means we can stop listening (default: done/error). */
  stopAfter?: (e: JobEvent) => boolean;
  pollIntervalMs?: number;
}

const defaultStop = (e: JobEvent) => e.type === 'done' || e.type === 'error';

function streamLocalPreviewJob(
  job: PreviewJob,
  handlers: StreamHandlers,
  stopAfter: (e: JobEvent) => boolean
): () => void {
  let cancelled = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const schedule = (ms: number, fn: () => void) => {
    timers.push(
      setTimeout(() => {
        if (!cancelled) fn();
      }, ms)
    );
  };
  const emit = (e: JobEvent) => {
    if (cancelled) return;
    handlers.onEvent(e);
    if (stopAfter(e)) cancelled = true;
  };

  handlers.onConnection?.('live');

  if (!job.confirmedIntent) {
    const intent = buildLocalPreviewIntent(job.text, job.hasFiles);
    schedule(80, () => emit({ type: 'status', data: { status: 'understanding', mode: 'basic' } }));
    intent.destinations.forEach((d, idx) => {
      schedule(280 + idx * 240, () =>
        emit({ type: 'detected', data: { kind: 'destination', label: d.name, resolved: d.resolved } })
      );
    });
    schedule(800, () =>
      emit({
        type: 'detected',
        data: { kind: 'dates', label: `${intent.dates.lengthDays ?? 4} days`, resolved: true },
      })
    );
    schedule(1150, () => emit({ type: 'intent', data: { intent } }));
    schedule(1200, () => emit({ type: 'status', data: { status: 'needs_review', mode: 'basic' } }));
  } else {
    const intent = job.confirmedIntent;
    const totalDays = Math.min(Math.max(intent.dates.lengthDays ?? 4, 1), 14);
    const generatedDays: Array<{ dayNumber: number; title: string; items: DayItem[] }> = [];
    schedule(60, () => emit({ type: 'status', data: { status: 'building', mode: 'basic' } }));
    for (let n = 1; n <= totalDays; n++) {
      const dest =
        intent.destinations[
          Math.min(
            Math.floor(((n - 1) * intent.destinations.length) / totalDays),
            Math.max(0, intent.destinations.length - 1)
          )
        ];
      const baseLat = dest?.lat ?? 30.0869;
      const baseLng = dest?.lng ?? 78.2676;
      const items: DayItem[] = [
        {
          title: `Morning walk & breakfast in ${dest?.name ?? 'town'}`,
          kind: 'meal',
          startTime: '09:00',
          lat: baseLat + 0.008 * n,
          lng: baseLng - 0.006 * n,
        },
        {
          title: `${dest?.name ?? 'Destination'} signature landmark`,
          kind: 'activity',
          startTime: '11:00',
          lat: baseLat - 0.01 * n,
          lng: baseLng + 0.011 * n,
        },
        {
          title: `Sunset viewpoint & local dinner`,
          kind: 'activity',
          startTime: '17:30',
          lat: baseLat + 0.014 * (n % 3),
          lng: baseLng + 0.009 * n,
        },
      ];
      const dayPayload = {
        dayNumber: n,
        title: dest ? `${dest.name} — Day ${n}` : `Day ${n}`,
        items,
      };
      generatedDays.push(dayPayload);
      schedule(320 + (n - 1) * 380, () => emit({ type: 'day', data: dayPayload }));
    }
    schedule(420 + totalDays * 380, () => {
      void persistPreviewWorkspace(intent, generatedDays).then((slug) => {
        job.tripId = slug;
        emit({ type: 'done', data: { tripId: slug, shortId: slug } });
      });
    });
  }

  return () => {
    cancelled = true;
    for (const t of timers) clearTimeout(t);
  };
}

/**
 * Streams a job's events (fetch-based SSE with reconnect/backoff). After the retry
 * ladder is exhausted it falls back to polling GET /v1/import/jobs/:id.
 * Returns a stop function.
 */
export function streamJob(
  jobId: string,
  handlers: StreamHandlers,
  options: StreamOptions = {}
): () => void {
  const stopAfter = options.stopAfter ?? defaultStop;
  if (jobId.startsWith('preview_')) {
    const pj = previewJobs.get(jobId);
    if (!pj) {
      handlers.onEvent({
        type: 'error',
        data: { code: 'not_found', message: 'This local preview session ended. Start a new trip below.' },
      });
      return () => {};
    }
    return streamLocalPreviewJob(pj, handlers, stopAfter);
  }

  const ctrl = new AbortController();
  const pollMs = options.pollIntervalMs ?? 2000;
  let finished = false;

  const emit = (e: JobEvent) => {
    if (finished || ctrl.signal.aborted) return;
    handlers.onEvent(e);
    if (stopAfter(e)) finished = true;
  };

  const poll = async () => {
    let prev: JobState | null = null;
    let consecutiveNetErrors = 0;
    handlers.onConnection?.('polling');
    while (!finished && !ctrl.signal.aborted) {
      try {
        const next = await getJob(jobId);
        consecutiveNetErrors = 0;
        handlers.onConnection?.('polling');
        for (const e of eventsFromJobState(prev, next)) emit(e);
        prev = next;
        if (finished) return;
        if (next.status === 'needs_review' || next.status === 'done' || next.status === 'failed') {
          if (next.status !== 'needs_review') return;
        }
      } catch (err) {
        if (err instanceof ImportApiError && err.status === 404) {
          emit({ type: 'error', data: { code: 'not_found', message: 'This trip request has expired.' } });
          return;
        }
        consecutiveNetErrors += 1;
        handlers.onConnection?.('offline');
        if (err instanceof ImportApiError && err.status === 0 && consecutiveNetErrors >= 3) {
          emit({
            type: 'error',
            data: {
              code: 'network',
              message: 'Lost connection to the Itinbee server. Check your connection or retry.',
            },
          });
          return;
        }
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, pollMs);
        ctrl.signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
      });
    }
  };

  void (async () => {
    const result = await runSse({
      signal: ctrl.signal,
      open: (signal) =>
        fetch(importUrl(`/v1/import/jobs/${encodeURIComponent(jobId)}/events`), {
          credentials: 'include',
          headers: { Accept: 'text/event-stream', ...authHeaders() },
          cache: 'no-store',
          signal,
        }),
      onMessage: (m) => {
        const e = toJobEvent(m);
        if (e) emit(e);
      },
      isTerminal: (m) => {
        const e = toJobEvent(m);
        return finished || (e ? stopAfter(e) : false);
      },
      onState: (s) => handlers.onConnection?.(s),
    });
    if (result === 'terminal' || result === 'aborted' || finished) return;
    await poll();
  })();

  return () => {
    finished = true;
    ctrl.abort();
  };
}
