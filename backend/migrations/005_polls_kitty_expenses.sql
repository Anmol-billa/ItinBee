-- 005_polls_kitty_expenses.sql
-- Zero-OTP Turnstile group polls, upfront trip kitty pools, and immutable append-only UPI expense ledger

CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  closes_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_trip_id
  ON polls (trip_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  voter_id UUID NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_session_hash TEXT NULL,
  guest_display_name TEXT NOT NULL DEFAULT 'Guest',
  option_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_poll_voter_identity CHECK (voter_id IS NOT NULL OR guest_session_hash IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_votes_member_unique
  ON poll_votes (poll_id, voter_id, option_id)
  WHERE voter_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_votes_guest_unique
  ON poll_votes (poll_id, guest_session_hash, option_id)
  WHERE guest_session_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS kitty_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  custodian_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  initial_contribution_minor BIGINT NOT NULL DEFAULT 0,
  member_contributions_minor JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kitty_pools_trip_id
  ON kitty_pools (trip_id);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  client_op_id UUID NOT NULL UNIQUE,
  entry_type VARCHAR(16) NOT NULL CHECK (entry_type IN ('charge', 'adjustment', 'settlement')),
  reverses_expense_id UUID NULL REFERENCES expenses(id) ON DELETE RESTRICT,
  title TEXT NOT NULL DEFAULT '',
  category VARCHAR(24) NOT NULL DEFAULT 'general',
  paid_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kitty_pool_id UUID NULL REFERENCES kitty_pools(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  inr_equivalent_minor BIGINT NOT NULL,
  fx_rate NUMERIC(18, 6) NOT NULL DEFAULT 1.0,
  split_mode VARCHAR(24) NOT NULL CHECK (split_mode IN ('equal', 'exact', 'shares', 'tag_exclude', 'fuel_fastag')),
  excluded_tags TEXT[] NOT NULL DEFAULT '{}',
  splits JSONB NOT NULL,
  upi_txn_ref TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_trip_created
  ON expenses (trip_id, created_at ASC);

CREATE OR REPLACE FUNCTION prevent_expenses_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'expenses table is an immutable append-only ledger; write an adjustment or settlement entry instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expenses_append_only ON expenses;
CREATE TRIGGER trg_expenses_append_only
  BEFORE UPDATE OR DELETE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION prevent_expenses_mutation();
