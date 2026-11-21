/**
 * In-memory mock of the Import API (plan/05_api_contracts_import_explore.md) for building
 * and testing the Create flow without the real backend. SERVER ONLY: imported by the
 * route handlers under src/app/api/mock/import/**, which 404 unless the mock flag is set.
 *
 * Jobs are time-driven: every event has an offset from job creation (understanding phase)
 * or from confirmation (building phase). Streaming, polling and replay all read the same
 * timeline, so reconnects behave like the real server (full replay on connect).
 */
import type {
  DayItem,
  JobEvent,
  JobState,
  JobStatus,
  TripIntent,
  CreateJobBody,
  IntentDestination,
} from '@/lib/import-types';

export function mockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_IMPORT_MOCK === '1' || process.env.IMPORT_MOCK === '1';
}

export function mockSpeed(): number {
  const n = Number(process.env.IMPORT_MOCK_SPEED);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

interface MockJob {
  id: string;
  createdAt: number;
  body: CreateJobBody;
  text: string;
  confirmedAt?: number;
  confirmedIntent?: TripIntent;
}

const g = globalThis as unknown as { __importMockJobs?: Map<string, MockJob> };
const jobs: Map<string, MockJob> = (g.__importMockJobs ??= new Map());

const PLACES: Record<string, { name: string; country: string; lat: number; lng: number; slug: string }> = {
  manali: { name: 'Manali', country: 'India', lat: 32.2432, lng: 77.1892, slug: 'manali' },
  kasol: { name: 'Kasol', country: 'India', lat: 32.0099, lng: 77.3149, slug: 'kasol' },
  goa: { name: 'Goa', country: 'India', lat: 15.2993, lng: 74.124, slug: 'goa' },
  jaipur: { name: 'Jaipur', country: 'India', lat: 26.9124, lng: 75.7873, slug: 'jaipur' },
  udaipur: { name: 'Udaipur', country: 'India', lat: 24.5854, lng: 73.7125, slug: 'udaipur' },
  munnar: { name: 'Munnar', country: 'India', lat: 10.0889, lng: 77.0595, slug: 'munnar' },
  alleppey: { name: 'Alleppey', country: 'India', lat: 9.4981, lng: 76.3388, slug: 'alleppey' },
  rishikesh: { name: 'Rishikesh', country: 'India', lat: 30.0869, lng: 78.2676, slug: 'rishikesh' },
  ladakh: { name: 'Ladakh', country: 'India', lat: 34.1526, lng: 77.5771, slug: 'ladakh' },
  spiti: { name: 'Spiti Valley', country: 'India', lat: 32.2461, lng: 78.0349, slug: 'spiti-valley' },
  kyoto: { name: 'Kyoto', country: 'Japan', lat: 35.0116, lng: 135.7681, slug: 'kyoto' },
  bali: { name: 'Bali', country: 'Indonesia', lat: -8.4095, lng: 115.1889, slug: 'bali' },
};

function detectDestinations(text: string): IntentDestination[] {
  const lower = text.toLowerCase();
  const found = Object.keys(PLACES)
    .map((k) => ({ k, at: lower.indexOf(k) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .slice(0, 4);
  const keys = found.length > 0 ? found.map((f) => f.k) : ['manali', 'kasol'];
  const out: IntentDestination[] = keys.map((k, i) => {
    const p = PLACES[k];
    return {
      name: p.name,
      country: p.country,
      order: i,
      confidence: 0.94,
      destinationSlug: p.slug,
      lat: p.lat,
      lng: p.lng,
      resolved: true,
    };
  });
  if (/tosh|malana/i.test(text)) {
    out.push({ name: /tosh/i.test(text) ? 'Tosh' : 'Malana', order: out.length, confidence: 0.52, resolved: false });
  }
  return out;
}

export function buildIntent(job: MockJob): TripIntent {
  const text = job.text;
  const destinations = detectDestinations(text);
  const hasDates = /\b(june|july|may|december|jan|feb|march|april|oct|nov|\d+\s*(day|night)s?)\b/i.test(text);
  const knownGroup = /friends|family|couple|wife|husband|honeymoon|parents|solo/i.test(text);
  const group = /friends/i.test(text)
    ? 'friends'
    : /family|parents/i.test(text)
      ? 'family'
      : /honeymoon|couple|wife|husband/i.test(text)
        ? 'couple'
        : null;
  const lengthMatch = text.match(/(\d+)\s*(?:day|night)/i);
  const questions: TripIntent['clarifyingQuestions'] = [];
  if (!hasDates) {
    questions.push({
      id: 'when',
      question: 'No dates found. Roughly when are you going?',
      options: ['This month', 'In the next 2 to 3 months', 'Later this year', 'Not sure yet'],
    });
  }
  if (!knownGroup) {
    questions.push({
      id: 'who',
      question: 'Who is travelling?',
      options: ['Just me', 'Couple', 'Family with kids', 'Friends'],
    });
  }
  return {
    title: destinations.length > 1 ? `${destinations[0].name} and ${destinations[1].name}` : `${destinations[0].name} trip`,
    destinations,
    dates: {
      start: null,
      end: null,
      lengthDays: lengthMatch ? Math.min(30, Number(lengthMatch[1])) : 5,
      flexibleMonth: /june/i.test(text) ? 6 : null,
    },
    travellers: {
      count: group === 'friends' ? 4 : group === 'couple' ? 2 : group === 'family' ? 4 : null,
      group,
      hasChildren: group === 'family' ? true : null,
      hasSeniors: /parents/i.test(text) ? true : null,
    },
    budget: { amount: null, currency: 'INR', tier: /budget|cheap/i.test(text) ? 'budget' : null },
    interests: ['Mountains', 'Cafes', ...(/trek/i.test(text) ? ['Trekking'] : [])],
    pace: null,
    diet: /veg/i.test(text) ? ['Vegetarian'] : [],
    mustInclude: [
      { name: 'Hadimba Temple', sourceQuote: 'Hadimba temple', resolved: true, lat: 32.2479, lng: 77.1804 },
      { name: 'Chalal riverside cafes', sourceQuote: 'cafes in Chalal', resolved: false },
    ],
    avoid: [],
    bookings: /ticket|bus|train|pdf/i.test(text) || (job.body.files?.length ?? 0) > 0
      ? [
          {
            itemKind: 'transport',
            title: 'Delhi to Manali overnight bus',
            provider: 'HRTC Volvo',
            startIso: '2026-06-12T20:30:00+05:30',
            summary: 'Departs Kashmere Gate 20:30, arrives Manali about 08:00.',
            lowConfidenceFields: ['endIso'],
          },
        ]
      : [],
    assumptions: ['Travelling from Delhi', 'Moderate pace, about 3 stops a day', 'Mid-range stays', 'Budget not mentioned'],
    clarifyingQuestions: questions.slice(0, 3),
  };
}

export function createMockJob(body: CreateJobBody): MockJob {
  const id = `mock_${Math.random().toString(36).slice(2, 10)}`;
  const text = [body.text ?? '', ...(body.urls ?? [])].join(' ');
  const job: MockJob = { id, createdAt: Date.now(), body, text };
  jobs.set(id, job);
  // Keep the map small in long dev sessions.
  if (jobs.size > 200) jobs.delete(jobs.keys().next().value as string);
  return job;
}

export function getMockJob(id: string): MockJob | undefined {
  return jobs.get(id);
}

export function confirmMockJob(job: MockJob, intent: TripIntent): void {
  job.confirmedAt = Date.now();
  job.confirmedIntent = intent;
}

interface Timed {
  at: number; // ms since epoch
  event: JobEvent;
  /** state after this event, for GET /jobs/:id */
  status?: JobStatus;
}

function tripLength(intent: TripIntent): number {
  const { dates } = intent;
  if (dates.start && dates.end) {
    const d = Math.round((Date.parse(dates.end) - Date.parse(dates.start)) / 86_400_000) + 1;
    if (d >= 1) return Math.min(d, 30);
  }
  return Math.min(Math.max(dates.lengthDays ?? 4, 1), 30);
}

const ITEM_TEMPLATES: Array<{ title: string; kind: string; time: string }> = [
  { title: 'Slow breakfast at a local cafe', kind: 'food', time: '09:00' },
  { title: 'Main sight of the morning', kind: 'sight', time: '10:30' },
  { title: 'Lunch with a view', kind: 'food', time: '13:30' },
  { title: 'Evening walk and sunset', kind: 'activity', time: '17:00' },
];

function dayEvent(intent: TripIntent, n: number): JobEvent {
  const dests = intent.destinations.length > 0 ? intent.destinations : [];
  const perDest = Math.max(1, Math.ceil(tripLength(intent) / Math.max(dests.length, 1)));
  const dest = dests[Math.min(Math.floor((n - 1) / perDest), Math.max(dests.length - 1, 0))];
  const items: DayItem[] = ITEM_TEMPLATES.slice(0, 3 + (n % 2)).map((t, i) => {
    const item: DayItem = {
      title: i === 1 && dest ? `${dest.name}: ${n === 1 ? 'old town and river walk' : `day ${n} highlight`}` : t.title,
      kind: t.kind,
      startTime: t.time,
    };
    if (dest?.lat !== undefined && dest.lng !== undefined) {
      item.lat = dest.lat + (((n * 7 + i * 5) % 9) - 4) * 0.012;
      item.lng = dest.lng + (((n * 5 + i * 3) % 9) - 4) * 0.012;
    }
    return item;
  });
  return {
    type: 'day',
    data: { dayNumber: n, title: dest ? `${dest.name}${n === 1 ? ', arrive and settle' : ''}` : `Day ${n}`, items },
  };
}

export function buildTimeline(job: MockJob): Timed[] {
  const k = 1 / mockSpeed();
  const t0 = job.createdAt;
  const basic = /\bbasic\b/i.test(job.text);
  const failing = /failme/i.test(job.text);
  const mode = basic ? ('basic' as const) : ('ai' as const);
  const A = (ms: number) => t0 + ms * k;
  const intent = buildIntent(job);
  const tl: Timed[] = [
    { at: A(0), event: { type: 'status', data: { status: 'queued', mode } }, status: 'queued' },
    { at: A(400), event: { type: 'status', data: { status: 'understanding', mode } }, status: 'understanding' },
  ];
  if (failing) {
    tl.push({
      at: A(1800),
      event: { type: 'error', data: { code: 'extract_failed', message: 'We could not read that file. Try a clearer screenshot or paste the text.' } },
      status: 'failed',
    });
    return tl;
  }
  const det = (ms: number, kind: 'destination' | 'place' | 'dates' | 'travellers' | 'booking' | 'budget' | 'interest', label: string, resolved = true) =>
    tl.push({ at: A(ms), event: { type: 'detected', data: { kind, label, resolved } } });
  intent.destinations.forEach((d, i) => det(1000 + i * 700, 'destination', d.name, d.resolved));
  det(1000 + intent.destinations.length * 700, 'dates', `${intent.dates.lengthDays} days${intent.dates.flexibleMonth ? ', around June' : ''}`);
  if (!basic) {
    det(3300, 'interest', intent.interests[0]);
    det(3600, 'place', intent.mustInclude[0].name);
    intent.bookings.forEach((b) => det(4000, 'booking', b.title));
  }
  tl.push({ at: A(4700), event: { type: 'intent', data: { intent } } });
  tl.push({ at: A(4750), event: { type: 'status', data: { status: 'needs_review', mode } }, status: 'needs_review' });

  if (job.confirmedAt && job.confirmedIntent) {
    const C = (ms: number) => job.confirmedAt! + ms * k;
    tl.push({ at: C(0), event: { type: 'status', data: { status: 'building', mode } }, status: 'building' });
    const days = tripLength(job.confirmedIntent);
    for (let n = 1; n <= days; n++) {
      tl.push({ at: C(900 + (n - 1) * 1300), event: dayEvent(job.confirmedIntent, n) });
    }
    const end = 900 + days * 1300 + 400;
    tl.push({
      at: C(end),
      event: { type: 'done', data: { tripId: 'rishi-lnd-4d', shortId: 'rishi-lnd-4d' } },
      status: 'done',
    });
  }
  return tl;
}

export function visibleEvents(job: MockJob, now = Date.now()): Timed[] {
  return buildTimeline(job).filter((t) => t.at <= now);
}

export function jobState(job: MockJob, now = Date.now()): JobState {
  const seen = visibleEvents(job, now);
  const lastStatus = [...seen].reverse().find((t) => t.status)?.status ?? 'queued';
  const modeEvent = seen.find((t) => t.event.type === 'status');
  const mode = modeEvent && modeEvent.event.type === 'status' ? modeEvent.event.data.mode : 'ai';
  const intent = seen.find((t) => t.event.type === 'intent');
  const done = seen.find((t) => t.event.type === 'done');
  const err = seen.find((t) => t.event.type === 'error');
  return {
    id: job.id,
    status: lastStatus,
    mode,
    intent: intent && intent.event.type === 'intent' ? intent.event.data.intent : undefined,
    tripId: done && done.event.type === 'done' ? done.event.data.tripId : undefined,
    shortId: done && done.event.type === 'done' ? done.event.data.shortId : undefined,
    error: err && err.event.type === 'error' ? err.event.data : undefined,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(seen.length ? seen[seen.length - 1].at : job.createdAt).toISOString(),
  };
}
