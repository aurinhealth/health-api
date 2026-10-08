-- 0011 is account_deletions (pull request "Smazání velkého účtu").
-- Each user's time zone (src/user-time.js): the browser's zone, sent with app
-- requests. A user without a row stays on Europe/Prague.
CREATE TABLE IF NOT EXISTS user_time_zone (
  user_id INTEGER PRIMARY KEY,
  time_zone TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
