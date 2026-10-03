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
  assert.equal(normalizeExerciseName("back squat"), "Barbell back squat");
});

test("sex does not reorder muscle groups: the same session structure for everyone", () => {
  for (const focus of [undefined, "upper", "lower"]) {
    const male = generateStrengthPlan(context("male"), { focus, durationMinutes: 75 });
    const female = generateStrengthPlan(context("female"), { focus, durationMinutes: 75 });
    assert.equal(work(female).length, work(male).length, String(focus));
    assert.ok(muscles(female).includes(focus === "lower" ? "quads" : "chest"), String(focus));
  }
  assert.ok(muscles(generateStrengthPlan(context("female"), { durationMinutes: 75 })).includes("chest"));
});

test("for a woman a close call between variants leans to the glute-biased one", () => {
  const male = work(generateStrengthPlan(context("male"), { durationMinutes: 75 }));
  const female = work(generateStrengthPlan(context("female"), { durationMinutes: 75 }));
  assert.ok(male.includes("DB Romanian deadlift") && female.includes("Hip thrust"));
  assert.match(generateStrengthPlan(context("female"), {}).rationale, /zohledňují profil \(žena\)/);
  assert.doesNotMatch(generateStrengthPlan(context("male"), {}).rationale, /profil/);
});

test("one session does not repeat the same movement on two stations", () => {
  for (const sex of ["male", "female"]) {
    const lower = generateStrengthPlan(context(sex), { focus: "lower", durationMinutes: 90 });
    assert.ok(work(lower).filter(ex => EXERCISES[ex].pattern === "hip_extension").length <= 1, sex);
  }
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
