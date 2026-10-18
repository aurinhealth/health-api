import test from "node:test";
import assert from "node:assert/strict";
import { METAGYM_KUTNA_HORA, OTHER_STATIONS, STATION_PICKER, STATION_SECTION_IDS, EXERCISE_STATIONS, stationSections } from "../src/gym-equipment.js";
import { equipmentCatalog, GYM_STATION_IDS } from "../src/gym-equipment-ai.js";
import { normalizePlaces } from "../src/onboarding.js";

// Saved in the athletes' places: never renamed or removed.
const STORED_IDS = ["dumbbells", "adjustable_bench", "bench_press", "barbells", "squat_rack", "smith_machine", "floor_mats",
  "pendulum_squat", "hip_thrust", "pivot_leg_press", "leg_extension", "prone_leg_curl", "calf_raise", "adduction_abduction",
  "lat_pulldown_low_row", "standing_row", "shoulder_press", "multi_flight", "pec_deck", "chest_press", "cables", "abs_bench",
  "roman_chair", "treadmill", "stairmaster", "pullup_bar", "dip_bars", "kettlebells", "ez_bar", "incline_bench_press",
  "preacher_bench", "trap_bar", "landmine", "plyo_box", "medicine_ball", "resistance_bands", "suspension_trainer",
  "assisted_pullup_dip", "t_bar_row", "chest_supported_row", "hack_squat", "seated_leg_curl", "glute_kickback_machine",
  "seated_calf_raise", "sled", "battle_ropes", "rowing_ergometer", "ski_erg", "exercise_bike", "air_bike", "elliptical"];

test("the station ids stored in places stay", () => {
  const ids = [...Object.keys(METAGYM_KUTNA_HORA.stations), ...Object.keys(OTHER_STATIONS)];
  for (const id of STORED_IDS) assert.ok(ids.includes(id), id);
  for (const id of STORED_IDS) assert.ok(GYM_STATION_IDS.includes(id), id);
});

test("every station is in at least one known section and has its line", () => {
  for (const id of GYM_STATION_IDS) {
    const entry = STATION_PICKER[id];
    assert.ok(entry, id);
    assert.ok(entry[0].length > 0 && entry[0].every(s => STATION_SECTION_IDS.includes(s)), id);
    assert.ok(entry[1] && entry[2], id);
  }
  for (const id of Object.keys(STATION_PICKER)) assert.ok(GYM_STATION_IDS.includes(id), "no picker entry without a station: " + id);
});

test("every section has stations, and every exercise's stations are in the picker", () => {
  for (const section of STATION_SECTION_IDS) assert.ok(Object.values(STATION_PICKER).some(e => e[0].includes(section)), section);
  for (const [exercise, stations] of Object.entries(EXERCISE_STATIONS)) for (const id of stations) assert.ok(STATION_PICKER[id], exercise + ": " + id);
  assert.deepEqual(stationSections().map(s => s.id), ["chest", "back", "shoulders", "arms", "legs", "core", "free_weights", "accessories", "cables", "cardio"]);
});

test("the equipment catalog adds sections and a line, keeping id, group and label", () => {
  const catalog = equipmentCatalog();
  assert.ok(catalog.every(s => s.id && s.group && s.label && Array.isArray(s.sections) && s.sections.length && s.description));
  assert.deepEqual(catalog.find(s => s.id === "pullup_bar").sections, ["back", "core"]);
  assert.deepEqual(catalog.find(s => s.id === "resistance_bands").sections, ["accessories"]);
  assert.ok(catalog.find(s => s.id === "kettlebells").sections.includes("free_weights"));
});

test("a place keeps its star; places without one are unchanged", () => {
  const [fav, plain] = normalizePlaces([{ id: "a", name: "A", favorite: true }, { id: "b", name: "B", favorite: "yes" }]);
  assert.equal(fav.favorite, true);
  assert.equal("favorite" in plain, false);
});
