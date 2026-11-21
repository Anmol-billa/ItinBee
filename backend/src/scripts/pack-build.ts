import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { createPlacesServices } from '../modules/places/places-module.js';
import { seedPlacesData } from '../modules/places/seed.js';
import { PLACE_CATEGORIES } from '../modules/places/types.js';
import { runSqlMigrations } from '../store/pg-store.js';

/**
 * `npm run pack:build -- <slug> [--force] [--refresh]`
 * Builds a Destination Pack from the live network and prints a summary.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('--'));
  if (!slug) {
    console.error('Usage: npm run pack:build -- <slug> [--force] [--refresh]');
    process.exit(2);
  }
  const force = args.includes('--force');
  const refresh = args.includes('--refresh');

  if (env.DATABASE_URL) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
    await runSqlMigrations(env.DATABASE_URL, dir);
  }
  const services = createPlacesServices({ config: env });
  try {
    await seedPlacesData(services.repo);
    const dest = await services.repo.getDestinationBySlug(slug);
    if (!dest) {
      console.error(`Unknown destination slug "${slug}". Run npm run seed:destinations to list seeds.`);
      process.exit(1);
    }
    console.log(`Building pack for ${dest.name} (${dest.kind}) [store=${services.repo.kind}] ...`);
    const result = await services.packs.runBuild({ slug, force: true, refresh: refresh || force });
    if (result.error) {
      console.error(`Build failed: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    const fresh = await services.repo.getDestinationBySlug(slug);
    const stats = fresh?.packStats ?? {};
    const total = stats.total ?? 0;
    console.log(`status=${fresh?.packStatus} total=${total} durationMs=${stats.durationMs}`);
    console.log(`withImage=${stats.withImage} (${pct(stats.withImage, total)}) withDescription=${stats.withDescription} (${pct(stats.withDescription, total)})`);
    console.log(`droppedNoCoords=${stats.droppedNoCoords} droppedJunk=${stats.droppedJunk} mergedDuplicates=${stats.mergedDuplicates}`);
    console.log('providers:', JSON.stringify(stats.providers));
    if (stats.warnings && stats.warnings.length > 0) console.log('warnings:', stats.warnings);
    for (const cat of PLACE_CATEGORIES) {
      const n = stats.perCategory?.[cat] ?? 0;
      console.log(`  ${cat.padEnd(10)} ${n}`);
    }
    const top = await services.repo.queryPlaces({
      destinationIds: [dest.id],
      category: 'sights',
      limit: 10,
      offset: 0,
    });
    console.log('Top 10 sights:');
    top.rows.forEach((r, i) =>
      console.log(
        `  ${String(i + 1).padStart(2)}. ${r.place.name} [${r.place.subtype ?? '-'}] pop=${r.place.popularity} img=${r.place.image ? 'y' : 'n'}`
      )
    );
  } finally {
    await services.close();
  }
}

function pct(n: number | undefined, total: number): string {
  return total > 0 && n !== undefined ? `${Math.round((n / total) * 100)}%` : 'n/a';
}

main().catch((err) => {
  console.error('pack:build failed:', err);
  process.exit(1);
});
