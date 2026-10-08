import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EQUIPMENT, EQUIPMENT_PRESETS, EXERCISE_STATIONS, availableAt, stationLabel, normalizeStations, presetOf, stationsOf } from "../src/gym-equipment.js";
import { EXERCISES, FOCUS_GROUPS, generateStrengthPlan } from "../src/strength-generator.js";
import { EXERCISE_INTELLIGENCE } from "../src/strength-intelligence.js";
import { gymExerciseCatalog, gymAlternatives, equipmentChoices } from "../src/gym-catalog.js";
import { todayGymContext, prepareGymSwap } from "../src/coach-gym-adjustment.js";
import { withLang } from "../src/lang.js";
import { planValues } from "../src/gym-plan-store.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { trainingSetup, updateTrainingSetup, equipmentSetup, completeOnboarding } from "../src/onboarding.js";

test("every catalog exercise can be done with the full equipment list", () => {
  for (const name of Object.keys(EXERCISES)) {
    assert.ok(availableAt(name), name + " has no station");
    assert.ok(EXERCISE_INTELLIGENCE[name], name + " has no load model");
  }
  const ids = new Set(EQUIPMENT.map(e => e.id));
  for (const stations of Object.values(EXERCISE_STATIONS)) for (const id of stations) assert.ok(ids.has(id), id);
  // Every item on the list allows at least one exercise, so no tick is useless.
  for (const id of ids) assert.ok(Object.values(EXERCISE_STATIONS).some(s => s.includes(id)), id + " is used by no exercise");
  for (const group of Object.values(FOCUS_GROUPS)) for (const name of group.exercises) assert.ok(EXERCISES[name], name);
});

test("an exercise needing equipment the athlete lacks is not offered", () => {
  const home = EQUIPMENT_PRESETS.dumbbells;
  assert.equal(availableAt("DB curl", home), true);
  assert.equal(availableAt("Pendulum squat", home), false);
  assert.equal(availableAt("Barbell back squat", new Set(["barbells"])), false);
  assert.equal(availableAt("Barbell back squat"), true);
  assert.equal(stationLabel("Barbell bench press"), "Lavice na benchpress se stojany + Osa s kotouči");
  assert.equal(withLang("en", () => stationLabel("DB bench press")), "Dumbbells + Adjustable bench");
  assert.equal(stationLabel("DB bench press"), "Jednoručky + Polohovací lavice");
  assert.equal(gymExerciseCatalog().length, Object.keys(EXERCISES).length);
  assert.equal(gymExerciseCatalog().find(x => x.name === "Standing multi flight").muscle, "Boční ramena");
  const homeCatalog = gymExerciseCatalog(home).map(x => x.name);
  assert.ok(homeCatalog.includes("Goblet squat") && !homeCatalog.includes("Pec deck") && !homeCatalog.includes("Cable curl"));
  assert.ok(gymAlternatives("DB curl", [], [], home).every(a => availableAt(a.name, home)));
});

test("the tick list keeps known ids in order and names its preset", () => {
  assert.deepEqual(normalizeStations(["cables", "nonsense", "dumbbells", "cables"]), ["dumbbells", "cables"]);
  assert.equal(normalizeStations("gym"), null);
  assert.equal(presetOf(["adjustable_bench", "dumbbells", "floor_mats"]), "dumbbells");
  assert.equal(presetOf(EQUIPMENT_PRESETS.gym), "gym");
  assert.equal(presetOf(["dumbbells", "cables"]), "custom");
  assert.deepEqual([...stationsOf({ equipment: "bodyweight" })], ["floor_mats"]);
  assert.deepEqual([...stationsOf({ equipment: "custom", stations: ["cables"] })], ["cables"]);
  assert.equal(stationsOf(null).size, EQUIPMENT.length);
  const choices = withLang("en", equipmentChoices);
  assert.equal(choices.zones.flatMap(z => z.items).length, EQUIPMENT.length);
  assert.equal(choices.zones[0].label, "Free weights and benches");
  assert.ok(Object.values(choices.exercises).every(ids => ids.length));
});

test("generated workouts use only the ticked equipment", () => {
  const stations = ["floor_mats", "dumbbells", "adjustable_bench", "cables"];
  for (const focusMuscles of [null, ["chest", "lats", "biceps"]]) {
    const context = { date: "2026-10-12", strength: { recentCompletedSets: [] }, cycling: { recentActivities: [], plannedWorkouts: [] }, trainingSetup: { equipment: "custom", stations, experience: "regular" } };
    const plan = generateStrengthPlan(context, { durationMinutes: 60, ...(focusMuscles ? { focusMuscles } : {}) });
    const names = [...new Set(plan.rows.filter(r => r[0] === "WORK").map(r => r[1]))];
    assert.ok(names.length >= 3, names.join());
    for (const name of names) assert.ok(availableAt(name, stations), name);
  }
});

test("the AI coach only swaps to exercises the athlete's equipment allows", () => {
  const gym = { values: planValues({ date: "2026-10-12", rows: [["WORK", "DB curl", "1", "10", "10–12", "", "", "", "FALSE", "", "", "FALSE", ""]] }), history: [], stations: EQUIPMENT_PRESETS.dumbbells };
  const ctx = todayGymContext(gym, "2026-10-12");
  assert.ok(ctx.exercises[0].alternatives.every(a => availableAt(a.name, gym.stations)));
  assert.throws(() => prepareGymSwap(gym, "DB curl", "Cable curl", "x"));
  assert.equal(prepareGymSwap(gym, "DB curl", "Hammer curl", "x").toExercise, "Hammer curl");
});

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function db() { const raw = createD1(); raw.sqlite.exec(schema); return { raw, a: scopedDb(raw, 1), b: scopedDb(raw, 2) }; }

test("saved equipment: ticks win, a gym regular keeps the whole gym, a new athlete is asked", async () => {
  const { raw, a, b } = db();
  // Onboarding stored the old default (bodyweight) for both.
  await completeOnboarding({ DB: a, USER_ID: 1 });await completeOnboarding({ DB: b, USER_ID: 2 });
  raw.sqlite.prepare("INSERT INTO strength_sets(user_id,workout_date,plan_row,type,exercise,source_key) VALUES(1,'2026-10-01',8,'WORK','DB curl','k1')").run();
  const regular = await equipmentSetup(a), fresh = await equipmentSetup(b);
  assert.deepEqual(regular, { stations: EQUIPMENT_PRESETS.gym, equipment: "gym", equipmentChosen: true });
  assert.deepEqual(fresh, { stations: ["floor_mats"], equipment: "bodyweight", equipmentChosen: false });
  const saved = await updateTrainingSetup(b, { stations: ["cables", "dumbbells", "bogus"] });
  assert.deepEqual(saved.stations, ["dumbbells", "cables"]);assert.equal(saved.equipment, "custom");assert.equal(saved.equipmentChosen, true);
  // Other settings keep the ticks; an older app's place choice replaces them.
  assert.deepEqual((await updateTrainingSetup(b, { experience: "regular" })).stations, ["dumbbells", "cables"]);
  assert.deepEqual((await updateTrainingSetup(b, { equipment: "dumbbells" })).stations, EQUIPMENT_PRESETS.dumbbells);
  assert.deepEqual((await trainingSetup(b)).stations, EQUIPMENT_PRESETS.dumbbells);
  assert.deepEqual((await updateTrainingSetup(a, { stations: ["floor_mats"] })).stations, ["floor_mats"]);
});
