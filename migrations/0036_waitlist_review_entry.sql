-- The test server's waitlist kept one sign-up from the security review of
-- 2026-11-02 (an example.com address, sent without the human check). It goes
-- here; on the live server the statement finds nothing. The table is made the
-- same way testflight-waitlist.js makes it, for a database that never had a sign-up.
CREATE TABLE IF NOT EXISTS testflight_waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  invited_at TEXT
);
DELETE FROM testflight_waitlist WHERE email LIKE 'sec005-poc-%@example.com' AND status = 'pending';
