export type CurrencyCode = 'INR' | 'THB' | 'VND' | 'AED' | 'JPY' | 'EUR' | 'USD';
export type MemberRole = 'owner' | 'editor' | 'contributor' | 'viewer';
export type PacingLevel = 'relaxed' | 'moderate' | 'packed';
export type ItemKind = 'stay' | 'transit' | 'activity' | 'meal' | 'note';
export type SplitMode = 'equal' | 'exact' | 'shares' | 'tag_exclude' | 'fuel_fastag';

export interface TripMember {
  userId: string;
  displayName: string;
  role: MemberRole;
  vaultAccess: boolean;
  dietaryTags: string[];
  upiVpa?: string | null;
  hasUpiVpa?: boolean;
  joinedAt: string;
}

export interface TripDay {
  id: string;
  tripId: string;
  dayNumber: number;
  date: string | null;
  themeTitle: string;
  pacingLevel: PacingLevel;
  serverSeq: number;
  hlcTimestamp: string;
  deletedAt: string | null;
}

export interface TransitMeta {
  mode?: 'rail' | 'flight' | 'bus' | 'metro_cab' | 'highway_cab' | 'hill_cab' | 'ferry' | 'walk';
  vehicleCode?: string;
  carrierName?: string;
  originCode?: string;
  originName?: string;
  destinationCode?: string;
  destinationName?: string;
  departureTime?: string;
  arrivalTime?: string;
  arrivalDayOffset?: number;
  coachOrTerminal?: string;
  seatOrBerth?: string;
  boardingLandmark?: string;
  distanceKm?: number;
  estimatedDurationMins?: number;
  isIntercityLeg?: boolean;
  legDirection?: 'outbound' | 'intercity' | 'return';
  approxFareInr?: number;
  advisory?: string;
  googleMapsUrl?: string;
}

export interface ItineraryItem {
  id: string;
  tripId: string;
  dayId: string | null;
  kind: ItemKind;
  title: string;
  notes: string;
  lat: number | null;
  lng: number | null;
  placeRefId: string | null;
  addressLocalScript: string | null;
  sortKey: string;
  startTime: string | null;
  durationMins: number | null;
  transitMeta: TransitMeta;
  dietaryFlags: string[];
  accessibilityNotes: string;
  elderSummaryI18n: { en?: string; hi?: string };
  isShortlist: boolean;
  serverSeq: number;
  hlcTimestamp: string;
  deletedAt: string | null;
  googleMapsUrl: string | null;
}

export interface BookingPassenger {
  name: string;
  age?: number | null;
  gender?: string | null;
  seatOrBerth?: string | null;
  coach?: string | null;
  bookingStatus?: string | null;
  idType?: string | null;
  idNumberMasked?: string | null;
}

export interface BookingView {
  id: string;
  tripId: string;
  itemId: string | null;
  provider: string;
  pnrMasked: string | null;
  pnrLast3: string | null;
  pnrPlain?: string | null;
  passengers?: BookingPassenger[];
  hasEncryptedDocument?: boolean;
  docSizeBytes?: number;
  status: 'confirmed' | 'rac' | 'wl' | 'cancelled' | 'pending';
  summary: {
    headline: string;
    routeLabel?: string;
    vehicleNumber?: string;
    vehicleName?: string;
    operatorName?: string;
    coach?: string;
    seatOrBerth?: string;
    terminalOrPlatform?: string;
    boardingPoint?: string;
    propertyName?: string;
  };
  lowConfidenceFields: string[];
  parserConfidence: number;
  createdAt: string;
}

export interface PollOption {
  id: string;
  label: string;
  subtitle?: string;
  voteCount: number;
  voterNames: string[];
}

export interface PollView {
  id: string;
  tripId: string;
  question: string;
  options: PollOption[];
  closesAt: string | null;
  totalVotes: number;
  createdAt: string;
}

export interface KittyPoolView {
  id: string;
  tripId: string;
  title: string;
  custodianId: string;
  currency: CurrencyCode;
  initialContributionMinor: number;
  memberContributionsMinor: Record<string, number>;
  spentMinor: number;
  remainingMinor: number;
  status: 'open' | 'settled';
  createdAt: string;
}

export interface ExpenseView {
  id: string;
  tripId: string;
  clientOpId: string;
  entryType: 'charge' | 'adjustment' | 'settlement';
  reversesExpenseId: string | null;
  title: string;
  category: string;
  paidBy: string;
  kittyPoolId: string | null;
  amountMinor: number;
  currency: CurrencyCode;
  inrEquivalentMinor: number;
  fxRate: number;
  splitMode: SplitMode;
  excludedTags: string[];
  splitsInrMinor: Record<string, number>;
  upiTxnRef: string | null;
  createdAt: string;
}

export interface UpiSettlementInstruction {
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  payeeVpa: string | null;
  amountInrMinor: number;
  amountInrFormatted: string;
  paymentMode: 'UPI_DEEP_LINK' | 'COPY_VPA_FALLBACK';
  upiUri: string | null;
  qrPayload: string | null;
  copyText: string;
  thresholdNote: string;
}

export interface OutboundChecklistItem {
  id: string;
  corridor: string;
  title: string;
  detail: string;
  category: 'visa' | 'passport' | 'forex' | 'esim' | 'insurance' | 'health';
}

export interface TripMeta {
  id: string;
  shortId: string;
  title: string;
  destinationSummary: string;
  startDate: string | null;
  endDate: string | null;
  homeCurrency: CurrencyCode;
  isPublicTemplate: boolean;
  isSample: boolean;
  elderModeEnabled: boolean;
  vaultBytesUsed?: number;
  vaultQuotaBytes?: number;
  latestSeq: number;
  mapAttribution: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripWorkspace {
  trip: TripMeta;
  members: TripMember[];
  days: TripDay[];
  items: ItineraryItem[];
  shortlist: ItineraryItem[];
  bookings: BookingView[];
  polls: PollView[];
  kittyPools: KittyPoolView[];
  expenses: ExpenseView[];
  outboundChecklist: OutboundChecklistItem[];
}

export interface GuestShareProjection {
  redactPii: true;
  trip: Omit<TripMeta, 'vaultBytesUsed' | 'vaultQuotaBytes'>;
  plannerName: string;
  days: TripDay[];
  items: ItineraryItem[];
  shortlist: ItineraryItem[];
  bookings: BookingView[];
  polls: PollView[];
  whatsappDigestText: string;
}

export interface OpenPoiResult {
  placeRefId: string;
  name: string;
  nameHi?: string;
  city: string;
  region: string;
  countryCode: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  addressLocalScript?: string;
  dietaryHints: string[];
  accessibilityNotes: string;
  terrainZone: 'metro' | 'highway' | 'hill' | 'coastal';
  googleMapsUrl: string;
}
