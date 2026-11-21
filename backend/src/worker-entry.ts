import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { KmsEnvelopeService } from './security/kms-envelope.js';
import { LocalDevStore } from './store/local-dev-store.js';
import {
  ensureSeedDataInPostgres,
  PostgresTripStore,
  runSqlMigrations,
} from './store/pg-store.js';
import {
  closeSharedPools,
  withStartupDbRetry,
} from './store/shared-pool.js';
import { RealtimeAndQueueBus } from './store/pubsub.js';
import { runHybridTextIngestion } from './modules/ingest/pipeline.js';
import {
  createPlacesServices,
  seedPlacesOnStartup,
} from './modules/places/places-module.js';

async function startDedicatedWorker(): Promise<void> {
  const kms = new KmsEnvelopeService(env);

  if (env.DATABASE_URL) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(currentDir, '../migrations');
    await withStartupDbRetry(
      'Worker PostgreSQL migrations & seed',
      async () => {
        const applied = await runSqlMigrations(env.DATABASE_URL!, migrationsDir);
        if (applied.length > 0) {
          console.log(
            `[itinbee-worker] Applied ${applied.length} SQL migration(s): ${applied.join(', ')}`
          );
        }
        await ensureSeedDataInPostgres(env.DATABASE_URL!, kms);
      },
      { maxAttempts: env.NODE_ENV === 'production' ? 6 : 2 }
    );
  } else if (env.NODE_ENV === 'production') {
    throw new Error('FATAL [worker]: DATABASE_URL is required in production.');
  }

  const store = env.DATABASE_URL
    ? new PostgresTripStore(env.DATABASE_URL, { kms, role: 'worker' })
    : new LocalDevStore({ kms });

  const bus = new RealtimeAndQueueBus({
    redisUrl: env.REDIS_URL,
    runInlineWorker: true,
  });

  // Destination Pack builds (`build-destination-pack` jobs on the `itinbee-packs` queue)
  const places = createPlacesServices({ config: env, queue: bus });
  bus.registerPackProcessor((job) => places.packs.runBuild(job));
  await seedPlacesOnStartup(places);

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

  console.log(
    `[itinbee-worker] Dedicated ingestion & pack worker started (mode=${bus.mode}, store=${store.backendKind})`
  );

  const shutdown = async () => {
    await bus.close();
    await store.close();
    await places.close();
    await closeSharedPools();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

startDedicatedWorker().catch((err) => {
  console.error('[itinbee-worker] Fatal startup error:', err);
  process.exit(1);
});
