import { describe, expect, it } from 'vitest';
import {
  checkNewFiles,
  classifyUrl,
  extractUrls,
  formatBytes,
  isSupportedFile,
  isUrlsOnly,
  urlLabel,
  validateDraft,
  type FileLike,
} from '@/features/create/compose-utils';
import {
  detectLine,
  errorFromEvent,
  flowReducer,
  initialFlowState,
  stepForJob,
} from '@/features/create/flow-reducer';
import {
  daysBetween,
  finalizeIntent,
  initIntentForm,
  intentReducer,
  validateIntent,
} from '@/features/create/intent-reducer';
import type { GeoSuggestion, JobState, TripIntent } from '@/lib/import-types';
import { backoffDelay, createSseParser, runSse, type SseMessage } from '@/lib/sse-stream';

function sampleIntent(): TripIntent {
  return {
    title: '  Manali & Tosh  ',
    destinations: [
      { name: 'Tosh', order: 2, confidence: 0.55, resolved: false },
      {
        name: 'Manali',
        country: 'India',
        order: 0,
        confidence: 0.96,
        destinationSlug: 'manali',
        lat: 32.2432,
        lng: 77.1892,
        resolved: true,
      },
    ],
    dates: { start: null, end: null, lengthDays: 5, flexibleMonth: 6 },
    travellers: { count: 4, group: 'friends', hasChildren: false, hasSeniors: false },
    budget: { amount: null, currency: 'INR', tier: 'mid' },
    interests: ['Mountains', 'Cafes'],
    pace: 'moderate',
    diet: ['Vegetarian'],
    mustInclude: [{ name: 'Hadimba Temple', sourceQuote: 'Hadimba', resolved: true }],
    avoid: ['Night buses'],
    bookings: [],
    assumptions: ['Travelling from Delhi', 'Mid-range stays'],
    clarifyingQuestions: [
      { id: 'when', question: 'Exact week in June?', options: ['Early June', 'Late June'] },
    ],
  };
}

function streamResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  let idx = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(enc.encode(chunks[idx++]!));
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('sse-stream.ts', () => {
  it('parses chunked SSE messages, multi-line data, CRLF and ignores comments', () => {
    const received: SseMessage[] = [];
    const parser = createSseParser((m) => received.push(m));

    parser.push(': connected\n\nevent: status\r\ndata: {"status":');
    parser.push('"understanding","mode":"ai"}\r\n\r\n');
    parser.push('id: 42\nevent: note\ndata: line-1\ndata: line-2\n\n');
    parser.push('event: trailing\ndata: flush-me');
    parser.flush();

    expect(received).toEqual([
      { event: 'status', data: '{"status":"understanding","mode":"ai"}', id: undefined },
      { event: 'note', data: 'line-1\nline-2', id: '42' },
      { event: 'trailing', data: 'flush-me', id: undefined },
    ]);
  });

  it('computes exponential backoff with cap and jitter', () => {
    expect(backoffDelay(1, 500, 8000, 0.5)).toBe(500);
    expect(backoffDelay(3, 500, 8000, 0.5)).toBe(2000);
    expect(backoffDelay(10, 500, 4000, 0.5)).toBe(4000);
    expect(backoffDelay(1, 500, 8000, 0)).toBe(375);
    expect(backoffDelay(1, 500, 8000, 1)).toBe(625);
  });

  it('reconnects after a dropped stream and skips replayed messages before delivering new ones', async () => {
    let attempt = 0;
    const delivered: SseMessage[] = [];
    const states: string[] = [];

    const result = await runSse({
      open: async () => {
        attempt += 1;
        if (attempt === 1) {
          // Drops before terminal event
          return streamResponse([
            'event: status\ndata: {"status":"understanding","mode":"ai"}\n\n',
            'event: detected\ndata: {"kind":"destination","label":"Manali"}\n\n',
          ]);
        }
        // Server replays full history + terminal event
        return streamResponse([
          'event: status\ndata: {"status":"understanding","mode":"ai"}\n\n',
          'event: detected\ndata: {"kind":"destination","label":"Manali"}\n\n',
          'event: done\ndata: {"tripId":"t1","shortId":"s1"}\n\n',
        ]);
      },
      onMessage: (m) => delivered.push(m),
      onState: (s) => states.push(s),
      isTerminal: (m) => m.event === 'done',
      sleep: async () => {},
      random: () => 0.5,
    });

    expect(result).toBe('terminal');
    expect(attempt).toBe(2);
    expect(delivered.map((m) => m.event)).toEqual(['status', 'detected', 'done']);
    expect(states).toContain('reconnecting');
    expect(states).toContain('live');
  });

  it('stops immediately with exhausted on fatal 404 without retrying', async () => {
    let calls = 0;
    const res = await runSse({
      open: async () => {
        calls += 1;
        return new Response('not found', { status: 404 });
      },
      onMessage: () => {},
      isTerminal: () => false,
      sleep: async () => {},
    });
    expect(res).toBe('exhausted');
    expect(calls).toBe(1);
  });
});

describe('compose-utils.ts', () => {
  it('validates supported file types, count cap (<=3) and size cap (<=8MB)', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');

    expect(isSupportedFile({ name: 'ticket.pdf', size: 1200, type: 'application/pdf' })).toBe(true);
    expect(isSupportedFile({ name: 'scan.HEIC', size: 1200, type: '' })).toBe(true);
    expect(isSupportedFile({ name: 'archive.zip', size: 1200, type: 'application/zip' })).toBe(false);

    const existing: FileLike[] = [
      { name: 'a.pdf', size: 3 * 1024 * 1024, type: 'application/pdf' },
      { name: 'b.png', size: 3 * 1024 * 1024, type: 'image/png' },
    ];
    const incoming: FileLike[] = [
      { name: 'empty.pdf', size: 0, type: 'application/pdf' },
      { name: 'bad.exe', size: 500, type: 'application/octet-stream' },
      { name: 'huge.jpg', size: 3 * 1024 * 1024, type: 'image/jpeg' },
      { name: 'ok.webp', size: 500 * 1024, type: 'image/webp' },
      { name: 'fourth.png', size: 100 * 1024, type: 'image/png' },
    ];

    const out = checkNewFiles(existing, incoming);
    expect(out.accepted.map((f) => f.name)).toEqual(['ok.webp']);
    expect(out.errors).toHaveLength(4);
  });

  it('extracts, classifies and validates URLs and draft limits', () => {
    const text =
      'See https://www.instagram.com/reel/C12345/, https://youtu.be/abc999?t=10 and https://itinbee.com/blog/spiti.';
    const urls = extractUrls(text);
    expect(urls).toEqual([
      'https://www.instagram.com/reel/C12345/',
      'https://youtu.be/abc999?t=10',
      'https://itinbee.com/blog/spiti',
    ]);
    expect(classifyUrl(urls[0]!)).toBe('instagram');
    expect(classifyUrl(urls[1]!)).toBe('youtube');
    expect(classifyUrl(urls[2]!)).toBe('other');
    expect(urlLabel('https://www.itinbee.com/')).toBe('itinbee.com');

    expect(isUrlsOnly('https://youtu.be/abc999\nhttps://itinbee.com/goa')).toBe(true);
    expect(isUrlsOnly('Goa trip https://itinbee.com/goa')).toBe(false);

    expect(validateDraft({ text: '   ', urls: [], fileCount: 0 }).empty).toBeTruthy();
    expect(validateDraft({ text: '5 days in Kerala', urls: [], fileCount: 0 })).toEqual({});
    expect(
      validateDraft({
        text: 'a b c',
        urls: ['https://1.com', 'https://2.com', 'https://3.com', 'https://4.com', 'https://5.com', 'https://6.com'],
        fileCount: 0,
      }).urls
    ).toBeTruthy();
  });
});

describe('flow-reducer.ts', () => {
  it('transitions cleanly across compose -> understanding -> review -> building -> stop -> done', () => {
    let state = flowReducer(initialFlowState, { type: 'submitting' });
    expect(state.submitting).toBe(true);

    state = flowReducer(state, { type: 'submitted', jobId: 'job_1' });
    expect(state.step).toBe('understanding');
    expect(state.jobId).toBe('job_1');

    state = flowReducer(state, {
      type: 'event',
      event: { type: 'status', data: { status: 'understanding', mode: 'basic' } },
    });
    expect(state.mode).toBe('basic');

    state = flowReducer(state, {
      type: 'event',
      event: { type: 'detected', data: { kind: 'destination', label: 'Jaipur', resolved: true } },
    });
    // Duplicate detected event is ignored
    state = flowReducer(state, {
      type: 'event',
      event: { type: 'detected', data: { kind: 'destination', label: 'Jaipur', resolved: true } },
    });
    expect(state.detected).toHaveLength(1);
    expect(detectLine('destination', 'Jaipur')).toBe('Found Jaipur');

    const intent = sampleIntent();
    state = flowReducer(state, { type: 'event', event: { type: 'intent', data: { intent } } });
    expect(state.step).toBe('review');
    expect(state.intent?.title).toBe(intent.title);

    state = flowReducer(state, { type: 'confirmed' });
    expect(state.step).toBe('building');

    state = flowReducer(state, {
      type: 'event',
      event: { type: 'day', data: { dayNumber: 2, title: 'Day 2', items: [] } },
    });
    state = flowReducer(state, {
      type: 'event',
      event: { type: 'day', data: { dayNumber: 1, title: 'Day 1', items: [] } },
    });
    expect(state.days.map((d) => d.dayNumber)).toEqual([1, 2]);

    state = flowReducer(state, { type: 'stopped' });
    expect(state.step).toBe('review');
    expect(state.notice).toContain('Stopped');

    state = flowReducer(state, { type: 'confirmed' });
    state = flowReducer(state, {
      type: 'event',
      event: { type: 'done', data: { tripId: 'trip_99', shortId: 's_99' } },
    });
    expect(state.tripId).toBe('trip_99');

    expect(errorFromEvent('quota_exceeded', 'Limit hit', '2026-11-22T00:00:00Z').kind).toBe('quota');
    expect(errorFromEvent('not_found', 'Expired').kind).toBe('expired');
  });

  it('maps resumed JobState to the right step', () => {
    const base: JobState = {
      id: 'j1',
      status: 'queued',
      mode: 'ai',
      createdAt: '2026-11-21T00:00:00Z',
      updatedAt: '2026-11-21T00:00:00Z',
    };
    expect(stepForJob(base)).toBe('understanding');
    expect(stepForJob({ ...base, status: 'needs_review', intent: sampleIntent() })).toBe('review');
    expect(stepForJob({ ...base, status: 'building' })).toBe('building');
    expect(stepForJob({ ...base, status: 'failed', error: { code: 'x', message: 'boom' } })).toBe(
      'understanding'
    );
  });
});

describe('intent-reducer.ts', () => {
  it('reorders, fixes, adds and validates destinations, dates, assumptions and answers', () => {
    let form = initIntentForm(sampleIntent());
    // Sorted by initial order: Manali (0) then Tosh (2 -> renumbered to 1)
    expect(form.intent.destinations.map((d) => d.name)).toEqual(['Manali', 'Tosh']);
    expect(form.dateMode).toBe('days');

    const kasolSuggestion: GeoSuggestion = {
      id: 'dest:kasol',
      source: 'destination',
      slug: 'kasol',
      name: 'Kasol',
      secondary: 'Himachal Pradesh, India',
      kind: 'city',
      lat: 32.0099,
      lng: 77.3149,
      countryCode: 'IN',
      packStatus: 'ready',
    };

    // Fix unresolved Tosh -> Kasol
    form = intentReducer(form, { type: 'destFix', index: 1, suggestion: kasolSuggestion });
    expect(form.intent.destinations[1]?.resolved).toBe(true);
    expect(form.intent.destinations[1]?.name).toBe('Kasol');

    // Duplicate add ignored
    form = intentReducer(form, { type: 'destAdd', suggestion: { name: 'manali' } });
    expect(form.intent.destinations).toHaveLength(2);

    // Move Kasol up to index 0
    form = intentReducer(form, { type: 'destMove', index: 1, dir: -1 });
    expect(form.intent.destinations.map((d) => `${d.order}:${d.name}`)).toEqual(['0:Kasol', '1:Manali']);

    // Switch to exact dates and verify daysBetween calculation
    expect(daysBetween('2026-12-10', '2026-12-14')).toBe(5);
    form = intentReducer(form, { type: 'dateMode', mode: 'dates' });
    form = intentReducer(form, { type: 'dateStart', value: '2026-12-10' });
    expect(validateIntent(form.intent)).toHaveLength(1); // missing end date
    form = intentReducer(form, { type: 'dateEnd', value: '2026-12-08' });
    expect(validateIntent(form.intent)[0]?.field).toBe('dates'); // end < start
    form = intentReducer(form, { type: 'dateEnd', value: '2026-12-14' });
    expect(validateIntent(form.intent)).toEqual([]);
    expect(form.intent.dates.lengthDays).toBe(5);

    // Edit & dismiss assumptions
    form = intentReducer(form, { type: 'assumptionEdit', index: 0, value: 'Starting from Chandigarh' });
    expect(form.intent.assumptions[0]).toBe('Starting from Chandigarh');
    form = intentReducer(form, { type: 'assumptionDismiss', index: 1 });
    expect(form.intent.assumptions).toEqual(['Starting from Chandigarh']);

    // Answer clarifying question & finalize
    form = intentReducer(form, { type: 'answer', id: 'when', value: 'Early June' });
    form = intentReducer(form, { type: 'answer', id: 'stale_question_id', value: 'Ignored' });

    const finalPayload = finalizeIntent(form);
    expect(finalPayload.intent.title).toBe('Manali & Tosh');
    expect(finalPayload.answers).toEqual({ when: 'Early June' });
  });
});
