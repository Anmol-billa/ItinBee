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
  ImportForbiddenError,
  ImportNotFoundError,
  ImportQuotaError,
  ImportUnauthorizedError,
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

const CodedErrorSchema = z.object({
  code: z.string(),
  error: z.string(),
  message: z.string(),
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

function normalizeOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '').toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isAllowedSseOrigin(
  originHeader: string | undefined,
  cfg: AppEnv
): boolean {
  const candidate = normalizeOrigin(originHeader);
  if (!candidate) return false;

  const allowed = new Set<string>();
  for (const item of cfg.corsOriginList) {
    const norm = normalizeOrigin(item);
    if (norm) allowed.add(norm);
  }
  const pubUrl = normalizeOrigin(cfg.APP_PUBLIC_URL);
  if (pubUrl) allowed.add(pubUrl);

  if (process.env.FRONTEND_HOST) {
    const host = process.env.FRONTEND_HOST.trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
    if (host) allowed.add(`https://${host}`);
  }

  if (cfg.NODE_ENV !== 'production') {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }

  return allowed.has(candidate);
}

const extractOptionalClaims = extractAuthClaims;

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
    const claims = extractOptionalClaims(req);
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
          400: CodedErrorSchema,
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
          401: CodedErrorSchema,
          403: CodedErrorSchema,
          404: CodedErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const claims = extractOptionalClaims(req);
      try {
        const state = await opts.jobs.getJobState(
          req.params.id,
          claims?.sub ?? null
        );
        if (!state) {
          return reply.code(404).send({
            code: 'not_found',
            error: 'not_found',
            message: 'Import job not found',
          });
        }
        return state;
      } catch (err) {
        if (err instanceof ImportUnauthorizedError) {
          return reply.code(401).send({
            code: err.code,
            error: err.code,
            message: err.message,
          });
        }
        if (err instanceof ImportForbiddenError) {
          return reply.code(403).send({
            code: err.code,
            error: err.code,
            message: err.message,
          });
        }
        throw err;
      }
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
      const claims = extractOptionalClaims(req);
      let closed = false;
      const bufferedLive: JobEvent[] = [];
      let flushingHistory = true;
      let heartbeatTimer: NodeJS.Timeout | undefined;
      let sub: Awaited<ReturnType<ImportJobService['subscribeEvents']>> = null;

      const writeFrame = (chunk: string): void => {
        if (closed || reply.raw.writableEnded) return;
        reply.raw.write(chunk);
      };

      const finishStream = (): void => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        sub?.unsubscribe();
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      };

      const isTerminalEvent = (e: JobEvent): boolean =>
        e.type === 'done' || e.type === 'error';

      try {
        sub = await opts.jobs.subscribeEvents(
          req.params.id,
          (liveEvt) => {
            if (closed) return;
            if (flushingHistory) {
              bufferedLive.push(liveEvt);
              return;
            }
            writeFrame(formatSseFrame(liveEvt));
            if (isTerminalEvent(liveEvt)) {
              finishStream();
            }
          },
          claims?.sub ?? null
        );
      } catch (err) {
        if (err instanceof ImportUnauthorizedError) {
          return reply.code(401).send({
            code: err.code,
            error: err.code,
            message: err.message,
          });
        }
        if (err instanceof ImportForbiddenError) {
          return reply.code(403).send({
            code: err.code,
            error: err.code,
            message: err.message,
          });
        }
        throw err;
      }

      if (!sub) {
        return reply.code(404).send({
          code: 'not_found',
          error: 'not_found',
          message: 'Import job not found',
        });
      }

      reply.hijack();
      const originHeader = req.headers.origin;
      const corsHeaders: Record<string, string> =
        originHeader && isAllowedSseOrigin(originHeader, cfg)
          ? {
              'Access-Control-Allow-Origin': originHeader,
              'Access-Control-Allow-Credentials': 'true',
              Vary: 'Origin',
            }
          : { Vary: 'Origin' };

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...corsHeaders,
      });

      heartbeatTimer = setInterval(() => {
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
          401: CodedErrorSchema,
          403: CodedErrorSchema,
          404: CodedErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const claims = extractOptionalClaims(req);
      try {
        const res = await opts.jobs.confirmJob({
          jobId: req.params.id,
          intent: req.body.intent as TripIntent,
          answers: req.body.answers,
          callerOwnerId: claims?.sub ?? null,
        });
        return reply.code(202).send(res);
      } catch (err) {
        if (err instanceof ImportUnauthorizedError) {
          return reply.code(401).send({
            code: err.code,
            error: err.code,
            message: err.message,
          });
        }
        if (err instanceof ImportForbiddenError) {
          return reply.code(403).send({
            code: err.code,
            error: err.code,
            message: err.message,
          });
        }
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
        body: z
          .object({
            instruction: z.string().trim().min(2).max(600).optional(),
            prompt: z.string().trim().min(2).max(600).optional(),
            dayId: z.string().uuid().optional(),
            dayNumber: z.coerce.number().int().min(1).max(60).optional(),
          })
          .refine((b) => Boolean(b.instruction || b.prompt), {
            message: 'Either instruction or prompt is required',
          }),
        response: {
          200: z.object({
            mode: z.enum(['ai', 'basic']),
            proposal: AssistProposalSchema,
          }),
          401: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
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
      const claims = extractOptionalClaims(req);
      if (!claims?.sub) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const ws = await opts.store.getTripWorkspace(req.params.id, claims.sub);
      if (!ws) {
        return reply.code(404).send({ error: 'Trip not found' });
      }

      const isMember = ws.members.some((m) => m.userId === claims.sub);
      const allowSamplePreview = ws.trip.isSample && !isProd;
      if (!isMember && !allowSamplePreview) {
        return reply
          .code(403)
          .send({ error: 'Only trip members can use Ask Itinbee on this trip' });
      }

      try {
        await opts.jobs.consumeAssistQuota(claims.sub);
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

      const resolvedInstruction = (
        req.body.instruction ??
        req.body.prompt ??
        ''
      ).trim();
      const resolvedDayId =
        req.body.dayId ??
        (req.body.dayNumber !== undefined
          ? ws.days.find(
              (d) => !d.deletedAt && d.dayNumber === req.body.dayNumber
            )?.id
          : undefined);

      const result = await proposeTripAssist({
        ws,
        instruction: resolvedInstruction,
        dayId: resolvedDayId,
        llm: opts.llm,
        places: opts.places,
      });

      return result;
    }
  );
};
