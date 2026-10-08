// One recovery, sleep and strain model for the dashboard and the coaches.
// Every rule here is tied to a published method; docs/methodology.md lists the
// sources. The functions are self-contained (no imports, no module constants)
// because the dashboard client carries an exact copy of them (see
// RECOVERY_MODEL_FUNCTIONS and tests/recovery-model.test.mjs).

// Mean and standard deviation of a wellness field over the `days` before
// `date` (not the day itself). `log` uses ln values, as for HRV (lnRMSSD).
export function personalBaseline(rows, date, key, options) {
  const days = (options && options.days) || 60, min = (options && options.min) || 14, log = !!(options && options.log);
  const end = Date.parse(date + "T12:00:00Z"), values = [];
  for (const r of rows || []) {
    if (!r || !(r.id < date)) continue;
    const age = (end - Date.parse(r.id + "T12:00:00Z")) / 86400000, v = Number(r[key]);
    if (age > days || !Number.isFinite(v) || v <= 0) continue;
    values.push(log ? Math.log(v) : v);
  }
  if (values.length < min) return { count: values.length, mean: null, sd: null };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
  return { count: values.length, mean, sd };
}

// Sleep need in minutes. Adults 18–64 need 7–9 h, 65+ 7–8 h (National Sleep
// Foundation, Hirshkowitz 2015); the midpoint is the start, as in Garmin's
// Sleep Coach. A hard day adds up to 30 min: athletes are advised the upper
// end of the range after heavy training (Walsh 2021 consensus).
export function sleepNeedMinutes(options) {
  const age = options && options.age != null ? Number(options.age) : null, strain = options && options.strain != null ? Number(options.strain) : null;
  let need = age != null && age >= 65 ? 450 : 480;
  if (strain >= 18) need += 30; else if (strain >= 14) need += 15;
  return Math.max(420, Math.min(540, need));
}

// Sleep debt over the last 7 days. Deficits add up night after night (Van
// Dongen 2003); a day's naps count as sleep, as WHOOP counts them; a long day
// of sleep pays back at most one hour.
export function sleepDebtMinutes(nights, date, need) {
  const want = need || 480, end = Date.parse(date + "T12:00:00Z"), byDay = new Map();
  for (const s of nights || []) {
    const d = s && (s.date || String(s.endTime || "").slice(0, 10));
    const age = d ? (end - Date.parse(d + "T12:00:00Z")) / 86400000 : NaN;
    if (age >= 0 && age <= 6 && Number(s.durationMin) > 0) byDay.set(d, (byDay.get(d) || 0) + Number(s.durationMin));
  }
  if (!byDay.size) return null;
  const days = [...byDay.values()];
  const net = days.reduce((s, m) => s + Math.max(-60, want - m), 0);
  return { minutes: Math.max(0, Math.round(net)), nights: days.length, average: days.reduce((s, m) => s + m, 0) / days.length, need: want };
}

// HRV status low: the 7-day lnRMSSD average up to `date` below the 60-day
// baseline before that week by more than the smallest worthwhile change, the
// equivalent of Garmin's "unbalanced/low" HRV status (Plews 2012).
export function hrvStatusLow(rows, date) {
  const end = Date.parse(date + "T12:00:00Z"), start = new Date(end - 6 * 86400000).toISOString().slice(0, 10);
  const week = (rows || []).filter(r => r && r.id >= start && r.id <= date && Number(r.hrv) > 0).map(r => Math.log(Number(r.hrv)));
  const base = personalBaseline(rows, start, "hrv", { log: true });
  if (week.length < 3 || base.mean == null) return false;
  return week.reduce((s, v) => s + v, 0) / week.length < base.mean - 0.5 * Math.max(base.sd, 0.05);
}

// Sleep need for the night that ends on `date`, from what Garmin's Sleep
// Coach uses (age, the day's activity, sleep history, naps, HRV status) and
// within its 7–9 h: the age baseline and the strain of the day before
// (sleepNeedMinutes), +15 min when the HRV status is low, a quarter of the
// 7-day sleep debt up to 30 min (more sleep opportunity under high load and
// after restricted sleep, Walsh 2021; repaying debt, as WHOOP adds it), and
// minus the day's naps (WHOOP and Garmin both lower the need by a nap), never
// under 7 h. The +15 and the quarter of the debt are our calibration: neither
// Garmin nor WHOOP publishes its amounts.
export function sleepNeedFor(input) {
  const date = input.date, prev = new Date(Date.parse(date + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
  const rows = input.rows || [], sessions = input.sessions || [];
  const prevRow = rows.find(r => r && r.id === prev);
  const strain = input.strain != null ? input.strain : (prevRow ? strainScore(heartRateLoad(prevRow.hrZoneMinutes)) : null);
  const base = sleepNeedMinutes({ age: input.age, strain });
  const hrv = hrvStatusLow(rows, prev) ? 15 : 0;
  const debtState = sleepDebtMinutes(sessions.filter(s => (s.date || String(s.endTime || "").slice(0, 10)) <= prev), prev, sleepNeedMinutes({ age: input.age }));
  const debt = debtState ? Math.min(30, Math.round(debtState.minutes / 4)) : 0;
  const naps = sessions.filter(s => (s.nap || Number(s.durationMin) < 180) && (s.date || String(s.endTime || "").slice(0, 10)) === prev).reduce((t, s) => t + (Number(s.durationMin) || 0), 0);
  const need = Math.max(420, Math.min(540, base + hrv + debt) - Math.round(naps));
  return { need, base, hrv, debt, naps: Math.round(naps) };
}
// When to go to bed for the night after `date`, as WHOOP's Sleep Planner
// does: wake at the usual time and spend in bed the night's need plus the
// usual time awake in bed. The wake time is the median of the last 14 nights
// of the same kind of morning (work day or weekend, all nights when fewer
// than 3), the efficiency the median of asleep / in bed (0.8–0.97, 0.9
// without data). `nights` are primary nights with their wake-up date and
// local wake time in minutes after midnight (wakeMin).
export function bedtimePlan(input) {
  const date = input.date, need = Number(input.need) || 480, end = Date.parse(date + "T12:00:00Z");
  const morning = new Date(end + 86400000).getUTCDay(), weekend = d => [0, 6].includes(new Date(Date.parse(d + "T12:00:00Z")).getUTCDay());
  const recent = (input.nights || []).filter(n => {
    const age = n && n.date ? (end - Date.parse(n.date + "T12:00:00Z")) / 86400000 : NaN;
    return age >= -1 && age <= 13 && Number.isFinite(Number(n.wakeMin)) && Number(n.durationMin) > 0;
  });
  if (!recent.length) return null;
  const median = xs => { const v = [...xs].sort((a, b) => a - b), m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const alike = recent.filter(n => weekend(n.date) === [0, 6].includes(morning)), wakeNights = alike.length >= 3 ? alike : recent;
  const wake = Math.round(median(wakeNights.map(n => Number(n.wakeMin))));
  const ratios = recent.filter(n => Number(n.timeInBedMin) >= Number(n.durationMin)).map(n => Number(n.durationMin) / Number(n.timeInBedMin));
  const efficiency = ratios.length ? Math.max(0.8, Math.min(0.97, median(ratios))) : 0.9;
  const inBed = Math.round(need / efficiency / 5) * 5;
  return { wake, inBed, need, efficiency, bed: ((Math.round((wake - inBed) / 5) * 5) % 1440 + 1440) % 1440, nights: wakeNights.length, weekend: [0, 6].includes(morning) };
}
// Sleep index 0–100: duration against the personal need (50, from none at
// half the need to full at the need: under 6 h is not recommended), sleep
// efficiency with full points from 85 % (35; NSF sleep quality, Ohayon 2017)
// and the share of deep and REM sleep against typical adult proportions (15;
// deep ≥ 13 %, REM ≥ 20 %; Ohayon 2004).
// Stages get the least weight: wrist devices stage sleep far less reliably
// than they measure its length. Without stages the rest is rescaled.
export function sleepIndexScore(night, need) {
  if (!night || !(Number(night.durationMin) > 0)) return null;
  const duration = Number(night.durationMin), bed = Number(night.timeInBedMin), want = need || 480;
  if (!(bed >= duration)) return null;
  const durationPoints = 50 * Math.max(0, Math.min(1, (duration / want - 0.5) / 0.5));
  const efficiency = Math.max(0, Math.min(1, (duration / bed - 0.65) / 0.2));
  const latency = Number(night.latencyMin), waso = Number(night.wasoMin);
  const hasLatency = night.latencyMin != null && Number.isFinite(latency), hasWaso = night.wasoMin != null && Number.isFinite(waso);
  // With the device's sleep summary, 35 points split into efficiency (20),
  // falling asleep within 30 min (7.5, none from 60) and wake after sleep
  // onset up to 20 min (7.5, none from 50): the NSF good-quality ranges.
  const efficiencyPoints = hasLatency && hasWaso
    ? 20 * efficiency + 7.5 * Math.max(0, Math.min(1, (60 - latency) / 30)) + 7.5 * Math.max(0, Math.min(1, (50 - waso) / 30))
    : 35 * efficiency;
  const deep = Number(night.stages && night.stages.DEEP), rem = Number(night.stages && night.stages.REM);
  if (!Number.isFinite(deep) || !Number.isFinite(rem)) return Math.round((durationPoints + efficiencyPoints) / 85 * 100);
  const stagePoints = 7.5 * Math.min(1, deep / duration / 0.13) + 7.5 * Math.min(1, rem / duration / 0.2);
  return Math.round(durationPoints + efficiencyPoints + stagePoints);
}

// A component score from a z-score: the personal average is 70 (normal), one
// SD on the bad side 50 and two 30. The personal normal range is the mean ±
// 1 SD; HRV-guided training eases off when a value leaves it (Kiviniemi 2007,
// Javaloyes 2019).
export function recoveryComponentScore(z) {
  return Math.round(Math.max(0, Math.min(100, 70 + 20 * z)));
}

// Recovery 0–100 from the morning signals against the athlete's own 60-day
// baseline: HRV as lnRMSSD (50 %), resting heart rate (25 %) and sleep against
// its need (25 %). HRV leads because it is the most sensitive marker of
// autonomic recovery (Plews 2012, 2013; Buchheit 2014). The 7-day lnRMSSD
// average against the smallest worthwhile change (0.5 SD, Plews 2012;
// Javaloyes 2019) shows the trend. A breathing
// rate clearly above the baseline (≥ 1 breath/min and 2 SD) is an early sign of
// illness and costs 10 points; WHOOP counts respiratory rate the same way, only
// when it changes markedly. A raised skin temperature in sleep costs 10 too.
// Needs 14 days of baseline and at least HRV or resting HR today.
export function recoveryReadiness(input) {
  const rows = (input && input.rows) || [], date = input && input.date, night = input && input.night, need = (input && input.sleepNeed) || 480;
  const today = rows.find(r => r && r.id === date) || {};
  const end = Date.parse(date + "T12:00:00Z"), components = {}, flags = [];
  const hb = personalBaseline(rows, date, "hrv", { log: true });
  if (Number(today.hrv) > 0 && hb.mean != null) {
    const sd = Math.max(hb.sd, 0.05), z = (Math.log(Number(today.hrv)) - hb.mean) / sd;
    const week = rows.filter(r => r && r.id <= date && (end - Date.parse(r.id + "T12:00:00Z")) / 86400000 < 7 && Number(r.hrv) > 0).map(r => Math.log(Number(r.hrv)));
    const diff = week.length >= 3 ? week.reduce((s, v) => s + v, 0) / week.length - hb.mean : null, swc = 0.5 * sd;
    components.hrv = { value: Number(today.hrv), baseline: Math.exp(hb.mean), low: Math.exp(hb.mean - sd), high: Math.exp(hb.mean + sd), z, score: recoveryComponentScore(z), trend: diff == null ? null : diff < -swc ? "down" : diff > swc ? "up" : "stable", days: hb.count };
    if (components.hrv.trend === "down") flags.push("hrv_trend_down");
  }
  const rb = personalBaseline(rows, date, "restingHR");
  if (Number(today.restingHR) > 0 && rb.mean != null) {
    const sd = Math.max(rb.sd, 1.5), z = (Number(today.restingHR) - rb.mean) / sd;
    components.restingHR = { value: Number(today.restingHR), baseline: rb.mean, z, score: recoveryComponentScore(-z), days: rb.count };
  }
  const bb = personalBaseline(rows, date, "respiration");
  if (Number(today.respiration) > 0 && bb.mean != null) {
    const rise = Number(today.respiration) - bb.mean, elevated = rise >= 1 && rise >= 2 * Math.max(bb.sd, 0.3);
    components.respiration = { value: Number(today.respiration), baseline: bb.mean, elevated };
    if (elevated) flags.push("respiration_elevated");
  }
  // Skin temperature in sleep against Google's 30-day baseline: ≥ 0.5 °C and
  // two of its nightly SDs above it is flagged and costs 10 points. Nightly
  // skin temperature from a wearable picks up fever onset, often before
  // symptoms (Smarr 2020); Oura counts the deviation in its readiness. The
  // luteal phase alone raises it by less than this.
  const dev = Number(today.skinTempDeviation);
  if (today.skinTempDeviation != null && Number.isFinite(dev)) {
    const sd = Number(today.skinTempSd), elevated = dev >= 0.5 && (!(sd > 0) || dev >= 2 * sd);
    components.skinTemp = { deviation: dev, sd: sd > 0 ? sd : null, elevated };
    if (elevated) flags.push("skin_temp_elevated");
  }
  const nightDate = night && (night.date || String(night.endTime || "").slice(0, 10));
  if (night && nightDate === date && Number(night.durationMin) > 0) {
    const performance = Math.min(105, Number(night.durationMin) / need * 100);
    components.sleep = { minutes: Number(night.durationMin), need, performance: Math.round(performance), score: Math.round(Math.max(0, Math.min(100, 70 + 2 * (performance - 90)))) };
  }
  const weights = { hrv: 0.5, restingHR: 0.25, sleep: 0.25 };
  const used = Object.keys(weights).filter(k => components[k]);
  const missing = Object.keys(weights).filter(k => !components[k]);
  if (!(components.hrv || components.restingHR) || used.reduce((s, k) => s + weights[k], 0) < 0.5) return { score: null, zone: null, components, flags, missing };
  let score = used.reduce((s, k) => s + weights[k] * components[k].score, 0) / used.reduce((s, k) => s + weights[k], 0);
  if (components.respiration && components.respiration.elevated) score -= 10;
  if (components.skinTemp && components.skinTemp.elevated) score -= 10;
  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, zone: score >= 67 ? "green" : score >= 34 ? "yellow" : "red", components, flags, missing };
}

// Cardiovascular load from time in Google Health's heart-rate zones, weighted
// as Edwards' summated-zone TRIMP (Edwards 1993; validated against session RPE
// by Foster 2001). Google's zones are % of heart-rate reserve (Karvonen); light,
// moderate, vigorous and peak correspond to Edwards' zones 2–5.
export function heartRateLoad(zoneMinutes) {
  if (!zoneMinutes) return null;
  const z = zoneMinutes, total = ["light", "moderate", "vigorous", "peak"].reduce((s, k) => s + (Number(z[k]) || 0), 0);
  if (!(total > 0)) return null;
  return Math.round(2 * (Number(z.light) || 0) + 3 * (Number(z.moderate) || 0) + 4 * (Number(z.vigorous) || 0) + 5 * (Number(z.peak) || 0));
}

// Day strain on the 0–21 scale WHOOP made familiar (after Borg's RPE): the
// load on a saturating curve, so each point is harder to earn than the last.
// 1 h in the moderate zone (180) ≈ 11.6, a quiet day of light movement (60) ≈ 5,
// a long mixed ride (600) ≈ 19.6.
export function strainScore(load) {
  return load > 0 ? Math.round(21 * (1 - Math.exp(-load / 225)) * 10) / 10 : 0;
}

// Google Health rows first, Intervals.icu wellness filling the days and fields
// Google has none of (Apple Watch, Garmin and others sync there), as the
// dashboard does in vitalWellness.
export function mergeWellnessRows(google, intervals) {
  const byDate = new Map((google || []).filter(r => r && r.id).map(r => [r.id, { ...r }]));
  for (const r of intervals || []) {
    if (!r || !r.id) continue;
    const row = byDate.get(r.id) || { id: r.id };
    for (const key of ["hrv", "restingHR", "respiration"]) if (!(Number(row[key]) > 0) && Number(r[key]) > 0) row[key] = Number(r[key]);
    byDate.set(r.id, row);
  }
  return [...byDate.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// The functions the dashboard client copies verbatim.
export const RECOVERY_MODEL_FUNCTIONS = [personalBaseline, sleepNeedMinutes, sleepDebtMinutes, hrvStatusLow, sleepNeedFor, bedtimePlan, sleepIndexScore, recoveryComponentScore, recoveryReadiness, heartRateLoad, strainScore];
