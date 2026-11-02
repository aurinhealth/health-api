-- Workouts by start time over every source: "data_type IN ('activity','exercise')
-- AND start_time >= ?" (the coach's day pick, the plan's sport days, the coach's
-- allowance, the threshold check, own fitness, the post-workout note, the journal).
-- No index had user, type and start time without the source in between, so each
-- of these read all of a user's workouts since the first import, not only the
-- days it asks for. Partial: only workout rows are indexed, so the sync's heart
-- rate, steps and other samples write nothing more.
CREATE INDEX IF NOT EXISTS idx_health_datapoints_user_workout_start ON health_datapoints(user_id, data_type, start_time) WHERE data_type IN ('activity','exercise');
