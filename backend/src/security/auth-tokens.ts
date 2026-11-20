import crypto from 'node:crypto';
import { env } from '../config/env.js';

export interface AuthTokenClaims {
  sub: string;
  displayName: string;
  tier: 'free' | 'trip_pass' | 'pro';
  iat: number;
  exp: number;
}

export function hashIdentifier(rawValue: string): string {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(rawValue.trim().toLowerCase())
    .digest('hex');
}

export function signAuthToken(
  claims: Omit<AuthTokenClaims, 'iat' | 'exp'>,
  ttlSeconds = 60 * 60 * 24 * 30
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenClaims = {
    ...claims,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const sig = crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${sig}`;
}

export function verifyAuthToken(token: string | undefined | null): AuthTokenClaims | null {
  if (!token) return null;
  const cleaned = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
  const parts = cleaned.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, sig] = parts;
  if (!encodedPayload || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', env.JWT_SECRET)
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
    ) as AuthTokenClaims;
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function deriveGuestSessionHash(sessionSeed: string): string {
  return crypto
    .createHmac('sha256', env.JWT_SECRET)
    .update(`guest-voter:${sessionSeed}`)
    .digest('hex');
}

/**
 * Verifies a Cloudflare Turnstile token for zero-OTP guest poll voting.
 * Calls Cloudflare siteverify when TURNSTILE_SECRET_KEY is configured in production;
 * uses deterministic local validation in local dev / tests.
 */
export async function verifyTurnstileToken(
  turnstileToken: string,
  remoteIp?: string
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

  if (env.TURNSTILE_SECRET_KEY && env.NODE_ENV === 'production') {
    try {
      const form = new URLSearchParams();
      form.set('secret', env.TURNSTILE_SECRET_KEY);
      form.set('response', trimmed);
      if (remoteIp) form.set('remoteip', remoteIp);

      const res = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          body: form,
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
