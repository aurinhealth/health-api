-- Account setup, private recipes, app-owned workouts, provider outbox, and
-- inactive subscription entitlements. No change to existing user data.
CREATE TABLE IF NOT EXISTS user_setup (user_id INTEGER PRIMARY KEY,completed_at TEXT,training_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS subscriptions (user_id INTEGER PRIMARY KEY,plan TEXT NOT NULL DEFAULT 'free',valid_until TEXT);
CREATE TABLE IF NOT EXISTS local_workouts (user_id INTEGER NOT NULL,id TEXT NOT NULL,event_key TEXT NOT NULL,event_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'scheduled',revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,id),UNIQUE(user_id,event_key));
CREATE TABLE IF NOT EXISTS workout_exports (user_id INTEGER NOT NULL,local_id TEXT NOT NULL,provider TEXT NOT NULL,remote_id TEXT,status TEXT NOT NULL DEFAULT 'pending',revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,local_id,provider));
CREATE TABLE IF NOT EXISTS personal_recipes (user_id INTEGER NOT NULL,id TEXT NOT NULL,recipe_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS shared_recipes (catalog_id TEXT PRIMARY KEY,recipe_json TEXT NOT NULL,search_name TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS recipe_contributions (user_id INTEGER NOT NULL,recipe_id TEXT NOT NULL,catalog_id TEXT NOT NULL,PRIMARY KEY(user_id,recipe_id));
CREATE TABLE IF NOT EXISTS food_contributions (user_id INTEGER NOT NULL,personal_id TEXT NOT NULL,catalog_id TEXT NOT NULL,PRIMARY KEY(user_id,personal_id));
CREATE TABLE IF NOT EXISTS food_reports (user_id INTEGER NOT NULL,catalog_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,catalog_id));
