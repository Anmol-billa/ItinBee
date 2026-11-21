import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
import type { PackJobPayload } from '../modules/places/pack-service.js';

export interface LiveTripEvent {
  type:
    | 'sync_delta'
    | 'trip_updated'
    | 'member_updated'
    | 'poll_updated'
    | 'expense_added'
    | 'expense_deleted'
    | 'booking_ingested'
    | 'booking_deleted'
    | 'cursor_presence';
  tripId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface IngestJobPayload {
  jobType: 'text' | 'link';
  tripId?: string;
  rawText: string;
}

interface MemoryOtpEntry {
  code: string;
  expiresAt: number;
}

/**
 * Dual Realtime Pub/Sub, Quota Store & Ingestion Queue (`itinbee-kv` Redis + BullMQ in Render `singapore`,
 * or seamless in-memory EventEmitter + inline worker execution when `REDIS_URL` is unset).
 */
export class RealtimeAndQueueBus {
  public readonly mode: 'redis' | 'memory';
  private readonly emitter = new EventEmitter();
  private readonly memoryCounters = new Map<string, number>();
  private readonly memoryOtps = new Map<string, MemoryOtpEntry>();
  private readonly memorySlidingWindows = new Map<string, number[]>();

  private redisPub: Redis | null = null;
  private redisSub: Redis | null = null;
  private bullQueue: Queue<IngestJobPayload> | null = null;
  private bullWorker: Worker<IngestJobPayload> | null = null;
  private inlineHandler: ((payload: IngestJobPayload) => Promise<void>) | null =
    null;
  private packQueue: Queue<PackJobPayload> | null = null;
  private packWorker: Worker<PackJobPayload> | null = null;
  private packHandler: ((payload: PackJobPayload) => Promise<unknown>) | null = null;
  private readonly inlinePackJobs = new Map<string, Promise<void>>();

  private redisUrlForWorker: string | null = null;

  constructor(options?: { redisUrl?: string; runInlineWorker?: boolean }) {
    this.emitter.setMaxListeners(200);
    const redisUrl = options?.redisUrl?.trim();
    if (redisUrl && options?.runInlineWorker !== false) {
      this.redisUrlForWorker = redisUrl;
    }

    if (redisUrl) {
      this.mode = 'redis';
      this.redisPub = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      this.redisSub = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });

      this.redisSub.on('message', (channel: string, message: string) => {
        if (channel.startsWith('trip:live:')) {
          try {
            const parsed = JSON.parse(message) as LiveTripEvent;
            this.emitter.emit(channel, parsed);
          } catch {
            // Ignore malformed message
          }
        }
      });

      this.bullQueue = new Queue<IngestJobPayload>('itinbee-ingest', {
        connection: { url: redisUrl },
      });
      this.packQueue = new Queue<PackJobPayload>('itinbee-packs', {
        connection: { url: redisUrl },
      });

      if (options?.runInlineWorker !== false) {
        this.startBullWorker(redisUrl);
      }
    } else {
      this.mode = 'memory';
    }
  }

  public startBullWorker(redisUrl: string): void {
    if (this.bullWorker) return;
    this.bullWorker = new Worker<IngestJobPayload>(
      'itinbee-ingest',
      async (job: Job<IngestJobPayload>) => {
        if (this.inlineHandler) {
          await this.inlineHandler(job.data);
        }
      },
      { connection: { url: redisUrl } }
    );
  }

  /** Registers the `build-destination-pack` processor (inline in memory mode, BullMQ worker in redis mode). */
  public registerPackProcessor(
    handler: (payload: PackJobPayload) => Promise<unknown>
  ): void {
    this.packHandler = handler;
    if (this.mode === 'redis' && this.redisUrlForWorker && !this.packWorker) {
      this.startPackWorker(this.redisUrlForWorker);
    }
  }

  private startPackWorker(redisUrl: string): void {
    if (this.packWorker) return;
    this.packWorker = new Worker<PackJobPayload>(
      'itinbee-packs',
      async (job: Job<PackJobPayload>) => {
        if (this.packHandler) await this.packHandler(job.data);
      },
      { connection: { url: redisUrl }, concurrency: 3 }
    );
  }

  /**
   * Enqueues a `build-destination-pack` job. Idempotent per slug: BullMQ de-duplicates on jobId
   * (`pack-<slug>`) and the inline path shares the in-flight promise.
   */
  public async enqueuePackJob(payload: PackJobPayload): Promise<string> {
    const jobId = `pack-${payload.slug}`;
    if (this.packQueue) {
      await this.packQueue.add('build-destination-pack', payload, {
        jobId,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 1,
      });
      return jobId;
    }
    if (!this.inlinePackJobs.has(payload.slug)) {
      const run = (async () => {
        // detach from the request: yield once so the caller's response is not blocked by the build
        await Promise.resolve();
        if (this.packHandler) await this.packHandler(payload);
      })()
        .catch((err) => {
          console.error('[itinbee] build-destination-pack failed:', err);
        })
        .finally(() => {
          this.inlinePackJobs.delete(payload.slug);
        });
      this.inlinePackJobs.set(payload.slug, run);
    }
    return jobId;
  }

  /** Resolves when all inline pack jobs have settled (tests, CLI). */
  public async waitForPackJobs(): Promise<void> {
    await Promise.all([...this.inlinePackJobs.values()]);
  }

  public registerIngestProcessor(
    handler: (payload: IngestJobPayload) => Promise<void>
  ): void {
    this.inlineHandler = handler;
  }

  public async enqueueIngestJob(payload: IngestJobPayload): Promise<string> {
    if (this.bullQueue) {
      const job = await this.bullQueue.add('ingest', payload, {
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      return job.id ?? `job-${Date.now()}`;
    }

    const jobId = `inline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (this.inlineHandler) {
      await this.inlineHandler(payload);
    }
    return jobId;
  }

  public async checkHealth(): Promise<{ ok: boolean; detail: string }> {
    if (this.mode === 'memory') {
      return { ok: true, detail: 'In-memory PubSub & inline queue active' };
    }
    try {
      const pong = await this.redisPub!.ping();
      return { ok: pong === 'PONG', detail: 'Redis PubSub & BullMQ connected' };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : 'Redis health error',
      };
    }
  }

  public async publishTripEvent(event: LiveTripEvent): Promise<void> {
    const channel = `trip:live:${event.tripId}`;
    if (this.redisPub) {
      await this.redisPub.publish(channel, JSON.stringify(event));
    } else {
      this.emitter.emit(channel, event);
    }
  }

  public async subscribeTripRoom(
    tripId: string,
    listener: (event: LiveTripEvent) => void
  ): Promise<() => Promise<void>> {
    const channel = `trip:live:${tripId}`;
    if (this.redisSub && this.emitter.listenerCount(channel) === 0) {
      await this.redisSub.subscribe(channel);
    }
    this.emitter.on(channel, listener);

    return async () => {
      this.emitter.off(channel, listener);
      if (this.redisSub && this.emitter.listenerCount(channel) === 0) {
        await this.redisSub.unsubscribe(channel);
      }
    };
  }

  public async storeOtpCode(
    identifier: string,
    code: string,
    ttlSeconds = 300
  ): Promise<void> {
    const key = `otp:${identifier.trim()}`;
    if (this.redisPub) {
      await this.redisPub.set(key, code, 'EX', ttlSeconds);
    } else {
      this.memoryOtps.set(key, {
        code,
        expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
      });
    }
  }

  public async verifyAndConsumeOtpCode(
    identifier: string,
    code: string
  ): Promise<boolean> {
    const key = `otp:${identifier.trim()}`;
    if (this.redisPub) {
      const stored = await this.redisPub.get(key);
      if (stored && stored === code) {
        await this.redisPub.del(key);
        return true;
      }
      return false;
    }

    const entry = this.memoryOtps.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.memoryOtps.delete(key);
      return false;
    }
    if (entry.code === code) {
      this.memoryOtps.delete(key);
      return true;
    }
    return false;
  }

  public async deleteOtpCode(identifier: string): Promise<void> {
    const key = `otp:${identifier.trim()}`;
    if (this.redisPub) {
      await this.redisPub.del(key);
    } else {
      this.memoryOtps.delete(key);
    }
  }

  /**
   * Sliding-window rate limit check backed by Redis sorted sets or in-memory timestamps.
   */
  public async consumeSlidingWindow(
    bucketKey: string,
    maxRequests: number,
    windowMs: number
  ): Promise<{ allowed: boolean; count: number; retryAfterSeconds: number }> {
    const now = Date.now();
    const cutoff = now - windowMs;
    const key = `rl:${bucketKey}`;

    if (this.redisPub) {
      const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
      await this.redisPub
        .multi()
        .zremrangebyscore(key, 0, cutoff)
        .zadd(key, now, member)
        .zcard(key)
        .pexpire(key, windowMs)
        .exec();
      const count = await this.redisPub.zcard(key);
      const allowed = count <= maxRequests;
      return {
        allowed,
        count,
        retryAfterSeconds: allowed ? 0 : Math.ceil(windowMs / 1000),
      };
    }

    const existing = this.memorySlidingWindows.get(key) ?? [];
    const filtered = existing.filter((ts) => ts > cutoff);
    filtered.push(now);
    this.memorySlidingWindows.set(key, filtered);
    const count = filtered.length;
    const allowed = count <= maxRequests;
    return {
      allowed,
      count,
      retryAfterSeconds: allowed ? 0 : Math.ceil(windowMs / 1000),
    };
  }

  /**
   * Enforces hard per-trip Trip Pass quotas (`15` WhatsApp alerts / `6` B2B transport polls per trip).
   */
  public async consumeTripQuota(
    tripId: string,
    quotaKind: 'b2b_poll' | 'whatsapp_alert',
    limit: number
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    const key = `quota:${tripId}:${quotaKind}`;
    if (this.redisPub) {
      const used = await this.redisPub.incr(key);
      return { allowed: used <= limit, used, limit };
    }
    const used = (this.memoryCounters.get(key) ?? 0) + 1;
    this.memoryCounters.set(key, used);
    return { allowed: used <= limit, used, limit };
  }

  public async close(): Promise<void> {
    if (this.bullWorker) await this.bullWorker.close();
    if (this.bullQueue) await this.bullQueue.close();
    if (this.packWorker) await this.packWorker.close();
    if (this.packQueue) await this.packQueue.close();
    if (this.redisPub) this.redisPub.disconnect();
    if (this.redisSub) this.redisSub.disconnect();
    this.emitter.removeAllListeners();
  }
}
