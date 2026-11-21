import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { isPackBuildable } from '../modules/places/pack-builder.js';
import { createPlacesServices } from '../modules/places/places-module.js';
import { seedPlacesData } from '../modules/places/seed.js';
import { mapLimit } from '../modules/places/util/http.js';
import { runSqlMigrations } from '../store/pg-store.js';

const PRIORITY_SLUGS: readonly string[] = [
  'jaipur',
  'udaipur',
  'north-goa',
  'south-goa',
  'manali',
  'rishikesh',
  'varanasi',
  'munnar',
  'kochi',
  'alleppey',
  'jodhpur',
  'jaisalmer',
  'leh',
  'spiti-valley',
  'shimla',
  'dharamshala',
  'darjeeling',
  'gangtok',
  'pondicherry',
  'hampi',
  'mysuru',
  'ooty',
  'coorg',
  'dubai',
  'singapore',
  'bangkok',
  'bali',
  'kyoto',
  'tokyo',
  'hanoi',
  'hoi-an',
];

function readFlagValue(args: string[], flag: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1]!.startsWith('--')) {
    return args[idx + 1];
  }
  return undefined;
}

/**
 * Batch operator pre-warmer for Wikivoyage + Wikipedia + Wikidata + OSM Destination Packs:
 *   `tsx src/scripts/pack-prewarm.ts --top 25 [--force] [--refresh] [--concurrency 2] [--slugs jaipur,kyoto] [--dry-run]`
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const topRaw = readFlagValue(args, '--top');
  const slugsRaw = readFlagValue(args, '--slugs');
  const concRaw = readFlagValue(args, '--concurrency');
  const force = args.includes('--force');
  const refresh = args.includes('--refresh');
  const dryRun = args.includes('--dry-run');

  const topCount = topRaw ? Math.max(1, Number(topRaw) || 25) : 25;
  const concurrency = concRaw ? Math.min(4, Math.max(1, Number(concRaw) || 2)) : 2;

  if (env.DATABASE_URL && !dryRun) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
    await runSqlMigrations(env.DATABASE_URL, dir);
  }

  const services = createPlacesServices({ config: env });
  try {
    const seeded = await seedPlacesData(services.repo);
    const allDests = await services.repo.listDestinations({});
    const buildableBySlug = new Map(
      allDests.filter((d) => isPackBuildable(d.kind)).map((d) => [d.slug, d])
    );

    let targetSlugs: string[];
    if (slugsRaw) {
      targetSlugs = slugsRaw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => buildableBySlug.has(s));
    } else {
      const ordered = [
        ...PRIORITY_SLUGS.filter((s) => buildableBySlug.has(s)),
        ...[...buildableBySlug.keys()].filter((s) => !PRIORITY_SLUGS.includes(s)),
      ];
      targetSlugs = ordered.slice(0, topCount);
    }

    console.log(
      `[pack-prewarm] store=${services.repo.kind} seededDestinations=${seeded.destinations} starterPois=${seeded.curated}`
    );
    console.log(
      `[pack-prewarm] targets=${targetSlugs.length} concurrency=${concurrency} force=${force} refresh=${refresh}`
    );

    if (dryRun) {
      console.log(`[pack-prewarm] dry-run slugs: ${targetSlugs.join(', ')}`);
      return;
    }

    let okCount = 0;
    let skipCount = 0;
    let errCount = 0;

    await mapLimit(targetSlugs, concurrency, async (slug, idx) => {
      const dest = buildableBySlug.get(slug)!;
      if (!force && services.packs.effectiveStatus(dest) === 'ready') {
        skipCount += 1;
        console.log(
          `[${idx + 1}/${targetSlugs.length}] SKIP ${slug} (already ready, builtAt=${dest.packBuiltAt})`
        );
        return;
      }

      const t0 = Date.now();
      const res = await services.packs.runBuild({
        slug,
        force: true,
        refresh: refresh || force,
      });
      const elapsedMs = Date.now() - t0;

      if (res.error) {
        errCount += 1;
        console.error(
          `[${idx + 1}/${targetSlugs.length}] FAIL ${slug} (${elapsedMs}ms): ${res.error}`
        );
      } else {
        okCount += 1;
        console.log(
          `[${idx + 1}/${targetSlugs.length}] ${res.status.toUpperCase()} ${slug} total=${res.stats?.total ?? 0} (${elapsedMs}ms)`
        );
      }
    });

    console.log(
      `[pack-prewarm] finished: built=${okCount} skipped=${skipCount} failed=${errCount}`
    );
    if (errCount > 0 && okCount === 0) {
      process.exitCode = 1;
    }
  } finally {
    await services.close();
  }
}

main().catch((err) => {
  console.error('[pack-prewarm] fatal error:', err);
  process.exit(1);
});
