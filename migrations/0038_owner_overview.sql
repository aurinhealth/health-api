-- The owner's overview of users and subscriptions (2026-11-25).
-- The daily report sums AI spending by day across accounts (ops-report.js);
-- ai_usage_user_day starts with user_id, so those sums read the whole table.
CREATE INDEX IF NOT EXISTS ai_usage_day ON ai_usage(day);
-- The history of Apple's notifications (app-store.js recordStoreEvent).
-- Created by the app too; listed here for a fresh database.
CREATE TABLE IF NOT EXISTS store_events (
  notification_uuid TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 0,
  original_transaction_id TEXT,
  type TEXT NOT NULL,
  subtype TEXT,
  product_id TEXT,
  environment TEXT,
  ownership TEXT,
  free_trial INTEGER,
  offer_type INTEGER,
  auto_renew INTEGER,
  expiration_intent INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  signed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS store_events_user ON store_events(user_id, signed_at);
CREATE INDEX IF NOT EXISTS store_events_original ON store_events(original_transaction_id);
