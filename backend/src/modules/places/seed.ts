import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CURATED_OPEN_POIS, type OpenPoiRecord } from '../geo/curated-india-pois.js';
import type { PlacesRepository } from './repository.js';
import { STARTER_OPEN_POIS, type StarterOpenPoi } from './seed/starter-pois.js';
import type {
  DestinationKind,
  DestinationSeed,
  PlaceCategory,
  PlaceInput,
} from './types.js';
import { DESTINATION_KINDS } from './types.js';

function seedFilePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/modules/places (tsx / vitest) or dist/modules/places (built: JSON is copied by the build script)
  const candidates = [
    path.join(here, 'seed', 'destinations.json'),
    path.resolve(here, '../../../src/modules/places/seed/destinations.json'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('destinations.json seed file not found');
  return found;
}

export function loadDestinationSeeds(): DestinationSeed[] {
  const raw = JSON.parse(fs.readFileSync(seedFilePath(), 'utf8')) as DestinationSeed[];
  const slugs = new Set<string>();
  for (const d of raw) {
    if (!(DESTINATION_KINDS as readonly string[]).includes(d.kind as DestinationKind)) {
      throw new Error(`Seed destination ${d.slug}: invalid kind ${d.kind}`);
    }
    if (slugs.has(d.slug)) throw new Error(`Duplicate seed slug ${d.slug}`);
    slugs.add(d.slug);
  }
  for (const d of raw) {
    if (d.parentSlug && !slugs.has(d.parentSlug)) {
      throw new Error(`Seed destination ${d.slug}: unknown parent ${d.parentSlug}`);
    }
  }
  return raw;
}

/** Idempotent upsert of the destination hierarchy (safe to call on every startup). */
export async function seedDestinations(repo: PlacesRepository): Promise<number> {
  const seeds = loadDestinationSeeds();
  await repo.upsertDestinations(seeds);
  return seeds.length;
}

const CURATED_CITY_TO_SLUG: Record<string, string> = {
  rishikesh: 'rishikesh',
  landour: 'landour',
  dehradun: 'dehradun',
  canacona: 'south-goa',
  agonda: 'south-goa',
  canaguinim: 'south-goa',
  margao: 'south-goa',
  varanasi: 'varanasi',
  ayodhya: 'ayodhya',
  manali: 'manali',
  kaza: 'spiti-valley',
  'new delhi': 'delhi',
  bengaluru: 'bengaluru',
  hanoi: 'hanoi',
  'ha long': 'ha-long',
  'hoi an': 'hoi-an',
};

const CURATED_CATEGORY: Record<OpenPoiRecord['category'], { category: PlaceCategory; subtype: string }> = {
  temple: { category: 'spiritual', subtype: 'temple' },
  beach: { category: 'nature', subtype: 'beach' },
  cafe_meal: { category: 'food', subtype: 'restaurant' },
  transit_hub: { category: 'transport', subtype: 'station' },
  heritage: { category: 'sights', subtype: 'heritage' },
  nature: { category: 'nature', subtype: 'nature' },
  stay: { category: 'stay', subtype: 'hotel' },
  market: { category: 'activity', subtype: 'shopping' },
};

export function curatedPoiToPlace(
  poi: OpenPoiRecord,
  destinationId: string,
  retrievedAt: string
): PlaceInput {
  const mapped = CURATED_CATEGORY[poi.category];
  const wikidata = poi.placeRefId.match(/^wikidata:(Q\d+)/)?.[1] ?? null;
  return {
    refId: poi.placeRefId,
    destinationId,
    name: poi.name,
    nameLocal: poi.nameHi ? { hi: poi.nameHi } : {},
    category: mapped.category,
    subtype: mapped.subtype,
    lat: poi.lat,
    lng: poi.lng,
    address: poi.address,
    website: null,
    openingHours: null,
    description: poi.accessibilityNotes ? `Access: ${poi.accessibilityNotes}` : null,
    whyVisit: null,
    typicalDurationMins: null,
    bestTime: null,
    dietaryHints: poi.dietaryHints,
    image: null,
    popularity: 0.5,
    rankScore: 0.5,
    wikidataId: wikidata,
    wikipediaTitle: null,
    sources: [
      {
        provider: 'curated',
        fields: ['name', 'location', 'address', 'dietary_hints', 'description'],
        license: 'Itinbee curated (underlying facts: OSM ODbL / Wikidata CC0)',
        url: null,
        ref: poi.placeRefId,
        retrievedAt,
      },
    ],
  };
}

export function starterPoiToPlace(
  poi: StarterOpenPoi,
  destinationId: string,
  retrievedAt: string
): PlaceInput {
  return {
    refId: poi.refId,
    destinationId,
    name: poi.name,
    nameLocal: {},
    category: poi.category,
    subtype: poi.subtype,
    lat: poi.lat,
    lng: poi.lng,
    address: poi.address,
    website: null,
    openingHours: null,
    description: poi.description,
    whyVisit: poi.whyVisit,
    typicalDurationMins: poi.typicalDurationMins,
    bestTime: null,
    dietaryHints: poi.dietaryHints,
    image: null,
    popularity: poi.popularity,
    rankScore: poi.popularity,
    wikidataId: poi.wikidataId,
    wikipediaTitle: poi.wikipediaTitle,
    sources: [
      {
        provider: 'curated',
        fields: ['name', 'location', 'address', 'description', 'why_visit', 'dietary_hints'],
        license: 'Itinbee curated (underlying facts: OSM ODbL / Wikidata CC0 / Wikipedia CC BY-SA 4.0)',
        url: poi.wikipediaTitle
          ? `https://en.wikipedia.org/wiki/${encodeURIComponent(poi.wikipediaTitle.replace(/ /g, '_'))}`
          : null,
        ref: poi.refId,
        retrievedAt,
      },
    ],
  };
}

/**
 * Migrates the hand-typed curated POIs + 20-destination starter POIs into `places` with provenance `curated`.
 * Skips destinations that already have a built pack (the pack supersedes the hand-typed row).
 */
export async function seedCuratedPlaces(
  repo: PlacesRepository,
  now: Date = new Date()
): Promise<number> {
  const byDest = new Map<string, PlaceInput[]>();
  const slugCache = new Map<string, { id: string; built: boolean } | null>();
  const nowIso = now.toISOString();

  const resolveDest = async (slug: string): Promise<{ id: string; built: boolean } | null> => {
    let dest = slugCache.get(slug);
    if (dest === undefined) {
      const rec = await repo.getDestinationBySlug(slug);
      dest = rec ? { id: rec.id, built: rec.packBuiltAt !== null } : null;
      slugCache.set(slug, dest);
    }
    return dest;
  };

  for (const poi of CURATED_OPEN_POIS) {
    const slug = CURATED_CITY_TO_SLUG[poi.city.toLowerCase()];
    if (!slug) continue;
    const dest = await resolveDest(slug);
    if (!dest || dest.built) continue;
    const list = byDest.get(dest.id) ?? [];
    list.push(curatedPoiToPlace(poi, dest.id, nowIso));
    byDest.set(dest.id, list);
  }

  for (const sp of STARTER_OPEN_POIS) {
    const dest = await resolveDest(sp.destinationSlug);
    if (!dest || dest.built) continue;
    const list = byDest.get(dest.id) ?? [];
    if (!list.some((existing) => existing.refId === sp.refId)) {
      list.push(starterPoiToPlace(sp, dest.id, nowIso));
      byDest.set(dest.id, list);
    }
  }

  let n = 0;
  for (const [destinationId, places] of byDest) {
    n += await repo.upsertPlaces(destinationId, places);
  }
  return n;
}

export async function seedPlacesData(repo: PlacesRepository): Promise<{ destinations: number; curated: number }> {
  const destinations = await seedDestinations(repo);
  const curated = await seedCuratedPlaces(repo);
  return { destinations, curated };
}
