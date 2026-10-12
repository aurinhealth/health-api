// The Today screen of the native iPhone app (ios-native/) in one response.
// The web dashboard assembles the same numbers in the browser from about ten
// requests; the app gets them here, computed with the shared recovery model
// (recovery-model.js), so both show the same readiness, sleep and strain.
// Pure: GET /app/api/today loads the inputs and passes them in.
import { environmentFor } from "./adaptive-week.js";
import { mergeWellnessRows, recoveryReadiness, applyCheckin, sleepNeedFor, sleepIndexScore, bedtimePlan, heartRateLoad, strainScore, hrvMetric, sleepDebtMinutes, sleepNeedMinutes } from "./recovery-model.js";
import { localDateTime } from "./user-time.js";
import { sleepSettings } from "./energy-profile.js";
import { L } from "./lang.js";
import { daySessions, deviceEnergyExtra } from "./app-training.js";
import { recoveryToday } from "./recovery-today.js";

const STEP_GOAL = 10000;

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const activeKcal = (v, extra) => (v == null ? null : Math.max(0, Math.round(v) - (extra || 0)));
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const nightDate = s => s?.date || String(s?.endTime || "").slice(0, 10);
const clock = minutes => (minutes == null ? null : String(Math.floor(minutes / 60) % 24).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0"));
export const clockOf = iso => {
  const local = iso ? localDateTime(iso) : "";
  return /T\d{2}:\d{2}/.test(local) ? local.slice(11, 16) : null;
};
export const minutesOf = iso => {
  const c = clockOf(iso);
  return c ? Number(c.slice(0, 2)) * 60 + Number(c.slice(3, 5)) : null;
};

// The main night of each day (naps and short fragments left out).
export function primaryNights(sessions) {
  const byDay = new Map();
  for (const s of sessions || []) {
    if (!s || s.nap || !(num(s.durationMin) >= 180)) continue;
    const d = nightDate(s), best = byDay.get(d);
    if (d && (!best || num(s.durationMin) > num(best.durationMin))) byDay.set(d, s);
  }
  return byDay;
}

// Minutes at moderate heart rate or above, the way WHO counts them (a vigorous
// or peak minute counts twice): today and since Monday.
export function activeMinutes(rows, date) {
  const counted = r => { const z = r?.hrZoneMinutes; return z ? (num(z.moderate) || 0) + 2 * ((num(z.vigorous) || 0) + (num(z.peak) || 0)) : 0; };
  const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7, monday = shift(date, -weekday);
  const week = rows.filter(r => r.id >= monday && r.id <= date);
  if (!week.some(r => r.hrZoneMinutes)) return null;
  return { today: Math.round(counted(rows.find(r => r.id === date))), week: Math.round(week.reduce((s, r) => s + counted(r), 0)), target: 150 };
}

export function dayStrain(rows, date) {
  const row = rows.find(r => r.id === date);
  const load = heartRateLoad(row?.hrZoneMinutes);
  return load == null ? null : strainScore(load);
}

// The day's strain to aim for, a range on the 0–21 scale: the readiness sets
// its middle (50 → 10, 72 → 12.6, 90 → 14.8; without a number 10), the day's
// plan pulls it halfway to the plan's strain, the week's sleep debt takes off
// 0.5 per half hour (at most 2), and a yellow morning caps it at 12, a red one
// at 6, as WHOOP's strain target follows recovery. The morning check-in is in
// the readiness already. ±1.5 around the middle.
export function strainTarget({ readiness = null, zone = null, planned = null, debt = 0, rest = false } = {}) {
  let mid = readiness != null ? 4 + 0.12 * readiness : 10;
  if (planned > 0) mid = (mid + planned) / 2;
  // A day with nothing planned or done is a rest day: walking, light movement.
  else if (rest) mid = Math.min(mid, 6.5);
  mid -= Math.min(2, (Number(debt) || 0) / 30 * 0.5);
  if (zone === "red") mid = Math.min(mid, 6); else if (zone === "yellow") mid = Math.min(mid, 12);
  const r1 = v => Math.round(v * 10) / 10;
  return { low: r1(Math.max(1, mid - 1.5)), high: r1(Math.min(20, mid + 1.5)) };
}

// Planned training on the same 0–21 scale, from TSS (as the web dashboard).
const plannedStrain = tss => (tss > 0 ? Math.round(21 * (1 - Math.exp(-tss / 90)) * 10) / 10 : null);

// Today's weather at the place chosen for the week plan (week-planner.js
// location) with the advice whether a ride or a run belongs outdoors
// (adaptive-week.js environmentFor, the same rule as the coach). Null without a
// place; without a forecast only the place and the season's advice.
export function todayWeather(location, forecast, date) {
  if (!location || !Number.isFinite(Number(location.latitude)) || !Number.isFinite(Number(location.longitude))) return null;
  const w = forecast && typeof forecast === "object" && Object.keys(forecast).length ? forecast : null;
  const advice = sport => { const e = environmentFor(date, sport, w); return { environment: e.environment, reason: e.reason || null }; };
  return {
    place: String(location.name || "").slice(0, 80) || null,
    code: round(num(w?.code)),
    max: round(num(w?.max)),
    min: round(num(w?.min)),
    wind: round(num(w?.wind)),
    rain: round(num(w?.rain), 1),
    rainProb: round(num(w?.rainProb)),
    hours: Array.isArray(w?.hours) && w.hours.length ? w.hours : null,
    outdoor: advice("ride"),
    outdoorRun: advice("run")
  };
}

export function buildToday({ date, hour = null, daily = {}, health = {}, fitness = {}, sleep = {}, fluids = {}, weight = {}, coaches = {}, profile = {}, connectionProblems = [], location = null, forecast = null, gym = null, recovery = null, checkin = null, trainingPlan = null }) {
  const google = Array.isArray(health.wellness) ? health.wellness : [];
  const rows = mergeWellnessRows(google, Array.isArray(fitness.wellness) ? fitness.wellness : []);
  const sessions = Array.isArray(sleep.sessions) ? sleep.sessions : [];
  const nights = primaryNights(sessions);
  const age = num(profile.age);
  const sleepSet = sleepSettings(profile);

  // Sleep and readiness for the night that ended this morning. Until it has
  // synced they stay empty: an earlier day is a tap away (?date=).
  const night = nights.get(date) || null;
  const need = sleepNeedFor({ date, age, goal: sleepSet.goal, strain: dayStrain(google, shift(date, -1)), rows, sessions }).need;
  // The morning check-in can lower it, as it does for the coach.
  const body = recoveryReadiness({ rows, date, night, sleepNeed: need });
  const readiness = applyCheckin(body, checkin);
  const hrv = readiness.components?.hrv || null;

  // The coming night: the need from the strain of the day before it and the
  // usual wake time. Between midnight and 6:00 without today's night yet the
  // coming night is the one that ends this morning.
  const sleepDay = hour != null && hour < 6 && !nights.get(date) ? shift(date, -1) : date;
  const strainNow = dayStrain(google, date);
  const tonightNeed = sleepNeedFor({ date: shift(sleepDay, 1), age, goal: sleepSet.goal, strain: dayStrain(google, sleepDay), rows, sessions }).need;
  const plan = bedtimePlan({
    date: sleepDay,
    wake: sleepSet.wake,
    need: tonightNeed,
    nights: [...nights.values()].map(n => ({ date: nightDate(n), wakeMin: minutesOf(n.endTime), durationMin: num(n.durationMin), timeInBedMin: num(n.timeInBedMin) }))
  });

  // The week's sleep debt up to last night, for the strain target.
  const debtNow = sleepDebtMinutes(sessions.filter(x => (x.date || String(x.endTime || "").slice(0, 10)) <= date), date, sleepNeedMinutes({ age, goal: sleepSet.goal }));

  // Training: planned and completed sessions of the day.
  const training = daily.training || {};
  const planned = Array.isArray(training.planned) ? training.planned : [];
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

  // The day's plan: what was done at its time, then what is still planned in
  // the order of the plan (no clock: it comes after the last record, whenever
  // that is), then bedtime. The same sessions as Training → Tréninky týdne,
  // so a gym session or a watch workout outside the plan shows here too.
  // The watch's calories above the estimate the user chose to count (Plán dne → Kalorie k ověření).
  const watchExtra = deviceEnergyExtra(training.completed);
  const daySession = daySessions(date, hour == null ? shift(date, 1) : date, training, gym).sessions;
  const detailOf = s => [num(s.minutes) ? Math.round(num(s.minutes)) + " min" : null, num(s.tss) ? Math.round(num(s.tss)) + " TSS" : null].filter(Boolean).join(" · ") || null;
  const done = daySession.filter(s => s.status === "done");
  const open = daySession.filter(s => s.status !== "done");

  // Recovery (recovery-today.js): the suggestions after a training day, only
  // for today; the stretching and sauna saved for the day join the plan.
  const rec = recovery || {};
  const savedRecovery = (Array.isArray(rec.saved) ? rec.saved : []).filter(r => r && r.date === date);
  const gymByDate = { ...(rec.gym || {}), ...(gym ? { [date]: gym } : {}) };
  const recoveryCard = hour != null && recovery ? recoveryToday({
    date,
    today: daySession,
    yesterday: daySessions(shift(date, -1), date, rec.yesterday || {}, gymByDate[shift(date, -1)] || null).sessions,
    tomorrow: rec.tomorrow ? daySessions(shift(date, 1), date, rec.tomorrow, gymByDate[shift(date, 1)] || null).sessions : null,
    gym: gymByDate,
    tonight: plan ? { bedtime: clock(plan.bed), need: tonightNeed } : null,
    saved: savedRecovery
  }) : null;
  const stretchName = recoveryCard?.items?.find(i => i.kind === "stretch")?.title;
  const recoveryItems = savedRecovery.map(r => ({
    kind: "recovery",
    recovery: r.kind,
    time: r.done ? clockOf(r.doneAt) : null,
    title: r.kind === "stretch" && stretchName ? stretchName : r.title,
    detail: r.minutes + " min" + (r.kind === "sauna" ? "" : " · " + r.items.length + " " + L("cviků", "moves")) + (r.done ? L(" · hotovo", " · done") : ""),
    done: r.done,
    status: r.done ? "done" : "planned"
  }));
  const byTime = (a, b) => String(a.time || "99").localeCompare(String(b.time || "99"));
  const planItems = [
    ...[...done, ...open].map(s => ({
      kind: "workout",
      // ride, run or strength: the app opens the gym session for strength.
      sport: s.sport === "strength" ? "strength" : ["run", "ride"].includes(s.sport) ? s.sport : "other",
      time: s.status === "done" ? s.time : null,
      title: s.title,
      detail: detailOf(s),
      done: s.status === "done",
      // "done", "planned" or "missed" (a past day's plan nothing was done for).
      status: s.status,
      session: s
    })),
    ...recoveryItems
  ];
  // Done first in the order of the day, then what is still open, then bedtime.
  const ordered = [...planItems.filter(i => i.done).sort(byTime), ...planItems.filter(i => !i.done),
    ...(plan ? [{ kind: "bedtime", time: clock(plan.bed), title: L("Do postele", "Bedtime"), detail: L("potřeba spánku ", "sleep need ") + Math.floor(tonightNeed / 60) + " h " + String(tonightNeed % 60).padStart(2, "0") + " min", done: false }] : [])
  ];

  return {
    status: "ok",
    date,
    // Connected services that need the user (connection-health.js), shown at the top.
    connectionProblems: Array.isArray(connectionProblems) ? connectionProblems : [],
    readiness: { score: readiness.score, zone: readiness.zone, missing: readiness.missing || [], flags: readiness.flags || [] },
    // The morning check-in: fresh, normal, tired, sick or null (not answered).
    checkin: checkin || null,
    trainingPlan: trainingPlan || null,
    sleep: night ? {
      minutes: num(night.durationMin),
      inBedMinutes: num(night.timeInBedMin),
      index: sleepIndexScore(night, need),
      need,
      start: clockOf(night.startTime),
      end: clockOf(night.endTime)
    } : null,
    strain: { score: strainNow, planned: plannedStrain(plannedTss), target: { ...strainTarget({ readiness: readiness.score, zone: readiness.zone, planned: plannedStrain(plannedTss), debt: debtNow?.minutes || 0, rest: !daySession.length }), rest: !daySession.length, readiness: readiness.score ?? null, debt: debtNow?.minutes ?? null, feeling: checkin || null, plan: planned.map(w => String(w.name || "").trim()).filter(Boolean).join(", ").slice(0, 80) || null } },
    // metric: "rmssd" or "sdnn" when the source said how it measures (Apple Health), else null.
    // Today's HRV shows even before its source has the 14 days a baseline needs.
    hrv: hrv ? { value: round(hrv.value), baseline: round(hrv.baseline), low: round(hrv.low), high: round(hrv.high), trend: hrv.trend, metric: hrvMetric(rows.find(r => r.id === date)), series: last(30, "hrv") }
      : num(rows.find(r => r.id === date)?.hrv) > 0 ? { value: round(num(rows.find(r => r.id === date).hrv)), baseline: null, low: null, high: null, trend: null, metric: hrvMetric(rows.find(r => r.id === date)), series: last(30, "hrv") } : null,
    restingHR: restingHR ? { value: round(restingHR.value), baseline: round(restingHR.baseline, 1), series: last(14, "restingHR") } : null,
    summary: summary ? { headline: summary.headline || null, text: summary.text || null, recommendation: summary.recommendation || null } : null,
    nutrition: {
      kcal: round(num(totals.kcal)),
      target: num(nutrition.calorieTarget),
      trainingBonus: bonus,
      protein: { eaten: round(num(totals.protein_g)), target: num(macros.protein_g) },
      carbs: { eaten: round(num(totals.carbs_g)), target: num(macros.carbs_g) },
      fat: { eaten: round(num(totals.fat_g)), target: num(macros.fat_g) },
      water: { ml: num(fluids.hydrationMl ?? fluids.totalMl), target: num(fluids.target?.ml) }
    },
    plan: ordered,
    recovery: recoveryCard,
    tonight: plan ? { bedtime: clock(plan.bed), wake: clock(plan.wake), need: tonightNeed, wakeSet: plan.wakeSource === "setting" } : null,
    steps: { today: num(todayRow.steps), goal: STEP_GOAL, week: last(7, "steps"), month: last(30, "steps"), hourly: byHour[date] ? byHour[date].map(v => Math.round(v)) : null, usual, hour, activeKcal: activeKcal(num(todayRow.activeCalories), watchExtra), activeKcalExcluded: watchExtra || null, activeMinutes: activeMinutes(google, date) },
    weight: weights.length ? { latest: weights.at(-1).value, goal: num(profile.targetWeight), series: weights } : null,
    weather: todayWeather(location, forecast, date)
  };
}
