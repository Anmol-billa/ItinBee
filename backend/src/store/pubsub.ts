import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';

export interface LiveTripEvent {
  type:
    | 'sync_delta'
    | 'poll_updated'
    | 'expense_added'
    | 'booking_ingested'
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

/**
 * Dual Realtime Pub/Sub, Quota Store & Ingestion Queue (`itinbee-kv` Redis + BullMQ in Render `singapore`,
 * or seamless in-memory EventEmitter + inline worker execution when `REDIS_URL` is unset).
 */
export class RealtimeAndQueueBus {
  public readonly mode: 'redis' | 'memory';
  private readonly emitter = new EventEmitter();
  private readonly memoryCounters = new Map<string, number>();
  private readonly memoryOtps = new Map<string, string>();

  private redisPub: Redis | null = null;
  private redisSub: Redis | null = null;
  private bullQueue: Queue<IngestJobPayload> | null = null;
  private bullWorker: Worker<IngestJobPayload> | null = null;
  private inlineHandler: ((payload: IngestJobPayload) => Promise<void>) | null =
    null;

  constructor(options?: { redisUrl?: string; runInlineWorker?: boolean }) {
    this.emitter.setMaxListeners(200);
    const redisUrl = options?.redisUrl?.trim();

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
    phone: string,
    code: string,
    ttlSeconds = 300
  ): Promise<void> {
    const key = `otp:${phone.trim()}`;
    if (this.redisPub) {
      await this.redisPub.set(key, code, 'EX', ttlSeconds);
    } else {
      this.memoryOtps.set(key, code);
    }
  }

  public async verifyAndConsumeOtpCode(
    phone: string,
    code: string
  ): Promise<boolean> {
    const key = `otp:${phone.trim()}`;
    if (this.redisPub) {
      const stored = await this.redisPub.get(key);
      if (stored && stored === code) {
        await this.redisPub.del(key);
        return true;
      }
      return false;
    }

    const stored = this.memoryOtps.get(key);
    if (stored && stored === code) {
      this.memoryOtps.delete(key);
      return true;
    }
    return false;
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
    if (this.redisPub) this.redisPub.disconnect();
    if (this.redisSub) this.redisSub.disconnect();
    this.emitter.removeAllListeners();
  }
}
