// The Training screen of the native iPhone app (ios-native/) in one response:
// today's strain and the week's, the next session, the main event and the
// phase of the preparation, form (fitness, fatigue), VO2max, time in heart-rate
// zones and the weeks' load. Pure: GET /app/api/training loads the inputs.
import { mergeWellnessRows, heartRateLoad, strainScore } from "./recovery-model.js";
import { athleteFocus } from "./athlete-focus.js";
import { localDateTime } from "./user-time.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
const clockOf = iso => {
  const local = iso ? localDateTime(iso) : "";
  return /T\d{2}:\d{2}/.test(local) ? local.slice(11, 16) : null;
};

export const weekStart = date => shift(date, -((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));

// ISO week number (week 1 holds the year's first Thursday).
export function isoWeek(date) {
  const thursday = shift(date, 3 - ((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7));
  return Math.floor(daysBetween(thursday.slice(0, 4) + "-01-01", thursday) / 7) + 1;
}

// Planned training on the strain scale 0–21, from TSS (as Today and the web).
export const plannedStrain = tss => (tss > 0 ? round(21 * (1 - Math.exp(-tss / 90)), 1) : null);

function actualStrain(row) {
  const load = heartRateLoad(row?.hrZoneMinutes);
  return load == null ? null : strainScore(load);
}

// Intervals.icu's form zones (training stress balance = fitness − fatigue).
export function formZone(tsb) {
  if (tsb == null) return null;
  if (tsb > 25) return { key: "transition", label: "odpočatý", text: "Forma je vysoko nad nulou: tělo je odpočaté, ale kondice bez zátěže pomalu klesá." };
  if (tsb > 5) return { key: "fresh", label: "čerstvý", text: "Čerstvá forma: únava je pod kondicí, dobrý čas na závod nebo test." };
  if (tsb >= -10) return { key: "grey", label: "udržování", text: "Únava a kondice jsou vyrovnané: kondice se drží, ale moc neroste." };
  if (tsb >= -30) return { key: "optimal", label: "budování", text: "Únava je nad kondicí, přesně jak má při budování být. Kondice roste." };
  return { key: "risk", label: "vysoké riziko", text: "Únava je hodně nad kondicí. Zařaď lehčí dny, jinak hrozí přetížení." };
}

// Periodization towards the main event, the same rule as the coach
// (cycling-coach-v2.js): base, then 12 weeks of build, the final week taper.
export function eventPlan(event, date) {
  if (!event?.date) return event ? { ...event, phase: null, phases: [] } : null;
  const left = daysBetween(date, event.date);
  const buildFrom = shift(event.date, -84), taperFrom = shift(event.date, -7);
  const phase = left <= 0 ? "race" : left <= 7 ? "taper" : left <= 84 ? "build" : "base";
  const order = ["base", "build", "taper"];
  const now = phase === "race" ? 3 : order.indexOf(phase);
  const week = (from, to) => ({ week: Math.floor(daysBetween(from, date) / 7) + 1, weeks: Math.max(1, Math.ceil(daysBetween(from, to) / 7)) });
  const phases = [
    { key: "base", label: "Základ", from: null, to: shift(buildFrom, -1) },
    { key: "build", label: "Rozvoj", from: buildFrom, to: shift(taperFrom, -1) },
    { key: "taper", label: "Ladění", from: taperFrom, to: shift(event.date, -1) }
  ].map((p, i) => ({
    ...p,
    state: i < now ? "done" : i === now ? "now" : "next",
    ...(i === now && p.from ? week(p.from, shift(p.to, 1)) : {})
  }));
  return { name: event.name || null, date: event.date, daysLeft: left, phase, phases };
}

const isWorkout = a => a && (num(a.durationHours) ?? 0) >= 0.15;

export function buildTraining({ date, days = [], health = {}, fitness = {}, insights = {}, coaches = {}, profile = {}, gym = {} }) {
  const google = Array.isArray(health.wellness) ? health.wellness : [];
  const intervals = (Array.isArray(fitness.wellness) ? fitness.wellness : []).filter(r => r.id <= date);
  const rows = mergeWellnessRows(google, intervals);
  const start = weekStart(date);
  const byDate = new Map(days.map(d => [d.date, d.daily || {}]));

  // The week, Monday to Sunday: what was done (heart rate through the day) and
  // what is planned (the planned sessions' TSS).
  let doneCount = 0, plannedCount = 0, doneTss = 0, plannedTss = 0;
  const sessions = [];
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = shift(start, i), training = byDate.get(d)?.training || {};
    const planned = (training.planned || []).filter(Boolean);
    const completed = (training.completed || []).filter(isWorkout);
    const pTss = planned.reduce((s, w) => s + (num(w.tss) || 0), 0);
    const cTss = completed.reduce((s, w) => s + (num(w.tss) || 0), 0);
    const gymOnly = !planned.length && gym[d]?.exercises?.length ? 1 : 0;
    // Sessions of the week: the planned ones, and on past days whatever was
    // done on top of the plan.
    plannedCount += d <= date ? Math.max(planned.length + gymOnly, completed.length) : planned.length + gymOnly;
    if (d <= date) { doneCount += completed.length; doneTss += cTss; }
    plannedTss += d < date ? cTss : Math.max(pTss, d === date ? cTss : 0);
    // The week's sessions for the list: what was done (with the Intervals.icu
    // id for its detail) and what is still planned (its event id, to move or
    // delete it). A plan that was done is shown once, as done.
    const matchedIds = new Set((training.matched || []).map(m => m?.planned?.id).filter(Boolean));
    for (const a of completed) sessions.push(sessionOf(a, d, "done"));
    for (const w of planned) if (!matchedIds.has(w.id) && !(d < date && completed.length)) sessions.push(sessionOf(w, d, d < date ? "missed" : "planned"));
    if (gymOnly) sessions.push({ id: "gym:" + d, kind: "gym", status: d < date ? "missed" : "planned", date: d, time: null, title: gym[d].name || "Posilovna", sport: "strength", minutes: null, tss: null, activityId: null, eventId: null });
    return {
      date: d,
      strain: d <= date ? actualStrain(google.find(r => r.id === d)) : null,
      planned: plannedStrain(Math.max(pTss, cTss)) ?? (gymOnly ? plannedStrain(45) : null),
      today: d === date
    };
  });

  // Today's strain against where the plan takes it.
  const today = week.find(w => w.today) || {};
  const todayTraining = byDate.get(date)?.training || {};
  const matched = new Set((todayTraining.matched || []).map(m => m?.planned?.name + "|" + m?.planned?.start));
  const remaining = (todayTraining.planned || []).filter(w => w && !matched.has(w.name + "|" + w.start));
  const remainingTss = remaining.reduce((s, w) => s + (num(w.tss) || 0), 0);
  // Strain is not additive: back to the heart-rate load (strainScore inverted),
  // add the session (TSS × 2.5 is the same load, see plannedStrain) and back.
  const loadNow = today.strain > 0 ? -225 * Math.log(1 - Math.min(today.strain, 20.9) / 21) : 0;
  const target = remainingTss > 0 ? round(strainScore(loadNow + remainingTss * 2.5), 1) : today.planned;
  if (today.date) today.planned = target;

  // The next session: one left today, else the first planned day after.
  let next = null;
  const ahead = [...new Set([...byDate.keys(), ...Object.keys(gym)])].filter(d => d >= date).sort();
  for (const d of ahead) {
    if (next) break;
    const training = d === date ? { planned: remaining } : byDate.get(d)?.training;
    const w = (training?.planned || []).find(Boolean);
    // Today's gym plan is done once a strength session was recorded.
    const plan = d === date && (todayTraining.completed || []).some(a => /weight|strength|gym/i.test(String(a?.type || ""))) ? null : gym[d];
    if (w || plan?.exercises?.length) {
      const minutes = w && num(w.durationHours) ? Math.round(num(w.durationHours) * 60) : null;
      const isGym = !!plan?.exercises?.length && (!w || /weight|strength|gym|posil|síl/i.test(String(w.type || "") + " " + String(w.name || "")));
      next = {
        date: d,
        time: w ? clockOf(w.start) : null,
        minutes,
        title: (w?.name || plan?.name || w?.type || "Trénink").trim(),
        sport: isGym ? "strength" : String(w?.type || "").toLowerCase() || null,
        tss: round(num(w?.tss)),
        strain: plannedStrain(num(w?.tss)),
        exercises: isGym ? plan.exercises.slice(0, 12) : [],
        description: w?.description ? String(w.description).split("\n").map(s => s.trim()).filter(Boolean).slice(0, 3).join(" ").slice(0, 240) : null,
        advice: d === date ? coachAdvice(coaches) : null
      };
    }
  }

  // Form: fitness (CTL), fatigue (ATL) and their difference, 12 weeks.
  const pmc = intervals.filter(r => r.id > shift(date, -84) && num(r.ctl) != null && num(r.atl) != null)
    .map(r => ({ date: r.id, fitness: round(num(r.ctl), 1), fatigue: round(num(r.atl), 1) }));
  const lastPmc = pmc.at(-1) || null;
  const tsb = lastPmc ? round(lastPmc.fitness - lastPmc.fatigue) : null;
  const zone = formZone(tsb);

  // Load per week (Monday to Sunday) for the last 8 weeks, from Intervals.icu,
  // split by intensity where the activities have heart-rate or power zones.
  const split = Array.isArray(insights.cardioFocus?.weeks) ? insights.cardioFocus.weeks : [];
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = shift(start, (i - 7) * 7), to = shift(from, 6);
    const load = intervals.filter(r => r.id >= from && r.id <= to).reduce((s, r) => s + (num(r.ctlLoad ?? r.atlLoad) || 0), 0);
    return { start: from, week: isoWeek(from), load: Math.round(load), planned: i === 7 ? Math.round(plannedTss) : null };
  });
  const intensity = insights.cardioFocus?.points > 0 ? {
    low: insights.cardioFocus.percent.low,
    high: insights.cardioFocus.percent.high,
    anaerobic: insights.cardioFocus.percent.anaerobic,
    weeks: split.map(w => ({ low: w.low, high: w.high, anaerobic: w.anaerobic }))
  } : null;

  // Minutes in Google's heart-rate zones over the last 4 weeks.
  const zones = { light: 0, moderate: 0, vigorous: 0, peak: 0 };
  for (const r of google) if (r.id > shift(date, -28) && r.id <= date && r.hrZoneMinutes) for (const k of Object.keys(zones)) zones[k] += num(r.hrZoneMinutes[k]) || 0;
  const zoneTotal = Object.values(zones).reduce((a, b) => a + b, 0);

  // VO2max over half a year: Google's daily estimate, else Intervals.icu's.
  const vo2 = rows.filter(r => num(r.vo2max) > 0).map(r => ({ date: r.id, value: round(num(r.vo2max), 1) }));
  const vo2Source = vo2.length ? vo2 : intervals.filter(r => num(r.vo2max) > 0).map(r => ({ date: r.id, value: round(num(r.vo2max), 1) }));
  const vo2Latest = vo2Source.at(-1) || null;
  const vo2Before = vo2Latest ? [...vo2Source].reverse().find(p => p.date <= shift(vo2Latest.date, -28)) : null;

  // Active energy today and the week's days.
  const active = Array.from({ length: 7 }, (_, i) => shift(date, i - 6)).map(d => ({ date: d, value: round(num(google.find(r => r.id === d)?.activeCalories)) })).filter(p => p.value != null);
  const usualActive = active.filter(p => p.date < date).map(p => p.value);

  return {
    status: "ok",
    date,
    week: isoWeek(date),
    strain: { score: today.strain ?? null, target, band: strainBand(target) },
    days: week,
    next,
    event: eventPlan(athleteFocus(profile, date).event, date),
    form: lastPmc ? { fitness: round(lastPmc.fitness), fatigue: round(lastPmc.fatigue), form: tsb, zone: zone.key, label: zone.label, text: zone.text, series: pmc } : null,
    load: { weeks, intensity },
    zones: zoneTotal > 0 ? { ...Object.fromEntries(Object.entries(zones).map(([k, v]) => [k, Math.round(v)])), minutes: Math.round(zoneTotal) } : null,
    vo2max: vo2Latest ? { value: vo2Latest.value, change: vo2Before ? round(vo2Latest.value - vo2Before.value, 1) : null, series: vo2Source.filter(p => p.date > shift(date, -182)) } : null,
    activeCalories: active.length ? { today: active.find(p => p.date === date)?.value ?? null, usual: usualActive.length ? Math.round(usualActive.reduce((a, b) => a + b, 0) / usualActive.length) : null, week: active } : null,
    sessions,
    thisWeek: { done: doneCount, planned: plannedCount, doneLoad: Math.round(doneTss), plannedLoad: Math.round(Math.max(plannedTss, doneTss)) }
  };
}

const SPORTS = [[/virtualride|ride|cycl|bike|kolo/i, "ride"], [/run|běh/i, "run"], [/weight|strength|gym|posil|síl/i, "strength"], [/swim|plav/i, "swim"], [/walk|hike|chůze/i, "walk"]];
function sportOf(w) {
  const text = String(w?.type || "") + " " + String(w?.name || "");
  return (SPORTS.find(([re]) => re.test(text)) || [null, "other"])[1];
}

// One row of the week's list (Training → Tento týden).
function sessionOf(w, date, status) {
  const done = status === "done";
  const activityId = done && w.source === "intervals" ? String(w.payload?.id || String(w.id || "").replace(/^activity:/, "")) || null : null;
  return {
    id: String(w.id || status + ":" + date + ":" + (w.name || "")),
    kind: done ? "activity" : "planned",
    status,
    date,
    time: clockOf(w.start),
    title: String(w.name || w.type || "Trénink").slice(0, 120),
    sport: sportOf(w),
    minutes: num(w.durationHours) ? Math.round(num(w.durationHours) * 60) : null,
    tss: round(num(w.tss)),
    activityId: activityId && /^[a-zA-Z0-9_-]{1,80}$/.test(activityId) ? activityId : null,
    eventId: !done && /^planned:/.test(String(w.id || "")) ? String(w.id) : null
  };
}

function strainBand(v) {
  if (v == null) return null;
  return v >= 18 ? "maximální" : v >= 14 ? "vysoká" : v >= 10 ? "střední" : "lehká";
}

// The coach's first tip for today's session (coach-engine.js).
function coachAdvice(coaches) {
  const coach = (coaches.coaches || []).find(c => c && ["cycling", "gym"].includes(c.id) && Array.isArray(c.actions) && c.actions.length);
  return coach ? String(coach.actions[0]).slice(0, 280) : null;
}
