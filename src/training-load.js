// Training load without Intervals.icu: the fitness (CTL), fatigue (ATL) and
// form (TSB) the coaches read, computed from the workouts the watch recorded
// (Apple Health or Google Health) and the gym days logged in Aurin.
// GET /app/api/fitness returns these rows when Intervals.icu is not connected,
// so the ride, run and gym coaches, the week plan and the Zátěž screen work the
// same for an athlete with only an Apple Watch.
//
// Each session gets a TSS-like load, 100 = one hour at threshold:
// - a load the source already computed (Intervals.icu) is kept;
// - with average power and FTP: hours × IF² × 100 (Coggan's TSS; the average
//   power slightly understates the normalized power of an uneven ride);
// - with average heart rate: Banister's TRIMP (minutes × HRr × k·e^(b·HRr),
//   k, b = 0.64, 1.92 for men and 0.86, 1.67 for women, Banister 1991) scaled
//   so an hour at the threshold heart rate is 100, which is how TrainingPeaks
//   defines hrTSS;
// - a gym session: session RPE (Foster 2001), see strengthLoad; it goes before
//   the heart rate, which understates lifting (short sets, long rests);
// - anything else without heart rate: an easy hour, 36 for a ride or run and
//   20 for the rest.
// CTL and ATL are exponentially weighted averages with 42- and 7-day time
// constants (Banister's model as TrainingPeaks and Intervals.icu use it), and
// the ramp rate is the change of CTL over 7 days.
//
// With Intervals.icu connected its CTL stays the base and the workouts only
// the watch recorded are added to it (watchOnly, addLoads).
import { estimateStrengthTiming } from "./strength-timing.js";

const n = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = v => Math.round(v * 10) / 10;
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

// The threshold heart rate as a fraction of the heart-rate reserve when no
// LTHR is known. Checked against 38 power-measured rides and runs of the
// owner from August to October 2026 (Intervals.icu's load): 0.82 matches the
// total with no bias, per session r = 0.94 and a mean error of 23.
export const DEFAULT_THRESHOLD_HRR = 0.82;

function trimpWeight(hrr, sex) {
  return sex === "female" ? 0.86 * Math.exp(1.67 * hrr) : 0.64 * Math.exp(1.92 * hrr);
}

// Session RPE for the gym (Foster 2001): the session's RPE (0–10) × its
// minutes in arbitrary units, × SRPE_SCALE for the TSS-like scale. 0.1 keeps
// the earlier fixed value for an ordinary session (an hour at RPE 6 = 36) and
// makes an hour at RPE 10 worth 60: lifting felt as hard loads the heart and
// the endurance fitness less than an hour at threshold (100).
export const SRPE_SCALE = 0.1;
// RPE when the session has none and no volume: a moderate session.
export const DEFAULT_STRENGTH_RPE = 6;
// Without any RPE the volume lifted (kg × reps) stands in: an ordinary hour of
// some 9 t lifted ≈ 36, kept between an easy (RPE 3) and a maximal (RPE 10)
// session of the same length, so a light or bodyweight session (no kg) still
// counts and a big volume does not run away.
export const VOLUME_PER_LOAD = 250;

// The load of a gym session ({minutes, rpe, volume}), null without minutes.
export function strengthLoad(session) {
  const minutes = n(session?.minutes);
  if (!(minutes > 0)) return null;
  const rpe = n(session.rpe), volume = n(session.volume);
  if (rpe != null && rpe > 0) return Math.round(minutes * clamp(rpe, 1, 10) * SRPE_SCALE);
  if (volume > 0) return Math.round(clamp(volume / VOLUME_PER_LOAD, minutes * 3 * SRPE_SCALE, minutes * 10 * SRPE_SCALE));
  return Math.round(minutes * DEFAULT_STRENGTH_RPE * SRPE_SCALE);
}

// The gym sessions of the logged sets (strength_sets rows: workout_date, type,
// exercise, set_no, actual_kg, actual_reps, rpe), one per day:
// - minutes from the sets as the gym planner times them (strength-timing.js:
//   each set's work by its reps, 90 s rest between the sets of an exercise,
//   setting up each station and a few minutes' buffer);
// - RPE as the mean of the working sets' RPE (warm-ups left out), else the
//   athlete's own rating of the day (`ratings`, date → RPE 1–10);
// - the volume, kg × reps of the working sets.
export function gymSessions(sets, ratings = {}) {
  const byDay = new Map();
  for (const s of sets || []) {
    const date = String(s?.workout_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !s.exercise) continue;
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(s);
  }
  const out = [];
  for (const [date, list] of byDay) {
    const rows = list.map(s => [String(s.type || "WORK").toUpperCase() === "WARMUP" ? "WARMUP" : "WORK", s.exercise, s.set_no, s.actual_kg, n(s.actual_reps) > 0 ? String(Math.round(n(s.actual_reps))) : ""]);
    const minutes = estimateStrengthTiming(rows, {}, 0).estimatedMinutes;
    const work = list.filter(s => String(s.type || "WORK").toUpperCase() !== "WARMUP");
    const rpes = work.map(s => n(s.rpe)).filter(v => v != null && v >= 1 && v <= 10);
    const rated = n(ratings[date]);
    const rpe = rpes.length ? Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length * 10) / 10 : rated != null && rated >= 1 && rated <= 10 ? rated : null;
    const volume = Math.round(work.reduce((t, s) => t + (n(s.actual_kg) > 0 && n(s.actual_reps) > 0 ? n(s.actual_kg) * n(s.actual_reps) : 0), 0));
    out.push({ date, kind: "strength", minutes, rpe, volume, sets: list.length });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// The load of one session, or null when its length is unknown.
export function sessionLoad(session, athlete = {}) {
  const minutes = n(session?.minutes);
  const known = n(session?.tss);
  if (known != null && known >= 0) return Math.round(known);
  if (!(minutes > 0)) return null;
  const hours = minutes / 60, kind = session.kind;
  // A gym session with its RPE or the volume logged: session RPE.
  if (kind === "strength" && (n(session.rpe) > 0 || n(session.volume) > 0)) return strengthLoad(session);
  const power = n(session.avgPower), ftp = n(athlete.ftp);
  if (kind === "ride" && power > 0 && ftp > 0) return Math.round(hours * (power / ftp) ** 2 * 100);
  const hr = n(session.avgHr), rest = n(athlete.restHr), max = n(athlete.maxHr);
  if (hr > 0 && rest > 0 && max > rest + 20) {
    const hrr = clamp((hr - rest) / (max - rest), 0, 1);
    const lthr = n(athlete.lthr);
    const threshold = lthr > rest && lthr < max ? (lthr - rest) / (max - rest) : DEFAULT_THRESHOLD_HRR;
    const perMinute = hrr * trimpWeight(hrr, athlete.sex), thresholdPerMinute = threshold * trimpWeight(threshold, athlete.sex);
    return Math.round(minutes * perMinute / (60 * thresholdPerMinute) * 100);
  }
  if (kind === "strength") return strengthLoad(session);
  return Math.round(hours * (kind === "ride" || kind === "run" ? 36 : 20));
}

// Daily loads (date → load) into wellness-like rows from `from` to `to`, the
// shape the Intervals.icu wellness has: {id, ctl, atl, tsb, rampRate, load}.
// The series starts at zero `warmup` days before `from`, so the first rows
// already carry the history before them.
export function loadSeries(dailyLoads, { from, to, warmup = 0 } = {}) {
  const loads = dailyLoads instanceof Map ? dailyLoads : new Map(Object.entries(dailyLoads || {}));
  const start = shift(from, -warmup), kc = 1 - Math.exp(-1 / 42), ka = 1 - Math.exp(-1 / 7);
  const rows = [], history = [];
  let ctl = 0, atl = 0;
  for (let d = start; d <= to; d = shift(d, 1)) {
    const load = n(loads.get(d)) || 0;
    ctl += (load - ctl) * kc;
    atl += (load - atl) * ka;
    history.push(ctl);
    if (d < from) continue;
    const weekAgo = history.length > 7 ? history[history.length - 8] : 0;
    rows.push({ id: d, ctl: round1(ctl), atl: round1(atl), tsb: round1(ctl - atl), rampRate: round1(ctl - weekAgo), load: Math.round(load) });
  }
  return rows;
}

// Sessions ({date, kind, minutes, tss, avgHr, avgPower, rpe}) into daily loads.
export function dailyLoads(sessions, athlete = {}) {
  const out = new Map();
  for (const s of sessions || []) {
    if (!s?.date) continue;
    const load = sessionLoad(s, athlete);
    if (load == null) continue;
    out.set(s.date, (out.get(s.date) || 0) + load);
  }
  return out;
}

// Watch workouts (health_datapoints rows, already parsed by activityFromRow and
// deduplicated) plus their heart rate and power from the payload, and the gym
// sessions logged in Aurin (gymSessions; a bare date is a one-hour session).
// A watch strength workout on a gym day keeps its own length and takes the
// day's RPE and volume; a gym day without one counts as its sets estimate.
export function sessionsFrom(activities, rowsById, gymDays = []) {
  const out = [];
  for (const a of activities || []) {
    let p = {};
    try { p = JSON.parse(rowsById.get(a)?.payload_json || "{}"); } catch { p = {}; }
    const m = p.exercise?.metricsSummary || {};
    out.push({ date: a.date, kind: a.kind, minutes: a.minutes, tss: a.tss, avgHr: n(m.averageHeartRateBeatsPerMinute ?? p.average_heartrate), avgPower: n(m.averagePowerWatts ?? p.icu_average_watts ?? p.average_watts) });
  }
  for (const g of gymDays || []) {
    const gym = typeof g === "string" ? { date: g, kind: "strength", minutes: 60 } : g;
    if (!gym?.date) continue;
    const watch = out.find(s => s.date === gym.date && s.kind === "strength");
    if (watch) { if (watch.rpe == null && gym.rpe != null) watch.rpe = gym.rpe; if (watch.volume == null && gym.volume != null) watch.volume = gym.volume; }
    else out.push({ date: gym.date, kind: "strength", minutes: n(gym.minutes) > 0 ? n(gym.minutes) : 60, rpe: gym.rpe ?? null, volume: gym.volume ?? null });
  }
  return out;
}

// Watch workouts Intervals.icu does not have (Apple Health or Google Health
// only), for its CTL. One recorded by both starts within `minutes` (10) of the
// Intervals.icu activity and is of the same sport ("other" may be any); those
// stay out, as does anything before the first Intervals.icu activity known
// here (older history may simply not be imported yet). Activities are
// activityFromRow results: {start, kind, source} and the start instant.
export function watchOnly(watch, intervals, minutes = 10) {
  const at = a => (Number.isFinite(a?.session?.at) ? a.session.at : Date.parse(String(a?.start || "") + ":00Z"));
  const known = (intervals || []).filter(a => a && Number.isFinite(at(a)));
  if (!known.length) return [];
  const first = Math.min(...known.map(at)) - minutes * 60000;
  const same = (a, b) => !a.kind || !b.kind || a.kind === b.kind || a.kind === "other" || b.kind === "other";
  return (watch || []).filter(w => w && Number.isFinite(at(w)) && at(w) >= first && !known.some(i => same(w, i) && Math.abs(at(w) - at(i)) <= minutes * 60000));
}

// Intervals.icu wellness rows with the load of the watch-only workouts added:
// CTL and ATL are linear in the daily loads, so the series of the extra loads
// (loadSeries, from zero before the history) adds to Intervals.icu's own.
// The day's load (ctlLoad, atlLoad) grows by it as well, and watchLoad says how
// much came from the watch.
export function addLoads(rows, extra) {
  const byDay = new Map((extra || []).map(r => [r.id, r]));
  if (!byDay.size) return rows;
  return (rows || []).map(r => {
    const x = byDay.get(r?.id);
    if (!x || !(x.ctl > 0 || x.atl > 0 || x.load > 0)) return r;
    const ctl = n(r.ctl), atl = n(r.atl), out = { ...r, watchLoad: x.load };
    if (ctl != null) out.ctl = round1(ctl + x.ctl);
    if (atl != null) out.atl = round1(atl + x.atl);
    if (out.ctl != null && out.atl != null && ctl != null && atl != null) out.tsb = round1(out.ctl - out.atl);
    if (n(r.rampRate) != null) out.rampRate = round1(n(r.rampRate) + x.rampRate);
    for (const k of ["ctlLoad", "atlLoad"]) if (n(r[k]) != null) out[k] = n(r[k]) + x.load;
    return out;
  });
}
