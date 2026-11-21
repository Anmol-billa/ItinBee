import type { FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import {
  verifyAuthToken,
  type AuthTokenClaims,
} from '../security/auth-tokens.js';

/**
 * Extracts caller auth claims from `itinbee_session` cookie and/or `Authorization: Bearer`.
 * If `cookieClaims` is a signed-in non-guest user, prefers `cookieClaims` over a stale guest
 * `Authorization: Bearer` token (`GAP-13`), while still honoring explicit non-guest Bearer
 * tokens (for API clients, mobile apps, and tests) and guest tokens when no user session exists.
 */
export function extractAuthClaims(
  req: FastifyRequest,
  secret: string = env.JWT_SECRET
): AuthTokenClaims | null {
  const cookieToken = req.cookies?.itinbee_session;
  const headerToken = req.headers.authorization;

  const cookieClaims = cookieToken ? verifyAuthToken(cookieToken, secret) : null;
  const bearerClaims = headerToken ? verifyAuthToken(headerToken, secret) : null;

  if (cookieClaims && !cookieClaims.guest) {
    if (!bearerClaims || bearerClaims.guest) {
      return cookieClaims;
    }
  }

  if (bearerClaims && !bearerClaims.guest) {
    return bearerClaims;
  }

  return cookieClaims ?? bearerClaims ?? null;
}

/**
 * Extracts any active guest session claims (from either Bearer header or session cookie)
 * so sign-in flows (`/magic/verify`, `/google/verify`, `/otp/verify`) reliably merge guest trips.
 */
export function extractGuestClaimsForMerge(
  req: FastifyRequest,
  secret: string = env.JWT_SECRET
): AuthTokenClaims | null {
  const headerToken = req.headers.authorization;
  const cookieToken = req.cookies?.itinbee_session;

  const bearerClaims = headerToken ? verifyAuthToken(headerToken, secret) : null;
  if (bearerClaims?.guest) return bearerClaims;

  const cookieClaims = cookieToken ? verifyAuthToken(cookieToken, secret) : null;
  if (cookieClaims?.guest) return cookieClaims;

  return bearerClaims ?? cookieClaims ?? null;
}
