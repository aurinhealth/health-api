-- New accounts that found the user databases full (tenancy.js mayCreateAccount):
-- they get a place once more databases are added.
CREATE TABLE IF NOT EXISTS signup_waitlist (
  email TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
