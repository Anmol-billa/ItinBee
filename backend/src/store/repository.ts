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
  InviteRole,
  ItineraryItem,
  ItemKind,
  KittyPoolView,
  MemberRole,
  OutboundChecklistItem,
  PacingLevel,
  PollView,
  SplitMode,
  SyncClientMutation,
  SyncServerDelta,
  TransitMeta,
  TripDay,
  TripMemberPublic,
  TripMeta,
  TripWorkspaceResponse,
  UpiSettlementInstruction,
  UserPublic,
  UserSelf,
} from '../types/domain.js';
import type { RawPassengerMeta } from '../security/aadhaar-redactor.js';

export interface CreateUserInput {
  phone?: string;
  email?: string;
  googleSub?: string;
  displayName: string;
  preferredLang?: string;
  upiVpa?: string;
  tier?: 'free' | 'trip_pass' | 'pro';
}

export interface CreateTripInput {
  ownerId: string;
  title: string;
  destinationSummary?: string;
  startDate?: string | null;
  endDate?: string | null;
  homeCurrency?: CurrencyCode;
  elderModeEnabled?: boolean;
  isPublicTemplate?: boolean;
  daysCount?: number;
}

export interface UpdateTripMetaInput {
  title?: string;
  destinationSummary?: string;
  elderModeEnabled?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  homeCurrency?: CurrencyCode;
}

export interface SandboxClaimInput {
  ownerId: string;
  title: string;
  destinationSummary?: string;
  startDate?: string | null;
  endDate?: string | null;
  homeCurrency?: CurrencyCode;
  elderModeEnabled?: boolean;
  days: Array<{
    id?: string;
    dayNumber: number;
    date?: string | null;
    themeTitle?: string;
    pacingLevel?: PacingLevel;
  }>;
  items: Array<{
    id?: string;
    dayNumber?: number | null;
    dayId?: string | null;
    kind: ItemKind;
    title: string;
    notes?: string;
    lat?: number | null;
    lng?: number | null;
    placeRefId?: string | null;
    addressLocalScript?: string | null;
    sortKey?: string;
    startTime?: string | null;
    durationMins?: number | null;
    transitMeta?: TransitMeta;
    dietaryFlags?: string[];
    accessibilityNotes?: string;
    elderSummaryI18n?: { en?: string; hi?: string };
    isShortlist?: boolean;
  }>;
}

export interface CreateBookingInput {
  tripId: string;
  itemId?: string | null;
  provider: BookingProvider;
  pnr?: string | null;
  passengers?: RawPassengerMeta[];
  summary: BookingSummaryPublic;
  lowConfidenceFields?: string[];
  status?: BookingStatus;
  rawDocS3Key?: string | null;
  docSizeBytes?: number;
  docFileName?: string | null;
  docMimeType?: string | null;
  parserConfidence?: number;
  coTravellerConsent?: boolean;
}

export interface CreatePollInput {
  tripId: string;
  createdBy?: string | null;
  question: string;
  options: Array<{ id?: string; label: string; subtitle?: string }>;
  closesAt?: string | null;
}

export interface CastPollVoteInput {
  shortId: string;
  pollId: string;
  optionId: string;
  voterId?: string | null;
  guestSessionHash?: string | null;
  guestDisplayName: string;
}

export interface CreateKittyPoolInput {
  tripId: string;
  title: string;
  custodianId: string;
  currency?: CurrencyCode;
  memberContributionsMinor: Record<string, number>;
}

export interface CreateExpenseInput {
  tripId: string;
  clientOpId: string;
  entryType?: ExpenseEntryType;
  reversesExpenseId?: string | null;
  title: string;
  category?: string;
  paidBy: string;
  kittyPoolId?: string | null;
  amountMinor?: number;
  currency?: CurrencyCode;
  fxRateOverride?: number;
  splitMode?: SplitMode;
  participantIds?: string[];
  excludedTags?: string[];
  exactSplitsInrMinor?: Record<string, number>;
  shareWeights?: Record<string, number>;
  upiTxnRef?: string | null;
}

export interface VaultBlobRecord {
  s3Key: string;
  tripId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  encryptedPayload: Buffer;
}

export interface TripInviteStored {
  token: string;
  tripId: string;
  tripTitle: string;
  destinationSummary: string;
  role: InviteRole;
  vaultAccess: boolean;
  inviterName?: string;
  inviteeEmail: string | null;
  expiresAt: string;
  acceptedCount: number;
}

export interface BookingVaultMeta {
  id: string;
  tripId: string;
  rawDocS3Key: string | null;
  docSizeBytes: number;
  docFileName: string | null;
  docMimeType: string | null;
}

export interface TripStore {
  readonly backendKind: 'postgres' | 'local-memory';
  checkHealth(): Promise<{ ok: boolean; detail: string }>;

  // Auth & Users
  createGuestUser(displayName?: string): Promise<UserPublic>;
  isGuestUser(userId: string): Promise<boolean>;
  upsertUserByPhone(phone: string, displayName?: string, upiVpa?: string): Promise<UserPublic>;
  upsertUserByEmail(params: {
    email: string;
    displayName?: string;
    upiVpa?: string;
  }): Promise<UserPublic>;
  upsertUserByGoogle(params: {
    googleSub: string;
    email: string;
    displayName: string;
    upiVpa?: string;
  }): Promise<UserPublic>;
  updateUserProfile(
    userId: string,
    patch: { displayName?: string; preferredLang?: string; upiVpa?: string | null }
  ): Promise<UserSelf | null>;
  mergeGuestIntoUser(guestUserId: string, targetUserId: string): Promise<number>;
  getUserById(userId: string): Promise<UserPublic | null>;
  getUserSelfById(userId: string): Promise<UserSelf | null>;
  deleteUser(userId: string): Promise<boolean>;

  // Trips, Access, Members & Invites
  listSampleAndUserTrips(userId?: string | null): Promise<TripMeta[]>;
  listUserTrips(userId: string): Promise<TripMeta[]>;
  createTrip(input: CreateTripInput): Promise<TripWorkspaceResponse>;
  updateTripMeta(tripId: string, patch: UpdateTripMetaInput): Promise<TripMeta | null>;
  getTripAccessInfo(
    tripId: string,
    userId?: string | null
  ): Promise<{ trip: TripMeta; member: TripMemberPublic | null } | null>;
  addTripMember(params: {
    tripId: string;
    userId: string;
    role: MemberRole;
    vaultAccess?: boolean;
    dietaryTags?: string[];
  }): Promise<void>;
  upsertTripMemberWithDetails(params: {
    tripId: string;
    userId?: string;
    displayName?: string;
    role: MemberRole;
    vaultAccess?: boolean;
    dietaryTags?: string[];
    upiVpa?: string | null;
    callerUserId?: string;
  }): Promise<TripMemberPublic>;
  updateTripMemberDetails(params: {
    tripId: string;
    memberUserId: string;
    callerUserId: string;
    role?: MemberRole;
    vaultAccess?: boolean;
    dietaryTags?: string[];
    displayName?: string;
    upiVpa?: string | null;
  }): Promise<TripMemberPublic | 'last_owner' | null>;
  removeTripMember(
    tripId: string,
    memberUserId: string
  ): Promise<'removed' | 'not_found' | 'last_owner'>;
  createTripInvite(params: {
    tripId: string;
    createdBy: string;
    role: InviteRole;
    vaultAccess: boolean;
    inviteeEmail?: string | null;
    ttlSeconds?: number;
  }): Promise<TripInviteStored>;
  getTripInvite(token: string): Promise<TripInviteStored | null>;
  acceptTripInvite(
    token: string,
    userId: string
  ): Promise<{ tripId: string; role: MemberRole } | 'not_found' | 'expired'>;

  claimSandboxTrip(input: SandboxClaimInput): Promise<TripWorkspaceResponse>;
  getTripWorkspace(
    tripId: string,
    requesterUserId?: string | null
  ): Promise<TripWorkspaceResponse | null>;
  getGuestShareByShortId(
    shortId: string,
    requesterUserId?: string | null
  ): Promise<GuestShareResponse | BookingUnlockedShareResult | null>;
  getOfflineBundle(
    tripId: string,
    requesterUserId?: string | null
  ): Promise<{
    generatedAt: string;
    pmtilesRegionHint: string;
    mapAttribution: string;
    workspace: TripWorkspaceResponse;
  } | null>;

  // Delta-Sync
  syncTripMutations(params: {
    tripId: string;
    lastSeenSeq: number;
    mutations: SyncClientMutation[];
  }): Promise<{
    latestSeq: number;
    appliedOps: SyncServerDelta[];
    pulledDeltas: SyncServerDelta[];
    activeDays: TripDay[];
    activeItems: ItineraryItem[];
    shortlistItems: ItineraryItem[];
  }>;

  // Bookings & Encrypted Vault Fallback
  createBooking(input: CreateBookingInput): Promise<BookingVaultView>;
  createShortlistItem(params: {
    tripId: string;
    kind: ItemKind;
    title: string;
    notes?: string;
    lat?: number | null;
    lng?: number | null;
    placeRefId?: string | null;
    addressLocalScript?: string | null;
    dietaryFlags?: string[];
    accessibilityNotes?: string;
  }): Promise<ItineraryItem>;
  getBookingById(
    tripId: string,
    bookingId: string
  ): Promise<BookingRedactedView | null>;
  getBookingVaultMeta(
    tripId: string,
    bookingId: string
  ): Promise<BookingVaultMeta | null>;
  deleteBooking(
    tripId: string,
    bookingId: string
  ): Promise<{ rawDocS3Key: string | null } | null>;
  putVaultBlob(blob: VaultBlobRecord): Promise<void>;
  getVaultBlob(s3Key: string): Promise<VaultBlobRecord | null>;
  deleteVaultBlob(s3Key: string): Promise<void>;

  // Polls, Kitty & Expenses
  createPoll(input: CreatePollInput): Promise<PollView>;
  castPollVote(input: CastPollVoteInput): Promise<PollView>;
  createKittyPool(input: CreateKittyPoolInput): Promise<KittyPoolView>;
  appendExpense(input: CreateExpenseInput): Promise<ExpenseView>;
  deleteExpense(tripId: string, expenseId: string): Promise<boolean>;
  getSettlements(tripId: string): Promise<{
    tripId: string;
    shortId: string;
    netBalancesInrMinor: Record<string, number>;
    settlements: UpiSettlementInstruction[];
    kittyPools: KittyPoolView[];
    expenseCount: number;
  }>;

  close(): Promise<void>;
}

export interface BookingUnlockedShareResult extends GuestShareResponse {}

/**
 * Keeps any `(ND)` duration suffix in `destinationSummary` (e.g. `"Munnar (3D)"` -> `"Munnar (4D)"`)
 * synchronized whenever active trip days are added or deleted.
 */
export function syncDurationSummarySuffix(
  summary: string,
  activeDaysCount: number
): string {
  if (activeDaysCount < 1 || !summary) return summary;
  return summary.replace(/\(\d+D\)(?=\s*$)/i, `(${activeDaysCount}D)`);
}

export function buildOutboundChecklist(destinationText: string): OutboundChecklistItem[] {
  const lower = destinationText.toLowerCase();
  if (lower.includes('vietnam') || lower.includes('hanoi') || lower.includes('da nang') || lower.includes('hoi an')) {
    return [
      {
        id: 'vn-evisa',
        corridor: 'Vietnam',
        title: 'Vietnam Official e-Visa PDF (90-day single/multi entry)',
        detail: 'Apply at evisa.gov.vn at least 7 working days prior; keep printed copy + offline PDF in Vault.',
        category: 'visa',
      },
      {
        id: 'vn-passport',
        corridor: 'Vietnam',
        title: 'Passport 6-Month Validity & 2 Blank Pages',
        detail: 'Verify expiry extends >= 6 months past return flight to India.',
        category: 'passport',
      },
      {
        id: 'vn-forex',
        corridor: 'Vietnam',
        title: 'Zero-Markup INR Forex Card + Clean USD/VND Cash',
        detail: 'Carry crisp $100 bills or zero-forex Visa/Mastercard for BIDV/TPBank ATM withdrawals.',
        category: 'forex',
      },
      {
        id: 'vn-esim',
        corridor: 'Vietnam',
        title: 'Viettel Tourist eSIM Activation',
        detail: 'Best hill/bay coverage across Ha Long & Ninh Binh; pre-install QR before boarding.',
        category: 'esim',
      },
    ];
  }
  if (lower.includes('thailand') || lower.includes('bangkok') || lower.includes('phuket')) {
    return [
      {
        id: 'th-tdac',
        corridor: 'Thailand',
        title: 'Thailand Digital Arrival Card & Visa-Exempt Entry Check',
        detail: 'Keep return flight PNR and confirmed stay voucher accessible offline.',
        category: 'visa',
      },
      {
        id: 'th-forex',
        corridor: 'Thailand',
        title: 'Zero-Markup Forex + THB Cash Reserve',
        detail: 'Immigration may spot-check 10,000 THB/person or 20,000 THB/family equivalent.',
        category: 'forex',
      },
    ];
  }
  if (lower.includes('dubai') || lower.includes('uae') || lower.includes('abu dhabi')) {
    return [
      {
        id: 'ae-visa',
        corridor: 'UAE',
        title: 'UAE Tourist e-Visa / Visa-on-Arrival (Valid US/UK/Schengen)',
        detail: 'Attach e-Visa PDF + mandatory travel health insurance in Vault.',
        category: 'visa',
      },
    ];
  }
  return [];
}

export function buildWhatsappDigestText(params: {
  title: string;
  shortId: string;
  days: TripDay[];
  items: ItineraryItem[];
}): string {
  const lines: string[] = [
    `*${params.title}* (Itinbee Plan)`,
    `Live Map, Elder Card & Polls: https://itinbee.com/t/${params.shortId}`,
    '',
  ];

  const activeDays = params.days
    .filter((d) => !d.deletedAt)
    .sort((a, b) => a.dayNumber - b.dayNumber);

  for (const day of activeDays) {
    const dateSuffix = day.date ? ` (${day.date})` : '';
    const themeSuffix = day.themeTitle ? ` — ${day.themeTitle}` : '';
    lines.push(`*Day ${day.dayNumber}${dateSuffix}${themeSuffix}*`);

    const dayItems = params.items.filter(
      (it) => it.dayId === day.id && !it.deletedAt && !it.isShortlist
    );
    if (dayItems.length === 0) {
      lines.push('  • Open buffer / flexible exploration');
    } else {
      for (const it of dayItems) {
        const timePrefix = it.startTime ? `${it.startTime} · ` : '';
        const vegBadge = it.dietaryFlags.includes('pure_veg') ? ' [Pure Veg]' : '';
        lines.push(`  • ${timePrefix}${it.title}${vegBadge}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
