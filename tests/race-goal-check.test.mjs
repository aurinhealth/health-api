import test from "node:test";
import assert from "node:assert/strict";
import { goalCheck } from "../src/race-estimate.js";
import { planTrend } from "../src/training-plans.js";
import { withLang } from "../src/lang.js";

test("the race goal: on track, behind, a realistic goal with six weeks left", () => {
  // Improving 25 s a week from 1:49:10, six weeks left: 1:46:40 now ends near 1:44:10, the goal 1:45:00 holds.
  const on = goalCheck({ km: 21.1, target: 6300, estimate: 6400, estimateStart: 6550, weeksDone: 6, weeksLeft: 6, thresholdPace: 289, thresholdBefore: 292 });
  assert.equal(on.status, "on_track");
  assert.equal(on.realistic, undefined);
  assert.match(on.note, /1:40/);
  assert.deepEqual(on.paces, { race: 299, threshold: 289, thresholdBefore: 292, easy: [355, 375] });
  // A goal of 1:40:00 with 1:47:10 now and four weeks left: about 7 min slower, a realistic goal offered.
  const off = withLang("en", () => goalCheck({ km: 21.1, target: 6000, estimate: 6430, estimateStart: 6500, weeksDone: 7, weeksLeft: 4, thresholdPace: 290 }));
  assert.equal(off.status, "behind");
  assert.match(off.badge, /^7 min slower than the goal$/);
  assert.equal(off.realistic % 60, 0);
  assert.ok(off.realistic > 6000 && off.realistic <= 6430);
  assert.match(off.note, /^4 weeks left\. Holding 4:44 \/km/);
  // Kept once: not offered again for that goal; far from the race: not yet.
  assert.equal(goalCheck({ km: 21.1, target: 6000, estimate: 6430, estimateStart: 6500, weeksDone: 7, weeksLeft: 4, kept: 6000 }).realistic, undefined);
  assert.equal(goalCheck({ km: 21.1, target: 6000, estimate: 6430, estimateStart: 6500, weeksDone: 2, weeksLeft: 10 }).realistic, undefined);
  // Improvement counts at most 1 % a week.
  assert.ok(goalCheck({ km: 10, target: 2400, estimate: 3000, estimateStart: 4000, weeksDone: 1, weeksLeft: 2 }).projected >= 3000 * .98);
});

test("Monday keeps the week's estimate and the threshold pace before and now", () => {
  const plan = { templateId: "run-half", startDate: "2026-10-12", raceDate: "2027-01-10", raceKm: 21.1, threshold: { now: 292 } };
  const next = planTrend(plan, "2026-11-02", { estimate: 6400.4, thresholdPace: 289 });
  assert.deepEqual(next.estimates, { "2026-11-02": 6400 });
  assert.deepEqual(next.threshold, { before: 292, now: 289, at: "2026-11-02" });
  assert.equal(next.trendChecked, "2026-11-02");
});
