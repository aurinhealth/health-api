-- The day a health row counts for (source-priority.js, apple-health.js) is
-- COALESCE(sample_time,end_time,start_time). No index had it, so choosing the
-- source after each Google sync read every row of the type (all of a user's
-- Google heart rate: 930,000 rows per page). With it the query seeks the days.
CREATE INDEX IF NOT EXISTS idx_health_datapoints_user_day ON health_datapoints(user_id, source_family, data_type, COALESCE(sample_time,end_time,start_time));
