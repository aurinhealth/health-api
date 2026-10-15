import test from "node:test";
import assert from "node:assert/strict";
import { muscleDetail } from "../src/muscle-detail.js";
import { muscleFatigue, muscleGroups, readyToday, recommendation } from "../src/muscle-fatigue.js";

const today = "2026-10-15"; // a Thursday
const set = (date, exercise, kg, reps) => ({ workout_date: date, exercise, actual_kg: kg, actual_reps: reps, rpe: 8, updated_at: date + " 17:00:00" });

test("the muscle's main exercise shows whether it is getting stronger", () => {
  const sets = [
    set("2026-08-25", "Barbell back squat", 80, 5), set("2026-08-25", "Barbell back squat", 85, 5),
    set("2026-09-15", "Barbell back squat", 90, 5),
    set("2026-10-14", "Barbell back squat", 95, 5), set("2026-10-14", "Leg extension Prime", 50, 12),
    set("2026-10-14", "DB bench press", 30, 10)
  ];
  const r = muscleDetail({ sets, muscle: "quads", today });
  assert.equal(r.strength.exercise, "Barbell back squat");
  assert.deepEqual(r.strength.points.map(p => p.week), ["2026-08-24", "2026-09-14", "2026-10-12"]);
  // 85×5 → 99.2 kg, 95×5 → 110.8 kg.
  assert.equal(r.strength.points[0].kg, 99.2);
  assert.equal(r.strength.change, 0.117);
  assert.equal(r.best.exercise, "Barbell back squat");
  assert.equal(r.best.kg, 95);
  // The last exercises for the thighs, not the chest.
  assert.deepEqual(r.recent.slice(0, 2).map(x => x.exercise).sort(), ["Barbell back squat", "Leg extension Prime"]);
  assert.equal(r.recent.length, 3);
  assert.equal(r.recent[0].day, "včera");
});

test("how often: the days of the last 4 weeks and the average per finished week", () => {
  const sets = [
    set("2026-09-21", "Barbell back squat", 80, 5), set("2026-09-25", "Barbell back squat", 80, 5),
    set("2026-10-01", "Barbell back squat", 80, 5),
    set("2026-10-06", "Barbell back squat", 80, 5), set("2026-10-11", "Barbell back squat", 80, 5),
    set("2026-10-14", "Barbell back squat", 80, 5),
    // Half a set's worth for the thighs is not a day of training.
    set("2026-10-03", "DB Romanian deadlift", 20, 10)
  ];
  const r = muscleDetail({ sets, muscle: "quads", today });
  assert.equal(r.calendar.from, "2026-09-21");
  assert.deepEqual(r.calendar.days, ["2026-09-21", "2026-09-25", "2026-10-01", "2026-10-06", "2026-10-11", "2026-10-14"]);
  assert.deepEqual(r.calendar.weeks.map(w => w.times), [2, 1, 2, 1]);
  assert.equal(r.calendar.perWeek, 1.7);
  assert.equal(r.calendar.thisWeek, 1);
  assert.equal(r.calendar.target, 2);
});

test("no sets: nothing to show, no crash", () => {
  const r = muscleDetail({ sets: [], muscle: "chest", today });
  assert.equal(r.strength, null);
  assert.equal(r.best, null);
  assert.deepEqual(r.recent, []);
  assert.equal(r.calendar.perWeek, 0);
});

test("body parts: as rested as their most tired muscle, what today is good for", () => {
  const now = Date.parse("2026-10-15T08:00:00Z");
  const legDay = Array.from({ length: 5 }, () => set("2026-10-14", "Barbell back squat", 90, 5));
  const r = muscleFatigue({ sets: legDay, history: [...legDay, set("2026-10-08", "Low row", 50, 10)], now, today });
  const legs = r.groups.find(g => g.id === "legs"), back = r.groups.find(g => g.id === "back");
  assert.equal(legs.state, "fatigued");
  assert.ok(legs.percent < 60 && legs.readyDate > today, JSON.stringify(legs));
  assert.equal(legs.thisWeek, 1);
  assert.equal(back.percent, 100);
  assert.equal(back.daysSince, 7);
  assert.equal(back.thisWeek, 0);
  assert.equal(r.readyToday, "upper");
  assert.deepEqual(r.lastGym, { part: "nohy", day: "včera" });
  // The rested part trained longest ago (never) comes first.
  assert.equal(r.recommend.group, "chest");
  assert.equal(r.groups.filter(g => g.ring).length, 6);
});

test("readyToday and the suggestion cover all cases", () => {
  const g = (id, state, lower = false, daysSince = 3) => ({ id, label: id, ring: true, lower, state, daysSince });
  const upper = ["back", "chest", "shoulders", "arms"];
  assert.equal(readyToday([g("legs", "rested", true), g("glutes", "rested", true), ...upper.map(id => g(id, "rested"))]), "full");
  assert.equal(readyToday([g("legs", "rested", true), g("glutes", "rested", true), ...upper.map(id => g(id, "fatigued"))]), "lower");
  assert.equal(readyToday([g("legs", "recovering", true), g("glutes", "rested", true), g("back", "fatigued")]), "none");
  assert.equal(readyToday([g("legs", "fatigued", true), { ...g("back", "recovering"), readyDate: today }], today), "upper");
  assert.equal(recommendation([g("legs", "fatigued", true)], today), null);
  assert.equal(recommendation([g("back", "rested", false, 2), g("chest", "rested", false, 5)], today).group, "chest");
  assert.equal(muscleGroups({ muscles: [], today }).every(x => x.percent === 100), true);
});
