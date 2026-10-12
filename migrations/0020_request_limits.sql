-- Limits on anonymous sign-in requests (src/ip-rate-limit.js): one row per
-- key (a keyed hash of the caller's address, or a global budget) with the
-- current minute, hour and day windows and how many requests they saw. Rows
-- older than two days are swept when a row is written.
CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT PRIMARY KEY,
  minute TEXT NOT NULL,
  minute_count INTEGER NOT NULL DEFAULT 0,
  hour TEXT NOT NULL,
  hour_count INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  day_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
