-- Applied once on the live database (2026-10-02); the owner's address is not kept here.
-- The owner confirmed completing this workout with the prescribed loads.
-- Preserve explicit actuals (including zero), incomplete sets, other dates,
-- and every other user's data. Only single fixed rep counts are inferable.
UPDATE strength_sets
SET actual_kg = COALESCE(actual_kg, planned_kg),
    actual_reps = CASE
      WHEN actual_reps IS NULL
        AND trim(planned_reps) <> ''
        AND trim(planned_reps) NOT GLOB '*[^0-9]*'
        AND CAST(trim(planned_reps) AS INTEGER) > 0
      THEN CAST(trim(planned_reps) AS INTEGER)
      ELSE actual_reps
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE user_id = (SELECT id FROM users WHERE email = 'owner@example.com')
  AND workout_date = '2026-10-02'
  AND completed = 1
  AND type IN ('WORK', 'WARMUP')
  AND (
    (actual_kg IS NULL AND planned_kg IS NOT NULL)
    OR (actual_reps IS NULL
      AND trim(planned_reps) <> ''
      AND trim(planned_reps) NOT GLOB '*[^0-9]*'
      AND CAST(trim(planned_reps) AS INTEGER) > 0)
  );
