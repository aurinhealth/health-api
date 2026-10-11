-- Only the shared catalogue is moving. These triggers prevent stale or
-- in-flight Workers from writing the old catalogue during/after cutover.
-- A cleanup bypass is enabled and reset inside one atomic deployment batch.
CREATE TABLE IF NOT EXISTS shared_foods (food_key TEXT PRIMARY KEY,search_name TEXT NOT NULL,product_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS shared_recipes (catalog_id TEXT PRIMARY KEY,recipe_json TEXT NOT NULL,search_name TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS food_contributions (user_id INTEGER NOT NULL,personal_id TEXT NOT NULL,catalog_id TEXT NOT NULL,PRIMARY KEY(user_id,personal_id));
CREATE TABLE IF NOT EXISTS recipe_contributions (user_id INTEGER NOT NULL,recipe_id TEXT NOT NULL,catalog_id TEXT NOT NULL,PRIMARY KEY(user_id,recipe_id));
CREATE TABLE IF NOT EXISTS food_reports (user_id INTEGER NOT NULL,catalog_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,catalog_id));
INSERT INTO schema_meta(key,value) VALUES('food_catalog_state','legacy') ON CONFLICT(key) DO NOTHING;
INSERT INTO schema_meta(key,value) VALUES('food_catalog_maintenance','0') ON CONFLICT(key) DO NOTHING;
CREATE TRIGGER IF NOT EXISTS freeze_shared_foods_insert
BEFORE INSERT ON shared_foods
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_shared_foods_update
BEFORE UPDATE ON shared_foods
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_shared_foods_delete
BEFORE DELETE ON shared_foods
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_shared_recipes_insert
BEFORE INSERT ON shared_recipes
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_shared_recipes_update
BEFORE UPDATE ON shared_recipes
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_shared_recipes_delete
BEFORE DELETE ON shared_recipes
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_food_contributions_insert
BEFORE INSERT ON food_contributions
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_food_contributions_update
BEFORE UPDATE ON food_contributions
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_food_contributions_delete
BEFORE DELETE ON food_contributions
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_recipe_contributions_insert
BEFORE INSERT ON recipe_contributions
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_recipe_contributions_update
BEFORE UPDATE ON recipe_contributions
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_recipe_contributions_delete
BEFORE DELETE ON recipe_contributions
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_food_reports_insert
BEFORE INSERT ON food_reports
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_food_reports_update
BEFORE UPDATE ON food_reports
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
CREATE TRIGGER IF NOT EXISTS freeze_food_reports_delete
BEFORE DELETE ON food_reports
WHEN (SELECT value FROM schema_meta WHERE key='food_catalog_state')!='legacy'
 AND (SELECT value FROM schema_meta WHERE key='food_catalog_maintenance')!='1'
BEGIN SELECT RAISE(ABORT,'Food catalogue has moved or is upgrading'); END;
