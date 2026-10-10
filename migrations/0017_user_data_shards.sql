-- Directory only: no health history or personal tables are copied or deleted.
-- Existing accounts stay on the original binding, including deleted accounts
-- whose cleanup still needs its data database.
CREATE TABLE IF NOT EXISTS user_data_shards (
  shard_key TEXT PRIMARY KEY,
  binding_name TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('ready','offline')),
  accepting_new INTEGER NOT NULL DEFAULT 0 CHECK(accepting_new IN (0,1)),
  max_users INTEGER NOT NULL DEFAULT 10 CHECK(max_users>0),
  max_bytes INTEGER NOT NULL DEFAULT 7000000000 CHECK(max_bytes>0)
);
CREATE TABLE IF NOT EXISTS user_data_routes (
  user_id INTEGER PRIMARY KEY,
  shard_key TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS user_data_routes_shard ON user_data_routes(shard_key);
INSERT INTO user_data_shards(shard_key,binding_name,state,accepting_new)
  VALUES('legacy','DB','ready',0) ON CONFLICT(shard_key) DO NOTHING;
INSERT INTO user_data_routes(user_id,shard_key)
  SELECT id,'legacy' FROM users WHERE 1 ON CONFLICT(user_id) DO NOTHING;
INSERT INTO user_data_routes(user_id,shard_key)
  SELECT user_id,'legacy' FROM account_deletions WHERE 1 ON CONFLICT(user_id) DO NOTHING;
INSERT INTO schema_meta(key,value) VALUES('user_data_sharding_enabled','0') ON CONFLICT(key) DO NOTHING;
