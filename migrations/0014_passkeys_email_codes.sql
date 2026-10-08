-- Signing in without Google: passkeys and one-time codes sent by e-mail.
-- A passkey's public key and signature counter. The private key never leaves
-- the user's device; user_handle is the random id the passkey stores for the user.
CREATE TABLE IF NOT EXISTS user_passkeys (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  user_handle TEXT NOT NULL,
  public_key TEXT NOT NULL,
  alg INTEGER NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  name TEXT NOT NULL,
  backed_up INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS user_passkeys_user ON user_passkeys(user_id);
-- Single-use challenges for passkey sign-in and for adding a passkey (5 minutes).
CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  user_id INTEGER,
  user_handle TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_challenges_expiry ON auth_challenges(expires_at);
-- Sign-in codes sent by e-mail: only a keyed hash of the code (10 minutes),
-- with the counters that limit attempts and sends per address.
CREATE TABLE IF NOT EXISTS email_login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT,
  expires_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL DEFAULT 0,
  day TEXT,
  day_count INTEGER NOT NULL DEFAULT 0
);
