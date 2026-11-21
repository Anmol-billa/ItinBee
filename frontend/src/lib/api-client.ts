import { buildGuestFallbackFromSample, SAMPLE_WORKSPACES } from '@/data/sample-trips';
import type {
  BookingView,
  CurrencyCode,
  ExpenseView,
  GuestShareProjection,
  ItemKind,
  ItineraryItem,
  KittyPoolView,
  MemberRole,
  OpenPoiResult,
  PollView,
  SplitMode,
  TripMeta,
  TripMember,
  TripWorkspace,
  UpiSettlementInstruction,
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

const AUTH_TOKEN_STORAGE_KEY = 'itinbee_auth_token';

/**
 * ONLY reads the signed-in user token from `localStorage.getItem('itinbee_auth_token')` —
 * NEVER attaches a stale `sessionStorage` guest token that could override a signed-in cookie!
 */
export function getSignedInUserBearerToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

function buildAuthHeaders(
  extraHeaders?: Record<string, string>,
  cookieHeader?: string
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (typeof window !== 'undefined') {
    const userToken = getSignedInUserBearerToken();
    if (userToken) {
      headers.Authorization = `Bearer ${userToken}`;
    }
  } else if (cookieHeader && cookieHeader.trim()) {
    headers.cookie = cookieHeader.trim();
  }
  return headers;
}

function clientCredentialsOption(): Pick<RequestInit, 'credentials'> {
  return typeof window !== 'undefined' ? { credentials: 'include' } : {};
}

export function getBaseUrl(): string {
  if (typeof window === 'undefined') {
    const internal =
      process.env.INTERNAL_API_URL ||
      process.env.PUBLIC_BACKEND_URL ||
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
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')
      .replace(/^https:/i, 'wss:')
      .replace(/^http:/i, 'ws:');
  }
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
  ) {
    return 'ws://localhost:4000';
  }
  try {
    const res = await fetch('/api/proxy/_ws', {
      cache: 'no-store',
      credentials: 'include',
    });
    if (res.ok) {
      const data = (await res.json()) as { wsBaseUrl?: string };
      if (data.wsBaseUrl) return data.wsBaseUrl.replace(/\/+$/, '');
    }
  } catch {
    // Fall back below
  }
  return 'ws://localhost:4000';
}

/**
 * Requests a short-lived WebSocket room ticket (`GET /v1/trips/:id/ws-ticket`)
 * so cross-origin WebSocket upgrades carry verified membership credentials,
 * falling back cleanly to `/api/proxy/_ws` if the ticket route is unavailable.
 */
export async function resolveLiveTripWsUrl(tripId: string): Promise<string> {
  try {
    const res = await fetch(
      `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/ws-ticket`,
      {
        method: 'GET',
        cache: 'no-store',
        ...clientCredentialsOption(),
        headers: buildAuthHeaders({ accept: 'application/json' }),
        signal: AbortSignal.timeout(6000),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        wsUrl?: string;
        ticket?: string;
      };
      if (data.wsUrl && /^wss?:\/\//i.test(data.wsUrl)) {
        if (data.ticket && !data.wsUrl.includes('ticket=')) {
          const sep = data.wsUrl.includes('?') ? '&' : '?';
          return `${data.wsUrl}${sep}ticket=${encodeURIComponent(data.ticket)}`;
        }
        return data.wsUrl;
      }
      const wsBase = await resolveWsBaseUrl();
      if (data.wsUrl && data.wsUrl.startsWith('/')) {
        if (data.ticket && !data.wsUrl.includes('ticket=')) {
          const sep = data.wsUrl.includes('?') ? '&' : '?';
          return `${wsBase}${data.wsUrl}${sep}ticket=${encodeURIComponent(data.ticket)}`;
        }
        return `${wsBase}${data.wsUrl}`;
      }
      if (data.ticket) {
        return `${wsBase}/v1/trips/${encodeURIComponent(tripId)}/live?ticket=${encodeURIComponent(data.ticket)}`;
      }
    }
  } catch {
    // Fall through to base live URL
  }
  const wsBase = await resolveWsBaseUrl();
  return `${wsBase}/v1/trips/${encodeURIComponent(tripId)}/live`;
}

export async function fetchGuestShareSSR(shortId: string): Promise<GuestShareProjection | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/v1/t/${encodeURIComponent(shortId)}`, {
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      return (await res.json()) as GuestShareProjection;
    }
  } catch (err) {
    // Catch TimeoutError / AbortError / network errors gracefully
    void err;
  }
  return buildGuestFallbackFromSample(shortId);
}

export async function fetchTripWorkspace(
  idOrShort: string,
  options?: { cookieHeader?: string }
): Promise<TripWorkspace | null> {
  const headers = buildAuthHeaders(
    { accept: 'application/json' },
    options?.cookieHeader
  );

  if (SAMPLE_WORKSPACES[idOrShort]) {
    try {
      const sampleId = SAMPLE_WORKSPACES[idOrShort]!.trip.id;
      const res = await fetch(`${getBaseUrl()}/v1/trips/${sampleId}`, {
        cache: 'no-store',
        ...clientCredentialsOption(),
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return (await res.json()) as TripWorkspace;
    } catch (err) {
      void err;
      return structuredClone(SAMPLE_WORKSPACES[idOrShort]!);
    }
    return structuredClone(SAMPLE_WORKSPACES[idOrShort]!);
  }

  try {
    const res = await fetch(`${getBaseUrl()}/v1/trips/${encodeURIComponent(idOrShort)}`, {
      cache: 'no-store',
      ...clientCredentialsOption(),
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return (await res.json()) as TripWorkspace;
  } catch (err) {
    void err;
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
  savedBooking?: BookingView | null;
  savedShortlistItems?: ItineraryItem[];
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

export interface IngestFileApiResponse extends IngestTextApiResponse {
  vaultRegion?: string;
  encryptedBytesStored?: number;
}

export async function ingestTicketOrReelText(
  text: string,
  tripId?: string
): Promise<IngestTextApiResponse> {
  const res = await fetch(`${getBaseUrl()}/v1/ingest/text`, {
    method: 'POST',
    ...clientCredentialsOption(),
    headers: buildAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ text, tripId, coTravellerConsent: true }),
  });
  if (!res.ok) {
    throw new Error('Could not parse ticket or link right now.');
  }
  return (await res.json()) as IngestTextApiResponse;
}

export async function ingestBookingFile(params: {
  tripId: string;
  fileName: string;
  mimeType: string;
  fileBase64: string;
}): Promise<IngestFileApiResponse> {
  const res = await fetch(`${getBaseUrl()}/v1/ingest/file`, {
    method: 'POST',
    ...clientCredentialsOption(),
    headers: buildAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      tripId: params.tripId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      fileBase64: params.fileBase64,
      contentBase64: params.fileBase64,
      coTravellerConsent: true,
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not encrypt and upload ticket file.');
  }
  return (await res.json()) as IngestFileApiResponse;
}

export async function downloadBookingAttachment(
  tripId: string,
  bookingId: string
): Promise<{ blob: Blob; fileName: string }> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/bookings/${encodeURIComponent(bookingId)}/attachment`,
    {
      method: 'GET',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders(),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Ticket attachment not available or vault access required.');
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as {
      fileBase64?: string;
      contentBase64?: string;
      dataBase64?: string;
      mimeType?: string;
      fileName?: string;
      downloadUrl?: string;
    };
    if (data.downloadUrl) {
      const dlRes = await fetch(data.downloadUrl);
      const blob = await dlRes.blob();
      return { blob, fileName: data.fileName || `ticket-${bookingId.slice(0, 8)}.pdf` };
    }
    const b64 = data.fileBase64 || data.contentBase64 || data.dataBase64 || '';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = data.mimeType || 'application/pdf';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'pdf';
    return {
      blob: new Blob([bytes], { type: mime }),
      fileName: data.fileName || `ticket-${bookingId.slice(0, 8)}.${ext}`,
    };
  }

  const cd = res.headers.get('content-disposition') || '';
  const fnMatch = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const blob = await res.blob();
  const ext = blob.type.includes('png')
    ? 'png'
    : blob.type.includes('webp')
      ? 'webp'
      : blob.type.includes('jpeg')
        ? 'jpg'
        : 'pdf';
  return {
    blob,
    fileName: fnMatch?.[1] ? decodeURIComponent(fnMatch[1]) : `ticket-${bookingId.slice(0, 8)}.${ext}`,
  };
}

export async function deleteCloudBooking(
  tripId: string,
  bookingId: string
): Promise<void> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/bookings/${encodeURIComponent(bookingId)}`,
    {
      method: 'DELETE',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders(),
    }
  );
  if (!res.ok && res.status !== 404) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not remove booking.');
  }
}

export async function searchOpenPlaces(query: string): Promise<OpenPoiResult[]> {
  const res = await fetch(
    `${getBaseUrl()}/v1/places/search?q=${encodeURIComponent(query)}&limit=6`,
    {
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ accept: 'application/json' }),
    }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results: OpenPoiResult[] };
  return data.results ?? [];
}

export async function claimSandboxToCloud(workspace: TripWorkspace): Promise<TripWorkspace> {
  const dayMap = new Map(workspace.days.map((d) => [d.id, d.dayNumber]));
  const res = await fetch(`${getBaseUrl()}/v1/trips/claim-sandbox`, {
    method: 'POST',
    ...clientCredentialsOption(),
    headers: buildAuthHeaders({ 'content-type': 'application/json' }),
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

export interface SyncPushResponse {
  latestSeq: number;
  appliedOps?: unknown[];
  pulledDeltas?: unknown[];
  activeDays?: TripWorkspace['days'];
  activeItems?: ItineraryItem[];
  shortlistItems?: ItineraryItem[];
}

export async function pushSyncMutations(
  tripId: string,
  lastSeenSeq: number,
  mutations: SyncClientMutationInput[]
): Promise<SyncPushResponse> {
  const res = await fetch(`${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/sync`, {
    method: 'POST',
    ...clientCredentialsOption(),
    headers: buildAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ lastSeenSeq, mutations }),
  });
  if (!res.ok) throw new Error('Sync request failed');
  return (await res.json()) as SyncPushResponse;
}

export async function updateTripMeta(
  tripId: string,
  patch: Partial<
    Pick<
      TripMeta,
      | 'title'
      | 'destinationSummary'
      | 'startDate'
      | 'endDate'
      | 'homeCurrency'
      | 'elderModeEnabled'
    >
  >
): Promise<TripMeta | null> {
  const res = await fetch(`${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}`, {
    method: 'PATCH',
    ...clientCredentialsOption(),
    headers: buildAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { trip?: TripMeta } & Partial<TripMeta>;
  return (data.trip ?? (data.id ? (data as TripMeta) : null)) as TripMeta | null;
}

export interface BackendAssistOperation {
  op: 'add' | 'move' | 'remove' | 'update';
  dayNumber?: number;
  itemId?: string;
  title?: string;
  kind?: ItemKind;
  startTime?: string;
  durationMins?: number;
  notes?: string;
  lat?: number | null;
  lng?: number | null;
  placeRefId?: string | null;
}

export interface BackendAssistResponse {
  mode: 'ai' | 'basic';
  proposal: {
    summary: string;
    operations: BackendAssistOperation[];
  };
}

export async function requestTripAssist(
  tripId: string,
  params: { instruction: string; dayId?: string }
): Promise<BackendAssistResponse> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/assist`,
    {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        instruction: params.instruction.trim(),
        ...(params.dayId ? { dayId: params.dayId } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(err.message || err.error || 'Assist unavailable');
  }
  return (await res.json()) as BackendAssistResponse;
}

export async function createCloudKittyPool(
  tripId: string,
  body: {
    title: string;
    custodianId: string;
    currency?: CurrencyCode;
    memberContributionsMinor: Record<string, number>;
  }
): Promise<KittyPoolView> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/kitty-pools`,
    {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not create kitty pool');
  }
  return (await res.json()) as KittyPoolView;
}

export async function createCloudExpense(
  tripId: string,
  body: {
    clientOpId: string;
    entryType?: 'charge' | 'adjustment' | 'settlement';
    reversesExpenseId?: string | null;
    title: string;
    category?: string;
    paidBy: string;
    kittyPoolId?: string | null;
    amountMinor: number;
    currency: CurrencyCode;
    splitMode: SplitMode;
    participantIds?: string[];
    excludedTags?: string[];
  }
): Promise<ExpenseView> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/expenses`,
    {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not log expense');
  }
  return (await res.json()) as ExpenseView;
}

export async function deleteCloudExpense(
  tripId: string,
  expenseId: string
): Promise<void> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/expenses/${encodeURIComponent(expenseId)}`,
    {
      method: 'DELETE',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders(),
    }
  );
  if (!res.ok && res.status !== 404) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not delete expense');
  }
}

export interface SettlementsApiResponse {
  tripId: string;
  shortId: string;
  netBalancesInrMinor: Record<string, number>;
  settlements: UpiSettlementInstruction[];
  kittyPools: KittyPoolView[];
  expenseCount: number;
}

export async function fetchCloudSettlements(
  tripId: string
): Promise<SettlementsApiResponse> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/settlements`,
    {
      method: 'GET',
      cache: 'no-store',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ accept: 'application/json' }),
    }
  );
  if (!res.ok) throw new Error('Could not fetch settlements');
  return (await res.json()) as SettlementsApiResponse;
}

export async function addCloudTripMember(
  tripId: string,
  body: {
    userId?: string;
    displayName: string;
    role?: MemberRole;
    dietaryTags: string[];
    upiVpa?: string | null;
  }
): Promise<TripMember | null> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/members`,
    {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        userId: body.userId ?? crypto.randomUUID(),
        displayName: body.displayName,
        role: body.role ?? 'contributor',
        dietaryTags: body.dietaryTags,
        ...(body.upiVpa ? { upiVpa: body.upiVpa } : {}),
      }),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not add co-traveller');
  }
  const data = (await res.json()) as { member?: TripMember } & Partial<TripMember>;
  if (data.member) return data.member;
  if (data.userId && data.displayName) return data as TripMember;
  return null;
}

export async function updateCloudTripMember(
  tripId: string,
  userId: string,
  patch: {
    displayName?: string;
    dietaryTags?: string[];
    upiVpa?: string | null;
    role?: MemberRole;
  }
): Promise<TripMember | null> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/members/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not update member');
  }
  const data = (await res.json()) as { member?: TripMember } & Partial<TripMember>;
  if (data.member) return data.member;
  if (data.userId && data.displayName) return data as TripMember;
  return null;
}

export async function createCloudPoll(
  tripId: string,
  body: {
    question: string;
    options: Array<{ id?: string; label: string; subtitle?: string }>;
    closesAt?: string | null;
  }
): Promise<PollView> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/polls`,
    {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not create poll');
  }
  return (await res.json()) as PollView;
}

export interface TripInviteResult {
  token: string;
  inviteUrl?: string;
  role: 'editor' | 'viewer';
  expiresAt?: string;
}

export async function createTripInvite(
  tripId: string,
  body: { role: 'editor' | 'viewer'; email?: string }
): Promise<TripInviteResult> {
  const res = await fetch(
    `${getBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/invites`,
    {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        role: body.role,
        ...(body.email?.trim() ? { email: body.email.trim() } : {}),
      }),
    }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not create invite link');
  }
  const raw = (await res.json()) as { invite?: TripInviteResult } & Partial<TripInviteResult>;
  const inv = raw.invite ?? raw;
  return {
    token: String(inv.token ?? ''),
    inviteUrl: inv.inviteUrl,
    role: inv.role === 'viewer' ? 'viewer' : 'editor',
    expiresAt: inv.expiresAt,
  };
}

export interface InvitePreview {
  token: string;
  tripId: string;
  tripTitle: string;
  destinationSummary: string;
  role: 'editor' | 'viewer';
  inviterName?: string;
  expiresAt?: string;
}

export async function fetchInvitePreview(
  token: string,
  options?: { cookieHeader?: string }
): Promise<InvitePreview | null> {
  try {
    const res = await fetch(
      `${getBaseUrl()}/v1/invites/${encodeURIComponent(token)}`,
      {
        cache: 'no-store',
        ...clientCredentialsOption(),
        headers: buildAuthHeaders({ accept: 'application/json' }, options?.cookieHeader),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    const inviteObj =
      typeof raw.invite === 'object' && raw.invite !== null
        ? (raw.invite as Record<string, unknown>)
        : raw;
    const tripObj =
      typeof raw.trip === 'object' && raw.trip !== null
        ? (raw.trip as Record<string, unknown>)
        : typeof inviteObj.trip === 'object' && inviteObj.trip !== null
          ? (inviteObj.trip as Record<string, unknown>)
          : {};
    return {
      token: String(inviteObj.token ?? token),
      tripId: String(inviteObj.tripId ?? tripObj.id ?? ''),
      tripTitle: String(inviteObj.tripTitle ?? tripObj.title ?? 'Shared Trip'),
      destinationSummary: String(
        inviteObj.destinationSummary ?? tripObj.destinationSummary ?? ''
      ),
      role: inviteObj.role === 'viewer' ? 'viewer' : 'editor',
      inviterName:
        typeof inviteObj.inviterName === 'string'
          ? inviteObj.inviterName
          : typeof raw.inviterName === 'string'
            ? raw.inviterName
            : undefined,
      expiresAt:
        typeof inviteObj.expiresAt === 'string' ? inviteObj.expiresAt : undefined,
    };
  } catch {
    return null;
  }
}

export async function acceptTripInvite(token: string): Promise<{ tripId: string }> {
  const attempt = async () =>
    fetch(`${getBaseUrl()}/v1/invites/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: '{}',
    });

  let res = await attempt();
  if (res.status === 401) {
    await fetch(`${getBaseUrl()}/v1/auth/guest`, {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: '{}',
    }).catch(() => {});
    res = await attempt();
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || 'Could not accept invite');
  }
  const data = (await res.json()) as {
    tripId?: string;
    trip?: { id?: string };
  };
  const tripId = data.tripId || data.trip?.id || '';
  if (!tripId) throw new Error('Invite accepted, but trip ID was missing');
  return { tripId };
}

export async function castGuestPollVote(params: {
  shortId: string;
  pollId: string;
  optionId: string;
  guestDisplayName: string;
  turnstileToken?: string;
}): Promise<PollView> {
  let sid = '';
  if (typeof window !== 'undefined') {
    try {
      sid = localStorage.getItem('itinbee_guest_sid') || crypto.randomUUID();
      localStorage.setItem('itinbee_guest_sid', sid);
    } catch {
      sid = crypto.randomUUID();
    }
  }
  const res = await fetch(
    `${getBaseUrl()}/v1/t/${encodeURIComponent(params.shortId)}/polls/${encodeURIComponent(
      params.pollId
    )}/vote`,
    {
      method: 'POST',
      ...clientCredentialsOption(),
      headers: buildAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        optionId: params.optionId,
        guestDisplayName: params.guestDisplayName.trim() || 'Guest',
        turnstileToken: params.turnstileToken?.trim() || 'turnstile-pass-verified',
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
