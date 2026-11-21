-- 006_destinations_places.sql
-- Open-data destination hierarchy (countries -> states/regions -> cities/areas) and the ranked place catalogue
-- that "Destination Packs" fill (Wikivoyage + Wikipedia/Wikidata + OpenStreetMap + Wikimedia Commons).
-- `location` is a GENERATED column derived from lat/lng so application code never has to emit PostGIS expressions on write.

CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('country', 'state', 'region', 'city', 'area')),
  parent_id UUID NULL REFERENCES destinations(id) ON DELETE SET NULL,
  country_code CHAR(2) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
  bbox GEOMETRY(Polygon, 4326) NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  wikidata_id TEXT NULL,
  wikipedia_title TEXT NULL,
  wikivoyage_title TEXT NULL,
  summary TEXT NULL,
  best_months SMALLINT[] NOT NULL DEFAULT '{}',
  hero_image JSONB NULL,
  pack_status TEXT NOT NULL DEFAULT 'none' CHECK (pack_status IN ('none', 'building', 'ready', 'stale')),
  pack_built_at TIMESTAMPTZ NULL,
  pack_started_at TIMESTAMPTZ NULL,
  pack_attempted_at TIMESTAMPTZ NULL,
  pack_error TEXT NULL,
  pack_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_destinations_location_gist ON destinations USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_destinations_parent ON destinations (parent_id);
CREATE INDEX IF NOT EXISTS idx_destinations_country_kind ON destinations (country_code, kind);

CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id TEXT NOT NULL,
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_local JSONB NOT NULL DEFAULT '{}'::jsonb,
  category TEXT NOT NULL CHECK (category IN ('sights', 'culture', 'nature', 'food', 'cafe', 'nightlife', 'stay', 'activity', 'spiritual', 'transport')),
  subtype TEXT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
  address TEXT NULL,
  website TEXT NULL,
  opening_hours TEXT NULL,
  description TEXT NULL,
  why_visit TEXT NULL,
  typical_duration_mins INT NULL,
  best_time TEXT NULL,
  dietary_hints TEXT[] NOT NULL DEFAULT '{}',
  image JSONB NULL,
  popularity REAL NOT NULL DEFAULT 0,
  rank_score REAL NOT NULL DEFAULT 0,
  wikidata_id TEXT NULL,
  wikipedia_title TEXT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A real-world place can legitimately appear in two overlapping destinations, so ref_id is unique per destination.
CREATE UNIQUE INDEX IF NOT EXISTS idx_places_destination_ref ON places (destination_id, ref_id);
CREATE INDEX IF NOT EXISTS idx_places_location_gist ON places USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_places_rank ON places (destination_id, category, rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_places_popularity ON places (destination_id, category, popularity DESC);
CREATE INDEX IF NOT EXISTS idx_places_name_fts ON places USING GIN (to_tsvector('simple', name));
