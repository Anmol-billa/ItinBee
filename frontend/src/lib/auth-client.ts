import { browserApiBase } from '@/lib/api-base';
import {
  AUTH_TOKEN_KEY,
  GUEST_TOKEN_KEY,
  IMPORT_MOCK,
  syncImportAuthToken,
} from '@/lib/import-client';
import { localDb } from '@/lib/offline-db';
import type { CurrencyCode, TripMeta } from '@/lib/types';

export interface AuthUser {
  id: string;
  email?: string | null;
  displayName: string;
  preferredLang: 'en' | 'hi';
  upiVpa?: string | null;
  hasUpiVpa?: boolean;
  tier?: 'free' | 'trip_pass' | 'pro';
  guest: boolean;
  createdAt?: string;
}

export interface AuthSessionState {
  user: AuthUser | null;
  guest: boolean;
  offline: boolean;
}

export interface MagicLinkRequestResult {
  sent: boolean;
  expiresInSeconds?: number;
  devMagicCode?: string;
}

export interface VerifyAuthResult {
  token: string;
  user: AuthUser;
  mergedTrips?: number;
}

export interface MyTripSummary {
  id: string;
  shortId: string;
  title: string;
  destinationSummary: string;
  startDate: string | null;
  endDate: string | null;
  homeCurrency: CurrencyCode;
  elderModeEnabled: boolean;
  updatedAt: string;
  source: 'cloud' | 'offline';
  openHref: string;
}

export class AuthApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

const PROFILE_CACHE_KEY = 'itinbee_auth_user';
export const AUTH_CHANGE_EVENT = 'itinbee-auth-changed';

function emitAuthChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  }
}

export function getStoredTokens(): { authToken: string | null; guestToken: string | null } {
  if (typeof window === 'undefined') return { authToken: null, guestToken: null };
  try {
    return {
      authToken: window.localStorage.getItem(AUTH_TOKEN_KEY),
      guestToken: window.sessionStorage.getItem(GUEST_TOKEN_KEY),
    };
  } catch {
    return { authToken: null, guestToken: null };
  }
}

export function getActiveBearerToken(): string | null {
  const { authToken } = getStoredTokens();
  return authToken;
}

function persistSession(token: string, user: AuthUser): void {
  if (typeof window === 'undefined') return;
  try {
    if (user.guest) {
      window.sessionStorage.setItem(GUEST_TOKEN_KEY, token);
      syncImportAuthToken(null);
    } else {
      window.sessionStorage.removeItem(GUEST_TOKEN_KEY);
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
      syncImportAuthToken(token);
    }
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(user));
  } catch {
    /* storage blocked */
  }
  emitAuthChanged();
}

export function readCachedUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  syncImportAuthToken(null);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(GUEST_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* storage blocked */
  }
  emitAuthChanged();
}

function normalizeUser(raw: Record<string, unknown>, fallbackGuest = false): AuthUser {
  const lang = raw.preferredLang === 'hi' ? 'hi' : 'en';
  const guest =
    typeof raw.guest === 'boolean'
      ? raw.guest
      : typeof raw.isGuest === 'boolean'
        ? raw.isGuest
        : fallbackGuest;
  const id = String(raw.id ?? 'guest');
  const cached = readCachedUser();
  let resolvedUpiVpa: string | null = null;
  if (typeof raw.upiVpa === 'string') {
    resolvedUpiVpa = raw.upiVpa.trim() || null;
  } else if (raw.upiVpa === null) {
    resolvedUpiVpa = null;
  } else if (raw.upiVpa === undefined && raw.hasUpiVpa === true && cached?.id === id && cached.upiVpa) {
    resolvedUpiVpa = cached.upiVpa;
  }

  return {
    id,
    email: typeof raw.email === 'string' ? raw.email : cached?.id === id ? (cached.email ?? null) : null,
    displayName:
      typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName
        : guest
          ? 'Guest traveller'
          : 'Traveller',
    preferredLang: lang,
    upiVpa: resolvedUpiVpa,
    hasUpiVpa: typeof raw.hasUpiVpa === 'boolean' ? raw.hasUpiVpa : Boolean(resolvedUpiVpa),
    tier:
      raw.tier === 'trip_pass' || raw.tier === 'pro' || raw.tier === 'free'
        ? raw.tier
        : 'free',
    guest,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
  };
}

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getActiveBearerToken();
  const base = IMPORT_MOCK && path === '/v1/auth/guest' ? '/api/mock/import/auth/guest' : `${browserApiBase()}${path}`;
  let res: Response;
  try {
    res = await fetch(base, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new AuthApiError(0, 'network', 'Could not reach the Itinbee server. Check your connection.');
  }

  if (!res.ok) {
    let body: { code?: string; error?: string; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new AuthApiError(
      res.status,
      body.code || body.error || `http_${res.status}`,
      body.message || body.error || `Request failed (${res.status})`
    );
  }
  return (await res.json()) as T;
}

/** GET /v1/auth/me */
export async function fetchCurrentSession(): Promise<AuthSessionState> {
  try {
    const res = await authFetch<Record<string, unknown>>('/v1/auth/me');
    if (!res || res.user === null) {
      return { user: null, guest: false, offline: false };
    }
    const rawUser =
      typeof res.user === 'object' && res.user !== null
        ? (res.user as Record<string, unknown>)
        : res;
    const guestFlag = typeof res.guest === 'boolean' ? res.guest : Boolean(rawUser.guest ?? rawUser.isGuest);
    const user = normalizeUser(rawUser, guestFlag);
    try {
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(user));
    } catch {
      /* ignore */
    }
    return { user, guest: user.guest, offline: false };
  } catch (err) {
    if (err instanceof AuthApiError && (err.status === 401 || err.status === 404)) {
      const cached = readCachedUser();
      const { authToken, guestToken } = getStoredTokens();
      if (cached && authToken && err.status === 404) {
        return { user: cached, guest: cached.guest, offline: false };
      }
      if (guestToken) {
        return {
          user: {
            id: 'guest-session',
            displayName: 'Guest session',
            preferredLang: 'en',
            guest: true,
          },
          guest: true,
          offline: false,
        };
      }
      return { user: null, guest: false, offline: false };
    }
    const cached = readCachedUser();
    const { guestToken } = getStoredTokens();
    if (cached) {
      return { user: cached, guest: cached.guest, offline: true };
    }
    if (guestToken) {
      return {
        user: {
          id: 'guest-session',
          displayName: 'Guest session',
          preferredLang: 'en',
          guest: true,
        },
        guest: true,
        offline: true,
      };
    }
    return { user: null, guest: false, offline: true };
  }
}

/** Convenience helper returning the signed-in (non-guest) user or null. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const session = await fetchCurrentSession();
  if (session.user && !session.guest) {
    return session.user;
  }
  return null;
}

/** POST /v1/auth/guest */
export async function startGuestSession(): Promise<{ token: string; user: AuthUser }> {
  const res = await authFetch<{ token: string; user?: Record<string, unknown>; guest?: boolean }>('/v1/auth/guest', {
    method: 'POST',
    body: '{}',
  });
  const user = normalizeUser(res.user ?? { id: 'guest', displayName: 'Guest traveller' }, true);
  persistSession(res.token, user);
  return { token: res.token, user };
}

/** POST /v1/auth/magic/request */
export async function requestMagicCode(
  email: string,
  turnstileToken?: string
): Promise<MagicLinkRequestResult> {
  const cleanEmail = email.trim().toLowerCase();
  const res = await authFetch<{
    sent?: boolean;
    ok?: boolean;
    expiresInSeconds?: number;
    devMagicCode?: string;
    devCode?: string;
    code?: string;
  }>('/v1/auth/magic/request', {
    method: 'POST',
    body: JSON.stringify({
      email: cleanEmail,
      ...(turnstileToken ? { turnstileToken } : {}),
    }),
  });
  return {
    sent: res.sent ?? res.ok ?? true,
    expiresInSeconds: res.expiresInSeconds,
    devMagicCode: res.devMagicCode ?? res.devCode ?? res.code,
  };
}

/** POST /v1/auth/magic/verify */
export async function verifyMagicCode(params: {
  email: string;
  code: string;
  displayName?: string;
}): Promise<VerifyAuthResult> {
  const { guestToken } = getStoredTokens();
  const res = await authFetch<{
    token: string;
    user: Record<string, unknown>;
    mergedTrips?: number;
    mergedTripsCount?: number;
  }>('/v1/auth/magic/verify', {
    method: 'POST',
    headers: guestToken ? { Authorization: `Bearer ${guestToken}` } : undefined,
    body: JSON.stringify({
      email: params.email.trim().toLowerCase(),
      code: params.code.trim(),
      ...(params.displayName?.trim() ? { displayName: params.displayName.trim() } : {}),
    }),
  });
  const user = normalizeUser(res.user, false);
  persistSession(res.token, user);
  return { token: res.token, user, mergedTrips: res.mergedTripsCount ?? res.mergedTrips };
}

/** POST /v1/auth/google/verify (supports real Google ID token or devEmail/devName in local dev) */
export async function verifyGoogleSignIn(params: {
  idToken?: string;
  devEmail?: string;
  devName?: string;
}): Promise<VerifyAuthResult> {
  const { guestToken } = getStoredTokens();
  const payload: Record<string, string> = {};
  if (params.idToken) payload.idToken = params.idToken;
  if (params.devEmail) payload.devEmail = params.devEmail;
  if (params.devName) payload.devName = params.devName;

  try {
    const res = await authFetch<{
      token: string;
      user: Record<string, unknown>;
      mergedTrips?: number;
      mergedTripsCount?: number;
    }>('/v1/auth/google/verify', {
      method: 'POST',
      headers: guestToken ? { Authorization: `Bearer ${guestToken}` } : undefined,
      body: JSON.stringify(payload),
    });
    const user = normalizeUser(res.user, false);
    persistSession(res.token, user);
    return { token: res.token, user, mergedTrips: res.mergedTripsCount ?? res.mergedTrips };
  } catch (err) {
    if (err instanceof AuthApiError && err.status === 404 && params.devEmail && params.devName) {
      const legacy = await authFetch<{ token: string; user: Record<string, unknown> }>('/v1/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          idTokenOrSub: `dev-google:${params.devEmail}`,
          email: params.devEmail,
          displayName: params.devName,
        }),
      });
      const user = normalizeUser(legacy.user, false);
      persistSession(legacy.token, user);
      return { token: legacy.token, user };
    }
    throw err;
  }
}

/** Local development sign-in helper when backend isn't running and developer clicks Dev Sign-In. */
export function activateLocalDevAccount(params: { email: string; displayName: string }): VerifyAuthResult {
  const user: AuthUser = {
    id: 'local-dev-user',
    email: params.email.trim().toLowerCase(),
    displayName: params.displayName.trim() || 'Dev Traveller',
    preferredLang: 'en',
    upiVpa: null,
    hasUpiVpa: false,
    tier: 'free',
    guest: false,
    createdAt: new Date().toISOString(),
  };
  const token = 'local-dev-token';
  persistSession(token, user);
  return { token, user };
}

/** PATCH /v1/auth/me */
export async function updateAccountProfile(patch: {
  displayName?: string;
  preferredLang?: 'en' | 'hi';
  upiVpa?: string | null;
}): Promise<AuthUser> {
  try {
    const res = await authFetch<{ user?: Record<string, unknown> } & Record<string, unknown>>('/v1/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const rawUser =
      typeof res.user === 'object' && res.user !== null ? res.user : res;
    const updated = normalizeUser(
      {
        ...readCachedUser(),
        ...rawUser,
        ...(rawUser.upiVpa === undefined && patch.upiVpa !== undefined
          ? { upiVpa: patch.upiVpa, hasUpiVpa: Boolean(patch.upiVpa) }
          : {}),
      },
      false
    );
    try {
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(updated));
    } catch {
      /* ignore */
    }
    emitAuthChanged();
    return updated;
  } catch (err) {
    const cached = readCachedUser();
    if (err instanceof AuthApiError && (err.status === 0 || err.status === 404) && cached) {
      const updated: AuthUser = {
        ...cached,
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.preferredLang !== undefined ? { preferredLang: patch.preferredLang } : {}),
        ...(patch.upiVpa !== undefined ? { upiVpa: patch.upiVpa, hasUpiVpa: Boolean(patch.upiVpa) } : {}),
      };
      try {
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      emitAuthChanged();
      return updated;
    }
    throw err;
  }
}

/** POST /v1/auth/logout */
export async function signOutAccount(): Promise<void> {
  try {
    await authFetch('/v1/auth/logout', { method: 'POST', body: '{}' });
  } catch {
    /* always clear local state even if offline or 404 */
  }
  clearStoredSession();
}

function toMyTripSummary(t: TripMeta, source: 'cloud' | 'offline', openHref?: string): MyTripSummary {
  return {
    id: t.id,
    shortId: t.shortId,
    title: t.title,
    destinationSummary: t.destinationSummary,
    startDate: t.startDate,
    endDate: t.endDate,
    homeCurrency: t.homeCurrency,
    elderModeEnabled: t.elderModeEnabled,
    updatedAt: t.updatedAt,
    source,
    openHref: openHref ?? `/trip/${t.id}`,
  };
}

/** GET /v1/me/trips + IndexedDB offline sandboxes */
export async function fetchMyTripsAndOffline(): Promise<{
  trips: MyTripSummary[];
  cloudReachable: boolean;
}> {
  const byKey = new Map<string, MyTripSummary>();
  let cloudReachable = false;

  try {
    const res = await authFetch<{ trips?: TripMeta[]; items?: TripMeta[] }>('/v1/me/trips');
    cloudReachable = true;
    for (const t of res.trips ?? res.items ?? []) {
      if (t.isSample) continue;
      byKey.set(t.id, toMyTripSummary(t, 'cloud'));
    }
  } catch (err) {
    if (err instanceof AuthApiError && err.status === 404) {
      try {
        const fallback = await authFetch<{ trips?: TripMeta[] }>('/v1/trips');
        cloudReachable = true;
        for (const t of fallback.trips ?? []) {
          if (t.isSample) continue;
          byKey.set(t.id, toMyTripSummary(t, 'cloud'));
        }
      } catch {
        /* offline or unauthorized */
      }
    } else if (err instanceof AuthApiError && err.status === 401) {
      cloudReachable = true;
    }
  }

  if (localDb) {
    try {
      const rows = await localDb.sandboxes.orderBy('updatedAt').reverse().toArray();
      for (const row of rows) {
        const trip = row.workspace?.trip;
        if (!trip || trip.isSample) continue;
        if (byKey.has(trip.id)) continue;
        const href = trip.id.startsWith('local-') ? `/trip/${trip.shortId}` : `/trip/${trip.id}`;
        byKey.set(trip.id, toMyTripSummary({ ...trip, updatedAt: row.updatedAt || trip.updatedAt }, 'offline', href));
      }
    } catch {
      /* IndexedDB unavailable */
    }
  }

  const trips = [...byKey.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { trips, cloudReachable };
}
