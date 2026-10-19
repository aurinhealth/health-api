-- The account at a connected service that its webhooks name: the Intervals.icu
-- athlete id and the Wahoo user id (src/connection-secrets.js). Kept in the
-- clear next to the encrypted keys, so a webhook finds its user by an index
-- instead of decrypting everyone's keys; only that id, never a token. One row
-- per user and service, written when the connection is saved and removed with
-- it; connections from before this table are added the first time a webhook
-- finds nobody (backfillConnectionAccounts).
CREATE TABLE IF NOT EXISTS connection_accounts (
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);
CREATE INDEX IF NOT EXISTS connection_accounts_external ON connection_accounts(provider, external_id);
