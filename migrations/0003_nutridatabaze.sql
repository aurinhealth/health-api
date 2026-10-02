-- Czech Food Composition Database (NutriDatabaze.cz, ÚZEI). Loaded from the
-- registered-user export with scripts/import-nutridatabaze.mjs, never from the
-- repository: the licence forbids passing the data file on to third parties,
-- so it is also kept out of the public reference download.

CREATE TABLE IF NOT EXISTS nutridatabaze_foods (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  edible_portion REAL,
  calories_100g REAL NOT NULL,
  protein_100g REAL NOT NULL,
  carbs_100g REAL NOT NULL,
  fat_100g REAL NOT NULL,
  fiber_100g REAL,
  salt_100g REAL,
  version TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
