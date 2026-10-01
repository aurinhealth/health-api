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
  assert.equal(availableAt("Back squat"), false); // no squat rack in Kutná Hora
  assert.equal(stationLabel("Barbell bench press"), "Benchpress flat + Stojan na rovné osy + trny na kotouče");
  const catalog = gymExerciseCatalog();
  assert.equal(catalog.length, Object.keys(EXERCISES).length);
  assert.equal(catalog.find(x => x.name === "Standing multi flight").muscle, "Boční ramena");
});
