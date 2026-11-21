import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { createPlacesServices } from '../modules/places/places-module.js';
import { seedPlacesData } from '../modules/places/seed.js';
import { runSqlMigrations } from '../store/pg-store.js';

async function main(): Promise<void> {
  if (env.DATABASE_URL) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
    await runSqlMigrations(env.DATABASE_URL, dir);
  }
  const services = createPlacesServices({ config: env });
  try {
    const out = await seedPlacesData(services.repo);
    console.log(
      `Seeded ${out.destinations} destinations and ${out.curated} curated places (store=${services.repo.kind}).`
    );
    if (services.repo.kind === 'memory' && !env.PLACES_STORE_FILE) {
      console.log('Note: DATABASE_URL and PLACES_STORE_FILE are unset, so nothing was persisted.');
    }
  } finally {
    await services.close();
  }
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
