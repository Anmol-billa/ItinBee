import crypto from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../config/env.js';
import { signAuthToken } from '../security/auth-tokens.js';
import { UserPublicSchema } from '../types/domain.js';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';
import { extractAuthClaims } from './auth-helper.js';

export interface AuthPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
}

export const authRoutes: FastifyPluginAsyncZod<AuthPluginOpts> = async (
  app,
  opts
) => {
  app.post(
    '/v1/auth/otp/request',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Request a 6-digit phone OTP when claiming sandbox or syncing across devices',
        body: z.object({
          phone: z.string().min(8).max(20),
          channel: z.enum(['whatsapp', 'sms']).default('whatsapp'),
        }),
        response: {
          200: z.object({
            sent: z.boolean(),
            expiresInSeconds: z.number().int(),
            devOtpPreview: z.string().optional(),
          }),
        },
      },
    },
    async (req) => {
      const { phone } = req.body;
      const otp =
        env.NODE_ENV === 'production'
          ? String(crypto.randomInt(100000, 999999))
          : '424242';
      await opts.bus.storeOtpCode(phone, otp, 300);

      return {
        sent: true,
        expiresInSeconds: 300,
        ...(env.NODE_ENV !== 'production' ? { devOtpPreview: otp } : {}),
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
          401: z.object({
            error: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { phone, otp, displayName, upiVpa } = req.body;
      const valid = await opts.bus.verifyAndConsumeOtpCode(phone, otp);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid or expired OTP code' });
      }

      const user = await opts.store.upsertUserByPhone(phone, displayName, upiVpa);
      const token = signAuthToken({
        sub: user.id,
        displayName: user.displayName,
        tier: user.tier,
      });

      reply.setCookie('itinbee_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });

      return { token, user };
    }
  );

  app.post(
    '/v1/auth/google',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign in or claim workspace via Google One-Tap',
        body: z.object({
          idTokenOrSub: z.string().min(3),
          email: z.string().email(),
          displayName: z.string().min(1).max(80),
          upiVpa: z.string().max(100).optional(),
        }),
        response: {
          200: z.object({
            token: z.string(),
            user: UserPublicSchema,
          }),
        },
      },
    },
    async (req, reply) => {
      const user = await opts.store.upsertUserByGoogle({
        googleSub: req.body.idTokenOrSub,
        email: req.body.email,
        displayName: req.body.displayName,
        upiVpa: req.body.upiVpa,
      });

      const token = signAuthToken({
        sub: user.id,
        displayName: user.displayName,
        tier: user.tier,
      });

      reply.setCookie('itinbee_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });

      return { token, user };
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
          401: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req);
      if (!claims) {
        return reply.code(401).send({ error: 'Authentication required' });
      }
      const deleted = await opts.store.deleteUser(claims.sub);
      reply.clearCookie('itinbee_session', { path: '/' });
      return { deleted };
    }
  );
};
