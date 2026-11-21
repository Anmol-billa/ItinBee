import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {
  defaultKmsEnvelope,
  type KmsEnvelopeService,
} from '../security/kms-envelope.js';
import {
  extractPnrLast3,
  maskPnrLast3,
  sanitizePassengerMeta,
  type RawPassengerMeta,
} from '../security/aadhaar-redactor.js';
import { hashIdentifier } from '../security/auth-tokens.js';
import {
  applySyncMutationsToState,
  projectOrderedItems,
  type SyncStateSnapshot,
} from '../modules/sync/sync-engine.js';
import {
  betweenSortKeys,
  generateInitialSortKeys,
} from '../modules/sync/lexorank.js';
import { formatHlc } from '../modules/sync/hlc.js';
import { buildGoogleMapsPlaceUrl } from '../modules/geo/curated-india-pois.js';
import { getVaultQuotaForTier } from '../modules/ingest/s3-vault.js';
import { convertMinorToInrMinor } from '../modules/ledger/fx-rates.js';
import {
  computeExpenseSplitsInrMinor,
  computeSimplifiedSettlements,
  type LedgerMemberContext,
} from '../modules/ledger/upi-ledger.js';
import {
  buildOutboundChecklist,
  buildWhatsappDigestText,
  type CastPollVoteInput,
  type CreateBookingInput,
  type CreateExpenseInput,
  type CreateKittyPoolInput,
  type CreatePollInput,
  type CreateTripInput,
  type SandboxClaimInput,
  type TripStore,
} from './repository.js';
import { buildPreSeededSampleDataset } from './seed-data.js';
import type {
  BookingProvider,
  BookingRedactedView,
  BookingStatus,
  BookingSummaryPublic,
  BookingVaultView,
  CurrencyCode,
  ExpenseEntryType,
  ExpenseView,
  GuestShareResponse,
  ItineraryItem,
  KittyPoolView,
  MemberRole,
  PacingLevel,
  PollView,
  SplitMode,
  SyncClientMutation,
  SyncServerDelta,
  TripDay,
  TripMemberPublic,
  TripMeta,
  TripWorkspaceResponse,
  UpiSettlementInstruction,
  UserPublic,
} from '../types/domain.js';

const { Pool } = pg;

function generateShortId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 5);
  const rand = crypto.randomBytes(3).toString('hex').slice(0, 5);
  return `${slug || 'trip'}-${rand}`.slice(0, 12);
}

function buildPgPoolConfig(connectionString: string): pg.PoolConfig {
  const needsSsl =
    connectionString.includes('.render.com') ||
    connectionString.includes('sslmode=require');
  return {
    connectionString,
    max: 15,
    idleTimeoutMillis: 30_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export async function runSqlMigrations(
  connectionString: string,
  migrationsDir: string
): Promise<string[]> {
  const pool = new Pool(buildPgPoolConfig(connectionString));
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const entries = await fs.readdir(migrationsDir);
    const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();
    const applied: string[] = [];

    for (const file of sqlFiles) {
      const check = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (check.rowCount && check.rowCount > 0) {
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    return applied;
  } finally {
    await pool.end();
  }
}

export async function ensureSeedDataInPostgres(
  connectionString: string,
  kms: KmsEnvelopeService = defaultKmsEnvelope
): Promise<void> {
  const pool = new Pool(buildPgPoolConfig(connectionString));
  try {
    const seed = buildPreSeededSampleDataset();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const u of seed.users) {
        const phoneHash = hashIdentifier(u.phone);
        const phoneEnc = await kms.encryptString(u.phone, `user:${u.id}:phone`);
        const upiEnc = await kms.encryptString(u.upiVpa, `user:${u.id}:upi`);
        await client.query(
          `INSERT INTO users (id, phone_hash, phone_enc, display_name, preferred_lang, upi_vpa_enc, tier)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [u.id, phoneHash, phoneEnc, u.displayName, u.preferredLang, upiEnc, u.tier]
        );
      }

      for (const t of seed.trips) {
        const existingTrip = await client.query(
          'SELECT 1 FROM trips WHERE id = $1 LIMIT 1',
          [t.id]
        );
        if (existingTrip.rowCount && existingTrip.rowCount > 0) {
          continue;
        }

        let seq = 1;
        await client.query(
          `INSERT INTO trips (id, short_id, title, destination_summary, start_date, end_date, home_currency, is_public_template, is_sample, elder_mode_enabled, latest_seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, TRUE, $8, 1)
           ON CONFLICT (id) DO NOTHING`,
          [
            t.id,
            t.shortId,
            t.title,
            t.destinationSummary,
            t.startDate,
            t.endDate,
            t.homeCurrency,
            t.elderModeEnabled,
          ]
        );

        for (const m of t.members) {
          await client.query(
            `INSERT INTO trip_members (trip_id, user_id, role, vault_access, dietary_tags)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (trip_id, user_id) DO NOTHING`,
            [t.id, m.userId, m.role, m.vaultAccess, m.dietaryTags]
          );
        }

        for (const d of t.days) {
          const dayHlc = formatHlc({ wallMs: 1763596800000 + seq, logical: 0, nodeId: 'seed' });
          await client.query(
            `INSERT INTO trip_days (id, trip_id, day_number, date, theme_title, pacing_level, server_seq, hlc_timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [d.id, t.id, d.dayNumber, d.date, d.themeTitle, d.pacingLevel, seq++, dayHlc]
          );

          const sortKeys = generateInitialSortKeys(d.items.length);
          for (let i = 0; i < d.items.length; i++) {
            const item = d.items[i]!;
            const itemHlc = formatHlc({ wallMs: 1763596800000 + seq, logical: 0, nodeId: 'seed' });
            await client.query(
              `INSERT INTO itinerary_items (
                 id, trip_id, day_id, kind, title, notes, location, lat, lng,
                 place_ref_id, address_local_script, sort_key, start_time, duration_mins,
                 dietary_flags, accessibility_notes, elder_summary_i18n, is_shortlist, server_seq, hlc_timestamp
               )
               VALUES (
                 $1, $2, $3, $4, $5, $6,
                 ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography,
                 $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, FALSE, $17, $18
               )
               ON CONFLICT (id) DO NOTHING`,
              [
                item.id,
                t.id,
                d.id,
                item.kind,
                item.title,
                item.notes,
                item.lat,
                item.lng,
                item.placeRefId,
                item.addressLocalScript,
                sortKeys[i]!,
                item.startTime,
                item.durationMins,
                item.dietaryFlags,
                item.accessibilityNotes,
                JSON.stringify(item.elderSummaryI18n),
                seq++,
                itemHlc,
              ]
            );
          }
        }

        for (const b of t.bookings) {
          const pnrEnc = await kms.encryptString(
            b.pnrPlain,
            `booking:${t.id}:${b.id}:pnr`
          );
          const pnrLast3 = extractPnrLast3(b.pnrPlain);
          const sanitizedPax = sanitizePassengerMeta(b.passengers, true);
          const paxEnc = await kms.encryptString(
            JSON.stringify(sanitizedPax),
            `booking:${t.id}:${b.id}:pax`
          );
          const summaryPublic: BookingSummaryPublic = {
            headline: b.summaryHeadline,
            routeLabel: b.routeLabel,
            vehicleNumber: b.vehicleNumber,
            coach: b.coach,
            seatOrBerth: b.seatOrBerth,
          };
          await client.query(
            `INSERT INTO bookings (
               id, trip_id, item_id, provider, pnr_enc, pnr_last3, passenger_meta_enc,
               summary_public, status, raw_doc_s3_key, parser_confidence
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [
              b.id,
              t.id,
              b.itemId,
              b.provider,
              pnrEnc,
              pnrLast3,
              paxEnc,
              JSON.stringify(summaryPublic),
              b.status,
              b.rawDocS3Key,
              b.parserConfidence,
            ]
          );
        }

        for (const p of t.polls) {
          await client.query(
            `INSERT INTO polls (id, trip_id, question, options, created_by)
             VALUES ($1, $2, $3, $4::jsonb, $5)
             ON CONFLICT (id) DO NOTHING`,
            [p.id, t.id, p.question, JSON.stringify(p.options), t.members[0]?.userId ?? null]
          );
        }

        await client.query('UPDATE trips SET latest_seq = $2 WHERE id = $1', [t.id, seq]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

export class PostgresTripStore implements TripStore {
  public readonly backendKind = 'postgres' as const;
  private readonly pool: pg.Pool;
  private readonly kms: KmsEnvelopeService;

  constructor(connectionString: string, kms: KmsEnvelopeService = defaultKmsEnvelope) {
    this.pool = new Pool(buildPgPoolConfig(connectionString));
    this.kms = kms;
  }

  public async checkHealth(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await this.pool.query('SELECT 1 AS ok');
      return { ok: res.rowCount === 1, detail: 'PostgreSQL/PostGIS connected' };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : 'PostgreSQL health error',
      };
    }
  }

  private mapUserRow(row: Record<string, unknown>): UserPublic {
    return {
      id: String(row.id),
      displayName: String(row.display_name),
      preferredLang: String(row.preferred_lang ?? 'en'),
      tier: (row.tier as UserPublic['tier']) ?? 'free',
      hasUpiVpa: Boolean(row.upi_vpa_enc),
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  public async upsertUserByPhone(
    phone: string,
    displayName?: string,
    upiVpa?: string
  ): Promise<UserPublic> {
    const normalizedPhone = phone.trim();
    const phoneHash = hashIdentifier(normalizedPhone);
    const existing = await this.pool.query(
      'SELECT * FROM users WHERE phone_hash = $1 LIMIT 1',
      [phoneHash]
    );

    if (existing.rows[0]) {
      const uid = String(existing.rows[0].id);
      const upiEnc = upiVpa?.trim()
        ? await this.kms.encryptString(upiVpa.trim(), `user:${uid}:upi`)
        : existing.rows[0].upi_vpa_enc;
      const updated = await this.pool.query(
        `UPDATE users
         SET display_name = COALESCE($2, display_name),
             upi_vpa_enc = $3
         WHERE id = $1
         RETURNING *`,
        [uid, displayName?.trim() || null, upiEnc]
      );
      return this.mapUserRow(updated.rows[0]!);
    }

    const uid = crypto.randomUUID();
    const phoneEnc = await this.kms.encryptString(
      normalizedPhone,
      `user:${uid}:phone`
    );
    const upiEnc = upiVpa?.trim()
      ? await this.kms.encryptString(upiVpa.trim(), `user:${uid}:upi`)
      : null;

    const inserted = await this.pool.query(
      `INSERT INTO users (id, phone_hash, phone_enc, display_name, upi_vpa_enc)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        uid,
        phoneHash,
        phoneEnc,
        displayName?.trim() || `Traveller ${normalizedPhone.slice(-4)}`,
        upiEnc,
      ]
    );
    return this.mapUserRow(inserted.rows[0]!);
  }

  public async upsertUserByGoogle(params: {
    googleSub: string;
    email: string;
    displayName: string;
    upiVpa?: string;
  }): Promise<UserPublic> {
    const subHash = hashIdentifier(params.googleSub);
    const existing = await this.pool.query(
      'SELECT * FROM users WHERE google_sub_hash = $1 LIMIT 1',
      [subHash]
    );

    if (existing.rows[0]) {
      const uid = String(existing.rows[0].id);
      const upiEnc = params.upiVpa?.trim()
        ? await this.kms.encryptString(params.upiVpa.trim(), `user:${uid}:upi`)
        : existing.rows[0].upi_vpa_enc;
      const updated = await this.pool.query(
        `UPDATE users
         SET display_name = $2, upi_vpa_enc = $3
         WHERE id = $1
         RETURNING *`,
        [uid, params.displayName.trim() || 'Traveller', upiEnc]
      );
      return this.mapUserRow(updated.rows[0]!);
    }

    const uid = crypto.randomUUID();
    const emailEnc = await this.kms.encryptString(
      params.email.trim().toLowerCase(),
      `user:${uid}:email`
    );
    const upiEnc = params.upiVpa?.trim()
      ? await this.kms.encryptString(params.upiVpa.trim(), `user:${uid}:upi`)
      : null;

    const inserted = await this.pool.query(
      `INSERT INTO users (id, google_sub_hash, email_enc, display_name, upi_vpa_enc)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [uid, subHash, emailEnc, params.displayName.trim() || 'Traveller', upiEnc]
    );
    return this.mapUserRow(inserted.rows[0]!);
  }

  public async getUserById(userId: string): Promise<UserPublic | null> {
    const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [
      userId,
    ]);
    return res.rows[0] ? this.mapUserRow(res.rows[0]) : null;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM users WHERE id = $1', [
      userId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  private mapTripMeta(row: Record<string, unknown>): TripMeta {
    return {
      id: String(row.id),
      shortId: String(row.short_id),
      title: String(row.title),
      destinationSummary: String(row.destination_summary ?? ''),
      startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
      endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
      homeCurrency: (String(row.home_currency || 'INR').trim() as CurrencyCode),
      isPublicTemplate: Boolean(row.is_public_template),
      isSample: Boolean(row.is_sample),
      elderModeEnabled: Boolean(row.elder_mode_enabled),
      vaultBytesUsed: Number(row.vault_bytes_used ?? 0),
      vaultQuotaBytes: getVaultQuotaForTier('free'),
      latestSeq: Number(row.latest_seq ?? 0),
      mapAttribution: '© OpenStreetMap contributors',
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  public async listSampleAndUserTrips(userId?: string | null): Promise<TripMeta[]> {
    const res = userId
      ? await this.pool.query(
          `SELECT DISTINCT t.*
           FROM trips t
           LEFT JOIN trip_members tm ON tm.trip_id = t.id
           WHERE t.is_public_template = TRUE OR t.is_sample = TRUE OR tm.user_id = $1
           ORDER BY t.created_at DESC`,
          [userId]
        )
      : await this.pool.query(
          `SELECT * FROM trips
           WHERE is_public_template = TRUE OR is_sample = TRUE
           ORDER BY created_at DESC`
        );
    return res.rows.map((r) => this.mapTripMeta(r));
  }

  public async createTrip(input: CreateTripInput): Promise<TripWorkspaceResponse> {
    const tripId = crypto.randomUUID();
    const shortId = generateShortId(input.title);
    const daysCount = Math.min(Math.max(input.daysCount ?? 3, 1), 30);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO trips (id, short_id, title, destination_summary, start_date, end_date, home_currency, is_public_template, elder_mode_enabled, latest_seq)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tripId,
          shortId,
          input.title,
          input.destinationSummary ?? '',
          input.startDate ?? null,
          input.endDate ?? null,
          input.homeCurrency ?? 'INR',
          input.isPublicTemplate ?? false,
          input.elderModeEnabled ?? true,
          daysCount,
        ]
      );

      await client.query(
        `INSERT INTO trip_members (trip_id, user_id, role, vault_access)
         VALUES ($1, $2, 'owner', TRUE)`,
        [tripId, input.ownerId]
      );

      for (let d = 1; d <= daysCount; d++) {
        let dateStr: string | null = null;
        if (input.startDate) {
          const base = new Date(`${input.startDate}T00:00:00Z`);
          if (!Number.isNaN(base.getTime())) {
            base.setUTCDate(base.getUTCDate() + (d - 1));
            dateStr = base.toISOString().slice(0, 10);
          }
        }
        await client.query(
          `INSERT INTO trip_days (id, trip_id, day_number, date, theme_title, pacing_level, server_seq, hlc_timestamp)
           VALUES ($1, $2, $3, $4, $5, 'moderate', $6, $7)`,
          [
            crypto.randomUUID(),
            tripId,
            d,
            dateStr,
            `Day ${d}`,
            d,
            formatHlc({ wallMs: Date.now() + d, logical: 0, nodeId: 'pg' }),
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return (await this.getTripWorkspace(tripId, input.ownerId))!;
  }

  public async addTripMember(params: {
    tripId: string;
    userId: string;
    role: MemberRole;
    vaultAccess?: boolean;
    dietaryTags?: string[];
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role, vault_access, dietary_tags)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (trip_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, vault_access = EXCLUDED.vault_access, dietary_tags = EXCLUDED.dietary_tags`,
      [
        params.tripId,
        params.userId,
        params.role,
        params.vaultAccess ?? (params.role === 'owner' || params.role === 'editor'),
        params.dietaryTags ?? [],
      ]
    );
  }

  public async claimSandboxTrip(
    input: SandboxClaimInput
  ): Promise<TripWorkspaceResponse> {
    const tripId = crypto.randomUUID();
    const shortId = generateShortId(input.title);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      let seq = 0;

      await client.query(
        `INSERT INTO trips (id, short_id, title, destination_summary, start_date, end_date, home_currency, elder_mode_enabled, latest_seq)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0)`,
        [
          tripId,
          shortId,
          input.title,
          input.destinationSummary ?? '',
          input.startDate ?? null,
          input.endDate ?? null,
          input.homeCurrency ?? 'INR',
          input.elderModeEnabled ?? true,
        ]
      );

      await client.query(
        `INSERT INTO trip_members (trip_id, user_id, role, vault_access)
         VALUES ($1, $2, 'owner', TRUE)`,
        [tripId, input.ownerId]
      );

      const dayIdByNum = new Map<number, string>();
      for (const d of input.days) {
        seq += 1;
        const dayId = d.id ?? crypto.randomUUID();
        dayIdByNum.set(d.dayNumber, dayId);
        await client.query(
          `INSERT INTO trip_days (id, trip_id, day_number, date, theme_title, pacing_level, server_seq, hlc_timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            dayId,
            tripId,
            d.dayNumber,
            d.date ?? null,
            d.themeTitle ?? `Day ${d.dayNumber}`,
            d.pacingLevel ?? 'moderate',
            seq,
            formatHlc({ wallMs: Date.now() + seq, logical: 0, nodeId: 'claim' }),
          ]
        );
      }

      const defaultKeys = generateInitialSortKeys(Math.max(1, input.items.length));
      for (let idx = 0; idx < input.items.length; idx++) {
        const it = input.items[idx]!;
        seq += 1;
        const itemId = it.id ?? crypto.randomUUID();
        const dayId =
          it.dayId ??
          (it.dayNumber !== undefined && it.dayNumber !== null
            ? (dayIdByNum.get(it.dayNumber) ?? null)
            : null);
        const isShortlist = Boolean(it.isShortlist || dayId === null);
        const lat = it.lat ?? null;
        const lng = it.lng ?? null;

        await client.query(
          `INSERT INTO itinerary_items (
             id, trip_id, day_id, kind, title, notes, location, lat, lng, place_ref_id,
             address_local_script, sort_key, start_time, duration_mins, dietary_flags,
             accessibility_notes, elder_summary_i18n, is_shortlist, server_seq, hlc_timestamp
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             CASE WHEN $7::double precision IS NOT NULL AND $8::double precision IS NOT NULL
                  THEN ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography ELSE NULL END,
             $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
           )`,
          [
            itemId,
            tripId,
            isShortlist ? null : dayId,
            it.kind,
            it.title,
            it.notes ?? '',
            lat,
            lng,
            it.placeRefId ?? null,
            it.addressLocalScript ?? null,
            it.sortKey ?? defaultKeys[idx] ?? 'V0',
            it.startTime ?? null,
            it.durationMins ?? null,
            it.dietaryFlags ?? [],
            it.accessibilityNotes ?? '',
            JSON.stringify(it.elderSummaryI18n ?? {}),
            isShortlist,
            seq,
            formatHlc({ wallMs: Date.now() + seq, logical: 0, nodeId: 'claim' }),
          ]
        );
      }

      await client.query('UPDATE trips SET latest_seq = $2 WHERE id = $1', [
        tripId,
        seq,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return (await this.getTripWorkspace(tripId, input.ownerId))!;
  }

  private mapDayRow(row: Record<string, unknown>): TripDay {
    return {
      id: String(row.id),
      tripId: String(row.trip_id),
      dayNumber: Number(row.day_number),
      date: row.date ? String(row.date).slice(0, 10) : null,
      themeTitle: String(row.theme_title ?? ''),
      pacingLevel: (row.pacing_level as PacingLevel) ?? 'moderate',
      serverSeq: Number(row.server_seq ?? 0),
      hlcTimestamp: String(row.hlc_timestamp ?? ''),
      deletedAt: row.deleted_at ? new Date(String(row.deleted_at)).toISOString() : null,
    };
  }

  private mapItemRow(row: Record<string, unknown>): ItineraryItem {
    const lat = row.lat !== null && row.lat !== undefined ? Number(row.lat) : null;
    const lng = row.lng !== null && row.lng !== undefined ? Number(row.lng) : null;
    return {
      id: String(row.id),
      tripId: String(row.trip_id),
      dayId: row.day_id ? String(row.day_id) : null,
      kind: row.kind as ItineraryItem['kind'],
      title: String(row.title),
      notes: String(row.notes ?? ''),
      lat,
      lng,
      placeRefId: row.place_ref_id ? String(row.place_ref_id) : null,
      addressLocalScript: row.address_local_script
        ? String(row.address_local_script)
        : null,
      sortKey: String(row.sort_key),
      startTime: row.start_time ? String(row.start_time) : null,
      durationMins:
        row.duration_mins !== null && row.duration_mins !== undefined
          ? Number(row.duration_mins)
          : null,
      transitMeta: (row.transit_meta as ItineraryItem['transitMeta']) ?? {},
      dietaryFlags: (row.dietary_flags as string[]) ?? [],
      accessibilityNotes: String(row.accessibility_notes ?? ''),
      elderSummaryI18n:
        (row.elder_summary_i18n as ItineraryItem['elderSummaryI18n']) ?? {},
      isShortlist: Boolean(row.is_shortlist),
      serverSeq: Number(row.server_seq ?? 0),
      hlcTimestamp: String(row.hlc_timestamp ?? ''),
      deletedAt: row.deleted_at
        ? new Date(String(row.deleted_at)).toISOString()
        : null,
      googleMapsUrl:
        lat !== null && lng !== null ? buildGoogleMapsPlaceUrl(lat, lng) : null,
    };
  }

  private mapBookingRedacted(row: Record<string, unknown>): BookingRedactedView {
    const pnrLast3 = row.pnr_last3 ? String(row.pnr_last3).trim() : null;
    return {
      id: String(row.id),
      tripId: String(row.trip_id),
      itemId: row.item_id ? String(row.item_id) : null,
      provider: row.provider as BookingProvider,
      pnrMasked: maskPnrLast3(pnrLast3),
      pnrLast3,
      status: row.status as BookingStatus,
      summary: (row.summary_public as BookingSummaryPublic) ?? { headline: 'Booking' },
      lowConfidenceFields: (row.low_confidence_fields as string[]) ?? [],
      parserConfidence: Number(row.parser_confidence ?? 1.0),
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  private async mapBookingVault(
    row: Record<string, unknown>,
    hasVaultAccess: boolean
  ): Promise<BookingVaultView> {
    const base = this.mapBookingRedacted(row);
    if (!hasVaultAccess) {
      return {
        ...base,
        pnrPlain: null,
        passengers: [],
        hasEncryptedDocument: Boolean(row.raw_doc_s3_key),
        docSizeBytes: Number(row.doc_size_bytes ?? 0),
      };
    }

    const pnrPlain = row.pnr_enc
      ? await this.kms.decryptString(
          Buffer.from(row.pnr_enc as Buffer),
          `booking:${base.tripId}:${base.id}:pnr`
        )
      : null;

    let passengers: BookingVaultView['passengers'] = [];
    if (row.passenger_meta_enc) {
      const dec = await this.kms.decryptString(
        Buffer.from(row.passenger_meta_enc as Buffer),
        `booking:${base.tripId}:${base.id}:pax`
      );
      passengers = JSON.parse(dec) as BookingVaultView['passengers'];
    }

    return {
      ...base,
      pnrPlain,
      passengers,
      hasEncryptedDocument: Boolean(row.raw_doc_s3_key),
      docSizeBytes: Number(row.doc_size_bytes ?? 0),
    };
  }

  private async fetchPollsForTrip(tripId: string): Promise<PollView[]> {
    const pollsRes = await this.pool.query(
      'SELECT * FROM polls WHERE trip_id = $1 ORDER BY created_at ASC',
      [tripId]
    );
    if (pollsRes.rows.length === 0) return [];

    const votesRes = await this.pool.query(
      `SELECT pv.* FROM poll_votes pv
       JOIN polls p ON p.id = pv.poll_id
       WHERE p.trip_id = $1`,
      [tripId]
    );

    return pollsRes.rows.map((pr) => {
      const pid = String(pr.id);
      const rawOptions = pr.options as Array<{
        id: string;
        label: string;
        subtitle?: string;
      }>;
      const pVotes = votesRes.rows.filter((v) => String(v.poll_id) === pid);
      const options = rawOptions.map((opt) => {
        const matched = pVotes.filter((v) => String(v.option_id) === opt.id);
        return {
          id: opt.id,
          label: opt.label,
          subtitle: opt.subtitle,
          voteCount: matched.length,
          voterNames: matched.map((v) => String(v.guest_display_name)),
        };
      });
      return {
        id: pid,
        tripId,
        question: String(pr.question),
        options,
        closesAt: pr.closes_at ? new Date(String(pr.closes_at)).toISOString() : null,
        totalVotes: pVotes.length,
        createdAt: new Date(String(pr.created_at)).toISOString(),
      };
    });
  }

  private mapExpenseRow(row: Record<string, unknown>): ExpenseView {
    return {
      id: String(row.id),
      tripId: String(row.trip_id),
      clientOpId: String(row.client_op_id),
      entryType: row.entry_type as ExpenseEntryType,
      reversesExpenseId: row.reverses_expense_id
        ? String(row.reverses_expense_id)
        : null,
      title: String(row.title ?? ''),
      category: String(row.category ?? 'general'),
      paidBy: String(row.paid_by),
      kittyPoolId: row.kitty_pool_id ? String(row.kitty_pool_id) : null,
      amountMinor: Number(row.amount_minor),
      currency: String(row.currency).trim() as CurrencyCode,
      inrEquivalentMinor: Number(row.inr_equivalent_minor),
      fxRate: Number(row.fx_rate),
      splitMode: row.split_mode as SplitMode,
      excludedTags: (row.excluded_tags as string[]) ?? [],
      splitsInrMinor: (row.splits as Record<string, number>) ?? {},
      upiTxnRef: row.upi_txn_ref ? String(row.upi_txn_ref) : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  }

  private async fetchKittyAndExpenses(tripId: string): Promise<{
    kittyPools: KittyPoolView[];
    expenses: ExpenseView[];
  }> {
    const [kittyRes, expRes] = await Promise.all([
      this.pool.query(
        'SELECT * FROM kitty_pools WHERE trip_id = $1 ORDER BY created_at ASC',
        [tripId]
      ),
      this.pool.query(
        'SELECT * FROM expenses WHERE trip_id = $1 ORDER BY created_at ASC',
        [tripId]
      ),
    ]);

    const expenses = expRes.rows.map((r) => this.mapExpenseRow(r));
    const kittyPools: KittyPoolView[] = kittyRes.rows.map((kr) => {
      const kid = String(kr.id);
      const initialMinor = Number(kr.initial_contribution_minor ?? 0);
      const spentMinor = expenses
        .filter((e) => e.kittyPoolId === kid)
        .reduce((acc, e) => acc + e.inrEquivalentMinor, 0);
      return {
        id: kid,
        tripId,
        title: String(kr.title),
        custodianId: String(kr.custodian_id),
        currency: String(kr.currency).trim() as CurrencyCode,
        initialContributionMinor: initialMinor,
        memberContributionsMinor:
          (kr.member_contributions_minor as Record<string, number>) ?? {},
        spentMinor: Math.max(0, spentMinor),
        remainingMinor: initialMinor - spentMinor,
        status: (kr.status as 'open' | 'settled') ?? 'open',
        createdAt: new Date(String(kr.created_at)).toISOString(),
      };
    });

    return { kittyPools, expenses };
  }

  public async getTripWorkspace(
    tripId: string,
    requesterUserId?: string | null
  ): Promise<TripWorkspaceResponse | null> {
    const tripRes = await this.pool.query('SELECT * FROM trips WHERE id = $1', [
      tripId,
    ]);
    if (!tripRes.rows[0]) return null;
    const meta = this.mapTripMeta(tripRes.rows[0]);

    const [membersRes, daysRes, itemsRes, bookingsRes, polls, ledger] =
      await Promise.all([
        this.pool.query(
          `SELECT tm.*, u.display_name
           FROM trip_members tm
           JOIN users u ON u.id = tm.user_id
           WHERE tm.trip_id = $1`,
          [tripId]
        ),
        this.pool.query(
          'SELECT * FROM trip_days WHERE trip_id = $1 AND deleted_at IS NULL ORDER BY day_number ASC',
          [tripId]
        ),
        this.pool.query(
          'SELECT * FROM itinerary_items WHERE trip_id = $1 AND deleted_at IS NULL ORDER BY sort_key ASC, id ASC',
          [tripId]
        ),
        this.pool.query(
          'SELECT * FROM bookings WHERE trip_id = $1 ORDER BY created_at ASC',
          [tripId]
        ),
        this.fetchPollsForTrip(tripId),
        this.fetchKittyAndExpenses(tripId),
      ]);

    const members: TripMemberPublic[] = membersRes.rows.map((r) => ({
      userId: String(r.user_id),
      displayName: String(r.display_name),
      role: r.role as MemberRole,
      vaultAccess: Boolean(r.vault_access),
      dietaryTags: (r.dietary_tags as string[]) ?? [],
      joinedAt: new Date(String(r.joined_at)).toISOString(),
    }));

    const hasVaultAccess = Boolean(
      requesterUserId &&
        members.some((m) => m.userId === requesterUserId && m.vaultAccess)
    );

    const days = daysRes.rows.map((r) => this.mapDayRow(r));
    const allItems = itemsRes.rows.map((r) => this.mapItemRow(r));
    const { activeItems, shortlistItems } = projectOrderedItems(allItems);

    const bookings: BookingVaultView[] = [];
    for (const br of bookingsRes.rows) {
      bookings.push(await this.mapBookingVault(br, hasVaultAccess));
    }

    return {
      trip: meta,
      members,
      days,
      items: activeItems,
      shortlist: shortlistItems,
      bookings,
      polls,
      kittyPools: ledger.kittyPools,
      expenses: ledger.expenses,
      outboundChecklist: buildOutboundChecklist(
        `${meta.title} ${meta.destinationSummary}`
      ),
    };
  }

  public async getGuestShareByShortId(
    shortId: string
  ): Promise<GuestShareResponse | null> {
    const tripRes = await this.pool.query(
      'SELECT * FROM trips WHERE short_id = $1 LIMIT 1',
      [shortId]
    );
    if (!tripRes.rows[0]) return null;
    const meta = this.mapTripMeta(tripRes.rows[0]);

    const [ownerRes, daysRes, itemsRes, bookingsRes, polls] = await Promise.all([
      this.pool.query(
        `SELECT u.display_name
         FROM trip_members tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.trip_id = $1 AND tm.role = 'owner'
         LIMIT 1`,
        [meta.id]
      ),
      this.pool.query(
        'SELECT * FROM trip_days WHERE trip_id = $1 AND deleted_at IS NULL ORDER BY day_number ASC',
        [meta.id]
      ),
      this.pool.query(
        'SELECT * FROM itinerary_items WHERE trip_id = $1 AND deleted_at IS NULL ORDER BY sort_key ASC, id ASC',
        [meta.id]
      ),
      this.pool.query(
        `SELECT id, trip_id, item_id, provider, pnr_last3, summary_public,
                low_confidence_fields, status, parser_confidence, created_at
         FROM bookings
         WHERE trip_id = $1
         ORDER BY created_at ASC`,
        [meta.id]
      ),
      this.fetchPollsForTrip(meta.id),
    ]);

    const days = daysRes.rows.map((r) => this.mapDayRow(r));
    const allItems = itemsRes.rows.map((r) => this.mapItemRow(r));
    const { activeItems, shortlistItems } = projectOrderedItems(allItems);
    const bookings = bookingsRes.rows.map((r) => this.mapBookingRedacted(r));
    const plannerName = ownerRes.rows[0]
      ? String(ownerRes.rows[0].display_name)
      : 'Trip Architect';

    const { vaultBytesUsed: _vb, vaultQuotaBytes: _vq, ...publicMeta } = meta;

    return {
      redactPii: true,
      trip: publicMeta,
      plannerName,
      days,
      items: activeItems,
      shortlist: shortlistItems,
      bookings,
      polls,
      whatsappDigestText: buildWhatsappDigestText({
        title: meta.title,
        shortId: meta.shortId,
        days,
        items: activeItems,
      }),
    };
  }

  public async getOfflineBundle(
    tripId: string,
    requesterUserId?: string | null
  ) {
    const workspace = await this.getTripWorkspace(tripId, requesterUserId);
    if (!workspace) return null;
    const lower = `${workspace.trip.title} ${workspace.trip.destinationSummary}`.toLowerCase();
    return {
      generatedAt: new Date().toISOString(),
      pmtilesRegionHint: lower.includes('vietnam')
        ? 'https://tiles.itinbee.com/pmtiles/se-asia-vietnam-v1.pmtiles'
        : 'https://tiles.itinbee.com/pmtiles/india-subcontinent-v1.pmtiles',
      mapAttribution: '© OpenStreetMap contributors',
      workspace,
    };
  }

  public async syncTripMutations(params: {
    tripId: string;
    lastSeenSeq: number;
    mutations: SyncClientMutation[];
  }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tripRes = await client.query(
        'SELECT * FROM trips WHERE id = $1 FOR UPDATE',
        [params.tripId]
      );
      if (!tripRes.rows[0]) {
        throw new Error(`Trip not found: ${params.tripId}`);
      }

      const [daysRes, itemsRes, opsRes] = await Promise.all([
        client.query('SELECT * FROM trip_days WHERE trip_id = $1', [
          params.tripId,
        ]),
        client.query('SELECT * FROM itinerary_items WHERE trip_id = $1', [
          params.tripId,
        ]),
        client.query(
          'SELECT * FROM sync_operations WHERE trip_id = $1 ORDER BY server_seq ASC',
          [params.tripId]
        ),
      ]);

      const daysMap = new Map<string, TripDay>();
      for (const r of daysRes.rows) {
        const d = this.mapDayRow(r);
        daysMap.set(d.id, d);
      }

      const itemsMap = new Map<string, ItineraryItem>();
      for (const r of itemsRes.rows) {
        const it = this.mapItemRow(r);
        itemsMap.set(it.id, it);
      }

      const appliedOpsByClientId = new Map<string, SyncServerDelta>();
      const opLog: SyncServerDelta[] = [];
      let lastServerHlc = '';

      for (const r of opsRes.rows) {
        const d: SyncServerDelta = {
          serverSeq: Number(r.server_seq),
          clientOpId: String(r.client_op_id),
          hlcTimestamp: String(r.hlc_timestamp),
          entityType: r.entity_type as SyncServerDelta['entityType'],
          entityId: String(r.entity_id),
          action: r.action as SyncServerDelta['action'],
          orphanedToShortlist: Boolean(
            (r.payload as Record<string, unknown>)?.orphanedToShortlist
          ),
          payload: (r.payload as Record<string, unknown>) ?? {},
        };
        appliedOpsByClientId.set(d.clientOpId, d);
        opLog.push(d);
        lastServerHlc = d.hlcTimestamp;
      }

      const prevOpCount = opLog.length;
      const state: SyncStateSnapshot = {
        tripId: params.tripId,
        latestSeq: Number(tripRes.rows[0].latest_seq ?? 0),
        lastServerHlc,
        days: daysMap,
        items: itemsMap,
        appliedOpsByClientId,
        opLog,
      };

      const appliedOps = applySyncMutationsToState(state, params.mutations);
      const newlyAppendedOps = state.opLog.slice(prevOpCount);

      for (const d of state.days.values()) {
        await client.query(
          `INSERT INTO trip_days (id, trip_id, day_number, date, theme_title, pacing_level, server_seq, hlc_timestamp, deleted_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (id) DO UPDATE SET
             day_number = EXCLUDED.day_number,
             date = EXCLUDED.date,
             theme_title = EXCLUDED.theme_title,
             pacing_level = EXCLUDED.pacing_level,
             server_seq = EXCLUDED.server_seq,
             hlc_timestamp = EXCLUDED.hlc_timestamp,
             deleted_at = EXCLUDED.deleted_at,
             updated_at = NOW()`,
          [
            d.id,
            d.tripId,
            d.dayNumber,
            d.date,
            d.themeTitle,
            d.pacingLevel,
            d.serverSeq,
            d.hlcTimestamp,
            d.deletedAt,
          ]
        );
      }

      for (const it of state.items.values()) {
        await client.query(
          `INSERT INTO itinerary_items (
             id, trip_id, day_id, kind, title, notes, location, lat, lng, place_ref_id,
             address_local_script, sort_key, start_time, duration_mins, transit_meta,
             dietary_flags, accessibility_notes, elder_summary_i18n, is_shortlist,
             server_seq, hlc_timestamp, deleted_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             CASE WHEN $7::double precision IS NOT NULL AND $8::double precision IS NOT NULL
                  THEN ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography ELSE NULL END,
             $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW()
           )
           ON CONFLICT (id) DO UPDATE SET
             day_id = EXCLUDED.day_id,
             kind = EXCLUDED.kind,
             title = EXCLUDED.title,
             notes = EXCLUDED.notes,
             location = EXCLUDED.location,
             lat = EXCLUDED.lat,
             lng = EXCLUDED.lng,
             place_ref_id = EXCLUDED.place_ref_id,
             address_local_script = EXCLUDED.address_local_script,
             sort_key = EXCLUDED.sort_key,
             start_time = EXCLUDED.start_time,
             duration_mins = EXCLUDED.duration_mins,
             transit_meta = EXCLUDED.transit_meta,
             dietary_flags = EXCLUDED.dietary_flags,
             accessibility_notes = EXCLUDED.accessibility_notes,
             elder_summary_i18n = EXCLUDED.elder_summary_i18n,
             is_shortlist = EXCLUDED.is_shortlist,
             server_seq = EXCLUDED.server_seq,
             hlc_timestamp = EXCLUDED.hlc_timestamp,
             deleted_at = EXCLUDED.deleted_at,
             updated_at = NOW()`,
          [
            it.id,
            it.tripId,
            it.dayId,
            it.kind,
            it.title,
            it.notes,
            it.lat,
            it.lng,
            it.placeRefId,
            it.addressLocalScript,
            it.sortKey,
            it.startTime,
            it.durationMins,
            JSON.stringify(it.transitMeta ?? {}),
            it.dietaryFlags,
            it.accessibilityNotes,
            JSON.stringify(it.elderSummaryI18n ?? {}),
            it.isShortlist,
            it.serverSeq,
            it.hlcTimestamp,
            it.deletedAt,
          ]
        );
      }

      for (const op of newlyAppendedOps) {
        await client.query(
          `INSERT INTO sync_operations (trip_id, client_op_id, server_seq, hlc_timestamp, entity_type, entity_id, action, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (trip_id, client_op_id) DO NOTHING`,
          [
            params.tripId,
            op.clientOpId,
            op.serverSeq,
            op.hlcTimestamp,
            op.entityType,
            op.entityId,
            op.action,
            JSON.stringify({
              ...op.payload,
              orphanedToShortlist: op.orphanedToShortlist,
            }),
          ]
        );
      }

      await client.query(
        'UPDATE trips SET latest_seq = $2, updated_at = NOW() WHERE id = $1',
        [params.tripId, state.latestSeq]
      );

      await client.query('COMMIT');

      const pulledDeltas = state.opLog.filter(
        (op) => op.serverSeq > params.lastSeenSeq
      );
      const activeDays = [...state.days.values()]
        .filter((d) => !d.deletedAt)
        .sort((a, b) => a.dayNumber - b.dayNumber);
      const { activeItems, shortlistItems } = projectOrderedItems(
        state.items.values()
      );

      return {
        latestSeq: state.latestSeq,
        appliedOps,
        pulledDeltas,
        activeDays,
        activeItems,
        shortlistItems,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async createBooking(input: CreateBookingInput): Promise<BookingVaultView> {
    const bookingId = crypto.randomUUID();
    const pnrEnc = input.pnr
      ? await this.kms.encryptString(
          input.pnr.trim(),
          `booking:${input.tripId}:${bookingId}:pnr`
        )
      : null;

    const sanitizedPax = sanitizePassengerMeta(
      (input.passengers ?? []) as RawPassengerMeta[],
      Boolean(input.coTravellerConsent)
    );
    const paxEnc = await this.kms.encryptString(
      JSON.stringify(sanitizedPax),
      `booking:${input.tripId}:${bookingId}:pax`
    );

    const docSizeBytes = input.docSizeBytes ?? 0;
    const res = await this.pool.query(
      `INSERT INTO bookings (
         id, trip_id, item_id, provider, pnr_enc, pnr_last3, passenger_meta_enc,
         summary_public, low_confidence_fields, status, raw_doc_s3_key, doc_size_bytes,
         parser_confidence, co_traveller_consent_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        bookingId,
        input.tripId,
        input.itemId ?? null,
        input.provider,
        pnrEnc,
        extractPnrLast3(input.pnr),
        paxEnc,
        JSON.stringify(input.summary),
        input.lowConfidenceFields ?? [],
        input.status ?? 'confirmed',
        input.rawDocS3Key ?? null,
        docSizeBytes,
        input.parserConfidence ?? 1.0,
        input.coTravellerConsent ? new Date().toISOString() : null,
      ]
    );

    if (docSizeBytes > 0) {
      await this.pool.query(
        'UPDATE trips SET vault_bytes_used = vault_bytes_used + $2 WHERE id = $1',
        [input.tripId, docSizeBytes]
      );
    }

    return this.mapBookingVault(res.rows[0]!, true);
  }

  public async createShortlistItem(params: {
    tripId: string;
    kind: ItineraryItem['kind'];
    title: string;
    notes?: string;
    lat?: number | null;
    lng?: number | null;
    placeRefId?: string | null;
    addressLocalScript?: string | null;
    dietaryFlags?: string[];
    accessibilityNotes?: string;
  }): Promise<ItineraryItem> {
    const itemId = crypto.randomUUID();
    const res = await this.syncTripMutations({
      tripId: params.tripId,
      lastSeenSeq: 0,
      mutations: [
        {
          clientOpId: `ingest-${itemId}`,
          hlcTimestamp: formatHlc({
            wallMs: Date.now(),
            logical: 0,
            nodeId: 'ingest',
          }),
          baseSeq: 0,
          entityType: 'itinerary_item',
          entityId: itemId,
          action: 'upsert',
          payload: {
            dayId: null,
            isShortlist: true,
            kind: params.kind,
            title: params.title,
            notes: params.notes ?? '',
            lat: params.lat ?? null,
            lng: params.lng ?? null,
            placeRefId: params.placeRefId ?? null,
            addressLocalScript: params.addressLocalScript ?? null,
            sortKey: betweenSortKeys(null, null),
            dietaryFlags: params.dietaryFlags ?? [],
            accessibilityNotes: params.accessibilityNotes ?? '',
          },
        },
      ],
    });
    return res.shortlistItems.find((i) => i.id === itemId)!;
  }

  public async getBookingById(
    tripId: string,
    bookingId: string
  ): Promise<BookingRedactedView | null> {
    const res = await this.pool.query(
      'SELECT * FROM bookings WHERE trip_id = $1 AND id = $2',
      [tripId, bookingId]
    );
    return res.rows[0] ? this.mapBookingRedacted(res.rows[0]) : null;
  }

  public async createPoll(input: CreatePollInput): Promise<PollView> {
    const pollId = crypto.randomUUID();
    const options = input.options.map((opt, idx) => ({
      id: opt.id ?? `opt-${idx + 1}`,
      label: opt.label,
      subtitle: opt.subtitle,
    }));

    await this.pool.query(
      `INSERT INTO polls (id, trip_id, question, options, closes_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        pollId,
        input.tripId,
        input.question,
        JSON.stringify(options),
        input.closesAt ?? null,
        input.createdBy ?? null,
      ]
    );

    const polls = await this.fetchPollsForTrip(input.tripId);
    return polls.find((p) => p.id === pollId)!;
  }

  public async castPollVote(input: CastPollVoteInput): Promise<PollView> {
    const tripRes = await this.pool.query(
      'SELECT id FROM trips WHERE short_id = $1 LIMIT 1',
      [input.shortId]
    );
    if (!tripRes.rows[0]) {
      throw new Error(`Trip share link not found: ${input.shortId}`);
    }
    const tripId = String(tripRes.rows[0].id);

    const pollRes = await this.pool.query(
      'SELECT * FROM polls WHERE id = $1 AND trip_id = $2',
      [input.pollId, tripId]
    );
    if (!pollRes.rows[0]) {
      throw new Error(`Poll not found: ${input.pollId}`);
    }

    const rawOptions = pollRes.rows[0].options as Array<{ id: string }>;
    if (!rawOptions.some((o) => o.id === input.optionId)) {
      throw new Error(`Invalid poll option: ${input.optionId}`);
    }

    if (input.voterId) {
      await this.pool.query(
        'DELETE FROM poll_votes WHERE poll_id = $1 AND voter_id = $2',
        [input.pollId, input.voterId]
      );
      await this.pool.query(
        `INSERT INTO poll_votes (poll_id, voter_id, guest_display_name, option_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (poll_id, voter_id, option_id) WHERE voter_id IS NOT NULL DO NOTHING`,
        [input.pollId, input.voterId, input.guestDisplayName, input.optionId]
      );
    } else if (input.guestSessionHash) {
      await this.pool.query(
        'DELETE FROM poll_votes WHERE poll_id = $1 AND guest_session_hash = $2',
        [input.pollId, input.guestSessionHash]
      );
      await this.pool.query(
        `INSERT INTO poll_votes (poll_id, guest_session_hash, guest_display_name, option_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (poll_id, guest_session_hash, option_id) WHERE guest_session_hash IS NOT NULL DO NOTHING`,
        [
          input.pollId,
          input.guestSessionHash,
          input.guestDisplayName,
          input.optionId,
        ]
      );
    }

    const polls = await this.fetchPollsForTrip(tripId);
    return polls.find((p) => p.id === input.pollId)!;
  }

  public async createKittyPool(input: CreateKittyPoolInput): Promise<KittyPoolView> {
    const poolId = crypto.randomUUID();
    const initialMinor = Object.values(input.memberContributionsMinor).reduce(
      (acc, v) => acc + Math.max(0, Math.round(v)),
      0
    );

    await this.pool.query(
      `INSERT INTO kitty_pools (id, trip_id, title, custodian_id, currency, initial_contribution_minor, member_contributions_minor)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        poolId,
        input.tripId,
        input.title,
        input.custodianId,
        input.currency ?? 'INR',
        initialMinor,
        JSON.stringify(input.memberContributionsMinor),
      ]
    );

    const { kittyPools } = await this.fetchKittyAndExpenses(input.tripId);
    return kittyPools.find((k) => k.id === poolId)!;
  }

  private async fetchLedgerMembers(tripId: string): Promise<LedgerMemberContext[]> {
    const res = await this.pool.query(
      `SELECT tm.user_id, tm.dietary_tags, u.display_name, u.upi_vpa_enc
       FROM trip_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.trip_id = $1`,
      [tripId]
    );
    const out: LedgerMemberContext[] = [];
    for (const r of res.rows) {
      const uid = String(r.user_id);
      const upiVpa = r.upi_vpa_enc
        ? await this.kms.decryptString(
            Buffer.from(r.upi_vpa_enc as Buffer),
            `user:${uid}:upi`
          )
        : null;
      out.push({
        userId: uid,
        displayName: String(r.display_name),
        dietaryTags: (r.dietary_tags as string[]) ?? [],
        upiVpa,
      });
    }
    return out;
  }

  public async appendExpense(input: CreateExpenseInput): Promise<ExpenseView> {
    const existing = await this.pool.query(
      'SELECT * FROM expenses WHERE client_op_id = $1 LIMIT 1',
      [input.clientOpId]
    );
    if (existing.rows[0]) {
      return this.mapExpenseRow(existing.rows[0]);
    }

    const entryType: ExpenseEntryType = input.entryType ?? 'charge';
    const currency: CurrencyCode = input.currency ?? 'INR';
    const splitMode: SplitMode = input.splitMode ?? 'equal';

    let resolvedAmountMinor = input.amountMinor;
    let resolvedPaidBy = input.paidBy;
    let resolvedKittyPoolId = input.kittyPoolId ?? null;
    let resolvedSplitsInrMinor: Record<string, number> | null = null;
    let resolvedInrMinor = 0;
    let resolvedFxRate = 1.0;

    if (entryType === 'adjustment' && input.reversesExpenseId) {
      const targetRes = await this.pool.query(
        'SELECT * FROM expenses WHERE id = $1 AND trip_id = $2',
        [input.reversesExpenseId, input.tripId]
      );
      if (!targetRes.rows[0]) {
        throw new Error(
          `reverses_expense_id not found on trip: ${input.reversesExpenseId}`
        );
      }
      const target = this.mapExpenseRow(targetRes.rows[0]);
      if (resolvedAmountMinor === undefined) {
        resolvedAmountMinor = -target.amountMinor;
        resolvedInrMinor = -target.inrEquivalentMinor;
        resolvedFxRate = target.fxRate;
        resolvedPaidBy = target.paidBy;
        resolvedKittyPoolId = target.kittyPoolId;
        resolvedSplitsInrMinor = Object.fromEntries(
          Object.entries(target.splitsInrMinor).map(([uid, val]) => [uid, -val])
        );
      }
    }

    if (resolvedAmountMinor === undefined) {
      throw new Error('amountMinor is required unless reversing an existing expense');
    }

    if (!resolvedSplitsInrMinor) {
      const fx = convertMinorToInrMinor({
        amountMinor: resolvedAmountMinor,
        currency,
        fxRateOverride: input.fxRateOverride,
      });
      resolvedInrMinor = fx.inrEquivalentMinor;
      resolvedFxRate = fx.fxRate;

      const members = await this.fetchLedgerMembers(input.tripId);
      resolvedSplitsInrMinor = computeExpenseSplitsInrMinor({
        inrEquivalentMinor: resolvedInrMinor,
        splitMode,
        members,
        participantIds: input.participantIds,
        excludedTags: input.excludedTags,
        exactSplitsInrMinor: input.exactSplitsInrMinor,
        shareWeights: input.shareWeights,
      });
    }

    if (resolvedKittyPoolId) {
      const kpRes = await this.pool.query(
        'SELECT custodian_id FROM kitty_pools WHERE id = $1 AND trip_id = $2',
        [resolvedKittyPoolId, input.tripId]
      );
      if (!kpRes.rows[0]) {
        throw new Error(`Kitty pool not found: ${resolvedKittyPoolId}`);
      }
      resolvedPaidBy = String(kpRes.rows[0].custodian_id);
    }

    const inserted = await this.pool.query(
      `INSERT INTO expenses (
         id, trip_id, client_op_id, entry_type, reverses_expense_id, title, category,
         paid_by, kitty_pool_id, amount_minor, currency, inr_equivalent_minor, fx_rate,
         split_mode, excluded_tags, splits, upi_txn_ref
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        crypto.randomUUID(),
        input.tripId,
        input.clientOpId,
        entryType,
        input.reversesExpenseId ?? null,
        input.title,
        input.category ?? 'general',
        resolvedPaidBy,
        resolvedKittyPoolId,
        Math.round(resolvedAmountMinor),
        currency,
        resolvedInrMinor,
        resolvedFxRate,
        splitMode,
        input.excludedTags ?? [],
        JSON.stringify(resolvedSplitsInrMinor),
        input.upiTxnRef ?? null,
      ]
    );

    return this.mapExpenseRow(inserted.rows[0]!);
  }

  public async getSettlements(tripId: string): Promise<{
    tripId: string;
    shortId: string;
    netBalancesInrMinor: Record<string, number>;
    settlements: UpiSettlementInstruction[];
    kittyPools: KittyPoolView[];
    expenseCount: number;
  }> {
    const tripRes = await this.pool.query(
      'SELECT short_id FROM trips WHERE id = $1',
      [tripId]
    );
    if (!tripRes.rows[0]) {
      throw new Error(`Trip not found: ${tripId}`);
    }
    const shortId = String(tripRes.rows[0].short_id);
    const [members, ledger] = await Promise.all([
      this.fetchLedgerMembers(tripId),
      this.fetchKittyAndExpenses(tripId),
    ]);

    const { netBalancesInrMinor, settlements } = computeSimplifiedSettlements({
      tripShortId: shortId,
      members,
      kittyPools: ledger.kittyPools,
      expenses: ledger.expenses,
    });

    return {
      tripId,
      shortId,
      netBalancesInrMinor,
      settlements,
      kittyPools: ledger.kittyPools,
      expenseCount: ledger.expenses.length,
    };
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
