import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import websocket from '@fastify/websocket';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { env, expandHostToOrigins, type AppEnv } from './config/env.js';
import { KmsEnvelopeService } from './security/kms-envelope.js';
import { LocalDevStore } from './store/local-dev-store.js';
import { PostgresTripStore } from './store/pg-store.js';
import { RealtimeAndQueueBus } from './store/pubsub.js';
import type { TripStore } from './store/repository.js';
import { runHybridTextIngestion } from './modules/ingest/pipeline.js';
import { MumbaiS3VaultService } from './modules/ingest/s3-vault.js';
import { captureBackendException } from './modules/telemetry/sentry.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { tripsRoutes } from './routes/trips.js';
import { syncRoutes } from './routes/sync.js';
import { ingestRoutes } from './routes/ingest.js';
import { geoRoutes } from './routes/geo.js';
import { transitRoutes } from './routes/transit.js';
import { pollsLedgerRoutes } from './routes/polls-ledger.js';
import { placesRoutes } from './routes/places.js';
import { exploreRoutes } from './routes/explore.js';
import { importRoutes } from './routes/import.js';
import {
  createPlacesServices,
  seedPlacesOnStartup,
  type PlacesServices,
} from './modules/places/places-module.js';
import { ExploreService } from './modules/explore/explore-service.js';
import { ImportJobService } from './modules/import/jobs.js';
import { createLlmProvider, type LlmProvider } from './modules/import/llm/index.js';
import type { SafeFetcher } from './modules/import/safe-fetch.js';

export interface BuildAppOptions {
  config?: AppEnv;
  store?: TripStore;
  bus?: RealtimeAndQueueBus;
  vault?: MumbaiS3VaultService;
  forceLocalStore?: boolean;
  logger?: boolean;
  /** Inject places services (tests use fake providers; production builds them from env). */
  places?: PlacesServices;
  /** Inject LLM provider (FakeProvider / NullProvider in tests). */
  llm?: LlmProvider;
  /** Inject SSRF-safe fetcher seam for link import tests. */
  fetcher?: SafeFetcher;
  /** Inject fetch seam for auth OIDC / Resend / Sentry tests. */
  authFetchImpl?: typeof fetch;
  explore?: ExploreService;
  importJobs?: ImportJobService;
}

export interface BuiltAppBundle {
  app: FastifyInstance;
  store: TripStore;
  bus: RealtimeAndQueueBus;
  vault: MumbaiS3VaultService;
  places: PlacesServices;
  explore: ExploreService;
  importJobs: ImportJobService;
}

function buildAllowedCorsOrigins(
  config: AppEnv
): boolean | Array<string | RegExp> {
  const exactSet = new Set<string>(config.corsOriginList);
  for (const hostOrigin of expandHostToOrigins(
    config.FRONTEND_HOST ?? process.env.FRONTEND_HOST
  )) {
    exactSet.add(hostOrigin);
  }
  const appPub = config.APP_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (
    appPub &&
    !(config.NODE_ENV === 'production' && appPub.startsWith('http://localhost'))
  ) {
    exactSet.add(appPub);
  }

  if (config.NODE_ENV === 'production') {
    return exactSet.size > 0 ? [...exactSet] : false;
  }

  return exactSet.size > 0
    ? [...exactSet, /^https?:\/\/localhost(:\d+)?$/i]
    : true;
}

export async function buildApp(
  options: BuildAppOptions = {}
): Promise<BuiltAppBundle> {
  const config = options.config ?? env;
  const kms = new KmsEnvelopeService(config);
  const vault = options.vault ?? new MumbaiS3VaultService(config, kms);

  const store: TripStore =
    options.store ??
    (!options.forceLocalStore && config.DATABASE_URL
      ? new PostgresTripStore(config.DATABASE_URL, { kms, role: 'web' })
      : new LocalDevStore({
          kms,
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

  const places =
    options.places ??
    createPlacesServices({
      config,
      forceLocalStore: options.forceLocalStore,
      queue: bus,
    });
  bus.registerPackProcessor((job) => places.packs.runBuild(job));
  await seedPlacesOnStartup(places);

  const llm = options.llm ?? createLlmProvider(config);

  const explore =
    options.explore ??
    new ExploreService({
      store,
      places,
      databaseUrl: config.DATABASE_URL,
      forceLocalStore: options.forceLocalStore,
    });

  const importJobs =
    options.importJobs ??
    new ImportJobService({
      config,
      store,
      places,
      explore,
      llm,
      fetcher: options.fetcher,
      forceLocalStore: options.forceLocalStore,
    });

  const app = Fastify({
    logger: options.logger ?? config.NODE_ENV !== 'test',
    trustProxy: true,
    bodyLimit: 15 * 1024 * 1024, // 15MB ceiling to parse base64 PDFs cleanly up to 10MB raw
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err) || err.validation) {
      return reply.code(400).send({
        error: 'Validation error',
        message: err.message,
        statusCode: 400,
      });
    }
    if (isResponseSerializationError(err)) {
      req.log.error(err);
      void captureBackendException(err, req, config, options.authFetchImpl);
      return reply.code(500).send({
        error: 'Internal response serialization error',
      });
    }

    const statusCode =
      typeof err.statusCode === 'number' && err.statusCode >= 400
        ? err.statusCode
        : 500;

    if (statusCode >= 500) {
      req.log.error(err);
      void captureBackendException(err, req, config, options.authFetchImpl);
      return reply.code(statusCode).send({
        error:
          config.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message || 'Internal server error',
      });
    }

    return reply.code(statusCode).send({
      error: err.message || 'Request failed',
    });
  });

  await app.register(cors, {
    origin: buildAllowedCorsOrigins(config),
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

  await app.register(healthRoutes, {
    store,
    bus,
    forceLocalStore: options.forceLocalStore,
  });
  await app.register(authRoutes, {
    store,
    bus,
    config,
    fetchImpl: options.authFetchImpl,
  });
  await app.register(tripsRoutes, {
    store,
    bus,
    config,
    vault,
    fetchImpl: options.authFetchImpl,
  });
  await app.register(syncRoutes, { store, bus, config });
  await app.register(ingestRoutes, { store, bus, config, vault });
  await app.register(geoRoutes);
  await app.register(transitRoutes, { places, llm, config });
  await app.register(placesRoutes, { services: places });
  await app.register(exploreRoutes, { explore, store, config });
  await app.register(importRoutes, {
    jobs: importJobs,
    store,
    places,
    llm,
    config,
  });
  await app.register(pollsLedgerRoutes, { store, bus, config });

  app.addHook('onClose', async () => {
    await importJobs.close();
    await explore.close();
    await bus.close();
    await store.close();
    await places.close();
  });

  return { app, store, bus, vault, places, explore, importJobs };
}
