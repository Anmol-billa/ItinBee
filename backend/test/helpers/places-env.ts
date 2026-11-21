import { loadEnv, type AppEnv } from '../../src/config/env.js';
import { MemoryGeoCache } from '../../src/modules/places/geo-cache.js';
import { InMemoryPlacesRepository } from '../../src/modules/places/memory-repository.js';
import {
  createPlacesServices,
  type PlacesServices,
} from '../../src/modules/places/places-module.js';
import type { PackJobQueue } from '../../src/modules/places/pack-service.js';
import { seedPlacesData } from '../../src/modules/places/seed.js';
import { HttpClient } from '../../src/modules/places/util/http.js';
import { createFixtureFetch, type FixtureFetch } from './fixture-fetch.js';

export interface TestPlaces {
  services: PlacesServices;
  fx: FixtureFetch;
  repo: InMemoryPlacesRepository;
  cache: MemoryGeoCache;
  config: AppEnv;
  sleeps: number[];
}

export function createTestPlaces(
  env: Record<string, string | undefined> = {},
  queue?: PackJobQueue
): TestPlaces {
  const fx = createFixtureFetch();
  const sleeps: number[] = [];
  const http = new HttpClient({
    userAgent: 'Itinbee-test/1.0 (contact via itinbee.com)',
    fetchImpl: fx.fetch,
    backoffMs: 1,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  const config = loadEnv({ NODE_ENV: 'test', DATABASE_URL: undefined, REDIS_URL: undefined, ...env });
  const repo = new InMemoryPlacesRepository();
  const cache = new MemoryGeoCache();
  const services = createPlacesServices({ config, repo, cache, http, queue });
  return { services, fx, repo, cache, config, sleeps };
}

export async function createSeededTestPlaces(
  env: Record<string, string | undefined> = {},
  queue?: PackJobQueue
): Promise<TestPlaces> {
  const t = createTestPlaces(env, queue);
  await seedPlacesData(t.repo);
  return t;
}
