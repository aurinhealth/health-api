import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, FOCUS_GROUPS, variantFor, variantsOf, painfulExercises, generateStrengthPlan } from "../src/strength-generator.js";
import { EXERCISE_INTELLIGENCE, estimateStartingLoad, historyFamily } from "../src/strength-intelligence.js";
import { EXERCISE_STATIONS, OTHER_STATIONS, STATION_PICKER, hasKnownStations } from "../src/gym-equipment.js";
import { TECHNIQUE } from "../src/exercise-technique-data.js";
import { TECHNIQUE_EN } from "../src/exercise-technique-data-en.js";
import { FEEL } from "../src/exercise-feel.js";
import { FEEL_EN } from "../src/exercise-feel-en.js";
import { PHOTO_IDS } from "../src/exercise-photos.js";
import { techniqueFor } from "../src/exercise-technique.js";
import { exerciseMuscles } from "../src/fitness-insights.js";

// Free weights, bands and bodyweight from the MoveKit audit (2026-10-17), part 2.
const ADDED = [
  "Dumbbell Chest Fly", "Dumbbell Incline Chest Fly", "Dumbbell Neutral High Incline Bench Press", "Neutral-Grip Dumbbell Bench Press", "One Arm Dumbbell Bench Press", "Chest-Supported Dumbbell Row", "Dumbbell Back Extension", "Dumbbell Pullover",
  "Cuban Press", "Dumbbell Front Raise", "Dumbbell Incline Front Raise", "Dumbbell Push Press", "Dumbbell Seated Lateral Raises", "Dumbbell Seated Rear Delt Fly", "Dumbbell Upright Row", "Side Plank Lateral Raise",
  "Single-Arm Dumbbell Overhead Press", "Standing Dumbbell Press", "Bayesian Curl", "Close-Grip Push-Up off a Dumbbell", "Cross-Body Hammer Curl", "Dumbbell Concentration Curl", "Dumbbell Preacher Curl", "Dumbbell Skullcrusher",
  "Dumbbell Tricep Kickback", "Zottman Curl", "Dumbbell Cossack Squat", "Dumbbell Cross Body Romanian Deadlift", "Dumbbell Deadlift", "Dumbbell Feet Elevated Glute Bridge", "Dumbbell Front Squat", "Dumbbell Goblet Alternating Curtsy Lunge",
  "Dumbbell Goblet Bulgarian Split Squat", "Dumbbell Goblet Split Squat", "Dumbbell Lateral Lunge", "Dumbbell Overhead Squat", "Dumbbell Single Leg Hip Thrust", "Dumbbell Squat", "Dumbbell Thruster", "Dumbbell Tibialis Raise",
  "Dumbbell Walking Lunges", "Heel Elevated Dumbbell Front Squat", "Dumbbell Russian Twist", "Dumbbell Side Bend", "Dumbbell Single Arm Clean And Press", "Dumbbell Superman", "Dumbbell Windmill", "Bench Dips",
  "Barbell Floor Press", "Barbell Deadlift", "Barbell Pullover", "Barbell Rack Pull", "Pendlay Row", "Seal Row", "Barbell Rear Delt Row", "Barbell Upright Row",
  "Seated Barbell Military Press", "Barbell Curl", "Barbell Drag Curl", "Barbell Skullcrusher", "Reverse Grip Barbell Curl", "Spider Curl", "Barbell Banded Back Squat", "Barbell Glute Bridge",
  "Barbell Split Squat", "Barbell Thruster", "Deficit Deadlift", "Pause Squat", "Sumo Deadlift", "Kettlebell Gorilla Row", "Kettlebell Renegade Rows", "Kettlebell Single Arm Row",
  "Kettlebell Clean & Press (Double)", "Kettlebell Push Press", "One-Arm Kettlebell Military Press To Side", "Two-Arm Kettlebell Military Press", "Kettlebell Goblet Curl", "Kettlebell Romanian Deadlift", "Kettlebell Sumo Deadlift", "Kettlebell Thruster",
  "Kettlebell Windmill", "Turkish Get-Up", "Band Kneeling Pulldown", "Band Pullover", "Band Row", "Band Seated Pulldown", "Band Straight Arm Pulldown", "Band External Rotation",
  "Band High Face Pull", "Band Lateral Raise", "Band Overhead Press", "Band Single Arm Lateral Raise", "Band Curl", "Band Tricep Kickbacks", "Band Glute Bridge", "Band Good Morning",
  "Band Leg Curl", "Band Pull-Through", "Band Romanian Deadlift", "Band Squat", "Banded Eccentric Tibialis Raise", "Band Hip Abduction", "Banded Clamshell", "Plate Front Raise",
  "Wrist Roller", "Plate Forward Lunge", "EZ Bar Reverse Preacher Curl", "Barbell Landmine Row", "Meadows Row", "TRX Squat", "Bodyweight Knee Push Ups", "Decline Push Up",
  "Incline Push Up", "B-stance Back Extension", "Prone Y-T Raises", "Diamond Push Ups", "Bent-Knee Soleus Raise", "Bodyweight Alternating Lateral Lunge", "Bodyweight Box Squat", "Bodyweight Hip Abduction",
  "Bulgarian Split Squat", "Cossack Squat", "Eccentric Calf Lowers", "Fire Hydrants", "Forward Lunge", "Frog Pump", "Front-Foot-Elevated Split Squat", "Nordic Hamstring Curl",
  "Single Leg Glute Bridge", "Single-Leg Step-Down", "Tibialis Raise", "Walking Lunge", "Bicycle Crunches", "Bird Dog", "Crunches", "Decline Sit-Up",
  "Reverse Crunch", "Supermans", "V-Up", "Stability Ball Leg Curl", "Slider Leg Curl", "Barbell Close Grip Bench Press", "Reverse-Grip Barbell Bench Press", "Wide-Grip Barbell Bench Press",
  "Barbell High Incline Bench Press", "Decline Barbell Bench Press", "Dumbbell Decline Bench Press", "Band Assisted Pull-Up", "Neutral-Grip Pull-Up", "Weighted Pull Ups", "Wide-Grip Pull-Up"];
const NEW_STATIONS = ["mini_band", "weight_plates", "gym_ball", "sliders", "decline_bench"];
const PATTERNS = new Set(Object.entries(EXERCISES).filter(([n]) => !ADDED.includes(n)).map(([, d]) => d.pattern));
const MUSCLES = new Set(Object.entries(EXERCISES).filter(([n]) => !ADDED.includes(n)).map(([, d]) => d.muscle));

test("every new free-weight, band and bodyweight exercise is complete", () => {
  assert.equal(ADDED.length, 151);
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
    assert.equal(FEEL[name]?.length, 2, name); assert.equal(FEEL_EN[name]?.length, 2, name);
    if (!def.variantOf) assert.ok(Object.values(FOCUS_GROUPS).some(g => g.exercises.includes(name)), name + " muscle group");
    assert.ok(Object.keys(exerciseMuscles(name)).length, name + " loads a muscle");
  }
  for (const name of Object.keys(PHOTO_IDS)) assert.ok(EXERCISES[name], name + " photo of a catalog exercise");
});

test("library variants point to an existing main exercise and stay out of the pick lists", () => {
  const variants = ADDED.filter(n => EXERCISES[n].variantOf);
  assert.equal(variants.length, 79);
  for (const name of variants) {
    const parent = EXERCISES[name].variantOf;
    assert.ok(EXERCISES[parent] && !EXERCISES[parent].variantOf, name + " → " + parent);
    assert.equal(EXERCISE_INTELLIGENCE[name].variantOf, parent);
    assert.equal(EXERCISES[name].muscle, EXERCISES[parent].muscle, name + " works the parent's muscle");
    assert.ok(variantsOf(parent).includes(name));
    assert.ok(!Object.values(FOCUS_GROUPS).some(g => g.exercises.includes(name)), name + " is reached through its parent");
  }
});

test("new stations have a label, sections and a description", () => {
  for (const id of NEW_STATIONS) {
    assert.ok(OTHER_STATIONS[id]?.label && OTHER_STATIONS[id].en, id);
    const [sections, cs, en] = STATION_PICKER[id];
    assert.ok(sections.length && cs && en, id);
    assert.ok(Object.values(EXERCISE_STATIONS).some(s => s.includes(id)), id + " is used");
  }
});

test("a variant shares weight history only with the same kind of load", () => {
  const row = (exercise, kg) => [1, 2, 3].map(n => ({ exercise, workout_date: "2026-10-10", type: "WORK", completed: 1, actual_kg: kg, actual_reps: 10, rpe: 7, set_no: n }));
  assert.ok(historyFamily("Neutral-Grip Dumbbell Bench Press").includes("DB bench press"));
  const fromParent = estimateStartingLoad({ exercise: "Neutral-Grip Dumbbell Bench Press", history: row("DB bench press", 20), targetReps: "8–12", fallbackKg: 16, today: "2026-10-18" });
  assert.equal(fromParent.source, "own-history");
  // A kettlebell row is not a dumbbell row, and a plate is not a dumbbell.
  assert.ok(!historyFamily("Kettlebell Single Arm Row").includes("One-arm DB row"));
  assert.ok(!historyFamily("Plate Front Raise").includes("Dumbbell Front Raise"));
});

test("the generator keeps one push-up variant for five weeks and never plans two of a family", () => {
  const family = ["Push-up", ...variantsOf("Push-up")];
  assert.ok(family.length >= 4);
  const weeks = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 0, 5 + 7 * i)).toISOString().slice(0, 10));
  const runs = [];
  for (const p of weeks.map(d => variantFor("Push-up", d))) if (runs.length && runs.at(-1).p === p) runs.at(-1).n++; else runs.push({ p, n: 1 });
  for (const r of runs.slice(1, -1)) assert.equal(r.n, 5);
  const plan = generateStrengthPlan({ date: "2026-10-18", cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: [], plannedSessions: [] } }, { focusMuscles: ["chest"], durationMinutes: 60 });
  const names = new Set(plan.rows.filter(r => r[0] === "WORK").map(r => r[1]));
  for (const parent of ["DB bench press", "Barbell bench press", "Push-up"]) assert.ok([...names].filter(n => n === parent || EXERCISES[n].variantOf === parent).length <= 1, [...names].join());
});

test("a sore shoulder leaves out the new overhead and bench presses", () => {
  const avoid = painfulExercises(["Bolí mě rameno"]).avoid;
  for (const name of ["Dumbbell Push Press", "Standing Dumbbell Press", "Seated Barbell Military Press", "Two-Arm Kettlebell Military Press", "Kettlebell Clean & Press (Double)", "Barbell Floor Press", "Decline Barbell Bench Press", "Dumbbell Thruster", "Bench Dips", "Cuban Press"]) assert.ok(avoid.has(name), name);
});

test("every new exercise has a video; photos only from the Free Exercise DB", () => {
  let photos = 0;
  for (const name of ADDED) {
    assert.match(TECHNIQUE[name]?.video?.id || "", /^[A-Za-z0-9_-]{11}$/, name + " video");
    assert.ok(TECHNIQUE[name].video.title, name + " video title");
    const t = techniqueFor(name);
    assert.equal(t.video.id, TECHNIQUE[name].video.id, name);
    assert.equal(t.photos.length, PHOTO_IDS[name] ? 2 : 0, name + " photos");
    if (PHOTO_IDS[name]) photos++;
    for (const url of t.photos) { assert.match(url, /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\//, name); assert.doesNotMatch(url, /ytimg/, name); }
  }
  assert.ok(photos >= 90, String(photos));
});

test("near-variant videos are marked as a similar exercise", () => {
  const SIMILAR = ["Dumbbell Neutral High Incline Bench Press", "One-Arm Kettlebell Military Press To Side", "Banded Eccentric Tibialis Raise", "B-stance Back Extension", "Prone Y-T Raises"];
  for (const name of ADDED) assert.equal(techniqueFor(name).video.similar, SIMILAR.includes(name), name);
});
