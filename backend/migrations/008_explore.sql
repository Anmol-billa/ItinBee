-- 008_explore.sql
-- Explore itinerary publishing columns, hierarchical destination links, and guest/email user auth columns.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hash_unique
  ON users (email_hash)
  WHERE email_hash IS NOT NULL;

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS cover_image JSONB,
  ADD COLUMN IF NOT EXISTS duration_days INT,
  ADD COLUMN IF NOT EXISTS trip_types TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS budget_tier TEXT CHECK (budget_tier IS NULL OR budget_tier IN ('budget', 'mid', 'premium')),
  ADD COLUMN IF NOT EXISTS best_months SMALLINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('template', 'user')),
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clone_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS trip_destinations (
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  PRIMARY KEY (trip_id, destination_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_destinations_dest
  ON trip_destinations (destination_id);

CREATE INDEX IF NOT EXISTS idx_trips_published_at
  ON trips (published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS explore_published_entries (
  slug TEXT PRIMARY KEY,
  trip_id UUID NULL REFERENCES trips(id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('template', 'user')),
  card_payload JSONB NOT NULL,
  days_payload JSONB NOT NULL,
  clone_count INT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_explore_entries_published
  ON explore_published_entries (published_at DESC);
