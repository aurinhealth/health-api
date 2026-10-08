// The Today screen of the native iPhone app (ios-native/) in one response.
// The web dashboard assembles the same numbers in the browser from about ten
// requests; the app gets them here, computed with the shared recovery model
// (recovery-model.js), so both show the same readiness, sleep and strain.
// Pure: GET /app/api/today loads the inputs and passes them in.
import { mergeWellnessRows, recoveryReadiness, sleepNeedFor, sleepIndexScore, bedtimePlan, heartRateLoad, strainScore } from "./recovery-model.js";
import { localDateTime } from "./user-time.js";

const STEP_GOAL = 10000;

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const nightDate = s => s?.date || String(s?.endTime || "").slice(0, 10);
const clock = minutes => (minutes == null ? null : String(Math.floor(minutes / 60) % 24).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0"));
const clockOf = iso => {
  const local = iso ? localDateTime(iso) : "";
  return /T\d{2}:\d{2}/.test(local) ? local.slice(11, 16) : null;
};
const minutesOf = iso => {
  const c = clockOf(iso);
  return c ? Number(c.slice(0, 2)) * 60 + Number(c.slice(3, 5)) : null;
};

// The main night of each day (naps and short fragments left out).
function primaryNights(sessions) {
  const byDay = new Map();
  for (const s of sessions || []) {
    if (!s || s.nap || !(num(s.durationMin) >= 180)) continue;
    const d = nightDate(s), best = byDay.get(d);
    if (d && (!best || num(s.durationMin) > num(best.durationMin))) byDay.set(d, s);
  }
  return byDay;
}

function dayStrain(rows, date) {
  const row = rows.find(r => r.id === date);
  const load = heartRateLoad(row?.hrZoneMinutes);
  return load == null ? null : strainScore(load);
}

// Planned training on the same 0–21 scale, from TSS (as the web dashboard).
const plannedStrain = tss => (tss > 0 ? Math.round(21 * (1 - Math.exp(-tss / 90)) * 10) / 10 : null);

export function buildToday({ date, hour = null, daily = {}, health = {}, fitness = {}, sleep = {}, fluids = {}, weight = {}, coaches = {}, profile = {} }) {
  const google = Array.isArray(health.wellness) ? health.wellness : [];
  const rows = mergeWellnessRows(google, Array.isArray(fitness.wellness) ? fitness.wellness : []);
  const sessions = Array.isArray(sleep.sessions) ? sleep.sessions : [];
  const nights = primaryNights(sessions);
  const age = num(profile.age);

  // Sleep and readiness for the night that ended this morning.
  const night = nights.get(date) || null;
  const need = sleepNeedFor({ date, age, strain: dayStrain(google, shift(date, -1)), rows, sessions }).need;
  const readiness = recoveryReadiness({ rows, date, night, sleepNeed: need });
  const hrv = readiness.components?.hrv || null;

  // Tonight: the need from today's strain so far and the usual wake time.
  const strainNow = dayStrain(google, date);
  const tonightNeed = sleepNeedFor({ date: shift(date, 1), age, strain: strainNow, rows, sessions }).need;
  const plan = bedtimePlan({
    date,
    need: tonightNeed,
    nights: [...nights.values()].map(n => ({ date: nightDate(n), wakeMin: minutesOf(n.endTime), durationMin: num(n.durationMin), timeInBedMin: num(n.timeInBedMin) }))
  });

  // Training: planned and completed sessions of the day.
  const training = daily.training || {};
  const planned = Array.isArray(training.planned) ? training.planned : [];
  const matched = new Set((training.matched || []).map(m => m?.planned?.name + "|" + m?.planned?.start));
  const plannedTss = planned.reduce((s, w) => s + (num(w.tss) || 0), 0);

  // Food and drink.
  const nutrition = daily.nutrition || {};
  const totals = nutrition.foodLog?.totals || {};
  const macros = nutrition.macros || {};
  const breakdown = nutrition.calorieBreakdown || {};
  const bonus = num(breakdown.activityAdjustment) != null ? Math.round(num(breakdown.activityAdjustment) * (num(breakdown.trainingCoverage) ?? 0.7)) : null;

  // Trends for the widgets.
  const last = (n, key) => rows.filter(r => r.id <= date && r.id > shift(date, -n)).map(r => ({ date: r.id, value: num(r[key]) })).filter(p => p.value > 0);
  const restingHR = readiness.components?.restingHR || null;
  const weights = (Array.isArray(weight.records) ? weight.records : [])
    .map(r => ({ date: String(r.sample_time || r.start_time || "").slice(0, 10), value: num(r.value_numeric) }))
    .filter(p => p.date && p.date <= date && p.date > shift(date, -30) && p.value > 0);
  const todayRow = google.find(r => r.id === date) || {};
  // Steps through the day, and the usual climb: the average running total per
  // hour of the earlier days with steps (up to 14).
  const byHour = health.stepsByHour || {};
  const cumulative = hours => hours.reduce((out, v) => [...out, (out.at(-1) || 0) + (num(v) || 0)], []);
  const earlier = Object.keys(byHour).filter(d => d < date && byHour[d].some(v => v > 0)).sort().slice(-14).map(d => cumulative(byHour[d]));
  const usual = earlier.length ? Array.from({ length: 24 }, (_, h) => Math.round(earlier.reduce((s, c) => s + c[h], 0) / earlier.length)) : null;
  const summary = coaches.morningSummary || null;

  const planItems = [
    ...planned.map(w => ({
      kind: "workout",
      time: clockOf(w.start),
      title: w.name || w.type || "Trénink",
      detail: [num(w.durationHours) ? Math.round(num(w.durationHours) * 60) + " min" : null, num(w.tss) ? Math.round(num(w.tss)) + " TSS" : null].filter(Boolean).join(" · ") || null,
      done: matched.has(w.name + "|" + w.start)
    })),
    ...(plan ? [{ kind: "bedtime", time: clock(plan.bed), title: "Do postele", detail: "potřeba spánku " + Math.floor(tonightNeed / 60) + " h " + String(tonightNeed % 60).padStart(2, "0") + " min", done: false }] : [])
  ].sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99")));

  return {
    status: "ok",
    date,
    readiness: { score: readiness.score, zone: readiness.zone, missing: readiness.missing || [], flags: readiness.flags || [] },
    sleep: night ? {
      minutes: num(night.durationMin),
      inBedMinutes: num(night.timeInBedMin),
      index: sleepIndexScore(night, need),
      need,
      start: clockOf(night.startTime),
      end: clockOf(night.endTime)
    } : null,
    strain: { score: strainNow, planned: plannedStrain(plannedTss) },
    hrv: hrv ? { value: round(hrv.value), baseline: round(hrv.baseline), low: round(hrv.low), high: round(hrv.high), trend: hrv.trend, series: last(30, "hrv") } : null,
    restingHR: restingHR ? { value: round(restingHR.value), baseline: round(restingHR.baseline, 1), series: last(14, "restingHR") } : null,
    summary: summary ? { headline: summary.headline || null, text: summary.text || null, recommendation: summary.recommendation || null } : null,
    nutrition: {
      kcal: round(num(totals.kcal)),
      target: num(nutrition.calorieTarget),
      trainingBonus: bonus,
      protein: { eaten: round(num(totals.protein_g)), target: num(macros.protein_g) },
      carbs: { eaten: round(num(totals.carbs_g)), target: num(macros.carbs_g) },
      fat: { eaten: round(num(totals.fat_g)), target: num(macros.fat_g) },
      water: { ml: num(fluids.totalMl), target: num(fluids.target?.ml) }
    },
    plan: planItems,
    tonight: plan ? { bedtime: clock(plan.bed), wake: clock(plan.wake), need: tonightNeed } : null,
    steps: { today: num(todayRow.steps), goal: STEP_GOAL, week: last(7, "steps"), hourly: byHour[date] ? byHour[date].map(v => Math.round(v)) : null, usual, hour },
    weight: weights.length ? { latest: weights.at(-1).value, goal: num(profile.targetWeight), series: weights } : null
  };
}
