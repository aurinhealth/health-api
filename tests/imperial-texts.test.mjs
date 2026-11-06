// Audit 29.1–29.3: texts the server writes follow the user's units; the data stays metric.
import test from "node:test";
import assert from "node:assert/strict";
import { withLang, withUnits, paceText } from "../src/lang.js";
import { workoutLines, pickSignature, rankOptions } from "../src/coach-pick.js";
import { goalCheck } from "../src/race-estimate.js";
import { sanitizeTrainingProfile } from "../src/training-zones.js";
import { weatherReason } from "../src/adaptive-week.js";
import { buildShareMilestones } from "../src/share-milestone.js";

const imperial = fn => withLang("en", () => withUnits("imperial", fn));

test("a run pace in the reader's units", () => {
  assert.equal(paceText(270), "4:30 /km");
  assert.equal(imperial(() => paceText(270)), "7:15 /mi");
  assert.equal(paceText(null), "");
});

test("the run lines of Aktivita dne", () => {
  const steps = [{ repeats: 1, steps: [{ durationSeconds: 600, paceFast: "5:30" }] }, { repeats: 4, steps: [{ durationSeconds: 300, paceFast: "4:30", percentHigh: 100, note: "effort" }, { durationSeconds: 120, paceFast: "6:00" }] }];
  assert.deepEqual(workoutLines(steps, "run"), [["Rozklus", "10 min · 5:30 /km"], ["4 × effort", "5 min · 4:30 /km"]]);
  assert.deepEqual(imperial(() => workoutLines(steps, "run")), [["Warm-up", "10 min · 8:51 /mi"], ["4 × effort", "5 min · 7:15 /mi"]]);
});

test("the stored lines are made again for an imperial user, a metric user's stay", () => {
  const ranked = rankOptions({ ride: { status: "green", recommendation: "endurance", minutes: 60 }, mainSport: "cycling", sports: ["ride"] });
  const metric = pickSignature(ranked);
  assert.equal(withLang("cs", () => withUnits("metric", () => pickSignature(ranked))), metric);
  assert.notEqual(withLang("cs", () => withUnits("imperial", () => pickSignature(ranked))), metric);
});

test("the race goal note", () => {
  const args = { km: 21.1, target: 6000, estimate: 6430, estimateStart: 6500, weeksDone: 7, weeksLeft: 4, thresholdPace: 290 };
  assert.match(withLang("en", () => goalCheck(args)).note, /Holding 4:44 \/km/);
  assert.match(imperial(() => goalCheck(args)).note, /Holding 7:38 \/mi would/);
});

test("the threshold pace limits", () => {
  assert.throws(() => withLang("en", () => sanitizeTrainingProfile({ runThresholdPace: "1:00" })), /Threshold pace must be 2:30–10:00 \/km\./);
  assert.throws(() => imperial(() => sanitizeTrainingProfile({ runThresholdPace: "1:00" })), /Threshold pace must be 4:01–16:06 \/mi\./);
});

test("the weather reasons of the week plan", () => {
  const cold = { max: 5, wind: 10, rain: 0, rainProb: 10, code: 3 };
  assert.match(withLang("en", () => weatherReason("2026-10-28", "ride", cold)), /^High of 5°, too cold outside\.$/);
  assert.match(imperial(() => weatherReason("2026-10-28", "ride", cold)), /^High of 41°F, too cold outside\.$/);
  assert.match(imperial(() => weatherReason("2026-10-28", "run", { max: 12, wind: 60, rain: 0, rainProb: 10, code: 3 })), /^Wind up to 37 mph\.$/);
  assert.match(imperial(() => weatherReason("2026-10-28", "run", { max: 12, wind: 10, rain: 4, rainProb: 10, code: 3 })), /^0\.16 in of rain\.$/);
  assert.match(withLang("cs", () => weatherReason("2026-10-28", "run", { max: 12, wind: 10, rain: 4.5, rainProb: 10, code: 3 })), /^Naprší 4,5 mm\.$/);
});

test("distance milestones are round numbers in miles for an imperial user", () => {
  const ride = (id, date, km) => ({ source_family: "intervals", external_id: id, start_time: date + "T07:00:00", end_time: null, payload_json: JSON.stringify({ id, type: "Ride", distance: km * 1000, moving_time: 3600, start_date_local: date + "T07:00:00" }) });
  const rows = [ride("a", "2026-10-02", 90), ride("b", "2026-10-05", 80)];
  const metric = buildShareMilestones({ rows, today: "2026-10-15", since: "2026-10-01" }).items[0];
  assert.equal(metric.value, 150);
  assert.equal(metric.reachedOn, "2026-10-05");
  // 170 km is 105.6 mi: 100 mi reached, kept in km (160.934) for the app to convert.
  const miles = withUnits("imperial", () => buildShareMilestones({ rows, today: "2026-10-15", since: "2026-10-01" }).items[0]);
  assert.equal(miles.value, 160.934);
  assert.equal(miles.unit, "km");
  assert.equal(miles.total, 170);
  assert.equal(miles.reachedOn, "2026-10-05");
});
