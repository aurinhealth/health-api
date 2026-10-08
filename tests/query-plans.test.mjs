import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { googleDashboard } from "../src/google-dashboard.js";
import { loadFitnessInsights } from "../src/fitness-insights.js";

// health_datapoints holds about a million heart-rate rows per user: a read
// that SQLite can't serve from an index reads all of them (0.3 s and more).
function datapoints() {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, source_family TEXT NOT NULL, data_type TEXT NOT NULL, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT NOT NULL DEFAULT '{}', record_role TEXT DEFAULT 'primary', UNIQUE (user_id, source_family, data_type, external_id));
    CREATE INDEX idx_health_datapoints_user_0 ON health_datapoints(user_id, data_type, sample_time DESC);
    CREATE INDEX idx_health_datapoints_user_1 ON health_datapoints(user_id, source_family, data_type, start_time);
    CREATE TABLE sync_status (user_id INTEGER, sync_name TEXT, status TEXT, updated_at TEXT, details_json TEXT);
    CREATE TABLE strength_sets (user_id INTEGER, workout_date TEXT, exercise TEXT, actual_kg REAL, actual_reps INTEGER, rpe REAL, completed INTEGER, type TEXT);`);
  const plans = [];
  const prepare = db.prepare;
  db.prepare = sql => { if (/health_datapoints/.test(sql) && /^\s*select/i.test(sql)) plans.push({ sql, plan: db.sqlite.prepare("EXPLAIN QUERY PLAN " + sql).all(...Array(sql.split("?").length - 1).fill("x")).map(r => r.detail) }); return prepare(sql); };
  db.userId = 1;
  return { db, plans };
}
// Reads that don't narrow by data type in the index: a full scan, or all of
// one source's rows (heart rate included).
const scans = plans => plans.filter(p => p.plan.some(d => /^SCAN health_datapoints\b/.test(d) || /^SEARCH health_datapoints\b/.test(d) && !/data_type=/.test(d))).map(p => p.sql.slice(0, 120));

test("the Google Health summary reads through an index", async () => {
  const { db, plans } = datapoints();
  // Planner statistics like production's: heart rate dwarfs everything else.
  const insert = db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, start_time) VALUES (1, 'google-wearables', ?, ?, ?, ?)");
  db.sqlite.exec("BEGIN");
  for (let i = 0; i < 20000; i++) { const t = new Date(Date.UTC(2026, 8, 1) + i * 60000).toISOString(); insert.run(i % 50 ? "heart-rate" : "steps", String(i), t, t); }
  db.sqlite.exec("COMMIT; ANALYZE");
  await googleDashboard(db, "2026-10-08");
  assert.ok(plans.length >= 2);
  assert.deepEqual(scans(plans), []);
});

test("fitness insights match each activity's session once, not per comparison", async () => {
  const { db } = datapoints();
  const insert = db.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, start_time, end_time, payload_json) VALUES (1, ?, ?, ?, ?, ?)");
  for (let i = 0; i < 300; i++) {
    const start = new Date(Date.UTC(2026, 0, 1) + i * 86400000 + 7 * 3600000).toISOString();
    insert.run("intervals", "activity", start.slice(0, 19), null, JSON.stringify({ type: "Ride", start_date: start, start_date_local: start.slice(0, 19), moving_time: 3600, elapsed_time: 3600 }));
    if (i % 3 === 0) insert.run("google-wearables", "exercise", start, new Date(Date.parse(start) + 3600000).toISOString(), JSON.stringify({ exercise: { exerciseType: "BIKING", interval: { startTime: start } } }));
  }
  let parses = 0;
  const parse = JSON.parse;
  JSON.parse = (...args) => { parses++; return parse(...args); };
  try { await loadFitnessInsights(db, "2026-10-08"); } finally { JSON.parse = parse; }
  // 400 rows: a parse per row, not one per comparison (300 × 100 pairs).
  assert.ok(parses < 2000, `${parses} JSON parses`);
});
