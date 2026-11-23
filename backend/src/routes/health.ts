import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TripStore } from '../store/repository.js';
import type { RealtimeAndQueueBus } from '../store/pubsub.js';

export interface HealthPluginOpts {
  store: TripStore;
  bus: RealtimeAndQueueBus;
  forceLocalStore?: boolean;
}

const HealthPayloadSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('itinbee-backend'),
  storeBackend: z.enum(['postgres', 'local-memory']),
  pubsubMode: z.enum(['redis', 'memory']),
  checks: z.object({
    database: z.object({ ok: z.boolean(), detail: z.string() }),
    pubsub: z.object({ ok: z.boolean(), detail: z.string() }),
  }),
  timestamp: z.string(),
});

export const healthRoutes: FastifyPluginAsyncZod<HealthPluginOpts> = async (
  app,
  opts
) => {
  app.get(
    '/livez',
    {
      schema: {
        hide: true,
        response: {
          200: z.object({ ok: z.literal(true) }),
        },
      },
    },
    async () => ({ ok: true as const })
  );

  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Render singapore health check for store & pubsub readiness',
        response: {
          200: HealthPayloadSchema,
          503: HealthPayloadSchema,
        },
      },
    },
    async (_req, reply) => {
      const [dbHealth, busHealth] = await Promise.all([
        opts.store.checkHealth(),
        opts.bus.checkHealth(),
      ]);
      const ok = dbHealth.ok && busHealth.ok;

      const payload = {
        status: ok ? ('ok' as const) : ('degraded' as const),
        service: 'itinbee-backend' as const,
        storeBackend: opts.store.backendKind,
        pubsubMode: opts.bus.mode,
        checks: {
          database: dbHealth,
          pubsub: busHealth,
        },
        timestamp: new Date().toISOString(),
      };

      if (!dbHealth.ok && !opts.forceLocalStore) {
        return reply.code(503).send(payload);
      }

      return payload;
    }
  );

  app.get(
    '/openapi.json',
    {
      schema: {
        hide: true,
      },
    },
    async () => {
      return app.swagger();
    }
  );
};
