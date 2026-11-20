-- 003_days_and_items.sql
-- Tombstone-aware trip days, fractional-indexed PostGIS itinerary items, and idempotent HLC sync operations log

CREATE TABLE IF NOT EXISTS trip_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_number INT NOT NULL,
  date DATE NULL,
  theme_title TEXT NOT NULL DEFAULT '',
  pacing_level VARCHAR(16) NOT NULL DEFAULT 'moderate' CHECK (pacing_level IN ('relaxed', 'moderate', 'packed')),
  server_seq BIGINT NOT NULL DEFAULT 0,
  hlc_timestamp TEXT NOT NULL DEFAULT '',
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_days_active_order
  ON trip_days (trip_id, day_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS itinerary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_id UUID NULL REFERENCES trip_days(id) ON DELETE SET NULL,
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('stay', 'transit', 'activity', 'meal', 'note')),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  location GEOGRAPHY(Point, 4326) NULL,
  lat DOUBLE PRECISION NULL,
  lng DOUBLE PRECISION NULL,
  place_ref_id TEXT NULL,
  address_local_script TEXT NULL,
  sort_key TEXT NOT NULL,
  start_time VARCHAR(8) NULL,
  duration_mins INT NULL,
  transit_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  dietary_flags TEXT[] NOT NULL DEFAULT '{}',
  accessibility_notes TEXT NOT NULL DEFAULT '',
  elder_summary_i18n JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shortlist BOOLEAN NOT NULL DEFAULT FALSE,
  server_seq BIGINT NOT NULL DEFAULT 0,
  hlc_timestamp TEXT NOT NULL DEFAULT '',
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_location_gist
  ON itinerary_items USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_itinerary_items_deterministic_order
  ON itinerary_items (trip_id, day_id, sort_key, id);

CREATE TABLE IF NOT EXISTS sync_operations (
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  client_op_id TEXT NOT NULL,
  server_seq BIGINT NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  entity_type VARCHAR(24) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(16) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_id, client_op_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_operations_trip_seq
  ON sync_operations (trip_id, server_seq ASC);
