import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { buildApp } from './app.js';
import {
  ensureSeedDataInPostgres,
  runSqlMigrations,
} from './store/pg-store.js';
import { closeSharedPools, withStartupDbRetry } from './store/shared-pool.js';

async function main(): Promise<void> {
  const isProd = env.NODE_ENV === 'production';
  let forceLocalStore = false;

  if (env.DATABASE_URL) {
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const migrationsDir = path.resolve(currentDir, '../migrations');
      await withStartupDbRetry(
        'PostgreSQL migrations & seed',
        async () => {
          const applied = await runSqlMigrations(env.DATABASE_URL!, migrationsDir);
          if (applied.length > 0) {
            console.log(
              `Applied ${applied.length} SQL migration(s): ${applied.join(', ')}`
            );
          }
          await ensureSeedDataInPostgres(env.DATABASE_URL!);
        },
        { maxAttempts: isProd ? 6 : 2 }
      );
    } catch (err) {
      if (isProd) {
        console.error(
          'FATAL: PostgreSQL migration/seed failed after retries in production; refusing to fall back to ephemeral LocalDevStore:',
          err
        );
        process.exit(1);
      }
      console.warn(
        'PostgreSQL migration/seed unavailable in non-production; falling back to LocalDevStore:',
        err instanceof Error ? err.message : err
      );
      forceLocalStore = true;
    }
  } else if (isProd) {
    console.error('FATAL: DATABASE_URL is required in NODE_ENV=production.');
    process.exit(1);
  } else {
    forceLocalStore = true;
  }

  const { app, store, bus } = await buildApp({ forceLocalStore });
  const port = env.resolvedPort;
  const host = '0.0.0.0';

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down Itinbee backend cleanly...`);
    await app.close();
    await closeSharedPools();
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
