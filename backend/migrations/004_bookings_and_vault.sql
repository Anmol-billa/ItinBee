-- 004_bookings_and_vault.sql
-- KMS-encrypted Indian transport & stay bookings with public masked PNR projection (pnr_last3) and Mumbai S3 vault keys

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id UUID NULL REFERENCES itinerary_items(id) ON DELETE SET NULL,
  provider VARCHAR(24) NOT NULL CHECK (
    provider IN (
      'irctc',
      'indigo',
      'air_india',
      'akasa',
      'spicejet',
      'redbus',
      'abhibus',
      'mmt',
      'goibibo',
      'airbnb',
      'zostel',
      'homestay',
      'manual'
    )
  ),
  pnr_enc BYTEA NULL,
  pnr_last3 CHAR(3) NULL,
  passenger_meta_enc BYTEA NULL,
  summary_public JSONB NOT NULL DEFAULT '{}'::jsonb,
  low_confidence_fields TEXT[] NOT NULL DEFAULT '{}',
  status VARCHAR(16) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'rac', 'wl', 'cancelled', 'pending')),
  raw_doc_s3_key TEXT NULL,
  doc_size_bytes BIGINT NOT NULL DEFAULT 0,
  parser_confidence REAL NOT NULL DEFAULT 1.0,
  co_traveller_consent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_trip_id
  ON bookings (trip_id);

CREATE INDEX IF NOT EXISTS idx_bookings_item_id
  ON bookings (item_id);
