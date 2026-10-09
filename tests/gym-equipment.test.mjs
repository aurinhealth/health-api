import test from "node:test";
import assert from "node:assert/strict";
import { METAGYM_KUTNA_HORA, EXERCISE_STATIONS, availableAt, stationLabel } from "../src/gym-equipment.js";
import { EXERCISES, FOCUS_GROUPS } from "../src/strength-generator.js";
import { EXERCISE_INTELLIGENCE } from "../src/strength-intelligence.js";
import { gymExerciseCatalog } from "../src/gym-catalog.js";

test("every catalog exercise can be done at METAGYM Kutná Hora", () => {
  assert.equal(METAGYM_KUTNA_HORA.url, "https://metagym.cz/kutnahora");
  for (const name of Object.keys(EXERCISES)) {
    assert.ok(availableAt(name), name + " has no Kutná Hora station");
    assert.ok(EXERCISE_INTELLIGENCE[name], name + " has no load model");
  }
  for (const stations of Object.values(EXERCISE_STATIONS)) for (const id of stations) assert.ok(METAGYM_KUTNA_HORA.stations[id], id);
  for (const group of Object.values(FOCUS_GROUPS)) for (const name of group.exercises) assert.ok(EXERCISES[name], name);
});

test("an exercise needing equipment the gym lacks is not offered", () => {
  const smallGym = { stations: { dumbbells: { label: "Jednoručky" } } };
  assert.equal(availableAt("DB curl", smallGym), true);
  assert.equal(availableAt("Pendulum squat", smallGym), false);
  assert.equal(availableAt("Barbell back squat", smallGym), false);
  assert.equal(availableAt("Barbell back squat"), true); // squat rack and Smith machine in Kutná Hora
  assert.equal(availableAt("Smith machine hip thrust"), true);
  assert.equal(stationLabel("Barbell bench press"), "Benchpress flat + Stojan na rovné osy + trny na kotouče");
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
