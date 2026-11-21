import type { FastifyReply, FastifyRequest } from 'fastify';
import { env, type AppEnv } from '../config/env.js';
import {
  signAuthToken,
  verifyWsTicket,
  type AuthTokenClaims,
} from './auth-tokens.js';
import { extractAuthClaims } from '../routes/auth-helper.js';
import type { TripStore } from '../store/repository.js';
import type { MemberRole, TripMemberPublic, TripMeta } from '../types/domain.js';

export const SESSION_COOKIE_NAME = 'itinbee_session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const WRITE_ROLES: ReadonlySet<MemberRole> = new Set<MemberRole>([
  'owner',
  'editor',
  'contributor',
]);

export function issueSessionCookie(
  reply: FastifyReply,
  token: string,
  config: Pick<AppEnv, 'NODE_ENV'> = env
): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * For guest-friendly creation routes (`POST /v1/trips`, `POST /v1/trips/claim-sandbox`,
 * `POST /v1/invites/:token/accept`): resolves an authenticated user if present, or
 * transparently creates a guest user + sets the `itinbee_session` cookie.
 */
export async function resolveCallerOrCreateGuest(
  req: FastifyRequest,
  reply: FastifyReply,
  store: TripStore,
  config: AppEnv = env
): Promise<{ userId: string; token?: string; createdGuest: boolean }> {
  const claims = extractAuthClaims(req, config.JWT_SECRET);
  if (claims) {
    const existing = await store.getUserById(claims.sub);
    if (existing) {
      return { userId: existing.id, createdGuest: false };
    }
  }

  const guest = await store.createGuestUser('Traveller');
  const token = signAuthToken(
    {
      sub: guest.id,
      displayName: guest.displayName,
      tier: guest.tier,
      guest: true,
    },
    SESSION_COOKIE_MAX_AGE_SECONDS,
    config.JWT_SECRET
  );
  issueSessionCookie(reply, token, config);
  return { userId: guest.id, token, createdGuest: true };
}

/**
 * Requires a valid session cookie or Bearer token; sends HTTP 401 and returns null if missing.
 */
export function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
  config: AppEnv = env
): AuthTokenClaims | null {
  const claims = extractAuthClaims(req, config.JWT_SECRET);
  if (!claims) {
    void reply.code(401).send({ error: 'Authentication required' });
    return null;
  }
  return claims;
}

export interface RequireTripAccessOptions {
  write?: boolean;
  ownerOnly?: boolean;
  vaultOnly?: boolean;
  allowSamplePublicRead?: boolean;
  allowTicketQuery?: boolean;
  config?: AppEnv;
}

export interface ResolvedTripAccess {
  userId: string | null;
  claims: AuthTokenClaims | null;
  trip: TripMeta;
  member: TripMemberPublic | null;
}

/**
 * Enforces trip existence (404), caller authentication (401), and trip membership / role / vault
 * authorization (403) across all trip, member, sync, vault, and ledger routes.
 */
export async function requireTripAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  store: TripStore,
  tripId: string,
  opts: RequireTripAccessOptions = {}
): Promise<ResolvedTripAccess | null> {
  const cfg = opts.config ?? env;
  const claims = extractAuthClaims(req, cfg.JWT_SECRET);
  let resolvedUserId: string | null = claims?.sub ?? null;

  if (!resolvedUserId && opts.allowTicketQuery) {
    const queryObj = req.query as Record<string, unknown> | undefined;
    const rawTicket =
      typeof queryObj?.ticket === 'string' ? queryObj.ticket : undefined;
    const wsClaims = verifyWsTicket(rawTicket, cfg.JWT_SECRET);
    if (wsClaims && wsClaims.tripId === tripId) {
      resolvedUserId = wsClaims.userId;
    }
  }

  const access = await store.getTripAccessInfo(tripId, resolvedUserId);
  if (!access) {
    void reply.code(404).send({ error: 'Trip not found' });
    return null;
  }

  // Unauthenticated / non-member read allowed ONLY on sample/public template trips when
  // `allowSamplePublicRead: true` AND neither `write`, `ownerOnly`, nor `vaultOnly` is requested.
  if (
    opts.allowSamplePublicRead &&
    !opts.write &&
    !opts.ownerOnly &&
    !opts.vaultOnly &&
    (access.trip.isSample || access.trip.isPublicTemplate)
  ) {
    return {
      userId: resolvedUserId,
      claims,
      trip: access.trip,
      member: access.member,
    };
  }

  if (!resolvedUserId) {
    void reply.code(401).send({ error: 'Authentication required' });
    return null;
  }

  if (!access.member) {
    void reply.code(403).send({ error: 'Forbidden: you are not a member of this trip' });
    return null;
  }

  if (opts.ownerOnly && access.member.role !== 'owner') {
    void reply.code(403).send({ error: 'Forbidden: trip owner role required' });
    return null;
  }

  if (opts.write && !WRITE_ROLES.has(access.member.role)) {
    void reply.code(403).send({ error: 'Forbidden: write permission required' });
    return null;
  }

  if (opts.vaultOnly && !access.member.vaultAccess) {
    void reply.code(403).send({ error: 'Forbidden: vault access required' });
    return null;
  }

  return {
    userId: resolvedUserId,
    claims,
    trip: access.trip,
    member: access.member,
  };
}
