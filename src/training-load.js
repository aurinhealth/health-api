// Training load without Intervals.icu: the fitness (CTL), fatigue (ATL) and
// form (TSB) the coaches read, computed from the workouts the watch recorded
// (Apple Health or Google Health) and the gym days logged in Loadwise.
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
// - a gym session: session RPE (Foster 2001) as hours × (RPE/10)² × 100, RPE 6
//   when none was given (≈ 36 an hour);
// - anything else without heart rate: an easy hour, 36 for a ride or run and
//   20 for the rest.
// CTL and ATL are exponentially weighted averages with 42- and 7-day time
// constants (Banister's model as TrainingPeaks and Intervals.icu use it), and
// the ramp rate is the change of CTL over 7 days.

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

// The load of one session, or null when its length is unknown.
export function sessionLoad(session, athlete = {}) {
  const minutes = n(session?.minutes);
  const known = n(session?.tss);
  if (known != null && known >= 0) return Math.round(known);
  if (!(minutes > 0)) return null;
  const hours = minutes / 60, kind = session.kind;
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
  if (kind === "strength") {
    const rpe = clamp(n(session.rpe) ?? 6, 1, 10);
    return Math.round(hours * (rpe / 10) ** 2 * 100);
  }
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
// days that have no recorded workout as a one-hour session.
export function sessionsFrom(activities, rowsById, gymDays = []) {
  const out = [];
  for (const a of activities || []) {
    let p = {};
    try { p = JSON.parse(rowsById.get(a)?.payload_json || "{}"); } catch { p = {}; }
    const m = p.exercise?.metricsSummary || {};
    out.push({ date: a.date, kind: a.kind, minutes: a.minutes, tss: a.tss, avgHr: n(m.averageHeartRateBeatsPerMinute ?? p.average_heartrate), avgPower: n(m.averagePowerWatts ?? p.icu_average_watts ?? p.average_watts) });
  }
  for (const date of gymDays) if (!out.some(s => s.date === date && s.kind === "strength")) out.push({ date, kind: "strength", minutes: 60 });
  return out;
}
