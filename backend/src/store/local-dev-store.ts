import crypto from 'node:crypto';
import fs from 'node:fs';
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
  buildPreSeededSampleDataset,
  helperSeedItemProps,
} from './seed-data.js';
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

interface InternalUserRecord {
  id: string;
  phoneHash: string | null;
  googleSubHash: string | null;
  phoneEnc: Buffer | null;
  emailEnc: Buffer | null;
  upiVpaEnc: Buffer | null;
  displayName: string;
  preferredLang: string;
  tier: 'free' | 'trip_pass' | 'pro';
  createdAt: string;
}

interface InternalMemberRecord {
  tripId: string;
  userId: string;
  role: MemberRole;
  vaultAccess: boolean;
  dietaryTags: string[];
  joinedAt: string;
}

interface InternalBookingRecord {
  id: string;
  tripId: string;
  itemId: string | null;
  provider: BookingProvider;
  pnrEnc: Buffer | null;
  pnrLast3: string | null;
  passengerMetaEnc: Buffer | null;
  summary: BookingSummaryPublic;
  lowConfidenceFields: string[];
  status: BookingStatus;
  rawDocS3Key: string | null;
  docSizeBytes: number;
  parserConfidence: number;
  coTravellerConsentAt: string | null;
  createdAt: string;
}

interface InternalPollRecord {
  id: string;
  tripId: string;
  question: string;
  options: Array<{ id: string; label: string; subtitle?: string }>;
  closesAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface InternalPollVoteRecord {
  id: string;
  pollId: string;
  voterId: string | null;
  guestSessionHash: string | null;
  guestDisplayName: string;
  optionId: string;
  createdAt: string;
}

interface InternalKittyRecord {
  id: string;
  tripId: string;
  title: string;
  custodianId: string;
  currency: CurrencyCode;
  initialContributionMinor: number;
  memberContributionsMinor: Record<string, number>;
  status: 'open' | 'settled';
  createdAt: string;
}

interface InternalTripRecord {
  meta: TripMeta;
  syncState: SyncStateSnapshot;
  members: Map<string, InternalMemberRecord>;
  bookings: Map<string, InternalBookingRecord>;
  polls: Map<string, InternalPollRecord>;
  pollVotes: InternalPollVoteRecord[];
  kittyPools: Map<string, InternalKittyRecord>;
  expenses: ExpenseView[];
  expensesByClientOpId: Map<string, ExpenseView>;
}

function generateShortId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 5);
  const rand = crypto.randomBytes(3).toString('hex').slice(0, 5);
  return `${slug || 'trip'}-${rand}`.slice(0, 12);
}

export class LocalDevStore implements TripStore {
  public readonly backendKind = 'local-memory' as const;
  private readonly kms: KmsEnvelopeService;
  private readonly persistFilePath?: string;

  private readonly users = new Map<string, InternalUserRecord>();
  private readonly userIdByPhoneHash = new Map<string, string>();
  private readonly userIdByGoogleHash = new Map<string, string>();
  private readonly trips = new Map<string, InternalTripRecord>();
  private readonly tripIdByShortId = new Map<string, string>();
  private initPromise: Promise<void> | null = null;

  constructor(options?: {
    kms?: KmsEnvelopeService;
    persistFilePath?: string;
    seedSamples?: boolean;
  }) {
    this.kms = options?.kms ?? defaultKmsEnvelope;
    this.persistFilePath = options?.persistFilePath;
    if (options?.seedSamples !== false) {
      this.initPromise = this.seedInitialData();
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  private async seedInitialData(): Promise<void> {
    const seed = buildPreSeededSampleDataset();
    const nowIso = '2026-11-20T06:00:00.000Z';

    for (const u of seed.users) {
      const phoneHash = hashIdentifier(u.phone);
      const phoneEnc = await this.kms.encryptString(u.phone, `user:${u.id}:phone`);
      const upiVpaEnc = await this.kms.encryptString(u.upiVpa, `user:${u.id}:upi`);
      const rec: InternalUserRecord = {
        id: u.id,
        phoneHash,
        googleSubHash: null,
        phoneEnc,
        emailEnc: null,
        upiVpaEnc,
        displayName: u.displayName,
        preferredLang: u.preferredLang,
        tier: u.tier,
        createdAt: nowIso,
      };
      this.users.set(u.id, rec);
      this.userIdByPhoneHash.set(phoneHash, u.id);
    }

    for (const t of seed.trips) {
      const daysMap = new Map<string, TripDay>();
      const itemsMap = new Map<string, ItineraryItem>();
      let seq = 0;

      for (const d of t.days) {
        seq += 1;
        daysMap.set(d.id, {
          id: d.id,
          tripId: t.id,
          dayNumber: d.dayNumber,
          date: d.date,
          themeTitle: d.themeTitle,
          pacingLevel: d.pacingLevel,
          serverSeq: seq,
          hlcTimestamp: formatHlc({ wallMs: 1763596800000 + seq, logical: 0, nodeId: 'seed' }),
          deletedAt: null,
        });

        d.items.forEach((it, idx) => {
          seq += 1;
          const props = helperSeedItemProps(it.lat, it.lng, idx, d.items.length);
          itemsMap.set(it.id, {
            id: it.id,
            tripId: t.id,
            dayId: d.id,
            kind: it.kind,
            title: it.title,
            notes: it.notes,
            lat: it.lat,
            lng: it.lng,
            placeRefId: it.placeRefId,
            addressLocalScript: it.addressLocalScript,
            sortKey: props.sortKey,
            startTime: it.startTime,
            durationMins: it.durationMins,
            transitMeta: {},
            dietaryFlags: it.dietaryFlags,
            accessibilityNotes: it.accessibilityNotes,
            elderSummaryI18n: it.elderSummaryI18n,
            isShortlist: false,
            serverSeq: seq,
            hlcTimestamp: props.hlcTimestamp,
            deletedAt: null,
            googleMapsUrl: props.googleMapsUrl,
          });
        });
      }

      const membersMap = new Map<string, InternalMemberRecord>();
      for (const m of t.members) {
        membersMap.set(m.userId, {
          tripId: t.id,
          userId: m.userId,
          role: m.role,
          vaultAccess: m.vaultAccess,
          dietaryTags: m.dietaryTags,
          joinedAt: nowIso,
        });
      }

      const bookingsMap = new Map<string, InternalBookingRecord>();
      for (const b of t.bookings) {
        const pnrEnc = await this.kms.encryptString(
          b.pnrPlain,
          `booking:${t.id}:${b.id}:pnr`
        );
        const sanitizedPax = sanitizePassengerMeta(b.passengers, false);
        const passengerMetaEnc = await this.kms.encryptString(
          JSON.stringify(sanitizedPax),
          `booking:${t.id}:${b.id}:pax`
        );
        bookingsMap.set(b.id, {
          id: b.id,
          tripId: t.id,
          itemId: b.itemId,
          provider: b.provider,
          pnrEnc,
          pnrLast3: extractPnrLast3(b.pnrPlain),
          passengerMetaEnc,
          summary: {
            headline: b.summaryHeadline,
            routeLabel: b.routeLabel,
            vehicleNumber: b.vehicleNumber,
            coach: b.coach,
            seatOrBerth: b.seatOrBerth,
          },
          lowConfidenceFields: [],
          status: b.status,
          rawDocS3Key: b.rawDocS3Key,
          docSizeBytes: 124_000,
          parserConfidence: b.parserConfidence,
          coTravellerConsentAt: null,
          createdAt: nowIso,
        });
      }

      const pollsMap = new Map<string, InternalPollRecord>();
      for (const p of t.polls) {
        pollsMap.set(p.id, {
          id: p.id,
          tripId: t.id,
          question: p.question,
          options: p.options,
          closesAt: null,
          createdBy: t.members[0]?.userId ?? null,
          createdAt: nowIso,
        });
      }

      const meta: TripMeta = {
        id: t.id,
        shortId: t.shortId,
        title: t.title,
        destinationSummary: t.destinationSummary,
        startDate: t.startDate,
        endDate: t.endDate,
        homeCurrency: t.homeCurrency,
        isPublicTemplate: true,
        isSample: true,
        elderModeEnabled: t.elderModeEnabled,
        vaultBytesUsed: t.bookings.length * 124_000,
        vaultQuotaBytes: getVaultQuotaForTier('free'),
        latestSeq: seq,
        mapAttribution: '© OpenStreetMap contributors',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const tripRec: InternalTripRecord = {
        meta,
        syncState: {
          tripId: t.id,
          latestSeq: seq,
          lastServerHlc: formatHlc({ wallMs: 1763596800000 + seq, logical: 0, nodeId: 'seed' }),
          days: daysMap,
          items: itemsMap,
          appliedOpsByClientId: new Map(),
          opLog: [],
        },
        members: membersMap,
        bookings: bookingsMap,
        polls: pollsMap,
        pollVotes: [],
        kittyPools: new Map(),
        expenses: [],
        expensesByClientOpId: new Map(),
      };

      this.trips.set(t.id, tripRec);
      this.tripIdByShortId.set(t.shortId, t.id);
    }

    this.flushSnapshotIfConfigured();
  }

  private flushSnapshotIfConfigured(): void {
    if (!this.persistFilePath) return;
    try {
      const summary = {
        savedAt: new Date().toISOString(),
        tripCount: this.trips.size,
        userCount: this.users.size,
      };
      fs.writeFileSync(this.persistFilePath, JSON.stringify(summary, null, 2), 'utf8');
    } catch {
      // Ignore optional dev snapshot write failures
    }
  }

  private toUserPublic(u: InternalUserRecord): UserPublic {
    return {
      id: u.id,
      displayName: u.displayName,
      preferredLang: u.preferredLang,
      tier: u.tier,
      hasUpiVpa: u.upiVpaEnc !== null,
      createdAt: u.createdAt,
    };
  }

  private async decryptUserUpiVpa(u: InternalUserRecord): Promise<string | null> {
    if (!u.upiVpaEnc) return null;
    return this.kms.decryptString(u.upiVpaEnc, `user:${u.id}:upi`);
  }

  public async checkHealth(): Promise<{ ok: boolean; detail: string }> {
    await this.ensureReady();
    return {
      ok: true,
      detail: `LocalDevStore ready (${this.trips.size} trips in memory)`,
    };
  }

  public async upsertUserByPhone(
    phone: string,
    displayName?: string,
    upiVpa?: string
  ): Promise<UserPublic> {
    await this.ensureReady();
    const normalizedPhone = phone.trim();
    const phoneHash = hashIdentifier(normalizedPhone);
    const existingId = this.userIdByPhoneHash.get(phoneHash);

    if (existingId) {
      const existing = this.users.get(existingId)!;
      if (displayName && displayName.trim()) {
        existing.displayName = displayName.trim();
      }
      if (upiVpa && upiVpa.trim()) {
        existing.upiVpaEnc = await this.kms.encryptString(
          upiVpa.trim(),
          `user:${existing.id}:upi`
        );
      }
      return this.toUserPublic(existing);
    }

    const id = crypto.randomUUID();
    const phoneEnc = await this.kms.encryptString(
      normalizedPhone,
      `user:${id}:phone`
    );
    const upiVpaEnc =
      upiVpa && upiVpa.trim()
        ? await this.kms.encryptString(upiVpa.trim(), `user:${id}:upi`)
        : null;

    const created: InternalUserRecord = {
      id,
      phoneHash,
      googleSubHash: null,
      phoneEnc,
      emailEnc: null,
      upiVpaEnc,
      displayName: displayName?.trim() || `Traveller ${normalizedPhone.slice(-4)}`,
      preferredLang: 'en',
      tier: 'free',
      createdAt: new Date().toISOString(),
    };
    this.users.set(id, created);
    this.userIdByPhoneHash.set(phoneHash, id);
    this.flushSnapshotIfConfigured();
    return this.toUserPublic(created);
  }

  public async upsertUserByGoogle(params: {
    googleSub: string;
    email: string;
    displayName: string;
    upiVpa?: string;
  }): Promise<UserPublic> {
    await this.ensureReady();
    const googleSubHash = hashIdentifier(params.googleSub);
    const existingId = this.userIdByGoogleHash.get(googleSubHash);

    if (existingId) {
      const existing = this.users.get(existingId)!;
      if (params.displayName.trim()) {
        existing.displayName = params.displayName.trim();
      }
      if (params.upiVpa?.trim()) {
        existing.upiVpaEnc = await this.kms.encryptString(
          params.upiVpa.trim(),
          `user:${existing.id}:upi`
        );
      }
      return this.toUserPublic(existing);
    }

    const id = crypto.randomUUID();
    const emailEnc = await this.kms.encryptString(
      params.email.trim().toLowerCase(),
      `user:${id}:email`
    );
    const upiVpaEnc = params.upiVpa?.trim()
      ? await this.kms.encryptString(params.upiVpa.trim(), `user:${id}:upi`)
      : null;

    const created: InternalUserRecord = {
      id,
      phoneHash: null,
      googleSubHash,
      phoneEnc: null,
      emailEnc,
      upiVpaEnc,
      displayName: params.displayName.trim() || 'Traveller',
      preferredLang: 'en',
      tier: 'free',
      createdAt: new Date().toISOString(),
    };
    this.users.set(id, created);
    this.userIdByGoogleHash.set(googleSubHash, id);
    this.flushSnapshotIfConfigured();
    return this.toUserPublic(created);
  }

  public async getUserById(userId: string): Promise<UserPublic | null> {
    await this.ensureReady();
    const u = this.users.get(userId);
    return u ? this.toUserPublic(u) : null;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    await this.ensureReady();
    const u = this.users.get(userId);
    if (!u) return false;
    if (u.phoneHash) this.userIdByPhoneHash.delete(u.phoneHash);
    if (u.googleSubHash) this.userIdByGoogleHash.delete(u.googleSubHash);
    this.users.delete(userId);
    return true;
  }

  public async listSampleAndUserTrips(userId?: string | null): Promise<TripMeta[]> {
    await this.ensureReady();
    const list: TripMeta[] = [];
    for (const trip of this.trips.values()) {
      if (
        trip.meta.isPublicTemplate ||
        trip.meta.isSample ||
        (userId && trip.members.has(userId))
      ) {
        list.push({ ...trip.meta });
      }
    }
    return list;
  }

  private allocateUniqueShortId(title: string): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateShortId(title);
      if (!this.tripIdByShortId.has(candidate)) {
        return candidate;
      }
    }
    return crypto.randomBytes(6).toString('hex');
  }

  public async createTrip(input: CreateTripInput): Promise<TripWorkspaceResponse> {
    await this.ensureReady();
    const tripId = crypto.randomUUID();
    const shortId = this.allocateUniqueShortId(input.title);
    const nowIso = new Date().toISOString();

    const ownerUser = this.users.get(input.ownerId);
    const quotaBytes = getVaultQuotaForTier(ownerUser?.tier ?? 'free');

    const daysCount = Math.min(Math.max(input.daysCount ?? 3, 1), 30);
    const daysMap = new Map<string, TripDay>();
    let seq = 0;

    for (let d = 1; d <= daysCount; d++) {
      seq += 1;
      let dateStr: string | null = null;
      if (input.startDate) {
        const base = new Date(`${input.startDate}T00:00:00Z`);
        if (!Number.isNaN(base.getTime())) {
          base.setUTCDate(base.getUTCDate() + (d - 1));
          dateStr = base.toISOString().slice(0, 10);
        }
      }
      const dayId = crypto.randomUUID();
      daysMap.set(dayId, {
        id: dayId,
        tripId,
        dayNumber: d,
        date: dateStr,
        themeTitle: `Day ${d}`,
        pacingLevel: 'moderate',
        serverSeq: seq,
        hlcTimestamp: formatHlc({ wallMs: Date.now() + seq, logical: 0, nodeId: 'srv' }),
        deletedAt: null,
      });
    }

    const members = new Map<string, InternalMemberRecord>();
    members.set(input.ownerId, {
      tripId,
      userId: input.ownerId,
      role: 'owner',
      vaultAccess: true,
      dietaryTags: [],
      joinedAt: nowIso,
    });

    const meta: TripMeta = {
      id: tripId,
      shortId,
      title: input.title,
      destinationSummary: input.destinationSummary ?? '',
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      homeCurrency: input.homeCurrency ?? 'INR',
      isPublicTemplate: input.isPublicTemplate ?? false,
      isSample: false,
      elderModeEnabled: input.elderModeEnabled ?? true,
      vaultBytesUsed: 0,
      vaultQuotaBytes: quotaBytes,
      latestSeq: seq,
      mapAttribution: '© OpenStreetMap contributors',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const tripRec: InternalTripRecord = {
      meta,
      syncState: {
        tripId,
        latestSeq: seq,
        lastServerHlc: formatHlc({ wallMs: Date.now() + seq, logical: 0, nodeId: 'srv' }),
        days: daysMap,
        items: new Map(),
        appliedOpsByClientId: new Map(),
        opLog: [],
      },
      members,
      bookings: new Map(),
      polls: new Map(),
      pollVotes: [],
      kittyPools: new Map(),
      expenses: [],
      expensesByClientOpId: new Map(),
    };

    this.trips.set(tripId, tripRec);
    this.tripIdByShortId.set(shortId, tripId);
    this.flushSnapshotIfConfigured();

    const ws = await this.getTripWorkspace(tripId, input.ownerId);
    return ws!;
  }

  public async addTripMember(params: {
    tripId: string;
    userId: string;
    role: MemberRole;
    vaultAccess?: boolean;
    dietaryTags?: string[];
  }): Promise<void> {
    await this.ensureReady();
    const trip = this.trips.get(params.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${params.tripId}`);
    }
    trip.members.set(params.userId, {
      tripId: params.tripId,
      userId: params.userId,
      role: params.role,
      vaultAccess:
        params.vaultAccess ?? (params.role === 'owner' || params.role === 'editor'),
      dietaryTags: params.dietaryTags ?? [],
      joinedAt: new Date().toISOString(),
    });
  }

  public async claimSandboxTrip(
    input: SandboxClaimInput
  ): Promise<TripWorkspaceResponse> {
    await this.ensureReady();
    const tripId = crypto.randomUUID();
    const shortId = this.allocateUniqueShortId(input.title);
    const nowIso = new Date().toISOString();

    const daysMap = new Map<string, TripDay>();
    const dayIdByNumber = new Map<number, string>();
    let seq = 0;

    const sortedDays = [...input.days].sort((a, b) => a.dayNumber - b.dayNumber);
    for (const d of sortedDays) {
      seq += 1;
      const dayId = d.id ?? crypto.randomUUID();
      daysMap.set(dayId, {
        id: dayId,
        tripId,
        dayNumber: d.dayNumber,
        date: d.date ?? null,
        themeTitle: d.themeTitle ?? `Day ${d.dayNumber}`,
        pacingLevel: d.pacingLevel ?? 'moderate',
        serverSeq: seq,
        hlcTimestamp: formatHlc({ wallMs: Date.now() + seq, logical: 0, nodeId: 'claim' }),
        deletedAt: null,
      });
      dayIdByNumber.set(d.dayNumber, dayId);
    }

    const itemsMap = new Map<string, ItineraryItem>();
    const defaultSortKeys = generateInitialSortKeys(Math.max(1, input.items.length));

    input.items.forEach((rawIt, idx) => {
      seq += 1;
      const itemId = rawIt.id ?? crypto.randomUUID();
      let resolvedDayId: string | null = rawIt.dayId ?? null;
      if (!resolvedDayId && rawIt.dayNumber !== undefined && rawIt.dayNumber !== null) {
        resolvedDayId = dayIdByNumber.get(rawIt.dayNumber) ?? null;
      }
      const isShortlist = Boolean(rawIt.isShortlist || resolvedDayId === null);
      const lat = rawIt.lat ?? null;
      const lng = rawIt.lng ?? null;

      itemsMap.set(itemId, {
        id: itemId,
        tripId,
        dayId: isShortlist ? null : resolvedDayId,
        kind: rawIt.kind,
        title: rawIt.title,
        notes: rawIt.notes ?? '',
        lat,
        lng,
        placeRefId: rawIt.placeRefId ?? null,
        addressLocalScript: rawIt.addressLocalScript ?? null,
        sortKey: rawIt.sortKey ?? defaultSortKeys[idx] ?? 'V0',
        startTime: rawIt.startTime ?? null,
        durationMins: rawIt.durationMins ?? null,
        transitMeta: {},
        dietaryFlags: rawIt.dietaryFlags ?? [],
        accessibilityNotes: rawIt.accessibilityNotes ?? '',
        elderSummaryI18n: rawIt.elderSummaryI18n ?? {},
        isShortlist,
        serverSeq: seq,
        hlcTimestamp: formatHlc({ wallMs: Date.now() + seq, logical: 0, nodeId: 'claim' }),
        deletedAt: null,
        googleMapsUrl:
          lat !== null && lng !== null ? buildGoogleMapsPlaceUrl(lat, lng) : null,
      });
    });

    const members = new Map<string, InternalMemberRecord>();
    members.set(input.ownerId, {
      tripId,
      userId: input.ownerId,
      role: 'owner',
      vaultAccess: true,
      dietaryTags: [],
      joinedAt: nowIso,
    });

    const meta: TripMeta = {
      id: tripId,
      shortId,
      title: input.title,
      destinationSummary: input.destinationSummary ?? '',
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      homeCurrency: input.homeCurrency ?? 'INR',
      isPublicTemplate: false,
      isSample: false,
      elderModeEnabled: input.elderModeEnabled ?? true,
      vaultBytesUsed: 0,
      vaultQuotaBytes: getVaultQuotaForTier('free'),
      latestSeq: seq,
      mapAttribution: '© OpenStreetMap contributors',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.trips.set(tripId, {
      meta,
      syncState: {
        tripId,
        latestSeq: seq,
        lastServerHlc: formatHlc({ wallMs: Date.now() + seq, logical: 0, nodeId: 'claim' }),
        days: daysMap,
        items: itemsMap,
        appliedOpsByClientId: new Map(),
        opLog: [],
      },
      members,
      bookings: new Map(),
      polls: new Map(),
      pollVotes: [],
      kittyPools: new Map(),
      expenses: [],
      expensesByClientOpId: new Map(),
    });
    this.tripIdByShortId.set(shortId, tripId);
    this.flushSnapshotIfConfigured();

    return (await this.getTripWorkspace(tripId, input.ownerId))!;
  }

  private toRedactedBookingView(b: InternalBookingRecord): BookingRedactedView {
    return {
      id: b.id,
      tripId: b.tripId,
      itemId: b.itemId,
      provider: b.provider,
      pnrMasked: maskPnrLast3(b.pnrLast3),
      pnrLast3: b.pnrLast3,
      status: b.status,
      summary: { ...b.summary },
      lowConfidenceFields: [...b.lowConfidenceFields],
      parserConfidence: b.parserConfidence,
      createdAt: b.createdAt,
    };
  }

  private async toVaultBookingView(
    b: InternalBookingRecord,
    hasVaultAccess: boolean
  ): Promise<BookingVaultView> {
    const base = this.toRedactedBookingView(b);
    if (!hasVaultAccess) {
      return {
        ...base,
        pnrPlain: null,
        passengers: [],
        hasEncryptedDocument: Boolean(b.rawDocS3Key),
        docSizeBytes: b.docSizeBytes,
      };
    }

    const pnrPlain = b.pnrEnc
      ? await this.kms.decryptString(b.pnrEnc, `booking:${b.tripId}:${b.id}:pnr`)
      : null;

    let passengers: BookingVaultView['passengers'] = [];
    if (b.passengerMetaEnc) {
      const decJson = await this.kms.decryptString(
        b.passengerMetaEnc,
        `booking:${b.tripId}:${b.id}:pax`
      );
      passengers = JSON.parse(decJson) as BookingVaultView['passengers'];
    }

    return {
      ...base,
      pnrPlain,
      passengers,
      hasEncryptedDocument: Boolean(b.rawDocS3Key),
      docSizeBytes: b.docSizeBytes,
    };
  }

  private projectPollViews(trip: InternalTripRecord): PollView[] {
    const out: PollView[] = [];
    for (const poll of trip.polls.values()) {
      const votesForPoll = trip.pollVotes.filter((v) => v.pollId === poll.id);
      const options = poll.options.map((opt) => {
        const optVotes = votesForPoll.filter((v) => v.optionId === opt.id);
        return {
          id: opt.id,
          label: opt.label,
          subtitle: opt.subtitle,
          voteCount: optVotes.length,
          voterNames: optVotes.map((v) => v.guestDisplayName),
        };
      });
      out.push({
        id: poll.id,
        tripId: poll.tripId,
        question: poll.question,
        options,
        closesAt: poll.closesAt,
        totalVotes: votesForPoll.length,
        createdAt: poll.createdAt,
      });
    }
    return out;
  }

  private projectKittyPools(trip: InternalTripRecord): KittyPoolView[] {
    const out: KittyPoolView[] = [];
    for (const pool of trip.kittyPools.values()) {
      const spentMinor = trip.expenses
        .filter((e) => e.kittyPoolId === pool.id)
        .reduce((acc, e) => acc + e.inrEquivalentMinor, 0);
      out.push({
        id: pool.id,
        tripId: pool.tripId,
        title: pool.title,
        custodianId: pool.custodianId,
        currency: pool.currency,
        initialContributionMinor: pool.initialContributionMinor,
        memberContributionsMinor: { ...pool.memberContributionsMinor },
        spentMinor: Math.max(0, spentMinor),
        remainingMinor: pool.initialContributionMinor - spentMinor,
        status: pool.status,
        createdAt: pool.createdAt,
      });
    }
    return out;
  }

  public async getTripWorkspace(
    tripId: string,
    requesterUserId?: string | null
  ): Promise<TripWorkspaceResponse | null> {
    await this.ensureReady();
    const trip = this.trips.get(tripId);
    if (!trip) return null;

    const memberRec = requesterUserId ? trip.members.get(requesterUserId) : undefined;
    const hasVaultAccess = Boolean(memberRec?.vaultAccess);

    const members: TripMemberPublic[] = [];
    for (const m of trip.members.values()) {
      const u = this.users.get(m.userId);
      members.push({
        userId: m.userId,
        displayName: u?.displayName ?? 'Traveller',
        role: m.role,
        vaultAccess: m.vaultAccess,
        dietaryTags: [...m.dietaryTags],
        joinedAt: m.joinedAt,
      });
    }

    const days = [...trip.syncState.days.values()]
      .filter((d) => !d.deletedAt)
      .sort((a, b) => a.dayNumber - b.dayNumber);

    const { activeItems, shortlistItems } = projectOrderedItems(
      trip.syncState.items.values()
    );

    const bookings: BookingVaultView[] = [];
    for (const b of trip.bookings.values()) {
      bookings.push(await this.toVaultBookingView(b, hasVaultAccess));
    }

    return {
      trip: { ...trip.meta, latestSeq: trip.syncState.latestSeq },
      members,
      days,
      items: activeItems,
      shortlist: shortlistItems,
      bookings,
      polls: this.projectPollViews(trip),
      kittyPools: this.projectKittyPools(trip),
      expenses: [...trip.expenses],
      outboundChecklist: buildOutboundChecklist(
        `${trip.meta.title} ${trip.meta.destinationSummary}`
      ),
    };
  }

  public async getGuestShareByShortId(
    shortId: string,
    _requesterUserId?: string | null
  ): Promise<GuestShareResponse | null> {
    await this.ensureReady();
    const tripId = this.tripIdByShortId.get(shortId);
    if (!tripId) return null;
    const trip = this.trips.get(tripId);
    if (!trip) return null;

    // Public WhatsApp share endpoint ALWAYS enforces `redactPii = true`:
    // Full PNRs (`pnrEnc` / `pnrPlain`), `rawDocS3Key`, and unconsented co-traveller ages/genders
    // are strictly omitted—returning ONLY `••••••<last3>`.
    const days = [...trip.syncState.days.values()]
      .filter((d) => !d.deletedAt)
      .sort((a, b) => a.dayNumber - b.dayNumber);

    const { activeItems, shortlistItems } = projectOrderedItems(
      trip.syncState.items.values()
    );

    const redactedBookings: BookingRedactedView[] = [];
    for (const b of trip.bookings.values()) {
      redactedBookings.push(this.toRedactedBookingView(b));
    }

    let plannerName = 'Trip Architect';
    for (const m of trip.members.values()) {
      if (m.role === 'owner') {
        const u = this.users.get(m.userId);
        if (u) plannerName = u.displayName;
        break;
      }
    }

    const { vaultBytesUsed: _vb, vaultQuotaBytes: _vq, ...publicTripMeta } = {
      ...trip.meta,
      latestSeq: trip.syncState.latestSeq,
    };

    return {
      redactPii: true,
      trip: publicTripMeta,
      plannerName,
      days,
      items: activeItems,
      shortlist: shortlistItems,
      bookings: redactedBookings,
      polls: this.projectPollViews(trip),
      whatsappDigestText: buildWhatsappDigestText({
        title: trip.meta.title,
        shortId: trip.meta.shortId,
        days,
        items: activeItems,
      }),
    };
  }

  public async getOfflineBundle(
    tripId: string,
    requesterUserId?: string | null
  ): Promise<{
    generatedAt: string;
    pmtilesRegionHint: string;
    mapAttribution: string;
    workspace: TripWorkspaceResponse;
  } | null> {
    const workspace = await this.getTripWorkspace(tripId, requesterUserId);
    if (!workspace) return null;

    const lower = `${workspace.trip.title} ${workspace.trip.destinationSummary}`.toLowerCase();
    const pmtilesRegionHint = lower.includes('vietnam')
      ? 'https://tiles.itinbee.com/pmtiles/se-asia-vietnam-v1.pmtiles'
      : 'https://tiles.itinbee.com/pmtiles/india-subcontinent-v1.pmtiles';

    return {
      generatedAt: new Date().toISOString(),
      pmtilesRegionHint,
      mapAttribution: '© OpenStreetMap contributors',
      workspace,
    };
  }

  public async syncTripMutations(params: {
    tripId: string;
    lastSeenSeq: number;
    mutations: SyncClientMutation[];
  }) {
    await this.ensureReady();
    const trip = this.trips.get(params.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${params.tripId}`);
    }

    const appliedOps = applySyncMutationsToState(
      trip.syncState,
      params.mutations
    );
    trip.meta.latestSeq = trip.syncState.latestSeq;
    trip.meta.updatedAt = new Date().toISOString();

    const pulledDeltas = trip.syncState.opLog.filter(
      (op) => op.serverSeq > params.lastSeenSeq
    );

    const activeDays = [...trip.syncState.days.values()]
      .filter((d) => !d.deletedAt)
      .sort((a, b) => a.dayNumber - b.dayNumber);

    const { activeItems, shortlistItems } = projectOrderedItems(
      trip.syncState.items.values()
    );

    this.flushSnapshotIfConfigured();

    return {
      latestSeq: trip.syncState.latestSeq,
      appliedOps,
      pulledDeltas,
      activeDays,
      activeItems,
      shortlistItems,
    };
  }

  public async createBooking(input: CreateBookingInput): Promise<BookingVaultView> {
    await this.ensureReady();
    const trip = this.trips.get(input.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${input.tripId}`);
    }

    const bookingId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

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
    const passengerMetaEnc = await this.kms.encryptString(
      JSON.stringify(sanitizedPax),
      `booking:${input.tripId}:${bookingId}:pax`
    );

    const docSizeBytes = input.docSizeBytes ?? 0;
    trip.meta.vaultBytesUsed += docSizeBytes;

    const rec: InternalBookingRecord = {
      id: bookingId,
      tripId: input.tripId,
      itemId: input.itemId ?? null,
      provider: input.provider,
      pnrEnc,
      pnrLast3: extractPnrLast3(input.pnr),
      passengerMetaEnc,
      summary: input.summary,
      lowConfidenceFields: input.lowConfidenceFields ?? [],
      status: input.status ?? 'confirmed',
      rawDocS3Key: input.rawDocS3Key ?? null,
      docSizeBytes,
      parserConfidence: input.parserConfidence ?? 1.0,
      coTravellerConsentAt: input.coTravellerConsent ? nowIso : null,
      createdAt: nowIso,
    };

    trip.bookings.set(bookingId, rec);
    this.flushSnapshotIfConfigured();
    return this.toVaultBookingView(rec, true);
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
    await this.ensureReady();
    const trip = this.trips.get(params.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${params.tripId}`);
    }

    const existingShortlist = [...trip.syncState.items.values()]
      .filter((i) => !i.deletedAt && i.isShortlist)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const lastKey = existingShortlist[existingShortlist.length - 1]?.sortKey ?? null;
    const nextSortKey = betweenSortKeys(lastKey, null);

    const itemId = crypto.randomUUID();
    const clientOpId = `ingest-${itemId}`;
    const hlc = formatHlc({ wallMs: Date.now(), logical: 0, nodeId: 'ingest' });

    await this.syncTripMutations({
      tripId: params.tripId,
      lastSeenSeq: trip.syncState.latestSeq,
      mutations: [
        {
          clientOpId,
          hlcTimestamp: hlc,
          baseSeq: trip.syncState.latestSeq,
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
            sortKey: nextSortKey,
            dietaryFlags: params.dietaryFlags ?? [],
            accessibilityNotes: params.accessibilityNotes ?? '',
          },
        },
      ],
    });

    return trip.syncState.items.get(itemId)!;
  }

  public async getBookingById(
    tripId: string,
    bookingId: string
  ): Promise<BookingRedactedView | null> {
    await this.ensureReady();
    const trip = this.trips.get(tripId);
    if (!trip) return null;
    const b = trip.bookings.get(bookingId);
    return b ? this.toRedactedBookingView(b) : null;
  }

  public async createPoll(input: CreatePollInput): Promise<PollView> {
    await this.ensureReady();
    const trip = this.trips.get(input.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${input.tripId}`);
    }

    const pollId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const options = input.options.map((opt, idx) => ({
      id: opt.id ?? `opt-${idx + 1}`,
      label: opt.label,
      subtitle: opt.subtitle,
    }));

    trip.polls.set(pollId, {
      id: pollId,
      tripId: input.tripId,
      question: input.question,
      options,
      closesAt: input.closesAt ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: nowIso,
    });

    this.flushSnapshotIfConfigured();
    return this.projectPollViews(trip).find((p) => p.id === pollId)!;
  }

  public async castPollVote(input: CastPollVoteInput): Promise<PollView> {
    await this.ensureReady();
    const tripId = this.tripIdByShortId.get(input.shortId);
    if (!tripId) {
      throw new Error(`Trip share link not found: ${input.shortId}`);
    }
    const trip = this.trips.get(tripId)!;
    const poll = trip.polls.get(input.pollId);
    if (!poll) {
      throw new Error(`Poll not found: ${input.pollId}`);
    }
    if (!poll.options.some((o) => o.id === input.optionId)) {
      throw new Error(`Invalid poll option: ${input.optionId}`);
    }

    // Deduplicate vote on (pollId, voterId, optionId) or (pollId, guestSessionHash, optionId)
    const duplicate = trip.pollVotes.find((v) => {
      if (v.pollId !== input.pollId || v.optionId !== input.optionId) return false;
      if (input.voterId && v.voterId === input.voterId) return true;
      if (input.guestSessionHash && v.guestSessionHash === input.guestSessionHash) {
        return true;
      }
      return false;
    });

    if (!duplicate) {
      // Replace any previous single-choice selection by the same voter on this poll, or record vote
      trip.pollVotes = trip.pollVotes.filter((v) => {
        if (v.pollId !== input.pollId) return true;
        if (input.voterId && v.voterId === input.voterId) return false;
        if (input.guestSessionHash && v.guestSessionHash === input.guestSessionHash) {
          return false;
        }
        return true;
      });

      trip.pollVotes.push({
        id: crypto.randomUUID(),
        pollId: input.pollId,
        voterId: input.voterId ?? null,
        guestSessionHash: input.guestSessionHash ?? null,
        guestDisplayName: input.guestDisplayName.trim() || 'Guest',
        optionId: input.optionId,
        createdAt: new Date().toISOString(),
      });
    }

    this.flushSnapshotIfConfigured();
    return this.projectPollViews(trip).find((p) => p.id === input.pollId)!;
  }

  public async createKittyPool(input: CreateKittyPoolInput): Promise<KittyPoolView> {
    await this.ensureReady();
    const trip = this.trips.get(input.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${input.tripId}`);
    }

    const poolId = crypto.randomUUID();
    const initialContributionMinor = Object.values(
      input.memberContributionsMinor
    ).reduce((acc, v) => acc + Math.max(0, Math.round(v)), 0);

    trip.kittyPools.set(poolId, {
      id: poolId,
      tripId: input.tripId,
      title: input.title,
      custodianId: input.custodianId,
      currency: input.currency ?? 'INR',
      initialContributionMinor,
      memberContributionsMinor: { ...input.memberContributionsMinor },
      status: 'open',
      createdAt: new Date().toISOString(),
    });

    this.flushSnapshotIfConfigured();
    return this.projectKittyPools(trip).find((k) => k.id === poolId)!;
  }

  private async buildLedgerMemberContexts(
    trip: InternalTripRecord
  ): Promise<LedgerMemberContext[]> {
    const out: LedgerMemberContext[] = [];
    for (const m of trip.members.values()) {
      const u = this.users.get(m.userId);
      const upiVpa = u ? await this.decryptUserUpiVpa(u) : null;
      out.push({
        userId: m.userId,
        displayName: u?.displayName ?? 'Traveller',
        dietaryTags: [...m.dietaryTags],
        upiVpa,
      });
    }
    return out;
  }

  public async appendExpense(input: CreateExpenseInput): Promise<ExpenseView> {
    await this.ensureReady();
    const trip = this.trips.get(input.tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${input.tripId}`);
    }

    // Idempotency on `client_op_id`
    const existing = trip.expensesByClientOpId.get(input.clientOpId);
    if (existing) {
      return existing;
    }

    const entryType: ExpenseEntryType = input.entryType ?? 'charge';
    const currency: CurrencyCode = input.currency ?? 'INR';
    const splitMode: SplitMode = input.splitMode ?? 'equal';

    // Handle compensating adjustments (`entry_type = 'adjustment'`) referencing `reverses_expense_id`
    let resolvedAmountMinor = input.amountMinor;
    let resolvedPaidBy = input.paidBy;
    let resolvedKittyPoolId = input.kittyPoolId ?? null;
    let resolvedSplitsInrMinor: Record<string, number> | null = null;
    let resolvedInrMinor = 0;
    let resolvedFxRate = 1.0;

    if (entryType === 'adjustment' && input.reversesExpenseId) {
      const target = trip.expenses.find((e) => e.id === input.reversesExpenseId);
      if (!target) {
        throw new Error(
          `reverses_expense_id not found on trip: ${input.reversesExpenseId}`
        );
      }

      if (resolvedAmountMinor === undefined) {
        // Full compensating reversal of `target`
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

      const memberContexts = await this.buildLedgerMemberContexts(trip);
      resolvedSplitsInrMinor = computeExpenseSplitsInrMinor({
        inrEquivalentMinor: resolvedInrMinor,
        splitMode,
        members: memberContexts,
        participantIds: input.participantIds,
        excludedTags: input.excludedTags,
        exactSplitsInrMinor: input.exactSplitsInrMinor,
        shareWeights: input.shareWeights,
      });
    }

    // If paid from Kitty Pool, ensure `paidBy` credits the Kitty custodian
    if (resolvedKittyPoolId) {
      const pool = trip.kittyPools.get(resolvedKittyPoolId);
      if (!pool) {
        throw new Error(`Kitty pool not found: ${resolvedKittyPoolId}`);
      }
      resolvedPaidBy = pool.custodianId;
    }

    const expenseView: ExpenseView = {
      id: crypto.randomUUID(),
      tripId: input.tripId,
      clientOpId: input.clientOpId,
      entryType,
      reversesExpenseId: input.reversesExpenseId ?? null,
      title: input.title,
      category: input.category ?? 'general',
      paidBy: resolvedPaidBy,
      kittyPoolId: resolvedKittyPoolId,
      amountMinor: Math.round(resolvedAmountMinor),
      currency,
      inrEquivalentMinor: resolvedInrMinor,
      fxRate: resolvedFxRate,
      splitMode,
      excludedTags: input.excludedTags ?? [],
      splitsInrMinor: resolvedSplitsInrMinor,
      upiTxnRef: input.upiTxnRef ?? null,
      createdAt: new Date().toISOString(),
    };

    // Immutable append-only push
    Object.freeze(expenseView.splitsInrMinor);
    Object.freeze(expenseView);
    trip.expenses.push(expenseView);
    trip.expensesByClientOpId.set(input.clientOpId, expenseView);
    this.flushSnapshotIfConfigured();

    return expenseView;
  }

  public async getSettlements(tripId: string): Promise<{
    tripId: string;
    shortId: string;
    netBalancesInrMinor: Record<string, number>;
    settlements: UpiSettlementInstruction[];
    kittyPools: KittyPoolView[];
    expenseCount: number;
  }> {
    await this.ensureReady();
    const trip = this.trips.get(tripId);
    if (!trip) {
      throw new Error(`Trip not found: ${tripId}`);
    }

    const memberContexts = await this.buildLedgerMemberContexts(trip);
    const kittyPools = this.projectKittyPools(trip);
    const { netBalancesInrMinor, settlements } = computeSimplifiedSettlements({
      tripShortId: trip.meta.shortId,
      members: memberContexts,
      kittyPools,
      expenses: trip.expenses,
    });

    return {
      tripId,
      shortId: trip.meta.shortId,
      netBalancesInrMinor,
      settlements,
      kittyPools,
      expenseCount: trip.expenses.length,
    };
  }

  public async close(): Promise<void> {
    this.flushSnapshotIfConfigured();
  }
}
