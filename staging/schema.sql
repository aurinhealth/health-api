-- Structure of the live database (health-data) without any rows, so a new
-- empty staging database matches it. Some tables predate the migrations, which
-- is why `d1 migrations apply` alone cannot build a database from scratch.
-- Every statement is idempotent; deploy-staging.yml runs this before the
-- migrations on each deploy. The migrations already reflected here are marked
-- as applied at the end; newer ones are applied normally.

CREATE TABLE IF NOT EXISTS api_cache_versions (
  user_id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assistant_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS athlete_state (user_id INTEGER PRIMARY KEY, state_json TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS "coach_inbox" (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, message TEXT NOT NULL, draft_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT ('draft'), created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), confirmed_at TEXT);

CREATE TABLE IF NOT EXISTS coach_reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    workout_id TEXT,
    rpe REAL,
    notes TEXT,
    signals_json TEXT NOT NULL,
    text TEXT NOT NULL,
    source TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS "connection_credentials" (user_id INTEGER NOT NULL, provider TEXT, encrypted TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, provider));

CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_profile (user_id INTEGER NOT NULL,id INTEGER NOT NULL,profile_json TEXT NOT NULL,PRIMARY KEY (user_id,id));

CREATE TABLE IF NOT EXISTS exercise_videos (user_id INTEGER NOT NULL, exercise TEXT NOT NULL, url TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, exercise));

CREATE TABLE IF NOT EXISTS fluid_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    consumed_at TEXT NOT NULL,
    ml INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'water',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS food_google_exports (
  user_id INTEGER NOT NULL,entry_id INTEGER NOT NULL,desired_json TEXT,revision INTEGER NOT NULL DEFAULT 1,
  remote_name TEXT,operation_name TEXT,operation_revision INTEGER,operation_kind TEXT,status TEXT NOT NULL DEFAULT 'queued',message TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,entry_id));

CREATE TABLE IF NOT EXISTS "food_log" (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, meal_time TEXT, meal_type TEXT, recipe_page INTEGER, recipe_name TEXT, cookbook_page INTEGER, servings REAL NOT NULL DEFAULT (1), calories REAL, protein_g REAL, carbs_g REAL, fat_g REAL, status TEXT NOT NULL DEFAULT ('eaten'), source TEXT NOT NULL DEFAULT ('cookbook'), note TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), fiber_g REAL, salt_g REAL, amount_g REAL, brand TEXT, barcode TEXT);

CREATE TABLE IF NOT EXISTS "food_logs" (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, consumed_date TEXT NOT NULL, consumed_at TEXT, cookbook_page INTEGER, recipe_title TEXT, servings REAL NOT NULL DEFAULT (1), kcal REAL NOT NULL DEFAULT (0), protein_g REAL NOT NULL DEFAULT (0), carbs_g REAL NOT NULL DEFAULT (0), fat_g REAL NOT NULL DEFAULT (0), fiber_g REAL NOT NULL DEFAULT (0), source TEXT NOT NULL DEFAULT ('manual'), note TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), status TEXT);

CREATE TABLE IF NOT EXISTS gym_plan_cancellations (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, event_json TEXT, cancelled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, workout_date));

CREATE TABLE IF NOT EXISTS "gym_plans" (user_id INTEGER NOT NULL, workout_date TEXT, values_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), PRIMARY KEY (user_id, workout_date));

CREATE TABLE IF NOT EXISTS "health_datapoints" (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), record_role TEXT DEFAULT ('primary'), matched_activity_id TEXT, match_confidence REAL, UNIQUE (user_id, source_family, data_type, external_id));

CREATE TABLE IF NOT EXISTS "personal_foods" (user_id INTEGER NOT NULL, food_key TEXT, product_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), PRIMARY KEY (user_id, food_key));

CREATE TABLE IF NOT EXISTS "provider_tokens" (user_id INTEGER NOT NULL, provider TEXT, ciphertext TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, provider));

CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS shared_foods (food_key TEXT PRIMARY KEY,search_name TEXT NOT NULL,product_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS "strength_sets" (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, workout_date TEXT NOT NULL, plan_row INTEGER NOT NULL, type TEXT NOT NULL, exercise TEXT NOT NULL, set_no REAL, planned_kg REAL, planned_reps TEXT, actual_kg REAL, actual_reps REAL, rpe REAL, completed INTEGER NOT NULL DEFAULT (0), note TEXT, video TEXT, replacement TEXT, execution TEXT, source TEXT NOT NULL DEFAULT ('google-sheet'), source_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), UNIQUE (user_id, source_key));

CREATE TABLE IF NOT EXISTS sync_state (     source TEXT PRIMARY KEY,     last_sync_at TEXT,     cursor TEXT,     status TEXT,     error_message TEXT,     updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP );

CREATE TABLE IF NOT EXISTS "sync_status" (user_id INTEGER NOT NULL, sync_name TEXT, status TEXT NOT NULL, started_at TEXT, finished_at TEXT, details_json TEXT, updated_at TEXT DEFAULT (CURRENT_TIMESTAMP), PRIMARY KEY (user_id, sync_name));

CREATE TABLE IF NOT EXISTS training_capabilities (
  user_id INTEGER NOT NULL,
  sport TEXT NOT NULL,
  system TEXT NOT NULL,
  level REAL NOT NULL DEFAULT 3.0,
  confidence REAL NOT NULL DEFAULT 0.20,
  attempts INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  last_workout_id TEXT,
  last_rpe REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sport, system)
);

CREATE TABLE IF NOT EXISTS training_profile (user_id INTEGER PRIMARY KEY, profile_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS user_invites (
        email TEXT PRIMARY KEY,
        invited_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        google_sub TEXT UNIQUE,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at TEXT
      );

CREATE TABLE IF NOT EXISTS week_plan_overrides (user_id INTEGER NOT NULL, week_start TEXT NOT NULL, prefs_json TEXT NOT NULL, PRIMARY KEY(user_id,week_start));

CREATE TABLE IF NOT EXISTS week_plan_preferences (user_id INTEGER PRIMARY KEY, prefs_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS workout_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sport TEXT NOT NULL DEFAULT 'ride',
  workout_id TEXT NOT NULL,
  family TEXT,
  scheduled_date TEXT,
  completed_percent REAL,
  rpe REAL,
  survey TEXT,
  notes TEXT,
  capability_before REAL,
  capability_after REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workout_library (
  id TEXT PRIMARY KEY,
  sport TEXT NOT NULL DEFAULT 'ride',
  name TEXT NOT NULL,
  family TEXT,
  level INTEGER,
  source_name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_url TEXT,
  license_note TEXT,
  attribution TEXT,
  citation TEXT,
  external_id TEXT,
  primary_system TEXT NOT NULL,
  secondary_system TEXT,
  duration_minutes INTEGER NOT NULL,
  work_minutes REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 1,
  intensity_factor REAL,
  target_load REAL,
  cadence TEXT,
  description TEXT,
  indoor_only INTEGER NOT NULL DEFAULT 0,
  intervals_description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  structure_json TEXT NOT NULL DEFAULT '[]',
  zone_minutes_json TEXT NOT NULL DEFAULT '{}',
  verified INTEGER NOT NULL DEFAULT 0,
  popularity REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workout_schedule_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sport TEXT NOT NULL DEFAULT 'ride',
  workout_id TEXT NOT NULL,
  family TEXT,
  scheduled_date TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'indoor',
  intervals_external_id TEXT NOT NULL,
  intervals_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, intervals_external_id)
);

CREATE INDEX IF NOT EXISTS assistant_chats_user ON assistant_chats(user_id, updated_at);

CREATE INDEX IF NOT EXISTS assistant_messages_chat ON assistant_messages(chat_id, id);

CREATE INDEX IF NOT EXISTS idx_coach_inbox_user_0 ON coach_inbox(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_reflections_user_date ON coach_reflections(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_fluid_log_user_date ON fluid_log(user_id, date);

CREATE INDEX IF NOT EXISTS idx_food_log_user_0 ON food_log(user_id, date);

CREATE INDEX IF NOT EXISTS idx_food_logs_user_0 ON food_logs(user_id, consumed_date, consumed_at);

CREATE INDEX IF NOT EXISTS idx_health_datapoints_user_0 ON health_datapoints(user_id, data_type, sample_time DESC);

CREATE INDEX IF NOT EXISTS idx_health_datapoints_user_1 ON health_datapoints(user_id, source_family, data_type, start_time);

CREATE INDEX IF NOT EXISTS idx_strength_sets_user_date ON strength_sets(user_id, workout_date DESC);

CREATE INDEX IF NOT EXISTS idx_strength_sets_user_exercise_date ON strength_sets(user_id, exercise, workout_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_feedback_manual_once ON workout_feedback(user_id, workout_id, scheduled_date) WHERE scheduled_date IS NOT NULL AND survey <> 'auto_completed';

CREATE INDEX IF NOT EXISTS idx_workout_schedule_user_date ON workout_schedule_links(user_id,
  scheduled_date DESC
);

INSERT OR IGNORE INTO d1_migrations (name) VALUES
  ('0001_optimize_reads.sql'),
  ('0002_training_library.sql'),
  ('0003_nutridatabaze.sql'),
  ('0004_backfill_completed_strength_20261002.sql'),
  ('0004_drop_food_databases.sql'),
  ('0005_api_cache_versions.sql'),
  ('0006_assistant_chats.sql'),
  ('0007_food_logs_status.sql'),
  ('0008_strength_sets_plan_row.sql');
