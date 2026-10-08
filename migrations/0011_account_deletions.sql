-- Accounts deleted in Settings whose data is still being removed in chunks
-- (account-data.js). The account row is already gone; the cron removes the
-- rest of the data and then this entry.
CREATE TABLE IF NOT EXISTS account_deletions (
  user_id INTEGER PRIMARY KEY,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
