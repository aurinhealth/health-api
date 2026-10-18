import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, FOCUS_GROUPS, variantFor, variantsOf, generateStrengthPlan } from "../src/strength-generator.js";
import { EXERCISE_INTELLIGENCE, estimateStartingLoad, historyFamily } from "../src/strength-intelligence.js";
import { EXERCISE_STATIONS, OTHER_STATIONS, STATION_PICKER, hasKnownStations } from "../src/gym-equipment.js";
import { TECHNIQUE } from "../src/exercise-technique-data.js";
import { TECHNIQUE_EN } from "../src/exercise-technique-data-en.js";
import { FEEL } from "../src/exercise-feel.js";
import { FEEL_EN } from "../src/exercise-feel-en.js";
import { PHOTO_IDS } from "../src/exercise-photos.js";
import { techniqueFor } from "../src/exercise-technique.js";

// Machines and cables from the MoveKit audit (2026-10-17), part 1.
const ADDED = ["Smith Machine Bench Press", "Smith Machine Decline Bench Press", "Inverted Row", "Smith Machine Bent-Over Row", "Smith Machine Overhead Press", "Smith Machine Seated Overhead Press", "Smith Machine Close Grip Bench Press", "Smith Machine Front Squat", "Smith Machine Sumo Romanian Deadlift", "Smith Machine Calf Raise",
  "Cable Bench Chest Fly", "Cable Bench Press", "Cable Chest Press", "Cable Decline Bench Press", "Cable High-to-Low Fly", "Cable Incline Bench Press", "Cable Standing Single Arm Chest Press", "Single-Arm Cable Fly",
  "Cable Row Bar Standing Row", "Cable Supinating Row", "Straight-Arm Lat Pulldown", "Straight Arm Rope Pulldown (Light)", "Cable External Rotation", "Cable Front Raise", "Cable Overhead Press", "Cable Single Arm Rear Delt Row", "Leaning Cable Lateral Raise",
  "Cable Bar Pushdown", "Cable Overhead Straight Bar Extensions", "Cross-Body Cable Tricep Extension", "Reverse-Grip Tricep Pushdown", "Single-Arm Overhead Cable Extension", "Cable Side Bend",
  "Cable Single Arm Rope Pushdown", "Machine Cable V Bar Push Downs", "Cable Standing Low To High Wood Chopper", "Cable Bench Straight Leg Kickback", "Cable 30 Degree Shrug", "Cable Wrist Curl", "Cable Bar Face Pull", "Cable Rope Kneeling Face Pull", "Cable Seated Rope Face Pull", "Cable Single Leg Laying Leg Curl", "Cable Single Arm Underhand Grip Row", "Straight Bar Bench Mid Rows",
  "Decline Machine Chest Press", "Incline Machine Chest Press", "Neutral-Grip Lat Pulldown", "Single-Arm Lat Pulldown", "Wide-Grip Lat Pulldown", "Calf Press", "Single-Leg Press", "Reverse Hack Squat",
  "Machine Underhand Row", "Hammer Strength High Row", "Hammer Strength Iso-Lateral Row", "Machine Lat Pullover", "Machine Back Extension", "Reverse Hyperextension", "Machine Preacher Curl", "Machine Tricep Extension", "Belt Squat", "Machine Crunch", "Captain's Chair Knee Raise", "Selectorized Torso Rotation Machine"];
const NEW_STATIONS = ["plate_loaded_row", "pullover_machine", "back_extension_machine", "reverse_hyper", "biceps_curl_machine", "triceps_machine", "belt_squat", "ab_crunch_machine", "captains_chair", "torso_rotation_machine", "incline_chest_press_machine", "decline_chest_press_machine"];
// The catalog before these were added: names stay, so stored history keeps its exercise.
const EXISTING = ["Dead bug", "Push-up", "DB bench press", "Low row", "Pivot leg press", "Lat pulldown", "Cable triceps extension", "Face pull", "Single-arm cable row", "Standing calf raise", "DB shrug", "Prone leg curl Prime", "Cable woodchop", "Cable glute kickback", "DB wrist curl", "Box step-up"];
const PATTERNS = new Set(Object.entries(EXERCISES).filter(([n]) => !ADDED.includes(n)).map(([, d]) => d.pattern));
const MUSCLES = new Set(Object.entries(EXERCISES).filter(([n]) => !ADDED.includes(n)).map(([, d]) => d.muscle));

test("every new machine and cable exercise is complete", () => {
  assert.equal(new Set(ADDED).size, ADDED.length);
  const lower = Object.keys(EXERCISES).map(n => n.toLowerCase());
  assert.equal(new Set(lower).size, lower.length, "no two exercises with the same name");
  for (const name of ADDED) {
    const def = EXERCISES[name];
    assert.ok(def, name);
    assert.ok(PATTERNS.has(def.pattern), name + " pattern " + def.pattern);
    assert.ok(MUSCLES.has(def.muscle), name + " muscle " + def.muscle);
    assert.ok(def.sets > 0 && /^\d+–\d+$/.test(def.reps) && Number.isFinite(def.fatigue) && (def.baseKg == null || def.baseKg >= 0), name);
    assert.ok(EXERCISE_INTELLIGENCE[name], name + " load model");
    assert.ok(EXERCISE_STATIONS[name]?.length && hasKnownStations(name), name + " station");
    const cs = TECHNIQUE[name], en = TECHNIQUE_EN[name];
    assert.ok(cs?.setup?.length && cs.steps.length >= 3 && cs.mistakes.length && cs.breathing && cs.query, name + " technique");
    for (const part of ["setup", "steps", "mistakes"]) assert.equal(en?.[part]?.length, cs[part].length, name + " " + part + " in English");
    assert.ok(en.breathing, name + " breathing in English");
    if (cs.video) assert.match(cs.video.id, /^[A-Za-z0-9_-]{11}$/);
    assert.equal(FEEL[name]?.length, 2, name); assert.equal(FEEL_EN[name]?.length, 2, name);
    if (!def.variantOf) assert.ok(Object.values(FOCUS_GROUPS).some(g => g.exercises.includes(name)), name + " muscle group");
  }
  for (const name of Object.keys(PHOTO_IDS)) assert.ok(EXERCISES[name], name + " photo of a catalog exercise");
});

test("variants point to an existing main exercise and stay out of the pick lists", () => {
  const variants = ADDED.filter(n => EXERCISES[n].variantOf);
  assert.equal(variants.length, 17);
  for (const name of variants) {
    const parent = EXERCISES[name].variantOf;
    assert.ok(EXERCISES[parent] && !EXERCISES[parent].variantOf, name + " → " + parent);
    assert.equal(EXERCISE_INTELLIGENCE[name].variantOf, parent);
    assert.equal(EXERCISES[name].muscle, EXERCISES[parent].muscle, name + " works the parent's muscle");
    assert.ok(variantsOf(parent).includes(name));
    assert.ok(!Object.values(FOCUS_GROUPS).some(g => g.exercises.includes(name)), name + " is reached through its parent");
  }
});

test("existing exercises and station ids are unchanged", () => {
  for (const name of EXISTING) { assert.ok(EXERCISES[name], name); assert.equal(EXERCISES[name].variantOf, undefined, name); }
  for (const name of ["Incline Machine Chest Press", "Decline Machine Chest Press"]) assert.ok(!EXERCISE_STATIONS[name].includes("chest_press"), name + " is not on the flat chest press");
  for (const id of NEW_STATIONS) { assert.ok(OTHER_STATIONS[id]?.label && OTHER_STATIONS[id].en, id); assert.ok(STATION_PICKER[id], id); }
});

test("a variant shares the weight history of its main exercise", () => {
  const row = (exercise, kg) => [1, 2, 3].map(n => ({ exercise, workout_date: "2026-10-10", type: "WORK", completed: 1, actual_kg: kg, actual_reps: 12, rpe: 7, set_no: n }));
  assert.deepEqual(historyFamily("Cable Bar Face Pull").sort(), ["Cable Bar Face Pull", "Cable Rope Kneeling Face Pull", "Cable Seated Rope Face Pull", "Face pull"].sort());
  const fromParent = estimateStartingLoad({ exercise: "Cable Bar Face Pull", history: row("Face pull", 20), targetReps: "12–15", fallbackKg: 20, today: "2026-10-17" });
  assert.equal(fromParent.source, "own-history");
  const fromVariant = estimateStartingLoad({ exercise: "Face pull", history: row("Cable Rope Kneeling Face Pull", 15), targetReps: "12–15", fallbackKg: 20, today: "2026-10-17" });
  assert.equal(fromVariant.source, "own-history");
  // Another way of measuring the load is not one history (a cable shrug is no dumbbell shrug).
  assert.deepEqual(historyFamily("Cable 30 Degree Shrug"), ["Cable 30 Degree Shrug"]);
});

test("the generator keeps one variant for five weeks, then moves on", () => {
  const family = ["Face pull", ...variantsOf("Face pull")];
  const weeks = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10));
  const picks = weeks.map(d => variantFor("Face pull", d));
  for (const p of picks) assert.ok(family.includes(p));
  const runs = [];
  for (const p of picks) if (runs.length && runs.at(-1).p === p) runs.at(-1).n++; else runs.push({ p, n: 1 });
  for (const r of runs.slice(1, -1)) assert.equal(r.n, 5, "a variant stays five weeks");
  assert.ok(new Set(picks).size > 1, "variants take turns");
  assert.equal(variantFor("Face pull", "2026-10-18", () => false), "Face pull", "a variant that does not fit is skipped");
  assert.equal(variantFor("Lat pulldown", "2026-10-18"), "Lat pulldown");
  // In a plan the variant replaces its main exercise; never both.
  const plan = generateStrengthPlan({ date: "2026-10-18", cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: [], plannedSessions: [] } }, { focusMuscles: ["rear_delts"], durationMinutes: 60 });
  const names = new Set(plan.rows.filter(r => r[0] === "WORK").map(r => r[1]));
  assert.ok([...names].filter(n => family.includes(n)).length <= 1, [...names].join());
});

test("every new machine and cable exercise has a video; photos only from the Free Exercise DB", () => {
  for (const name of ADDED) {
    assert.match(TECHNIQUE[name]?.video?.id || "", /^[A-Za-z0-9_-]{11}$/, name + " video");
    assert.ok(TECHNIQUE[name].video.title, name + " video title");
    const t = techniqueFor(name);
    assert.equal(t.video.id, TECHNIQUE[name].video.id, name);
    assert.equal(t.photos.length, PHOTO_IDS[name] ? 2 : 0, name + " photos");
    for (const url of t.photos) { assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\//, name); assert.doesNotMatch(url, /ytimg/, name); }
  }
});

test("near-variant videos are marked as a similar exercise", () => {
  const SIMILAR = ["Cable 30 Degree Shrug", "Smith Machine Sumo Romanian Deadlift", "Straight Bar Bench Mid Rows", "Machine Underhand Row", "Cable Single Leg Laying Leg Curl", "Cable Supinating Row"];
  for (const name of ADDED) assert.equal(techniqueFor(name).video.similar, SIMILAR.includes(name), name);
});
