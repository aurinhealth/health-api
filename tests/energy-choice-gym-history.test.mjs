import test from "node:test";
import assert from "node:assert/strict";
import { applyEnergyChoice, setEnergyChoice, energyChoices } from "../src/activity-energy-choices.js";
import { daySessions, deviceEnergyExtra, buildTraining } from "../src/app-training.js";
import { groupStrengthSessions } from "../src/strength-history.js";

const flagged = () => ({ id: "g1", source: "google-health", type: "WeightTraining", name: "WeightTraining", durationHours: 1.55, calories: 711,
  caloriesForPlanning: 320, energyCheck: { status: "review", reported: 711, estimated: 320, low: 191, high: 636, reason: "x" } });

test("the user's choice for flagged calories: the estimate or the watch's number", () => {
  const keep = applyEnergyChoice(flagged(), "device");
  assert.equal(keep.caloriesForPlanning, 711);
  assert.equal(keep.autoCaloriesForPlanning, 320);
  const count = applyEnergyChoice(flagged(), "estimate");
  assert.equal(count.caloriesForPlanning, 320);
  assert.equal(applyEnergyChoice(flagged(), undefined).energyChoice, undefined, "no choice keeps the automatic one");
  const consistent = { ...flagged(), energyCheck: { status: "consistent" }, caloriesForPlanning: 300 };
  assert.equal(applyEnergyChoice(consistent, "device").caloriesForPlanning, 300, "only a flagged session takes a choice");
});

test("the session carries the choice; the estimate stays the automatic value", () => {
  const { sessions } = daySessions("2026-10-11", "2026-10-11", { completed: [applyEnergyChoice(flagged(), "device")] });
  assert.equal(sessions[0].kcal, 711);
  assert.equal(sessions[0].kcalEstimate.value, 320);
  assert.equal(sessions[0].kcalChoice, "device");
  const none = daySessions("2026-10-11", "2026-10-11", { completed: [flagged()] }).sessions[0];
  assert.equal(none.kcalChoice, undefined);
});

test("counting the estimate takes the watch's extra off the day's active energy", () => {
  assert.equal(deviceEnergyExtra([applyEnergyChoice(flagged(), "estimate")]), 391);
  assert.equal(deviceEnergyExtra([applyEnergyChoice(flagged(), "device")]), 0);
  assert.equal(deviceEnergyExtra([flagged()]), 0, "nothing changes before the user chooses");
  const date = "2026-10-11";
  const t = buildTraining({ date, days: [{ date, daily: { training: { completed: [applyEnergyChoice(flagged(), "estimate")] } } }],
    health: { wellness: [{ id: date, activeCalories: 1231 }] }, fitness: { wellness: [] } });
  assert.equal(t.activeCalories.today, 840);
  assert.equal(t.activeCalories.excluded, 391);
});

test("choices are validated and stored per activity", async () => {
  const rows = new Map();
  const db = { prepare(sql) { return { bind(...args) { return {
    run: async () => { if (/^INSERT/.test(sql)) rows.set(args[1], args[3]); if (/^DELETE/.test(sql)) rows.delete(args[1]); return {}; },
    all: async () => ({ results: [...rows.entries()].filter(([id]) => args.slice(1).includes(id)).map(([activity_id, choice]) => ({ activity_id, choice })) })
  }; }, run: async () => ({}) }; } };
  assert.equal((await setEnergyChoice(db, 1, { activityId: "g1", date: "2026-10-11", choice: "maybe" })).code, 400);
  assert.equal((await setEnergyChoice(db, 1, { activityId: "g1", date: "bad", choice: "device" })).code, 400);
  assert.equal((await setEnergyChoice(db, 1, { activityId: "g1", date: "2026-10-11", choice: "estimate" })).choice, "estimate");
  assert.equal((await energyChoices(db, 1, ["g1", "x"])).get("g1"), "estimate");
  await setEnergyChoice(db, 1, { activityId: "g1", date: "2026-10-11", choice: null });
  assert.equal((await energyChoices(db, 1, ["g1"])).size, 0);
});

test("gym history groups the work sets by exercise and day, newest first", () => {
  const list = groupStrengthSessions([
    { workout_date: "2026-10-05", plan_row: 8, exercise: "Barbell bench press", actual_kg: 80, actual_reps: 8, planned_reps: "8-10" },
    { workout_date: "2026-10-05", plan_row: 9, exercise: "Barbell bench press", actual_kg: 82.5, actual_reps: 6, planned_reps: "6" },
    { workout_date: "2026-10-01", plan_row: 8, exercise: "Barbell bench press", actual_kg: 80, actual_reps: 7, planned_reps: "" },
    { workout_date: "2026-09-28", plan_row: 8, exercise: "Lat pulldown", actual_kg: 60, actual_reps: 10, planned_reps: null }
  ]);
  assert.deepEqual(list.map(e => e.name), ["Barbell bench press", "Lat pulldown"]);
  assert.deepEqual(list[0].sessions.map(s => s.date), ["2026-10-05", "2026-10-01"]);
  assert.deepEqual(list[0].sessions[0].sets[0], { kg: 80, reps: 8, target: 8, rpe: null });
  assert.equal(list[0].sessions[1].sets[0].target, null);
});
