import test from "node:test";
import assert from "node:assert/strict";
import { fitWorkoutFile, fitSteps, fitCrc } from "../src/fit-workout.js";
import { zwoFile } from "../src/endurance-templates.js";

const ride = { sport: "ride", name: "Sweet spot 3×10", blocks: [
  { repeats: 1, steps: [{ seconds: 600, low: 50, high: 60 }] },
  { repeats: 3, steps: [{ seconds: 600, low: 88, high: 93 }, { seconds: 300, low: 50, high: 55, label: "Easy" }] },
  { repeats: 1, steps: [{ seconds: 300, low: 45, high: 55 }] }
] };

test("a FIT workout file has a valid header, size and both CRCs", () => {
  const f = fitWorkoutFile(ride, { now: Date.UTC(2026, 10, 1) });
  const v = new DataView(f.buffer);
  assert.equal(f[0], 14);
  assert.equal(String.fromCharCode(...f.subarray(8, 12)), ".FIT");
  assert.equal(v.getUint32(4, true), f.length - 16);
  assert.equal(v.getUint16(12, true), fitCrc(f.subarray(0, 12)));
  assert.equal(fitCrc(f), 0, "the CRC over the whole file including its CRC is zero");
});

test("ride steps are % FTP, repeats point back to their first step", () => {
  const steps = fitSteps(ride);
  assert.equal(steps.length, 5);
  assert.deepEqual([steps[0].intensity, steps[0].targetType, steps[0].low, steps[0].high, steps[0].durationValue], [2, 4, 50, 60, 600000]);
  assert.deepEqual([steps[3].durationType, steps[3].durationValue, steps[3].targetValue], [6, 1, 3]);
  assert.equal(steps[2].name, "Easy");
  assert.equal(steps[4].intensity, 3);
});

test("run steps get a speed range from threshold pace, or no target with the % in the name", () => {
  const run = { sport: "run", name: "Easy run", blocks: [{ repeats: 1, steps: [{ seconds: 1800, low: 78, high: 88 }] }] };
  const [paced] = fitSteps(run, { thresholdPace: 250 });
  assert.equal(paced.targetType, 0);
  assert.equal(paced.low, Math.round(4 * 0.78 * 1000));
  assert.equal(paced.high, Math.round(4 * 0.88 * 1000));
  const [open] = fitSteps(run);
  assert.equal(open.targetType, 2);
  assert.equal(open.name, "Z2 78-88% pace");
});

test("swim steps go by metres, rests by time", () => {
  const swim = { sport: "swim", name: "CSS", blocks: [{ repeats: 4, steps: [{ meters: 100, low: 98, high: 102 }, { rest: true, seconds: 20 }] }] };
  const steps = fitSteps(swim);
  assert.deepEqual([steps[0].durationType, steps[0].durationValue], [1, 10000]);
  assert.deepEqual([steps[1].durationType, steps[1].durationValue, steps[1].intensity], [0, 20000, 1]);
  assert.equal(fitWorkoutFile(swim, { poolLength: 25 }).length > 0, true);
});

test("a run .zwo is a Zwift run in fractions of 10 km pace", () => {
  const zwo = zwoFile({ sport: "run", name: "Strides", blocks: [{ repeats: 2, steps: [{ seconds: 30, low: 104, high: 106 }] }] });
  assert.match(zwo, /<sportType>run<\/sportType>/);
  assert.match(zwo, /<SteadyState Duration="30" Power="1.050" pace="2"\/>/);
});
