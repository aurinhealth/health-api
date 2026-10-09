// The Health screen of the native iPhone app (ios-native/) in one response:
// readiness with what makes it up, the night and the sleep need and debt,
// heart (HRV, resting heart rate), breathing, skin temperature, oxygen and
// weight. The same recovery model as Today and the web (recovery-model.js).
// Pure: GET /app/api/health loads the inputs.
import { mergeWellnessRows, recoveryReadiness, sleepNeedFor, sleepNeedMinutes, sleepDebtMinutes, sleepIndexScore, bedtimePlan } from "./recovery-model.js";
import { clockOf, minutesOf, primaryNights, dayStrain } from "./app-today.js";
import { sleepSettings } from "./energy-profile.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const nightDate = s => s?.date || String(s?.endTime || "").slice(0, 10);
const clock = minutes => (minutes == null ? null : String(Math.floor(minutes / 60) % 24).padStart(2, "0") + ":" + String(Math.round(minutes) % 60).padStart(2, "0"));
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Readiness = 70 (the personal normal) + each signal's weighted distance from
// its normal; a raised breathing rate or skin temperature costs 10 each
// (recoveryReadiness). These are the "+12 HRV, −5 …" parts of the number.
const WEIGHTS = { hrv: 0.5, restingHR: 0.25, sleep: 0.25 };
export function readinessParts(readiness) {
  const c = readiness?.components || {};
  const used = Object.keys(WEIGHTS).filter(k => c[k]);
  const total = used.reduce((s, k) => s + WEIGHTS[k], 0);
  if (readiness?.score == null || !total) return [];
  const parts = used.map(k => ({ key: k, points: Math.round(WEIGHTS[k] * (c[k].score - 70) / total) }));
  if (c.respiration?.elevated) parts.push({ key: "respiration", points: -10 });
  if (c.skinTemp?.elevated) parts.push({ key: "skinTemp", points: -10 });
  return parts;
}

export function buildHealth({ date, hour = null, health = {}, fitness = {}, sleep = {}, weight = {}, profile = {} }) {
  const google = Array.isArray(health.wellness) ? health.wellness : [];
  const intervals = (Array.isArray(fitness.wellness) ? fitness.wellness : []).filter(r => r.id <= date);
  const rows = mergeWellnessRows(google, intervals);
  const sessions = Array.isArray(sleep.sessions) ? sleep.sessions : [];
  const nights = primaryNights(sessions);
  const age = num(profile.age);
  const sleepSet = sleepSettings(profile);
  const needOn = d => sleepNeedFor({ date: d, age, goal: sleepSet.goal, strain: dayStrain(google, shift(d, -1)), rows, sessions });

  // Readiness today and for the last 14 days.
  const readinessOn = d => recoveryReadiness({ rows, date: d, night: nights.get(d) || null, sleepNeed: needOn(d).need });
  const readiness = readinessOn(date);
  const history = Array.from({ length: 14 }, (_, i) => shift(date, i - 13))
    .map(d => ({ date: d, value: d === date ? readiness.score : readinessOn(d).score }))
    .filter(p => p.value != null);

  // Last night, the week of nights and the coming night.
  const night = nights.get(date) || null;
  const needToday = needOn(date);
  const stages = night?.stages || {};
  const stageMin = key => round(num(stages[key]));
  const sleepDay = hour != null && hour < 6 && !night ? shift(date, -1) : date;
  const tonight = needOn(shift(sleepDay, 1));
  const plan = bedtimePlan({
    date: sleepDay,
    wake: sleepSet.wake,
    need: tonight.need,
    nights: [...nights.values()].map(n => ({ date: nightDate(n), wakeMin: minutesOf(n.endTime), durationMin: num(n.durationMin), timeInBedMin: num(n.timeInBedMin) }))
  });
  const debt = sleepDebtMinutes([...nights.values()], sleepDay, tonight.base);
  const week = Array.from({ length: 7 }, (_, i) => shift(date, i - 6)).map(d => ({ date: d, value: round(num(nights.get(d)?.durationMin)) })).filter(p => p.value != null);

  // Regularity: bedtimes of the last 14 nights (minutes after 18:00 so that
  // 23:30 and 00:30 are an hour apart, not 23).
  const beds = Array.from({ length: 14 }, (_, i) => shift(date, i - 13))
    .map(d => ({ date: d, start: minutesOf(nights.get(d)?.startTime) }))
    .filter(p => p.start != null)
    .map(p => ({ date: p.date, value: (p.start - 18 * 60 + 1440) % 1440 }));
  const bedAvg = mean(beds.map(b => b.value));
  const bedSd = beds.length >= 3 ? Math.sqrt(beds.reduce((s, b) => s + (b.value - bedAvg) ** 2, 0) / (beds.length - 1)) : null;

  // Series for the widgets.
  const series = (key, n, d = 0, from = rows) => from.filter(r => r.id <= date && r.id > shift(date, -n) && num(r[key]) != null && (key === "skinTempDeviation" || num(r[key]) > 0)).map(r => ({ date: r.id, value: round(num(r[key]), d) }));
  const c = readiness.components || {};
  const hrvSeries = series("hrv", 30), rhrSeries = series("restingHR", 30);
  const lastWeek = hrvSeries.filter(p => p.date > shift(date, -7)).map(p => p.value);
  const today = rows.find(r => r.id === date) || {};
  const respiration = series("respiration", 14, 1);
  const skin = series("skinTempDeviation", 14, 2, google);
  const spo2 = series("spO2", 14, 1, intervals);

  // Weight: 90 days of weighings, the 30-day change of the trend and body fat
  // from Intervals.icu wellness (Google Health body fat synced there).
  const weights = (Array.isArray(weight.records) ? weight.records : [])
    .map(r => ({ date: String(r.sample_time || r.start_time || "").slice(0, 10), value: num(r.value_numeric) }))
    .filter(p => p.date && p.date <= date && p.date > shift(date, -90) && p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const avg = (from, to) => mean(weights.filter(p => p.date > from && p.date <= to).map(p => p.value));
  const nowAvg = avg(shift(date, -7), date), monthAgo = avg(shift(date, -37), shift(date, -30));
  const fat = series("bodyFat", 60, 1, intervals);

  return {
    status: "ok",
    date,
    readiness: {
      score: readiness.score,
      zone: readiness.zone,
      missing: readiness.missing || [],
      flags: readiness.flags || [],
      parts: readinessParts(readiness),
      hrv: c.hrv ? round(c.hrv.value) : null,
      restingHR: c.restingHR ? round(c.restingHR.value) : null,
      sleepMinutes: c.sleep ? c.sleep.minutes : null,
      strainYesterday: dayStrain(google, shift(date, -1)),
      history
    },
    sleep: {
      night: night ? {
        date,
        minutes: num(night.durationMin),
        inBedMinutes: num(night.timeInBedMin),
        index: sleepIndexScore(night, needToday.need),
        start: clockOf(night.startTime),
        end: clockOf(night.endTime),
        latencyMinutes: round(num(night.latencyMin ?? night.minutesToFallAsleep)),
        efficiency: num(night.timeInBedMin) > 0 && num(night.durationMin) ? Math.round(num(night.durationMin) / num(night.timeInBedMin) * 100) : null,
        stages: stageMin("DEEP") != null || stageMin("REM") != null ? { deep: stageMin("DEEP") ?? 0, light: stageMin("LIGHT") ?? 0, rem: stageMin("REM") ?? 0, awake: stageMin("AWAKE") ?? 0 } : null
      } : null,
      week,
      need: needToday.need,
      tonight: { need: tonight.need, base: sleepNeedMinutes({ age, goal: sleepSet.goal }), strain: tonight.base - sleepNeedMinutes({ age, goal: sleepSet.goal }), goalSet: sleepSet.goal != null, wakeSet: plan?.wakeSource === "setting", hrv: tonight.hrv, debt: tonight.debt, naps: tonight.naps, bedtime: plan ? clock(plan.bed) : null, wake: plan ? clock(plan.wake) : null },
      debt: debt ? { minutes: debt.minutes, nights: debt.nights } : null,
      regularity: beds.length >= 3 ? { bedtime: clock(bedAvg + 18 * 60), spread: Math.round(bedSd), nights: beds.map(b => ({ date: b.date, value: b.value })) } : null
    },
    hrv: c.hrv ? { value: round(c.hrv.value), baseline: round(c.hrv.baseline), low: round(c.hrv.low), high: round(c.hrv.high), trend: c.hrv.trend, week: round(mean(lastWeek)), series: hrvSeries } : hrvSeries.length ? { value: null, baseline: null, low: null, high: null, trend: null, week: round(mean(lastWeek)), series: hrvSeries } : null,
    restingHR: rhrSeries.length ? { value: c.restingHR ? round(c.restingHR.value) : round(num(today.restingHR)), baseline: c.restingHR ? round(c.restingHR.baseline, 1) : null, series: rhrSeries } : null,
    respiration: respiration.length ? { value: c.respiration ? round(c.respiration.value, 1) : respiration.at(-1).value, baseline: c.respiration ? round(c.respiration.baseline, 1) : null, elevated: !!c.respiration?.elevated, series: respiration } : null,
    skinTemp: skin.length ? { deviation: c.skinTemp ? round(c.skinTemp.deviation, 2) : skin.at(-1).value, elevated: !!c.skinTemp?.elevated, series: skin } : null,
    oxygen: spo2.length ? { value: spo2.at(-1).value, low: Math.min(...spo2.map(p => p.value)), high: Math.max(...spo2.map(p => p.value)), series: spo2 } : null,
    weight: weights.length ? {
      latest: weights.at(-1).value,
      date: weights.at(-1).date,
      average: round(nowAvg, 1),
      change: nowAvg != null && monthAgo != null ? round(nowAvg - monthAgo, 1) : null,
      goal: num(profile.targetWeight),
      series: weights,
      bodyFat: fat.length ? { value: fat.at(-1).value, change: fat.length > 1 ? round(fat.at(-1).value - fat[0].value, 1) : null, series: fat } : null
    } : null
  };
}
