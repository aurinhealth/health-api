// Fitness insights in the spirit of Bevel's 2026 fall release, computed from
// our own data: muscle freshness and muscular load per muscle group, cardio
// focus from heart-rate/power zone times, and personal records.
// The scales are our own estimates, not Bevel's algorithms.
import { EXERCISES, FOCUS_GROUPS } from "./strength-generator.js";
import { normalizeExerciseName } from "./strength-normalization.js";

const DAY = 86400000;
const n = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const iso = v => String(v || "").slice(0, 10);
const daysBetween = (a, b) => (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY;
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

export const MUSCLES = Object.keys(FOCUS_GROUPS);
// Fatigue decays exponentially with a time constant in days, set so that a
// usual session leaves the muscle "recovered" (freshness ≥ 75 %) after about
// 72 h for large muscles worked by multi-joint lifts and about 48 h for the
// rest: most lifters are back within one rep of baseline at 48 h, squat-,
// bench- and deadlift-type lifts often need 72 h (Korak 2015), and muscular
// endurance is restored by 48 h (McLester 2003).
const RECOVERY_DAYS = { quads: 2.4, hamstrings: 2.4, hips: 2.4, lower_back: 2.4, chest: 2.2, upper_back: 2.2, lats: 2.2, front_delts: 2.0, calves: 1.9, side_delts: 1.8, rear_delts: 1.8, biceps: 1.8, triceps: 1.8, traps: 1.8, abs: 1.4, obliques: 1.4, forearms: 1.4 };
// Sets taken to failure (RPE ≥ 9.5) prolong recovery beyond 48 h compared
// with sets that stop short of it (Morán-Navarro 2017).
const FAILURE_RECOVERY = 1.3;
// Primary muscle of the exercise catalog → body-map groups.
const PRIMARY = { chest: ["chest"], back: ["upper_back", "lats"], shoulders: ["front_delts", "side_delts"], quads: ["quads"], hamstrings: ["hamstrings"], glutes: ["hips"], biceps: ["biceps"], triceps: ["triceps"], core: ["abs", "obliques"], adductors: ["hips"], abductors: ["hips"], calves: ["calves"], forearms: ["forearms"], traps: ["traps"], lower_back: ["lower_back"] };
// Secondary muscles by movement pattern (share of the set's load).
const SECONDARY = { push: { triceps: .5, front_delts: .4 }, horizontal_push: { front_delts: .3 }, push_vertical: { triceps: .4, side_delts: .3 }, pull: { biceps: .45, rear_delts: .4 }, pull_vertical: { biceps: .4 }, quad: { hips: .5 }, unilateral_quad: { hips: .6, hamstrings: .2 }, hinge: { hips: .6, upper_back: .2 }, hip_extension: { hamstrings: .3 }, lunge: { quads: .6, hamstrings: .2 }, glute_press: { quads: .5, hamstrings: .3 }, glute_kickback: { hamstrings: .2 } };
// Cardio: share of the activity's training load per muscle group.
const CARDIO = {
  ride: { quads: 1, hips: .6, hamstrings: .4, calves: .35 },
  run: { calves: 1, quads: .8, hamstrings: .7, hips: .6 },
  walk: { calves: .4, quads: .25, hips: .2 }
};

// Which body-map groups an exercise loads, with weights.
export function exerciseMuscles(name) {
  const ex = normalizeExerciseName(name), def = EXERCISES[ex], out = {};
  const focus = Object.entries(FOCUS_GROUPS).filter(([, g]) => g.exercises.includes(ex)).map(([id]) => id);
  const primary = focus.length ? focus : PRIMARY[def?.muscle] || [];
  primary.forEach(id => { out[id] = 1 / Math.max(1, primary.length > 1 && !focus.length ? primary.length * .75 : 1); });
  for (const [id, w] of Object.entries(SECONDARY[def?.pattern] || {})) if (!out[id]) out[id] = w;
  return out;
}

export function activityKind(a) {
  const t = String(a?.type || a?.payload?.type || "").toLowerCase();
  if (/weight|strength/.test(t)) return "strength";
  if (/ride|cycl|bike/.test(t)) return "ride";
  if (/run/.test(t)) return "run";
  if (/walk|hike/.test(t)) return "walk";
  return null;
}

// Muscle load events: hard sets (weighted by exercise fatigue and RPE) and cardio load.
export function muscleEvents({ sets = [], activities = [] } = {}) {
  const events = [];
  for (const s of sets) {
    const date = iso(s.workout_date || s.date); if (!date) continue;
    const def = EXERCISES[normalizeExerciseName(s.exercise)];
    const rpe = n(s.rpe, NaN), effort = Number.isFinite(rpe) && rpe > 0 ? Math.min(1.5, Math.max(.4, (rpe - 4) / 4)) : 1;
    const load = 10 * n(def?.fatigue, 1) * effort;
    const failure = Number.isFinite(rpe) && rpe >= 9.5;
    for (const [muscle, w] of Object.entries(exerciseMuscles(s.exercise))) events.push({ date, muscle, load: load * w, source: "strength", ...(failure ? { failure } : {}) });
  }
  for (const a of activities) {
    const kind = activityKind(a), shares = CARDIO[kind]; if (!shares) continue;
    const date = iso(a.date || a.start), hours = n(a.durationHours, n(a.moving_time) / 3600);
    const tss = n(a.tss, n(a.icu_training_load, kind === "walk" ? hours * 20 : hours * 50));
    for (const [muscle, w] of Object.entries(shares)) events.push({ date, muscle, load: tss * .35 * w, source: kind });
  }
  return events.filter(e => e.date && e.load > 0);
}

const STATUS_FRESH = f => f >= 75 ? "recovered" : f >= 35 ? "fatigued" : "depleted";
// Freshness 1–100 %: fatigue decays exponentially; it is measured against the
// muscle's typical training-day load over the last six weeks.
export function muscleFreshness(events, today) {
  const out = {};
  for (const muscle of MUSCLES) {
    const own = events.filter(e => e.muscle === muscle && daysBetween(e.date, today) >= 0 && daysBetween(e.date, today) < 42);
    const byDay = new Map(); for (const e of own) byDay.set(e.date, (byDay.get(e.date) || 0) + e.load);
    const days = [...byDay.values()].sort((a, b) => a - b), trainingDays = days.length;
    if (trainingDays < 3) { out[muscle] = { status: "calibrating", trainingDays, freshness: null }; continue; }
    const baseline = days[Math.floor(days.length / 2)] || 1, tau = RECOVERY_DAYS[muscle] || 1.3;
    // Training of the day counts as done at the end of the day: half a day of recovery by now.
    const fatigue = own.reduce((s, e) => s + e.load * Math.exp(-(daysBetween(e.date, today) + .25) / (tau * (e.failure ? FAILURE_RECOVERY : 1))), 0);
    const freshness = Math.max(1, Math.min(100, Math.round(100 * Math.exp(-fatigue / (1.25 * baseline)))));
    out[muscle] = { status: STATUS_FRESH(freshness), freshness, trainingDays, lastTrained: [...byDay.keys()].sort().at(-1) };
  }
  return out;
}

// Muscular load: last 7 days against the weekly average of the last 6 weeks.
function loadStatus(acute, chronic, previousRatio) {
  const ratio = chronic > 0 ? acute / chronic : 0;
  const status = ratio > 1.5 ? "overtraining" : ratio >= .9 ? "productive" : ratio >= .6 ? (previousRatio > 1 ? "peaking" : "maintaining") : "detraining";
  return { acute: Math.round(acute), chronic: Math.round(chronic), ratio: round(ratio, 2), status, range: [Math.round(chronic * .9), Math.round(chronic * 1.3)] };
}
export function muscularLoad(events, today) {
  const within = (e, from, to) => { const d = daysBetween(e.date, today); return d >= from && d < to; };
  const sum = (list, from, to) => list.filter(e => within(e, from, to)).reduce((s, e) => s + e.load, 0);
  const build = list => {
    const trainingDays = new Set(list.filter(e => within(e, 0, 42)).map(e => e.date)).size;
    const acute = sum(list, 0, 7), chronic = sum(list, 0, 42) / 6, previous = sum(list, 7, 14), previousChronic = sum(list, 7, 49) / 6;
    return { ...loadStatus(acute, chronic, previousChronic > 0 ? previous / previousChronic : 0), trainingDays };
  };
  const overall = build(events);
  if (overall.trainingDays < 10) overall.status = "calibrating";
  // Daily 7-day rolling load for the chart (last 42 days).
  overall.series = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(Date.parse(today + "T12:00:00Z") - (41 - i) * DAY).toISOString().slice(0, 10);
    return { date, load: Math.round(events.filter(e => { const d = daysBetween(e.date, date); return d >= 0 && d < 7; }).reduce((s, e) => s + e.load, 0)) };
  });
  const perMuscle = Object.fromEntries(MUSCLES.map(m => { const r = build(events.filter(e => e.muscle === m)); if (r.trainingDays < 6) r.status = "calibrating"; return [m, r]; }));
  return { overall, perMuscle };
}

// Cardio Focus: zone time weighted by intensity, Low aerobic (Z1–Z2),
// High aerobic (Z3–Z4) and Anaerobic (Z5+), for the last `days` days.
const ZONE_WEIGHT = [1, 1.5, 2.5, 3.5, 5, 6, 7];
function zoneSeconds(a) {
  const p = a.payload || a;
  const hr = Array.isArray(p.icu_hr_zone_times) ? p.icu_hr_zone_times.map(Number) : null;
  if (hr && hr.some(v => v > 0)) return hr;
  const power = Array.isArray(p.icu_zone_times) ? p.icu_zone_times.filter(z => /^Z\d/.test(String(z.id))).map(z => n(z.secs)) : null;
  return power && power.some(v => v > 0) ? power : null;
}
export function cardioFocus(activities, today, days = 28) {
  const buckets = { low: 0, high: 0, anaerobic: 0 }, weeks = [0, 1, 2, 3].map(() => ({ low: 0, high: 0, anaerobic: 0 }));
  let counted = 0, minutes = 0;
  for (const a of activities) {
    const age = daysBetween(iso(a.date || a.start), today); if (!(age >= 0 && age < days)) continue;
    const zones = zoneSeconds(a); if (!zones) continue;
    counted++;
    zones.forEach((secs, i) => {
      const key = i <= 1 ? "low" : i <= 3 ? "high" : "anaerobic", points = secs / 60 * (ZONE_WEIGHT[i] || 7);
      minutes += secs / 60; buckets[key] += points; const w = weeks[Math.min(3, Math.floor(age / 7))]; w[key] += points;
    });
  }
  const total = buckets.low + buckets.high + buckets.anaerobic;
  const pct = k => total ? Math.round(buckets[k] / total * 100) : 0;
  const focus = total ? Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0] : null;
  return { days, activities: counted, minutes: Math.round(minutes), points: Math.round(total), focus, percent: { low: pct("low"), high: pct("high"), anaerobic: pct("anaerobic") }, weeks: weeks.reverse().map(w => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v)]))) };
}

// Strength records per exercise. Estimated 1RM (Epley) only from sets up to 12 reps.
export function strengthRecords(sets, today, recentDays = 14) {
  const by = new Map();
  for (const s of sets) {
    const ex = normalizeExerciseName(s.exercise), kg = n(s.actual_kg), reps = n(s.actual_reps), date = iso(s.workout_date || s.date);
    if (!ex || !date || !(reps > 0)) continue;
    const r = by.get(ex) || { exercise: ex, sessions: new Map() }; by.set(ex, r);
    const better = (key, value, extra = {}) => { if (value > 0 && (!r[key] || value > r[key].value)) r[key] = { value: round(value, 1), date, ...extra }; };
    if (kg > 0 && reps <= 12) better("e1rm", kg * (1 + reps / 30), { kg, reps });
    better("heaviest", kg, { reps });
    better("setVolume", kg * reps, { kg, reps });
    better("setReps", reps + kg / 1000, { kg, reps });
    r.sessions.set(date, (r.sessions.get(date) || 0) + kg * reps);
  }
  const list = [...by.values()].map(r => {
    let best = null; for (const [date, v] of r.sessions) if (v > 0 && (!best || v > best.value)) best = { value: Math.round(v), date };
    const out = { exercise: r.exercise, e1rm: r.e1rm || null, heaviest: r.heaviest || null, setVolume: r.setVolume || null, sessionVolume: best, setReps: r.setReps ? { ...r.setReps, value: Math.floor(r.setReps.value) } : null };
    out.recent = ["e1rm", "heaviest", "setVolume", "sessionVolume", "setReps"].filter(k => out[k] && daysBetween(out[k].date, today) >= 0 && daysBetween(out[k].date, today) < recentDays);
    return out;
  });
  return list.sort((a, b) => (b.recent.length - a.recent.length) || ((b.e1rm?.value || 0) - (a.e1rm?.value || 0)));
}

// Cardio records from activity summaries (no streams needed).
export function cardioRecords(activities) {
  const best = (list, value, minimum = 0) => list.map(a => ({ a, v: value(a) })).filter(x => Number.isFinite(x.v) && x.v > minimum).sort((x, y) => y.v - x.v)[0] || null;
  const field = (a, k) => n(a[k] ?? a.payload?.[k], NaN);
  const rides = activities.filter(a => activityKind(a) === "ride"), runs = activities.filter(a => activityKind(a) === "run");
  const pack = (x, unit, format) => x ? { value: format(x.v), unit, date: iso(x.a.date || x.a.start), name: x.a.name || (x.a.payload || {}).name || null } : null;
  const fastest = best(runs.filter(a => field(a, "distance") >= 5000), a => field(a, "distance") / field(a, "moving_time"));
  return {
    longestRide: pack(best(rides, a => field(a, "distance") / 1000), "km", v => round(v, 1)),
    mostElevation: pack(best(rides, a => field(a, "total_elevation_gain")), "m", Math.round),
    bestRidePower: pack(best(rides.filter(a => field(a, "moving_time") >= 1200), a => field(a, "icu_weighted_avg_watts")), "W", Math.round),
    longestRideTime: pack(best(rides, a => field(a, "moving_time") / 3600), "h", v => round(v, 1)),
    longestRun: pack(best(runs, a => field(a, "distance") / 1000), "km", v => round(v, 1)),
    fastestRun5k: fastest ? { value: Math.round(1000 / fastest.v), unit: "s/km", date: iso(fastest.a.date || fastest.a.start), name: fastest.a.name || null } : null
  };
}

// ---- Records over a period ----------------------------------------------------
// Periods: the last 1, 3 or 6 months, one calendar year, or all data stored in
// the app ("all": since the oldest synced or imported record). A record is the
// best value inside the period; its change is against the best before the
// period, or against the first session when the data starts inside it.
const shiftMonths = (date, months) => { const d = new Date(date + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() - months); return d.toISOString().slice(0, 10); };
export function recordPeriods(today, dates = []) {
  const known = dates.filter(Boolean).sort(), years = [...new Set(known.map(d => d.slice(0, 4)))].sort().reverse();
  if (!years.includes(today.slice(0, 4))) years.unshift(today.slice(0, 4));
  const periods = {};
  for (const m of [1, 3, 6]) periods[m + "m"] = { kind: "months", months: m, label: m + (m === 1 ? " měsíc" : m <= 4 ? " měsíce" : " měsíců"), start: shiftMonths(today, m), end: today };
  for (const y of years) periods["y" + y] = { kind: "year", year: Number(y), label: y, start: y + "-01-01", end: y === today.slice(0, 4) ? today : y + "-12-31" };
  periods.all = { kind: "all", label: "Vše", start: known[0] || today, end: today };
  return periods;
}
// points: [{date, value}]; better(a, b): a beats b.
export function periodChange(points, { start, end, kind }, better) {
  const sorted = [...points].filter(p => p.date && Number.isFinite(p.value) && p.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const best = list => list.reduce((x, p) => !x || better(p.value, x.value) ? p : x, null);
  const inside = kind === "all" ? sorted : sorted.filter(p => p.date >= start), before = kind === "all" ? [] : sorted.filter(p => p.date < start);
  if (!inside.length) return null;
  const now = best(inside), from = before.length ? best(before) : best(inside.filter(p => p.date === inside[0].date));
  return { value: now.value, date: now.date, from: from.value, fromDate: from.date, basis: before.length ? "before" : "first", delta: round(now.value - from.value, 1) };
}
// FTP is a setting: the value in force at the end of the period against the one at its start.
function settingChange(points, { start, end, kind }) {
  const sorted = points.filter(p => p.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  const now = sorted.at(-1), before = kind === "all" ? [] : sorted.filter(p => p.date < start), from = before.at(-1) || sorted.find(p => kind === "all" || p.date >= start);
  if (!from || (kind !== "all" && now.date < start && !before.length)) return null;
  return { value: now.value, date: now.date, from: from.value, fromDate: from.date, basis: before.length ? "before" : "first", delta: now.value - from.value };
}
export function recordTrends({ sets = [], activities = [], today }) {
  const field = (a, k) => n(a[k] ?? a.payload?.[k], NaN), dateOf = a => iso(a.date || a.start);
  const rides = activities.filter(a => activityKind(a) === "ride"), runs = activities.filter(a => activityKind(a) === "run");
  const lifts = sets.map(x => ({ exercise: normalizeExerciseName(x.exercise), kg: n(x.actual_kg), reps: n(x.actual_reps), date: iso(x.workout_date || x.date) })).filter(x => x.exercise && x.date && x.kg > 0 && x.reps > 0);
  const periods = recordPeriods(today, [...lifts.map(x => x.date), ...rides.map(dateOf), ...runs.map(dateOf)]);
  const each = fn => Object.fromEntries(Object.entries(periods).map(([k, p]) => [k, fn(p)]));
  const higher = (a, b) => a > b, lower = (a, b) => a < b;
  const byExercise = new Map();
  for (const x of lifts) { if (!byExercise.has(x.exercise)) byExercise.set(x.exercise, []); byExercise.get(x.exercise).push({ date: x.date, value: x.kg, reps: x.reps }); }
  const strength = [...byExercise].map(([exercise, points]) => {
    const change = each(p => { const c = periodChange(points, p, higher); return c && { ...c, reps: points.find(x => x.date === c.date && x.value === c.value)?.reps ?? null }; });
    return { exercise, change };
  }).sort((a, b) => (b.change.all?.date || "").localeCompare(a.change.all?.date || "") || (b.change.all?.value || 0) - (a.change.all?.value || 0));
  const series = (list, value, minimum = 0) => list.map(a => ({ date: dateOf(a), value: value(a) })).filter(p => Number.isFinite(p.value) && p.value > minimum);
  // FTP only for riders with power data; otherwise the number means nothing.
  const powered = rides.some(a => field(a, "icu_weighted_avg_watts") > 0 || field(a, "average_watts") > 0);
  const metric = (points, unit, better) => points.length ? { unit, change: each(p => periodChange(points, p, better)) } : null;
  const ftpPoints = powered ? series(rides, a => field(a, "icu_ftp")) : [];
  const cardio = {
    ftp: ftpPoints.length ? { unit: "W", change: each(p => settingChange(ftpPoints, p)) } : null,
    runPace: metric(series(runs.filter(a => field(a, "distance") >= 5000), a => Math.round(field(a, "moving_time") / (field(a, "distance") / 1000))), "s/km", lower),
    longestRide: metric(series(rides, a => round(field(a, "distance") / 1000, 1)), "km", higher),
    mostElevation: metric(series(rides, a => Math.round(field(a, "total_elevation_gain"))), "m", higher),
    longestRun: metric(series(runs, a => round(field(a, "distance") / 1000, 1)), "km", higher)
  };
  return { periods, defaultPeriod: "1m", strength, cardio };
}

export function fitnessInsights({ sets = [], activities = [], today }) {
  const events = muscleEvents({ sets, activities });
  const lastYear = new Date(Date.parse(today + "T12:00:00Z") - 365 * DAY).toISOString().slice(0, 10);
  return { status: "ok", date: today, muscles: { freshness: muscleFreshness(events, today), load: muscularLoad(events, today) }, cardioFocus: cardioFocus(activities, today), records: { strength: strengthRecords(sets, today), cardio: cardioRecords(activities.filter(a => iso(a.date || a.start) >= lastYear)), trends: recordTrends({ sets, activities, today }) } };
}

// Server side: strength history and the last year of activities from D1.
// All stored history, so any year and "Vše" can be shown: the strength log and
// every synced activity (Intervals.icu sends the last year at connection and
// the app keeps what it has synced since).
export async function loadFitnessInsights(db, today) {
  const since = "2000-01-01";
  const [setRows, activityRows] = await Promise.all([
    db.prepare("SELECT workout_date,exercise,actual_kg,actual_reps,rpe FROM strength_sets WHERE user_id=? AND completed=1 AND type='WORK' ORDER BY workout_date").bind(db.userId).all().catch(() => ({ results: [] })),
    db.prepare("SELECT source_family,start_time,payload_json FROM health_datapoints WHERE user_id=? AND ((source_family='intervals' AND data_type='activity') OR (source_family='google-wearables' AND data_type='exercise')) AND start_time>=? AND (record_role IS NULL OR record_role!='duplicate')").bind(db.userId, since).all()
  ]);
  const activities = (activityRows.results || []).map(r => {
    let p = {}; try { p = JSON.parse(r.payload_json || "{}"); } catch {}
    if (r.source_family === "google-wearables") {
      const ex = p.exercise || {}, type = { WALKING: "Walk", RUNNING: "Run", BIKING: "Ride", HIKING: "Hike", WEIGHTLIFTING: "WeightTraining", STRENGTH_TRAINING: "WeightTraining" }[ex.exerciseType] || ex.exerciseType;
      const secs = Number(String(ex.activeDuration || "").replace(/s$/, "")) || null;
      return { source: "google", type, date: iso(r.start_time), name: ex.displayName || type, moving_time: secs, distance: n(ex.metricsSummary?.distanceMillimeters) / 1000 || null };
    }
    return { ...p, source: "intervals", type: p.type, date: iso(p.start_date_local || r.start_time), name: p.name, tss: p.icu_training_load, payload: p };
  });
  // A Google exercise that Intervals also has would count twice: keep cardio from Intervals.
  const intervalsDays = new Set(activities.filter(a => a.source === "intervals").map(a => a.date + activityKind(a)));
  return fitnessInsights({ sets: setRows.results || [], activities: activities.filter(a => a.source === "intervals" || !intervalsDays.has(a.date + activityKind(a))), today });
}
