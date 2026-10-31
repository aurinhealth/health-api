-- Health data paused in Settings → Privacy and data (health-pause.js): the
-- consent is withdrawn and the health data is deleted in chunks. The entry stays
-- until a last pass after retry_after has removed what a sync running at that
-- moment still wrote; turning health data back on does that pass first.
-- busy_until: whoever is deleting holds the entry until then, so a deletion never
-- runs while health data is turned on again.
CREATE TABLE IF NOT EXISTS health_pauses (
  user_id INTEGER PRIMARY KEY,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retry_after TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  busy_until TEXT
);
CREATE INDEX IF NOT EXISTS idx_health_pauses_retry ON health_pauses(retry_after);
