import fs from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

export interface GeoCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, provider: string, payload: unknown, ttlMs: number): Promise<void>;
  purgeExpired(): Promise<number>;
  close(): Promise<void>;
}

/** TTL per provider (ms). Open-data sources change slowly, and caching keeps us inside usage policies. */
export const CACHE_TTL = {
  photon: 24 * 3600_000,
  wikivoyage: 14 * 24 * 3600_000,
  wikipedia: 7 * 24 * 3600_000,
  wikipediaLive: 24 * 3600_000,
  pageviews: 3 * 24 * 3600_000,
  wikidata: 14 * 24 * 3600_000,
  commons: 30 * 24 * 3600_000,
  overpass: 30 * 24 * 3600_000,
  ors: 30 * 24 * 3600_000,
} as const;

interface MemoryEntry {
  provider: string;
  payload: unknown;
  expiresAt: number;
}

/** Process-local cache with optional JSON persistence (used when DATABASE_URL is unset). */
export class MemoryGeoCache implements GeoCache {
  private readonly entries = new Map<string, MemoryEntry>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly options: { persistFilePath?: string; now?: () => number } = {}
  ) {
    const file = options.persistFilePath;
    if (file && fs.existsSync(file)) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, MemoryEntry>;
        for (const [k, v] of Object.entries(raw)) this.entries.set(k, v);
      } catch {
        // corrupt cache file: start fresh
      }
    }
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  get size(): number {
    return this.entries.size;
  }

  async get<T>(key: string): Promise<T | null> {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return hit.payload as T;
  }

  async set(key: string, provider: string, payload: unknown, ttlMs: number): Promise<void> {
    this.entries.set(key, { provider, payload, expiresAt: this.now() + ttlMs });
    this.scheduleFlush();
  }

  async purgeExpired(): Promise<number> {
    let n = 0;
    const t = this.now();
    for (const [k, v] of this.entries) {
      if (v.expiresAt <= t) {
        this.entries.delete(k);
        n += 1;
      }
    }
    return n;
  }

  private scheduleFlush(): void {
    if (!this.options.persistFilePath || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, 500);
    this.flushTimer.unref();
  }

  private flushNow(): void {
    const file = this.options.persistFilePath;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const obj: Record<string, MemoryEntry> = {};
    for (const [k, v] of this.entries) obj[k] = v;
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(obj));
    fs.renameSync(`${file}.tmp`, file);
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushNow();
  }
}

/** Postgres `geo_cache` table (migration 007). The pool is owned by the caller. */
export class PgGeoCache implements GeoCache {
  constructor(private readonly pool: Pool) {}

  async get<T>(key: string): Promise<T | null> {
    const res = await this.pool.query<{ payload: T }>(
      'SELECT payload FROM geo_cache WHERE key = $1 AND expires_at > NOW()',
      [key]
    );
    return res.rows[0]?.payload ?? null;
  }

  async set(key: string, provider: string, payload: unknown, ttlMs: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO geo_cache (key, provider, payload, expires_at)
       VALUES ($1, $2, $3::jsonb, NOW() + ($4::bigint * INTERVAL '1 millisecond'))
       ON CONFLICT (key) DO UPDATE
         SET provider = EXCLUDED.provider,
             payload = EXCLUDED.payload,
             expires_at = EXCLUDED.expires_at,
             created_at = NOW()`,
      [key, provider, JSON.stringify(payload), Math.round(ttlMs)]
    );
  }

  async purgeExpired(): Promise<number> {
    const res = await this.pool.query('DELETE FROM geo_cache WHERE expires_at <= NOW()');
    return res.rowCount ?? 0;
  }

  async close(): Promise<void> {
    // pool is shared and closed by its owner
  }
}

export interface CachedOptions {
  /** Skip the cache read (still writes the fresh value). */
  refresh?: boolean;
}

const inflight = new WeakMap<GeoCache, Map<string, Promise<unknown>>>();

/** Read-through cache with in-flight de-duplication so concurrent identical requests hit the upstream once. */
export async function cached<T>(
  cache: GeoCache,
  key: string,
  provider: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: CachedOptions = {}
): Promise<{ value: T; hit: boolean }> {
  if (!options.refresh) {
    const hit = await cache.get<T>(key);
    if (hit !== null) return { value: hit, hit: true };
  }
  let map = inflight.get(cache);
  if (!map) {
    map = new Map();
    inflight.set(cache, map);
  }
  const existing = map.get(key) as Promise<T> | undefined;
  if (existing) return { value: await existing, hit: true };

  const promise = (async () => {
    const value = await loader();
    await cache.set(key, provider, value, ttlMs);
    return value;
  })();
  map.set(key, promise);
  try {
    return { value: await promise, hit: false };
  } finally {
    map.delete(key);
  }
}
