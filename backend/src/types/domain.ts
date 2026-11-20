import { z } from 'zod';

export const CurrencyCodeSchema = z.enum([
  'INR',
  'THB',
  'VND',
  'AED',
  'JPY',
  'EUR',
  'USD',
]);
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const MemberRoleSchema = z.enum(['owner', 'editor', 'contributor', 'viewer']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const PacingLevelSchema = z.enum(['relaxed', 'moderate', 'packed']);
export type PacingLevel = z.infer<typeof PacingLevelSchema>;

export const ItemKindSchema = z.enum(['stay', 'transit', 'activity', 'meal', 'note']);
export type ItemKind = z.infer<typeof ItemKindSchema>;

export const BookingProviderSchema = z.enum([
  'irctc',
  'indigo',
  'air_india',
  'akasa',
  'spicejet',
  'redbus',
  'abhibus',
  'mmt',
  'goibibo',
  'airbnb',
  'zostel',
  'homestay',
  'manual',
]);
export type BookingProvider = z.infer<typeof BookingProviderSchema>;

export const BookingStatusSchema = z.enum([
  'confirmed',
  'rac',
  'wl',
  'cancelled',
  'pending',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const UserPublicSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  preferredLang: z.string(),
  tier: z.enum(['free', 'trip_pass', 'pro']),
  hasUpiVpa: z.boolean(),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublicSchema>;

export const TripMemberPublicSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  role: MemberRoleSchema,
  vaultAccess: z.boolean(),
  dietaryTags: z.array(z.string()),
  joinedAt: z.string(),
});
export type TripMemberPublic = z.infer<typeof TripMemberPublicSchema>;

export const TripDaySchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  dayNumber: z.number().int().min(1),
  date: z.string().nullable(),
  themeTitle: z.string(),
  pacingLevel: PacingLevelSchema,
  serverSeq: z.number().int().nonnegative(),
  hlcTimestamp: z.string(),
  deletedAt: z.string().nullable(),
});
export type TripDay = z.infer<typeof TripDaySchema>;

export const ElderSummaryI18nSchema = z.object({
  en: z.string().optional(),
  hi: z.string().optional(),
});
export type ElderSummaryI18n = z.infer<typeof ElderSummaryI18nSchema>;

export const TransitMetaSchema = z.object({
  mode: z
    .enum(['rail', 'flight', 'bus', 'metro_cab', 'highway_cab', 'hill_cab', 'ferry', 'walk'])
    .optional(),
  vehicleCode: z.string().optional(),
  originName: z.string().optional(),
  destinationName: z.string().optional(),
  departureTime: z.string().optional(),
  arrivalTime: z.string().optional(),
  coachOrTerminal: z.string().optional(),
  seatOrBerth: z.string().optional(),
  boardingLandmark: z.string().optional(),
  distanceKm: z.number().optional(),
  estimatedDurationMins: z.number().int().optional(),
  advisory: z.string().optional(),
  googleMapsUrl: z.string().optional(),
});
export type TransitMeta = z.infer<typeof TransitMetaSchema>;

export const ItineraryItemSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  dayId: z.string().uuid().nullable(),
  kind: ItemKindSchema,
  title: z.string(),
  notes: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  placeRefId: z.string().nullable(),
  addressLocalScript: z.string().nullable(),
  sortKey: z.string(),
  startTime: z.string().nullable(),
  durationMins: z.number().int().nullable(),
  transitMeta: TransitMetaSchema,
  dietaryFlags: z.array(z.string()),
  accessibilityNotes: z.string(),
  elderSummaryI18n: ElderSummaryI18nSchema,
  isShortlist: z.boolean(),
  serverSeq: z.number().int().nonnegative(),
  hlcTimestamp: z.string(),
  deletedAt: z.string().nullable(),
  googleMapsUrl: z.string().nullable(),
});
export type ItineraryItem = z.infer<typeof ItineraryItemSchema>;

export const BookingSummaryPublicSchema = z.object({
  headline: z.string(),
  routeLabel: z.string().optional(),
  vehicleNumber: z.string().optional(),
  vehicleName: z.string().optional(),
  operatorName: z.string().optional(),
  originCode: z.string().optional(),
  originName: z.string().optional(),
  destinationCode: z.string().optional(),
  destinationName: z.string().optional(),
  departureIso: z.string().optional(),
  arrivalIso: z.string().optional(),
  terminalOrPlatform: z.string().optional(),
  coach: z.string().optional(),
  seatOrBerth: z.string().optional(),
  quota: z.string().optional(),
  boardingPoint: z.string().optional(),
  baggageAllowance: z.string().optional(),
  propertyName: z.string().optional(),
  checkInIso: z.string().optional(),
  checkOutIso: z.string().optional(),
});
export type BookingSummaryPublic = z.infer<typeof BookingSummaryPublicSchema>;

export const SanitizedPassengerSchema = z.object({
  name: z.string(),
  age: z.number().int().nullable().optional(),
  gender: z.string().nullable().optional(),
  seatOrBerth: z.string().nullable().optional(),
  coach: z.string().nullable().optional(),
  bookingStatus: z.string().nullable().optional(),
  idType: z.string().nullable().optional(),
  idNumberMasked: z.string().nullable().optional(),
});

export const BookingRedactedViewSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  itemId: z.string().uuid().nullable(),
  provider: BookingProviderSchema,
  pnrMasked: z.string().nullable(),
  pnrLast3: z.string().nullable(),
  status: BookingStatusSchema,
  summary: BookingSummaryPublicSchema,
  lowConfidenceFields: z.array(z.string()),
  parserConfidence: z.number().min(0).max(1),
  createdAt: z.string(),
});
export type BookingRedactedView = z.infer<typeof BookingRedactedViewSchema>;

export const BookingVaultViewSchema = BookingRedactedViewSchema.extend({
  pnrPlain: z.string().nullable(),
  passengers: z.array(SanitizedPassengerSchema),
  hasEncryptedDocument: z.boolean(),
  docSizeBytes: z.number().int().nonnegative(),
});
export type BookingVaultView = z.infer<typeof BookingVaultViewSchema>;

export const PollOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  subtitle: z.string().optional(),
  voteCount: z.number().int().nonnegative(),
  voterNames: z.array(z.string()),
});
export type PollOption = z.infer<typeof PollOptionSchema>;

export const PollViewSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  question: z.string(),
  options: z.array(PollOptionSchema),
  closesAt: z.string().nullable(),
  totalVotes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type PollView = z.infer<typeof PollViewSchema>;

export const KittyPoolSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  title: z.string(),
  custodianId: z.string().uuid(),
  currency: CurrencyCodeSchema,
  initialContributionMinor: z.number().int().nonnegative(),
  memberContributionsMinor: z.record(z.string(), z.number().int().nonnegative()),
  spentMinor: z.number().int().nonnegative(),
  remainingMinor: z.number().int(),
  status: z.enum(['open', 'settled']),
  createdAt: z.string(),
});
export type KittyPoolView = z.infer<typeof KittyPoolSchema>;

export const SplitModeSchema = z.enum([
  'equal',
  'exact',
  'shares',
  'tag_exclude',
  'fuel_fastag',
]);
export type SplitMode = z.infer<typeof SplitModeSchema>;

export const ExpenseEntryTypeSchema = z.enum(['charge', 'adjustment', 'settlement']);
export type ExpenseEntryType = z.infer<typeof ExpenseEntryTypeSchema>;

export const ExpenseViewSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  clientOpId: z.string().uuid(),
  entryType: ExpenseEntryTypeSchema,
  reversesExpenseId: z.string().uuid().nullable(),
  title: z.string(),
  category: z.string(),
  paidBy: z.string().uuid(),
  kittyPoolId: z.string().uuid().nullable(),
  amountMinor: z.number().int(),
  currency: CurrencyCodeSchema,
  inrEquivalentMinor: z.number().int(),
  fxRate: z.number(),
  splitMode: SplitModeSchema,
  excludedTags: z.array(z.string()),
  splitsInrMinor: z.record(z.string(), z.number().int()),
  upiTxnRef: z.string().nullable(),
  createdAt: z.string(),
});
export type ExpenseView = z.infer<typeof ExpenseViewSchema>;

export const UpiSettlementInstructionSchema = z.object({
  fromUserId: z.string().uuid(),
  fromName: z.string(),
  toUserId: z.string().uuid(),
  toName: z.string(),
  payeeVpa: z.string().nullable(),
  amountInrMinor: z.number().int().positive(),
  amountInrFormatted: z.string(),
  paymentMode: z.enum(['UPI_DEEP_LINK', 'COPY_VPA_FALLBACK']),
  upiUri: z.string().nullable(),
  qrPayload: z.string().nullable(),
  copyText: z.string(),
  thresholdNote: z.string(),
});
export type UpiSettlementInstruction = z.infer<typeof UpiSettlementInstructionSchema>;

export const TripMetaSchema = z.object({
  id: z.string().uuid(),
  shortId: z.string(),
  title: z.string(),
  destinationSummary: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  homeCurrency: CurrencyCodeSchema,
  isPublicTemplate: z.boolean(),
  isSample: z.boolean(),
  elderModeEnabled: z.boolean(),
  vaultBytesUsed: z.number().int().nonnegative(),
  vaultQuotaBytes: z.number().int().positive(),
  latestSeq: z.number().int().nonnegative(),
  mapAttribution: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TripMeta = z.infer<typeof TripMetaSchema>;

export const OutboundChecklistItemSchema = z.object({
  id: z.string(),
  corridor: z.string(),
  title: z.string(),
  detail: z.string(),
  category: z.enum(['visa', 'passport', 'forex', 'esim', 'insurance', 'health']),
});
export type OutboundChecklistItem = z.infer<typeof OutboundChecklistItemSchema>;

export const TripWorkspaceResponseSchema = z.object({
  trip: TripMetaSchema,
  members: z.array(TripMemberPublicSchema),
  days: z.array(TripDaySchema),
  items: z.array(ItineraryItemSchema),
  shortlist: z.array(ItineraryItemSchema),
  bookings: z.array(BookingVaultViewSchema),
  polls: z.array(PollViewSchema),
  kittyPools: z.array(KittyPoolSchema),
  expenses: z.array(ExpenseViewSchema),
  outboundChecklist: z.array(OutboundChecklistItemSchema),
});
export type TripWorkspaceResponse = z.infer<typeof TripWorkspaceResponseSchema>;

export const GuestShareResponseSchema = z.object({
  redactPii: z.literal(true),
  trip: TripMetaSchema.omit({ vaultBytesUsed: true, vaultQuotaBytes: true }),
  plannerName: z.string(),
  days: z.array(TripDaySchema),
  items: z.array(ItineraryItemSchema),
  shortlist: z.array(ItineraryItemSchema),
  bookings: z.array(BookingRedactedViewSchema),
  polls: z.array(PollViewSchema),
  whatsappDigestText: z.string(),
});
export type GuestShareResponse = z.infer<typeof GuestShareResponseSchema>;

export const SyncClientMutationSchema = z.object({
  clientOpId: z.string().min(4),
  hlcTimestamp: z.string().min(1),
  baseSeq: z.number().int().nonnegative().default(0),
  entityType: z.enum(['trip_day', 'itinerary_item']),
  entityId: z.string().uuid(),
  action: z.enum(['upsert', 'delete']),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type SyncClientMutation = z.infer<typeof SyncClientMutationSchema>;

export const SyncServerDeltaSchema = z.object({
  serverSeq: z.number().int().positive(),
  clientOpId: z.string(),
  hlcTimestamp: z.string(),
  entityType: z.enum(['trip_day', 'itinerary_item']),
  entityId: z.string().uuid(),
  action: z.enum(['upsert', 'delete']),
  orphanedToShortlist: z.boolean().default(false),
  payload: z.record(z.string(), z.unknown()),
});
export type SyncServerDelta = z.infer<typeof SyncServerDeltaSchema>;
