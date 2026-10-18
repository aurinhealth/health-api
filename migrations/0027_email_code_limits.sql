-- Wrong sign-in codes per address and UTC day, all its codes together
-- (src/email-login.js): after 20 the address is locked until midnight.
ALTER TABLE email_login_codes ADD COLUMN fail_day TEXT;
ALTER TABLE email_login_codes ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0;
-- Wrong tries while the fixed App Review code (APP_REVIEW_CODE) applies, over
-- its whole life: one row per keyed hash of the review address and that code.
-- After 20 the address cannot sign in by code until APP_REVIEW_CODE changes.
CREATE TABLE IF NOT EXISTS review_code_failures (
  key TEXT PRIMARY KEY,
  failed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
