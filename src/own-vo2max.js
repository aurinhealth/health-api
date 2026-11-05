// Aurin's own VO2max estimate, fitness age and composite age (no UI yet).
// One number from every sport, in three layers (research doc 2026-11-03):
//
// 1. Resting layer, for everyone: the HUNT non-exercise model (Nes et al.
//    2011, Med Sci Sports Exerc 43:2024) from age, sex, BMI, resting heart rate
//    and a physical-activity index. The index is not asked in a questionnaire:
//    it is measured from the sessions of the last six weeks of every sport, so
//    Swim, Gym and anything else count here. Without height or weight the
//    simpler Uth model (15.3 × HRmax / HRrest, Uth et al. 2004) stands in.
// 2. Workout layer: rides with power and heart rate (ACSM leg-cycling
//    equation, VO2 = 10.8 × W/kg + 7) and runs and walks with speed, climb and
//    heart rate (ACSM running and walking equations), each extrapolated to the
//    maximum by the heart-rate reserve (%HRR ≈ %VO2R, Swain 1997):
//    VO2max = 3.5 + (VO2 − 3.5) / %HRR. Quality filters keep steady sessions
//    of 20 min or more in 35–95 % of the reserve; the rest weigh less or drop.
//    Swim and Gym have no validated formula from watch data: they count
//    through the resting layer only (a swim estimate from pace and heart rate
//    waits for a consenting swimmer's data).
// 3. Fusion: a weighted mean of the last 8 weeks' estimates (half-life
//    3 weeks) and the resting layer, on the running (treadmill) basis the
//    HUNT norms and the watches use. A ride estimate is cycling-specific, so it
//    is converted with a factor learned per person from the weeks with both
//    rides and runs, kept in the stored row between days. The day's value
//    moves at most 1 ml/kg/min a week from the last stored one, and comes with
//    a confidence (low, medium, high).
//
// Values from watches (Apple, Google/Fitbit, Garmin, Ultrahuman) never enter
// the estimate: they only validate it (scripts/vo2max-validate.mjs). All
// outputs are estimates from fitness and recovery data, nothing about health
// risk (MDR): the ages say how fit, never how ill.
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { activityKindOf } from "./activity-match.js";
import { zoneOffsetMs } from "./user-time.js";

export const MODEL_VERSION = 1;
export const WINDOW_DAYS = 56;
export const ACTIVITY_DAYS = 42;
export const HALF_LIFE_DAYS = 21;
export const REST_WEIGHT = 1;
// Cycling VO2max is 0–10 % below running (less for cyclists, more for others):
// the learned factor stays inside that, so it cannot turn a method's error into
// a sport difference (in validation, a ratio of 1.2 and more came from the
// heart-rate method on long outdoor rides, not from the sports).
export const DEFAULT_RIDE_FACTOR = 1.05;
export const RIDE_FACTOR_RANGE = [1, 1.1];
export const WEEKLY_CHANGE = 1;

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = v => (v == null ? null : Math.round(v * 10) / 10);
const round2 = v => (v == null ? null : Math.round(v * 100) / 100);
const median = list => { const s = list.filter(v => v != null).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const DAY = 86400000;
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const parse = json => { if (json && typeof json === "object") return json; try { return JSON.parse(json || "{}"); } catch { return {}; } };
const seconds = v => { const x = Number(String(v ?? "").replace(/s$/i, "")); return Number.isFinite(x) && x > 0 ? x : null; };

// health_datapoints activity and exercise rows as sessions with what the
// estimate needs; one workout recorded by two sources is kept once.
export function sessionsFromRows(rows) {
  const byActivity = new Map(), list = [];
  for (const row of rows || []) { const a = activityFromRow(row); if (a) { byActivity.set(a, row); list.push(a); } }
  return dedupeActivities(list).map(a => sessionFrom(a, byActivity.get(a))).filter(Boolean);
}
function sessionFrom(a, row) {
  const p = parse(row?.payload_json);
  const ex = p.exercise && typeof p.exercise === "object" ? p.exercise : null;
  const m = ex?.metricsSummary || {};
  const type = String((ex ? ex.exerciseType : p.type || p.category) || "");
  const kind = a.kind || activityKindOf(type);
  const minutes = n(a.minutes);
  if (!(minutes > 0)) return null;
  const distance = ex ? n(m.distanceMeters) ?? (n(m.distanceMillimeters) != null ? n(m.distanceMillimeters) / 1000 : null) : n(p.distance);
  const active = ex ? seconds(ex.activeDuration) : n(p.moving_time);
  const pace = ex ? n(m.averagePaceSecondsPerMeter) : null;
  const speed = ex ? (distance > 0 && active > 0 ? distance / active : pace > 0 ? 1 / pace : null) : n(p.average_speed);
  const gain = ex ? n(m.elevationGainMeters) ?? (n(m.elevationGainMillimeters) != null ? n(m.elevationGainMillimeters) / 1000 : null) : n(p.total_elevation_gain);
  return {
    date: a.date, start: a.start, kind, minutes,
    avgHr: n(ex ? m.averageHeartRateBeatsPerMinute : p.average_heartrate),
    maxHr: n(ex ? m.maxHeartRateBeatsPerMinute : p.max_heartrate),
    avgPower: n(ex ? m.averagePowerWatts : p.icu_average_watts ?? p.average_watts),
    normPower: ex ? null : n(p.icu_weighted_avg_watts),
    speed, distance, gain,
    decoupling: ex ? null : n(p.decoupling),
    indoor: p.trainer === true || p.trainer === 1 || /virtual|treadmill|indoor|stationary/i.test(type),
    weight: ex ? null : n(p.icu_weight)
  };
}

// Highest heart rate of the sessions, a peak more than 8 bpm above every other
// taken for a sensor spike (profile-suggestions.js observedHeartRates).
export function observedMaxHr(sessions) {
  const peaks = (sessions || []).map(s => n(s.maxHr)).filter(v => v >= 100 && v <= 230).sort((a, b) => b - a);
  for (let i = 0; i < peaks.length; i++) if (i === peaks.length - 1 || peaks[i] - peaks[i + 1] <= 8) return peaks[i];
  return null;
}

// The heart-rate reserve used by a session, null outside 0–1.
const reserve = (hr, athlete) => (hr > 0 && athlete.maxHr > athlete.restHr + 20 ? (hr - athlete.restHr) / (athlete.maxHr - athlete.restHr) : null);
// 1 inside 50–85 % of the reserve, falling to 0 at 35 % and 95 %.
const reserveQuality = r => (r == null ? 0 : r < 0.5 ? clamp((r - 0.35) / 0.15, 0, 1) : r > 0.85 ? clamp((0.95 - r) / 0.1, 0, 1) : 1);
// 0 at 20 min, 1 from 60 min; long rides drift (heat, fatigue), so less weight past 2.5 h.
const lengthQuality = min => clamp((min - 20) / 40, 0, 1) * (min > 150 ? clamp(1 - (min - 150) / 150, 0.4, 1) : 1);

// One session's VO2max estimate { sport, value, quality, ... } or null.
// `athlete` = { restHr, maxHr, weight }.
export function workoutEstimate(s, athlete) {
  if (!s || !(s.minutes >= 20) || !(s.avgHr > 0)) return null;
  const weight = n(s.weight) || n(athlete.weight);
  const hrr = reserve(s.avgHr, athlete);
  if (hrr == null || hrr < 0.35 || hrr > 0.95) return null;
  let vo2 = null, sport = null, quality = reserveQuality(hrr) * lengthQuality(s.minutes);
  if (s.kind === "ride" && s.avgPower > 0 && weight > 30) {
    sport = "ride";
    vo2 = 10.8 * s.avgPower / weight + 7;
    // An uneven ride (variability index) or a heart rate drifting away from the power.
    if (s.normPower > 0) quality *= clamp((1.3 - s.normPower / s.avgPower) / 0.2, 0, 1);
    if (s.decoupling != null) quality *= clamp((15 - Math.abs(s.decoupling)) / 10, 0, 1);
  } else if ((s.kind === "run" || s.kind === "walk") && s.speed > 0 && !s.indoor) {
    // A treadmill's speed is not calibrated; a run without its distance has no speed.
    const v = s.speed * 60, climb = s.gain > 0 && s.distance > 0 ? s.gain / s.distance : 0;
    // Gain only: on a loop half the distance climbs and the descent gives back part of it.
    const grade = climb / 2;
    if (v >= 134 && v <= 400) { sport = "run"; vo2 = 0.2 * v + 0.9 * v * grade + 3.5; }
    // Only a brisk walk well into the reserve: an everyday walk (stops, slow
    // pace, a heart rate barely above rest) came out 20 or more below the watch.
    else if (v >= 80 && v <= 110 && hrr >= 0.45) { sport = "walk"; vo2 = 0.1 * v + 1.8 * v * grade + 3.5; }
    else return null;
    // Hilly: the climb rate of the average says little about the effort.
    quality *= clamp((0.03 - climb) / 0.02, 0, 1);
  } else return null;
  if (!(quality > 0)) return null;
  const value = 3.5 + (vo2 - 3.5) / hrr;
  if (!(value >= 15 && value <= 90)) return null;
  return { date: s.date, sport, value: round1(value), quality: round2(quality), hrr: round2(hrr), minutes: Math.round(s.minutes) };
}

// HUNT physical-activity index from the measured sessions of the last six
// weeks, the three questions answered from data: how often (0, 1, 2, 3 for
// less than weekly, weekly, 2–3 times, almost daily), how hard (0 no sweat,
// 5 sweat and heavy breathing, 10 close to exhaustion) and how long (1 under
// 30 min, 1.5 from 30 min). Not breaking a sweat counts as not active at all.
// A session counts as a sweaty one with ≥ 40 % of the heart-rate reserve on
// average, or, without heart rate, when it is a ride, run, swim or gym session.
export function activityIndex(sessions, athlete, { weeks = ACTIVITY_DAYS / 7 } = {}) {
  const sweaty = (sessions || []).filter(s => s.minutes >= 10 && (s.avgHr > 0 ? (reserve(s.avgHr, athlete) ?? 0) >= 0.4 : ["ride", "run", "swim", "strength"].includes(s.kind)));
  const perWeek = sweaty.length / weeks;
  const frequency = perWeek < 0.75 ? 0 : perWeek < 1.75 ? 1 : perWeek < 3.75 ? 2 : 3;
  if (!frequency) return { index: 0, frequency, intensity: 0, duration: 0, perWeek: round1(perWeek) };
  const hard = sweaty.filter(s => (s.maxHr > 0 && athlete.maxHr > 0 && s.maxHr >= 0.92 * athlete.maxHr) || (reserve(s.avgHr, athlete) ?? 0) >= 0.8).length / weeks;
  const intensity = hard >= 0.5 ? 10 : 5;
  const duration = median(sweaty.map(s => s.minutes)) >= 30 ? 1.5 : 1;
  return { index: frequency + intensity + duration, frequency, intensity, duration, perWeek: round1(perWeek) };
}

// HUNT non-exercise model, BMI version (Nes et al. 2011). Coefficients as
// published in the secondary literature; the full text is paywalled, so they
// are checked against the watches' values (validation report), not the paper.
const HUNT = {
  male: { a: 92.05, age: 0.327, bmi: 0.933, rhr: 0.167, pa: 0.257 },
  female: { a: 70.77, age: 0.244, bmi: 0.749, rhr: 0.107, pa: 0.213 }
};
const hunt = (c, x) => c.a - c.age * x.age - c.bmi * x.bmi - c.rhr * x.restHr + c.pa * x.index;
// { value, model, ... } or null. Unknown sex: the mean of both equations.
export function restingEstimate({ age, sex, height, weight, restHr, maxHr, index }) {
  if (!(restHr >= 30 && restHr <= 110)) return null;
  const bmi = height > 100 && weight > 30 ? weight / (height / 100) ** 2 : null;
  if (age >= 15 && age <= 100 && bmi >= 14 && bmi <= 60) {
    const x = { age, bmi, restHr, index: index || 0 };
    const value = sex === "male" || sex === "female" ? hunt(HUNT[sex], x) : (hunt(HUNT.male, x) + hunt(HUNT.female, x)) / 2;
    return { value: round1(clamp(value, 15, 90)), model: "hunt", bmi: round1(bmi) };
  }
  if (maxHr > restHr + 20) return { value: round1(clamp(15.3 * maxHr / restHr, 15, 90)), model: "uth", bmi: null };
  return null;
}

// Ride-to-running factor learned from the window when it holds both: the
// ratio of the median run estimate to the median ride estimate, at least
// three of each; otherwise the one carried over from the last stored row.
export function rideFactor(estimates, previous = null) {
  const runs = estimates.filter(e => e.sport === "run").map(e => e.value), rides = estimates.filter(e => e.sport === "ride").map(e => e.value);
  if (runs.length >= 3 && rides.length >= 3) return { value: round2(clamp(median(runs) / median(rides), ...RIDE_FACTOR_RANGE)), learned: true };
  const kept = n(previous);
  return kept ? { value: clamp(kept, ...RIDE_FACTOR_RANGE), learned: false } : { value: DEFAULT_RIDE_FACTOR, learned: false };
}

// HUNT 3 Fitness Study reference (Loe et al. 2013, PLoS ONE 8:e64319, table
// 4): mean VO2peak of healthy Norwegians by age group (20–29 … 70+), as a
// straight line through the groups' middles (least squares): men 43.95 at 50
// and 0.384 less a year, women 35.2 and 0.318. A line, not the table's steps:
// between 35 and 45 the men's means differ by 2 ml/kg/min only, so a table
// would move the age by 5 years for 1 ml/kg/min.
const NORMS = { male: { at50: 43.95, perYear: 0.3837 }, female: { at50: 35.2, perYear: 0.3183 } };
const normOf = (sex, age) => NORMS[sex].at50 - NORMS[sex].perYear * (age - 50);
// Fitness age (NTNU's idea): the age whose average VO2max equals this one, kept to 20–90.
export function fitnessAge(vo2, sex) {
  if (!(vo2 > 0)) return null;
  const solve = s => 50 + (NORMS[s].at50 - vo2) / NORMS[s].perYear;
  const age = sex === "male" || sex === "female" ? solve(sex) : (solve("male") + solve("female")) / 2;
  return round1(clamp(age, 20, 90));
}
export const normVo2 = (age, sex) => round1(sex === "male" || sex === "female" ? normOf(sex, age) : (normOf("male", age) + normOf("female", age)) / 2);

// Composite age, WHOOP-style: half of the fitness age's difference from the
// real age, plus years for the habits behind fitness and recovery. The
// weights are Aurin's own, not from a study (to be tuned on testers' data):
// sleep length and regularity, activity minutes (moderate + 2 × vigorous a
// week), gym sessions a week, steps, resting heart rate and body fat or BMI.
// Each part is capped, the whole at ±8 years; needs at least three parts.
export function compositeAge({ age, sex, fitness, sleepHours, sleepSpreadMin, activityMinutes, gymPerWeek, steps, restHr, bodyFat, bmi }) {
  if (!(age > 0) || fitness == null) return null;
  const parts = {};
  if (sleepHours != null) parts.sleep = sleepHours < 6 ? 1.5 : sleepHours < 7 ? 1.5 * (7 - sleepHours) : sleepHours > 9.5 ? 0.5 : 0;
  if (sleepSpreadMin != null) parts.sleepRegularity = sleepSpreadMin <= 30 ? -0.5 : sleepSpreadMin <= 60 ? 0 : sleepSpreadMin <= 90 ? 0.5 : 1;
  if (activityMinutes != null) parts.activity = activityMinutes < 150 ? 2 * (1 - activityMinutes / 150) : activityMinutes < 300 ? -1.5 * (activityMinutes - 150) / 150 : -1.5;
  if (gymPerWeek != null) parts.strength = gymPerWeek >= 2 ? -1 : gymPerWeek >= 1 ? -0.5 : 0.5;
  if (steps != null) parts.steps = steps >= 10000 ? -1 : steps >= 7500 ? -(steps - 7500) / 2500 : steps >= 5000 ? (7500 - steps) / 2500 : 1.5;
  if (restHr != null) parts.restingHeartRate = clamp((restHr - (sex === "female" ? 63 : 60)) * 0.1, -1.5, 1.5);
  const fatFrom = sex === "female" ? 28 : 20;
  if (bodyFat != null) parts.body = bodyFat <= fatFrom ? 0 : bodyFat <= fatFrom + 5 ? (bodyFat - fatFrom) / 5 : clamp(1 + (bodyFat - fatFrom - 5) / 5, 1, 2);
  else if (bmi != null) parts.body = bmi <= 25 ? 0 : bmi <= 30 ? 1.5 * (bmi - 25) / 5 : 2;
  const known = Object.keys(parts);
  if (known.length < 3) return null;
  const habits = clamp(known.reduce((sum, k) => sum + parts[k], 0), -8, 8);
  const value = clamp(age + (fitness - age) / 2 + habits, Math.max(18, age - 15), Math.min(95, age + 15));
  return { value: round1(value), parts: Object.fromEntries(known.map(k => [k, round2(parts[k])])) };
}

// Sleep of the nights: the mean hours asleep and the spread (SD, minutes) of
// the middle of the night; one night per date, its longest sleep, naps out.
// `nights` = [{ date, startTime, endTime, durationMin, nap }].
export function sleepHabits(nights) {
  const byDate = new Map();
  for (const s of nights || []) {
    if (!s?.date || s.nap || !(s.durationMin >= 120)) continue;
    if (!byDate.has(s.date) || byDate.get(s.date).durationMin < s.durationMin) byDate.set(s.date, s);
  }
  const list = [...byDate.values()];
  if (list.length < 10) return { hours: null, spreadMin: null, nights: list.length };
  const hours = list.reduce((sum, s) => sum + s.durationMin, 0) / list.length / 60;
  // The middle of the night on the user's wall clock (a change to summer time or
  // a trip moves the UTC instant, not the habit), in minutes from noon so that
  // midnight is no edge.
  const mids = list.map(s => { const a = Date.parse(s.startTime), b = Date.parse(s.endTime); if (!Number.isFinite(a) || !Number.isFinite(b)) return null; const mid = (a + b) / 2, local = (mid + zoneOffsetMs(mid)) / 60000; return ((local - 720) % 1440 + 1440) % 1440; }).filter(v => v != null);
  const mean = mids.reduce((x, y) => x + y, 0) / mids.length;
  const spread = mids.length >= 10 ? Math.sqrt(mids.reduce((x, y) => x + (y - mean) ** 2, 0) / mids.length) : null;
  return { hours: round2(hours), spreadMin: spread == null ? null : Math.round(spread), nights: list.length };
}

// Activity minutes of the last six weeks per week, moderate (≥ 40 % of the
// reserve, or a ride, run, swim or gym session without heart rate) plus twice
// the vigorous ones (≥ 60 %), and gym sessions per week.
export function activityHabits(sessions, athlete, { weeks = ACTIVITY_DAYS / 7 } = {}) {
  let minutes = 0, gym = 0;
  for (const s of sessions || []) {
    if (!(s.minutes >= 10)) continue;
    if (s.kind === "strength") gym++;
    const r = s.avgHr > 0 ? reserve(s.avgHr, athlete) : null;
    if (r == null ? ["ride", "run", "swim", "strength"].includes(s.kind) : r >= 0.4) minutes += s.minutes * (r != null && r >= 0.6 ? 2 : 1);
  }
  return { minutes: Math.round(minutes / weeks), gymPerWeek: round1(gym / weeks) };
}

// The day's estimate from its inputs, or null when there is nothing to go on.
// inputs = { date, age, sex, height, weight, bodyFat, profileMaxHr, restHrs:
// [daily values of 30 days], sessions (sessionsFromRows, up to `date`),
// sleep (nights of 30 days), steps, previous: { date, vo2max, rideFactor } }.
export function estimateDay(inputs) {
  const { date, age, sex, height, weight } = inputs;
  const from = shift(date, -WINDOW_DAYS + 1), activityFrom = shift(date, -ACTIVITY_DAYS + 1);
  const sessions = (inputs.sessions || []).filter(s => s.date >= from && s.date <= date);
  const restHr = median((inputs.restHrs || []).filter(v => v >= 30 && v <= 110));
  if (restHr == null) return null;
  const observed = observedMaxHr(sessions), profileMax = n(inputs.profileMaxHr);
  const maxHr = Math.max(observed || 0, profileMax || 0) || (age > 0 ? Math.round(208 - 0.7 * age) : null);
  const maxHrSource = observed && observed >= (profileMax || 0) ? "workouts" : profileMax ? "profile" : maxHr ? "age" : null;
  const athlete = { restHr, maxHr, weight };
  const recent = sessions.filter(s => s.date >= activityFrom);
  const pa = activityIndex(recent, athlete);
  const resting = restingEstimate({ age, sex, height, weight, restHr, maxHr, index: pa.index });
  const estimates = sessions.map(s => workoutEstimate(s, athlete)).filter(Boolean);
  const factor = rideFactor(estimates, inputs.previous?.rideFactor);
  let sum = 0, weightSum = 0, workoutWeight = 0;
  const bySport = {};
  for (const e of estimates) {
    const w = e.quality * 0.5 ** (daysBetween(e.date, date) / HALF_LIFE_DAYS);
    const value = e.sport === "ride" ? e.value * factor.value : e.value;
    sum += w * value; weightSum += w; workoutWeight += w;
    const b = bySport[e.sport] ||= { count: 0, weight: 0, sum: 0, values: [] };
    b.count++; b.weight += w; b.sum += w * value; b.values.push(e.value);
  }
  if (resting) { sum += REST_WEIGHT * resting.value; weightSum += REST_WEIGHT; }
  if (!(weightSum > 0)) return null;
  const raw = sum / weightSum;
  const confidence = workoutWeight >= 2 && estimates.length >= 4 && maxHrSource !== "age" ? "high" : workoutWeight >= 0.5 || (resting && maxHrSource !== "age") ? "medium" : "low";
  // Real VO2max moves slowly: at most WEEKLY_CHANGE a week from the last stored
  // value. Not after four weeks without one, not from another model version, and
  // not when today's estimate stands on better data than the stored one (a first
  // row from the resting layer alone must not hold back the workouts for months).
  const prev = inputs.previous, gap = prev?.date && prev.date < date ? daysBetween(prev.date, date) : null;
  const rank = c => ["low", "medium", "high"].indexOf(c);
  const anchored = gap && gap <= 28 && n(prev.vo2max) && (prev.model == null || prev.model === MODEL_VERSION) && (prev.confidence == null || rank(prev.confidence) >= rank(confidence));
  const limit = anchored ? WEEKLY_CHANGE * gap / 7 : null;
  const value = limit == null ? raw : clamp(raw, prev.vo2max - limit, prev.vo2max + limit);
  const fit = fitnessAge(value, sex);
  const habitsActivity = activityHabits(recent, athlete), sleep = sleepHabits(inputs.sleep);
  const bmi = resting?.bmi ?? (height > 100 && weight > 30 ? weight / (height / 100) ** 2 : null);
  const composite = compositeAge({ age, sex, fitness: fit, sleepHours: sleep.hours, sleepSpreadMin: sleep.spreadMin, activityMinutes: habitsActivity.minutes, gymPerWeek: habitsActivity.gymPerWeek, steps: n(inputs.steps), restHr, bodyFat: n(inputs.bodyFat), bmi });
  return {
    date, vo2max: round1(value), confidence, fitnessAge: fit, compositeAge: composite?.value ?? null, rideFactor: factor.value,
    details: {
      model: MODEL_VERSION, raw: round1(raw), restHr: round1(restHr), maxHr, maxHrSource,
      resting: resting ? { ...resting, weight: REST_WEIGHT, activityIndex: pa } : null,
      workouts: Object.fromEntries(Object.entries(bySport).map(([k, b]) => [k, { count: b.count, weight: round2(b.weight), mean: round1(b.sum / b.weight), median: round1(median(b.values)) }])),
      rideFactorLearned: factor.learned,
      composite: composite ? { parts: composite.parts, sleep, activity: habitsActivity } : null
    }
  };
}

// The day's inputs from stored rows, shared by the daily job (own-vo2max-store.js)
// and the validation script: `activityRows` (activity and exercise rows of
// the window), `dailyRows` ({ data_type, value_numeric, sample_time } of
// daily resting heart rate, weight and body fat), `sleepRows` (sleep rows as
// sleepSessionFromRow reads them, already parsed) and the profile.
export function inputsFromRows({ date, profile = {}, activityRows = [], dailyRows = [], nights = [], previous = null }) {
  const end = shift(date, 1), restFrom = shift(date, -29), sleepFrom = shift(date, -29), fatFrom = shift(date, -180);
  const day = r => String(r.sample_time || r.start_time || "").slice(0, 10);
  const sorted = [...dailyRows].filter(r => day(r) && day(r) < end).sort((a, b) => String(a.sample_time).localeCompare(String(b.sample_time)));
  const latest = (type, lo, hi, since = null) => { const r = sorted.filter(x => x.data_type === type && n(x.value_numeric) >= lo && n(x.value_numeric) <= hi && (!since || day(x) >= since)).at(-1); return r ? n(r.value_numeric) : null; };
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(String(profile.birthDate || "")) ? profile.birthDate : null;
  // Full years on the day: one more from the birthday on.
  const age = birth ? Number(date.slice(0, 4)) - Number(birth.slice(0, 4)) - (date.slice(5) < birth.slice(5) ? 1 : 0) : n(profile.age);
  return {
    date, age, sex: profile.sex === "male" || profile.sex === "female" ? profile.sex : null, height: n(profile.height),
    weight: latest("weight", 30, 300), bodyFat: latest("body-fat", 3, 60, fatFrom),
    restHrs: sorted.filter(r => r.data_type === "daily-resting-heart-rate" && day(r) >= restFrom).map(r => n(r.value_numeric)),
    profileMaxHr: n(profile.hrmax), steps: n(profile.averageSteps),
    sessions: sessionsFromRows(activityRows.filter(r => r.record_role !== "duplicate")),
    sleep: (nights || []).filter(s => s?.date >= sleepFrom && s.date <= date),
    previous
  };
}
