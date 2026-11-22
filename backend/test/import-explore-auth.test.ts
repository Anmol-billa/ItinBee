import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp, type BuiltAppBundle } from '../src/app.js';
import { FakeProvider } from '../src/modules/import/llm/fake.js';
import { GeminiProvider } from '../src/modules/import/llm/gemini.js';
import { extractBasicModelIntent } from '../src/modules/import/stage-a-intent.js';
import { normalizeInputs, sniffFileMagic } from '../src/modules/import/normalize.js';
import { SafeFetcher, SsrfBlockedError } from '../src/modules/import/safe-fetch.js';
import { classifyAndExtractDocument } from '../src/modules/ingest/classifier.js';
import { haversineMeters } from '../src/modules/places/util/geo.js';
import { normalizeName } from '../src/modules/places/util/text.js';

/** Builds a valid 1-page PDF 1.4 buffer whose content stream is compressed with FlateDecode (zlib). */
function buildCompressedTicketPdf(lines: string[]): Buffer {
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const ops = [
    'BT',
    '/F1 11 Tf',
    '48 740 Td',
    ...lines.flatMap((line, idx) =>
      idx === 0 ? [`(${esc(line)}) Tj`] : ['0 -16 Td', `(${esc(line)}) Tj`]
    ),
    'ET',
  ].join('\n');
  const compressed = zlib.deflateSync(Buffer.from(ops, 'utf8'));

  const chunks: Buffer[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const pushStr = (s: string) => {
    const b = Buffer.from(s, 'latin1');
    chunks.push(b);
    pos += b.length;
  };
  const pushBuf = (b: Buffer) => {
    chunks.push(b);
    pos += b.length;
  };

  pushStr('%PDF-1.4\n');
  offsets.push(pos);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offsets.push(pos);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  offsets.push(pos);
  pushStr(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n'
  );
  offsets.push(pos);
  pushStr(`4 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`);
  pushBuf(compressed);
  pushStr('\nendstream\nendobj\n');
  offsets.push(pos);
  pushStr('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  const xrefOffset = pos;
  pushStr(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i += 1) {
    pushStr(`${String(offsets[i]!).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(chunks);
}

describe('Explore, Smart Import, Guest Auth & Account Merge', () => {
  let bundle: BuiltAppBundle;

  beforeAll(async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    await bundle.app.ready();
  });

  afterAll(async () => {
    await bundle.app.close();
  });

  it('serves 45+ curated templates on /v1/explore with hierarchical location & duration filters', async () => {
    const allRes = await bundle.app.inject({
      method: 'GET',
      url: '/v1/explore?limit=60',
    });
    expect(allRes.statusCode).toBe(200);
    const allBody = allRes.json() as {
      items: Array<{ slug: string; durationDays: number; origin: string; destinations: Array<{ slug: string }> }>;
      total: number;
    };
    expect(allBody.total).toBeGreaterThanOrEqual(45);
    expect(allBody.items.every((i) => i.origin === 'template')).toBe(true);

    // Hierarchical filter: dest=rajasthan matches Jaipur, Udaipur, Jodhpur, Jaisalmer, etc.
    const rajRes = await bundle.app.inject({
      method: 'GET',
      url: '/v1/explore?dest=rajasthan&days=3-5',
    });
    expect(rajRes.statusCode).toBe(200);
    const rajBody = rajRes.json() as {
      items: Array<{ slug: string; durationDays: number; destinations: Array<{ slug: string }> }>;
      total: number;
    };
    expect(rajBody.total).toBeGreaterThanOrEqual(3);
    for (const card of rajBody.items) {
      expect(card.durationDays).toBeGreaterThanOrEqual(3);
      expect(card.durationDays).toBeLessThanOrEqual(5);
    }

    // Detail endpoint returns day-by-day stops
    const firstSlug = rajBody.items[0]!.slug;
    const detailRes = await bundle.app.inject({
      method: 'GET',
      url: `/v1/explore/${firstSlug}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json() as { days: Array<{ dayNumber: number; items: unknown[] }> };
    expect(detail.days.length).toBeGreaterThanOrEqual(3);
    expect(detail.days[0]!.items.length).toBeGreaterThan(0);
  });

  it('clones an Explore template as a guest, merges into a Magic Link account, and publishes to Explore', async () => {
    const guestRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/guest',
      payload: {},
    });
    expect(guestRes.statusCode).toBe(200);
    const guest = guestRes.json() as { token: string; guest: boolean; user: { id: string } };
    expect(guest.guest).toBe(true);

    const listRes = await bundle.app.inject({ method: 'GET', url: '/v1/explore?limit=1' });
    const firstTemplateSlug = (listRes.json() as { items: Array<{ slug: string }> }).items[0]!.slug;

    const cloneRes = await bundle.app.inject({
      method: 'POST',
      url: `/v1/explore/${firstTemplateSlug}/clone`,
      headers: { authorization: `Bearer ${guest.token}` },
    });
    expect(cloneRes.statusCode).toBe(201);
    const cloned = cloneRes.json() as { tripId: string; shortId: string };
    expect(cloned.tripId).toBeTruthy();

    // Unauthenticated publish must fail with 401
    const unauthPubRes = await bundle.app.inject({
      method: 'POST',
      url: `/v1/trips/${cloned.tripId}/publish`,
      payload: { tripTypes: ['friends'] },
    });
    expect(unauthPubRes.statusCode).toBe(401);

    // Non-member publish must fail with 403
    const otherGuestRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/guest',
      payload: {},
    });
    const otherGuest = otherGuestRes.json() as { token: string };
    const forbiddenPubRes = await bundle.app.inject({
      method: 'POST',
      url: `/v1/trips/${cloned.tripId}/publish`,
      headers: { authorization: `Bearer ${otherGuest.token}` },
      payload: { tripTypes: ['friends'] },
    });
    expect(forbiddenPubRes.statusCode).toBe(403);

    const guestTripsRes = await bundle.app.inject({
      method: 'GET',
      url: '/v1/me/trips',
      headers: { authorization: `Bearer ${guest.token}` },
    });
    expect(guestTripsRes.statusCode).toBe(200);
    expect(
      (guestTripsRes.json() as { trips: Array<{ id: string }> }).trips.some(
        (t) => t.id === cloned.tripId
      )
    ).toBe(true);

    const magicReq = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/magic/request',
      payload: { email: 'planner@itinbee.test' },
    });
    expect(magicReq.statusCode).toBe(200);
    const { devMagicCode } = magicReq.json() as { devMagicCode: string };
    expect(devMagicCode).toMatch(/^\d{6}$/);

    const magicVerify = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/magic/verify',
      headers: { authorization: `Bearer ${guest.token}` },
      payload: { email: 'planner@itinbee.test', code: devMagicCode, displayName: 'Aarav' },
    });
    expect(magicVerify.statusCode).toBe(200);
    const signedIn = magicVerify.json() as {
      token: string;
      mergedTripsCount: number;
      user: { id: string; displayName: string };
    };
    expect(signedIn.mergedTripsCount).toBe(1);

    const pubRes = await bundle.app.inject({
      method: 'POST',
      url: `/v1/trips/${cloned.tripId}/publish`,
      headers: { authorization: `Bearer ${signedIn.token}` },
      payload: {
        tripTypes: ['friends', 'heritage'],
        budgetTier: 'mid',
        bestMonths: [11, 12],
      },
    });
    expect(pubRes.statusCode).toBe(200);
    const pubCard = pubRes.json() as { slug: string; origin: string };
    expect(pubCard.origin).toBe('user');
  });

  it('runs Smart Import job through Stage A review -> confirm -> Stage B trip creation and Ask Itinbee assist ({ instruction, dayId } and { prompt, dayNumber })', async () => {
    const guestRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/guest',
      payload: {},
    });
    const { token } = guestRes.json() as { token: string };

    const createRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/import/jobs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        text: '4 days in Jaipur with parents (65+), pure veg food, relaxed pace, budget ₹40,000. Must visit Hawa Mahal and Amber Fort.',
      },
    });
    expect(createRes.statusCode).toBe(202);
    const { jobId } = createRes.json() as { jobId: string };

    // Ownership enforcement: unauthenticated GET -> 401, wrong user -> 403
    const unauthJobRes = await bundle.app.inject({
      method: 'GET',
      url: `/v1/import/jobs/${jobId}`,
    });
    expect(unauthJobRes.statusCode).toBe(401);

    const strangerRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/guest',
      payload: {},
    });
    const strangerToken = (strangerRes.json() as { token: string }).token;
    const forbiddenJobRes = await bundle.app.inject({
      method: 'GET',
      url: `/v1/import/jobs/${jobId}`,
      headers: { authorization: `Bearer ${strangerToken}` },
    });
    expect(forbiddenJobRes.statusCode).toBe(403);

    // Poll until Stage A reaches needs_review
    let state: {
      status: string;
      intent?: {
        title: string;
        diet: string[];
        destinations: Array<{ name: string; resolved: boolean; lat?: number; lng?: number }>;
        mustInclude: Array<{ name: string; sourceQuote: string }>;
      };
      tripId?: string;
    } = { status: 'queued' };

    for (let i = 0; i < 40; i++) {
      const r = await bundle.app.inject({
        method: 'GET',
        url: `/v1/import/jobs/${jobId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      state = r.json();
      if (state.status === 'needs_review' || state.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(state.status).toBe('needs_review');
    expect(state.intent?.destinations[0]?.resolved).toBe(true);
    expect(typeof state.intent?.destinations[0]?.lat).toBe('number');
    // Canonical diet mapping checks ReviewStep checkbox automatically
    expect(state.intent?.diet).toContain('Vegetarian');
    // Quote slicing never cuts mid-word ("ust visit...")
    for (const m of state.intent?.mustInclude ?? []) {
      expect(m.sourceQuote.toLowerCase()).not.toMatch(/^ust\s+visit/);
    }

    // Confirm intent: unauthenticated -> 401, wrong user -> 403
    expect(
      (
        await bundle.app.inject({
          method: 'POST',
          url: `/v1/import/jobs/${jobId}/confirm`,
          payload: { intent: state.intent },
        })
      ).statusCode
    ).toBe(401);
    expect(
      (
        await bundle.app.inject({
          method: 'POST',
          url: `/v1/import/jobs/${jobId}/confirm`,
          headers: { authorization: `Bearer ${strangerToken}` },
          payload: { intent: state.intent },
        })
      ).statusCode
    ).toBe(403);

    const confirmRes = await bundle.app.inject({
      method: 'POST',
      url: `/v1/import/jobs/${jobId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { intent: state.intent },
    });
    expect(confirmRes.statusCode).toBe(202);

    for (let i = 0; i < 40; i++) {
      const r = await bundle.app.inject({
        method: 'GET',
        url: `/v1/import/jobs/${jobId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      state = r.json();
      if (state.status === 'done' || state.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(state.status).toBe('done');
    expect(state.tripId).toBeTruthy();

    // SSE CORS reflection check: evil origin is never reflected; localhost:3000 is allowed
    const sseEvil = await bundle.app.inject({
      method: 'GET',
      url: `/v1/import/jobs/${jobId}/events`,
      headers: {
        authorization: `Bearer ${token}`,
        origin: 'https://evil-attacker.example',
      },
    });
    expect(sseEvil.statusCode).toBe(200);
    expect(sseEvil.headers['access-control-allow-origin']).toBeUndefined();

    const sseAllowed = await bundle.app.inject({
      method: 'GET',
      url: `/v1/import/jobs/${jobId}/events`,
      headers: {
        authorization: `Bearer ${token}`,
        origin: 'http://localhost:3000',
      },
    });
    expect(sseAllowed.statusCode).toBe(200);
    expect(sseAllowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    // Verify created trip workspace has 4 days and grounded items
    const wsRes = await bundle.app.inject({
      method: 'GET',
      url: `/v1/trips/${state.tripId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(wsRes.statusCode).toBe(200);
    const ws = wsRes.json() as {
      days: Array<{ id: string; dayNumber: number }>;
      items: Array<{ lat: number | null; lng: number | null }>;
    };
    expect(ws.days.length).toBe(4);
    expect(ws.items.length).toBeGreaterThanOrEqual(4);
    expect(ws.items.every((it) => typeof it.lat === 'number' && typeof it.lng === 'number')).toBe(
      true
    );

    // Ask Itinbee auth enforcement: 401 unauthenticated, 403 non-member
    expect(
      (
        await bundle.app.inject({
          method: 'POST',
          url: `/v1/trips/${state.tripId}/assist`,
          payload: { instruction: 'Make Day 1 more relaxed' },
        })
      ).statusCode
    ).toBe(401);
    expect(
      (
        await bundle.app.inject({
          method: 'POST',
          url: `/v1/trips/${state.tripId}/assist`,
          headers: { authorization: `Bearer ${strangerToken}` },
          payload: { instruction: 'Make Day 1 more relaxed' },
        })
      ).statusCode
    ).toBe(403);

    // Variant 1: { instruction, dayId }
    const day1 = ws.days.find((d) => d.dayNumber === 1)!;
    const assistRes1 = await bundle.app.inject({
      method: 'POST',
      url: `/v1/trips/${state.tripId}/assist`,
      headers: { authorization: `Bearer ${token}` },
      payload: { instruction: 'Make this day more relaxed', dayId: day1.id },
    });
    expect(assistRes1.statusCode).toBe(200);
    const assistBody1 = assistRes1.json() as {
      proposal: { summary: string; operations: Array<{ dayNumber?: number }> };
    };
    expect(assistBody1.proposal.summary.length).toBeGreaterThan(0);

    // Variant 2: { prompt, dayNumber } backward-compatible alias
    const assistRes2 = await bundle.app.inject({
      method: 'POST',
      url: `/v1/trips/${state.tripId}/assist`,
      headers: { authorization: `Bearer ${token}` },
      payload: { prompt: 'Add a vegetarian dinner', dayNumber: 2 },
    });
    expect(assistRes2.statusCode).toBe(200);
    const assistBody2 = assistRes2.json() as {
      proposal: { summary: string; operations: Array<{ op: string; dayNumber?: number }> };
    };
    expect(assistBody2.proposal.operations[0]?.dayNumber).toBe(2);
  });

  it('extracts FlateDecode-compressed digital ticket PDFs via unpdf in Basic mode, handles .eml/.txt, and rejects MP4 ftyp spoofing', async () => {
    const pdfBuf = buildCompressedTicketPdf([
      'IRCTC Electronic Reservation Slip',
      'PNR No: 2948173650',
      'Train No./Name: 12951 / MUMBAI RAJDHANI',
      'From: NEW DELHI (NDLS)   To: JAIPUR (JP)',
      'Scheduled Departure: 14-Dec-2026 17:00',
      'Scheduled Arrival: 14-Dec-2026 21:50',
      '1. ANANYA SHARMA   29   F   CNF/B2/14/LOWER',
      'Passenger Aadhaar: 5432 8765 9912',
    ]);
    // Verify the raw PDF buffer is genuinely compressed (no plaintext PNR in raw UTF-8)
    expect(pdfBuf.toString('utf8')).not.toContain('2948173650');

    const docClass = await classifyAndExtractDocument(pdfBuf, 'application/pdf');
    expect(docClass.documentClass).toBe('DIGITAL_TEXT');
    expect(docClass.isScannedOrImage).toBe(false);
    expect(docClass.detectedKind).toBe('irctc');
    expect(docClass.aadhaarRedactions).toBeGreaterThanOrEqual(1);
    expect(docClass.cleanedText).toContain('XXXX-XXXX-9912');
    expect(docClass.cleanedText).not.toContain('5432 8765');

    // Sniffing checks: ftypheic -> heic, ftypmp42 / ftypisom -> unsupported_ftyp
    const mp4Header = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0]);
    const heicHeader = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);
    expect(sniffFileMagic(mp4Header)).toBe('unsupported_ftyp');
    expect(sniffFileMagic(heicHeader)).toBe('heic');

    // .eml forwarded confirmation + compressed PDF in normalizeInputs (Basic mode, multimodal=false)
    const rawEml = [
      'From: noreply@makemytrip.com',
      'Subject: =?UTF-8?Q?MakeMyTrip_Hotel_Voucher_Jaipur?=',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<html><body><div>MakeMyTrip Hotel Confirmation Voucher</div>',
      '<p>Booking ID: NH9911223344</p>',
      '<p>Property Name: Samode Haveli Jaipur</p>',
      '<p>Check-in Date: 14-Dec-2026 (14:00) | Check-out Date: 17-Dec-2026 (11:00) | 3 Nights</p>',
      '</body></html>',
    ].join('\r\n');

    const norm = await normalizeInputs(
      {
        files: [
          {
            name: 'irctc-rajdhani.pdf',
            mimeType: 'application/pdf',
            dataBase64: pdfBuf.toString('base64'),
          },
          {
            name: 'hotel-voucher.eml',
            mimeType: 'message/rfc822',
            dataBase64: Buffer.from(rawEml, 'utf8').toString('base64'),
          },
          {
            name: 'clip.mp4',
            mimeType: 'video/mp4',
            dataBase64: mp4Header.toString('base64'),
          },
        ],
      },
      { fetcher: new SafeFetcher(), multimodal: false }
    );

    expect(norm.bookingCandidates.map((b) => b.pnr)).toContain('2948173650');
    expect(norm.bookingCandidates.map((b) => b.pnr)).toContain('NH9911223344');
    expect(norm.notes.some((n) => n.includes('clip.mp4'))).toBe(true);
    expect(norm.corpus).not.toContain('5432 8765');
  });

  it('deduplicates mustInclude, captures City Palace Udaipur, isolates per-city stops (<= 45km), and prevents consecutive-day duplicate stops', async () => {
    const guestRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/guest',
      payload: {},
    });
    const { token } = guestRes.json() as { token: string };

    const createRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/import/jobs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        text: [
          '6 days trip to Jaipur and Udaipur from 2026-11-10 to 2026-11-15 with family.',
          'Must visit Hawa Mahal, Amber Fort, Hawa Mahal again, the Hawa Mahal, and City Palace Udaipur!',
          'Diet: pure-veg, jain, and gluten free.',
        ].join('\n'),
      },
    });
    expect(createRes.statusCode).toBe(202);
    const { jobId } = createRes.json() as { jobId: string };

    let state: {
      status: string;
      intent?: {
        diet: string[];
        destinations: Array<{ name: string; destinationSlug?: string; lat?: number; lng?: number }>;
        mustInclude: Array<{ name: string; resolved: boolean; sourceQuote: string }>;
      };
      tripId?: string;
    } = { status: 'queued' };

    for (let i = 0; i < 40; i++) {
      const r = await bundle.app.inject({
        method: 'GET',
        url: `/v1/import/jobs/${jobId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      state = r.json();
      if (state.status === 'needs_review' || state.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    expect(state.status).toBe('needs_review');
    const mustNames = state.intent!.mustInclude.map((m) => m.name);
    // Hawa Mahal mentioned 3x must produce exactly 1 chip
    expect(mustNames.filter((n) => n.toLowerCase().includes('hawa mahal'))).toHaveLength(1);
    // City Palace Udaipur captured & grounded cleanly
    expect(
      state.intent!.mustInclude.some(
        (m) => m.name.toLowerCase().includes('city palace') && m.name.toLowerCase().includes('udaipur') && m.resolved
      )
    ).toBe(true);
    expect(state.intent!.diet).toEqual(expect.arrayContaining(['Vegetarian', 'Jain', 'Gluten-free']));

    await bundle.app.inject({
      method: 'POST',
      url: `/v1/import/jobs/${jobId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: { intent: state.intent },
    });

    for (let i = 0; i < 40; i++) {
      const r = await bundle.app.inject({
        method: 'GET',
        url: `/v1/import/jobs/${jobId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      state = r.json();
      if (state.status === 'done' || state.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(state.status).toBe('done');

    const wsRes = await bundle.app.inject({
      method: 'GET',
      url: `/v1/trips/${state.tripId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const ws = wsRes.json() as {
      days: Array<{ id: string; dayNumber: number; themeTitle: string }>;
      items: Array<{
        dayId: string;
        title: string;
        placeRefId: string | null;
        lat: number | null;
        lng: number | null;
      }>;
    };

    expect(ws.days).toHaveLength(6);
    const jaipurCenter = { lat: 26.9124, lng: 75.7873 };
    const udaipurCenter = { lat: 24.5854, lng: 73.7125 };

    const seenPlaceRefs = new Set<string>();
    const seenNormTitles = new Set<string>();

    for (const day of ws.days) {
      const dayItems = ws.items.filter((it) => it.dayId === day.id);
      expect(dayItems.length).toBeGreaterThan(0);
      const isJaipurDay = day.themeTitle.toLowerCase().startsWith('jaipur');
      const expectedCenter = isJaipurDay ? jaipurCenter : udaipurCenter;

      for (const it of dayItems) {
        expect(it.lat).not.toBeNull();
        expect(it.lng).not.toBeNull();
        const distKm =
          haversineMeters(expectedCenter, { lat: it.lat!, lng: it.lng! }) / 1000;
        expect(distKm).toBeLessThanOrEqual(45);

        if (it.placeRefId) {
          expect(seenPlaceRefs.has(it.placeRefId)).toBe(false);
          seenPlaceRefs.add(it.placeRefId);
        }
        const nt = normalizeName(it.title);
        expect(seenNormTitles.has(nt)).toBe(false);
        seenNormTitles.add(nt);
      }
    }
  });

  it('converts Gemini Vision extractedBookings from ticket screenshots into TripIntent.bookings and Trip Vault records while redacting Aadhaar, and masks Elder Summary PII on Explore publish', async () => {
    const fakeVisionLlm = new FakeProvider({
      intent: () => ({
        title: 'Jaipur Weekend',
        destinations: [{ name: 'Jaipur', country: 'India', nights: 2, order: 1, confidence: 0.96 }],
        dates: { start: '2026-12-18', end: '2026-12-20', lengthDays: 3, flexibleMonth: null },
        travellers: { count: 2, group: 'seniors', hasChildren: false, hasSeniors: true },
        budget: { amount: 30000, currency: 'INR', tier: 'mid' },
        interests: ['Heritage'],
        pace: 'relaxed',
        diet: ['pure veg'],
        mustInclude: [],
        avoid: [],
        extractedBookings: [
          {
            itemKind: 'transit',
            title: 'IndiGo 6E-2114 BLR to JAI',
            provider: 'indigo',
            pnr: 'V7M9Q2',
            vehicleNumber: '6E-2114',
            originName: 'Bengaluru (BLR)',
            destinationName: 'Jaipur (JAI)',
            startIso: '2026-12-18T08:15:00+05:30',
            endIso: '2026-12-18T10:45:00+05:30',
            coach: 'T2',
            seatOrBerth: '4A',
            passengerNames: ['Suresh Sharma Aadhaar 4589 2310 7741'],
          },
        ],
        assumptions: [],
        clarifyingQuestions: [],
      }),
    });

    const visionBundle = await buildApp({
      forceLocalStore: true,
      logger: false,
      llm: fakeVisionLlm,
    });
    await visionBundle.app.ready();

    try {
      const guestRes = await visionBundle.app.inject({
        method: 'POST',
        url: '/v1/auth/guest',
        payload: {},
      });
      const { token } = guestRes.json() as { token: string };

      // Minimal 1x1 PNG magic bytes
      const pngBytes = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]);

      const createRes = await visionBundle.app.inject({
        method: 'POST',
        url: '/v1/import/jobs',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          files: [
            {
              name: 'boarding-pass.png',
              mimeType: 'image/png',
              dataBase64: pngBytes.toString('base64'),
            },
          ],
        },
      });
      expect(createRes.statusCode).toBe(202);
      const { jobId } = createRes.json() as { jobId: string };

      await visionBundle.importJobs.waitForIdle();
      const jobGet = await visionBundle.app.inject({
        method: 'GET',
        url: `/v1/import/jobs/${jobId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      const jobState = jobGet.json() as {
        status: string;
        intent: { bookings: Array<{ provider: string; title: string }> };
      };
      expect(jobState.status).toBe('needs_review');
      expect(jobState.intent.bookings).toHaveLength(1);
      expect(jobState.intent.bookings[0]?.provider).toBe('indigo');

      await visionBundle.app.inject({
        method: 'POST',
        url: `/v1/import/jobs/${jobId}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: { intent: jobState.intent },
      });
      await visionBundle.importJobs.waitForIdle();

      const doneState = (
        await visionBundle.app.inject({
          method: 'GET',
          url: `/v1/import/jobs/${jobId}`,
          headers: { authorization: `Bearer ${token}` },
        })
      ).json() as { status: string; tripId: string };
      expect(doneState.status).toBe('done');

      const wsRes = await visionBundle.app.inject({
        method: 'GET',
        url: `/v1/trips/${doneState.tripId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      const ws = wsRes.json() as {
        days: Array<{ id: string }>;
        bookings: Array<{ pnrPlain: string; passengers: Array<{ name: string }> }>;
      };
      expect(ws.bookings).toHaveLength(1);
      expect(ws.bookings[0]?.pnrPlain).toBe('V7M9Q2');
      expect(ws.bookings[0]?.passengers[0]?.name).toContain('XXXX-XXXX-7741');
      expect(ws.bookings[0]?.passengers[0]?.name).not.toContain('4589 2310');

      // Also inject Hindi & English elderSummaryI18n with PNR/Coach/Berth PII via sync and publish to Explore
      const syncItemId = crypto.randomUUID();
      await visionBundle.app.inject({
        method: 'POST',
        url: `/v1/trips/${doneState.tripId}/sync`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          mutations: [
            {
              clientOpId: 'op-elder-pii-1',
              hlcTimestamp: '2026-12-01T00:00:00.000Z-0001-client',
              baseSeq: 0,
              entityType: 'itinerary_item',
              entityId: syncItemId,
              action: 'upsert',
              payload: {
                dayId: ws.days[0]!.id,
                kind: 'transit',
                title: 'Shatabdi Express to Jaipur',
                notes: 'PNR: 2451987842, Coach C4, Seats 21–22. Reach station early.',
                elderSummaryI18n: {
                  en: '06:45 AM Train (Chair Car C4, Seat 21) PNR 2451987842. Breakfast onboard.',
                  hi: 'सुबह ०६:४५ बजे शताब्दी ट्रेन (कोच C4, सीट 21) पीएनआर 2451987842। नाश्ता मिलेगा।',
                },
              },
            },
          ],
        },
      });

      const pubRes = await visionBundle.app.inject({
        method: 'POST',
        url: `/v1/trips/${doneState.tripId}/publish`,
        headers: { authorization: `Bearer ${token}` },
        payload: { slug: 'jaipur-elder-pii-check', tripTypes: ['seniors'] },
      });
      expect(pubRes.statusCode).toBe(200);

      const expDetailRes = await visionBundle.app.inject({
        method: 'GET',
        url: '/v1/explore/jaipur-elder-pii-check',
      });
      expect(expDetailRes.statusCode).toBe(200);
      const rawExploreJson = expDetailRes.body;
      expect(rawExploreJson).not.toContain('2451987842');
      expect(rawExploreJson).not.toContain('Coach C4');
      expect(rawExploreJson).not.toContain('Chair Car C4');
      expect(rawExploreJson).not.toContain('कोच C4');
      expect(rawExploreJson).not.toContain('Seats 21');
      expect(rawExploreJson).not.toContain('सीट 21');
    } finally {
      await visionBundle.app.close();
    }
  });

  it('blocks SSRF attempts against loopback and link-local metadata addresses', async () => {
    const fetcher = new SafeFetcher();
    await expect(fetcher.fetch('http://127.0.0.1:4000/health')).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
    await expect(
      fetcher.fetch('http://169.254.169.254/latest/meta-data/')
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('automatically falls back from deprecated gemini-2.5-flash 404 to gemini-3.5-flash-lite and omits deprecated temperature', async () => {
    const calledUrls: string[] = [];
    const calledConfigs: Array<Record<string, unknown>> = [];

    const provider = new GeminiProvider({
      apiKey: ' "GEMINI_API_KEY=test-new-ai-studio-key" ',
      model: 'gemini-2.5-flash',
      sleep: async () => {},
      fetchImpl: async (input, init) => {
        const url = String(input);
        calledUrls.push(url);
        const parsedBody = JSON.parse(String(init?.body ?? '{}')) as {
          generationConfig?: Record<string, unknown>;
        };
        calledConfigs.push(parsedBody.generationConfig ?? {});

        if (url.includes('gemini-2.5-flash')) {
          return new Response(
            JSON.stringify({ error: { code: 404, message: 'Model no longer available to new users' } }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: 'STOP',
                content: {
                  parts: [
                    { text: 'internal reasoning trace', thought: true },
                    { text: JSON.stringify({ destination: 'Leh', days: 5 }) },
                  ],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    const schema = z.object({ destination: z.string(), days: z.number().int() });
    const first = await provider.generateStructured({
      system: 'Extract destination.',
      userParts: [{ text: 'Leh 5 days' }],
      schema,
      temperature: 0.15,
    });
    expect(first.data).toEqual({ destination: 'Leh', days: 5 });
    expect(calledUrls).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    ]);
    // Gemini 3.5 Flash-Lite must NOT receive deprecated `temperature`
    expect(calledConfigs[1]?.temperature).toBeUndefined();

    // Second call skips the deprecated 404 model directly via pinned activeModel
    await provider.generateStructured({
      system: 'Extract destination.',
      userParts: [{ text: 'Leh 5 days' }],
      schema,
    });
    expect(calledUrls[2]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent'
    );
  });

  it('treats round-trip "Delhi to Leh ... ending back at Delhi" (even with Based on template prefix) as Leh destination', async () => {
    const normalized = await normalizeInputs({
      text: 'Based on "South Goa Monsoon Crew", but Delhi to Leh by Train 5D, 4N trip ending back at Delhi Railway station - I want budget hotels and want relaxing activities',
    });
    const intent = await extractBasicModelIntent(normalized, bundle.places);
    expect(intent.destinations.map((d) => d.name)).toEqual(['Leh']);
    expect(intent.dates.lengthDays).toBe(5);
    expect(intent.budget.tier).toBe('budget');
    expect(intent.pace).toBe('relaxed');
  });
});
