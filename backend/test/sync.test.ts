import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp, type BuiltAppBundle } from '../src/app.js';
import { formatHlc } from '../src/modules/sync/hlc.js';

function extractCookieHeader(setCookie: string | string[] | undefined): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!first) throw new Error('Expected set-cookie header on guest trip creation');
  return first.split(';')[0]!;
}

describe('HLC + Fractional-Index Delta-Sync Engine & Live WebSocket Rooms', () => {
  let bundle: BuiltAppBundle | null = null;

  afterEach(async () => {
    if (bundle) {
      await bundle.app.close();
      bundle = null;
    }
  });

  it('resolves concurrent offline insertions at the exact same sort_key deterministically via (sort_key, id) tie-break and enforces client_op_id idempotency', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      payload: {
        title: 'Spiti Offline Roadtrip',
        destinationSummary: 'Shimla · Kalpa · Kaza',
        daysCount: 2,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const sessionCookie = extractCookieHeader(createRes.headers['set-cookie']);
    const created = createRes.json();
    const tripId = created.trip.id as string;
    const day1Id = created.days[0].id as string;

    // Two offline clients insert stops at the EXACT same fractional `sortKey: "V0"`
    const itemLowUuid = '00000000-0000-4000-8000-000000000010';
    const itemHighUuid = '00000000-0000-4000-8000-000000000099';

    // Push higher UUID first, then lower UUID—server must still sort `(sort_key, id)` ascending!
    const sync1 = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/sync`,
      headers: { cookie: sessionCookie },
      payload: {
        lastSeenSeq: 0,
        mutations: [
          {
            clientOpId: 'op-client-b-1',
            hlcTimestamp: formatHlc({ wallMs: 1763600001000, logical: 0, nodeId: 'clientB' }),
            baseSeq: 2,
            entityType: 'itinerary_item',
            entityId: itemHighUuid,
            action: 'upsert',
            payload: {
              dayId: day1Id,
              kind: 'activity',
              title: 'Key Gompa Sunset',
              sortKey: 'V0',
            },
          },
          {
            clientOpId: 'op-client-a-1',
            hlcTimestamp: formatHlc({ wallMs: 1763600000500, logical: 0, nodeId: 'clientA' }),
            baseSeq: 2,
            entityType: 'itinerary_item',
            entityId: itemLowUuid,
            action: 'upsert',
            payload: {
              dayId: day1Id,
              kind: 'meal',
              title: 'Himalayan Cafe Kaza',
              sortKey: 'V0',
            },
          },
        ],
      },
    });

    expect(sync1.statusCode).toBe(200);
    const body1 = sync1.json();
    expect(body1.activeItems.map((i: { id: string }) => i.id)).toEqual([
      itemLowUuid,
      itemHighUuid,
    ]);
    const seqAfterFirstBatch = body1.latestSeq as number;

    // Replay `op-client-a-1` (idempotency check: must NOT increment latestSeq or duplicate stops)
    const syncReplay = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/sync`,
      headers: { cookie: sessionCookie },
      payload: {
        lastSeenSeq: 0,
        mutations: [
          {
            clientOpId: 'op-client-a-1',
            hlcTimestamp: formatHlc({ wallMs: 1763600000500, logical: 0, nodeId: 'clientA' }),
            baseSeq: 2,
            entityType: 'itinerary_item',
            entityId: itemLowUuid,
            action: 'upsert',
            payload: {
              dayId: day1Id,
              kind: 'meal',
              title: 'Himalayan Cafe Kaza',
              sortKey: 'V0',
            },
          },
        ],
      },
    });

    expect(syncReplay.statusCode).toBe(200);
    expect(syncReplay.json().latestSeq).toBe(seqAfterFirstBatch);
    expect(syncReplay.json().activeItems).toHaveLength(2);
  });

  it('preserves user stops via the Orphan-to-Shortlist rule when a target trip_day is tombstoned offline', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      payload: {
        title: 'Ladakh Acclimatization Plan',
        daysCount: 3,
      },
    });
    const sessionCookie = extractCookieHeader(createRes.headers['set-cookie']);
    const ws = createRes.json();
    const tripId = ws.trip.id as string;
    const day2Id = ws.days[1].id as string;
    const day3Id = ws.days[2].id as string;

    // Seed an existing stop on Day 3
    const existingDay3Stop = crypto.randomUUID();
    await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/sync`,
      headers: { cookie: sessionCookie },
      payload: {
        lastSeenSeq: 0,
        mutations: [
          {
            clientOpId: 'op-seed-day3-stop',
            hlcTimestamp: formatHlc({ wallMs: 1763600001000, logical: 0, nodeId: 'u1' }),
            baseSeq: 3,
            entityType: 'itinerary_item',
            entityId: existingDay3Stop,
            action: 'upsert',
            payload: {
              dayId: day3Id,
              kind: 'activity',
              title: 'Pangong Tso Merak Camp',
              sortKey: 'B0',
            },
          },
        ],
      },
    });

    // User B deletes Day 2 and Day 3 while offline
    const delRes = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/sync`,
      headers: { cookie: sessionCookie },
      payload: {
        lastSeenSeq: 0,
        mutations: [
          {
            clientOpId: 'op-del-day2',
            hlcTimestamp: formatHlc({ wallMs: 1763600002000, logical: 0, nodeId: 'uB' }),
            baseSeq: 4,
            entityType: 'trip_day',
            entityId: day2Id,
            action: 'delete',
            payload: {},
          },
          {
            clientOpId: 'op-del-day3',
            hlcTimestamp: formatHlc({ wallMs: 1763600002001, logical: 0, nodeId: 'uB' }),
            baseSeq: 4,
            entityType: 'trip_day',
            entityId: day3Id,
            action: 'delete',
            payload: {},
          },
        ],
      },
    });
    expect(delRes.statusCode).toBe(200);
    // Existing Day 3 stop must already be preserved in Shortlist!
    expect(
      delRes
        .json()
        .shortlistItems.some((it: { id: string }) => it.id === existingDay3Stop)
    ).toBe(true);

    // Now User A reconnects from airplane mode and pushes a new stop targeting deleted Day 2
    const offlineNewStopId = crypto.randomUUID();
    const latePush = await app.inject({
      method: 'POST',
      url: `/v1/trips/${tripId}/sync`,
      headers: { cookie: sessionCookie },
      payload: {
        lastSeenSeq: 3,
        mutations: [
          {
            clientOpId: 'op-late-offline-add-to-deleted-day2',
            hlcTimestamp: formatHlc({ wallMs: 1763600001500, logical: 0, nodeId: 'uA' }),
            baseSeq: 3,
            entityType: 'itinerary_item',
            entityId: offlineNewStopId,
            action: 'upsert',
            payload: {
              dayId: day2Id,
              isShortlist: false,
              kind: 'activity',
              title: 'Shanti Stupa Sunset Walk',
              sortKey: 'M0',
            },
          },
        ],
      },
    });

    expect(latePush.statusCode).toBe(200);
    const lateBody = latePush.json();
    expect(lateBody.appliedOps[0].orphanedToShortlist).toBe(true);

    const preservedStop = lateBody.shortlistItems.find(
      (it: { id: string }) => it.id === offlineNewStopId
    );
    expect(preservedStop).toBeDefined();
    expect(preservedStop.dayId).toBeNull();
    expect(preservedStop.isShortlist).toBe(true);
    expect(lateBody.activeDays).toHaveLength(1);
  });

  it('converges identically across 25 concurrent offline client sync batches with zero lost stops and broadcasts over WebSocket', async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    const { app } = bundle;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/trips',
      payload: { title: '25-Client Crew Fuzz Sync', daysCount: 2 },
    });
    const sessionCookie = extractCookieHeader(createRes.headers['set-cookie']);
    const tripId = createRes.json().trip.id as string;
    const day1Id = createRes.json().days[0].id as string;

    const ticketRes = await app.inject({
      method: 'GET',
      url: `/v1/trips/${tripId}/ws-ticket`,
      headers: { cookie: sessionCookie },
    });
    expect(ticketRes.statusCode).toBe(200);
    const { ticket } = ticketRes.json() as { ticket: string };

    // Connect a live WebSocket listener on WSS /v1/trips/:id/live using signed WS ticket
    const receivedEvents: Array<{ type: string }> = [];
    const wsClient = new WebSocket(
      `ws://127.0.0.1:${port}/v1/trips/${tripId}/live?ticket=${encodeURIComponent(ticket)}`
    );
    await new Promise<void>((resolve, reject) => {
      wsClient.on('message', (data) => {
        const parsed = JSON.parse(data.toString()) as { type: string };
        receivedEvents.push(parsed);
        if (parsed.type === 'connected') resolve();
      });
      wsClient.on('error', reject);
    });

    // Fire 25 concurrent offline sync pushes
    const clientPromises = Array.from({ length: 25 }, (_, idx) => {
      const entityId = crypto.randomUUID();
      return app.inject({
        method: 'POST',
        url: `/v1/trips/${tripId}/sync`,
        headers: { cookie: sessionCookie },
        payload: {
          lastSeenSeq: 0,
          mutations: [
            {
              clientOpId: `fuzz-op-${idx}`,
              hlcTimestamp: formatHlc({
                wallMs: 1763601000000 + idx,
                logical: 0,
                nodeId: `c${idx}`,
              }),
              baseSeq: 2,
              entityType: 'itinerary_item',
              entityId,
              action: 'upsert',
              payload: {
                dayId: day1Id,
                kind: 'activity',
                title: `Stop #${idx}`,
                sortKey: `K${String(idx % 5)}`, // Deliberate sort_key collisions across 5 buckets
              },
            },
          ],
        },
      });
    });

    const responses = await Promise.all(clientPromises);
    for (const r of responses) {
      expect(r.statusCode).toBe(200);
    }

    // Verify all 25 stops exist and are strictly ordered by (sort_key, id)
    const finalWs = await app.inject({
      method: 'GET',
      url: `/v1/trips/${tripId}`,
      headers: { cookie: sessionCookie },
    });
    const items = finalWs.json().items as Array<{ id: string; sortKey: string }>;
    expect(items).toHaveLength(25);

    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]!;
      const curr = items[i]!;
      const validOrder =
        prev.sortKey < curr.sortKey ||
        (prev.sortKey === curr.sortKey && prev.id < curr.id);
      expect(validOrder).toBe(true);
    }

    // Confirm WebSocket received sync_delta broadcasts
    await new Promise((r) => setTimeout(r, 40));
    expect(receivedEvents.some((e) => e.type === 'sync_delta')).toBe(true);
    wsClient.close();
  });
});
