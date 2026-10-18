import test from "node:test";
import assert from "node:assert/strict";
import { estimateRideFtp, estimateRunPace, thresholdOffer, recommendTestDay, testResult, upcomingTest, getTestWorkout, thresholdSessions } from "../src/threshold-check.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";

const today = "2026-10-11";
const day = k => new Date(Date.parse(today + "T12:00:00Z") - k * 86400000).toISOString().slice(0, 10);
const athlete = { restHr: 50, maxHr: 190, lthr: 165 };
// Power rises with heart rate: 150 W at 120 bpm, +2.5 W per beat.
const rides = Array.from({ length: 10 }, (_, i) => ({ date: day(i * 3 + 1), kind: "ride", minutes: 60 + i * 5, avgHr: 120 + i * 4, avgPower: 150 + i * 10 + (i % 2 ? 3 : -3) }));

test("FTP: Intervals.icu eFTP first, otherwise power at the threshold heart rate", () => {
  const own = estimateRideFtp(rides, athlete, today);
  // 165 bpm is 45 beats over 120: about 150 + 45 × 2.5.
  assert.ok(Math.abs(own.value - 262) <= 8, String(own.value));
  assert.equal(own.basis, "power-hr");
  const intervals = estimateRideFtp([...rides, { date: day(2), kind: "ride", minutes: 60, rollingFtp: 244 }], athlete, today);
  assert.deepEqual([intervals.value, intervals.confidence], [244, "high"]);
  // Too few rides or no heart-rate reserve: no estimate.
  assert.equal(estimateRideFtp(rides.slice(0, 4), athlete, today), null);
  assert.equal(estimateRideFtp(rides, { lthr: 165 }, today), null);
});

test("run pace from the speed–heart-rate line, never slower than the best run", () => {
  const runs = Array.from({ length: 8 }, (_, i) => ({ date: day(i * 4 + 1), kind: "run", minutes: 40, avgHr: 130 + i * 4, distance: 40 * 60 * (2.6 + i * 0.08) }));
  const est = estimateRunPace(runs, athlete, today);
  assert.ok(est.value > 240 && est.value < 330, String(est.value));
});

test("an offer only when the estimate moved 5 % or nothing is set", () => {
  const base = { sport: "ride", sessions: rides, today };
  assert.equal(thresholdOffer({ ...base, current: { ftp: 255 }, estimate: { value: 262 } }), null);
  const lower = thresholdOffer({ ...base, current: { ftp: 260 }, estimate: { value: 244 } });
  assert.equal(thresholdOffer({ ...base, current: { ftp: 260 }, estimate: { value: 211, confidence: "low" } }), null);
  assert.deepEqual([lower.reason, lower.metric, lower.testId], ["lower", "ftp", "test-ride-ftp20"]);
  assert.equal(thresholdOffer({ ...base, current: {}, estimate: null }).reason, "missing");
  // Declined two weeks ago: quiet, unless the estimate moved again.
  const declined = { status: "dismissed", updatedAt: day(14), estimate: { value: 244 } };
  assert.equal(thresholdOffer({ ...base, current: { ftp: 260 }, estimate: { value: 243 }, check: declined }), null);
  assert.equal(thresholdOffer({ ...base, current: { ftp: 260 }, estimate: { value: 230 }, check: declined }).reason, "lower");
  assert.equal(thresholdOffer({ ...base, current: { ftp: 260 }, estimate: { value: 244 }, check: { status: "scheduled" } }), null);
  // A sport the athlete does not train gets nothing.
  assert.equal(thresholdOffer({ ...base, sport: "run", current: {}, estimate: null }), null);
  // Without a power meter the ride test is the heart-rate one.
  const hrOnly = rides.map(({ avgPower, ...r }) => r);
  assert.deepEqual(Object.values((({ metric, testId }) => ({ metric, testId }))(thresholdOffer({ ...base, sessions: hrOnly, current: {}, estimate: null }))), ["lthr", "test-ride-lthr30"]);
  // A faster run pace (fewer seconds) is "higher".
  const runs = Array.from({ length: 5 }, (_, i) => ({ date: day(i + 1), kind: "run", minutes: 40 }));
  assert.equal(thresholdOffer({ sport: "run", sessions: runs, today, current: { runThresholdPace: 300 }, estimate: { value: 280 } }).reason, "higher");
});

test("the recommended day is a planned day of the sport with time, a quality day first", () => {
  const days = [
    { date: "2026-10-13", sports: ["ride"], role: "endurance", minutes: 90 },
    { date: "2026-10-14", sports: ["gym"], role: null, minutes: 60 },
    { date: "2026-10-15", sports: ["ride"], role: "quality", minutes: 75 },
    { date: "2026-10-16", sports: ["ride"], role: "quality", minutes: 45 }
  ];
  const r = recommendTestDay({ today, sport: "ride", days, minutes: 61 });
  assert.equal(r.recommended, "2026-10-15");
  assert.equal(r.options.find(o => o.date === "2026-10-16").fits, false);
  // Never tomorrow: one easier day before the test.
  assert.equal(r.options[0].date, "2026-10-13");
});

test("the result from the test's intervals", () => {
  assert.deepEqual(testResult("test-ride-ftp20", [{ seconds: 300, watts: 300 }, { seconds: 1200, watts: 280, hr: 172 }]), { ftp: 266, power20: 280, hr: 172 });
  assert.equal(testResult("test-ride-ftp20", [{ seconds: 600, watts: 300 }]), null);
  assert.equal(testResult("test-run-tt30", [{ seconds: 1800, distance: 7200, hr: 170 }]).runThresholdPace, 250);
  assert.equal(testResult("test-ride-lthr30", [{ seconds: 1800, hr: 168 }]).lthr, 170);
});

test("the tests are workouts the library can plan", () => {
  for (const id of ["test-ride-ftp20", "test-ride-lthr30", "test-run-tt30"]) {
    const w = getTestWorkout(id);
    assert.ok(w.duration_minutes >= 55 && w.duration_minutes <= 65, id + " " + w.duration_minutes);
  }
  assert.equal(getTestWorkout("test-run-tt30").sport, "run");
});

test("sessions read Intervals.icu and watch payloads", () => {
  const a = { date: day(1), kind: "ride", minutes: 60 }, b = { date: day(2), kind: "run", minutes: 30 };
  const rows = new Map([[a, { payload_json: JSON.stringify({ id: "i1", average_heartrate: 150, icu_average_watts: 210, distance: 30000, icu_rolling_ftp: 250 }) }], [b, { payload_json: JSON.stringify({ exercise: { metricsSummary: { averageHeartRateBeatsPerMinute: 155, distanceMillimeters: 6000000 } } }) }]]);
  const [r, n] = thresholdSessions([a, b], rows);
  assert.deepEqual([r.avgPower, r.rollingFtp, r.id], [210, 250, "i1"]);
  assert.deepEqual([n.avgHr, n.distance], [155, 6000]);
});

test("the coach keeps the two days before a test easy", () => {
  const week = { days: [] };
  const coach = (date, testDate) => buildCyclingCoachV2({ date, week, fitness: { wellness: [{ id: date, ctl: 60, atl: 55 }] }, health: { sleep: [{ type: "sleep", durationMin: 480, endTime: date + "T06:30:00" }] }, goal: { focus: "threshold" }, upcomingTest: testDate ? { sport: "ride", testDate, status: "scheduled" } : null });
  assert.equal(coach("2026-10-13", null).recommendation.session.kind, "threshold");
  assert.equal(coach("2026-10-13", "2026-10-14").recommendation.session.kind, "recovery");
  assert.equal(coach("2026-10-13", "2026-10-15").recommendation.session.kind, "endurance");
  assert.equal(upcomingTest({ ride: { status: "scheduled", testDate: "2026-10-14" }, run: { status: "dismissed", testDate: "2026-10-12" } }, "2026-10-13").testDate, "2026-10-14");
});
