-- Aurin's marks on a stored activity under the app's own name (activity-type.js mark):
-- loadwiseType, loadwiseKcal, loadwiseKcalDevice and loadwiseMerge become aurinType,
-- aurinKcal, aurinKcalDevice and aurinMerge. Production had 7 such rows on 2026-10-30.
-- The search reads the table once (about 0.7 million rows on the largest database);
-- the code still reads an old mark the previous version writes while this runs.
UPDATE health_datapoints
SET payload_json = replace(replace(replace(replace(payload_json,
    '"loadwiseType":', '"aurinType":'),
    '"loadwiseKcal":', '"aurinKcal":'),
    '"loadwiseKcalDevice":', '"aurinKcalDevice":'),
    '"loadwiseMerge":', '"aurinMerge":')
WHERE data_type IN ('exercise', 'activity') AND instr(payload_json, '"loadwise') > 0;
