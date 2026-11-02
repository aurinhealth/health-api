-- Databases kept in reserve: bound to the Worker and prepared, but taking no
-- accounts until the free places of the open ones fall below 100; the server
-- then opens the next one itself (tenancy.js openReserveShards). A database an
-- operator closed (accepting_new=0, reserve=0) is never reopened this way.
ALTER TABLE user_data_shards ADD COLUMN reserve INTEGER NOT NULL DEFAULT 0;
