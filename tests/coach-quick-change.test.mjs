// Kratší · Delší · Lehčí · Těžší · Jiný den under the coach's workout card
// (src/coach-quick-change.js): rules only, no AI, no message counted.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { quickSnapshot, quickOptions, quickChange, previewFollows, scaleGymRows, quickMemory, quickEntry } from "../src/coach-quick-change.js";

const today = "2026-10-28"; // Wednesday
const ride = { type: "workout", date: "2026-10-29", sport: "ride", minutes: 60, reason: "r", workoutId: "w1", workoutName: "Sweet spot 3×12", preview: { workout: { primary_system: "sweet_spot" } } };
const context = {
  athleteState: "active",
  availabilityByDate: { "2026-10-29": { minutes: 75 }, "2026-10-30": { minutes: 90 }, "2026-10-31": { minutes: 180 }, "2026-11-01": { minutes: 30 } },
  week: { days: [
    { date: "2026-10-27", completed: [{ name: "VO2max 5×4", type: "Ride" }] },
    { date: "2026-11-02", planned: [{ id: "planned:1", name: "Endurance", type: "Ride" }] }
  ] }
};
const quick = quickSnapshot(context, today);

test("the snapshot keeps each day's free time, hard days and planned rides", () => {
  assert.equal(quick.budget["2026-10-29"], 75);
  assert.equal(quick.budget["2026-11-03"], null);
  assert.deepEqual(quick.hard, ["2026-10-27"]);
  assert.deepEqual(quick.planned, [{ date: "2026-11-02", sport: "ride" }]);
  assert.equal(quick.red, false);
});

test("Kratší takes a quarter off, Delší adds one within the day's free time", () => {
  const short = quickChange(ride, "shorter", quick);
  assert.equal(short.action.minutes, 45);
  assert.equal(short.action.workoutId, "w1");
  assert.match(short.change, /15/);
  const long = quickChange(ride, "longer", quick);
  assert.equal(long.action.minutes, 75);
  assert.equal(quickOptions({ ...ride, minutes: 75 }, quick).longer, false);
  assert.throws(() => quickChange({ ...ride, minutes: 75 }, "longer", quick));
});

test("Lehčí and Těžší move one kind and drop the library workout", () => {
  const easy = quickChange(ride, "easier", quick).action;
  assert.equal(easy.kind, "endurance");
  assert.equal(easy.workoutId, undefined);
  const hard = quickChange(ride, "harder", quick).action;
  assert.equal(hard.kind, "threshold");
  assert.equal(hard.insisted, true);
  assert.equal(quickChange({ ...ride, sport: "run", preview: { workout: { primary_system: "tempo" } } }, "harder", quick).action.kind, "threshold");
});

test("Těžší is grey on a red morning and next to a hard day", () => {
  assert.equal(quickOptions({ ...ride, date: today }, { ...quick, red: true }).harder, false);
  assert.equal(quickOptions({ ...ride, date: "2026-10-28" }, quick).harder, false); // the day after VO2max
  assert.equal(quickOptions(ride, quick).harder, true);
  assert.equal(quickOptions({ ...ride, kind: "vo2max" }, quick).harder, false);
  assert.equal(quickOptions({ ...ride, kind: "recovery" }, quick).easier, false);
});

test("Jiný den greys a day without time, with a ride planned or next to a hard day", () => {
  const days = Object.fromEntries(quickOptions(ride, quick).days.map(d => [d.date, d.fits]));
  assert.equal(days["2026-10-29"], undefined);
  assert.equal(days["2026-10-28"], false); // hard sweet spot the day after VO2max
  assert.equal(days["2026-10-31"], true);
  assert.equal(days["2026-11-01"], false); // 30 min free
  assert.equal(days["2026-11-02"], false); // a ride is planned
  const moved = quickChange(ride, "day", quick, { date: "2026-10-31" });
  assert.equal(moved.action.date, "2026-10-31");
  assert.match(moved.change, /čtvrtka|Thursday/);
  assert.throws(() => quickChange(ride, "day", quick, { date: "2026-11-01" }));
});

test("a paused athlete or a card that isn't a workout gets no choices", () => {
  assert.equal(quickOptions(ride, { ...quick, paused: true }), null);
  assert.equal(quickOptions({ type: "rest" }, quick), null);
});

test("gym: Lehčí and Těžší change the loads on 2.5 kg plates, bodyweight stays", () => {
  const rows = [["WARMUP", "Dřep", 1, 40, "8"], ["WORK", "Dřep", 1, 100, "5"], ["WORK", "Shyby", 1, "", "8"], ["WORK", "Bicepsový zdvih", 1, 12, "10"]];
  const easy = scaleGymRows(rows, -1);
  assert.equal(easy[0][3], 40);
  assert.equal(easy[1][3], 90);
  assert.equal(easy[2][3], "");
  assert.equal(easy[3][3], 11);
  assert.equal(scaleGymRows(rows, 1)[1][3], 105);
  const gym = { type: "workout", date: "2026-10-29", sport: "gym", minutes: 60, reason: "r" };
  assert.equal(quickChange(gym, "easier", quick).action.loadStep, -1);
  assert.throws(() => quickChange({ ...gym, loadStep: -3 }, "easier", quick));
});

test("the rebuilt preview must go the way the choice asked", () => {
  const easy = { ...ride, kind: "endurance", preview: { workout: { primary_system: "endurance" } } };
  assert.equal(previewFollows("easier", ride, easy), true);
  assert.equal(previewFollows("harder", ride, { ...ride, kind: "threshold", preview: { workout: { primary_system: "endurance" } } }), false);
  assert.equal(previewFollows("shorter", ride, ride), true);
});

test("the same choice on three cards is remembered once, weekday and weekend apart", () => {
  const h = [quickEntry("shorter", "2026-10-29", 1), quickEntry("shorter", "2026-10-29", 1), quickEntry("shorter", "2026-10-27", 2)];
  assert.equal(quickMemory("shorter", "2026-10-28", h), null);
  const text = quickMemory("shorter", "2026-10-28", [...h, quickEntry("shorter", "2026-10-28", 3)]);
  assert.match(text, /kratší|shorter/);
  assert.equal(quickMemory("shorter", "2026-10-28", [...h, quickEntry("shorter", "2026-10-28", 3)], [text]), null);
  assert.equal(quickMemory("shorter", "2026-10-31", [...h, quickEntry("shorter", "2026-10-31", 3)]), null);
  assert.equal(quickMemory("day", "2026-10-28", h), null);
});

test("the chat route: adjust is its own decision, not counted, and cards carry their choices", () => {
  const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("async function adjustCoachDraft"), src.indexOf("async function scaledGymPreview"));
  assert.doesNotMatch(fn, /recordCoachMessage|askCoach|callOpenAI/);
  assert.match(src, /body\.decision==='adjust'\)return Response\.json\(await adjustCoachDraft/);
  assert.match(src, /quick:options/);
});
