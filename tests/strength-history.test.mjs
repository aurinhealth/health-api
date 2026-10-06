import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { ensureStrengthTable, importStrengthHistory, syncStrengthPlan, resolveStrengthPerformance } from "../src/strength-history.js";
import { completedRowsAreSynced } from "../src/strength-sync-guard.js";

const date = "2026-10-02";
const columns = ["Typ", "Cvik", "Série", "Plán kg", "Plán reps", "Skutečně kg", "Skutečně reps", "RPE", "Hotovo", "Poznámka", "Video"];
const sets = [
  { exercise: "DB curl", setNo: 1, plannedKg: "12,5", plannedReps: " 10 ", actualKg: null, actualReps: null },
  { exercise: "DB curl", setNo: 2, plannedKg: 12.5, plannedReps: "8–12", actualKg: "", actualReps: "" },
  { exercise: "DB curl", setNo: 3, plannedKg: 12.5, plannedReps: "10", actualKg: 15, actualReps: 9 },
  { exercise: "DB curl", setNo: 4, plannedKg: 12.5, plannedReps: "10", actualKg: 0, actualReps: 0 },
  { exercise: "DB curl", setNo: 5, plannedKg: 0, plannedReps: "12", actualKg: " ", actualReps: " " }
];

test("only a single positive integer target supplies missing actual reps", () => {
  for (const plannedReps of ["8–12", "8-12", "AMRAP", "30 s", "10.5", "10.0", "1e1", "", null, "0", "-5"])
    assert.equal(resolveStrengthPerformance({ plannedReps }).actualReps, null);
  assert.deepEqual(resolveStrengthPerformance({ plannedKg: null, plannedReps: "10" }), { actualKg: null, actualReps: 10 });
});

test("manual imports persist planned performance and preserve explicit actuals on repeated saves", async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  try {
    for (let i = 0; i < 2; i++) await importStrengthHistory(db, { date, sets });
    const rows = (await db.prepare("SELECT actual_kg, actual_reps FROM strength_sets WHERE user_id=? ORDER BY plan_row").bind(1).all()).results;
    assert.deepEqual(rows, [
      { actual_kg: 12.5, actual_reps: 10 }, { actual_kg: 12.5, actual_reps: null },
      { actual_kg: 15, actual_reps: 9 }, { actual_kg: 0, actual_reps: 0 }, { actual_kg: 0, actual_reps: 12 }
    ]);
  } finally { raw.sqlite.close(); }
});

test("sheet synchronization resolves completed sets and leaves incomplete sets blank", async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  try {
    const values = [["Datum", date], columns,
      ...sets.map(s => ["WORK", s.exercise, s.setNo, s.plannedKg, s.plannedReps, s.actualKg, s.actualReps, "", true]),
      ["WARMUP", "DB curl", 1, 5, "12", "", "", "", false]
    ];
    await syncStrengthPlan(db, values);
    const rows = (await db.prepare("SELECT actual_kg, actual_reps FROM strength_sets WHERE user_id=? ORDER BY plan_row").bind(1).all()).results;
    assert.deepEqual(rows[0], { actual_kg: 12.5, actual_reps: 10 });
    assert.deepEqual(rows[1], { actual_kg: 12.5, actual_reps: null });
    assert.deepEqual(rows[3], { actual_kg: 0, actual_reps: 0 });
    assert.deepEqual(rows[5], { actual_kg: null, actual_reps: null });
  } finally { raw.sqlite.close(); }
});

test("sync guard compares blank entries with their persisted performance", () => {
  const sheet = { planRow: 8, type: "WORK", exercise: "DB curl", setNo: 1, plannedKg: 10, plannedReps: "12", actualKg: null, actualReps: null, rpe: null };
  const stored = { plan_row: 8, type: "WORK", exercise: "DB curl", set_no: 1, planned_kg: 10, planned_reps: "12", actual_kg: 10, actual_reps: 12, rpe: null, completed: 1 };
  assert.equal(completedRowsAreSynced([sheet], [stored]), true);
  assert.equal(completedRowsAreSynced([sheet], [{ ...stored, actual_kg: null }]), false);
});

test("one-time repair is limited to the owner's completed workout and preserves explicit performance", async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  try {
    await ensureStrengthTable(db);
    raw.sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT); INSERT INTO users VALUES (1, 'chelseafc.czsk@gmail.com'), (2, 'other@example.com')");
    const insert = raw.sqlite.prepare("INSERT INTO strength_sets(user_id,workout_date,plan_row,type,exercise,planned_kg,planned_reps,actual_kg,actual_reps,completed,source_key) VALUES (?,?,?,?, 'DB curl', 12.5,?,?,?,?,?)");
    for (const [i, args] of [
      [1, date, "WORK", "10", null, null, 1],
      [1, date, "WARMUP", "12", null, null, 1],
      [1, date, "WORK", "8–12", null, null, 1],
      [1, date, "WORK", "10", 15, 9, 1],
      [1, date, "WORK", "10", 0, 0, 1],
      [1, date, "WORK", "10", null, null, 0],
      [1, "2026-10-01", "WORK", "10", null, null, 1],
      [2, date, "WORK", "10", null, null, 1],
      [1, date, "WORK", "30 s", null, null, 1]
    ].entries()) {
      const [user, day, type, reps, kg, actualReps, done] = args;
      insert.run(user, day, i + 1, type, reps, kg, actualReps, done, `test:${i}`);
    }
    const sql = fs.readFileSync(new URL("../migrations/0004_backfill_completed_strength_20261002.sql", import.meta.url), "utf8");
    raw.sqlite.exec(sql);
    assert.equal(raw.sqlite.prepare("SELECT changes() AS count").get().count, 4);
    const rows = raw.sqlite.prepare("SELECT actual_kg, actual_reps FROM strength_sets ORDER BY id").all().map(r => ({ ...r }));
    assert.deepEqual(rows, [
      { actual_kg: 12.5, actual_reps: 10 }, { actual_kg: 12.5, actual_reps: 12 }, { actual_kg: 12.5, actual_reps: null },
      { actual_kg: 15, actual_reps: 9 }, { actual_kg: 0, actual_reps: 0 },
      { actual_kg: null, actual_reps: null }, { actual_kg: null, actual_reps: null }, { actual_kg: null, actual_reps: null },
      { actual_kg: 12.5, actual_reps: null }
    ]);
    raw.sqlite.exec(sql);
    assert.equal(raw.sqlite.prepare("SELECT changes() AS count").get().count, 0);
  } finally { raw.sqlite.close(); }
});

test('a saved set taken out of the day leaves the history too', async () => {
  const { getStrengthHistory, removeManualSets } = await import('../src/strength-history.js');
  const db = scopedDb(createD1(), 1);
  const set = (exercise, kg) => ({ type: 'WORK', exercise, actualKg: kg, actualReps: 8, completed: true });
  await importStrengthHistory(db, { date: '2026-10-04', sets: [set('Lat pulldown', 50), set('Lat pulldown', 50), set('Low row', 40)] });
  await importStrengthHistory(db, { date: '2026-10-03', sets: [set('Lat pulldown', 47.5)] });
  // The day saved again without the second pulldown set.
  await importStrengthHistory(db, { date: '2026-10-04', sets: [set('Lat pulldown', 50), set('Low row', 40)] });
  assert.equal(await removeManualSets(db, '2026-10-04', 2, 3), 1);
  const rows = await getStrengthHistory(db);
  assert.deepEqual(rows.filter(r => r.workout_date === '2026-10-04').map(r => r.exercise + ':' + r.actual_kg), ['Lat pulldown:50', 'Low row:40']);
  assert.equal(rows.filter(r => r.workout_date === '2026-10-03').length, 1);
  const entry = fs.readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(entry, /const before = storedPlan\.stored \? completedSets\(storedPlan\.values\.slice\(7\)\)\.length : 0;\s*if\(before>sets\.length\) await removeManualSets\(env\.DB,date,sets\.length,before\);/);
});
