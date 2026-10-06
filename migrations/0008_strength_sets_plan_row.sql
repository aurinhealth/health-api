-- Google Sheets is gone: strength sets come from the plan stored in the app.
-- The row index column is named after the plan, and rows synced from the
-- plan are labelled 'plan' instead of 'google-sheet'.
ALTER TABLE strength_sets RENAME COLUMN sheet_row TO plan_row;
UPDATE strength_sets SET source = 'plan' WHERE source = 'google-sheet';
