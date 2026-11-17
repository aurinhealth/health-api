import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { buildStrengthContext } from "../src/strength-context.js";

// The gym generator's nutrition plan uses the athlete's own weight goal,
// not a default (concept review NUT-1 follow-up).
test("the gym context carries the profile's weight goal", async () => {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)");
  db.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const env = { DB: scopedDb(db, 3), USER_ID: 3, CONNECTED_PROVIDERS: [] };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([]);
  try {
    assert.equal((await buildStrengthContext(env, "2026-10-07")).goal, "");
    db.sqlite.prepare("INSERT INTO dashboard_profile (user_id, id, profile_json) VALUES (3, 1, ?)").run(JSON.stringify({ goal: "gain_0.25" }));
    assert.equal((await buildStrengthContext(env, "2026-10-07")).goal, "gain_0.25");
  } finally { globalThis.fetch = realFetch; }
});
