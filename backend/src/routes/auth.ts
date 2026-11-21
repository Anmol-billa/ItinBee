import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env, type AppEnv } from '../config/env.js';
import {
  signAuthToken,
  verifyTurnstileToken,
} from '../security/auth-tokens.js';
import {
  issueSessionCookie,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from '../security/permissions.js';
import {
  isEmailConfigured,
  resolvePublicFrontendUrl,
  sendMagicLinkEmail,
} from '../modules/email/mailer.js';
import {
  TripMetaSchema,
  UserPublicSchema,
  UserSelfSchema,
} from '../types/domain.js';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';
import {
  extractAuthClaims,
  extractGuestClaimsForMerge,
} from './auth-helper.js';

export interface AuthPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
  config?: AppEnv;
  fetchImpl?: typeof fetch;
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

async function detectGuestUserId(
  req: FastifyRequest,
  store: TripStore,
  secret: string
): Promise<string | null> {
  const claims = extractGuestClaimsForMerge(req, secret);
  if (!claims) return null;
  if (claims.guest) return claims.sub;
  const isGuest = await store.isGuestUser(claims.sub);
  return isGuest ? claims.sub : null;
}

interface GoogleTokenInfo {
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  aud?: string;
  exp?: string;
}

const ErrorBodySchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export const authRoutes: FastifyPluginAsyncZod<AuthPluginOpts> = async (
  app,
  opts
) => {
  const cfg = opts.config ?? env;
  const fetchFn = opts.fetchImpl ?? fetch;
  const isProd = cfg.NODE_ENV === 'production';

  // ---------------------------------------------------------------- Guest Auth
  app.post(
    '/v1/auth/guest',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Create or reuse an anonymous guest session (idempotent per cookie/bearer token)',
        response: {
          200: z.object({
            token: z.string(),
            user: UserPublicSchema,
            guest: z.boolean(),
          }),
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req, cfg.JWT_SECRET);
      if (claims) {
        const existing = await opts.store.getUserById(claims.sub);
        if (existing) {
          const isGuest =
            Boolean(claims.guest) || (await opts.store.isGuestUser(existing.id));
          const token = signAuthToken(
            {
              sub: existing.id,
              displayName: existing.displayName,
              tier: existing.tier,
              guest: isGuest,
            },
            SESSION_COOKIE_MAX_AGE_SECONDS,
            cfg.JWT_SECRET
          );
          issueSessionCookie(reply, token, cfg);
          return { token, user: existing, guest: isGuest };
        }
      }

      const guestUser = await opts.store.createGuestUser('Traveller');
      const token = signAuthToken(
        {
          sub: guestUser.id,
          displayName: guestUser.displayName,
          tier: guestUser.tier,
          guest: true,
        },
        SESSION_COOKIE_MAX_AGE_SECONDS,
        cfg.JWT_SECRET
      );
      issueSessionCookie(reply, token, cfg);
      return { token, user: guestUser, guest: true };
    }
  );

  // ---------------------------------------------------------------- Magic Link Auth
  app.post(
    '/v1/auth/magic/request',
    {
      schema: {
        tags: ['Auth'],
        summary:
          'Request an email magic code / sign-in link (Resend or SMTP in prod; includes dev preview in non-prod)',
        body: z.object({
          email: z.string().trim().email().max(160),
          redirectPath: z.string().max(240).optional(),
          turnstileToken: z.string().max(2048).optional(),
        }),
        response: {
          200: z.object({
            sent: z.boolean(),
            expiresInSeconds: z.number().int(),
            devMagicCode: z.string().optional(),
            devVerifyUrl: z.string().optional(),
          }),
          403: ErrorBodySchema,
          429: ErrorBodySchema,
          502: ErrorBodySchema,
          503: ErrorBodySchema,
        },
      },
    },
    async (req, reply) => {
      const normalizedEmail = req.body.email.trim().toLowerCase();

      if (cfg.TURNSTILE_SECRET_KEY?.trim()) {
        const turnstile = await verifyTurnstileToken(
          req.body.turnstileToken ?? '',
          req.ip,
          cfg,
          fetchFn
        );
        if (!turnstile.valid) {
          return reply.code(403).send({
            error: 'turnstile_failed',
            message: turnstile.reason ?? 'Bot verification failed',
          });
        }
      }

      const [ipLimit, emailLimit] = await Promise.all([
        opts.bus.consumeSlidingWindow(
          `magic-req:ip:${req.ip || 'unknown'}`,
          8,
          TEN_MINUTES_MS
        ),
        opts.bus.consumeSlidingWindow(
          `magic-req:email:${normalizedEmail}`,
          5,
          TEN_MINUTES_MS
        ),
      ]);
      if (!ipLimit.allowed || !emailLimit.allowed) {
        return reply.code(429).send({
          error: 'rate_limited',
          message: 'Too many sign-in code requests. Please wait a few minutes.',
        });
      }

      if (isProd && !isEmailConfigured(cfg)) {
        return reply.code(503).send({
          error: 'email_unconfigured',
          message:
            'Email sign-in is not configured yet. Configure SMTP or Resend credentials.',
        });
      }

      const code = String(crypto.randomInt(100000, 999999));
      const ttlSeconds = 600;
      await opts.bus.storeOtpCode(`magic:${normalizedEmail}`, code, ttlSeconds);

      const safeRedirect =
        req.body.redirectPath && req.body.redirectPath.startsWith('/')
          ? req.body.redirectPath
          : undefined;
      const baseUrl = resolvePublicFrontendUrl(cfg);
      const params = new URLSearchParams({
        email: normalizedEmail,
        code,
        ...(safeRedirect ? { next: safeRedirect } : {}),
      });
      const verifyUrl = `${baseUrl}/login?${params.toString()}`;

      const delivery = await sendMagicLinkEmail({
        to: normalizedEmail,
        code,
        verifyUrl,
        config: cfg,
        fetchImpl: fetchFn,
      });

      if (!delivery.sent) {
        if (delivery.errorCode === 'email_unconfigured') {
          return reply.code(503).send({
            error: 'email_unconfigured',
            message:
              delivery.message ??
              'Email sign-in is not configured yet. Configure SMTP or Resend credentials.',
          });
        }
        return reply.code(502).send({
          error: 'Could not send sign-in email',
          message: delivery.message,
        });
      }

      return {
        sent: true,
        expiresInSeconds: ttlSeconds,
        ...(!isProd ? { devMagicCode: code, devVerifyUrl: verifyUrl } : {}),
      };
    }
  );

  app.post(
    '/v1/auth/magic/verify',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify email magic code, sign in, and automatically merge any active guest trips',
        body: z.object({
          email: z.string().trim().email().max(160),
          code: z.string().trim().min(4).max(64),
          displayName: z.string().min(1).max(80).optional(),
        }),
        response: {
          200: z.object({
            token: z.string(),
            user: UserPublicSchema,
            mergedTripsCount: z.number().int().nonnegative(),
          }),
          401: ErrorBodySchema,
          429: ErrorBodySchema,
        },
      },
    },
    async (req, reply) => {
      const normalizedEmail = req.body.email.trim().toLowerCase();
      const attemptLimit = await opts.bus.consumeSlidingWindow(
        `magic-verify:email:${normalizedEmail}`,
        10,
        TEN_MINUTES_MS
      );
      if (!attemptLimit.allowed) {
        await opts.bus.deleteOtpCode(`magic:${normalizedEmail}`);
        return reply.code(429).send({
          error: 'rate_limited',
          message:
            'Too many verification attempts. Your code has been locked—request a new code.',
        });
      }

      const valid = await opts.bus.verifyAndConsumeOtpCode(
        `magic:${normalizedEmail}`,
        req.body.code.trim()
      );
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid or expired sign-in code' });
      }

      const guestUserId = await detectGuestUserId(req, opts.store, cfg.JWT_SECRET);
      const user = await opts.store.upsertUserByEmail({
        email: normalizedEmail,
        displayName: req.body.displayName,
      });

      const mergedTripsCount =
        guestUserId && guestUserId !== user.id
          ? await opts.store.mergeGuestIntoUser(guestUserId, user.id)
          : 0;

      const token = signAuthToken(
        {
          sub: user.id,
          displayName: user.displayName,
          tier: user.tier,
          guest: false,
        },
        SESSION_COOKIE_MAX_AGE_SECONDS,
        cfg.JWT_SECRET
      );
      issueSessionCookie(reply, token, cfg);

      return { token, user, mergedTripsCount };
    }
  );

  // ---------------------------------------------------------------- Google OIDC Verify + Merge
  app.post(
    '/v1/auth/google/verify',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify Google ID token (or devEmail in local dev when GOOGLE_CLIENT_ID is unset) and merge guest trips',
        body: z.object({
          idToken: z.string().min(10).optional(),
          devEmail: z.string().trim().email().max(160).optional(),
          devName: z.string().trim().min(1).max(80).optional(),
        }),
        response: {
          200: z.object({
            token: z.string(),
            user: UserPublicSchema,
            mergedTripsCount: z.number().int().nonnegative(),
          }),
          401: ErrorBodySchema,
          503: ErrorBodySchema,
        },
      },
    },
    async (req, reply) => {
      const configuredClientId = cfg.GOOGLE_CLIENT_ID?.trim();
      if (isProd && !configuredClientId) {
        return reply.code(503).send({
          error: 'google_auth_unconfigured',
          message: 'Google Sign-In is not configured on this server.',
        });
      }

      let googleSub: string;
      let email: string;
      let displayName: string;

      if (req.body.idToken) {
        let info: GoogleTokenInfo;
        try {
          const res = await fetchFn(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(req.body.idToken)}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) {
            return reply.code(401).send({ error: 'Invalid Google ID token' });
          }
          info = (await res.json()) as GoogleTokenInfo;
        } catch {
          return reply.code(401).send({ error: 'Could not verify Google ID token' });
        }

        const verified =
          info.email_verified === true || info.email_verified === 'true';
        if (!info.sub || !info.email || !verified) {
          return reply.code(401).send({ error: 'Unverified Google account' });
        }
        if (configuredClientId && info.aud !== configuredClientId) {
          return reply.code(401).send({ error: 'Google token audience mismatch' });
        }
        if (info.exp && Number(info.exp) * 1000 < Date.now()) {
          return reply.code(401).send({ error: 'Google ID token expired' });
        }
        googleSub = info.sub;
        email = info.email.trim().toLowerCase();
        displayName =
          info.name?.trim() ||
          email.split('@')[0] ||
          'Traveller';
      } else if (!isProd && !configuredClientId && req.body.devEmail) {
        email = req.body.devEmail.trim().toLowerCase();
        googleSub = `dev-google:${email}`;
        displayName =
          req.body.devName?.trim() ||
          email
            .split('@')[0]!
            .replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()) ||
          'Traveller';
      } else {
        return reply.code(401).send({ error: 'Google ID token is required' });
      }

      const guestUserId = await detectGuestUserId(req, opts.store, cfg.JWT_SECRET);
      const user = await opts.store.upsertUserByGoogle({
        googleSub,
        email,
        displayName,
      });

      const mergedTripsCount =
        guestUserId && guestUserId !== user.id
          ? await opts.store.mergeGuestIntoUser(guestUserId, user.id)
          : 0;

      const token = signAuthToken(
        {
          sub: user.id,
          displayName: user.displayName,
          tier: user.tier,
          guest: false,
        },
        SESSION_COOKIE_MAX_AGE_SECONDS,
        cfg.JWT_SECRET
      );
      issueSessionCookie(reply, token, cfg);

      return { token, user, mergedTripsCount };
    }
  );

  // ---------------------------------------------------------------- Session & Profile
  app.get(
    '/v1/auth/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Current session status (unauthenticated, guest, or signed-in user with owner UPI VPA)',
        response: {
          200: z.object({
            authenticated: z.boolean(),
            guest: z.boolean(),
            user: UserSelfSchema.nullable(),
          }),
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req, cfg.JWT_SECRET);
      if (!claims) {
        return { authenticated: false, guest: false, user: null };
      }
      const user = await opts.store.getUserSelfById(claims.sub);
      if (!user) {
        reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
        return { authenticated: false, guest: false, user: null };
      }
      const isGuest =
        Boolean(claims.guest) || (await opts.store.isGuestUser(user.id));
      return {
        authenticated: true,
        guest: isGuest,
        user,
      };
    }
  );

  app.patch(
    '/v1/auth/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Update user profile (display name, preferred language, UPI VPA)',
        body: z.object({
          displayName: z.string().trim().min(1).max(80).optional(),
          preferredLang: z.enum(['en', 'hi']).optional(),
          upiVpa: z.string().trim().max(100).nullable().optional(),
        }),
        response: {
          200: z.object({ user: UserSelfSchema }),
          401: ErrorBodySchema,
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req, cfg.JWT_SECRET);
      if (!claims) {
        return reply.code(401).send({ error: 'Authentication required' });
      }
      const updated = await opts.store.updateUserProfile(claims.sub, req.body);
      if (!updated) {
        return reply.code(401).send({ error: 'User not found' });
      }
      const isGuest =
        Boolean(claims.guest) || (await opts.store.isGuestUser(updated.id));
      const token = signAuthToken(
        {
          sub: updated.id,
          displayName: updated.displayName,
          tier: updated.tier,
          guest: isGuest,
        },
        SESSION_COOKIE_MAX_AGE_SECONDS,
        cfg.JWT_SECRET
      );
      issueSessionCookie(reply, token, cfg);
      return { user: updated };
    }
  );

  app.post(
    '/v1/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Clear session cookie, instruct browser to clear site storage, and sign out',
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (_req, reply) => {
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      reply.header('Clear-Site-Data', '"cookies", "storage"');
      return { ok: true };
    }
  );

  app.get(
    '/v1/me/trips',
    {
      schema: {
        tags: ['Trips', 'Auth'],
        summary: 'List only trips owned or joined by the current caller (excludes uncloned sample templates)',
        response: {
          200: z.object({ trips: z.array(TripMetaSchema) }),
          401: ErrorBodySchema,
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req, cfg.JWT_SECRET);
      if (!claims) {
        return reply.code(401).send({ error: 'Authentication required' });
      }
      const trips = await opts.store.listUserTrips(claims.sub);
      return { trips };
    }
  );

  // ---------------------------------------------------------------- Phone OTP (Rate-limited)
  app.post(
    '/v1/auth/otp/request',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Request a 6-digit phone OTP when claiming sandbox or syncing across devices',
        body: z.object({
          phone: z.string().min(8).max(20),
          channel: z.enum(['whatsapp', 'sms']).default('whatsapp'),
          turnstileToken: z.string().max(2048).optional(),
        }),
        response: {
          200: z.object({
            sent: z.boolean(),
            expiresInSeconds: z.number().int(),
            devOtpPreview: z.string().optional(),
          }),
          403: ErrorBodySchema,
          429: ErrorBodySchema,
        },
      },
    },
    async (req, reply) => {
      if (cfg.TURNSTILE_SECRET_KEY?.trim()) {
        const turnstile = await verifyTurnstileToken(
          req.body.turnstileToken ?? '',
          req.ip,
          cfg,
          fetchFn
        );
        if (!turnstile.valid) {
          return reply.code(403).send({
            error: 'turnstile_failed',
            message: turnstile.reason ?? 'Bot verification failed',
          });
        }
      }

      const phoneNorm = req.body.phone.trim();
      const [ipLimit, phoneLimit] = await Promise.all([
        opts.bus.consumeSlidingWindow(
          `otp-req:ip:${req.ip || 'unknown'}`,
          8,
          TEN_MINUTES_MS
        ),
        opts.bus.consumeSlidingWindow(
          `otp-req:phone:${phoneNorm}`,
          5,
          TEN_MINUTES_MS
        ),
      ]);
      if (!ipLimit.allowed || !phoneLimit.allowed) {
        return reply.code(429).send({
          error: 'rate_limited',
          message: 'Too many OTP requests. Please wait a few minutes.',
        });
      }

      const otp = isProd
        ? String(crypto.randomInt(100000, 999999))
        : '424242';
      await opts.bus.storeOtpCode(phoneNorm, otp, 300);

      return {
        sent: true,
        expiresInSeconds: 300,
        ...(!isProd ? { devOtpPreview: otp } : {}),
      };
    }
  );

  app.post(
    '/v1/auth/otp/verify',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify phone OTP and issue bearer/cookie session token',
        body: z.object({
          phone: z.string().min(8).max(20),
          otp: z.string().length(6),
          displayName: z.string().min(1).max(80).optional(),
          upiVpa: z.string().max(100).optional(),
        }),
        response: {
          200: z.object({
            token: z.string(),
            user: UserPublicSchema,
          }),
          401: ErrorBodySchema,
          429: ErrorBodySchema,
        },
      },
    },
    async (req, reply) => {
      const { phone, otp, displayName, upiVpa } = req.body;
      const phoneNorm = phone.trim();
      const attemptLimit = await opts.bus.consumeSlidingWindow(
        `otp-verify:phone:${phoneNorm}`,
        10,
        TEN_MINUTES_MS
      );
      if (!attemptLimit.allowed) {
        await opts.bus.deleteOtpCode(phoneNorm);
        return reply.code(429).send({
          error: 'rate_limited',
          message: 'Too many OTP verification attempts. Request a new OTP.',
        });
      }

      const valid = await opts.bus.verifyAndConsumeOtpCode(phoneNorm, otp);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid or expired OTP code' });
      }

      const guestUserId = await detectGuestUserId(req, opts.store, cfg.JWT_SECRET);
      const user = await opts.store.upsertUserByPhone(phoneNorm, displayName, upiVpa);
      if (guestUserId && guestUserId !== user.id) {
        await opts.store.mergeGuestIntoUser(guestUserId, user.id);
      }

      const token = signAuthToken(
        {
          sub: user.id,
          displayName: user.displayName,
          tier: user.tier,
          guest: false,
        },
        SESSION_COOKIE_MAX_AGE_SECONDS,
        cfg.JWT_SECRET
      );

      issueSessionCookie(reply, token, cfg);
      return { token, user };
    }
  );

  // ---------------------------------------------------------------- Legacy Unverified Google Endpoint (Removed -> 410 Gone)
  app.post(
    '/v1/auth/google',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Removed legacy endpoint — use POST /v1/auth/google/verify with OIDC idToken',
        body: z.record(z.string(), z.unknown()).optional(),
        response: {
          410: ErrorBodySchema,
        },
      },
    },
    async (_req, reply) => {
      return reply.code(410).send({
        error: 'gone',
        message:
          'POST /v1/auth/google has been retired. Use POST /v1/auth/google/verify with a verified Google OIDC ID token.',
      });
    }
  );

  app.delete(
    '/v1/users/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'DPDPA 2023 self-service erasure of user account & encrypted PII',
        response: {
          200: z.object({ deleted: z.boolean() }),
          401: ErrorBodySchema,
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req, cfg.JWT_SECRET);
      if (!claims) {
        return reply.code(401).send({ error: 'Authentication required' });
      }
      const deleted = await opts.store.deleteUser(claims.sub);
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      reply.header('Clear-Site-Data', '"cookies", "storage"');
      return { deleted };
    }
  );
};
