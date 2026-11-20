import { env } from './config/env.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const { app, store, bus } = await buildApp();
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
