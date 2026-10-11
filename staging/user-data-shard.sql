-- Readiness marker. Only set after schema and migrations succeeded.
CREATE TABLE IF NOT EXISTS user_data_shard_meta(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
INSERT INTO user_data_shard_meta(id,version) VALUES(1,1) ON CONFLICT(id) DO NOTHING;
