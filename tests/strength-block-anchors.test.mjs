import test from "node:test";
import assert from "node:assert/strict";
import { blockAnchors, generateStrengthPlan, EXERCISES } from "../src/strength-generator.js";

const date = "2026-11-20";
const day = n => new Date(Date.parse(date + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const rows = list => list.flatMap(([n, exercise]) => [1, 2, 3].map(set_no => ({ workout_date: day(n), exercise, actual_kg: 40, actual_reps: 8, set_no })));

test("the block's main lift is the one done most in six weeks, at least three times, its variants counted with it", () => {
  const variant = Object.keys(EXERCISES).find(n => EXERCISES[n].variantOf === "DB shoulder press" && EXERCISES[n].warmup);
  const a = blockAnchors(rows([[-20, "Lat pulldown"], [-13, "Lat pulldown"], [-6, "Lat pulldown"], [-9, "Pull-up"], [-30, "Pivot leg press"], [-23, "Pivot leg press"], [-44, "Pendulum squat"], [-50, "Pendulum squat"], [-55, "Pendulum squat"], ...(variant ? [[-22, "DB shoulder press"], [-15, "DB shoulder press"], [-8, variant]] : [])]), date);
  assert.ok(a.has("Lat pulldown"));
  assert.ok(!a.has("Pull-up"), "one lift per pattern");
  assert.ok(!a.has("Pivot leg press") && !a.has("Pendulum squat"), "twice in six weeks is not a block yet");
  if (variant) assert.ok(a.has("DB shoulder press"));
  assert.ok(!a.has("Cable curl"));
});

test("a main lift done three times in the block comes back the next time its pattern is trained, not the pattern's first exercise", () => {
  const history = rows([[-21, "Barbell bench press"], [-14, "Barbell bench press"], [-7, "Barbell bench press"]]).map(r => ({ ...r, actual_reps: r.set_no + 7 }));
  const plan = generateStrengthPlan({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: history, plannedSessions: [] }, athleteState: { status: "active", memories: [] }, trainingSetup: { experience: "regular" }, recovery: {}, checkin: null }, { durationMinutes: 60 });
  const names = plan.rows.filter(r => r[0] === "WORK").map(r => EXERCISES[r[1]]?.variantOf || r[1]);
  assert.ok(names.includes("Barbell bench press"), names.join(", "));
});
