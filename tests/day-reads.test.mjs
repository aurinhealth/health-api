import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { readDaysTogether, readDay } from "../src/day-reads.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
// Prague in winter: the local day starts at 23:00 UTC the day before.
const dayStart = d => shift(d, -1) + "T23:00:00.000Z";
const USER = 7, START = "2026-10-26", END = shift(START, 7);

// The day's own queries, as index.js asks them without a week.
const OWN = {
  calories: (db, date) => db.prepare(`SELECT value_numeric, sample_time FROM health_datapoints WHERE user_id = ? AND data_type = 'total-calories' AND sample_time >= ? AND sample_time < ? ORDER BY sample_time DESC, id DESC LIMIT 1`).bind(USER, date, shift(date, 1)).first(),
  planned: (db, lo, hi) => db.prepare(`SELECT * FROM health_datapoints WHERE user_id = ? AND source_family IN ('intervals','local') AND data_type = 'planned-workout' AND start_time >= ? AND start_time < ? ORDER BY start_time, id`).bind(USER, lo, hi).all(),
  activities: (db, lo, hi) => db.prepare(`SELECT * FROM health_datapoints WHERE user_id = ? AND source_family IN ('intervals','local','wahoo') AND data_type = 'activity' AND start_time >= ? AND start_time < ? AND (record_role IS NULL OR record_role != 'duplicate') ORDER BY start_time, id`).bind(USER, lo, hi).all(),
  exercises: (db, lo, hi) => db.prepare(`SELECT * FROM health_datapoints WHERE user_id = ? AND source_family IN ('google-wearables','apple-health') AND data_type = 'exercise' AND start_time >= ? AND start_time < ? AND (record_role IS NULL OR record_role != 'duplicate') ORDER BY start_time, id`).bind(USER, lo, hi).all(),
  food: (db, date) => db.prepare(`SELECT * FROM food_logs WHERE user_id = ? AND consumed_date = ? AND (status IS NULL OR status='eaten') ORDER BY consumed_at, id`).bind(USER, date).all()
};

function seeded() {
  const db = createD1();
  db.sqlite.exec(schema);
  const hd = db.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,end_time,value_numeric,payload_json,record_role) VALUES(?,?,?,?,?,?,?,?,'{}',?)");
  const food = db.sqlite.prepare("INSERT INTO food_logs(user_id,consumed_date,consumed_at,recipe_title,kcal,status) VALUES(?,?,?,?,?,?)");
  let n = 0;
  for (let k = -3; k < 12; k++) {
    const d = shift(START, k);
    for (const user of [USER, USER + 1]) {
      // Ties in time, both families, NULL and 'duplicate' roles, midnight edges, odd values.
      for (const [family, type, time, role] of [
        ["intervals", "planned-workout", d + "T06:00:00", "primary"], ["local", "planned-workout", d + "T06:00:00", null], ["intervals", "planned-workout", d, "primary"],
        ["intervals", "activity", d + "T06:05:00", "primary"], ["wahoo", "activity", d + "T06:05:00", null], ["local", "activity", d + "T23:59:59", "duplicate"], ["intervals", "activity", null, "primary"],
        ["google-wearables", "exercise", d + "T22:59:59Z", "primary"], ["apple-health", "exercise", d + "T23:00:00.000Z", null], ["google-wearables", "exercise", d + "T05:00:00Z", "duplicate"],
        ["google-wearables", "steps", d + "T06:00:00Z", "primary"]
      ]) hd.run(user, family, type, "x" + n++, null, time, null, 1, role);
      for (const [time, v] of [[d + "T10:00:00Z", 1500], [d + "T20:00:00Z", 2600], [d + "T20:00:00Z", 2700], [d, 900]]) hd.run(user, "google-wearables", "total-calories", "x" + n++, time, null, null, v, "primary");
      for (const [at, status] of [[null, null], [d + "T09:00:00", "eaten"], [d + "T09:00:00", null], [d + "T08:00:00", "planned"]]) food.run(user, d, at, "meal", 100, status);
    }
  }
  food.run(USER, START + " ", null, "odd date", 1, null);
  return db;
}

// Counts the queries that reach the database.
function counted(db) {
  const log = [];
  return { log, prepare: sql => { const s = db.prepare(sql); const wrap = st => ({ bind: (...v) => wrap(st.bind(...v)), all: () => { log.push(sql); return st.all(); }, first: () => { log.push(sql); return st.first(); } }); return wrap(s); } };
}

test("a week read together gives every day exactly the rows of its own queries", async () => {
  const raw = seeded(), db = counted(raw);
  const done = readDaysTogether(db, USER, START, END, dayStart);
  for (let k = 0; k < 7; k++) {
    const d = shift(START, k), next = shift(d, 1);
    assert.deepEqual((await readDay(db, USER, "calories", d, next)).results, [await OWN.calories(raw, d)].filter(Boolean), "calories " + d);
    assert.deepEqual((await readDay(db, USER, "planned", d, next)).results, (await OWN.planned(raw, d, next)).results, "planned " + d);
    // nearbyRideContext: the two days after the next.
    assert.deepEqual((await readDay(db, USER, "planned", next, shift(d, 3))).results, (await OWN.planned(raw, next, shift(d, 3))).results, "ride context " + d);
    assert.deepEqual((await readDay(db, USER, "activities", d, next)).results, (await OWN.activities(raw, d, next)).results, "activities " + d);
    assert.deepEqual((await readDay(db, USER, "exercises", dayStart(d), dayStart(next))).results, (await OWN.exercises(raw, dayStart(d), dayStart(next))).results, "exercises " + d);
    assert.deepEqual((await readDay(db, USER, "food", d)).results, (await OWN.food(raw, d)).results, "food " + d);
  }
  // One read per kind for the whole week.
  assert.equal(db.log.length, 5);
  // Without a week, each day asks its own query and gets the same rows.
  done();
  db.log.length = 0;
  for (let k = 0; k < 7; k++) {
    const d = shift(START, k), next = shift(d, 1);
    assert.deepEqual((await readDay(db, USER, "calories", d, next)).results, [await OWN.calories(raw, d)].filter(Boolean));
    assert.deepEqual((await readDay(db, USER, "activities", d, next)).results, (await OWN.activities(raw, d, next)).results);
    assert.deepEqual((await readDay(db, USER, "food", d)).results, (await OWN.food(raw, d)).results);
  }
  assert.equal(db.log.length, 21);
});

// The day's own query (not the week's): one more query in the log.
const ownQuery = async (db, ...args) => { const before = db.log.length; const r = await readDay(db, ...args); return { own: db.log.length - before === 1 && !/UNION ALL|consumed_date >=/.test(db.log.at(-1)), r }; };

test("a day outside the week or another user asks its own query", async () => {
  const raw = seeded(), db = counted(raw);
  const done = readDaysTogether(db, USER, START, END, dayStart);
  await readDay(db, USER, "food", START); await readDay(db, USER, "activities", START, shift(START, 1)); await readDay(db, USER, "planned", START, shift(START, 1)); await readDay(db, USER, "calories", START, shift(START, 1));
  for (const args of [[USER, "food", shift(START, -1)], [USER, "food", END], [USER, "activities", shift(END, -1), shift(END, 1)],
    [USER, "planned", shift(END, 2), shift(END, 3)], [USER, "calories", END, shift(END, 1)], [USER, "calories", START, shift(START, 2)], [USER + 1, "food", START]]) {
    const { own, r } = await ownQuery(db, ...args);
    assert.ok(own, JSON.stringify(args));
    assert.ok(Array.isArray(r.results));
  }
  // Planned workouts reach two days past the week (nearbyRideContext of the last day).
  assert.equal((await ownQuery(db, USER, "planned", shift(END, 1), shift(END, 2))).own, false);
  await assert.rejects(readDay(db, USER, "steps", START, END));
  done();
});

test("a failed week read leaves each day to its own query, and is asked again", async () => {
  const raw = seeded();
  let fail = true;
  const db = { prepare: sql => { const s = raw.prepare(sql); return { bind: (...v) => ({ all: () => fail && /consumed_date >=/.test(sql) ? Promise.reject(new Error("D1 reset")) : s.bind(...v).all() }) }; } };
  const done = readDaysTogether(db, USER, START, END, dayStart);
  assert.deepEqual((await readDay(db, USER, "food", START)).results, (await OWN.food(raw, START)).results);
  fail = false;
  assert.deepEqual((await readDay(db, USER, "food", shift(START, 1))).results, (await OWN.food(raw, shift(START, 1))).results);
  done();
});

test("rows handed out are copies", async () => {
  const db = seeded();
  const done = readDaysTogether(db, USER, START, END, dayStart);
  const first = await readDay(db, USER, "activities", START, shift(START, 1));
  first.results[0].payload_json = "changed";
  first.results.pop();
  const again = await readDay(db, USER, "activities", START, shift(START, 1));
  assert.deepEqual(again.results, (await OWN.activities(db, START, shift(START, 1))).results);
  done();
});

test("a bad week or time zone reads nothing together", async () => {
  const raw = seeded(), db = counted(raw);
  for (const done of [readDaysTogether(db, USER, END, START, dayStart), readDaysTogether(db, USER, "x", END, dayStart), readDaysTogether(db, USER, START, END, () => { throw new Error("zone"); }), readDaysTogether(null, USER, START, END, dayStart)]) {
    assert.equal((await ownQuery(db, USER, "food", START)).own, true);
    done();
  }
});
