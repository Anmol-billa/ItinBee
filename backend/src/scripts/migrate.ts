import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { runSqlMigrations } from '../store/pg-store.js';

async function main(): Promise<void> {
  if (!env.DATABASE_URL) {
    console.log(
      'DATABASE_URL is not set; skipping SQL migrations (LocalDevStore mode).'
    );
    return;
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(currentDir, '../../migrations');
  const applied = await runSqlMigrations(env.DATABASE_URL, migrationsDir);
  console.log(
    applied.length > 0
      ? `Applied ${applied.length} migration(s): ${applied.join(', ')}`
      : 'All SQL migrations are already up to date.'
  );
}

main().catch((err) => {
  console.error('Migration execution failed:', err);
  process.exit(1);
});
