import pg from 'pg';
import type { AppEnv } from '../../config/env.js';
import { MemoryGeoCache, PgGeoCache, type GeoCache } from './geo-cache.js';
import { InMemoryPlacesRepository } from './memory-repository.js';
import {
  DestinationPackService,
  type PackJobQueue,
} from './pack-service.js';
import { PgPlacesRepository } from './pg-repository.js';
import { PlacesService } from './places-service.js';
import { PhotonClient } from './providers/photon.js';
import { OpenRouteServiceClient } from './providers/openrouteservice.js';
import { OverpassClient } from './providers/overpass.js';
import type { PlacesProviders } from './providers/types.js';
import { CommonsClient, WikidataClient, WikipediaClient } from './providers/wikipedia.js';
import { WikivoyageClient } from './providers/wikivoyage.js';
import type { PlacesRepository } from './repository.js';
import { seedPlacesData } from './seed.js';
import { SlidingWindowRateLimiter } from './util/rate-limit.js';
import { HttpClient } from './util/http.js';

const { Pool } = pg;

export interface PlacesServices {
  repo: PlacesRepository;
  cache: GeoCache;
  providers: PlacesProviders;
  packs: DestinationPackService;
  places: PlacesService;
  autocompleteLimiter: SlidingWindowRateLimiter;
  routeLimiter: SlidingWindowRateLimiter;
  adminToken: string | undefined;
  nodeEnv: AppEnv['NODE_ENV'];
  close(): Promise<void>;
}

export interface CreatePlacesServicesOptions {
  config: AppEnv;
  /** Use the in-memory repository even when DATABASE_URL is set (mirrors `forceLocalStore`). */
  forceLocalStore?: boolean;
  queue?: PackJobQueue;
  /** Test seams. */
  repo?: PlacesRepository;
  cache?: GeoCache;
  providers?: PlacesProviders;
  http?: HttpClient;
}

function pgPoolConfig(connectionString: string): pg.PoolConfig {
  const needsSsl = connectionString.includes('.render.com') || connectionString.includes('sslmode=require');
  return {
    connectionString,
    max: 8,
    idleTimeoutMillis: 30_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export function createPlacesServices(options: CreatePlacesServicesOptions): PlacesServices {
  const { config } = options;
  let pool: pg.Pool | null = null;

  let repo = options.repo;
  let cache = options.cache;
  if (!repo || !cache) {
    if (!options.forceLocalStore && config.DATABASE_URL) {
      pool = new Pool(pgPoolConfig(config.DATABASE_URL));
      repo ??= new PgPlacesRepository(pool);
      cache ??= new PgGeoCache(pool);
    } else {
      const file = config.PLACES_STORE_FILE || undefined;
      repo ??= new InMemoryPlacesRepository({ persistFilePath: file });
      cache ??= new MemoryGeoCache({ persistFilePath: file ? `${file}.cache.json` : undefined });
    }
  }

  const http = options.http ?? new HttpClient({ userAgent: config.WIKIMEDIA_USER_AGENT });
  const providers: PlacesProviders = options.providers ?? {
    photon: new PhotonClient(http, cache, config.PHOTON_BASE_URL),
    wikivoyage: new WikivoyageClient(http, cache),
    wikipedia: new WikipediaClient(http, cache),
    wikidata: new WikidataClient(http, cache),
    commons: new CommonsClient(http, cache),
    overpass: new OverpassClient(http, cache, config.overpassEndpointList),
    routing: new OpenRouteServiceClient(http, cache, config.ORS_API_KEY),
  };

  const packs = new DestinationPackService({
    repo,
    providers,
    queue: options.queue,
    ttlDays: config.PACK_TTL_DAYS,
    log: config.NODE_ENV === 'test' ? undefined : (m) => console.log(`[pack] ${m}`),
  });
  const places = new PlacesService(repo, providers, packs);

  const ownedRepo = repo;
  const ownedCache = cache;
  return {
    repo,
    cache,
    providers,
    packs,
    places,
    autocompleteLimiter: new SlidingWindowRateLimiter(60, 60_000),
    routeLimiter: new SlidingWindowRateLimiter(30, 60_000),
    adminToken: config.ADMIN_TOKEN,
    nodeEnv: config.NODE_ENV,
    async close() {
      await ownedRepo.close();
      await ownedCache.close();
      if (pool) await pool.end();
    },
  };
}

/** Idempotent startup seeding (destinations hierarchy + curated POIs). Never throws into app startup. */
export async function seedPlacesOnStartup(services: PlacesServices): Promise<void> {
  try {
    await seedPlacesData(services.repo);
  } catch (err) {
    console.warn('Places seeding failed:', err instanceof Error ? err.message : err);
  }
}
