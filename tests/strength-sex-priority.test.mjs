import assert from "node:assert/strict";
import test from "node:test";
import { generateStrengthPlan, EXERCISES, FOCUS_GROUPS, startingLoadScale } from "../src/strength-generator.js";
import { availableAt } from "../src/gym-equipment.js";
import { findGymExercises } from "../src/gym-catalog.js";
import { normalizeExerciseName } from "../src/strength-normalization.js";

const context = sex => ({ date: "2026-10-03", profile: { sex }, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 200 }, strength: { recentCompletedSets: [], plannedSessions: [] } });
const work = plan => plan.rows.filter(r => r[0] === "WORK" && r[2] === "1").map(r => r[1]);
const muscles = plan => work(plan).map(ex => EXERCISES[ex].muscle);

test("METAGYM variations: glute work on cables, dumbbells and machines", () => {
  for (const name of ["Cable glute kickback", "Cable pull-through", "Barbell hip thrust", "Leg press high feet", "Abduction machine forward lean", "Cable fly", "DB lateral raise", "Cable triceps kickback"]) {
    assert.ok(EXERCISES[name] && availableAt(name), name);
  }
  assert.ok(FOCUS_GROUPS.hips.exercises.length >= 10);
  assert.ok(findGymExercises("kickback").some(x => x.name === "Cable glute kickback"));
  assert.equal(normalizeExerciseName("cable kickback"), "Cable glute kickback");
  assert.equal(availableAt("Back squat"), false);
});

test("a woman's sessions put glutes first and chest later, without dropping it", () => {
  const full = generateStrengthPlan(context("female"), { durationMinutes: 60 });
  assert.equal(EXERCISES[work(full)[0]].muscle, "glutes");
  assert.ok(!muscles(full).includes("chest"));
  assert.match(full.rationale, /hýždě/);
  const long = generateStrengthPlan(context("female"), { durationMinutes: 90 });
  assert.ok(muscles(long).includes("chest"));
  const lower = generateStrengthPlan(context("female"), { focus: "lower", durationMinutes: 75 });
  assert.ok(muscles(lower).filter(m => m === "glutes").length >= 2);
});

test("a man's sessions keep the chest-first order", () => {
  const upper = generateStrengthPlan(context("male"), { focus: "upper", durationMinutes: 60 });
  assert.equal(EXERCISES[work(upper)[0]].muscle, "chest");
  assert.doesNotMatch(upper.rationale, /profil: žena/);
});

test("one session does not repeat the same movement on two stations", () => {
  const lower = generateStrengthPlan(context("female"), { focus: "lower", durationMinutes: 90 });
  const thrusts = work(lower).filter(ex => EXERCISES[ex].pattern === "hip_extension");
  assert.equal(thrusts.length, 1);
});

test("without history a woman starts lighter than the catalogue default", () => {
  assert.equal(startingLoadScale("chest", "male"), 1);
  assert.ok(startingLoadScale("chest", "female") < startingLoadScale("quads", "female"));
  const kg = sex => {
    const plan = generateStrengthPlan(context(sex), { focus: "upper", durationMinutes: 60 });
    return Number(plan.rows.find(r => r[0] === "WORK" && r[1] === "Low row")[3].replace(",", "."));
  };
  assert.ok(kg("female") < kg("male"));
});
