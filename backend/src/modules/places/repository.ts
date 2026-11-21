import type {
  DestinationFilter,
  DestinationRecord,
  DestinationSeed,
  ImageInfo,
  PackStats,
  PackStatus,
  PlaceInput,
  PlaceQuery,
  PlaceQueryResult,
  PlaceRecord,
} from './types.js';

export interface DestinationProfilePatch {
  summary?: string | null;
  heroImage?: ImageInfo | null;
  wikidataId?: string | null;
  wikipediaTitle?: string | null;
}

export interface PackFinishInput {
  status: Extract<PackStatus, 'ready' | 'stale' | 'none'>;
  builtAt?: string | null;
  error?: string | null;
  stats?: PackStats;
}

/**
 * Storage contract for the places engine. Two implementations:
 * Postgres/PostGIS (`PgPlacesRepository`) and an in-memory one with optional JSON persistence
 * (`InMemoryPlacesRepository`) used when `DATABASE_URL` is unset.
 */
export interface PlacesRepository {
  readonly kind: 'postgres' | 'memory';

  /** Idempotent upsert by slug; parents are resolved by `parentSlug`. Never clobbers pack data/summary/hero. */
  upsertDestinations(seeds: readonly DestinationSeed[]): Promise<void>;
  listDestinations(filter?: DestinationFilter): Promise<DestinationRecord[]>;
  getDestinationBySlug(slug: string): Promise<DestinationRecord | null>;
  getDestinationById(id: string): Promise<DestinationRecord | null>;
  /** Direct children of a destination. */
  listChildren(parentId: string): Promise<DestinationRecord[]>;
  updateDestinationProfile(id: string, patch: DestinationProfilePatch): Promise<void>;

  /**
   * Atomically moves the destination to `building` unless it is already building (and not stale-locked)
   * or is `ready` and fresh (when `force` is false). Returns true when this caller owns the build.
   */
  tryBeginPackBuild(
    id: string,
    options: { force: boolean; lockTimeoutMs: number; now?: Date }
  ): Promise<boolean>;
  finishPackBuild(id: string, input: PackFinishInput): Promise<void>;

  /**
   * Upserts places for a destination keyed by `ref_id`, preserving AI-enriched fields when the new value is null.
   * With `pruneMissing`, previously generated places absent from the new set are deleted (curated rows are kept).
   */
  upsertPlaces(
    destinationId: string,
    places: readonly PlaceInput[],
    options?: { pruneMissing?: boolean; removeRefIds?: readonly string[] }
  ): Promise<number>;
  queryPlaces(query: PlaceQuery): Promise<PlaceQueryResult>;
  countPlacesByCategory(destinationIds: string[]): Promise<Record<string, number>>;
  getPlaceByRef(destinationId: string, refId: string): Promise<PlaceRecord | null>;

  close(): Promise<void>;
}
