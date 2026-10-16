-- A failed export to Wahoo or Intervals.icu waits longer after each attempt
-- and stops after a few (src/local-workouts.js exportDue, failedExport).
ALTER TABLE workout_exports ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
