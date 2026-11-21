import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import websocket from '@fastify/websocket';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env, type AppEnv } from './config/env.js';
import { LocalDevStore } from './store/local-dev-store.js';
import { PostgresTripStore } from './store/pg-store.js';
import { RealtimeAndQueueBus } from './store/pubsub.js';
import type { TripStore } from './store/repository.js';
import { runHybridTextIngestion } from './modules/ingest/pipeline.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { tripsRoutes } from './routes/trips.js';
import { syncRoutes } from './routes/sync.js';
import { ingestRoutes } from './routes/ingest.js';
import { geoRoutes } from './routes/geo.js';
import { pollsLedgerRoutes } from './routes/polls-ledger.js';

export interface BuildAppOptions {
  config?: AppEnv;
  store?: TripStore;
  bus?: RealtimeAndQueueBus;
  forceLocalStore?: boolean;
  logger?: boolean;
}

export interface BuiltAppBundle {
  app: FastifyInstance;
  store: TripStore;
  bus: RealtimeAndQueueBus;
}

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<BuiltAppBundle> {
  const config = options.config ?? env;

  const store: TripStore =
    options.store ??
    (!options.forceLocalStore && config.DATABASE_URL
      ? new PostgresTripStore(config.DATABASE_URL)
      : new LocalDevStore({
          persistFilePath: config.LOCAL_DEV_STORE_FILE || undefined,
        }));

  const bus =
    options.bus ??
    new RealtimeAndQueueBus({
      redisUrl: options.forceLocalStore ? undefined : config.REDIS_URL,
      runInlineWorker: config.RUN_INLINE_WORKER,
    });

  bus.registerIngestProcessor(async (job) => {
    const output = await runHybridTextIngestion(job.rawText);
    if (job.tripId && output.bookingCandidate) {
      const c = output.bookingCandidate;
      const item = await store.createShortlistItem({
        tripId: job.tripId,
        kind: c.itemKind,
        title: c.suggestedTitle,
        notes: c.summary.headline,
      });
      const booking = await store.createBooking({
        tripId: job.tripId,
        itemId: item.id,
        provider: c.provider,
        pnr: c.pnr,
        passengers: c.passengers,
        summary: c.summary,
        lowConfidenceFields: c.lowConfidenceFields,
        status: c.status,
        parserConfidence: c.parserConfidence,
      });
      await bus.publishTripEvent({
        type: 'booking_ingested',
        tripId: job.tripId,
        timestamp: new Date().toISOString(),
        payload: { bookingId: booking.id, headline: c.summary.headline },
      });
    }
  });

  const app = Fastify({
    logger: options.logger ?? config.NODE_ENV !== 'test',
    bodyLimit: 15 * 1024 * 1024, // 15MB ceiling to parse base64 PDFs cleanly up to 10MB raw
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin:
      config.corsOriginList.length > 0
        ? [...config.corsOriginList, /^https:\/\/[a-z0-9-]+\.onrender\.com$/i]
        : true,
    credentials: true,
  });

  await app.register(cookie, {
    secret: config.JWT_SECRET,
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Itinbee Backend API',
        description:
          'OTA-agnostic, WhatsApp-native, offline-first collaborative trip workspace API, HLC delta-sync engine, Indian ticket ingestion pipeline, and UPI expense ledger.',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'https://api.itinbee.com',
          description: 'Production (Render singapore)',
        },
        {
          url: 'http://localhost:4000',
          description: 'Local Development',
        },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(websocket);

  await app.register(healthRoutes, { store, bus });
  await app.register(authRoutes, { store, bus });
  await app.register(tripsRoutes, { store, bus });
  await app.register(syncRoutes, { store, bus });
  await app.register(ingestRoutes, { store, bus });
  await app.register(geoRoutes);
  await app.register(pollsLedgerRoutes, { store, bus });

  app.addHook('onClose', async () => {
    await bus.close();
    await store.close();
  });

  return { app, store, bus };
}
