import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlaces, legacyPlaces, mirrorActivePlace, normalizeTraining, updateTrainingSetup, trainingSetup } from "../src/onboarding.js";
import { createD1 } from "./helpers/d1.mjs";

test("each place keeps its own stations; the active one drives the generator's fields", () => {
  const places = [
    { id: "metagym", kind: "gym", name: "METAGYM", stations: ["cables", "hip_thrust", "nonsense"], url: "https://metagym.cz" },
    { id: "doma", kind: "home", name: "Doma", stations: ["dumbbells", "pullup_bar"], dumbbellWeights: [10, 12.5, 12.5] }
  ];
  const home = normalizeTraining(mirrorActivePlace({ places, activePlace: "doma" }));
  assert.equal(home.equipment, "home");
  assert.deepEqual(home.stations, ["dumbbells", "pullup_bar"]);
  assert.deepEqual(home.dumbbellWeights, [10, 12.5]);
  assert.deepEqual(home.places.find(p => p.id === "metagym").stations, ["cables", "hip_thrust"], "switching home keeps the gym's list");
  const gym = normalizeTraining(mirrorActivePlace({ places: home.places, activePlace: "metagym" }));
  assert.equal(gym.equipment, "custom");
  assert.equal(gym.gymName, "METAGYM");
  assert.deepEqual(gym.stations, ["cables", "hip_thrust"]);
  const none = normalizeTraining(mirrorActivePlace({ places: home.places, activePlace: "bodyweight" }));
  assert.equal(none.equipment, "bodyweight");
  assert.equal(none.places.length, 2);
});

test("places are cleaned: ids unique, kinds known, at most ten", () => {
  const out = normalizePlaces([{ id: "a" }, { id: "a", kind: "home" }, { id: "BAD ID" }, ...Array.from({ length: 12 }, () => ({}))]);
  assert.equal(out.length, 10);
  assert.equal(new Set(out.map(p => p.id)).size, 10);
  assert.equal(out[1].kind, "home");
  assert.equal(out[0].name, "Posilovna");
});

test("an account from before places gets its gym as the first place", () => {
  assert.deepEqual(legacyPlaces({ equipment: "bodyweight" }), { places: [], activePlace: "bodyweight" });
  const old = legacyPlaces({ equipment: "custom", stations: ["cables"], gymName: "Fit", gymUrl: "https://fit.cz" });
  assert.equal(old.activePlace, "place-1");
  assert.deepEqual(old.places[0].stations, ["cables"]);
  assert.equal(old.places[0].url, "https://fit.cz");
});

test("saving places and then the flat fields (setup, web) keep both in step", async () => {
  const db = createD1(); db.userId = 1;
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS strength_sets (user_id INTEGER, workout_date TEXT, exercise TEXT, set_number INTEGER, weight_kg REAL, reps INTEGER, rpe REAL, type TEXT)");
  await updateTrainingSetup(db, { places: [{ id: "g", kind: "gym", name: "Gym", stations: ["cables"] }, { id: "h", kind: "home", name: "Doma", stations: ["dumbbells"] }], activePlace: "g" });
  let t = await trainingSetup(db);
  assert.equal(t.activePlace, "g");
  assert.deepEqual(t.stations, ["cables"]);
  // An older client saves the flat list: it lands in the active place only.
  await updateTrainingSetup(db, { equipment: "custom", stations: ["cables", "pec_deck"], gymName: "Gym" });
  t = await trainingSetup(db);
  assert.deepEqual(t.places.find(p => p.id === "g").stations, ["cables", "pec_deck"]);
  assert.deepEqual(t.places.find(p => p.id === "h").stations, ["dumbbells"]);
});
