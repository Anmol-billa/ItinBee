import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { buildApp } from './app.js';
import {
  ensureSeedDataInPostgres,
  runSqlMigrations,
} from './store/pg-store.js';

async function main(): Promise<void> {
  let forceLocalStore = false;

  if (env.DATABASE_URL) {
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const migrationsDir = path.resolve(currentDir, '../migrations');
      const applied = await runSqlMigrations(env.DATABASE_URL, migrationsDir);
      if (applied.length > 0) {
        console.log(
          `Applied ${applied.length} SQL migration(s): ${applied.join(', ')}`
        );
      }
      await ensureSeedDataInPostgres(env.DATABASE_URL);
    } catch (err) {
      console.warn(
        'PostgreSQL migration/seed unavailable; falling back to LocalDevStore:',
        err instanceof Error ? err.message : err
      );
      forceLocalStore = true;
    }
  }

  const { app, store, bus } = await buildApp({ forceLocalStore });
  const port = env.resolvedPort;
  const host = '0.0.0.0';

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down Itinbee backend cleanly...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port, host });
  app.log.info(
    `Itinbee backend listening on http://${host}:${port} [store=${store.backendKind}, pubsub=${bus.mode}, inlineWorker=${String(env.RUN_INLINE_WORKER)}]`
  );
}

main().catch((err) => {
  console.error('Fatal error starting Itinbee backend:', err);
  process.exit(1);
});
