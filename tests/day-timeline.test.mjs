import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import legacy from "../src/index.js";






function weightEnv() {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT, UNIQUE (user_id, source_family, data_type, external_id));`);
  return { DB: db, USER_ID: 7, CONNECTED_PROVIDERS: [] };
}
const post = (env, body) => legacy.fetch(new Request("https://internal/app/api/weight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, { waitUntil() {} });

test("today's manual weigh-in keeps its local time, an earlier day gets local noon (Prague by default)", async () => {
  const env = weightEnv();
  assert.equal((await post(env, { kg: 80.2 })).status, 200);
  assert.equal((await post(env, { kg: 80.9, date: "2026-01-05" })).status, 200);
  const rows = env.DB.sqlite.prepare("SELECT sample_time FROM health_datapoints ORDER BY sample_time").all().map(r => r.sample_time);
  assert.equal(rows[0], "2026-01-05T12:00:00+01:00");
  assert.match(rows[1], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0[12]:00$/);
});

test("a weight for a future or malformed day is refused", async () => {
  const env = weightEnv();
  assert.equal((await post(env, { kg: 80, date: "2999-01-01" })).status, 400);
  assert.equal((await post(env, { kg: 80, date: "zítra" })).status, 400);
});


test("weights without sample_time use start_time; ones without any time are left out", async () => {
  const env = weightEnv();
  env.DB.sqlite.exec(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, sample_time, value_numeric) VALUES
    (7, 'google', 'weight', 'a', '2026-10-03T05:12:00Z', NULL, 81.4),
    (7, 'google', 'weight', 'b', NULL, NULL, 90),
    (7, 'manual', 'weight', 'c', NULL, '2026-10-02T12:00:00+02:00', 81.9)`);
  const r = await (await legacy.fetch(new Request("https://internal/health/weight"), env, { waitUntil() {} })).json();
  assert.deepEqual(r.records.map(x => [x.sample_time, x.value_numeric]), [["2026-10-02T12:00:00+02:00", 81.9], ["2026-10-03T05:12:00Z", 81.4]]);
});
