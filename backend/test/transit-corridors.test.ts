import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type BuiltAppBundle } from '../src/app.js';
import type { TripIntent } from '../src/modules/import/intent.js';

interface ImportJobPollResponse {
  id: string;
  status: string;
  intent?: TripIntent;
  tripId?: string;
}

interface TripWorkspaceResponse {
  trip: {
    id: string;
    title: string;
    destinationSummary: string;
  };
  days: Array<{
    id: string;
    dayNumber: number;
    themeTitle: string;
    pacingLevel: string;
  }>;
  items: Array<{
    id: string;
    dayId: string | null;
    kind: string;
    title: string;
    notes: string;
    lat: number | null;
    lng: number | null;
    placeRefId: string | null;
    sortKey: string;
    startTime: string | null;
    durationMins: number | null;
    accessibilityNotes: string;
    transitMeta?: {
      mode?: string;
      vehicleCode?: string;
      carrierName?: string;
      originCode?: string;
      destinationCode?: string;
      isIntercityLeg?: boolean;
      legDirection?: string;
      estimatedDurationMins?: number;
      distanceKm?: number;
      advisory?: string;
    };
  }>;
}

async function runFullImportFlow(
  bundle: BuiltAppBundle,
  token: string,
  text: string,
  overrideIntent?: (intent: TripIntent) => TripIntent
): Promise<{ intent: TripIntent; workspace: TripWorkspaceResponse }> {
  const createRes = await bundle.app.inject({
    method: 'POST',
    url: '/v1/import/jobs',
    headers: { authorization: `Bearer ${token}` },
    payload: { text },
  });
  expect(createRes.statusCode).toBe(202);
  const { jobId } = createRes.json() as { jobId: string };

  let state: ImportJobPollResponse | null = null;
  for (let i = 0; i < 40; i++) {
    const r = await bundle.app.inject({
      method: 'GET',
      url: `/v1/import/jobs/${jobId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    state = r.json() as ImportJobPollResponse;
    if (state.status === 'needs_review' || state.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  expect(state?.status).toBe('needs_review');
  expect(state?.intent).toBeTruthy();

  const confirmedIntent = overrideIntent
    ? overrideIntent(state!.intent!)
    : state!.intent!;

  const confirmRes = await bundle.app.inject({
    method: 'POST',
    url: `/v1/import/jobs/${jobId}/confirm`,
    headers: { authorization: `Bearer ${token}` },
    payload: { intent: confirmedIntent },
  });
  expect(confirmRes.statusCode).toBe(202);

  for (let i = 0; i < 50; i++) {
    const r = await bundle.app.inject({
      method: 'GET',
      url: `/v1/import/jobs/${jobId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    state = r.json() as ImportJobPollResponse;
    if (state.status === 'done' || state.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  expect(state?.status).toBe('done');
  expect(state?.tripId).toBeTruthy();

  const wsRes = await bundle.app.inject({
    method: 'GET',
    url: `/v1/trips/${state!.tripId}`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(wsRes.statusCode).toBe(200);

  return {
    intent: state!.intent!,
    workspace: wsRes.json() as TripWorkspaceResponse,
  };
}

function orderedDayItems(ws: TripWorkspaceResponse, dayNumber: number) {
  const day = ws.days.find((d) => d.dayNumber === dayNumber);
  if (!day) return [];
  return ws.items
    .filter((i) => i.dayId === day.id)
    .sort((a, b) =>
      a.sortKey === b.sortKey
        ? a.id < b.id
          ? -1
          : 1
        : a.sortKey < b.sortKey
          ? -1
          : 1
    );
}

describe('Door-to-Door Origin & Multi-Modal Transit Corridors', () => {
  let bundle: BuiltAppBundle;
  let guestToken = '';

  beforeAll(async () => {
    bundle = await buildApp({ forceLocalStore: true, logger: false });
    await bundle.app.ready();

    const guestRes = await bundle.app.inject({
      method: 'POST',
      url: '/v1/auth/guest',
      payload: {},
    });
    expect(guestRes.statusCode).toBe(200);
    guestToken = (guestRes.json() as { token: string }).token;
  });

  afterAll(async () => {
    await bundle.app.close();
  });

  it('1. builds a door-to-door 5D Delhi -> Leh by Train round trip starting and ending at New Delhi Railway Station (NDLS)', async () => {
    const { intent, workspace } = await runFullImportFlow(
      bundle,
      guestToken,
      'Delhi to Leh by Train 5D, 4N trip ending back at Delhi Railway station - I want budget hotels and want relaxing activities'
    );

    expect(intent.origin?.resolved).toBe(true);
    expect(intent.origin?.hubCode).toBe('NDLS');
    expect(intent.returnPoint?.resolved).toBe(true);
    expect(intent.returnPoint?.hubCode).toBe('NDLS');
    expect(intent.roundTrip).toBe(true);
    expect(intent.transportMode).toBe('train');
    expect(intent.pace).toBe('relaxed');
    expect(intent.budget.tier).toBe('budget');

    // Outbound options include both rail+road (non-railhead chain) and direct flight comparison
    const outbound = intent.routeOptions?.outbound ?? [];
    expect(outbound.length).toBeGreaterThanOrEqual(2);
    expect(outbound.some((o) => o.modeCategory === 'train')).toBe(true);
    expect(outbound.some((o) => o.modeCategory === 'flight')).toBe(true);

    // Exact 5-day count preserved
    expect(workspace.days).toHaveLength(5);

    // Every item in workspace has grounded coordinates
    expect(
      workspace.items.every(
        (it) => typeof it.lat === 'number' && typeof it.lng === 'number'
      )
    ).toBe(true);

    // Day 1 starts at New Delhi Railway Station (NDLS ~28.64, 77.22) — NOT directly in Leh (~34.15, 77.57)!
    const day1Items = orderedDayItems(workspace, 1);
    expect(day1Items.length).toBeGreaterThanOrEqual(2);
    expect(day1Items[0]!.kind).toBe('transit');
    expect(day1Items[0]!.title).toMatch(/New Delhi|NDLS/i);
    expect(day1Items[0]!.lat!).toBeGreaterThan(28.4);
    expect(day1Items[0]!.lat!).toBeLessThan(28.9);

    // Middle day(s) reach Leh (~34.15, 77.57) with relaxed sightseeing stops
    const day3Items = orderedDayItems(workspace, 3);
    expect(day3Items.length).toBeGreaterThanOrEqual(1);
    expect(day3Items.some((i) => (i.lat ?? 0) > 33.8)).toBe(true);

    // Final Day 5 arrives back at New Delhi Railway Station (NDLS ~28.64, 77.22)
    const day5Items = orderedDayItems(workspace, 5);
    expect(day5Items.length).toBeGreaterThanOrEqual(1);
    const finalStop = day5Items[day5Items.length - 1]!;
    expect(finalStop.kind).toBe('transit');
    expect(finalStop.title).toMatch(/New Delhi|NDLS/i);
    expect(finalStop.lat!).toBeGreaterThan(28.4);
    expect(finalStop.lat!).toBeLessThan(28.9);
  });

  it('2. schedules direct DEL -> IXL flight + mandatory Leh altitude acclimatization rest and return to Delhi Railway Station', async () => {
    const { intent, workspace } = await runFullImportFlow(
      bundle,
      guestToken,
      'Delhi to Leh by Flight 5D ending back at Delhi Railway station',
      (draft) => {
        const flightOut = draft.routeOptions?.outbound.find(
          (o) => o.modeCategory === 'flight'
        );
        const flightRet = draft.routeOptions?.return.find(
          (o) => o.modeCategory === 'flight'
        );
        return {
          ...draft,
          transportMode: 'flight',
          selectedOutboundOptionId: flightOut?.id ?? draft.selectedOutboundOptionId,
          selectedReturnOptionId: flightRet?.id ?? draft.selectedReturnOptionId,
        };
      }
    );

    expect(intent.origin?.resolved).toBe(true);
    expect(workspace.days).toHaveLength(5);

    const day1Items = orderedDayItems(workspace, 1);
    // Flight departure / arrival leg present on Day 1
    expect(
      day1Items.some(
        (i) => i.transitMeta?.mode === 'flight' || /6E|Flight|IXL/i.test(i.title)
      )
    ).toBe(true);
    // High-altitude acclimatization rest block scheduled after landing in Leh
    expect(
      day1Items.some((i) => /acclimatiz/i.test(`${i.title} ${i.notes}`))
    ).toBe(true);

    // Day 5 includes return flight + connector back to New Delhi Railway Station
    const day5Items = orderedDayItems(workspace, 5);
    expect(
      day5Items.some(
        (i) => i.transitMeta?.mode === 'flight' || /6E|Flight|DEL/i.test(i.title)
      )
    ).toBe(true);
    const lastStop = day5Items[day5Items.length - 1]!;
    expect(lastStop.lat!).toBeGreaterThan(28.4);
    expect(lastStop.lat!).toBeLessThan(28.9);
  });

  it('3. splits ultra-long Delhi -> Leh road trip (> 10h driving) into 2-day overnight highway legs', async () => {
    const { intent, workspace } = await runFullImportFlow(
      bundle,
      guestToken,
      'Delhi to Leh road trip by car 7 days'
    );

    expect(intent.transportMode).toBe('drive');
    const driveOut = intent.routeOptions?.outbound.find(
      (o) => o.modeCategory === 'drive'
    );
    expect(driveOut).toBeTruthy();
    expect(driveOut!.legs.length).toBeGreaterThanOrEqual(2);
    expect(driveOut!.transitDaysRequired).toBeGreaterThanOrEqual(1.5);
    expect(workspace.days).toHaveLength(7);
  });

  it('4. schedules same-day Vande Bharat rail arrival + afternoon sightseeing on Delhi -> Varanasi 4D train trip', async () => {
    const { intent, workspace } = await runFullImportFlow(
      bundle,
      guestToken,
      'Delhi to Varanasi by Train 4 days'
    );

    expect(intent.origin?.hubCode).toBe('NDLS');
    expect(intent.transportMode).toBe('train');
    expect(workspace.days).toHaveLength(4);

    const day1Items = orderedDayItems(workspace, 1);
    expect(day1Items[0]!.kind).toBe('transit');
    expect(day1Items.some((i) => i.transitMeta?.mode === 'rail')).toBe(true);
    // Same-day arrival leaves room for afternoon/evening Varanasi sightseeing on Day 1
    expect(day1Items.some((i) => i.kind !== 'transit')).toBe(true);
  });

  it('5. exposes POST /v1/transit/options for live ReviewStep route switching', async () => {
    const res = await bundle.app.inject({
      method: 'POST',
      url: '/v1/transit/options',
      payload: {
        origin: { name: 'New Delhi Railway Station', resolved: false },
        roundTrip: true,
        transportMode: 'train',
        firstDestination: {
          name: 'Leh',
          destinationSlug: 'ladakh',
          lat: 34.1526,
          lng: 77.5771,
        },
        lastDestination: {
          name: 'Leh',
          destinationSlug: 'ladakh',
          lat: 34.1526,
          lng: 77.5771,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      origin: { hubCode?: string; resolved: boolean } | null;
      returnPoint: { hubCode?: string; resolved: boolean } | null;
      roundTrip: boolean;
      routeOptions: {
        outbound: Array<{ id: string; modeCategory: string }>;
        return: Array<{ id: string; modeCategory: string }>;
      };
      selectedOutboundOptionId: string | null;
      selectedReturnOptionId: string | null;
    };

    expect(body.origin?.resolved).toBe(true);
    expect(body.origin?.hubCode).toBe('NDLS');
    expect(body.roundTrip).toBe(true);
    expect(body.routeOptions.outbound.length).toBeGreaterThanOrEqual(2);
    expect(body.routeOptions.return.length).toBeGreaterThanOrEqual(2);
    expect(body.selectedOutboundOptionId).toBeTruthy();
    expect(body.selectedReturnOptionId).toBeTruthy();
  });
});
