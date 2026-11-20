import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ItineraryItemSchema,
  SyncClientMutationSchema,
  SyncServerDeltaSchema,
  TripDaySchema,
} from '../types/domain.js';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';

export interface SyncPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
}

export const syncRoutes: FastifyPluginAsyncZod<SyncPluginOpts> = async (
  app,
  opts
) => {
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
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
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
      },
    },
    async (socket, req) => {
      const tripId = req.params.id;

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
