import test from "node:test";
import assert from "node:assert/strict";
import legacy from "../src/index.js";
import { createD1 } from "./helpers/d1.mjs";

// /health/sleep reads only the nights near the asked range from the database,
// and still the old Google rows whose times sit only inside payload_json.
test("the sleep answer reads the range's nights, not the whole history", async () => {
  const DB = createD1();
  DB.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT,
    external_id TEXT, start_time TEXT, end_time TEXT, record_role TEXT, payload_json TEXT)`);
  const add = (id, start, end, payload = {}) => DB.sqlite.prepare(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json)
    VALUES (1, 'apple-health', 'sleep', ?, ?, ?, ?)`).run(id, start, end, JSON.stringify(payload));
  add("old", "2026-08-01T21:00:00Z", "2026-08-02T05:00:00Z");
  add("evening-before", "2026-10-09T21:30:00Z", "2026-10-10T05:30:00Z");
  add("recent", "2026-10-15T21:00:00Z", "2026-10-16T05:00:00Z");
  add("nested", null, null, { sleep: { interval: { startTime: "2026-10-12T21:00:00Z", endTime: "2026-10-13T05:00:00Z" } } });
  const asked = [];
  const db = { ...DB, prepare: sql => { const s = DB.prepare(sql); return { ...s, bind: (...v) => { if (/data_type = 'sleep'/.test(sql)) asked.push(v); return s.bind(...v); } }; } };
  const res = await legacy.fetch(new Request("https://internal/health/sleep?start=2026-10-10&end=2026-10-17"), { DB: db, USER_ID: 1 }, { waitUntil() {} });
  const ids = (await res.json()).sessions.map(s => s.id).sort();
  assert.deepEqual(ids, ["evening-before", "nested", "recent"]);
  assert.deepEqual(asked, [[1, "2026-10-08"]]);
});
