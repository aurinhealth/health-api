-- Synchronizace (src/sync-destinations.js): where Loadwise sends what the
-- user records. Preferences per user and destination ('intervals', 'apple'):
-- send planned workouts, send done activities, download done activities and
-- the health data to send (health_json: "all" or a JSON list of types). A
-- user without a row keeps the behaviour from before (the defaults in code).
CREATE TABLE IF NOT EXISTS sync_preferences (
  user_id INTEGER NOT NULL,
  destination TEXT NOT NULL,
  push_planned INTEGER NOT NULL DEFAULT 0,
  push_activities INTEGER NOT NULL DEFAULT 0,
  pull_activities INTEGER NOT NULL DEFAULT 0,
  health_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, destination)
);
-- Each done activity logged in the app (a manual workout, a gym session) per
-- destination it went to: pending, sent (with the destination's id) or error
-- (with the message the app shows next to "Zkusit znovu").
CREATE TABLE IF NOT EXISTS sync_sends (
  user_id INTEGER NOT NULL,
  activity_key TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  remote_id TEXT,
  message TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, activity_key, destination)
);
CREATE INDEX IF NOT EXISTS idx_sync_sends_status ON sync_sends(user_id, destination, status, updated_at);
