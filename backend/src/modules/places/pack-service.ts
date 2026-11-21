import { buildDestinationPack, isPackBuildable, type PackBuildOptions } from './pack-builder.js';
import type { PackProviders } from './providers/types.js';
import type { PlacesRepository } from './repository.js';
import type {
  DestinationRecord,
  PackStats,
  PackStatus,
  PlaceInput,
  PlaceRecord,
} from './types.js';
import { haversineMeters } from './util/geo.js';
import { namesSimilar } from './util/text.js';

export interface PackJobPayload {
  slug: string;
  force?: boolean;
  refresh?: boolean;
  /** The enqueuer already moved the destination to `building`. */
  claimed?: boolean;
}

export interface PackJobQueue {
  enqueuePackJob(payload: PackJobPayload): Promise<string>;
}

export class PackNotSupportedError extends Error {
  constructor(kind: string) {
    super(`Destination kind "${kind}" is an aggregate; build packs for its cities/areas instead.`);
    this.name = 'PackNotSupportedError';
  }
}

export interface PackServiceOptions {
  repo: PlacesRepository;
  providers: PackProviders;
  queue?: PackJobQueue;
  /** Packs older than this are served but refreshed in the background. */
  ttlDays?: number;
  /** After a failed build, wait this long before enqueuing another attempt on read. */
  retryCooldownMs?: number;
  /** A `building` lock older than this is considered crashed. */
  lockTimeoutMs?: number;
  now?: () => Date;
  log?: (message: string) => void;
  buildOptions?: Pick<PackBuildOptions, 'maxPerCategory' | 'enrich'>;
}

export interface RequestBuildResult {
  enqueued: boolean;
  status: PackStatus;
  reason: 'enqueued' | 'already-building' | 'fresh' | 'cooldown';
  jobId: string | null;
}

export interface RunBuildResult {
  skipped: boolean;
  status: PackStatus;
  stats: PackStats | null;
  error: string | null;
}

export class DestinationPackService {
  private readonly ttlMs: number;
  private readonly cooldownMs: number;
  private readonly lockTimeoutMs: number;
  private readonly running = new Map<string, Promise<RunBuildResult>>();

  constructor(private readonly options: PackServiceOptions) {
    this.ttlMs = (options.ttlDays ?? 45) * 24 * 3600_000;
    this.cooldownMs = options.retryCooldownMs ?? 10 * 60_000;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 20 * 60_000;
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }

  /** `ready` packs older than the TTL are reported as `stale` (still served). */
  effectiveStatus(dest: DestinationRecord): PackStatus {
    if (dest.packStatus === 'ready' && dest.packBuiltAt) {
      if (this.now().getTime() - Date.parse(dest.packBuiltAt) > this.ttlMs) return 'stale';
    }
    if (dest.packStatus === 'building' && dest.packStartedAt) {
      if (this.now().getTime() - Date.parse(dest.packStartedAt) > this.lockTimeoutMs) return 'stale';
    }
    return dest.packStatus;
  }

  /**
   * Idempotent: does nothing while a build is running, when the pack is fresh, or inside the retry cooldown.
   * Otherwise atomically claims the build (`none|stale -> building`) and enqueues exactly one job.
   */
  async requestBuild(
    dest: DestinationRecord,
    opts: { force?: boolean; refresh?: boolean } = {}
  ): Promise<RequestBuildResult> {
    if (!isPackBuildable(dest.kind)) throw new PackNotSupportedError(dest.kind);
    const force = opts.force ?? false;
    const eff = this.effectiveStatus(dest);

    if (!force) {
      if (dest.packStatus === 'building' && eff === 'building') {
        return { enqueued: false, status: 'building', reason: 'already-building', jobId: null };
      }
      if (eff === 'ready') {
        return { enqueued: false, status: 'ready', reason: 'fresh', jobId: null };
      }
      const attempted = dest.packAttemptedAt ? Date.parse(dest.packAttemptedAt) : 0;
      if (
        (eff === 'stale' || eff === 'none') &&
        dest.packError &&
        this.now().getTime() - attempted < this.cooldownMs
      ) {
        return { enqueued: false, status: eff, reason: 'cooldown', jobId: null };
      }
    }

    const claimed = await this.options.repo.tryBeginPackBuild(dest.id, {
      force: force || eff === 'stale',
      lockTimeoutMs: this.lockTimeoutMs,
      now: this.now(),
    });
    if (!claimed) {
      return { enqueued: false, status: 'building', reason: 'already-building', jobId: null };
    }
    const payload: PackJobPayload = {
      slug: dest.slug,
      force,
      refresh: opts.refresh ?? false,
      claimed: true,
    };
    if (!this.options.queue) {
      // no bus wired (CLI/tests): run in the background, still de-duplicated
      void this.runBuild(payload).catch(() => undefined);
      return { enqueued: true, status: 'building', reason: 'enqueued', jobId: null };
    }
    const jobId = await this.options.queue.enqueuePackJob(payload);
    return { enqueued: true, status: 'building', reason: 'enqueued', jobId };
  }

  /** Job processor (BullMQ worker / inline). Also used directly by `pack:build`. */
  runBuild(payload: PackJobPayload): Promise<RunBuildResult> {
    const inflight = this.running.get(payload.slug);
    if (inflight) return inflight;
    const promise = this.runBuildInner(payload).finally(() => this.running.delete(payload.slug));
    this.running.set(payload.slug, promise);
    return promise;
  }

  private async runBuildInner(payload: PackJobPayload): Promise<RunBuildResult> {
    const { repo } = this.options;
    const log = this.options.log ?? (() => undefined);
    const dest = await repo.getDestinationBySlug(payload.slug);
    if (!dest) return { skipped: true, status: 'none', stats: null, error: 'destination not found' };
    if (!isPackBuildable(dest.kind)) throw new PackNotSupportedError(dest.kind);

    if (!payload.claimed) {
      const ok = await repo.tryBeginPackBuild(dest.id, {
        force: payload.force ?? false,
        lockTimeoutMs: this.lockTimeoutMs,
        now: this.now(),
      });
      if (!ok) {
        return { skipped: true, status: dest.packStatus, stats: dest.packStats, error: null };
      }
    }

    try {
      const result = await buildDestinationPack(dest, this.options.providers, {
        now: this.options.now,
        refresh: payload.refresh,
        log,
        ...this.options.buildOptions,
      });
      if (result.places.length === 0 && result.degraded) {
        throw new Error(`No places built (${result.stats.warnings?.join(' | ') ?? 'providers failed'})`);
      }
      const curated = await this.mergeCuratedDuplicates(dest.id, result.places);
      await repo.upsertPlaces(dest.id, result.places, {
        pruneMissing: !result.degraded,
        removeRefIds: curated,
      });
      await repo.updateDestinationProfile(dest.id, {
        ...(result.profile.summary ? { summary: result.profile.summary } : {}),
        ...(result.profile.heroImage ? { heroImage: result.profile.heroImage } : {}),
        ...(result.profile.wikidataId ? { wikidataId: result.profile.wikidataId } : {}),
        ...(result.profile.wikipediaTitle ? { wikipediaTitle: result.profile.wikipediaTitle } : {}),
      });
      const status: PackStatus = result.degraded ? 'stale' : 'ready';
      await repo.finishPackBuild(dest.id, {
        status,
        builtAt: this.now().toISOString(),
        error: result.degraded ? (result.stats.warnings?.join(' | ') ?? 'degraded build') : null,
        stats: result.stats,
      });
      return { skipped: false, status, stats: result.stats, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await repo.finishPackBuild(dest.id, { status: 'stale', error: message.slice(0, 500) });
      return { skipped: false, status: 'stale', stats: null, error: message };
    }
  }

  /**
   * Hand-typed `curated` rows that the pack now covers are folded into the pack place (address / dietary hints /
   * provenance) and their own row is removed so the UI never lists the same place twice.
   */
  private async mergeCuratedDuplicates(
    destinationId: string,
    places: PlaceInput[]
  ): Promise<string[]> {
    const { rows } = await this.options.repo.queryPlaces({
      destinationIds: [destinationId],
      limit: 500,
      offset: 0,
    });
    const curated: PlaceRecord[] = rows
      .map((r) => r.place)
      .filter((p) => p.sources.some((s) => s.provider === 'curated'));
    const removed: string[] = [];
    for (const c of curated) {
      const twin = places.find(
        (p) =>
          (c.wikidataId !== null && p.wikidataId === c.wikidataId) ||
          (namesSimilar(p.name, c.name) &&
            haversineMeters({ lat: p.lat, lng: p.lng }, { lat: c.lat, lng: c.lng }) <= 450)
      );
      if (!twin) continue;
      twin.address ??= c.address;
      if (twin.dietaryHints.length === 0) twin.dietaryHints = c.dietaryHints;
      twin.nameLocal = { ...c.nameLocal, ...twin.nameLocal };
      twin.sources = [...twin.sources, ...c.sources.filter((s) => s.provider === 'curated')];
      removed.push(c.refId);
    }
    return removed;
  }
}
