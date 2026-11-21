import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import pg from 'pg';
import type { AppEnv } from '../../config/env.js';
import {
  defaultKmsEnvelope,
  type KmsEnvelopeService,
} from '../../security/kms-envelope.js';
import type { CurrencyCode } from '../../types/domain.js';
import type { TripStore } from '../../store/repository.js';
import type { ExploreService } from '../explore/explore-service.js';
import type { ParsedBookingCandidate } from '../ingest/parsers/irctc.js';
import type { PlacesServices } from '../places/places-module.js';
import type { TripIntent } from './intent.js';
import type { LlmProvider } from './llm/types.js';
import {
  IMPORT_LIMITS,
  normalizeInputs,
  type ImportInput,
} from './normalize.js';
import { SafeFetcher } from './safe-fetch.js';
import {
  extractTripIntent,
  type BaseTemplateContext,
} from './stage-a-intent.js';
import {
  buildGroundedItinerary,
  type DayStreamEvent,
} from './stage-b-planner.js';

const { Pool } = pg;

export type JobStatus =
  | 'queued'
  | 'understanding'
  | 'needs_review'
  | 'building'
  | 'done'
  | 'failed';

export type JobMode = 'ai' | 'basic';

export type PublicDetectedKind =
  | 'destination'
  | 'place'
  | 'dates'
  | 'travellers'
  | 'booking'
  | 'budget'
  | 'interest';

export type JobEvent =
  | { type: 'status'; data: { status: JobStatus; mode: JobMode } }
  | {
      type: 'detected';
      data: { kind: PublicDetectedKind; label: string; resolved?: boolean };
    }
  | { type: 'intent'; data: { intent: TripIntent } }
  | { type: 'day'; data: DayStreamEvent }
  | { type: 'done'; data: { tripId: string; shortId: string } }
  | { type: 'error'; data: { code: string; message: string } };

export interface JobState {
  id: string;
  status: JobStatus;
  mode: JobMode;
  intent?: TripIntent;
  tripId?: string;
  shortId?: string;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
}

export class ImportValidationError extends Error {
  public readonly code = 'invalid_input';
  constructor(message: string) {
    super(message);
    this.name = 'ImportValidationError';
  }
}

export class ImportQuotaError extends Error {
  public readonly code = 'quota_exceeded';
  constructor(
    message: string,
    public readonly resetAt: string
  ) {
    super(message);
    this.name = 'ImportQuotaError';
  }
}

export class ImportNotFoundError extends Error {
  public readonly code = 'not_found';
  constructor(message = 'Import job not found') {
    super(message);
    this.name = 'ImportNotFoundError';
  }
}

interface InternalJobRecord {
  id: string;
  ownerId: string;
  ipHash: string;
  locale: 'en' | 'hi';
  baseTripSlug?: string;
  allowAi: boolean;
  status: JobStatus;
  mode: JobMode;
  intent?: TripIntent;
  bookingCandidates: ParsedBookingCandidate[];
  events: JobEvent[];
  tripId?: string;
  shortId?: string;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
}

const VALID_PUBLIC_DETECTED = new Set<string>([
  'destination',
  'place',
  'dates',
  'travellers',
  'booking',
  'budget',
  'interest',
]);

function utcDayBucket(now = new Date()): { dayKey: string; resetAt: string } {
  const dayKey = now.toISOString().slice(0, 10);
  const nextMidnight = new Date(`${dayKey}T00:00:00.000Z`);
  nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
  return { dayKey, resetAt: nextMidnight.toISOString() };
}

function resolveCurrency(raw: string | null | undefined): CurrencyCode {
  const upper = (raw ?? 'INR').trim().toUpperCase();
  const allowed: CurrencyCode[] = ['INR', 'THB', 'VND', 'AED', 'JPY', 'EUR', 'USD'];
  return (allowed.includes(upper as CurrencyCode) ? upper : 'INR') as CurrencyCode;
}

export interface ImportJobServiceDeps {
  config: AppEnv;
  store: TripStore;
  places: PlacesServices;
  explore: ExploreService;
  llm: LlmProvider;
  fetcher?: SafeFetcher;
  kms?: KmsEnvelopeService;
  forceLocalStore?: boolean;
}

export class ImportJobService {
  private readonly jobs = new Map<string, InternalJobRecord>();
  private readonly quotas = new Map<string, { used: number; resetAt: string }>();
  private readonly emitter = new EventEmitter();
  private readonly stageAPromises = new Map<string, Promise<void>>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly fetcher: SafeFetcher;
  private readonly kms: KmsEnvelopeService;
  private pool: pg.Pool | null = null;

  constructor(private readonly deps: ImportJobServiceDeps) {
    this.emitter.setMaxListeners(500);
    this.fetcher = deps.fetcher ?? new SafeFetcher();
    this.kms = deps.kms ?? defaultKmsEnvelope;

    if (!deps.forceLocalStore && deps.config.DATABASE_URL) {
      const needsSsl =
        deps.config.DATABASE_URL.includes('.render.com') ||
        deps.config.DATABASE_URL.includes('sslmode=require');
      this.pool = new Pool({
        connectionString: deps.config.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30_000,
        ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      });
    }
  }

  private track(p: Promise<void>): void {
    this.inFlight.add(p);
    void p.finally(() => {
      this.inFlight.delete(p);
    });
  }

  public async waitForIdle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }

  public validateImportInput(input: ImportInput): void {
    const hasText = Boolean(input.text && input.text.trim().length > 0);
    const hasUrls = Boolean(input.urls && input.urls.length > 0);
    const hasFiles = Boolean(input.files && input.files.length > 0);

    if (!hasText && !hasUrls && !hasFiles) {
      throw new ImportValidationError(
        'Provide at least one of text, urls, or files to build an itinerary.'
      );
    }

    if (input.text && input.text.length > IMPORT_LIMITS.textChars) {
      throw new ImportValidationError(
        `Text exceeds the ${IMPORT_LIMITS.textChars}-character limit.`
      );
    }

    if (input.urls && input.urls.length > IMPORT_LIMITS.urls) {
      throw new ImportValidationError(
        `You can attach at most ${IMPORT_LIMITS.urls} links per import.`
      );
    }

    if (input.files && input.files.length > IMPORT_LIMITS.files) {
      throw new ImportValidationError(
        `You can attach at most ${IMPORT_LIMITS.files} files per import.`
      );
    }

    if (input.files && input.files.length > 0) {
      let bytes = 0;
      for (const f of input.files) {
        if (!f.dataBase64 || typeof f.dataBase64 !== 'string') {
          throw new ImportValidationError(`File "${f.name}" has empty data.`);
        }
        // Approximate decoded byte length (exact check via Buffer.byteLength)
        bytes += Buffer.byteLength(f.dataBase64, 'base64');
      }
      if (bytes > IMPORT_LIMITS.totalBytes) {
        throw new ImportValidationError('Attached files exceed the 8 MB total limit.');
      }
    }
  }

  private async bumpQuotaBucket(bucketKey: string, resetAt: string): Promise<number> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `INSERT INTO import_quotas (bucket_key, used, reset_at)
           VALUES ($1, 1, $2)
           ON CONFLICT (bucket_key)
           DO UPDATE SET
             used = CASE WHEN import_quotas.reset_at <= NOW() THEN 1 ELSE import_quotas.used + 1 END,
             reset_at = CASE WHEN import_quotas.reset_at <= NOW() THEN EXCLUDED.reset_at ELSE import_quotas.reset_at END
           RETURNING used`,
          [bucketKey, resetAt]
        );
        return Number(res.rows[0]?.used ?? 1);
      } catch {
        // Fallback to memory counter if table not migrated yet
      }
    }
    const existing = this.quotas.get(bucketKey);
    if (!existing || Date.parse(existing.resetAt) <= Date.now()) {
      this.quotas.set(bucketKey, { used: 1, resetAt });
      return 1;
    }
    existing.used += 1;
    return existing.used;
  }

  public async consumeAssistQuota(userId: string): Promise<void> {
    const limit = this.deps.config.IMPORT_DAILY_LIMIT_ASSIST;
    const { dayKey, resetAt } = utcDayBucket();
    const used = await this.bumpQuotaBucket(`assist:${dayKey}:${userId}`, resetAt);
    if (used > limit) {
      throw new ImportQuotaError('Daily Ask Itinbee limit reached.', resetAt);
    }
  }

  private async checkAndConsumeImportQuota(params: {
    ownerId: string;
    isGuest: boolean;
    ipHash: string;
  }): Promise<{ allowAi: boolean }> {
    const { dayKey, resetAt } = utcDayBucket();
    const userLimit = params.isGuest
      ? this.deps.config.IMPORT_DAILY_LIMIT_GUEST
      : this.deps.config.IMPORT_DAILY_LIMIT_USER;
    const ipLimit = this.deps.config.IMPORT_DAILY_LIMIT_IP;
    const globalAiCap = this.deps.config.IMPORT_DAILY_GLOBAL_CAP;

    const userUsed = await this.bumpQuotaBucket(
      `import:user:${dayKey}:${params.ownerId}`,
      resetAt
    );
    if (userUsed > userLimit) {
      throw new ImportQuotaError(
        params.isGuest
          ? 'Daily guest import limit reached. Sign in for a higher daily allowance.'
          : 'Daily import limit reached.',
        resetAt
      );
    }

    const ipUsed = await this.bumpQuotaBucket(
      `import:ip:${dayKey}:${params.ipHash}`,
      resetAt
    );
    if (ipUsed > ipLimit) {
      throw new ImportQuotaError('Daily import limit reached for this network.', resetAt);
    }

    if (!this.deps.llm.available || globalAiCap <= 0) {
      return { allowAi: false };
    }

    const globalUsed = await this.bumpQuotaBucket(`import:global_ai:${dayKey}`, resetAt);
    return { allowAi: globalUsed <= globalAiCap };
  }

  private async persistJob(job: InternalJobRecord): Promise<void> {
    if (!this.pool) return;
    try {
      const candidatesEnc =
        job.bookingCandidates.length > 0
          ? await this.kms.encryptString(
              JSON.stringify(job.bookingCandidates),
              `import_job:${job.id}:bookings`
            )
          : null;
      await this.pool.query(
        `INSERT INTO import_jobs (
           id, owner_id, client_ip_hash, status, mode, locale, base_trip_slug,
           intent, booking_candidates_enc, events, trip_id, short_id, error, created_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13::jsonb, $14, $15
         )
         ON CONFLICT (id) DO UPDATE SET
           owner_id = EXCLUDED.owner_id,
           status = EXCLUDED.status,
           mode = EXCLUDED.mode,
           intent = EXCLUDED.intent,
           booking_candidates_enc = EXCLUDED.booking_candidates_enc,
           events = EXCLUDED.events,
           trip_id = EXCLUDED.trip_id,
           short_id = EXCLUDED.short_id,
           error = EXCLUDED.error,
           updated_at = EXCLUDED.updated_at`,
        [
          job.id,
          job.ownerId,
          job.ipHash,
          job.status,
          job.mode,
          job.locale,
          job.baseTripSlug ?? null,
          job.intent ? JSON.stringify(job.intent) : null,
          candidatesEnc,
          JSON.stringify(job.events),
          job.tripId ?? null,
          job.shortId ?? null,
          job.error ? JSON.stringify(job.error) : null,
          job.createdAt,
          job.updatedAt,
        ]
      );
    } catch {
      // Keep running with in-memory copy if PG table unavailable
    }
  }

  private async loadJobFromDbIfNeeded(jobId: string): Promise<InternalJobRecord | null> {
    const mem = this.jobs.get(jobId);
    if (mem) return mem;
    if (!this.pool) return null;

    try {
      const res = await this.pool.query(
        'SELECT * FROM import_jobs WHERE id = $1 LIMIT 1',
        [jobId]
      );
      const row = res.rows[0];
      if (!row) return null;

      let bookingCandidates: ParsedBookingCandidate[] = [];
      if (row.booking_candidates_enc) {
        try {
          const dec = await this.kms.decryptString(
            row.booking_candidates_enc as Buffer,
            `import_job:${jobId}:bookings`
          );
          bookingCandidates = JSON.parse(dec) as ParsedBookingCandidate[];
        } catch {
          bookingCandidates = [];
        }
      }

      const loaded: InternalJobRecord = {
        id: String(row.id),
        ownerId: String(row.owner_id),
        ipHash: String(row.client_ip_hash ?? ''),
        locale: row.locale === 'hi' ? 'hi' : 'en',
        baseTripSlug: row.base_trip_slug ? String(row.base_trip_slug) : undefined,
        allowAi: row.mode === 'ai',
        status: row.status as JobStatus,
        mode: row.mode as JobMode,
        intent: (row.intent as TripIntent | null) ?? undefined,
        bookingCandidates,
        events: (row.events as JobEvent[]) ?? [],
        tripId: row.trip_id ? String(row.trip_id) : undefined,
        shortId: row.short_id ? String(row.short_id) : undefined,
        error: (row.error as { code: string; message: string } | null) ?? undefined,
        createdAt: new Date(String(row.created_at)).toISOString(),
        updatedAt: new Date(String(row.updated_at)).toISOString(),
      };
      this.jobs.set(jobId, loaded);
      return loaded;
    } catch {
      return null;
    }
  }

  private appendEvent(job: InternalJobRecord, event: JobEvent): void {
    job.events.push(event);
    job.updatedAt = new Date().toISOString();
    this.emitter.emit(`job:${job.id}`, event);
  }

  private toJobState(job: InternalJobRecord): JobState {
    return {
      id: job.id,
      status: job.status,
      mode: job.mode,
      ...(job.intent ? { intent: job.intent } : {}),
      ...(job.tripId ? { tripId: job.tripId } : {}),
      ...(job.shortId ? { shortId: job.shortId } : {}),
      ...(job.error ? { error: job.error } : {}),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  public async createJob(params: {
    input: ImportInput;
    ownerId: string;
    isGuest: boolean;
    ipHash: string;
  }): Promise<{ jobId: string; status: 'queued'; eventsUrl: string }> {
    this.validateImportInput(params.input);
    const { allowAi } = await this.checkAndConsumeImportQuota({
      ownerId: params.ownerId,
      isGuest: params.isGuest,
      ipHash: params.ipHash,
    });

    const jobId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const initialMode: JobMode =
      allowAi && this.deps.llm.available ? 'ai' : 'basic';

    const job: InternalJobRecord = {
      id: jobId,
      ownerId: params.ownerId,
      ipHash: params.ipHash,
      locale: params.input.locale ?? 'en',
      baseTripSlug: params.input.baseTripSlug,
      allowAi,
      status: 'queued',
      mode: initialMode,
      bookingCandidates: [],
      events: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.jobs.set(jobId, job);
    // Keep memory bounded in long dev runs
    if (this.jobs.size > 500) {
      const oldestKey = this.jobs.keys().next().value as string | undefined;
      if (oldestKey && oldestKey !== jobId) this.jobs.delete(oldestKey);
    }

    this.appendEvent(job, {
      type: 'status',
      data: { status: 'queued', mode: job.mode },
    });
    await this.persistJob(job);

    const stageAPromise = (async () => {
      await Promise.resolve();
      await this.runStageA(job, params.input);
    })();
    this.stageAPromises.set(jobId, stageAPromise);
    this.track(
      stageAPromise.finally(() => {
        this.stageAPromises.delete(jobId);
      })
    );

    return {
      jobId,
      status: 'queued',
      eventsUrl: `/v1/import/jobs/${jobId}/events`,
    };
  }

  private async runStageA(job: InternalJobRecord, input: ImportInput): Promise<void> {
    try {
      job.status = 'understanding';
      this.appendEvent(job, {
        type: 'status',
        data: { status: 'understanding', mode: job.mode },
      });

      const normalized = await normalizeInputs(input, {
        fetcher: this.fetcher,
        multimodal: job.allowAi && this.deps.llm.available,
      });
      job.bookingCandidates = normalized.bookingCandidates;

      // Resolve optional baseTripSlug from ExploreService
      let baseTemplate: BaseTemplateContext | null = null;
      if (input.baseTripSlug) {
        const tpl = await this.deps.explore.getDetail(input.baseTripSlug);
        if (tpl) {
          baseTemplate = {
            slug: tpl.slug,
            title: tpl.title,
            destinations: tpl.destinations,
            durationDays: tpl.durationDays,
          };
        }
      }

      const stageA = await extractTripIntent(normalized, {
        llm: this.deps.llm,
        places: this.deps.places,
        locale: job.locale,
        baseTemplate,
        allowAi: job.allowAi,
      });

      job.mode = stageA.mode;
      job.intent = stageA.intent;

      // Emit public detected chips (strictly the 7 contract kinds)
      const emittedKeys = new Set<string>();
      for (const det of [...normalized.detected, ...stageA.detected]) {
        if (!VALID_PUBLIC_DETECTED.has(det.kind)) continue;
        const dedupeKey = `${det.kind}:${det.label.toLowerCase()}`;
        if (emittedKeys.has(dedupeKey)) continue;
        emittedKeys.add(dedupeKey);
        this.appendEvent(job, {
          type: 'detected',
          data: {
            kind: det.kind as PublicDetectedKind,
            label: det.label,
            ...(det.resolved !== undefined ? { resolved: det.resolved } : {}),
          },
        });
      }

      this.appendEvent(job, {
        type: 'intent',
        data: { intent: stageA.intent },
      });

      job.status = 'needs_review';
      this.appendEvent(job, {
        type: 'status',
        data: { status: 'needs_review', mode: job.mode },
      });
      await this.persistJob(job);
    } catch (err) {
      job.status = 'failed';
      job.error = {
        code: 'extract_failed',
        message:
          err instanceof Error
            ? err.message
            : 'Could not extract trip details from input.',
      };
      this.appendEvent(job, {
        type: 'error',
        data: job.error,
      });
      await this.persistJob(job);
    }
  }

  public async getJobState(jobId: string): Promise<JobState | null> {
    const job = await this.loadJobFromDbIfNeeded(jobId);
    if (!job) return null;
    return this.toJobState(job);
  }

  public async confirmJob(params: {
    jobId: string;
    intent: TripIntent;
    answers?: Record<string, string>;
    callerOwnerId: string;
  }): Promise<{ status: 'building' }> {
    // Wait for Stage A if caller confirmed while Stage A was still finishing
    const pendingA = this.stageAPromises.get(params.jobId);
    if (pendingA) {
      await pendingA;
    }

    const job = await this.loadJobFromDbIfNeeded(params.jobId);
    if (!job) {
      throw new ImportNotFoundError();
    }

    // Idempotent: repeated confirm calls on building/done jobs succeed without duplicating trips
    if (job.status === 'building' || job.status === 'done') {
      return { status: 'building' };
    }

    if (params.callerOwnerId) {
      job.ownerId = params.callerOwnerId;
    }

    job.status = 'building';
    job.intent = params.intent;
    this.appendEvent(job, {
      type: 'status',
      data: { status: 'building', mode: job.mode },
    });
    await this.persistJob(job);

    const stageBPromise = (async () => {
      await Promise.resolve();
      await this.runStageB(job, params.intent, params.answers);
    })();
    this.track(stageBPromise);

    return { status: 'building' };
  }

  private async runStageB(
    job: InternalJobRecord,
    confirmedIntent: TripIntent,
    answers?: Record<string, string>
  ): Promise<void> {
    try {
      const stageB = await buildGroundedItinerary({
        intent: confirmedIntent,
        answers,
        llm: this.deps.llm,
        places: this.deps.places,
        allowAi: job.allowAi,
        onDay: (dayEvt) => {
          this.appendEvent(job, { type: 'day', data: dayEvt });
        },
      });

      job.mode = stageB.mode;
      job.intent = stageB.intent;

      // Persist Trip + Days + Items into TripStore
      const itemIdsByBookingAnchor = new Map<number, string>();
      const claimItems: Array<{
        id: string;
        dayNumber: number;
        kind: (typeof stageB.days)[number]['stops'][number]['kind'];
        title: string;
        notes: string;
        lat: number | null;
        lng: number | null;
        placeRefId: string | null;
        startTime: string;
        durationMins: number;
        transitMeta: (typeof stageB.days)[number]['stops'][number]['transitMeta'];
        dietaryFlags: string[];
        accessibilityNotes: string;
        elderSummaryI18n?: { en?: string; hi?: string };
      }> = [];

      for (const d of stageB.days) {
        for (const st of d.stops) {
          const itemId = crypto.randomUUID();
          if (st.bookingAnchorIndex !== undefined) {
            itemIdsByBookingAnchor.set(st.bookingAnchorIndex, itemId);
          }
          claimItems.push({
            id: itemId,
            dayNumber: d.dayNumber,
            kind: st.kind,
            title: st.title,
            notes: st.notes,
            lat: st.lat,
            lng: st.lng,
            placeRefId: st.placeRefId,
            startTime: st.startTime,
            durationMins: st.durationMins,
            transitMeta: st.transitMeta,
            dietaryFlags: st.dietaryFlags,
            accessibilityNotes: st.accessibilityNotes,
            elderSummaryI18n: st.elderSummaryI18n,
          });
        }
      }

      const destSummary = `${stageB.intent.destinations.map((d) => d.name).join(' · ')} (${stageB.days.length}D)`;
      const startDate = stageB.days[0]?.date ?? stageB.intent.dates.start ?? null;
      const endDate =
        stageB.days[stageB.days.length - 1]?.date ?? stageB.intent.dates.end ?? null;

      const ws = await this.deps.store.claimSandboxTrip({
        ownerId: job.ownerId,
        title: stageB.intent.title,
        destinationSummary: destSummary.slice(0, 240),
        startDate,
        endDate,
        homeCurrency: resolveCurrency(stageB.intent.budget.currency),
        elderModeEnabled: Boolean(
          stageB.intent.travellers.hasSeniors ||
            stageB.intent.travellers.group === 'seniors'
        ),
        days: stageB.days.map((d) => ({
          dayNumber: d.dayNumber,
          date: d.date,
          themeTitle: d.title,
          pacingLevel: d.pacingLevel,
        })),
        items: claimItems,
      });

      // Persist encrypted vault Booking records for any deterministically parsed tickets
      for (let i = 0; i < job.bookingCandidates.length; i += 1) {
        const cand = job.bookingCandidates[i]!;
        await this.deps.store.createBooking({
          tripId: ws.trip.id,
          itemId: itemIdsByBookingAnchor.get(i) ?? null,
          provider: cand.provider,
          pnr: cand.pnr,
          passengers: cand.passengers,
          summary: cand.summary,
          lowConfidenceFields: cand.lowConfidenceFields,
          status: cand.status,
          parserConfidence: cand.parserConfidence,
        });
      }

      job.tripId = ws.trip.id;
      job.shortId = ws.trip.shortId;
      job.status = 'done';

      this.appendEvent(job, {
        type: 'done',
        data: { tripId: ws.trip.id, shortId: ws.trip.shortId },
      });
      await this.persistJob(job);
    } catch (err) {
      job.status = 'failed';
      job.error = {
        code: 'build_failed',
        message:
          err instanceof Error
            ? err.message
            : 'Could not finish building itinerary.',
      };
      this.appendEvent(job, {
        type: 'error',
        data: job.error,
      });
      await this.persistJob(job);
    }
  }

  public async subscribeEvents(
    jobId: string,
    onEvent: (event: JobEvent) => void
  ): Promise<{
    history: JobEvent[];
    status: JobStatus;
    unsubscribe: () => void;
  } | null> {
    const job = await this.loadJobFromDbIfNeeded(jobId);
    if (!job) return null;

    const history = [...job.events];
    const channel = `job:${job.id}`;
    this.emitter.on(channel, onEvent);

    return {
      history,
      status: job.status,
      unsubscribe: () => {
        this.emitter.off(channel, onEvent);
      },
    };
  }

  public async close(): Promise<void> {
    await this.waitForIdle();
    this.emitter.removeAllListeners();
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
