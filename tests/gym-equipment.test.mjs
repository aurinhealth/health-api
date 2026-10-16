import test from "node:test";
import assert from "node:assert/strict";
import { METAGYM_KUTNA_HORA, OTHER_STATIONS, OTHER_STATION_IDS, EXERCISE_STATIONS, availableAt, hasKnownStations, stationLabel } from "../src/gym-equipment.js";
import { EXERCISES, FOCUS_GROUPS, generateStrengthPlan } from "../src/strength-generator.js";
import { EXERCISE_INTELLIGENCE, estimateStartingLoad, progressionDecision } from "../src/strength-intelligence.js";
import { gymExerciseCatalog } from "../src/gym-catalog.js";
import { equipmentCatalog } from "../src/gym-equipment-ai.js";
import { TECHNIQUE } from "../src/exercise-technique-data.js";
import { TECHNIQUE_EN } from "../src/exercise-technique-data-en.js";
import { FEEL } from "../src/exercise-feel.js";
import { FEEL_EN } from "../src/exercise-feel-en.js";
import { exerciseMuscles } from "../src/fitness-insights.js";
import { withLang } from "../src/lang.js";

// The exercises for the equipment of other gyms and home gyms (added 2026-10-11).
const OTHER_GYM_EXERCISES = ["Pull-up", "Chin-up", "Assisted pull-up", "Hanging leg raise", "Dips", "Assisted dip", "Kettlebell swing", "EZ bar curl", "EZ bar skull crusher", "Preacher curl", "Band pull-apart", "Hack squat", "Seated leg curl", "Glute kickback machine", "Seated calf raise", "T-bar row", "Chest-supported row", "TRX row", "Barbell incline bench press", "Trap bar deadlift", "Landmine press", "Medicine ball slam", "Box step-up"];

test("every catalog exercise needs only known stations; the original ones are all at METAGYM Kutná Hora", () => {
  assert.equal(METAGYM_KUTNA_HORA.url, "https://metagym.cz/kutnahora");
  for (const name of Object.keys(EXERCISES)) {
    assert.ok(hasKnownStations(name), name + " has an unknown station");
    assert.ok(EXERCISE_INTELLIGENCE[name], name + " has no load model");
    if (!OTHER_GYM_EXERCISES.includes(name)) assert.ok(availableAt(name), name + " has no Kutná Hora station");
  }
  for (const stations of Object.values(EXERCISE_STATIONS)) for (const id of stations) assert.ok(METAGYM_KUTNA_HORA.stations[id] || OTHER_STATIONS[id], id);
  assert.deepEqual(Object.keys(EXERCISE_STATIONS).filter(name => !EXERCISES[name]), []);
  for (const group of Object.values(FOCUS_GROUPS)) for (const name of group.exercises) assert.ok(EXERCISES[name], name);
});

test("other gyms' equipment is listed and its exercises are complete", () => {
  for (const id of ["hack_squat", "seated_leg_curl", "glute_kickback_machine", "assisted_pullup_dip", "t_bar_row", "chest_supported_row", "incline_bench_press", "preacher_bench", "trap_bar", "landmine", "seated_calf_raise", "sled", "plyo_box", "suspension_trainer", "medicine_ball", "battle_ropes", "elliptical", "ski_erg", "air_bike"]) {
    assert.ok(OTHER_STATION_IDS.includes(id), id);
    assert.ok(equipmentCatalog().some(s => s.id === id && s.label && s.group), id);
    assert.equal(METAGYM_KUTNA_HORA.stations[id], undefined, id + " is not a Kutná Hora station");
  }
  assert.equal(new Set(equipmentCatalog().map(s => s.label)).size, equipmentCatalog().length, "every station has its own name");
  for (const id of ["pullup_bar", "dip_bars", "kettlebells", "ez_bar", "resistance_bands"]) assert.ok(Object.values(EXERCISE_STATIONS).some(stations => stations.includes(id)), id + " is used by an exercise");
  for (const name of OTHER_GYM_EXERCISES) {
    assert.ok(EXERCISES[name], name);
    assert.ok(EXERCISE_STATIONS[name]?.some(id => OTHER_STATIONS[id]), name + " needs equipment of other gyms");
    assert.equal(availableAt(name), false, name + " is not at Kutná Hora");
    assert.ok(TECHNIQUE[name]?.steps?.length >= 3 && TECHNIQUE[name].query, name + " technique");
    for (const part of ["setup", "steps", "mistakes"]) assert.equal(TECHNIQUE_EN[name]?.[part]?.length, TECHNIQUE[name][part].length, name + " " + part + " in English");
    assert.equal(FEEL[name]?.length, 2, name + " feel");
    assert.equal(FEEL_EN[name]?.length, 2, name + " feel in English");
    assert.ok(Object.values(FOCUS_GROUPS).some(g => g.exercises.includes(name)), name + " has a muscle group");
    assert.ok(Object.keys(exerciseMuscles(name)).length, name + " loads a muscle");
    assert.ok(stationLabel(name), name + " station name");
  }
  for (const name of OTHER_GYM_EXERCISES) assert.notEqual(withLang("en", () => EXERCISES[name].note), EXERCISES[name].note, name + " has an English note");
  assert.equal(stationLabel("Landmine press"), "Landmine (ukotvení osy) + Stojan na rovné osy + trny na kotouče");
});

test("exercises for other equipment are chosen only when the athlete has it", () => {
  const context = setup => ({ date: "2026-10-11", cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 200 }, strength: { recentCompletedSets: [], plannedSessions: [] }, trainingSetup: setup });
  const names = plan => new Set(plan.rows.map(r => r[1]));
  const others = new Set(OTHER_GYM_EXERCISES);
  // The whole gym (METAGYM Kutná Hora) and no setup at all: never.
  for (const setup of [undefined, { equipment: "gym" }]) for (const focus of [undefined, "upper", "lower"]) {
    const plan = generateStrengthPlan(context(setup), { focus, durationMinutes: 90 });
    assert.deepEqual([...names(plan)].filter(n => others.has(n)), [], String(setup?.equipment) + " " + focus);
  }
  const all = ["lats", "biceps", "triceps", "quads", "hamstrings", "calves", "upper_back", "abs", "hips", "front_delts"];
  for (const group of all) {
    const plan = generateStrengthPlan(context({ equipment: "gym" }), { focusMuscles: [group] });
    assert.ok(availableAt(plan.rows[0][1]), group + ": " + plan.rows[0][1]);
  }
  // A home gym with a pull-up bar, dip bars, an EZ bar and a bench: they come in.
  const home = { equipment: "home", stations: ["pullup_bar", "dip_bars", "ez_bar", "adjustable_bench"] };
  const lats = generateStrengthPlan(context(home), { focusMuscles: ["lats", "triceps", "biceps"] });
  const picked = lats.rows.filter(r => r[0] === "WORK").map(r => r[1]);
  assert.ok(["Pull-up", "Chin-up"].includes(picked[0]), picked[0]);
  assert.ok(["Dips", "EZ bar skull crusher"].includes(picked.find(n => EXERCISES[n].muscle === "triceps")), picked.join());
  assert.equal(picked.find(n => EXERCISES[n].muscle === "biceps"), "EZ bar curl");
  for (const n of names(generateStrengthPlan(context(home), { durationMinutes: 90 }))) assert.ok(EXERCISE_STATIONS[n].every(id => [...home.stations, "floor_mats"].includes(id)), n);
  // Without the station: never (a hack squat machine is not a leg press).
  const legs = generateStrengthPlan(context({ equipment: "custom", stations: ["pivot_leg_press", "prone_leg_curl"] }), { focusMuscles: ["quads", "hamstrings"] });
  assert.deepEqual(legs.rows.filter(r => r[0] === "WORK").map(r => r[1]).filter((n, i, a) => a.indexOf(n) === i), ["Pivot leg press", "Prone leg curl Prime"]);
  const hack = generateStrengthPlan(context({ equipment: "custom", stations: ["hack_squat", "seated_leg_curl"] }), { focusMuscles: ["quads", "hamstrings"] });
  assert.deepEqual(hack.rows.filter(r => r[0] === "WORK").map(r => r[1]).filter((n, i, a) => a.indexOf(n) === i), ["Hack squat", "Seated leg curl"]);
  // The picker lists every exercise with its stations, and which are at Kutná Hora.
  const catalog = gymExerciseCatalog();
  assert.equal(catalog.find(x => x.name === "Pull-up").standardGym, false);
  assert.equal(catalog.find(x => x.name === "Lat pulldown").standardGym, true);
});

test("bodyweight work starts without added weight; an assisted machine progresses by less counterweight", () => {
  assert.equal(estimateStartingLoad({ exercise: "Pull-up", fallbackKg: 0, targetReps: "5–10" }).kg, 0);
  assert.equal(estimateStartingLoad({ exercise: "Push-up", fallbackKg: 0, targetReps: "6–12" }).kg, 0);
  assert.equal(progressionDecision([{ actual_kg: 0, actual_reps: 3, workout_date: "2026-10-01" }], "Pull-up", "5–10").kg, 0, "no negative weight");
  const assisted = reps => progressionDecision([{ actual_kg: 30, actual_reps: reps, rpe: 7, workout_date: "2026-10-01" }], "Assisted pull-up", "6–10");
  assert.deepEqual([assisted(10).decision, assisted(10).kg], ["increase", 25]);
  assert.deepEqual([assisted(3).decision, assisted(3).kg], ["decrease", 35]);
  assert.equal(estimateStartingLoad({ exercise: "Kettlebell swing", fallbackKg: 15, targetReps: "10–15" }).kg, 16);
  // No weight carries over between loads that are not comparable.
  const history = [{ exercise: "Pivot leg press", actual_kg: 150, actual_reps: 10, completed: 1, type: "WORK", workout_date: "2026-10-01" }];
  assert.equal(estimateStartingLoad({ exercise: "Hack squat", history, fallbackKg: 40, targetReps: "8–12" }).source, "catalogue-default");
});

test("an exercise needing equipment the gym lacks is not offered", () => {
  const smallGym = { stations: { dumbbells: { label: "Jednoručky" } } };
  assert.equal(availableAt("DB curl", smallGym), true);
  assert.equal(availableAt("Pendulum squat", smallGym), false);
  assert.equal(availableAt("Barbell back squat", smallGym), false);
  assert.equal(availableAt("Barbell back squat"), true); // squat rack and Smith machine in Kutná Hora
  assert.equal(availableAt("Smith machine hip thrust"), true);
  assert.equal(stationLabel("Barbell bench press"), "Benchpress flat + Stojan na rovné osy + trny na kotouče");
  assert.equal(stationLabel("Pull-up"), "Hrazda");
  const catalog = gymExerciseCatalog();
  assert.equal(catalog.length, Object.keys(EXERCISES).length);
  assert.equal(catalog.find(x => x.name === "Standing multi flight").muscle, "Boční ramena");
});

test("home equipment keeps its stations and the dumbbells there are", async () => {
  const { normalizeTraining } = await import("../src/onboarding.js");
  const t = normalizeTraining({ equipment: "home", stations: ["dumbbells", "adjustable_bench", "nope"], dumbbellWeights: [10, "2,5", 5, 5, 0, 200, 7.5] });
  assert.equal(t.equipment, "home");
  assert.deepEqual(t.stations, ["dumbbells", "adjustable_bench"]);
  assert.deepEqual(t.dumbbellWeights, [5, 7.5, 10]);
  assert.equal(normalizeTraining({ equipment: "home" }).equipment, "dumbbells", "home without stations is dumbbells");
});

test("dumbbell exercises ask for a dumbbell the athlete has", async () => {
  const { snapDumbbells } = await import("../src/strength-generator.js");
  const rows = [["WORK", "DB bench press", "1", "13,5", "8–12"], ["WORK", "Lat pulldown", "1", "42,5", "10"], ["WORK", "DB curl", "1", "9", "10"]];
  snapDumbbells(rows, [6, 8, 10, 12, 14]);
  assert.equal(rows[0][3], "14");
  assert.equal(rows[1][3], "42,5", "machines stay");
  assert.equal(rows[2][3], "8", "between two, the lighter one");
});

test("a prescribed failure set (stored as RPE 10) doesn't take a step back", () => {
  const rows = [{ actual_kg: 40, actual_reps: 12, rpe: 10, note: "[Do selhání]", workout_date: "2026-10-01" }, { actual_kg: 40, actual_reps: 12, rpe: 8, workout_date: "2026-10-01" }];
  assert.equal(progressionDecision(rows, "Leg extension", "10–12").decision, "increase");
  assert.equal(progressionDecision(rows.map(r => ({ ...r, note: "" })), "Leg extension", "10–12").decision, "decrease");
});

test("dumbbells are picked before the note: a step up reaches the next dumbbell, one with none left holds", async () => {
  const { dumbbellFor } = await import("../src/strength-generator.js");
  const have = [10, 15, 20, 25];
  assert.deepEqual([dumbbellFor({ kg: 21, referenceKg: 20, progression: "increase" }, have).kg, dumbbellFor({ kg: 21, referenceKg: 20, progression: "increase" }, have).progression], [25, "increase"]);
  assert.equal(dumbbellFor({ kg: 18.5, referenceKg: 20, progression: "decrease" }, have).kg, 15);
  assert.equal(dumbbellFor({ kg: 21, referenceKg: 20, progression: "hold" }, have).kg, 20);
  const top = dumbbellFor({ kg: 26, referenceKg: 25, progression: "increase" }, have);
  assert.deepEqual([top.kg, top.progression], [25, "hold"]);
  assert.equal(dumbbellFor({ kg: 21, progression: "increase" }, []).kg, 21);
});

test("a machine's weight carries over to no other exercise, and an estimate stays near the catalogue",()=>{
  const press=[{exercise:"Pivot leg press",actual_kg:150,actual_reps:10,rpe:8,completed:1,workout_date:"2026-10-14",type:"WORK",set_no:1}];
  for(const exercise of ["Pendulum squat","Goblet squat","DB Bulgarian split squat"]){
    const e=estimateStartingLoad({exercise,history:press,fallbackKg:20,targetReps:"8–12",today:"2026-10-16"});
    assert.equal(e.source,"catalogue-default",exercise);
    assert.equal(e.kg,20,exercise);
  }
});
