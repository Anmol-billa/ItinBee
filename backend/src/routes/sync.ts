import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env, type AppEnv } from '../config/env.js';
import {
  signWsTicket,
  verifyWsTicket,
} from '../security/auth-tokens.js';
import { requireTripAccess } from '../security/permissions.js';
import {
  ItineraryItemSchema,
  SyncClientMutationSchema,
  SyncServerDeltaSchema,
  TripDaySchema,
} from '../types/domain.js';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';
import { extractAuthClaims } from './auth-helper.js';

export interface SyncPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
  config?: AppEnv;
}

function buildLiveWsUrl(tripId: string, cfg: AppEnv): string {
  if (cfg.PUBLIC_BACKEND_URL?.trim()) {
    const base = cfg.PUBLIC_BACKEND_URL.trim()
      .replace(/\/+$/, '')
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://');
    return `${base}/v1/trips/${tripId}/live`;
  }
  if (cfg.PUBLIC_BACKEND_HOST?.trim()) {
    const rawHost = cfg.PUBLIC_BACKEND_HOST.trim()
      .replace(/^wss?:\/\//i, '')
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
    const fqdn =
      rawHost.includes('.') ||
      rawHost.includes(':') ||
      rawHost.startsWith('localhost') ||
      rawHost.startsWith('127.0.0.1')
        ? rawHost
        : `${rawHost}.onrender.com`;
    const proto =
      fqdn.startsWith('localhost') || fqdn.startsWith('127.0.0.1') ? 'ws' : 'wss';
    return `${proto}://${fqdn}/v1/trips/${tripId}/live`;
  }
  if (cfg.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
    const base = process.env.RENDER_EXTERNAL_URL.trim()
      .replace(/\/+$/, '')
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://');
    return `${base}/v1/trips/${tripId}/live`;
  }
  return `ws://localhost:${cfg.resolvedPort}/v1/trips/${tripId}/live`;
}

export const syncRoutes: FastifyPluginAsyncZod<SyncPluginOpts> = async (
  app,
  opts
) => {
  const cfg = opts.config ?? env;

  app.get(
    '/v1/trips/:id/ws-ticket',
    {
      schema: {
        tags: ['Sync'],
        summary: 'Issue a 2-minute signed WebSocket ticket for live co-editing rooms',
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: z.object({
            ticket: z.string(),
            wsUrl: z.string(),
            expiresAt: z.string(),
          }),
          401: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        { config: cfg }
      );
      if (!access || !access.userId) return;

      const ttlSeconds = 120;
      const ticket = signWsTicket(
        { tripId: req.params.id, userId: access.userId },
        cfg.JWT_SECRET,
        ttlSeconds
      );
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      const wsUrl = buildLiveWsUrl(req.params.id, cfg);

      return { ticket, wsUrl, expiresAt };
    }
  );

  app.post(
    '/v1/trips/:id/sync',
    {
      schema: {
        tags: ['Sync'],
        summary:
          'HLC + fractional-index delta-sync batch push/pull (idempotent client_op_id, monotonic server_seq, orphan-to-shortlist rule)',
        params: z.object({
          id: z.string().uuid(),
        }),
        querystring: z
          .object({
            ticket: z.string().optional(),
          })
          .optional(),
        body: z.object({
          lastSeenSeq: z.number().int().nonnegative().default(0),
          mutations: z.array(SyncClientMutationSchema).default([]),
        }),
        response: {
          200: z.object({
            latestSeq: z.number().int().nonnegative(),
            appliedOps: z.array(SyncServerDeltaSchema),
            pulledDeltas: z.array(SyncServerDeltaSchema),
            activeDays: z.array(TripDaySchema),
            activeItems: z.array(ItineraryItemSchema),
            shortlistItems: z.array(ItineraryItemSchema),
          }),
          401: z.object({ error: z.string() }),
          403: z.object({ error: z.string() }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const access = await requireTripAccess(
        req,
        reply,
        opts.store,
        req.params.id,
        {
          write: true,
          allowTicketQuery: true,
          config: cfg,
        }
      );
      if (!access) return;

      try {
        const result = await opts.store.syncTripMutations({
          tripId: req.params.id,
          lastSeenSeq: req.body.lastSeenSeq,
          mutations: req.body.mutations,
        });

        if (result.appliedOps.length > 0) {
          await opts.bus.publishTripEvent({
            type: 'sync_delta',
            tripId: req.params.id,
            timestamp: new Date().toISOString(),
            payload: {
              latestSeq: result.latestSeq,
              appliedOps: result.appliedOps,
            },
          });
        }

        return result;
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Trip not found')) {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  // Live co-editing WebSocket room bridged across instances via Redis/in-memory Pub/Sub
  app.get(
    '/v1/trips/:id/live',
    {
      websocket: true,
      schema: {
        tags: ['Sync'],
        summary: 'Realtime WebSocket room for live co-editing cursors, sync deltas, polls & expenses',
        params: z.object({
          id: z.string().uuid(),
        }),
        querystring: z
          .object({
            ticket: z.string().optional(),
          })
          .optional(),
      },
    },
    async (socket, req) => {
      const tripId = req.params.id;
      const queryTicket = req.query?.ticket;

      let callerUserId: string | null = null;
      if (queryTicket) {
        const wsClaims = verifyWsTicket(queryTicket, cfg.JWT_SECRET);
        if (wsClaims && wsClaims.tripId === tripId) {
          callerUserId = wsClaims.userId;
        }
      }
      if (!callerUserId) {
        const authClaims = extractAuthClaims(req, cfg.JWT_SECRET);
        if (authClaims) {
          callerUserId = authClaims.sub;
        }
      }

      if (!callerUserId) {
        socket.close(4401, 'Authentication required');
        return;
      }

      const access = await opts.store.getTripAccessInfo(tripId, callerUserId);
      if (!access || !access.member) {
        socket.close(4403, 'Forbidden: trip membership required');
        return;
      }

      const unsubscribe = await opts.bus.subscribeTripRoom(tripId, (event) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify(event));
        }
      });

      socket.send(
        JSON.stringify({
          type: 'connected',
          tripId,
          timestamp: new Date().toISOString(),
        })
      );

      socket.on('message', (rawBuf: Buffer) => {
        try {
          const msg = JSON.parse(rawBuf.toString('utf8')) as {
            type?: string;
            payload?: Record<string, unknown>;
          };
          if (msg.type === 'ping') {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ type: 'pong' }));
            }
            return;
          }
          if (msg.type === 'cursor_presence') {
            void opts.bus.publishTripEvent({
              type: 'cursor_presence',
              tripId,
              timestamp: new Date().toISOString(),
              payload: msg.payload ?? {},
            });
          }
        } catch {
          // Ignore malformed client WS frame
        }
      });

      socket.on('close', () => {
        void unsubscribe();
      });
    }
  );
};
