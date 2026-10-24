import test from "node:test";
import assert from "node:assert/strict";
import { workIntervals, sameShape, summaryEfforts, compareIntervals, compareSentence, candidates } from "../src/activity-compare.js";
import { withLang } from "../src/lang.js";

const ride = (watts, hr, seconds = 480) => [
  { type: "RECOVERY", seconds: 900, watts: 150, hr: 120 },
  ...watts.map((w, i) => [{ type: "WORK", seconds, watts: w, hr: hr[i] }, { type: "RECOVERY", seconds: 240, watts: 140, hr: 130 }]).flat()
];

test("the same workout: as many efforts, each about as long", () => {
  const a = workIntervals(ride([252, 255, 256, 257], [164, 166, 167, 168]));
  assert.equal(a.length, 4);
  assert.ok(sameShape(a, workIntervals(ride([260, 262, 263, 263], [155, 158, 159, 160], 500))));
  assert.equal(sameShape(a, workIntervals(ride([260, 262, 263], [155, 158, 159]))), false);
  assert.equal(sameShape(a, workIntervals(ride([260, 262, 263, 263], [155, 158, 159, 160], 720))), false);
  // One short effort alone is no workout to compare.
  assert.equal(sameShape([{ seconds: 120 }], [{ seconds: 120 }]), false);
  assert.equal(summaryEfforts(["4x 8m 255w", "1x 20m 230w"]), 5);
  assert.equal(summaryEfforts(null), null);
});

test("a ride compares watts and heart rate, interval by interval", () => {
  const out = compareIntervals(ride([260, 262, 263, 263], [155, 158, 159, 160]), ride([252, 255, 256, 257], [164, 166, 167, 168]), "ride");
  assert.equal(out.metric, "watts");
  assert.deepEqual(out.before, { value: 255, hr: 166 });
  assert.deepEqual(out.after, { value: 262, hr: 158 });
  assert.equal(out.sentence, "Víc wattů při nižším tepu.");
  assert.deepEqual(out.rows[0], { label: "1. interval", before: { value: 252, hr: 164 }, after: { value: 260, hr: 155 } });
  // Without power on one side there is nothing to compare.
  assert.equal(compareIntervals(ride([260, 262, 263, 263], [155, 158, 159, 160]), ride([null, null, null, null], [164, 166, 167, 168]), "ride"), null);
});

test("a run compares pace in seconds per km, kilometre reps named so", () => {
  const km = (paces, hr) => paces.map((p, i) => ({ type: "WORK", seconds: p, distance: 1000, speed: 1000 / p, hr: hr[i] }));
  const out = compareIntervals(km([268, 267, 266, 265, 264], [166, 170, 172, 173, 174]), km([275, 273, 272, 271, 269], [165, 168, 170, 171, 173]), "run");
  assert.equal(out.metric, "pace");
  assert.equal(out.before.value, 272);
  assert.equal(out.after.value, 266);
  assert.equal(out.rows[2].label, "3. km");
  assert.equal(out.sentence, "Rychlejší úseky skoro při stejném tepu.");
});

test("the words never judge: a slower day is only easier", () => {
  assert.equal(compareSentence({ metric: "watts", before: { value: 260, hr: 160 }, after: { value: 250, hr: 161 } }), "Dnes volněji než minule.");
  assert.equal(compareSentence({ metric: "watts", before: { value: 260, hr: 160 }, after: { value: 261, hr: 154 } }), "Stejný výkon při nižším tepu.");
  withLang("en", () => assert.equal(compareSentence({ metric: "watts", before: { value: 250, hr: 160 }, after: { value: 262, hr: 166 } }), "More watts, heart rate a little higher."));
});

test("the same name is tried first, then as many efforts in the summary", () => {
  const row = (id, start, p) => ({ external_id: "activity:" + id, start_time: start, payload_json: JSON.stringify({ id, ...p }) });
  const rows = [
    row("a1", "2026-10-15T17:00", { type: "Ride", name: "Odpolední jízda", interval_summary: ["4x 8m 250w"] }),
    row("a2", "2026-10-07T17:00", { type: "Ride", name: "Sweet spot 4 × 8 min" }),
    row("a3", "2026-10-05T17:00", { type: "Run", name: "Sweet spot 4 × 8 min" }),
    row("a4", "2026-10-03T17:00", { type: "Ride", name: "Dlouhá", interval_summary: ["2x 20m 230w"] }),
    row("now", "2026-10-21T17:00", { type: "Ride", name: "Sweet spot 4 × 8 min" })
  ];
  assert.deepEqual(candidates(rows, { id: "now", sport: "ride", name: "Sweet spot  4 × 8 min", efforts: 4 }).map(c => c.id), ["a2", "a1"]);
});
