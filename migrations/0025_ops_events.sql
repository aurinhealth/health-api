-- Daily counts of failed syncs, broken connections and server errors for the
-- owner's morning e-mail (src/ops-report.js). Kept 30 days.
CREATE TABLE IF NOT EXISTS ops_events (day TEXT NOT NULL,kind TEXT NOT NULL,service TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,last_message TEXT,PRIMARY KEY(day,kind,service));
