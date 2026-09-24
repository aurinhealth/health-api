-- Reduce D1 row scans for the health-api read-heavy paths.
-- Applied once through Wrangler D1 migrations.

CREATE INDEX IF NOT EXISTS idx_health_datapoints_type_sample
  ON health_datapoints(data_type, sample_time DESC);

CREATE INDEX IF NOT EXISTS idx_health_datapoints_source_type_start
  ON health_datapoints(source_family, data_type, start_time);

CREATE INDEX IF NOT EXISTS idx_food_logs_date_time
  ON food_logs(consumed_date, consumed_at);

PRAGMA optimize;
