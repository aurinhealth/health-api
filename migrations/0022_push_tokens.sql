-- Push notifications to the iPhone app (src/push.js). push_tokens holds the
-- APNs device tokens the app registers (POST /app/api/push/token); a token
-- APNs calls dead (410, BadDeviceToken) is deleted. push_log is the
-- once-a-day guard: one row per user, kind ("morning-readiness") and the
-- user's local day a push went out.
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, token)
);
CREATE TABLE IF NOT EXISTS push_log (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  local_date TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, kind, local_date)
);
