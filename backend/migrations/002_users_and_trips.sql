-- 002_users_and_trips.sql
-- Core identity (with AWS KMS ap-south-1 envelope-encrypted PII columns), trips, memberships, and redacted share tokens

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NULL,
  google_sub_hash TEXT NULL,
  phone_enc BYTEA NULL,
  email_enc BYTEA NULL,
  display_name TEXT NOT NULL,
  preferred_lang VARCHAR(10) NOT NULL DEFAULT 'en',
  upi_vpa_enc BYTEA NULL,
  tier VARCHAR(16) NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'trip_pass', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_hash_unique
  ON users (phone_hash)
  WHERE phone_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_hash_unique
  ON users (google_sub_hash)
  WHERE google_sub_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id VARCHAR(12) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  destination_summary TEXT NOT NULL DEFAULT '',
  start_date DATE NULL,
  end_date DATE NULL,
  home_currency CHAR(3) NOT NULL DEFAULT 'INR',
  is_public_template BOOLEAN NOT NULL DEFAULT FALSE,
  is_sample BOOLEAN NOT NULL DEFAULT FALSE,
  elder_mode_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  vault_bytes_used BIGINT NOT NULL DEFAULT 0,
  latest_seq BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_public_template
  ON trips (created_at DESC)
  WHERE is_public_template = TRUE;

CREATE TABLE IF NOT EXISTS trip_members (
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'editor', 'contributor', 'viewer')),
  vault_access BOOLEAN NOT NULL DEFAULT FALSE,
  dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_user_id
  ON trip_members (user_id);

CREATE TABLE IF NOT EXISTS share_tokens (
  token VARCHAR(24) PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  scope VARCHAR(24) NOT NULL CHECK (scope IN ('public_viewer', 'elder_card', 'poll_voter', 'invite_editor')),
  redact_pii BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_trip_id
  ON share_tokens (trip_id);
