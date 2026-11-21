export const PLACE_CATEGORIES = [
  'sights',
  'culture',
  'nature',
  'food',
  'cafe',
  'nightlife',
  'stay',
  'activity',
  'spiritual',
  'transport',
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const DESTINATION_KINDS = [
  'country',
  'state',
  'region',
  'city',
  'area',
] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];

export const PACK_STATUSES = ['none', 'building', 'ready', 'stale'] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ImageInfo {
  url: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUrl: string | null;
}

export type SourceProvider =
  | 'wikivoyage'
  | 'wikipedia'
  | 'wikidata'
  | 'osm'
  | 'commons'
  | 'curated';

/** Per-field provenance + licence, stored on every place (plan §6.3 "Licensing"). */
export interface PlaceSource {
  provider: SourceProvider;
  fields: string[];
  license: string;
  url: string | null;
  ref: string | null;
  retrievedAt: string;
}

export interface PackStats {
  total?: number;
  perCategory?: Record<string, number>;
  withImage?: number;
  withDescription?: number;
  droppedNoCoords?: number;
  droppedJunk?: number;
  mergedDuplicates?: number;
  durationMs?: number;
  providers?: Record<string, number | string>;
  warnings?: string[];
}

export interface DestinationRecord {
  id: string;
  slug: string;
  name: string;
  kind: DestinationKind;
  parentId: string | null;
  countryCode: string;
  lat: number;
  lng: number;
  aliases: string[];
  wikidataId: string | null;
  wikipediaTitle: string | null;
  wikivoyageTitle: string | null;
  summary: string | null;
  bestMonths: number[];
  heroImage: ImageInfo | null;
  packStatus: PackStatus;
  packBuiltAt: string | null;
  packStartedAt: string | null;
  packAttemptedAt: string | null;
  packError: string | null;
  packStats: PackStats;
}

export interface DestinationSeed {
  slug: string;
  name: string;
  kind: DestinationKind;
  parentSlug?: string | null;
  countryCode: string;
  lat: number;
  lng: number;
  wikipediaTitle?: string;
  wikivoyageTitle?: string;
  wikidataId?: string;
  aliases?: string[];
  bestMonths?: number[];
}

export interface PlaceRecord {
  id: string;
  refId: string;
  destinationId: string;
  name: string;
  nameLocal: Record<string, string>;
  category: PlaceCategory;
  subtype: string | null;
  lat: number;
  lng: number;
  address: string | null;
  website: string | null;
  openingHours: string | null;
  description: string | null;
  whyVisit: string | null;
  typicalDurationMins: number | null;
  bestTime: string | null;
  dietaryHints: string[];
  image: ImageInfo | null;
  popularity: number;
  rankScore: number;
  wikidataId: string | null;
  wikipediaTitle: string | null;
  sources: PlaceSource[];
  fetchedAt: string;
}

/** A place before it is persisted (no id yet; destination assigned by the pack builder). */
export type PlaceInput = Omit<PlaceRecord, 'id' | 'fetchedAt'> & {
  fetchedAt?: string;
};

export interface PlaceQuery {
  destinationIds: string[];
  category?: PlaceCategory;
  q?: string;
  near?: { lat: number; lng: number; radiusM: number };
  bbox?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  limit: number;
  offset: number;
}

export interface PlaceQueryRow {
  place: PlaceRecord;
  distanceM: number | null;
}

export interface PlaceQueryResult {
  rows: PlaceQueryRow[];
  total: number;
}

export interface DestinationFilter {
  kind?: DestinationKind;
  countryCode?: string;
  q?: string;
  parentSlug?: string | null;
}
