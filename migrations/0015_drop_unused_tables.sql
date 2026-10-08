-- 0013 is the cookbook and consents (pull request #100), 0014 passkeys (#82).
-- Tables from earlier versions that nothing reads or writes any more, all empty
-- on the live database (checked 2026-10-08): the old food diary (now food_logs),
-- the old sign-in key store (now connection_credentials) and the old sync state
-- (now sync_status).
DROP TABLE IF EXISTS food_log;
DROP TABLE IF EXISTS provider_tokens;
DROP TABLE IF EXISTS sync_state;
