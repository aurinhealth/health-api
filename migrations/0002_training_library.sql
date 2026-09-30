-- Workout library (shared catalog of imported workouts) and per-user training
-- progression, feedback and Intervals.icu scheduling links. Mirrors
-- ensureTrainingTables() in src/workout-library.js.

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_feedback_manual_once ON workout_feedback(user_id, workout_id, scheduled_date) WHERE scheduled_date IS NOT NULL AND survey <> 'auto_completed';

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

CREATE INDEX IF NOT EXISTS idx_workout_schedule_user_date ON workout_schedule_links(user_id,
  scheduled_date DESC
);
