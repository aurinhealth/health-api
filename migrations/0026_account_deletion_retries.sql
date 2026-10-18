-- A deletion the cron could not finish (the account's data database offline or
-- unbound, a statement that keeps failing) waits before the next attempt, so
-- the deletions after it still run; the daily ops report lists the ones that
-- keep failing (src/account-data.js finishAccountDeletions, src/ops-report.js).
ALTER TABLE account_deletions ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account_deletions ADD COLUMN last_error TEXT;
ALTER TABLE account_deletions ADD COLUMN retry_after TEXT;
