-- What the screens and the source choice add up per hour and source
-- (hour-summary.js): steps, active energy and minutes in each heart-rate zone of
-- the rows that count, and the minutes worn (every Google zone minute). Today read
-- ~45,000 zone-minute and steps rows for a month, the source choice ~60,000; the
-- summary has at most 24 rows a day and source.
CREATE TABLE IF NOT EXISTS health_hour_summary (
  user_id INTEGER NOT NULL,
  hour TEXT NOT NULL,
  source_family TEXT NOT NULL,
  steps REAL,
  energy REAL,
  zone_light REAL,
  zone_moderate REAL,
  zone_vigorous REAL,
  zone_peak REAL,
  wear_minutes REAL,
  PRIMARY KEY (user_id, hour, source_family)
);

-- Types a Google sync changed and from which hour, until the choice of source and
-- the summary run once after the sync instead of after every page (apple-health.js).
CREATE TABLE IF NOT EXISTS health_pending (
  user_id INTEGER NOT NULL,
  data_type TEXT NOT NULL,
  since TEXT NOT NULL,
  marks INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, data_type)
);
