import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type BuiltAppBundle } from '../src/app.js';
import { SafeFetcher, SsrfBlockedError } from '../src/modules/import/safe-fetch.js';

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
    // 1. Create guest session
    const guestRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/guest',
      payload: {},
    });
    expect(guestRes.statusCode).toBe(200);
    const guest = guestRes.json() as { token: string; guest: boolean; user: { id: string } };
    expect(guest.guest).toBe(true);

    // 2. Clone a template into guest workspace
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

    // Verify guest sees cloned trip in /v1/me/trips
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

    // 3. Request & verify email magic link while carrying guest token -> merges trip!
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

    // 4. Signed-in user owns the merged trip and can publish it to Explore
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

  it('runs Smart Import job through Stage A review -> confirm -> Stage B trip creation and Ask Itinbee assist', async () => {
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

    // Poll until Stage A reaches needs_review
    let state: {
      status: string;
      intent?: {
        title: string;
        destinations: Array<{ name: string; resolved: boolean; lat?: number; lng?: number }>;
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

    // Confirm intent -> Stage B builds itinerary
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

    // Verify created trip workspace has 4 days and grounded items
    const wsRes = await bundle.app.inject({
      method: 'GET',
      url: `/v1/trips/${state.tripId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(wsRes.statusCode).toBe(200);
    const ws = wsRes.json() as {
      days: unknown[];
      items: Array<{ lat: number | null; lng: number | null }>;
    };
    expect(ws.days.length).toBe(4);
    expect(ws.items.length).toBeGreaterThanOrEqual(4);
    expect(ws.items.every((it) => typeof it.lat === 'number' && typeof it.lng === 'number')).toBe(
      true
    );

    // Ask Itinbee read-only proposal diff
    const assistRes = await bundle.app.inject({
      method: 'POST',
      url: `/v1/trips/${state.tripId}/assist`,
      headers: { authorization: `Bearer ${token}` },
      payload: { instruction: 'Make Day 1 more relaxed' },
    });
    expect(assistRes.statusCode).toBe(200);
    const assistBody = assistRes.json() as { proposal: { summary: string; operations: unknown[] } };
    expect(assistBody.proposal.summary.length).toBeGreaterThan(0);
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
});
