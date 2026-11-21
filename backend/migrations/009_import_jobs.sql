-- 009_import_jobs.sql
-- Smart Import pipeline job state, append-only SSE event history, encrypted booking candidates, and daily quotas.

CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  client_ip_hash TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'understanding', 'needs_review', 'building', 'done', 'failed')),
  mode TEXT NOT NULL CHECK (mode IN ('ai', 'basic')),
  locale VARCHAR(8) NOT NULL DEFAULT 'en',
  base_trip_slug TEXT NULL,
  intent JSONB NULL,
  booking_candidates_enc BYTEA NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  trip_id UUID NULL REFERENCES trips(id) ON DELETE SET NULL,
  short_id VARCHAR(24) NULL,
  error JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_owner
  ON import_jobs (owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS import_quotas (
  bucket_key TEXT PRIMARY KEY,
  used INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_import_quotas_reset
  ON import_quotas (reset_at);
