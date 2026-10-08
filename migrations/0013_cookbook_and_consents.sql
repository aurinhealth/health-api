-- The owner's cookbook moves out of the public repository into the database
-- (cookbook.js): one row with the recipes as gzipped JSON in base64, loaded with
-- scripts/import-cookbook.mjs.
CREATE TABLE IF NOT EXISTS cookbook (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Consents a user gave in the app (consent.js): what, which version of the
-- text, when; withdrawn_at is set when the user takes it back.
CREATE TABLE IF NOT EXISTS user_consents (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  withdrawn_at TEXT,
  PRIMARY KEY (user_id, kind)
);
