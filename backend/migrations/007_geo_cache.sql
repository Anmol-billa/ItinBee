-- 007_geo_cache.sql
-- Provider response cache (Photon, Wikivoyage, Wikipedia, Wikidata, Commons, Overpass, OpenRouteService).
-- Keeps us inside the public-API usage policies: every upstream response is cached with a per-provider TTL.

CREATE TABLE IF NOT EXISTS geo_cache (
  key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geo_cache_expires ON geo_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_geo_cache_provider ON geo_cache (provider);
