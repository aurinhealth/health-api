import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseConfig } from "../scripts/provision-user-shards.mjs";
import { backupPlan, KEEP_DAYS } from "../scripts/backup-databases.mjs";

test("the weekly backup covers the central database and every user data database", () => {
  const plan = backupPlan(parseConfig(readFileSync("wrangler.jsonc", "utf8")), "2026-10-18");
  assert.equal(plan.length, 21);
  assert.deepEqual(plan[0], { name: "health-data", key: "2026-10-18/health-data.sql.gz" });
  assert.equal(plan.at(-1).name, "health-data-users-020");
  // The privacy policy says backups of a deleted account are overwritten within 30 days.
  assert.ok(KEEP_DAYS <= 30);
  assert.match(readFileSync("src/site-pages.js", "utf8"), /Database backups are overwritten within 30 days/);
});
