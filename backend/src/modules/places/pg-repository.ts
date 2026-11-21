import type { Pool } from 'pg';
import type {
  DestinationProfilePatch,
  PackFinishInput,
  PlacesRepository,
} from './repository.js';
import type {
  DestinationFilter,
  DestinationKind,
  DestinationRecord,
  DestinationSeed,
  ImageInfo,
  PackStats,
  PackStatus,
  PlaceCategory,
  PlaceInput,
  PlaceQuery,
  PlaceQueryResult,
  PlaceRecord,
  PlaceSource,
} from './types.js';

interface DestinationRow {
  id: string;
  slug: string;
  name: string;
  kind: DestinationKind;
  parent_id: string | null;
  country_code: string;
  lat: number;
  lng: number;
  aliases: string[];
  wikidata_id: string | null;
  wikipedia_title: string | null;
  wikivoyage_title: string | null;
  summary: string | null;
  best_months: number[];
  hero_image: ImageInfo | null;
  pack_status: PackStatus;
  pack_built_at: Date | null;
  pack_started_at: Date | null;
  pack_attempted_at: Date | null;
  pack_error: string | null;
  pack_stats: PackStats | null;
}

interface PlaceRow {
  id: string;
  ref_id: string;
  destination_id: string;
  name: string;
  name_local: Record<string, string>;
  category: PlaceCategory;
  subtype: string | null;
  lat: number;
  lng: number;
  address: string | null;
  website: string | null;
  opening_hours: string | null;
  description: string | null;
  why_visit: string | null;
  typical_duration_mins: number | null;
  best_time: string | null;
  dietary_hints: string[];
  image: ImageInfo | null;
  popularity: number;
  rank_score: number;
  wikidata_id: string | null;
  wikipedia_title: string | null;
  sources: PlaceSource[];
  fetched_at: Date;
  distance_m?: number | null;
}

const DEST_COLUMNS = `id, slug, name, kind, parent_id, country_code, lat, lng, aliases, wikidata_id,
  wikipedia_title, wikivoyage_title, summary, best_months, hero_image, pack_status, pack_built_at,
  pack_started_at, pack_attempted_at, pack_error, pack_stats`;

const PLACE_COLUMNS = `id, ref_id, destination_id, name, name_local, category, subtype, lat, lng, address,
  website, opening_hours, description, why_visit, typical_duration_mins, best_time, dietary_hints, image,
  popularity, rank_score, wikidata_id, wikipedia_title, sources, fetched_at`;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function mapDestination(r: DestinationRow): DestinationRecord {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    kind: r.kind,
    parentId: r.parent_id,
    countryCode: r.country_code,
    lat: r.lat,
    lng: r.lng,
    aliases: r.aliases ?? [],
    wikidataId: r.wikidata_id,
    wikipediaTitle: r.wikipedia_title,
    wikivoyageTitle: r.wikivoyage_title,
    summary: r.summary,
    bestMonths: (r.best_months ?? []).map(Number),
    heroImage: r.hero_image,
    packStatus: r.pack_status,
    packBuiltAt: iso(r.pack_built_at),
    packStartedAt: iso(r.pack_started_at),
    packAttemptedAt: iso(r.pack_attempted_at),
    packError: r.pack_error,
    packStats: r.pack_stats ?? {},
  };
}

function mapPlace(r: PlaceRow): PlaceRecord {
  return {
    id: r.id,
    refId: r.ref_id,
    destinationId: r.destination_id,
    name: r.name,
    nameLocal: r.name_local ?? {},
    category: r.category,
    subtype: r.subtype,
    lat: r.lat,
    lng: r.lng,
    address: r.address,
    website: r.website,
    openingHours: r.opening_hours,
    description: r.description,
    whyVisit: r.why_visit,
    typicalDurationMins: r.typical_duration_mins,
    bestTime: r.best_time,
    dietaryHints: r.dietary_hints ?? [],
    image: r.image,
    popularity: r.popularity,
    rankScore: r.rank_score,
    wikidataId: r.wikidata_id,
    wikipediaTitle: r.wikipedia_title,
    sources: r.sources ?? [],
    fetchedAt: r.fetched_at.toISOString(),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Postgres + PostGIS implementation. `location` columns are generated from lat/lng (migration 006). */
export class PgPlacesRepository implements PlacesRepository {
  readonly kind = 'postgres' as const;

  /** The pool is owned by the caller (shared with the geo cache); `close()` does not end it. */
  constructor(private readonly pool: Pool) {}

  async upsertDestinations(seeds: readonly DestinationSeed[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const s of seeds) {
        await client.query(
          `INSERT INTO destinations
             (slug, name, kind, country_code, lat, lng, aliases, wikipedia_title, wikivoyage_title, wikidata_id, best_months)
           VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11::smallint[])
           ON CONFLICT (slug) DO UPDATE SET
             name = EXCLUDED.name,
             kind = EXCLUDED.kind,
             country_code = EXCLUDED.country_code,
             lat = EXCLUDED.lat,
             lng = EXCLUDED.lng,
             aliases = EXCLUDED.aliases,
             wikipedia_title = COALESCE(EXCLUDED.wikipedia_title, destinations.wikipedia_title),
             wikivoyage_title = COALESCE(EXCLUDED.wikivoyage_title, destinations.wikivoyage_title),
             wikidata_id = COALESCE(EXCLUDED.wikidata_id, destinations.wikidata_id),
             best_months = EXCLUDED.best_months,
             updated_at = NOW()`,
          [
            s.slug,
            s.name,
            s.kind,
            s.countryCode.toUpperCase(),
            s.lat,
            s.lng,
            s.aliases ?? [],
            s.wikipediaTitle ?? null,
            s.wikivoyageTitle ?? null,
            s.wikidataId ?? null,
            s.bestMonths ?? [],
          ]
        );
      }
      for (const s of seeds) {
        await client.query(
          `UPDATE destinations d SET parent_id = p.id
             FROM destinations p
            WHERE d.slug = $1 AND p.slug = $2 AND d.parent_id IS DISTINCT FROM p.id`,
          [s.slug, s.parentSlug ?? null]
        );
        if (!s.parentSlug) {
          await client.query(
            'UPDATE destinations SET parent_id = NULL WHERE slug = $1 AND parent_id IS NOT NULL',
            [s.slug]
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listDestinations(filter: DestinationFilter = {}): Promise<DestinationRecord[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.kind) {
      params.push(filter.kind);
      where.push(`d.kind = $${params.length}`);
    }
    if (filter.countryCode) {
      params.push(filter.countryCode.toUpperCase());
      where.push(`d.country_code = $${params.length}`);
    }
    if (filter.parentSlug === null) where.push('d.parent_id IS NULL');
    if (typeof filter.parentSlug === 'string') {
      params.push(filter.parentSlug);
      where.push(`d.parent_id = (SELECT id FROM destinations WHERE slug = $${params.length})`);
    }
    if (filter.q?.trim()) {
      params.push(`%${escapeLike(filter.q.trim())}%`);
      const i = params.length;
      where.push(
        `(d.name ILIKE $${i} OR d.slug ILIKE $${i} OR EXISTS (SELECT 1 FROM unnest(d.aliases) a WHERE a ILIKE $${i}))`
      );
    }
    const res = await this.pool.query<DestinationRow>(
      `SELECT ${DEST_COLUMNS} FROM destinations d ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.name ASC`,
      params
    );
    return res.rows.map(mapDestination);
  }

  async getDestinationBySlug(slug: string): Promise<DestinationRecord | null> {
    const res = await this.pool.query<DestinationRow>(
      `SELECT ${DEST_COLUMNS} FROM destinations WHERE slug = $1`,
      [slug]
    );
    return res.rows[0] ? mapDestination(res.rows[0]) : null;
  }

  async getDestinationById(id: string): Promise<DestinationRecord | null> {
    const res = await this.pool.query<DestinationRow>(
      `SELECT ${DEST_COLUMNS} FROM destinations WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? mapDestination(res.rows[0]) : null;
  }

  async listChildren(parentId: string): Promise<DestinationRecord[]> {
    const res = await this.pool.query<DestinationRow>(
      `SELECT ${DEST_COLUMNS} FROM destinations WHERE parent_id = $1 ORDER BY name ASC`,
      [parentId]
    );
    return res.rows.map(mapDestination);
  }

  async updateDestinationProfile(id: string, patch: DestinationProfilePatch): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    const push = (col: string, value: unknown, cast = '') => {
      params.push(value);
      sets.push(`${col} = $${params.length}${cast}`);
    };
    if (patch.summary !== undefined) push('summary', patch.summary);
    if (patch.heroImage !== undefined)
      push('hero_image', patch.heroImage === null ? null : JSON.stringify(patch.heroImage), '::jsonb');
    if (patch.wikidataId !== undefined) push('wikidata_id', patch.wikidataId);
    if (patch.wikipediaTitle !== undefined) push('wikipedia_title', patch.wikipediaTitle);
    if (sets.length === 0) return;
    await this.pool.query(
      `UPDATE destinations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
      params
    );
  }

  async tryBeginPackBuild(
    id: string,
    options: { force: boolean; lockTimeoutMs: number }
  ): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE destinations
          SET pack_status = 'building', pack_started_at = NOW(), pack_attempted_at = NOW(),
              pack_error = NULL, updated_at = NOW()
        WHERE id = $1
          AND (
            pack_status IN ('none', 'stale')
            OR ($2::boolean AND pack_status = 'ready')
            OR (pack_status = 'building'
                AND pack_started_at < NOW() - ($3::bigint * INTERVAL '1 millisecond'))
          )
        RETURNING id`,
      [id, options.force, Math.round(options.lockTimeoutMs)]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async finishPackBuild(id: string, input: PackFinishInput): Promise<void> {
    await this.pool.query(
      `UPDATE destinations
          SET pack_status = $2,
              pack_started_at = NULL,
              pack_error = $3,
              pack_built_at = COALESCE($4::timestamptz, pack_built_at),
              pack_stats = COALESCE($5::jsonb, pack_stats),
              updated_at = NOW()
        WHERE id = $1`,
      [
        id,
        input.status,
        input.error ?? null,
        input.builtAt ?? null,
        input.stats ? JSON.stringify(input.stats) : null,
      ]
    );
  }

  async upsertPlaces(
    destinationId: string,
    places: readonly PlaceInput[],
    options: { pruneMissing?: boolean; removeRefIds?: readonly string[] } = {}
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const CHUNK = 100;
      for (let i = 0; i < places.length; i += CHUNK) {
        const slice = places.slice(i, i + CHUNK);
        const params: unknown[] = [];
        const tuples = slice.map((p) => {
          const base = params.length;
          params.push(
            p.refId,
            destinationId,
            p.name,
            JSON.stringify(p.nameLocal ?? {}),
            p.category,
            p.subtype,
            p.lat,
            p.lng,
            p.address,
            p.website,
            p.openingHours,
            p.description,
            p.whyVisit,
            p.typicalDurationMins,
            p.bestTime,
            p.dietaryHints,
            p.image ? JSON.stringify(p.image) : null,
            p.popularity,
            p.rankScore,
            p.wikidataId,
            p.wikipediaTitle,
            JSON.stringify(p.sources),
            p.fetchedAt ?? new Date().toISOString()
          );
          const n = (k: number) => `$${base + k}`;
          return `(${n(1)}, ${n(2)}::uuid, ${n(3)}, ${n(4)}::jsonb, ${n(5)}, ${n(6)}, ${n(7)}, ${n(8)}, ${n(9)}, ${n(10)}, ${n(11)}, ${n(12)}, ${n(13)}, ${n(14)}::int, ${n(15)}, ${n(16)}::text[], ${n(17)}::jsonb, ${n(18)}::real, ${n(19)}::real, ${n(20)}, ${n(21)}, ${n(22)}::jsonb, ${n(23)}::timestamptz)`;
        });
        await client.query(
          `INSERT INTO places
             (ref_id, destination_id, name, name_local, category, subtype, lat, lng, address, website,
              opening_hours, description, why_visit, typical_duration_mins, best_time, dietary_hints, image,
              popularity, rank_score, wikidata_id, wikipedia_title, sources, fetched_at)
           VALUES ${tuples.join(', ')}
           ON CONFLICT (destination_id, ref_id) DO UPDATE SET
             name = EXCLUDED.name,
             name_local = EXCLUDED.name_local,
             category = EXCLUDED.category,
             subtype = EXCLUDED.subtype,
             lat = EXCLUDED.lat,
             lng = EXCLUDED.lng,
             address = EXCLUDED.address,
             website = EXCLUDED.website,
             opening_hours = EXCLUDED.opening_hours,
             description = EXCLUDED.description,
             why_visit = COALESCE(EXCLUDED.why_visit, places.why_visit),
             typical_duration_mins = COALESCE(EXCLUDED.typical_duration_mins, places.typical_duration_mins),
             best_time = COALESCE(EXCLUDED.best_time, places.best_time),
             dietary_hints = CASE WHEN cardinality(EXCLUDED.dietary_hints) > 0
                                  THEN EXCLUDED.dietary_hints ELSE places.dietary_hints END,
             image = EXCLUDED.image,
             popularity = EXCLUDED.popularity,
             rank_score = EXCLUDED.rank_score,
             wikidata_id = EXCLUDED.wikidata_id,
             wikipedia_title = EXCLUDED.wikipedia_title,
             sources = EXCLUDED.sources,
             fetched_at = EXCLUDED.fetched_at`,
          params
        );
      }
      if (options.removeRefIds && options.removeRefIds.length > 0) {
        await client.query(
          'DELETE FROM places WHERE destination_id = $1 AND ref_id = ANY($2::text[])',
          [destinationId, options.removeRefIds]
        );
      }
      if (options.pruneMissing) {
        await client.query(
          `DELETE FROM places
            WHERE destination_id = $1
              AND ref_id <> ALL($2::text[])
              AND NOT (sources @> '[{"provider":"curated"}]'::jsonb)`,
          [destinationId, places.map((p) => p.refId)]
        );
      }
      await client.query('COMMIT');
      return places.length;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async queryPlaces(query: PlaceQuery): Promise<PlaceQueryResult> {
    const params: unknown[] = [query.destinationIds];
    const where: string[] = ['destination_id = ANY($1::uuid[])'];
    let distanceExpr = 'NULL::double precision';
    if (query.category) {
      params.push(query.category);
      where.push(`category = $${params.length}`);
    }
    if (query.q?.trim()) {
      params.push(`%${escapeLike(query.q.trim())}%`);
      where.push(`name ILIKE $${params.length}`);
    }
    if (query.bbox) {
      params.push(query.bbox.minLng, query.bbox.minLat, query.bbox.maxLng, query.bbox.maxLat);
      const n = params.length;
      where.push(`lng BETWEEN $${n - 3} AND $${n - 1} AND lat BETWEEN $${n - 2} AND $${n}`);
    }
    if (query.near) {
      params.push(query.near.lng, query.near.lat, query.near.radiusM);
      const n = params.length;
      const point = `ST_SetSRID(ST_MakePoint($${n - 2}::double precision, $${n - 1}::double precision), 4326)::geography`;
      where.push(`ST_DWithin(location, ${point}, $${n}::double precision)`);
      distanceExpr = `ST_Distance(location, ${point})`;
    }
    const whereSql = where.join(' AND ');
    const countRes = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM places WHERE ${whereSql}`,
      params
    );
    params.push(query.limit, query.offset);
    const res = await this.pool.query<PlaceRow>(
      `SELECT ${PLACE_COLUMNS}, ${distanceExpr} AS distance_m
         FROM places
        WHERE ${whereSql}
        ORDER BY rank_score DESC, popularity DESC, name ASC, id ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return {
      total: Number(countRes.rows[0]?.total ?? 0),
      rows: res.rows.map((r) => ({
        place: mapPlace(r),
        distanceM: r.distance_m === null || r.distance_m === undefined ? null : Number(r.distance_m),
      })),
    };
  }

  async countPlacesByCategory(destinationIds: string[]): Promise<Record<string, number>> {
    const res = await this.pool.query<{ category: string; n: string }>(
      `SELECT category, COUNT(*) AS n FROM places WHERE destination_id = ANY($1::uuid[]) GROUP BY category`,
      [destinationIds]
    );
    const out: Record<string, number> = {};
    for (const r of res.rows) out[r.category] = Number(r.n);
    return out;
  }

  async getPlaceByRef(destinationId: string, refId: string): Promise<PlaceRecord | null> {
    const res = await this.pool.query<PlaceRow>(
      `SELECT ${PLACE_COLUMNS} FROM places WHERE destination_id = $1 AND ref_id = $2`,
      [destinationId, refId]
    );
    return res.rows[0] ? mapPlace(res.rows[0]) : null;
  }

  async close(): Promise<void> {
    // pool lifecycle belongs to the creator (see places-module.ts)
  }
}
