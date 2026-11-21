import { buildGuestFallbackFromSample, SAMPLE_WORKSPACES } from '@/data/sample-trips';
import type {
  GuestShareProjection,
  OpenPoiResult,
  PollView,
  TripWorkspace,
} from '@/lib/types';

export interface SyncClientMutationInput {
  clientOpId: string;
  hlcTimestamp: string;
  baseSeq: number;
  entityType: 'trip_day' | 'itinerary_item';
  entityId: string;
  action: 'upsert' | 'delete';
  payload: Record<string, unknown>;
}

function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    const internal =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      '127.0.0.1:4000';
    const normalized = internal.startsWith('http')
      ? internal
      : `http://${internal}`;
    return normalized.replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  ) {
    return 'http://localhost:4000';
  }
  return '/api/proxy';
}

export async function resolveWsBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '').replace(
      /^http/,
      'ws'
    );
  }
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  ) {
    return 'ws://localhost:4000';
  }
  try {
    const res = await fetch('/api/proxy/_ws', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { wsBaseUrl?: string };
      if (data.wsBaseUrl) return data.wsBaseUrl;
    }
  } catch {
    // Fall back below
  }
  return 'ws://localhost:4000';
}

export async function fetchGuestShareSSR(shortId: string): Promise<GuestShareProjection | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/v1/t/${encodeURIComponent(shortId)}`, {
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      return (await res.json()) as GuestShareProjection;
    }
  } catch {
    // Fall back to pre-bundled sample itinerary if backend is unreachable during static build
  }
  return buildGuestFallbackFromSample(shortId);
}

export async function fetchTripWorkspace(idOrShort: string): Promise<TripWorkspace | null> {
  if (SAMPLE_WORKSPACES[idOrShort]) {
    try {
      const sampleId = SAMPLE_WORKSPACES[idOrShort]!.trip.id;
      const res = await fetch(`${getBaseUrl()}/v1/trips/${sampleId}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) return (await res.json()) as TripWorkspace;
    } catch {
      return structuredClone(SAMPLE_WORKSPACES[idOrShort]!);
    }
    return structuredClone(SAMPLE_WORKSPACES[idOrShort]!);
  }

  try {
    const res = await fetch(`${getBaseUrl()}/v1/trips/${encodeURIComponent(idOrShort)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) return (await res.json()) as TripWorkspace;
  } catch {
    for (const sample of Object.values(SAMPLE_WORKSPACES)) {
      if (sample.trip.id === idOrShort) return structuredClone(sample);
    }
  }
  return null;
}

export interface IngestTextApiResponse {
  stageUsed: 'stage2_deterministic' | 'stage3_vertex_mumbai' | 'social_oembed';
  detectedKind: string;
  aadhaarRedactions: number;
  sanitizedExcerpt: string;
  requiresAmberVerification: boolean;
  parsedBooking: {
    provider: string;
    pnrMasked: string | null;
    status: string;
    summary: Record<string, unknown>;
    parserConfidence: number;
    lowConfidenceFields: string[];
    suggestedTitle: string;
    suggestedDate: string | null;
    suggestedStartTime: string | null;
  } | null;
  extractedSocialStops: Array<{
    title: string;
    kind: 'stay' | 'transit' | 'activity' | 'meal' | 'note';
    lat: number | null;
    lng: number | null;
    placeRefId: string | null;
    addressLocalScript: string | null;
    dietaryFlags: string[];
    accessibilityNotes: string;
    googleMapsUrl: string | null;
    confidence: number;
    needsVerification: boolean;
  }>;
}

export async function ingestTicketOrReelText(
  text: string,
  tripId?: string
): Promise<IngestTextApiResponse> {
  const res = await fetch(`${getBaseUrl()}/v1/ingest/text`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, tripId, coTravellerConsent: true }),
  });
  if (!res.ok) {
    throw new Error('Could not parse ticket or link right now.');
  }
  return (await res.json()) as IngestTextApiResponse;
}

export async function searchOpenPlaces(query: string): Promise<OpenPoiResult[]> {
  const res = await fetch(
    `${getBaseUrl()}/v1/places/search?q=${encodeURIComponent(query)}&limit=6`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results: OpenPoiResult[] };
  return data.results ?? [];
}

export async function claimSandboxToCloud(workspace: TripWorkspace): Promise<TripWorkspace> {
  const dayMap = new Map(workspace.days.map((d) => [d.id, d.dayNumber]));
  const res = await fetch(`${getBaseUrl()}/v1/trips/claim-sandbox`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: workspace.trip.title,
      destinationSummary: workspace.trip.destinationSummary,
      startDate: workspace.trip.startDate,
      endDate: workspace.trip.endDate,
      homeCurrency: workspace.trip.homeCurrency,
      elderModeEnabled: workspace.trip.elderModeEnabled,
      days: workspace.days
        .filter((d) => !d.deletedAt)
        .map((d) => ({
          dayNumber: d.dayNumber,
          date: d.date,
          themeTitle: d.themeTitle,
          pacingLevel: d.pacingLevel,
        })),
      items: [...workspace.items, ...workspace.shortlist]
        .filter((i) => !i.deletedAt)
        .map((i) => ({
          dayNumber: i.dayId ? (dayMap.get(i.dayId) ?? 1) : null,
          kind: i.kind,
          title: i.title,
          notes: i.notes,
          lat: i.lat,
          lng: i.lng,
          placeRefId: i.placeRefId,
          addressLocalScript: i.addressLocalScript,
          sortKey: i.sortKey,
          startTime: i.startTime,
          durationMins: i.durationMins,
          dietaryFlags: i.dietaryFlags,
          accessibilityNotes: i.accessibilityNotes,
          elderSummaryI18n: i.elderSummaryI18n,
          isShortlist: i.isShortlist,
        })),
    }),
  });
  if (!res.ok) {
    throw new Error('Could not sync sandbox to cloud.');
  }
  return (await res.json()) as TripWorkspace;
}

export async function pushSyncMutations(
  tripId: string,
  lastSeenSeq: number,
  mutations: SyncClientMutationInput[]
) {
  const res = await fetch(`${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lastSeenSeq, mutations }),
  });
  if (!res.ok) throw new Error('Sync request failed');
  return res.json();
}

export async function castGuestPollVote(params: {
  shortId: string;
  pollId: string;
  optionId: string;
  guestDisplayName: string;
}): Promise<PollView> {
  let sid = '';
  if (typeof window !== 'undefined') {
    sid = localStorage.getItem('itinbee_guest_sid') || crypto.randomUUID();
    localStorage.setItem('itinbee_guest_sid', sid);
  }
  const res = await fetch(
    `${getBaseUrl()}/v1/t/${encodeURIComponent(params.shortId)}/polls/${encodeURIComponent(
      params.pollId
    )}/vote`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        optionId: params.optionId,
        guestDisplayName: params.guestDisplayName.trim() || 'Guest',
        turnstileToken: 'turnstile-pass-verified',
        guestSessionId: sid,
      }),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not record vote');
  }
  return (await res.json()) as PollView;
}
