import { env } from './config/env.js';
import { LocalDevStore } from './store/local-dev-store.js';
import { PostgresTripStore } from './store/pg-store.js';
import { RealtimeAndQueueBus } from './store/pubsub.js';
import { runHybridTextIngestion } from './modules/ingest/pipeline.js';
import {
  createPlacesServices,
  seedPlacesOnStartup,
} from './modules/places/places-module.js';

async function startDedicatedWorker(): Promise<void> {
  const store = env.DATABASE_URL
    ? new PostgresTripStore(env.DATABASE_URL)
    : new LocalDevStore();

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
      await store.createBooking({
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
    }
  });

  console.log(
    `[itinbee-worker] Dedicated ingestion worker started (mode=${bus.mode}, store=${store.backendKind})`
  );

  const shutdown = async () => {
    await bus.close();
    await store.close();
    await places.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

startDedicatedWorker().catch((err) => {
  console.error('[itinbee-worker] Fatal startup error:', err);
  process.exit(1);
});
