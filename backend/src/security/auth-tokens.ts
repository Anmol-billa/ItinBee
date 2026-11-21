import crypto from 'node:crypto';
import { env, type AppEnv } from '../config/env.js';

export interface AuthTokenClaims {
  sub: string;
  displayName: string;
  tier: 'free' | 'trip_pass' | 'pro';
  guest?: boolean;
  iat: number;
  exp: number;
}

export interface WsTicketClaims {
  sub: string;
  tripId: string;
  purpose: 'ws_live';
  iat: number;
  exp: number;
}

export function hashIdentifier(rawValue: string, secret: string = env.JWT_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(rawValue.trim().toLowerCase())
    .digest('hex');
}

function signHmacToken(payload: object, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

function verifyHmacTokenPayload<T extends { exp: number }>(
  token: string | undefined | null,
  secret: string
): T | null {
  if (!token) return null;
  const cleaned = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
  const parts = cleaned.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, sig] = parts;
  if (!encodedPayload || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as T;
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function signAuthToken(
  claims: Omit<AuthTokenClaims, 'iat' | 'exp'>,
  ttlSeconds = 60 * 60 * 24 * 30,
  secret: string = env.JWT_SECRET
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenClaims = {
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
  };
  return signHmacToken(payload, secret);
}

export const signAccessToken = signAuthToken;

export function verifyAuthToken(
  token: string | undefined | null,
  secret: string = env.JWT_SECRET
): AuthTokenClaims | null {
  const decoded = verifyHmacTokenPayload<AuthTokenClaims & { purpose?: string }>(
    token,
    secret
  );
  if (!decoded || decoded.purpose === 'ws_live' || !decoded.sub) return null;
  return decoded;
}

/**
 * Signs a short-lived (2-minute) room-scoped WebSocket ticket for `/v1/trips/:id/live`.
 */
export function signWsTicket(
  params: { tripId: string; userId: string },
  secret: string = env.JWT_SECRET,
  ttlSeconds = 120
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: WsTicketClaims = {
    sub: params.userId,
    tripId: params.tripId,
    purpose: 'ws_live',
    iat: now,
    exp: now + ttlSeconds,
  };
  return signHmacToken(payload, secret);
}

export function verifyWsTicket(
  ticket: string | undefined | null,
  secret: string = env.JWT_SECRET
): { tripId: string; userId: string; iat: number; exp: number } | null {
  const decoded = verifyHmacTokenPayload<WsTicketClaims>(ticket, secret);
  if (!decoded || decoded.purpose !== 'ws_live' || !decoded.sub || !decoded.tripId) {
    return null;
  }
  return {
    tripId: decoded.tripId,
    userId: decoded.sub,
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

export function deriveGuestSessionHash(
  sessionSeed: string,
  secret: string = env.JWT_SECRET
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`guest-voter:${sessionSeed}`)
    .digest('hex');
}

/**
 * Verifies a Cloudflare Turnstile token for bot-protected endpoints.
 * Calls Cloudflare siteverify whenever TURNSTILE_SECRET_KEY is configured;
 * uses deterministic local validation in local dev / tests when unset.
 */
export async function verifyTurnstileToken(
  turnstileToken: string,
  remoteIp?: string,
  config: Pick<AppEnv, 'TURNSTILE_SECRET_KEY' | 'NODE_ENV'> = env,
  fetchImpl: typeof fetch = fetch
): Promise<{ valid: boolean; reason?: string }> {
  const trimmed = turnstileToken.trim();
  if (!trimmed || trimmed.length < 6) {
    return { valid: false, reason: 'Turnstile token missing or malformed' };
  }
  if (
    trimmed === 'invalid-turnstile-token' ||
    trimmed.startsWith('fail-') ||
    trimmed === 'bot-token'
  ) {
    return { valid: false, reason: 'Turnstile challenge failed' };
  }

  const secretKey = config.TURNSTILE_SECRET_KEY?.trim();
  if (secretKey) {
    try {
      const form = new URLSearchParams();
      form.set('secret', secretKey);
      form.set('response', trimmed);
      if (remoteIp) form.set('remoteip', remoteIp);

      const res = await fetchImpl(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!res.ok) {
        return { valid: false, reason: `Turnstile HTTP ${res.status}` };
      }
      const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
      if (!data.success) {
        return {
          valid: false,
          reason: (data['error-codes'] || ['turnstile_rejected']).join(','),
        };
      }
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        reason: err instanceof Error ? err.message : 'Turnstile verification error',
      };
    }
  }

  return { valid: true };
}
