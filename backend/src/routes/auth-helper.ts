import type { FastifyRequest } from 'fastify';
import {
  verifyAuthToken,
  type AuthTokenClaims,
} from '../security/auth-tokens.js';

export function extractAuthClaims(req: FastifyRequest): AuthTokenClaims | null {
  const headerToken = req.headers.authorization;
  if (headerToken) {
    const claims = verifyAuthToken(headerToken);
    if (claims) return claims;
  }
  const cookieToken = req.cookies?.itinbee_session;
  if (cookieToken) {
    return verifyAuthToken(cookieToken);
  }
  return null;
}
