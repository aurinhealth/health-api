-- What each AI answer cost, per user and day, for the daily AI limit
-- (ai-usage.js). Created by the app too; listed here for a fresh database.
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  day TEXT NOT NULL,
  feature TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL
);
CREATE INDEX IF NOT EXISTS ai_usage_user_day ON ai_usage(user_id, day);
