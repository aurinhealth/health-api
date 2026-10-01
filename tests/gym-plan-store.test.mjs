import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { readGymPlan, writeStrengthPlanToDb, syncGymPlanHistory, planValues } from "../src/gym-plan-store.js";
import { parseStrengthSheet, importStrengthHistory, getStrengthHistory } from "../src/strength-history.js";

const plan = { date: "2026-10-01", planName: "Horní tělo", rationale: "Kolo zítra", loadFactor: 0.95, rows: [
  ["WARMUP", "Bench press", "1", "40", "8", "", "", "", "FALSE", "[WARMUP]", "🎥 Video"],
  ["WORK", "Bench press", "1", "60", "8", "", "", "", "FALSE", "", ""],
  ["WORK", "Bench press", "2", "60", "8", "", "", "", "FALSE", "", '=HYPERLINK("https://example.com/v";"🎥 Video")']
] };

test("a generated plan is stored in D1 and reads back in the dashboard layout", async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  const empty = await readGymPlan(db, "2026-10-01");
  assert.equal(empty.stored, false);
  assert.equal(parseStrengthSheet(empty.values).rows.length, 0);
  const r = await writeStrengthPlanToDb(db, plan);
  assert.deepEqual([r.status, r.storage, r.rowsWritten], ["ok", "d1", 3]);
  const back = await readGymPlan(db, "2026-10-01");
  assert.equal(back.stored, true);
  assert.equal(back.values[2][1], "2026-10-01");
  const parsed = parseStrengthSheet(back.values);
  assert.equal(parsed.date, "2026-10-01");
  assert.equal(parsed.rows.length, 3);
  assert.match(back.values[7][10], /^https:\/\/www\.youtube\.com\/results/);
  assert.equal(back.values[9][10], "https://example.com/v");
  // Plans are per user.
  assert.equal((await readGymPlan(scopedDb(raw, 2), "2026-10-01")).stored, false);
});

test("completed sets reach the history once, with the dashboard's keys", async () => {
  const db = scopedDb(createD1(), 1);
  const values = planValues(plan);
  values[8][5] = "62,5"; values[8][6] = "8"; values[8][8] = "TRUE";
  await syncGymPlanHistory(db, values);
  // The dashboard saves the same completed set again: still one history row.
  await importStrengthHistory(db, { date: "2026-10-01", sets: [{ type: "WORK", exercise: "Bench press", setNo: 1, plannedKg: 60, plannedReps: "8", actualKg: 62.5, actualReps: 8, completed: true }] });
  await syncGymPlanHistory(db, values);
  const history = await getStrengthHistory(db, 50);
  assert.equal(history.length, 1);
  assert.equal(Number(history[0].actual_kg), 62.5);
});
