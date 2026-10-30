// The Today screen of the native iPhone app (ios-native/) in one response.
// The web dashboard assembles the same numbers in the browser from about ten
// requests; the app gets them here, computed with the shared recovery model
// (recovery-model.js), so both show the same readiness, sleep and strain.
// Pure: GET /app/api/today loads the inputs and passes them in.
import { environmentFor, weatherReason } from "./adaptive-week.js";
import { sleepNeedFor, bedtimePlan, heartRateLoad, strainScore, dayStrainParts, hrvMetric, weekSleepDebt } from "./recovery-model.js";
import { readinessFor, primaryNights, sleepIndexFor } from "./readiness.js";
import { localDate, localDateTime } from "./user-time.js";
import { sleepSettings, tonightChoice } from "./energy-profile.js";
import { L } from "./lang.js";
import { dayCalories } from "./app-food.js";
import { readinessMessage } from "./push.js";
import { activityKindOf } from "./activity-match.js";
import { daySessions, deviceEnergyExtra, withHeartRateLoad } from "./app-training.js";
export { withHeartRateLoad };
import { recoveryToday } from "./recovery-today.js";
import { cycleState, askPeriodToday, cycleTrainingCaution } from "./cycle-model.js";
import { isHardSession } from "./session-intensity.js";
import { heatAdvice, indoorText } from "./heat-advice.js";

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

// The main night of each day (readiness.js, where the readiness picks it too).
export { primaryNights };

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
// The week strip above Dnes (Mon–Sun of the day's week): each day up to the
// shown one with its readiness zone ("green", "yellow", "red", null without
// a number); later days have no zone.
export function readinessWeek({ date, readiness, sessions = [], profile = null }) {
  const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  const monday = shift(date, -weekday);
  return Array.from({ length: 7 }, (_, i) => {
    const day = shift(monday, i);
    if (day > date) return { date: day, zone: null };
    const r = day === date ? readiness : readinessFor({ date: day, rows: readiness.rows, sessions, profile });
    return { date: day, zone: r.score == null ? null : r.zone || null };
  });
}

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
    // "apple": the forecast is Apple Weather's, which the app credits (weatherkit.js).
    source: w?.source === "apple" ? "apple" : null,
    // The detail (weatherkit.js detailFromWeatherKit): the temperature now, the
    // hours from now, and seven days with their hours and where to train.
    now: Number.isFinite(Number(w?.now?.temp)) ? {
      temp: round(num(w.now.temp)), code: round(num(w.now.code)), wind: round(num(w.now.wind)),
      windDirection: round(num(w.now.windDirection)), daylight: typeof w.now.daylight === "boolean" ? w.now.daylight : null
    } : null,
    next: Array.isArray(w?.next) && w.next.length ? w.next : null,
    week: Array.isArray(w?.week) && w.week.length ? w.week.map(d => ({
      date: d.date, code: round(num(d.code)), max: round(num(d.max)), min: round(num(d.min)), rainProb: round(num(d.rainProb)),
      hours: Array.isArray(d.hours) ? d.hours : [],
      ride: { environment: environmentFor(d.date, "ride", d).environment, reason: weatherReason(d.date, "ride", d) },
      run: { environment: environmentFor(d.date, "run", d).environment, reason: weatherReason(d.date, "run", d) }
    })) : null,
    outdoor: advice("ride"),
    outdoorRun: advice("run")
  };
}

// The coach's morning summary obeys the readiness: on a red morning, a sick
// check-in or signs of illness (breathing or temperature up) it never says to
// keep the plan; the advice is rest or an easy session. Its facts stay.
// trained: today's workouts are done and nothing is left: the advice is rest for the rest of the day.
// morning: the morning push's advice when the days before, the journal, an
// injury or tomorrow changed it (push.js readinessMessage `changed`), so the
// card and the notification say the same; not once today's training is done.
export function readinessSummary(summary, readiness = {}, checkin = null, hasPlan = false, trained = false, morning = null) {
  const flags = readiness?.flags || [];
  const sick = checkin === "sick" || flags.includes("checkin_sick");
  const signs = flags.some(f => /^(respiration|skin_temp|wrist_temp)_elevated$/.test(f));
  if (!(readiness?.zone === "red" || sick || signs)) return morning && !trained ? { ...(summary || { text: null }), ...morning } : summary;
  const recommendation = sick ? L("Když je ti špatně, trénink dnes vynech a odpočívej. Vrať se, až budeš zase fit.", "If you feel unwell, skip training today and rest. Come back when you're well again.")
    : signs ? L("Dech nebo teplota ve spánku jsou nad tvým normálem. Dnes bez intenzity, a když se necítíš dobře, odpočívej.", "Your breathing or temperature in sleep is above your normal. No intensity today, and rest if you don't feel well.")
    : trained ? L("Připravenost je dnes nízká a trénink máš za sebou: zbytek dne odpočívej, najez se a jdi dřív spát.", "Readiness is low today and your training is done: rest for the rest of the day, eat well and get to bed earlier.")
    : hasPlan ? L("Připravenost je dnes nízká: náročný trénink vynech a dej volno nebo jen lehký pohyb do 45 minut.", "Readiness is low today: skip the hard session and take a rest day or just easy movement up to 45 minutes.")
    : L("Připravenost je dnes nízká: dej si volno, procházku a jdi dřív spát.", "Readiness is low today: take a rest day, go for a walk and get to bed earlier.");
  return { ...(summary || { text: null }), headline: sick || readiness?.zone === "red" ? L("Den na odpočinek", "A day to recover") : L("Dnes opatrně", "Take care today"), recommendation };
}

// Sleep that began on `date` other than the night, in the order of the day.
export function napsOn(sessions, date, night) {
  return (sessions || [])
    .filter(s => s && s !== night && s.startTime && s.endTime && localDateTime(s.startTime).slice(0, 10) === date && num(s.durationMin) >= 10
      && (!night?.endTime || Date.parse(s.startTime) >= Date.parse(night.endTime)))
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .map(s => ({ start: clockOf(s.startTime), end: clockOf(s.endTime), minutes: Math.round(num(s.durationMin)) }));
}

// The parts of Today that failed (their paths), by the card they feed: the
// nights (Spánek) and the drinks (Voda in Jídlo a pití).
const TODAY_PARTS = { "/health/sleep": "sleep", "/app/api/fluids": "fluids" };
export function todayUnavailable(failed) {
  return [...new Set([...failed].map(path => TODAY_PARTS[path]).filter(Boolean))];
}

export function buildToday({ date, hour = null, morning = null, daily = {}, health = {}, fitness = {}, sleep = {}, fluids = {}, weight = {}, coaches = {}, profile = {}, connectionProblems = [], location = null, forecast = null, gym = null, recovery = null, checkin = null, trainingPlan = null, unavailable = [] }) {
  const google = Array.isArray(health.wellness) ? health.wellness : [];
  const sessions = Array.isArray(sleep.sessions) ? sleep.sessions : [];
  const nights = primaryNights(sessions);
  const age = num(profile.age);
  const sleepSet = sleepSettings(profile);

  // Sleep and readiness for the night that ended this morning. Until it has
  // synced they stay empty: an earlier day is a tap away (?date=). The same
  // readiness the coaches use (readiness.js); the morning check-in can lower it.
  const readiness = readinessFor({ date, google, intervals: fitness.wellness, sessions, profile, checkin });
  const rows = readiness.rows, night = readiness.night, need = readiness.need.need;
  const week = readinessWeek({ date, readiness, sessions, profile });
  const hrv = readiness.components?.hrv || null;

  // The coming night: the need from the strain of the day before it and the
  // usual wake time. Between midnight and 6:00 without today's night yet the
  // coming night is the one that ends this morning.
  const sleepDay = hour != null && hour < 6 && !nights.get(date) ? shift(date, -1) : date;
  // Training: planned and completed sessions of the day, and the day's strain
  // from the heart-rate zones, the done sessions and the steps (dayStrainParts).
  const training = withHeartRateLoad(daily.training || {}, google, profile, date);
  const daySession = daySessions(date, hour == null ? shift(date, 1) : date, training, gym).sessions;
  const done = daySession.filter(s => s.status === "done");
  const open = daySession.filter(s => s.status !== "done");
  const todayRow = google.find(r => r.id === date) || {};
  const strainParts = dayStrainParts({ zoneMinutes: todayRow.hrZoneMinutes, steps: num(todayRow.steps), sessions: done });
  const strainNow = strainParts.score;
  // The user's own length or wake time for tonight (Spánek) moves the bedtime.
  const choice = tonightChoice(sleepSet, sleepDay, sleepNeedFor({ date: shift(sleepDay, 1), age, goal: sleepSet.goal, strain: sleepDay === date ? strainNow : dayStrain(google, sleepDay), rows, sessions }).need);
  const tonightNeed = choice.need;
  const plan = bedtimePlan({
    date: sleepDay,
    wake: choice.wake,
    need: tonightNeed,
    nights: [...nights.values()].map(n => ({ date: nightDate(n), wakeMin: minutesOf(n.endTime), durationMin: num(n.durationMin), timeInBedMin: num(n.timeInBedMin) }))
  });

  // The week's sleep debt up to last night, for the strain target.
  const debtNow = weekSleepDebt(sessions, date, { age, goal: sleepSet.goal });

  const planned = Array.isArray(training.planned) ? training.planned : [];
  const plannedTss = planned.reduce((s, w) => s + (num(w.tss) || 0), 0);

  // Food and drink.
  const nutrition = daily.nutrition || {};
  const totals = nutrition.foodLog?.totals || {};
  const macros = nutrition.macros || {};
  const breakdown = nutrition.calorieBreakdown || {};
  const { bonus } = dayCalories(nutrition);

  // Trends for the widgets.
  const last = (n, key) => rows.filter(r => r.id <= date && r.id > shift(date, -n)).map(r => ({ date: r.id, value: num(r[key]) })).filter(p => p.value > 0);
  const restingHR = readiness.components?.restingHR || null;
  const weights = (Array.isArray(weight.records) ? weight.records : [])
    .map(r => ({ date: localDate(r.sample_time || r.start_time), value: num(r.value_numeric) }))
    .filter(p => p.date && p.date <= date && p.date > shift(date, -30) && p.value > 0);
  // Steps through the day, and the usual climb: the average running total per
  // hour of the earlier days with steps (up to 14).
  const byHour = health.stepsByHour || {};
  const cumulative = hours => hours.reduce((out, v) => [...out, (out.at(-1) || 0) + (num(v) || 0)], []);
  const earlier = Object.keys(byHour).filter(d => d < date && byHour[d].some(v => v > 0)).sort().slice(-14).map(d => cumulative(byHour[d]));
  const usual = earlier.length ? Array.from({ length: 24 }, (_, h) => Math.round(earlier.reduce((s, c) => s + c[h], 0) / earlier.length)) : null;
  // The same advice as the morning push (push.js), from the same signals (entrypoint.js morningContext).
  const morningAdvice = morning && readiness.score != null ? readinessMessage({ score: readiness.score, zone: readiness.zone, flags: readiness.flags || [], missing: readiness.missing || [], checkin, athleteState: morning.athleteState || null,
    sleep: night ? { minutes: num(night.durationMin) } : null, planned: planned.filter(w => w?.name).map(w => ({ title: w.name, sport: activityKindOf(w.type) })), tomorrow: morning.tomorrow || [], context: morning.context, date }).changed || null : null;
  const summary = readinessSummary(coaches.morningSummary || null, readiness, checkin, planned.length > 0, done.length > 0 && !open.length, morningAdvice);

  // The day's plan: what was done at its time, then what is still planned in
  // the order of the plan (no clock: it comes after the last record, whenever
  // that is), then bedtime. The same sessions as Training → Tréninky týdne,
  // so a gym session or a watch workout outside the plan shows here too.
  // The watch's calories above the estimate the user chose to count (Plán dne → Kalorie k ověření).
  const watchExtra = deviceEnergyExtra(training.completed);
  const detailOf = s => [num(s.minutes) ? Math.round(num(s.minutes)) + " min" : null, num(s.tss) ? Math.round(num(s.tss)) + " TSS" : null].filter(Boolean).join(" · ") || null;

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
    saved: savedRecovery,
    less: Array.isArray(rec.less) ? rec.less : []
  }) : null;
  const stretchName = recoveryCard?.items?.find(i => i.kind === "stretch")?.title;
  const recoveryItems = savedRecovery.map(r => ({
    kind: "recovery",
    recovery: r.kind,
    // The saved row, so Plán dne can delete it (DELETE /app/api/recovery).
    recoveryId: r.id ?? null,
    time: r.done ? clockOf(r.doneAt) : null,
    title: r.kind === "stretch" && stretchName ? stretchName : r.title,
    detail: r.minutes + " min" + (r.kind !== "stretch" ? "" : " · " + r.items.length + " " + L("cviků", "moves")) + (r.done ? L(" · hotovo", " · done") : ""),
    done: r.done,
    status: r.done ? "done" : "planned"
  }));
  // Cycle tracking (cycle-model.js, profile.cycle from dashboard-shared.js):
  // on a bleeding day with heavy flow, cramps or fatigue a hard ride or run
  // shows as an easy one ("eased", the original kept for "vrátit"), unless
  // the athlete kept the plan that day; the pill of the pack joins the plan.
  const cycleIn = profile?.cycle || null;
  const cyc = cycleIn ? cycleState({ settings: cycleIn.settings, days: cycleIn.days, date }) : null;
  const keepPlan = !!cycleIn?.days?.find(d => d.date === date)?.keepPlan;
  const caution = cyc ? cycleTrainingCaution(cyc) : null;
  let eased = false;
  const easy = (s, item) => {
    if (!caution || keepPlan || s.status !== "planned" || !["ride", "run"].includes(s.sport) || !isHardSession(s.title, s.sport)) return item;
    eased = true;
    return { ...item, title: s.sport === "run" ? L("Lehký běh 30 min", "Easy run 30 min") : L("Lehká jízda 45 min", "Easy ride 45 min"), detail: null, eased: { title: s.title } };
  };
  const pill = cyc?.pill && !cyc.pill.pause ? cyc.pill : null;
  const pillItems = pill ? [{
    kind: "pill",
    time: /^\d\d:\d\d$/.test(String(pill.taken || "")) ? pill.taken : null,
    title: L(`Prášek ${pill.number} z ${pill.of}`, `Pill ${pill.number} of ${pill.of}`),
    detail: null,
    done: !!pill.taken,
    status: pill.taken ? "done" : "planned"
  }] : [];
  const byTime = (a, b) => String(a.time || "99").localeCompare(String(b.time || "99"));
  // Horko (heat-advice.js): a ride or run still ahead, outdoors, on a hot day.
  const heatOf = s => s.status !== "planned" ? null : heatAdvice({ sport: s.sport, weather: forecast, time: s.time, indoor: indoorText(s.title + " " + (s.type || "")) })?.short || null;
  const planItems = [
    ...[...done, ...open].map(s => easy(s, {
      kind: "workout",
      // ride, run, swim or strength: the app opens the gym session for strength.
      sport: s.sport === "strength" ? "strength" : ["run", "ride", "swim"].includes(s.sport) ? s.sport : "other",
      time: s.status === "done" ? s.time : null,
      title: s.title,
      detail: detailOf(s),
      done: s.status === "done",
      // "done", "planned" or "missed" (a past day's plan nothing was done for).
      status: s.status,
      session: s,
      ...(heatOf(s) ? { heat: heatOf(s) } : {}),
      // What a done session added to the day's strain (Den: "+5,1 tréninkem"),
      // from its TSS the same way the plan's strain is estimated.
      ...(s.status === "done" && plannedStrain(num(s.tss)) != null ? { strain: plannedStrain(num(s.tss)) } : {})
    })),
    ...recoveryItems,
    ...pillItems
  ];
  // Done first in the order of the day, then what is still open, then bedtime
  // with the planned wake time (Den draws the night ahead dashed to it).
  const ordered = [...planItems.filter(i => i.done).sort(byTime), ...planItems.filter(i => !i.done),
    ...(plan ? [{ kind: "bedtime", time: clock(plan.bed), end: clock(plan.wake), title: L("Do postele", "Bedtime"), detail: (choice.chosen != null ? L("spánek ", "sleep ") : L("potřeba spánku ", "sleep need ")) + Math.floor(tonightNeed / 60) + " h " + String(tonightNeed % 60).padStart(2, "0") + " min", done: false }] : [])
  ];

  return {
    status: "ok",
    date,
    // Parts that could not be read this time (entrypoint.js todayUnavailable): their card says so.
    unavailable: Array.isArray(unavailable) ? unavailable : [],
    // Connected services that need the user (connection-health.js), shown at the top.
    connectionProblems: Array.isArray(connectionProblems) ? connectionProblems : [],
    // provisional: the baseline is carried over from another source until the
    // new one has 14 days of its own (recovery-model.js sourceBaseline).
    readiness: { score: readiness.score, zone: readiness.zone, missing: readiness.missing || [], flags: readiness.flags || [], provisional: !!readiness.provisional, provisionalDays: readiness.provisional ? readiness.provisionalDays ?? null : null },
    week,
    // The morning check-in: fresh, normal, tired, sick or null (not answered).
    checkin: checkin || null,
    trainingPlan: trainingPlan || null,
    sleep: night ? {
      minutes: num(night.durationMin),
      inBedMinutes: num(night.timeInBedMin),
      index: sleepIndexFor(night, need),
      need,
      start: clockOf(night.startTime),
      end: clockOf(night.endTime)
    } : null,
    // The day's naps for Dnes → Den: each sleep that began today after the night.
    naps: napsOn(sessions, date, night),
    strain: { score: strainNow, training: strainParts.training, movement: strainParts.movement, planned: plannedStrain(plannedTss), target: { ...strainTarget({ readiness: readiness.score, zone: readiness.zone, planned: plannedStrain(plannedTss), debt: debtNow?.minutes || 0, rest: !daySession.length }), rest: !daySession.length, readiness: readiness.score ?? null, debt: debtNow?.minutes ?? null, feeling: checkin || null, plan: planned.map(w => String(w.name || "").trim()).filter(Boolean).join(", ").slice(0, 80) || null } },
    // metric: "rmssd" or "sdnn" when the source said how it measures (Apple Health), else null.
    // Today's HRV shows even before its source has the 14 days a baseline needs.
    hrv: hrv ? { value: round(hrv.value), baseline: round(hrv.baseline), low: round(hrv.low), high: round(hrv.high), trend: hrv.trend, metric: hrvMetric(rows.find(r => r.id === date)), series: last(30, "hrv") }
      : num(rows.find(r => r.id === date)?.hrv) > 0 ? { value: round(num(rows.find(r => r.id === date).hrv)), baseline: null, low: null, high: null, trend: null, metric: hrvMetric(rows.find(r => r.id === date)), series: last(30, "hrv") } : null,
    restingHR: restingHR ? { value: round(restingHR.value), baseline: round(restingHR.baseline, 1), low: round(restingHR.low, 1), high: round(restingHR.high, 1), series: last(14, "restingHR") } : null,
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
    // Cycle tracking, null when off: the morning question, the day's log, the
    // pill and whether the coach eased the day.
    cycle: cyc ? {
      ask: askPeriodToday(cyc),
      hormonal: !!cyc.hormonal,
      // "regular", "perimenopause" or "menopause" (cycle-model.js).
      lifeStage: cyc.lifeStage || "regular",
      cycleDay: cyc.cycleDay ?? null,
      phase: cyc.phase ?? null,
      flow: cyc.today?.flow || 0,
      symptoms: cyc.today?.symptoms || [],
      pill,
      eased,
      keptPlan: keepPlan && !!caution,
      note: eased ? L("Dnes jen lehce, náročný trénink počká na lepší den.", "Easy today; the hard session can wait for a better day.") : null
    } : null,
    recovery: recoveryCard,
    // Regenerace (recovery-time.js): /app/api/today fills it in for today.
    recoveryTime: null,
    tonight: plan ? { bedtime: clock(plan.bed), wake: clock(plan.wake), need: tonightNeed, wakeSet: plan.wakeSource === "setting" } : null,
    steps: { today: num(todayRow.steps), goal: STEP_GOAL, week: last(7, "steps"), month: last(30, "steps"), hourly: byHour[date] ? byHour[date].map(v => Math.round(v)) : null, usual, hour, activeKcal: activeKcal(num(todayRow.activeCalories), watchExtra), activeKcalExcluded: watchExtra || null, activeMinutes: activeMinutes(google, date) },
    weight: weights.length ? { latest: weights.at(-1).value, goal: num(profile.targetWeight), series: weights } : null,
    weather: todayWeather(location, forecast, date)
  };
}
