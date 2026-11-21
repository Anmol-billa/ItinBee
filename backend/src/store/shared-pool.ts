import pg from 'pg';

const { Pool } = pg;

export type PgPoolRole = 'web' | 'worker';

interface ManagedPoolEntry {
  pool: pg.Pool;
  refs: number;
}

const poolRegistry = new Map<string, ManagedPoolEntry>();

export function buildSharedPgPoolConfig(
  connectionString: string,
  role: PgPoolRole = 'web'
): pg.PoolConfig {
  const needsSsl =
    connectionString.includes('.render.com') ||
    connectionString.includes('sslmode=require');
  return {
    connectionString,
    max: role === 'worker' ? 5 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function registryKey(connectionString: string, role: PgPoolRole): string {
  return `${role}:${connectionString.trim()}`;
}

/**
 * Returns a shared, ref-counted `pg.Pool` keyed by `(connectionString, role)`
 * (`max: 10` for `'web'`, `max: 5` for `'worker'`) so web and worker processes
 * stay comfortably below Render PostgreSQL connection ceilings.
 */
export function getSharedPgPool(
  databaseUrl: string,
  role: PgPoolRole = 'web'
): pg.Pool {
  const key = registryKey(databaseUrl, role);
  const existing = poolRegistry.get(key);
  if (existing) {
    existing.refs += 1;
    return existing.pool;
  }

  const pool = new Pool(buildSharedPgPoolConfig(databaseUrl, role));
  pool.on('error', (err) => {
    console.error(`[pg-pool:${role}] Idle client error:`, err.message);
  });
  poolRegistry.set(key, { pool, refs: 1 });
  return pool;
}

export async function releaseSharedPgPool(
  databaseUrl: string,
  role: PgPoolRole = 'web'
): Promise<void> {
  const key = registryKey(databaseUrl, role);
  const entry = poolRegistry.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    poolRegistry.delete(key);
    await entry.pool.end().catch(() => {});
  }
}

export async function closeSharedPools(): Promise<void> {
  const entries = [...poolRegistry.values()];
  poolRegistry.clear();
  await Promise.all(entries.map((e) => e.pool.end().catch(() => {})));
}

/**
 * Retries a startup PostgreSQL operation (migrations / seeding) with exponential backoff
 * across up to 6 attempts (~45s total) so cold Render PostgreSQL instances wake up cleanly.
 */
export async function withStartupDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; delaysMs?: number[] }
): Promise<T> {
  const delaysMs = options?.delaysMs ?? [1500, 3000, 6000, 10000, 12000, 12500];
  const maxAttempts = options?.maxAttempts ?? delaysMs.length;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;
      const waitMs = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 5000;
      console.warn(
        `[db-startup] ${label} attempt ${attempt}/${maxAttempts} failed (${err instanceof Error ? err.message : String(err)}); retrying in ${waitMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}
