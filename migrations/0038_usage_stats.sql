-- Usage statistics (usage-stats.js): daily counts of how many accounts used a
-- part of the app, and returns after N days per sign-up week. No log of events:
-- per account only the last counted day and which names it was counted for that
-- day (overwritten every day), deleted with the account.
CREATE TABLE IF NOT EXISTS usage_users (
  user_id INTEGER PRIMARY KEY,
  last_day TEXT NOT NULL,
  day_mask INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS usage_counts (
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  users INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS usage_retention (
  cohort_week TEXT NOT NULL,
  day_n INTEGER NOT NULL,
  users INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cohort_week, day_n)
) WITHOUT ROWID;
