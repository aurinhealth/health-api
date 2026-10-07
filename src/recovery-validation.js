// Does the recovery index say something about how training goes? For each
// training day the morning recovery score is paired with how the session went:
//  - efficiency factor (normalized power or pace per heart beat, Coggan; from
//    Intervals.icu) as a z-score within the sport: better recovered → more
//    output for the same heart rate;
//  - session RPE against what its intensity predicts (residual of a
//    least-squares fit of RPE on the intensity factor): better recovered →
//    the same session feels easier.
// One athlete: Pearson r with a 95 % CI (Fisher z). Several athletes:
// repeated-measures correlation, which uses only within-person variation
// (Bakdash & Marusich 2017), so athletes with different baselines do not
// create a correlation of their own.
import { recoveryReadiness, mergeWellnessRows } from "./recovery-model.js";

const finite = v => v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

function fisherCi(r, df) {
  if (!(df > 1) || Math.abs(r) >= 1) return null;
  const z = Math.atanh(r), se = 1 / Math.sqrt(df - 1);
  return [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)].map(v => Math.round(v * 100) / 100);
}

export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 4) return { n, r: null, ci: null };
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!(sxx > 0 && syy > 0)) return { n, r: null, ci: null };
  const r = sxy / Math.sqrt(sxx * syy);
  return { n, r: Math.round(r * 100) / 100, ci: fisherCi(r, n - 2) };
}

// Repeated-measures correlation (Bakdash & Marusich 2017): x and y centred on
// each person's own means; degrees of freedom N − k − 1.
export function repeatedMeasuresCorrelation(groups) {
  let sxy = 0, sxx = 0, syy = 0, n = 0, k = 0;
  for (const g of groups || []) {
    const pairs = (g || []).filter(p => finite(p.x) != null && finite(p.y) != null);
    if (pairs.length < 3) continue;
    const mx = mean(pairs.map(p => p.x)), my = mean(pairs.map(p => p.y));
    for (const p of pairs) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
    n += pairs.length; k++;
  }
  const df = n - k - 1;
  if (!(sxx > 0 && syy > 0) || df < 3) return { n, athletes: k, r: null, ci: null, df };
  const r = sxy / Math.sqrt(sxx * syy);
  return { n, athletes: k, r: Math.round(r * 100) / 100, ci: fisherCi(r, df), df };
}

const sportOf = a => { const t = String(a.type || "").toLowerCase(); return /ride|cycl|bike/.test(t) ? "ride" : /run/.test(t) ? "run" : null; };

// Day-level pairs: recovery score of the morning, the efficiency z-score and
// the RPE residual of that day's rides and runs (mean when there are several).
export function validationPairs({ rows = [], nights = [], activities = [], sleepNeed = 480 } = {}) {
  const sessions = activities.map(a => ({ date: String(a.start_date_local || a.date || "").slice(0, 10), sport: sportOf(a), ef: finite(a.icu_efficiency_factor), rpe: finite(a.icu_rpe ?? a.rpe), intensity: finite(a.icu_intensity) })).filter(s => s.date && s.sport);
  // Efficiency as a z-score within the sport.
  for (const sport of ["ride", "run"]) {
    const list = sessions.filter(s => s.sport === sport && s.ef > 0), m = list.length ? mean(list.map(s => s.ef)) : 0;
    const sd = list.length > 2 ? Math.sqrt(list.reduce((t, s) => t + (s.ef - m) ** 2, 0) / (list.length - 1)) : 0;
    for (const s of list) s.efZ = sd > 0 ? (s.ef - m) / sd : null;
  }
  // RPE against intensity (IF as %); a session without IF keeps no residual.
  const fit = sessions.filter(s => s.rpe > 0 && s.intensity > 0);
  if (fit.length >= 5) {
    const mx = mean(fit.map(s => s.intensity)), my = mean(fit.map(s => s.rpe)), sxx = fit.reduce((t, s) => t + (s.intensity - mx) ** 2, 0);
    const b = sxx > 0 ? fit.reduce((t, s) => t + (s.intensity - mx) * (s.rpe - my), 0) / sxx : 0, a = my - b * mx;
    for (const s of fit) s.rpeResidual = s.rpe - (a + b * s.intensity);
  }
  const nightFor = d => nights.find(n => (n.date || String(n.endTime || "").slice(0, 10)) === d && !n.nap) || null;
  const byDate = new Map();
  for (const s of sessions) (byDate.get(s.date) || byDate.set(s.date, []).get(s.date)).push(s);
  const pairs = [];
  for (const [date, list] of [...byDate].sort((x, y) => x[0].localeCompare(y[0]))) {
    const r = recoveryReadiness({ rows, date, night: nightFor(date), sleepNeed });
    if (r.score == null) continue;
    const ef = list.map(s => s.efZ).filter(v => v != null), rpe = list.map(s => s.rpeResidual).filter(v => v != null);
    pairs.push({ date, recovery: r.score, zone: r.zone, efficiencyZ: ef.length ? Math.round(mean(ef) * 100) / 100 : null, rpeResidual: rpe.length ? Math.round(mean(rpe) * 100) / 100 : null });
  }
  return pairs;
}

// What the pairs say: a positive r for efficiency and a negative r for the RPE
// residual support the index. With fewer than 10 days there is no verdict.
export function summarizeValidation(pairs) {
  const of = key => { const p = pairs.filter(x => x[key] != null); return pearson(p.map(x => x.recovery), p.map(x => x[key])); };
  const efficiency = of("efficiencyZ"), rpe = of("rpeResidual");
  const verdict = (c, sign) => c.r == null || c.n < 10 ? "insufficient_data" : c.ci && (sign > 0 ? c.ci[0] > 0 : c.ci[1] < 0) ? "supports" : c.ci && (sign > 0 ? c.ci[1] < 0 : c.ci[0] > 0) ? "contradicts" : "inconclusive";
  return { days: pairs.length, efficiency: { ...efficiency, expected: "positive", verdict: verdict(efficiency, 1) }, rpeResidual: { ...rpe, expected: "negative", verdict: verdict(rpe, -1) } };
}

// The signed-in athlete's validation over the last `days` (≤ 120) days.
// fitness: Intervals.icu wellness rows; sleep: sessions from /app/api/sleep.
export async function loadRecoveryValidation(db, { today, days = 120, intervalsWellness = [], sleepSessions = [] }) {
  const shift = d => new Date(Date.parse(today + "T12:00:00Z") + d * 86400000).toISOString().slice(0, 10);
  const from = shift(-days), baselineFrom = shift(-days - 61);
  const { googleHealthSummary } = await import("./google-dashboard.js");
  const daily = await db.prepare("SELECT data_type,sample_time,start_time,end_time,value_numeric,payload_json FROM health_datapoints WHERE user_id = ? AND source_family='google-wearables' AND record_role='primary' AND data_type IN ('daily-resting-heart-rate','daily-heart-rate-variability','daily-respiratory-rate','daily-sleep-temperature-derivations') AND COALESCE(sample_time,end_time,start_time,'')>=? ORDER BY id LIMIT 20000").bind(db.userId, baselineFrom).all();
  const rows = mergeWellnessRows(googleHealthSummary(daily.results || [], today).wellness, intervalsWellness);
  const acts = await db.prepare("SELECT payload_json FROM health_datapoints WHERE user_id = ? AND source_family='intervals' AND data_type='activity' AND start_time >= ? AND (record_role IS NULL OR record_role!='duplicate')").bind(db.userId, from).all();
  const activities = (acts.results || []).map(r => { try { return JSON.parse(r.payload_json); } catch { return null; } }).filter(Boolean);
  const pairs = validationPairs({ rows, nights: sleepSessions, activities });
  return { status: "ok", from, to: today, method: "Pearson r (95 % CI, Fisher z) between the morning recovery score and same-day efficiency factor z-score / RPE residual; across athletes use repeated-measures correlation.", summary: summarizeValidation(pairs), pairs };
}
