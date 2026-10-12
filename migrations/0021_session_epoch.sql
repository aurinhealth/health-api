-- Sessions carry the user's session_epoch (src/dashboard-auth.js); a cookie
-- with another epoch is no longer signed in. The epoch moves on when the
-- e-mail changes, a passkey or the Apple ID is removed, or the user signs out
-- everywhere. Existing cookies without an epoch count as 0 and keep working.
ALTER TABLE users ADD COLUMN session_epoch INTEGER NOT NULL DEFAULT 0;
