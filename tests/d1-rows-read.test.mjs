import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createD1 } from "./helpers/d1.mjs";
import { replaceGoogleWithApple } from "../src/apple-health.js";

const src = name => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");

// D1 bills every row a query reads. "(family A AND type X) OR (family B AND type Y)"
// alone lets SQLite use only user_id, so it read all of a user's rows (1,099,068
// on a Fitbit account for 61 workouts); the same filter in front as plain INs
// lets it seek (89 rows read).
test("workout queries that pick families and types with OR also name them for the index", () => {
  for (const name of readdirSync(new URL("../src/", import.meta.url)).filter(n => n.endsWith(".js"))) {
    const text = src(name);
    for (const m of text.matchAll(/AND \(\(source_family/g)) {
      const before = text.slice(Math.max(0, m.index - 400), m.index), where = before.slice(before.lastIndexOf("WHERE"));
      assert.match(where, /source_family IN \([^)]*\) AND data_type IN \([^)]*\)/, name + ": " + text.slice(m.index, m.index + 120));
    }
  }
});

test("the matching query seeks the index instead of reading every row of the user", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const sql = src("index.js").match(/SELECT source_family, data_type, external_id, start_time, end_time, payload_json, record_role, matched_activity_id\s+FROM health_datapoints[\s\S]*?ORDER BY start_time/)[0].replace(/--[^\n]*/g, "");
  const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(1, "2026-10-01").map(r => r.detail).join(" | ");
  assert.match(plan, /idx_health_datapoints_user_1 \(user_id=\? AND source_family=\? AND data_type=\?/, plan);
});

test("Google heart-rate pages skip the Apple replacement when Apple Health never sent that type", async () => {
  const db = createD1();
  db.sqlite.exec(schema);
  const add = (family, type, id, time) => db.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,payload_json) VALUES(1,?,?,?,?,'{}')").run(family, type, id, time);
  for (let i = 0; i < 50; i++) add("google-wearables", "heart-rate", "g" + i, "2026-10-2" + (i % 9) + "T10:00:00Z");
  add("google-wearables", "weight", "gw", "2026-10-20T07:00:00Z");
  add("apple-health", "weight", "aw", "2026-10-20T06:00:00Z");
  const seen = [];
  const prepare = db.prepare;
  db.prepare = sql => { seen.push(sql); return prepare.call(db, sql); };
  assert.equal(await replaceGoogleWithApple(db, 1, ["heart-rate"], "2025-10-01"), 0);
  assert.equal(seen.filter(s => /^\s*UPDATE/.test(s)).length, 0, "no update over the heart-rate rows");
  // A type Apple Health has is still replaced as before.
  db.sqlite.exec("UPDATE health_datapoints SET source_family = 'all-sources' WHERE external_id = 'gw'");
  assert.equal(await replaceGoogleWithApple(db, 1, ["weight"], "2025-10-01"), 1);
  assert.equal(db.sqlite.prepare("SELECT record_role FROM health_datapoints WHERE external_id = 'gw'").get().record_role, "duplicate");
});

// Choosing the source and replacing Google with Apple filter by the row's day,
// COALESCE(sample_time,end_time,start_time): the expression index lets them seek
// the days instead of reading every row of the type.
test("the day filters of source choice and Apple replacement seek the day index", () => {
  const day = "COALESCE(sample_time,end_time,start_time) >= ?";
  for (const name of ["source-priority.js", "apple-health.js"]) assert.ok(src(name).includes(day), name);
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const plan = sql => db.prepare("EXPLAIN QUERY PLAN " + sql).all().map(r => r.detail).join(" | ");
  const keys = plan(`SELECT substr(start_time,1,13) k, source_family f FROM health_datapoints WHERE user_id = 1 AND data_type IN ('steps','distance') AND source_family IN ('apple-health','google-wearables') AND ${day.replace("?", "'2026-10-01'")} GROUP BY 1, 2`);
  assert.match(keys, /idx_health_datapoints_user_day \(user_id=\? AND source_family=\? AND data_type=\? AND <expr>>\?\)/, keys);
  const update = plan(`UPDATE health_datapoints SET record_role = 'duplicate' WHERE user_id = 1 AND source_family IN ('google-wearables') AND data_type = 'heart-rate' AND ${day.replace("?", "'2026-10-01'")}`);
  assert.match(update, /idx_health_datapoints_user_day .*<expr>>\?/, update);
});

// Workouts of every source by start time: the partial index on activity and
// exercise rows (migrations/0034) lets "data_type IN ('activity','exercise') AND
// start_time >= ?" seek the days. Before it, idx_health_datapoints_user_0 found
// the user's workouts and every one since the first import was read.
test("workout queries by start time over every source seek the workout index", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  const add = db.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,payload_json) VALUES(1,?,?,?,?,'{}')");
  for (let i = 0; i < 2000; i++) add.run(i % 2 ? "intervals" : "google-wearables", i % 2 ? "activity" : "exercise", "w" + i, new Date(Date.UTC(2021, 0, 1) + i * 86400000).toISOString());
  const found = [];
  for (const name of readdirSync(new URL("../src/", import.meta.url)).filter(n => n.endsWith(".js"))) {
    const text = src(name);
    for (const m of text.matchAll(/data_type ?IN ?\('activity', ?'exercise'\) AND start_time ?>= ?\?/g)) {
      const head = text.lastIndexOf("SELECT", m.index), quote = text[head - 1];
      if (text.slice(text.lastIndexOf("WHERE", m.index), m.index).includes("source_family")) continue;
      const sql = text.slice(head, text.indexOf(quote, m.index));
      found.push(name);
      const plan = db.prepare("EXPLAIN QUERY PLAN " + sql).all(...sql.split("?").slice(1).map(() => "2026-10-01")).map(r => r.detail).join(" | ");
      assert.match(plan, /idx_health_datapoints_user_workout_start \(user_id=\? AND data_type=\? AND start_time>\?/, name + ": " + plan);
    }
  }
  assert.ok(found.length >= 9, found.join(", "));
  // The partial index holds only workouts: a heart-rate sample adds no index row.
  const rows = () => db.prepare("SELECT COUNT(*) n FROM health_datapoints INDEXED BY idx_health_datapoints_user_workout_start WHERE user_id = 1 AND data_type IN ('activity','exercise') AND start_time >= ''").get().n;
  const before = rows();
  db.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,payload_json) VALUES(1,'google-wearables','heart-rate','h1','2026-10-02T10:00:00Z','2026-10-02T10:00:00Z','{}')").run();
  assert.equal(rows(), before);
});
