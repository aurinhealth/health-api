-- One counter per user: every change the user makes bumps it, so cached
-- coach inputs and thresholds from before the change are never used again.
CREATE TABLE IF NOT EXISTS api_cache_versions (
  user_id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);
