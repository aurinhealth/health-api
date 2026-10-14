// Thresholds from the data, confirmed by a test. Most athletes train a lot but
// rarely test, so an estimate from everyday sessions can mislead. The app
// therefore only says what the data suggest (FTP or the threshold run pace
// moved by 5 % or more, or none is set), offers the matching test on a
// recommended day, lets the athlete pick another day or decline, keeps the
// days before it easy, and proposes the new value from the test for the
// athlete to confirm. Nothing changes without that confirmation.
//
// Estimates (last 90 days):
// - FTP: Intervals.icu's rolling eFTP (from the power curve) when the rides
//   come from there; otherwise the power–heart-rate line of the rides with
//   both (power at the threshold heart rate, at least 6 rides, r ≥ 0.5), never
//   below the best average power of a 40–90 min ride.
// - Threshold run pace: the speed–heart-rate line of the runs the same way,
//   never slower than the best run of 20–70 min converted to a one-hour effort
//   (Riegel's exponent 1.06).
// The threshold heart rate is the athlete's LTHR as a fraction of the
// heart-rate reserve, 0.82 without one (training-load.js).
//
// Tests:
// - ride with power: 20 min all out after a warm-up with a 5 min effort, FTP =
//   95 % of the 20 min power (Allen & Coggan);
// - ride without power: Friel's 30 min time trial, LTHR = the average heart
//   rate of its last 20 minutes;
// - run: Friel's 30 min time trial, threshold pace ≈ its average pace and
//   LTHR = the heart rate of its last 20 minutes.
import { buildWorkout, step, rep, sec } from "./workout-model.js";
import { DEFAULT_THRESHOLD_HRR } from "./training-load.js";
import { L } from "./lang.js";

const finite = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
export const CHANGE = 0.05;
const SNOOZE_DAYS = 28;

// ---- tests -----------------------------------------------------------------
const free = (minutes, target, cadence, note) => ({ ...step(minutes, target, cadence, note), free: true });
export function testWorkouts() {
  const spin = rep(3, [step(1, 100, "100-110", L("rychlá kadence", "fast cadence")), step(1, 55, "90")]);
  return [
    buildWorkout({
      id: "test-ride-ftp20", name: L("Test FTP · 20 min", "FTP test · 20 min"), system: "threshold", family: "test", tags: ["test"], sourceKind: "research", sourceName: L("Publikovaný protokol", "Published protocol"),
      citation: "Allen H, Coggan A. Training and Racing with a Power Meter. 2nd ed. VeloPress; 2010.",
      structure: [step(10, 55, "90", L("rozjetí", "warm-up")), spin, step(5, 105, "95", L("svižně, ne naplno", "brisk, not all out")), step(10, 55, "90", L("lehce", "easy")), free(20, 100, "90-100", L("20 min co nejvyšší rovnoměrný výkon", "20 min at the highest even power you can hold")), step(10, 50, "85-95", L("vyjetí", "cool-down"))],
      description: L("Po rozjetí 20 minut naplno a rovnoměrně. FTP je 95 % průměrného výkonu z těch 20 minut.", "After the warm-up, 20 minutes all out and even. FTP is 95 % of the average power of those 20 minutes.")
    }),
    buildWorkout({
      id: "test-ride-lthr30", name: L("Test prahového tepu · 30 min", "Threshold heart rate test · 30 min"), system: "threshold", family: "test", tags: ["test"], sourceKind: "research", sourceName: L("Publikovaný protokol", "Published protocol"),
      citation: "Friel J. The Cyclist's Training Bible. 5th ed. VeloPress; 2018.",
      structure: [step(15, 55, "90", L("rozjetí", "warm-up")), spin, free(30, 100, "90-100", L("30 min naplno jako časovka, rovnoměrně", "30 min all out like a time trial, evenly")), step(10, 50, "85-95", L("vyjetí", "cool-down"))],
      description: L("30 minut naplno jako časovka. Prahový tep je průměr posledních 20 minut.", "30 minutes all out like a time trial. The threshold heart rate is the average of the last 20 minutes.")
    }),
    buildWorkout({
      id: "test-run-tt30", sport: "run", name: L("Běžecký test · 30 min", "Run test · 30 min"), system: "threshold", family: "test", tags: ["test"], sourceKind: "research", sourceName: L("Publikovaný protokol", "Published protocol"),
      citation: "Friel J. The Triathlete's Training Bible. 4th ed. VeloPress; 2016.",
      structure: [step(12, 78, null, L("rozklus", "warm-up jog")), rep(4, [step(sec(20), 115, null, L("rovinka – svižně, uvolněně", "stride – quick and relaxed")), step(sec(40), 65, null, L("volně / chůze", "easy / walk"))]), step(3, 72, null, L("klus", "jog")), step(30, 100, null, L("30 min naplno, rovnoměrně", "30 min all out, evenly")), step(10, 72, null, L("výklus", "cool-down jog"))],
      description: L("30 minut naplno a rovnoměrně, ideálně na rovině. Prahové tempo je průměr celých 30 minut, prahový tep průměr posledních 20 minut.", "30 minutes all out and evenly, ideally on the flat. Threshold pace is the average of the whole 30 minutes, the threshold heart rate the average of the last 20.")
    })
  ];
}
export const getTestWorkout = id => testWorkouts().find(w => w.id === id) || null;
export const testFor = (sport, hasPower) => (sport === "run" ? "test-run-tt30" : hasPower ? "test-ride-ftp20" : "test-ride-lthr30");

// ---- sessions --------------------------------------------------------------
// Rides and runs (activityFromRow, deduplicated) with what the estimates need
// from the stored payload: Intervals.icu, Google Health or Apple Health.
export function thresholdSessions(activities, rowsById) {
  const out = [];
  for (const a of activities || []) {
    if (a?.kind !== "ride" && a?.kind !== "run") continue;
    let p = {};
    try { p = JSON.parse(rowsById.get(a)?.payload_json || "{}"); } catch { p = {}; }
    const m = p.exercise?.metricsSummary || {};
    const mm = finite(m.distanceMillimeters);
    out.push({
      date: a.date, kind: a.kind, minutes: finite(a.minutes),
      avgHr: finite(p.average_heartrate ?? m.averageHeartRateBeatsPerMinute),
      avgPower: p.device_watts === false ? null : finite(p.icu_average_watts ?? p.average_watts ?? m.averagePowerWatts),
      distance: finite(p.distance ?? p.icu_distance ?? m.distanceMeters ?? (mm != null ? mm / 1000 : null)),
      normPower: p.device_watts === false ? null : finite(p.icu_weighted_average_watts ?? p.weighted_average_watts),
      rollingFtp: finite(p.icu_rolling_ftp),
      id: typeof p.id === "string" ? p.id : null
    });
  }
  return out;
}

function line(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n, my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of points) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; }
  if (!(sxx > 0 && syy > 0)) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, r: sxy / Math.sqrt(sxx * syy), n };
}

function thresholdHrr(athlete, lthr) {
  const rest = finite(athlete.restHr), max = finite(athlete.maxHr);
  if (!(rest > 0 && max > rest + 20)) return null;
  return lthr > rest && lthr < max ? (lthr - rest) / (max - rest) : DEFAULT_THRESHOLD_HRR;
}
const hrrOf = (hr, athlete) => (hr - athlete.restHr) / (athlete.maxHr - athlete.restHr);
const confidence = fit => (fit.n >= 12 && fit.r >= 0.7 ? "medium" : "low");

// FTP from the last 90 days, or null. {value, confidence, basis, sessions}
export function estimateRideFtp(sessions, athlete = {}, today) {
  const rides = (sessions || []).filter(s => s.kind === "ride" && s.date > shift(today, -90) && s.date <= today);
  const recent = rides.filter(s => s.rollingFtp > 0 && s.date > shift(today, -42)).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (recent) return { value: Math.round(recent.rollingFtp), confidence: "high", basis: "intervals-eftp", sessions: rides.length };
  const x0 = thresholdHrr(athlete, finite(athlete.lthr));
  const powered = rides.filter(s => s.avgPower > 50 && s.minutes >= 20);
  const floor = Math.max(0, ...powered.filter(s => s.minutes >= 40 && s.minutes <= 90).map(s => s.avgPower));
  if (x0 == null) return null;
  const fit = line(powered.filter(s => s.avgHr > athlete.restHr).map(s => ({ x: hrrOf(s.avgHr, athlete), y: s.avgPower })));
  if (!fit || fit.n < 6 || fit.r < 0.5 || fit.b <= 0) return null;
  return { value: Math.round(Math.max(fit.a + fit.b * x0, floor)), confidence: confidence(fit), basis: "power-hr", sessions: fit.n, r: Math.round(fit.r * 100) / 100 };
}

// Threshold run pace (s/km) from the last 90 days, or null.
export function estimateRunPace(sessions, athlete = {}, today) {
  const runs = (sessions || []).filter(s => s.kind === "run" && s.date > shift(today, -90) && s.date <= today && s.distance > 1000 && s.minutes >= 20);
  const speedOf = s => s.distance / (s.minutes * 60);
  const x0 = thresholdHrr(athlete, finite(athlete.runLthr ?? athlete.lthr));
  if (x0 == null) return null;
  const fit = line(runs.filter(s => s.avgHr > athlete.restHr).map(s => ({ x: hrrOf(s.avgHr, athlete), y: speedOf(s) })));
  if (!fit || fit.n < 6 || fit.r < 0.5 || fit.b <= 0) return null;
  // The best run as a one-hour effort (Riegel 1981: time ∝ distance^1.06).
  const floor = Math.max(0, ...runs.filter(s => s.minutes <= 70).map(s => speedOf(s) * (s.minutes / 60) ** (0.06 / 1.06)));
  const speed = Math.max(fit.a + fit.b * x0, floor);
  if (!(speed > 1000 / 600 && speed < 1000 / 150)) return null;
  return { value: Math.round(1000 / speed), confidence: confidence(fit), basis: "speed-hr", sessions: fit.n, r: Math.round(fit.r * 100) / 100 };
}

// ---- offers ----------------------------------------------------------------
// What to offer for one sport: null, or {sport, metric, current, estimate,
// change, reason: "missing" | "higher" | "lower", testId}. The athlete must
// train the sport (4+ sessions in 6 weeks). A declined offer, or a value just
// confirmed, comes back after 4 weeks, or sooner when the estimate moved
// another 5 %.
export function thresholdOffer({ sport, sessions, current, estimate, check = null, today }) {
  const recent = (sessions || []).filter(s => s.kind === sport && s.date > shift(today, -42) && s.date <= today);
  if (recent.length < 4) return null;
  if (check && ["scheduled", "measured"].includes(check.status)) return null;
  const metric = sport === "run" ? "runThresholdPace" : current?.ftp || recent.some(s => s.avgPower > 50) ? "ftp" : "lthr";
  const now = finite(current?.[metric]);
  let reason = null, change = null;
  if (!now) reason = "missing";
  // A rough estimate never calls for a test by itself: on the owner's rides
  // the whole-ride power–heart-rate line came out 13 % under Intervals.icu's
  // eFTP (r 0.61), as heart-rate drift and uneven power pull it down.
  else if (estimate?.value && estimate.confidence !== "low") {
    // A faster pace is a lower number of seconds: "higher" means better.
    change = sport === "run" ? now / estimate.value - 1 : estimate.value / now - 1;
    if (Math.abs(change) >= CHANGE) reason = change > 0 ? "higher" : "lower";
  }
  if (!reason) return null;
  if (["dismissed", "applied"].includes(check?.status) && daysBetween(String(check.updatedAt || today).slice(0, 10), today) < SNOOZE_DAYS) {
    const before = finite(check.estimate?.value);
    if (!(before && estimate?.value && Math.abs(estimate.value / before - 1) >= CHANGE)) return null;
  }
  const hasPower = sport === "ride" && recent.some(s => s.avgPower > 50);
  return { sport, metric, current: now, estimate: estimate || null, change: change == null ? null : Math.round(change * 1000) / 10, reason, testId: testFor(sport, hasPower) };
}

// The day for the test: 2–9 days ahead, so the day or two before it can be
// easy. A day the week plan gives this sport wins, a quality day most (the
// test replaces that week's quality session); a day without enough time is
// left out. Earlier is better among equals. `days`: [{date, sports, role,
// minutes}] from the week plan.
export function recommendTestDay({ today, sport, days = [], minutes = 60 }) {
  const known = days.some(d => d.sports?.length);
  const options = [];
  for (let k = 2; k <= 9; k++) {
    const date = shift(today, k), d = days.find(x => x.date === date) || {};
    const fits = d.minutes == null || d.minutes >= minutes;
    const planned = (d.sports || []).includes(sport);
    const score = (fits ? 10 : -100) + (planned ? 4 : known ? -3 : 0) + (d.role === "quality" ? 3 : d.role === "long" ? -1 : 0) - k * 0.2;
    options.push({ date, fits, planned, role: d.role || null, score });
  }
  const best = [...options].filter(o => o.fits).sort((a, b) => b.score - a.score)[0] || null;
  return { recommended: best?.date || null, options: options.map(({ score, ...o }) => o) };
}

// ---- the result --------------------------------------------------------------
// The test's effort from the activity's intervals (Intervals.icu): the
// longest-average interval of 18–22 min (FTP test) or 27–33 min (time trial).
export function testResult(testId, intervals = [], activity = {}) {
  const want = testId === "test-ride-ftp20" ? [18, 22] : [27, 33];
  const pick = (intervals || []).filter(i => i.seconds >= want[0] * 60 && i.seconds <= want[1] * 60)
    .sort((a, b) => (testId === "test-run-tt30" ? (b.speed || 0) - (a.speed || 0) : (b.watts || b.hr || 0) - (a.watts || a.hr || 0)))[0];
  if (testId === "test-ride-ftp20") {
    const watts = finite(pick?.watts);
    return watts ? { ftp: Math.round(watts * 0.95), power20: watts, hr: finite(pick.hr) } : null;
  }
  if (testId === "test-ride-lthr30") {
    // The interval's average over 30 min sits a little under the last 20 min (Friel).
    const hr = finite(pick?.hr);
    return hr ? { lthr: Math.round(hr + 2), hr30: hr } : null;
  }
  const speed = finite(pick?.speed) || (pick?.distance && pick?.seconds ? pick.distance / pick.seconds : null);
  if (!speed) return null;
  const pace = Math.round(1000 / speed);
  return pace >= 150 && pace <= 600 ? { runThresholdPace: pace, runLthr: pick.hr ? Math.round(pick.hr + 2) : null, distance: finite(pick.distance) } : null;
}

// ---- storage ---------------------------------------------------------------
// One row per sport: scheduled (test planned on test_date), measured (the
// test was done and its values wait for confirmation), dismissed, applied.
async function ensure(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS threshold_checks (user_id INTEGER NOT NULL, sport TEXT NOT NULL, status TEXT NOT NULL, test_id TEXT, test_date TEXT, estimate_json TEXT, result_json TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, sport))").run();
}
const parse = text => { try { return JSON.parse(text || "null"); } catch { return null; } };
export async function getChecks(db) {
  await ensure(db);
  const rows = (await db.prepare("SELECT sport,status,test_id,test_date,estimate_json,result_json,updated_at FROM threshold_checks WHERE user_id=?").bind(db.userId).all()).results || [];
  return Object.fromEntries(rows.map(r => [r.sport, { sport: r.sport, status: r.status, testId: r.test_id, testDate: r.test_date, estimate: parse(r.estimate_json), result: parse(r.result_json), updatedAt: r.updated_at }]));
}
export async function saveCheck(db, sport, { status, testId = null, testDate = null, estimate = null, result = null }) {
  await ensure(db);
  await db.prepare("INSERT INTO threshold_checks(user_id,sport,status,test_id,test_date,estimate_json,result_json,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,sport) DO UPDATE SET status=excluded.status,test_id=excluded.test_id,test_date=excluded.test_date,estimate_json=excluded.estimate_json,result_json=excluded.result_json,updated_at=CURRENT_TIMESTAMP")
    .bind(db.userId, sport, status, testId, testDate, estimate ? JSON.stringify(estimate) : null, result ? JSON.stringify(result) : null).run();
}

// The scheduled test the coach plans around: the nearest one from today on.
export function upcomingTest(checks, today) {
  return Object.values(checks || {}).filter(c => c.status === "scheduled" && c.testDate >= today).sort((a, b) => a.testDate.localeCompare(b.testDate))[0] || null;
}
