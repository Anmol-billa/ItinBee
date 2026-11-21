import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env, type AppEnv } from '../config/env.js';
import { hashIdentifier, signAuthToken } from '../security/auth-tokens.js';
import type { TripStore } from '../store/repository.js';
import type { PlacesServices } from '../modules/places/places-module.js';
import {
  AssistProposalSchema,
  proposeTripAssist,
} from '../modules/import/assist.js';
import { TripIntentSchema, type TripIntent } from '../modules/import/intent.js';
import {
  ImportNotFoundError,
  ImportQuotaError,
  ImportValidationError,
  type ImportJobService,
  type JobEvent,
} from '../modules/import/jobs.js';
import type { LlmProvider } from '../modules/import/llm/types.js';
import { extractAuthClaims } from './auth-helper.js';

export interface ImportRoutesOpts {
  jobs: ImportJobService;
  store: TripStore;
  places: PlacesServices;
  llm: LlmProvider;
  config?: AppEnv;
  heartbeatMs?: number;
}

const JobStateResponseSchema = z.object({
  id: z.string(),
  status: z.enum([
    'queued',
    'understanding',
    'needs_review',
    'building',
    'done',
    'failed',
  ]),
  mode: z.enum(['ai', 'basic']),
  intent: TripIntentSchema.optional(),
  tripId: z.string().optional(),
  shortId: z.string().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Normalizes minor client-side edits to `intent.bookings` before validating against `TripIntentSchema`. */
function coerceIncomingConfirmIntent(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  if (Array.isArray(obj.bookings)) {
    obj.bookings = obj.bookings.map((b: unknown) => {
      if (!b || typeof b !== 'object') return b;
      const rec = { ...(b as Record<string, unknown>) };
      if (rec.itemKind === 'transport') rec.itemKind = 'transit';
      if (typeof rec.summary === 'string') {
        rec.summary = { headline: rec.summary };
      }
      if (typeof rec.provider === 'string') {
        const lower = rec.provider.toLowerCase();
        const valid = new Set([
          'irctc', 'indigo', 'air_india', 'akasa', 'spicejet',
          'redbus', 'abhibus', 'mmt', 'goibibo', 'airbnb', 'zostel', 'homestay', 'manual',
        ]);
        if (!valid.has(lower)) rec.provider = 'manual';
      }
      return rec;
    });
  }
  return obj;
}

const ConfirmIntentBodySchema = z.object({
  intent: z.preprocess(coerceIncomingConfirmIntent, TripIntentSchema),
  answers: z.record(z.string(), z.string()).optional(),
});

function formatSseFrame(event: JobEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

export const importRoutes: FastifyPluginAsyncZod<ImportRoutesOpts> = async (
  app,
  opts
) => {
  const cfg = opts.config ?? env;
  const isProd = cfg.NODE_ENV === 'production';
  const heartbeatMs = opts.heartbeatMs ?? 15_000;

  async function ensureCallerSession(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ ownerId: string; isGuest: boolean }> {
    const claims = extractAuthClaims(req);
    if (claims) {
      const existing = await opts.store.getUserById(claims.sub);
      if (existing) {
        const isGuest =
          Boolean(claims.guest) || (await opts.store.isGuestUser(existing.id));
        return { ownerId: existing.id, isGuest };
      }
    }

    const guest = await opts.store.createGuestUser('Traveller');
    const token = signAuthToken({
      sub: guest.id,
      displayName: guest.displayName,
      tier: guest.tier,
      guest: true,
    });
    reply.setCookie('itinbee_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ownerId: guest.id, isGuest: true };
  }

  // ---------------------------------------------------------------- Create Import Job
  app.post(
    '/v1/import/jobs',
    {
      schema: {
        tags: ['Import'],
        summary:
          'Start an asynchronous Smart Import job from messy text, WhatsApp chats, URLs, or ticket PDFs/screenshots',
        body: z.object({
          text: z.string().optional(),
          urls: z.array(z.string()).optional(),
          files: z
            .array(
              z.object({
                name: z.string().min(1).max(200),
                mimeType: z.string().min(1).max(120),
                dataBase64: z.string(),
              })
            )
            .optional(),
          locale: z.enum(['en', 'hi']).optional(),
          baseTripSlug: z.string().max(100).optional(),
        }),
        response: {
          202: z.object({
            jobId: z.string().uuid(),
            status: z.literal('queued'),
            eventsUrl: z.string(),
          }),
          400: z.object({
            code: z.string(),
            error: z.string(),
            message: z.string(),
          }),
          429: z.object({
            code: z.literal('quota_exceeded'),
            error: z.literal('quota_exceeded'),
            message: z.string(),
            resetAt: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      try {
        // Validate input before creating guest user / consuming quota
        opts.jobs.validateImportInput(req.body);

        const { ownerId, isGuest } = await ensureCallerSession(req, reply);
        const ipHash = hashIdentifier(`ip:${req.ip || '127.0.0.1'}`);

        const created = await opts.jobs.createJob({
          input: req.body,
          ownerId,
          isGuest,
          ipHash,
        });
        return reply.code(202).send(created);
      } catch (err) {
        if (err instanceof ImportValidationError) {
          return reply.code(400).send({
            code: err.code,
            error: err.code,
            message: err.message,
          });
        }
        if (err instanceof ImportQuotaError) {
          return reply.code(429).send({
            code: 'quota_exceeded',
            error: 'quota_exceeded',
            message: err.message,
            resetAt: err.resetAt,
          });
        }
        throw err;
      }
    }
  );

  // ---------------------------------------------------------------- Get Job State
  app.get(
    '/v1/import/jobs/:id',
    {
      schema: {
        tags: ['Import'],
        summary: 'Poll current Smart Import job state (fallback for environments without SSE)',
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: JobStateResponseSchema,
          404: z.object({ code: z.string(), error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const state = await opts.jobs.getJobState(req.params.id);
      if (!state) {
        return reply.code(404).send({
          code: 'not_found',
          error: 'not_found',
          message: 'Import job not found',
        });
      }
      return state;
    }
  );

  // ---------------------------------------------------------------- SSE Event Stream
  app.get(
    '/v1/import/jobs/:id/events',
    {
      schema: {
        tags: ['Import'],
        summary:
          'Server-Sent Events (text/event-stream) for Smart Import: replays full job history on connect, then streams live events with 15s heartbeats',
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (req, reply) => {
      let closed = false;
      const bufferedLive: JobEvent[] = [];
      let flushingHistory = true;

      const writeFrame = (chunk: string): void => {
        if (closed || reply.raw.writableEnded) return;
        reply.raw.write(chunk);
      };

      const finishStream = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeatTimer);
        sub?.unsubscribe();
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      };

      const isTerminalEvent = (e: JobEvent): boolean =>
        e.type === 'done' || e.type === 'error';

      const sub = await opts.jobs.subscribeEvents(req.params.id, (liveEvt) => {
        if (closed) return;
        if (flushingHistory) {
          bufferedLive.push(liveEvt);
          return;
        }
        writeFrame(formatSseFrame(liveEvt));
        if (isTerminalEvent(liveEvt)) {
          finishStream();
        }
      });

      if (!sub) {
        return reply.code(404).send({
          code: 'not_found',
          error: 'not_found',
          message: 'Import job not found',
        });
      }

      reply.hijack();
      const originHeader = req.headers.origin;
      const corsHeaders: Record<string, string> = originHeader
        ? {
            'Access-Control-Allow-Origin': originHeader,
            'Access-Control-Allow-Credentials': 'true',
            Vary: 'Origin',
          }
        : {};

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...corsHeaders,
      });

      const heartbeatTimer = setInterval(() => {
        writeFrame(': heartbeat\n\n');
      }, heartbeatMs);
      heartbeatTimer.unref?.();

      req.raw.on('close', () => {
        finishStream();
      });

      // Replay history
      let hitTerminal = false;
      for (const pastEvt of sub.history) {
        writeFrame(formatSseFrame(pastEvt));
        if (isTerminalEvent(pastEvt)) {
          hitTerminal = true;
        }
      }

      flushingHistory = false;
      for (const liveEvt of bufferedLive) {
        writeFrame(formatSseFrame(liveEvt));
        if (isTerminalEvent(liveEvt)) {
          hitTerminal = true;
        }
      }

      if (hitTerminal) {
        finishStream();
      }
      return reply;
    }
  );

  // ---------------------------------------------------------------- Confirm & Build Stage B
  app.post(
    '/v1/import/jobs/:id/confirm',
    {
      schema: {
        tags: ['Import'],
        summary:
          'Confirm (and optionally edit) extracted TripIntent + clarifying answers to build the grounded day-by-day itinerary (idempotent)',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: ConfirmIntentBodySchema,
        response: {
          202: z.object({
            status: z.literal('building'),
          }),
          404: z.object({
            code: z.string(),
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      try {
        const { ownerId } = await ensureCallerSession(req, reply);
        const res = await opts.jobs.confirmJob({
          jobId: req.params.id,
          intent: req.body.intent as TripIntent,
          answers: req.body.answers,
          callerOwnerId: ownerId,
        });
        return reply.code(202).send(res);
      } catch (err) {
        if (err instanceof ImportNotFoundError) {
          return reply.code(404).send({
            code: 'not_found',
            error: 'not_found',
            message: err.message,
          });
        }
        throw err;
      }
    }
  );

  // ---------------------------------------------------------------- Ask Itinbee Assist
  app.post(
    '/v1/trips/:id/assist',
    {
      schema: {
        tags: ['Import', 'Trips'],
        summary:
          'Ask Itinbee read-only assistant: proposes grounded add/move/remove/update operations without mutating the trip directly',
        params: z.object({
          id: z.string().uuid(),
        }),
        body: z.object({
          instruction: z.string().trim().min(2).max(600),
          dayId: z.string().uuid().optional(),
        }),
        response: {
          200: z.object({
            mode: z.enum(['ai', 'basic']),
            proposal: AssistProposalSchema,
          }),
          404: z.object({ error: z.string() }),
          429: z.object({
            code: z.literal('quota_exceeded'),
            error: z.literal('quota_exceeded'),
            message: z.string(),
            resetAt: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      const claims = extractAuthClaims(req);
      const ws = await opts.store.getTripWorkspace(
        req.params.id,
        claims?.sub ?? null
      );
      if (!ws) {
        return reply.code(404).send({ error: 'Trip not found' });
      }

      try {
        const quotaSubject =
          claims?.sub ?? hashIdentifier(`ip:${req.ip || '127.0.0.1'}`);
        await opts.jobs.consumeAssistQuota(quotaSubject);
      } catch (err) {
        if (err instanceof ImportQuotaError) {
          return reply.code(429).send({
            code: 'quota_exceeded',
            error: 'quota_exceeded',
            message: err.message,
            resetAt: err.resetAt,
          });
        }
        throw err;
      }

      const result = await proposeTripAssist({
        ws,
        instruction: req.body.instruction,
        dayId: req.body.dayId,
        llm: opts.llm,
        places: opts.places,
      });

      return result;
    }
  );
};
