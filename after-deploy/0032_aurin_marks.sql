-- Migration 0032 once more, after the new version is live: a mark the previous version
-- wrote under the old name while the deploy ran (activity-type.js mark). Runs once per
-- database (schema_meta); later deploys read no rows.
UPDATE health_datapoints
SET payload_json = replace(replace(replace(replace(payload_json,
    '"loadwiseType":', '"aurinType":'),
    '"loadwiseKcal":', '"aurinKcal":'),
    '"loadwiseKcalDevice":', '"aurinKcalDevice":'),
    '"loadwiseMerge":', '"aurinMerge":')
WHERE NOT EXISTS (SELECT 1 FROM schema_meta WHERE key = 'aurin_marks_renamed')
  AND data_type IN ('exercise', 'activity') AND instr(payload_json, '"loadwise') > 0;
INSERT INTO schema_meta(key, value) VALUES('aurin_marks_renamed', '1') ON CONFLICT(key) DO NOTHING;
