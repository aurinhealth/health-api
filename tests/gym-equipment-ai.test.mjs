import test from "node:test";
import assert from "node:assert/strict";
import { GYM_STATIONS, equipmentCatalog, parseDetectAnswer } from "../src/gym-equipment-ai.js";
import { normalizeTraining } from "../src/onboarding.js";
import { METAGYM_KUTNA_HORA } from "../src/gym-equipment.js";

test("every gym station has a generic name", () => {
  assert.equal(GYM_STATIONS.length, Object.keys(METAGYM_KUTNA_HORA.stations).length);
  assert.ok(equipmentCatalog().every(s => s.id && s.label && s.group));
});

test("the AI answer keeps only known stations", () => {
  const r = parseDetectAnswer('{"found":true,"gymName":"Fit Box","stations":["cables","dumbbells","laser_cannon","cables"],"note":""}');
  assert.deepEqual(r.stations, ["cables", "dumbbells"]);
  assert.equal(r.found, true);
  assert.equal(parseDetectAnswer('{"found":true,"stations":[]}').found, false, "nothing found is not a gym");
  assert.equal(parseDetectAnswer("no json"), null);
});

test("own stations are saved with the training setup", () => {
  const t = normalizeTraining({ equipment: "custom", stations: ["cables", "nope", "dumbbells"], gymName: " Fit Box ", gymUrl: "javascript:alert(1)" });
  assert.equal(t.equipment, "custom");
  assert.deepEqual(t.stations, ["cables", "dumbbells"]);
  assert.equal(t.gymName, "Fit Box");
  assert.equal(t.gymUrl, "", "only web links");
  assert.equal(normalizeTraining({ equipment: "custom", stations: [] }).equipment, "gym", "custom without stations is the whole gym");
});
