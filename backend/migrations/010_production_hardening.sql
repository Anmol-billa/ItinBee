-- 010_production_hardening.sql
-- Production hardening: PostgreSQL encrypted vault blob fallback, co-editor trip invites,
-- companion traveller auth_provider support, booking attachment metadata, and seed cleanup.

-- 1. Persistent PostgreSQL fallback for AES-256-GCM envelope-encrypted ticket attachments
--    when Cloudflare R2 / AWS S3 (`AWS_S3_VAULT_BUCKET`) is not yet configured.
CREATE TABLE IF NOT EXISTS vault_blobs (
  s3_key TEXT PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  encrypted_payload BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_blobs_trip_id
  ON vault_blobs (trip_id);

-- 2. Co-editor / viewer invitation tokens with optional email delivery & expiry
CREATE TABLE IF NOT EXISTS trip_invites (
  token TEXT PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'contributor', 'viewer')),
  vault_access BOOLEAN NOT NULL DEFAULT FALSE,
  invitee_email TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_invites_trip_id
  ON trip_invites (trip_id);

-- 3. Allow 'companion' in users.auth_provider (and track companion co-travellers cleanly)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(24) NOT NULL DEFAULT 'guest',
  ADD COLUMN IF NOT EXISTS is_companion BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_provider_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_auth_provider;
ALTER TABLE users ADD CONSTRAINT chk_users_auth_provider
  CHECK (auth_provider IN ('guest', 'email', 'google', 'phone', 'companion'));

-- 4. Store original attachment filename & MIME type on bookings for authenticated vault downloads
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS doc_file_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS doc_mime_type TEXT NULL;

-- 5. Keep expenses immutable against UPDATE, while permitting explicit expense deletion & trip cascade deletes
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_reverses_expense_id_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_reverses_expense_id_fkey
  FOREIGN KEY (reverses_expense_id) REFERENCES expenses(id) ON DELETE CASCADE;

DROP TRIGGER IF EXISTS trg_expenses_append_only ON expenses;
CREATE TRIGGER trg_expenses_append_only
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_expenses_mutation();

-- 6. Clean up pre-seeded Rishikesh-Landour Day 1 transit duration so it doesn't trigger a 6h57m pacing warning
UPDATE itinerary_items
SET duration_mins = 45
WHERE id = '44444444-4444-4444-8444-444444444101' AND duration_mins = 265;
