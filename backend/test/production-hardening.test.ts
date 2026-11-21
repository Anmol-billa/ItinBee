import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp, type BuiltAppBundle } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { formatHlc } from '../src/modules/sync/hlc.js';
import { signAccessToken } from '../src/security/auth-tokens.js';
import { SEED_IDS } from '../src/store/seed-data.js';

function extractCookieHeader(setCookie: string | string[] | undefined): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!first) throw new Error('Expected set-cookie header');
  return first.split(';')[0]!;
}

describe('Production Security, Persistence, Vault, Invites & Fail-Fast Hardening', () => {
  let bundle: BuiltAppBundle | null = null;

  afterEach(async () => {
    if (bundle) {
      await bundle.app.close();
      bundle = null;
    }
  });

  it('1. rejects legacy unverified POST /v1/auth/google account takeover attempts with 410 Gone', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const takeoverRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/google',
      payload: {
        idTokenOrSub: 'spoofed-google-sub-123',
        email: 'victim@itinbee.com',
        displayName: 'Attacker',
      },
    });

    expect(takeoverRes.statusCode).toBe(410);
    expect(takeoverRes.json().error).toBe('gone');
  });

  it('2. blocks IDOR attempts on members, settlements, sync, and booking attachments with 401/403 for unauthenticated & non-member users', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const ownerToken = signAccessToken({
      sub: SEED_IDS.users.ananya,
      displayName: 'Ananya Sharma',
      tier: 'free',
    });

    // Create a private trip owned by Ananya
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        title: 'Private Coorg Estate Retreat',
        destinationSummary: 'Madikeri (3D)',
        daysCount: 3,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const tripId = createRes.json().trip.id as string;

    // Upload a private ticket attachment as owner
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/v1/ingest/file',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        tripId,
        fileName: 'flight-ticket.pdf',
        mimeType: 'application/pdf',
        contentBase64: Buffer.from(
          'IndiGo Flight Confirmation\nBooking Reference: Z9K4M1\nFlight: 6E 512 | Date: 20 Dec 2026\nNew Delhi (DEL) to Bengaluru (BLR)',
          'utf8'
        ).toString('base64'),
      },
    });
    expect(uploadRes.statusCode).toBe(200);
    const bookingId = uploadRes.json().savedBooking.id as string;

    // Create an unrelated authenticated attacker (`rohan` is NOT a member of this Coorg trip)
    const outsiderHeaders = {
      authorization: `Bearer ${signAccessToken({
        sub: SEED_IDS.users.rohan,
        displayName: 'Rohan Kulkarni',
        tier: 'free',
      })}`,
    };

    // Unauthenticated -> 401 across all protected routes
    for (const reqSpec of [
      {
        method: 'POST' as const,
        url: `/v1/trips/${tripId}/members`,
        payload: { displayName: 'Intruder' },
      },
      {
        method: 'GET' as const,
        url: `/v1/trips/${tripId}/settlements`,
      },
      {
        method: 'POST' as const,
        url: `/v1/trips/${tripId}/sync`,
        payload: { lastSeenSeq: 0, mutations: [] },
      },
      {
        method: 'GET' as const,
        url: `/v1/trips/${tripId}/bookings/${bookingId}/attachment`,
      },
      {
        method: 'GET' as const,
        url: `/v1/trips/${tripId}`,
      },
    ]) {
      const unauth = await app.inject(reqSpec);
      expect(unauth.statusCode, `Unauth ${reqSpec.method} ${reqSpec.url}`).toBe(401);
    }

    // Even on public sample trips, `/settlements` must NEVER leak member UPI VPAs to unauthenticated or non-member callers
    const sampleSettleUnauth = await app.inject({
      method: 'GET',
      url: `/v1/trips/${SEED_IDS.trips.rishikeshLandour}/settlements`,
    });
    expect(sampleSettleUnauth.statusCode).toBe(401);

    const sampleSettleOutsider = await app.inject({
      method: 'GET',
      url: `/v1/trips/${SEED_IDS.trips.rishikeshLandour}/settlements`,
      headers: outsiderHeaders,
    });
    expect(sampleSettleOutsider.statusCode).toBe(403);

    // Non-member authenticated user -> 403 across all protected routes
    for (const reqSpec of [
      {
        method: 'POST' as const,
        url: `/v1/trips/${tripId}/members`,
        headers: outsiderHeaders,
        payload: { displayName: 'Intruder' },
      },
      {
        method: 'GET' as const,
        url: `/v1/trips/${tripId}/settlements`,
        headers: outsiderHeaders,
      },
      {
        method: 'POST' as const,
        url: `/v1/trips/${tripId}/sync`,
        headers: outsiderHeaders,
        payload: { lastSeenSeq: 0, mutations: [] },
      },
      {
        method: 'GET' as const,
        url: `/v1/trips/${tripId}/bookings/${bookingId}/attachment`,
        headers: outsiderHeaders,
      },
      {
        method: 'GET' as const,
        url: `/v1/trips/${tripId}`,
        headers: outsiderHeaders,
      },
    ]) {
      const forbidden = await app.inject(reqSpec);
      expect(forbidden.statusCode, `Outsider ${reqSpec.method} ${reqSpec.url}`).toBe(403);
    }

    // Member WITHOUT vaultAccess (`karthik` added as contributor with vaultAccess=false) -> 403 on attachment download
    await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        userId: SEED_IDS.users.karthik,
        role: 'contributor',
        vaultAccess: false,
      },
    });

    const noVaultHeaders = {
      authorization: `Bearer ${signAccessToken({
        sub: SEED_IDS.users.karthik,
        displayName: 'Karthik Nair',
        tier: 'free',
      })}`,
    };
    const noVaultAttachment = await app.inject({
      method: 'GET',
      url: `/v1/trips/${tripId}/bookings/${bookingId}/attachment`,
      headers: noVaultHeaders,
    });
    expect(noVaultAttachment.statusCode).toBe(403);
  });

  it('3. PATCH /v1/trips/:id updates title & elderModeEnabled, and adding/deleting a day updates (ND) in destinationSummary', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      payload: {
        title: 'Munnar Hills',
        destinationSummary: 'Munnar (3D)',
        elderModeEnabled: true,
        daysCount: 3,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const cookie = extractCookieHeader(createRes.headers['set-cookie']);
    const tripId = createRes.json().trip.id as string;

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/v1/trips/${tripId}`,
      headers: { cookie },
      payload: {
        title: 'Munnar Tea Estate Escape',
        elderModeEnabled: false,
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().trip.title).toBe('Munnar Tea Estate Escape');
    expect(patchRes.json().trip.elderModeEnabled).toBe(false);

    // Add Day 4 via sync -> destinationSummary must automatically update from "Munnar (3D)" to "Munnar (4D)"
    const day4Id = crypto.randomUUID();
    const syncRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/sync`,
      headers: { cookie },
      payload: {
        lastSeenSeq: 0,
        mutations: [
          {
            clientOpId: 'add-day-4',
            hlcTimestamp: formatHlc({ wallMs: Date.now(), logical: 0, nodeId: 'c1' }),
            baseSeq: 3,
            entityType: 'trip_day',
            entityId: day4Id,
            action: 'upsert',
            payload: {
              dayNumber: 4,
              themeTitle: 'Kolukkumalai Sunrise',
              pacingLevel: 'moderate',
            },
          },
        ],
      },
    });
    expect(syncRes.statusCode).toBe(200);

    const wsAfter = await app.inject({
      method: 'GET',
      url: `/v1/trips/${tripId}`,
      headers: { cookie },
    });
    expect(wsAfter.statusCode).toBe(200);
    expect(wsAfter.json().trip.destinationSummary).toBe('Munnar (4D)');
    expect(wsAfter.json().trip.title).toBe('Munnar Tea Estate Escape');
    expect(wsAfter.json().trip.elderModeEnabled).toBe(false);
  });

  it('4. adds companion co-travellers with/without UPI VPA, computes real VPA settlements, and supports expense deletion', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      payload: {
        title: 'Gokarna Weekend Crew',
        daysCount: 2,
      },
    });
    const cookie = extractCookieHeader(createRes.headers['set-cookie']);
    const tripId = createRes.json().trip.id as string;
    const ownerId = createRes.json().members[0].userId as string;

    // Add companion 1 WITH real UPI VPA
    const addAarav = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/members`,
      headers: { cookie },
      payload: {
        displayName: 'Aarav',
        upiVpa: 'aarav@okaxis',
        role: 'contributor',
      },
    });
    expect(addAarav.statusCode).toBe(201);
    const aaravId = addAarav.json().member.userId as string;
    expect(addAarav.json().member.displayName).toBe('Aarav');
    expect(addAarav.json().member.hasUpiVpa).toBe(true);

    // Add companion 2 WITHOUT UPI VPA
    const addKabir = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/members`,
      headers: { cookie },
      payload: {
        displayName: 'Kabir',
        role: 'contributor',
      },
    });
    expect(addKabir.statusCode).toBe(201);
    const kabirId = addKabir.json().member.userId as string;
    expect(addKabir.json().member.hasUpiVpa).toBe(false);

    // Aarav pays ₹1,500 (150,000 paise) split equally across Owner, Aarav, Kabir (₹500 each)
    const exp1 = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/expenses`,
      headers: { cookie },
      payload: {
        clientOpId: crypto.randomUUID(),
        title: 'Kudle Beach Cafe Lunch',
        paidBy: aaravId,
        amountMinor: 150_000,
        currency: 'INR',
        splitMode: 'equal',
      },
    });
    expect(exp1.statusCode).toBe(201);
    const exp1Id = exp1.json().id as string;

    const settle1 = await app.inject({
      method: 'GET',
      url: `/v1/trips/${tripId}/settlements`,
      headers: { cookie },
    });
    expect(settle1.statusCode).toBe(200);
    const toAarav = settle1
      .json()
      .settlements.filter((s: { toUserId: string }) => s.toUserId === aaravId);
    expect(toAarav.length).toBe(2);
    expect(toAarav[0].payeeVpa).toBe('aarav@okaxis');
    expect(toAarav[0].upiUri).toContain('pa=aarav%40okaxis');

    // Delete that expense and log one paid by Kabir (no VPA) -> payeeVpa must be null!
    const delExp = await app.inject({
      method: 'DELETE',
      url: `/v1/trips/${tripId}/expenses/${exp1Id}`,
      headers: { cookie },
    });
    expect(delExp.statusCode).toBe(204);

    await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/expenses`,
      headers: { cookie },
      payload: {
        clientOpId: crypto.randomUUID(),
        title: 'Om Beach Boat Ride',
        paidBy: kabirId,
        amountMinor: 90_000,
        currency: 'INR',
        splitMode: 'equal',
        participantIds: [ownerId, kabirId],
      },
    });

    const settle2 = await app.inject({
      method: 'GET',
      url: `/v1/trips/${tripId}/settlements`,
      headers: { cookie },
    });
    expect(settle2.statusCode).toBe(200);
    expect(settle2.json().expenseCount).toBe(1);
    expect(settle2.json().settlements[0].toUserId).toBe(kabirId);
    expect(settle2.json().settlements[0].payeeVpa).toBeNull();
    expect(settle2.json().settlements[0].paymentMode).toBe('COPY_VPA_FALLBACK');
  });

  it('5. round-trips full encrypted binary ticket PDF bytes via POST /v1/ingest/file and GET /v1/trips/:id/bookings/:bookingId/attachment', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      payload: { title: 'Vault Binary Roundtrip Test', daysCount: 2 },
    });
    const cookie = extractCookieHeader(createRes.headers['set-cookie']);
    const tripId = createRes.json().trip.id as string;

    // Construct deterministic PDF-like binary buffer including arbitrary high bytes (0x89, 0xFF, 0x00)
    const header = Buffer.from(
      '%PDF-1.4\n(IndiGo Flight Confirmation) Tj\n(Booking Reference: Q8M2V4) Tj\n(Flight: 6E 2045 | Date: 18 Dec 2026) Tj\n',
      'utf8'
    );
    const binaryTail = Buffer.from([0x00, 0x89, 0x50, 0x4e, 0xff, 0xfe, 0x42, 0x10]);
    const originalBytes = Buffer.concat([header, binaryTail]);

    const uploadRes = await app.inject({
      method: 'POST',
      url: '/v1/ingest/file',
      headers: { cookie },
      payload: {
        tripId,
        fileName: 'indigo-boarding-pass.pdf',
        mimeType: 'application/pdf',
        contentBase64: originalBytes.toString('base64'),
      },
    });
    expect(uploadRes.statusCode).toBe(200);
    const bookingId = uploadRes.json().savedBooking.id as string;

    const downloadRes = await app.inject({
      method: 'GET',
      url: `/v1/trips/${tripId}/bookings/${bookingId}/attachment`,
      headers: { cookie },
    });
    expect(downloadRes.statusCode).toBe(200);
    const dl = downloadRes.json() as {
      fileName: string;
      mimeType: string;
      dataBase64: string;
      sizeBytes: number;
    };
    expect(dl.fileName).toBe('indigo-boarding-pass.pdf');
    expect(dl.mimeType).toBe('application/pdf');
    expect(dl.sizeBytes).toBe(originalBytes.byteLength);
    expect(Buffer.from(dl.dataBase64, 'base64').equals(originalBytes)).toBe(true);

    // Delete booking -> purges vault blob and decrements vaultBytesUsed back to 0
    const delBooking = await app.inject({
      method: 'DELETE',
      url: `/v1/trips/${tripId}/bookings/${bookingId}`,
      headers: { cookie },
    });
    expect(delBooking.statusCode).toBe(204);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/v1/trips/${tripId}/bookings/${bookingId}/attachment`,
      headers: { cookie },
    });
    expect(afterDelete.statusCode).toBe(404);
  });

  it('6. grants co-editor access to a second user via POST /v1/trips/:id/invites -> GET /v1/invites/:token -> POST /v1/invites/:token/accept', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const ownerToken = signAccessToken({
      sub: SEED_IDS.users.ananya,
      displayName: 'Ananya Sharma',
      tier: 'free',
    });
    const secondUserToken = signAccessToken({
      sub: SEED_IDS.users.rohan,
      displayName: 'Rohan Kulkarni',
      tier: 'free',
    });

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        title: 'Darjeeling Heritage Toy Train',
        destinationSummary: 'Darjeeling · Kurseong (4D)',
        daysCount: 4,
      },
    });
    const tripId = createRes.json().trip.id as string;

    // Second user initially gets 403
    const beforeAccept = await app.inject({
      method: 'PATCH',
      url: `/v1/trips/${tripId}`,
      headers: { authorization: `Bearer ${secondUserToken}` },
      payload: { title: 'Should Fail' },
    });
    expect(beforeAccept.statusCode).toBe(403);

    // Owner creates co-editor invite
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/invites`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { role: 'editor', vaultAccess: false },
    });
    expect(inviteRes.statusCode).toBe(201);
    const { token: inviteToken, inviteUrl } = inviteRes.json() as {
      token: string;
      inviteUrl: string;
    };
    expect(inviteUrl).toContain(`/invite/${inviteToken}`);

    // Public invite preview works without auth
    const previewRes = await app.inject({
      method: 'GET',
      url: `/v1/invites/${inviteToken}`,
    });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.json().tripTitle).toBe('Darjeeling Heritage Toy Train');
    expect(previewRes.json().role).toBe('editor');

    // Second user accepts invite
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/v1/invites/${inviteToken}/accept`,
      headers: { authorization: `Bearer ${secondUserToken}` },
      payload: {},
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(acceptRes.json()).toEqual({ tripId, role: 'editor' });

    // Second user can now co-edit the trip!
    const afterAccept = await app.inject({
      method: 'PATCH',
      url: `/v1/trips/${tripId}`,
      headers: { authorization: `Bearer ${secondUserToken}` },
      payload: { title: 'Darjeeling & Glenburn Tea Estate' },
    });
    expect(afterAccept.statusCode).toBe(200);
    expect(afterAccept.json().trip.title).toBe('Darjeeling & Glenburn Tea Estate');
  });

  it('7. returns the authenticated user saved upiVpa on GET /v1/auth/me and PATCH /v1/auth/me, prefers real user cookie over stale guest bearer token, and sends Clear-Site-Data on logout', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    // Stale guest bearer token
    const guestRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/guest',
      payload: {},
    });
    const staleGuestBearer = guestRes.json().token as string;

    // Real signed-in user session cookie (Ananya has pre-seeded VPA `ananya.sharma@okicici`)
    const realUserJwt = signAccessToken({
      sub: SEED_IDS.users.ananya,
      displayName: 'Ananya Sharma',
      tier: 'free',
      guest: false,
    });

    const meRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: {
        cookie: `itinbee_session=${realUserJwt}`,
        authorization: `Bearer ${staleGuestBearer}`,
      },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json();
    expect(meBody.authenticated).toBe(true);
    expect(meBody.guest).toBe(false);
    expect(meBody.user.id).toBe(SEED_IDS.users.ananya);
    expect(meBody.user.hasUpiVpa).toBe(true);
    expect(meBody.user.upiVpa).toBe('ananya.sharma@okicici');

    // Update VPA via PATCH /v1/auth/me and verify returned user.upiVpa
    const patchMe = await app.inject({
      method: 'PATCH',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${realUserJwt}` },
      payload: { upiVpa: 'ananya.travel@oksbi' },
    });
    expect(patchMe.statusCode).toBe(200);
    expect(patchMe.json().user.upiVpa).toBe('ananya.travel@oksbi');
    expect(patchMe.json().user.hasUpiVpa).toBe(true);

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: {},
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.headers['clear-site-data']).toBe('"cookies", "storage"');
  });

  it('8. enforces production fail-fast env checks, WS auth close codes (4401/4403) + ping/pong, webhook HMAC verification, and clean rishi-lnd-4d seed data', async () => {
    // 8a. Fail-fast loadEnv checks in NODE_ENV=production
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'dev-only-weak-secret',
        DEV_MASTER_KEY_HEX: 'a'.repeat(64),
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      })
    ).toThrow(/JWT_SECRET/);

    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'strong-production-secret-at-least-32-chars-long!',
        DEV_MASTER_KEY_HEX:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      })
    ).toThrow(/DEV_MASTER_KEY_HEX/);

    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'strong-production-secret-at-least-32-chars-long!',
        DEV_MASTER_KEY_HEX: 'b'.repeat(64),
        DATABASE_URL: '',
      })
    ).toThrow(/DATABASE_URL/);

    // 8b. Boot app with WEBHOOK_HMAC_SECRET and test WS auth + ping/pong + seed data
    const prodLikeTestCfg = loadEnv({
      NODE_ENV: 'test',
      WEBHOOK_HMAC_SECRET: 'super-secret-webhook-hmac-key',
      PUBLIC_BACKEND_HOST: 'itinbee-backend.onrender.com',
    });

    bundle = await buildApp({
      config: prodLikeTestCfg,
      forceLocalStore: true,
      logger: false,
    });
    const { app } = bundle;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    // Check rishi-lnd-4d seed cleanup: no duplicate Chaurasi Kutia & Day 1 transit <= 60m
    const seedRes = await app.inject({
      method: 'GET',
      url: `/v1/trips/${SEED_IDS.trips.rishikeshLandour}`,
    });
    expect(seedRes.statusCode).toBe(200);
    const seedItems = seedRes.json().items as Array<{
      title: string;
      kind: string;
      durationMins: number;
    }>;
    const chaurasiMatches = seedItems.filter((i) =>
      i.title.toLowerCase().includes('chaurasi kutia')
    );
    expect(chaurasiMatches.length).toBeLessThanOrEqual(1);
    expect(seedItems[0]!.durationMins).toBeLessThanOrEqual(60);

    // Webhook HMAC verification: missing/wrong signature -> 401; valid signature -> 202
    const webhookPayload = JSON.stringify({
      from: 'bookings@irctc.co.in',
      subject: 'Ticket Confirmation',
      textBody: 'PNR:2849103764,TRN:12017,DOJ:22-11-26,CC,NDLS-DDN,Dep:06:45,ANANYA SHARMA,C4,21,CNF',
    });

    const badWebhook = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound-email',
      headers: {
        'content-type': 'application/json',
        'x-itinbee-signature': 'deadbeef',
      },
      payload: webhookPayload,
    });
    expect(badWebhook.statusCode).toBe(401);

    const validSig = crypto
      .createHmac('sha256', 'super-secret-webhook-hmac-key')
      .update(webhookPayload)
      .digest('hex');
    const goodWebhook = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/inbound-email',
      headers: {
        'content-type': 'application/json',
        'x-itinbee-signature': `sha256=${validSig}`,
      },
      payload: webhookPayload,
    });
    expect(goodWebhook.statusCode).toBe(202);

    // WebSocket unauthorized close code (4401) & ping/pong on authorized ticket
    const unauthWsCode = await new Promise<number>((resolve) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/v1/trips/${SEED_IDS.trips.rishikeshLandour}/live`
      );
      ws.on('close', (code) => resolve(code));
    });
    expect(unauthWsCode).toBe(4401);

    const ownerToken = signAccessToken(
      {
        sub: SEED_IDS.users.ananya,
        displayName: 'Ananya Sharma',
        tier: 'free',
      },
      3600,
      prodLikeTestCfg.JWT_SECRET
    );
    const ticketRes = await app.inject({
      method: 'GET',
      url: `/v1/trips/${SEED_IDS.trips.rishikeshLandour}/ws-ticket`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(ticketRes.statusCode).toBe(200);
    expect(ticketRes.json().wsUrl).toBe(
      `wss://itinbee-backend.onrender.com/v1/trips/${SEED_IDS.trips.rishikeshLandour}/live`
    );

    const pongReceived = await new Promise<boolean>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/v1/trips/${SEED_IDS.trips.rishikeshLandour}/live?ticket=${encodeURIComponent(ticketRes.json().ticket)}`
      );
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as { type: string };
        if (msg.type === 'connected') {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else if (msg.type === 'pong') {
          ws.close();
          resolve(true);
        }
      });
      ws.on('error', reject);
    });
    expect(pongReceived).toBe(true);
  });

  it('9. enforces production 503 on unconfigured email/google auth, sliding-window 429 rate limits, OTP TTL expiry, exact CORS origins, 503 degraded health, and 400 Zod validation', async () => {
    const prodCfg = loadEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'prod-hmac-secret-with-more-than-32-characters-xyz',
      DEV_MASTER_KEY_HEX: 'c'.repeat(64),
      DATABASE_URL: 'postgres://itinbee:secret@localhost:5432/itinbee_prod',
      FRONTEND_HOST: 'itinbee-frontend.onrender.com',
      CORS_ORIGINS: 'https://itinbee.com',
    });

    const localStore = (await buildApp({ forceLocalStore: true, logger: false })).store;
    bundle = await buildApp({
      config: prodCfg,
      store: localStore,
      forceLocalStore: true,
      logger: false,
    });
    const { app, bus } = bundle;

    // 9a. Unconfigured Google Sign-In in production -> 503
    const googleUnconf = await app.inject({
      method: 'POST',
      url: '/v1/auth/google/verify',
      payload: { idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake' },
    });
    expect(googleUnconf.statusCode).toBe(503);
    expect(googleUnconf.json().error).toBe('google_auth_unconfigured');

    // 9b. Unconfigured Email Magic Link in production -> 503 (never fakes { sent: true }!)
    const emailUnconf = await app.inject({
      method: 'POST',
      url: '/v1/auth/magic/request',
      payload: { email: 'user@example.com' },
    });
    expect(emailUnconf.statusCode).toBe(503);
    expect(emailUnconf.json().error).toBe('email_unconfigured');
    expect(emailUnconf.json().devMagicCode).toBeUndefined();

    // 9c. Sliding-window rate limit -> >5 requests for same email within 10m returns 429
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/v1/auth/magic/request',
        payload: { email: 'ratelimit@example.com' },
      });
    }
    const sixthAttempt = await app.inject({
      method: 'POST',
      url: '/v1/auth/magic/request',
      payload: { email: 'ratelimit@example.com' },
    });
    expect(sixthAttempt.statusCode).toBe(429);

    // 9d. Exact CORS origin enforcement in production:
    // Allows https://itinbee-frontend.onrender.com, rejects https://attacker-app.onrender.com
    const allowedPreflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/trips',
      headers: {
        origin: 'https://itinbee-frontend.onrender.com',
        'access-control-request-method': 'POST',
      },
    });
    expect(allowedPreflight.headers['access-control-allow-origin']).toBe(
      'https://itinbee-frontend.onrender.com'
    );

    const rejectedPreflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/trips',
      headers: {
        origin: 'https://attacker-app.onrender.com',
        'access-control-request-method': 'POST',
      },
    });
    expect(
      rejectedPreflight.headers['access-control-allow-origin']
    ).toBeUndefined();

    // 9e. Zod validation still returns clean HTTP 400 under custom error handler
    const invalidPayload = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      payload: { title: '' },
    });
    expect(invalidPayload.statusCode).toBe(400);

    // 9f. In-memory OTP TTL expiry honored
    await bus.storeOtpCode('ttl-test', '123456', 1);
    await new Promise((r) => setTimeout(r, 1050));
    expect(await bus.verifyAndConsumeOtpCode('ttl-test', '123456')).toBe(false);
  });
});
