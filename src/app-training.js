// The Training screen of the native iPhone app (ios-native/) in one response:
// today's strain and the week's, the next session, the main event and the
// phase of the preparation, form (fitness, fatigue), VO2max, time in heart-rate
// zones, the weeks' load, the acute:chronic workload ratio and monotony.
// Pure: GET /app/api/training loads the inputs.
import { groupOfType, typeName } from "./activity-type.js";
import { mergeWellnessRows, strainScore, dayStrainParts } from "./recovery-model.js";
import { sessionLoad } from "./training-load.js";
import { athleteFocus } from "./athlete-focus.js";
import { localDateTime } from "./user-time.js";
import { L } from "./lang.js";
import { complianceBand, enduranceCompliance } from "./plan-compliance.js";
import { workloadMetrics } from "./workload-ratio.js";

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

// The day's strain as Today shows it (recovery-model.js dayStrainParts).
function actualStrain(row, done = []) {
  return dayStrainParts({ zoneMinutes: row?.hrZoneMinutes, steps: num(row?.steps), sessions: done }).score;
}

// A watch workout without a TSS (a gym session, Apple Health, Google) gets
// one from its average heart rate, so the strain detail can split the day
// between training and movement (StrainDetailView). Resting HR is the median
// of the last 30 days, max HR the profile's or from age (Tanaka).
export function withHeartRateLoad(training, wellness, profile, date) {
  const completed = Array.isArray(training?.completed) ? training.completed : [];
  const rest = (Array.isArray(wellness) ? wellness : []).filter(r => r && r.id <= date && r.id >= shift(date, -30)).map(r => num(r.restingHR)).filter(v => v > 0).sort((a, b) => a - b);
  const age = num(profile?.age);
  const athlete = { restHr: num(profile?.restHr) || (rest.length ? rest[Math.floor(rest.length / 2)] : null), maxHr: num(profile?.maxHr) || (age ? Math.round(208 - 0.7 * age) : null), sex: profile?.sex || null };
  if (!athlete.restHr || !athlete.maxHr || !completed.some(a => num(a?.tss) == null)) return training;
  return {
    ...training,
    completed: completed.map(a => {
      if (!a || num(a.tss) != null) return a;
      const avgHr = num(a.averageHeartRate ?? a.payload?.average_heartrate), minutes = (num(a.durationHours) || 0) * 60;
      if (!(avgHr > 0) || !(minutes > 0)) return a;
      const tss = sessionLoad({ minutes, avgHr, kind: /weight|strength|gym/i.test(String(a.type || "")) ? "strength" : "other" }, athlete);
      return tss != null ? { ...a, tss, tssFromHeartRate: true } : a;
    })
  };
}

// Intervals.icu's form zones (training stress balance = fitness − fatigue).
export function formZone(tsb) {
  if (tsb == null) return null;
  if (tsb > 25) return { key: "transition", label: L("odpočatý", "rested"), text: L("Forma je vysoko nad nulou: tělo je odpočaté, ale kondice bez zátěže pomalu klesá.", "Form is well above zero: your body is rested, but fitness slowly fades without training load.") };
  if (tsb > 5) return { key: "fresh", label: L("čerstvý", "fresh"), text: L("Čerstvá forma: únava je pod kondicí, dobrý čas na závod nebo test.", "Fresh: fatigue is below fitness, a good time for a race or a test.") };
  if (tsb >= -10) return { key: "grey", label: L("udržování", "maintaining"), text: L("Únava a kondice jsou vyrovnané: kondice se drží, ale moc neroste.", "Fatigue and fitness are balanced: fitness holds, but barely grows.") };
  if (tsb >= -30) return { key: "optimal", label: L("budování", "building"), text: L("Únava je nad kondicí, přesně jak má při budování být. Kondice roste.", "Fatigue is above fitness, exactly as it should be while building. Fitness is growing.") };
  return { key: "risk", label: L("vysoké riziko", "high risk"), text: L("Únava je hodně nad kondicí. Zařaď lehčí dny, jinak hrozí přetížení.", "Fatigue is far above fitness. Add easier days, or you risk overreaching.") };
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
    { key: "base", label: L("Základ", "Base"), from: null, to: shift(buildFrom, -1) },
    { key: "build", label: L("Rozvoj", "Build"), from: buildFrom, to: shift(taperFrom, -1) },
    { key: "taper", label: L("Ladění", "Taper"), from: taperFrom, to: shift(event.date, -1) }
  ].map((p, i) => ({
    ...p,
    state: i < now ? "done" : i === now ? "now" : "next",
    ...(i === now && p.from ? week(p.from, shift(p.to, 1)) : {})
  }));
  return { name: event.name || null, date: event.date, daysLeft: left, phase, phases };
}

// How a done session kept to its plan (Training → Tréninky týdne and the
// calendar colour it and show the percent): compliance is the percent of the
// plan that was done (plan-compliance.js), "good" within 85–115 % of it, "off"
// with a short reason otherwise. In the gym the percent comes from the sets
// against the plan (gym.compliance), else from the share of sets logged.
// Nothing to compare (a stub without data) counts as good, without a percent.
const PLAN_MARGIN = 0.15;
const hm = minutes => minutes >= 60 ? Math.floor(minutes / 60) + " h" + (minutes % 60 ? " " + String(minutes % 60).padStart(2, "0") : "") : minutes + " min";
export function adherenceOf(done = {}, plan = {}, gym = null) {
  const sets = num(gym?.sets), logged = num(gym?.logged);
  if (sets > 0 && logged > 0) {
    const compliance = num(gym.compliance) ?? Math.round(logged / sets * 100);
    if (complianceBand(compliance) === "good") return { adherence: "good", compliance };
    return { adherence: "off", compliance, adherenceReason: logged < sets ? L("jen " + logged + " z " + sets + (sets === 1 ? " série" : " sérií"), "only " + logged + " of " + sets + (sets === 1 ? " set" : " sets")) : compliance > 100 ? L("víc než plán", "more than planned") : L("méně než plán", "less than planned") };
  }
  const compliance = enduranceCompliance(done, plan)?.percent ?? null;
  const ratio = (a, p) => (a > 0 && p > 0 ? a / p - 1 : null);
  const planMinutes = num(plan.durationHours) ? Math.round(num(plan.durationHours) * 60) : null;
  const length = ratio(num(done.durationHours), num(plan.durationHours));
  const load = ratio(num(done.tss), num(plan.tss));
  const withPercent = compliance != null ? { compliance } : {};
  if (compliance != null && complianceBand(compliance) === "good") return { adherence: "good", ...withPercent };
  if (length != null && Math.abs(length) > PLAN_MARGIN) {
    return { adherence: "off", ...withPercent, adherenceReason: length < 0 ? L("kratší než plán (" + hm(planMinutes) + ")", "shorter than planned (" + hm(planMinutes) + ")") : L("delší než plán (" + hm(planMinutes) + ")", "longer than planned (" + hm(planMinutes) + ")") };
  }
  if (load != null && Math.abs(load) > PLAN_MARGIN) {
    return { adherence: "off", ...withPercent, adherenceReason: load > 0 ? L("vyšší intenzita než plán", "harder than planned") : L("nižší intenzita než plán", "easier than planned") };
  }
  if (compliance != null) return { adherence: "off", ...withPercent, adherenceReason: compliance > 100 ? L("víc než plán", "more than planned") : L("méně než plán", "less than planned") };
  return { adherence: "good" };
}

const isWorkout = a => a && (num(a.durationHours) ?? 0) >= 0.15;

// One day's sessions (Training → Tréninky týdne, Today → Plán dne): what was
// done (with the Intervals.icu id for its detail) and what is still planned
// (its event id, to move or delete it). A plan that was done is shown once, as
// done; on a past day a plan nothing was done for is "missed".
export function daySessions(d, date, training = {}, gymDay = null) {
  // The app's own copy of that day's gym plan (a planned:local-… strength
  // event kept for Intervals.icu) is the same session as the gym plan.
  const appGymCopy = w => gymDay?.exercises?.length && sportOf(w) === "strength" && /^(planned:)?local-/.test(String(w.id ?? ""));
  const planned = (training.planned || []).filter(w => w && !appGymCopy(w));
  const matchedPlans = (training.matched || []).filter(m => m?.planned);
  // An activity paired with a plan counts even without a length (a Strava stub).
  const pairedIds = new Set(matchedPlans.map(m => String(m.actualId ?? "")).filter(Boolean));
  // So does every Intervals.icu activity: a Strava stub (no length, no sport,
  // often a gym session from the watch) is still a session that was done.
  const completed = (training.completed || []).filter(a => isWorkout(a) || (a && (pairedIds.has(String(a.id ?? "")) || a.source === "intervals")));
  const pTss = planned.reduce((s, w) => s + (num(w.tss) || 0), 0);
  const cTss = completed.reduce((s, w) => s + (num(w.tss) || 0), 0);
  // A gym plan saved in the app is its own session unless the day already
  // has a strength session, planned in Intervals.icu or done; other sports
  // that day do not hide it. Sets logged in the app mean it was done.
  const strengthDay = [...planned, ...matchedPlans.map(m => m.planned), ...(training.completed || [])].some(w => w && sportOf(w) === "strength");
  const gymPlan = !strengthDay && gymDay?.exercises?.length ? gymDay : null;
  const gymLogged = gymPlan?.logged > 0 ? 1 : 0;
  const matchedIds = new Set(matchedPlans.map(m => m.planned.id).filter(Boolean));
  const planOf = new Map(matchedPlans.map(m => [String(m.actualId ?? ""), m.planned]));
  const sessions = [];
  for (const a of completed) {
    // A Strava stub has neither name nor sport: the plan it was paired with names it.
    const plan = planOf.get(String(a.id ?? ""));
    const session = sessionOf(plan && sportOf(a) === "other" ? { ...a, name: plan.name || a.name, type: plan.type || a.type } : a, d, "done");
    // A strength session done on a day with a gym plan saved in the app fulfils it.
    const gymSets = session.sport === "strength" && gymDay?.exercises?.length ? gymDay : null;
    const fit = plan ? adherenceOf(a, plan, gymSets) : gymSets ? adherenceOf(a, {}, gymSets) : { adherence: "offplan" };
    sessions.push({ ...(plan?.id ? { ...session, plannedId: String(plan.id) } : session), ...fit });
  }
  for (const w of planned) if (!matchedIds.has(w.id) && !(d < date && completed.length)) sessions.push(sessionOf(w, d, d < date ? "missed" : "planned"));
  if (gymPlan) sessions.push({ id: "gym:" + d, kind: "gym", status: gymLogged ? "done" : d < date ? "missed" : "planned", date: d, time: null, title: gymPlan.name || L("Posilovna", "Gym"), sport: gymPlan.type ? groupOfType(gymPlan.type) || "other" : "strength", ...(gymPlan.type ? { type: gymPlan.type } : {}), minutes: null, tss: null, activityId: null, eventId: null, ...(gymLogged ? adherenceOf({}, {}, gymPlan) : {}) });
  return { sessions, planned, completed, gymPlan, gymLogged, pTss, cTss };
}

// A session's state against the plan, as the app colours it (PlanState in
// ios-native PlanSessionActions.swift): "good" done as planned, "off" done
// differently, "missed", "planned" still ahead, "offplan" done outside the plan.
export function planStateOf(session) {
  if (!session) return null;
  if (session.status === "missed") return "missed";
  if (session.status !== "done") return "planned";
  return session.adherence === "off" ? "off" : session.adherence === "offplan" ? "offplan" : "good";
}

// One state for a whole day (the training calendar's day): a missed plan
// first, then a session done differently, then one done as planned, then a
// plan still ahead, and only then what was done outside the plan; null for a
// day without sessions.
const DAY_ORDER = ["missed", "off", "good", "planned", "offplan"];
export function dayPlanState(sessions = []) {
  const states = new Set((sessions || []).map(planStateOf).filter(Boolean));
  return DAY_ORDER.find(s => states.has(s)) || null;
}

// The Training screen's "Nastav si zaměření a cíle" card shows until the
// athlete has chosen a main sport and a goal (the saved profile, not what the
// suggestions fill in: effectiveProfile always has a sport).
export function profileIncomplete(saved) {
  if (!saved || typeof saved !== "object") return true;
  const sport = String(saved.mainSport || "").trim(), goal = String(saved.sportGoal || "").trim();
  return !sport || !goal;
}

export function buildTraining({ date, days = [], health = {}, fitness = {}, insights = {}, coaches = {}, profile = {}, savedProfile, gym = {} }) {
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
    const d = shift(start, i), training = d <= date ? withHeartRateLoad(byDate.get(d)?.training || {}, google, profile, d) : byDate.get(d)?.training || {};
    const { sessions: daySessionList, planned, completed, gymPlan, gymLogged, pTss, cTss } = daySessions(d, date, training, gym[d]);
    const gymOnly = gymPlan ? 1 : 0;
    // Sessions of the week: the planned ones, and on past days whatever was
    // done on top of the plan.
    plannedCount += d <= date ? Math.max(planned.length + gymOnly, completed.length + gymLogged) : planned.length + gymOnly;
    if (d <= date) { doneCount += completed.length + gymLogged; doneTss += cTss; }
    plannedTss += d < date ? cTss : Math.max(pTss, d === date ? cTss : 0);
    sessions.push(...daySessionList);
    return {
      date: d,
      strain: d <= date ? actualStrain(google.find(r => r.id === d), daySessionList.filter(s => s.status === "done")) : null,
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
        title: (w?.name || plan?.name || w?.type || L("Trénink", "Workout")).trim(),
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

  // The acute:chronic workload ratio and the week's monotony and strain from
  // the same daily loads as fitness and fatigue (workload-ratio.js); null
  // without any load on record.
  const workload = workloadMetrics(intervals, date);

  // Load per week (Monday to Sunday) for the last 8 weeks, from Intervals.icu,
  // split by intensity where the activities have heart-rate or power zones.
  const split = Array.isArray(insights.cardioFocus?.weeks) ? insights.cardioFocus.weeks : [];
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const from = shift(start, (i - 7) * 7), to = shift(from, 6);
    const load = intervals.filter(r => r.id >= from && r.id <= to).reduce((s, r) => s + (num(r.ctlLoad ?? r.atlLoad ?? r.load) || 0), 0);
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
  // The same minutes per week (Monday to Sunday) for the last 4 weeks, the
  // current one last: the app compares moderate + vigorous + peak with WHO's
  // 150 minutes a week.
  const zoneWeeks = Array.from({ length: 4 }, (_, i) => {
    const from = shift(start, (i - 3) * 7), to = shift(from, 6);
    const sum = { light: 0, moderate: 0, vigorous: 0, peak: 0 };
    for (const r of google) if (r.id >= from && r.id <= to && r.id <= date && r.hrZoneMinutes) for (const k of Object.keys(sum)) sum[k] += num(r.hrZoneMinutes[k]) || 0;
    return { start: from, week: isoWeek(from), ...Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v)])) };
  });
  const zoneWeeksTotal = zoneWeeks.reduce((s, w) => s + w.light + w.moderate + w.vigorous + w.peak, 0);

  // VO2max over half a year: Google's daily estimate, else Intervals.icu's.
  const vo2 = rows.filter(r => num(r.vo2max) > 0).map(r => ({ date: r.id, value: round(num(r.vo2max), 1) }));
  const vo2Source = vo2.length ? vo2 : intervals.filter(r => num(r.vo2max) > 0).map(r => ({ date: r.id, value: round(num(r.vo2max), 1) }));
  const vo2Latest = vo2Source.at(-1) || null;
  const vo2Before = vo2Latest ? [...vo2Source].reverse().find(p => p.date <= shift(vo2Latest.date, -28)) : null;

  // Active energy today and the week's days, and the last 28 days for the
  // detail (Training → Aktivní výdej).
  // A session the user counts at the estimate takes the watch's extra off.
  const extraOn = d => deviceEnergyExtra(byDate.get(d)?.training?.completed);
  const activeOn = d => {
    const v = round(num(google.find(r => r.id === d)?.activeCalories));
    return v == null ? null : Math.max(0, v - extraOn(d));
  };
  const activeDays = Array.from({ length: 28 }, (_, i) => shift(date, i - 27)).map(d => ({ date: d, value: activeOn(d) })).filter(p => p.value != null);
  const active = activeDays.filter(p => p.date > shift(date, -7));
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
    acwr: workload.historyDays > 0 ? workload.acwr : null,
    monotony: workload.historyDays > 0 ? workload.monotony : null,
    zones: zoneTotal > 0 || zoneWeeksTotal > 0 ? { ...Object.fromEntries(Object.entries(zones).map(([k, v]) => [k, Math.round(v)])), minutes: Math.round(zoneTotal), weeks: zoneWeeks } : null,
    vo2max: vo2Latest ? { value: vo2Latest.value, change: vo2Before ? round(vo2Latest.value - vo2Before.value, 1) : null, series: vo2Source.filter(p => p.date > shift(date, -182)) } : null,
    activeCalories: activeDays.length ? { today: active.find(p => p.date === date)?.value ?? null, excluded: extraOn(date) || null, usual: usualActive.length ? Math.round(usualActive.reduce((a, b) => a + b, 0) / usualActive.length) : null, week: active, days: activeDays } : null,
    sessions,
    thisWeek: { done: doneCount, planned: plannedCount, doneLoad: Math.round(doneTss), plannedLoad: Math.round(Math.max(plannedTss, doneTss)) },
    profileIncomplete: profileIncomplete(savedProfile === undefined ? profile : savedProfile)
  };
}

const SPORTS = [[/virtualride|ride|cycl|bike|kolo/i, "ride"], [/run|běh/i, "run"], [/weight|strength|gym|posil|síl/i, "strength"], [/swim|plav/i, "swim"], [/walk|hike|chůze/i, "walk"]];
function sportOf(w) {
  const known = groupOfType(w?.type);
  if (known) return known;
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
    // A plan at midnight is the day without a time (Intervals.icu's "any time").
    time: !done && clockOf(w.start) === "00:00" ? null : clockOf(w.start),
    // A watch workout without its own name is named by its type, in words
    // ("Posilovna", not "WeightTraining").
    title: String((w.name && w.name !== w.type ? w.name : w.type ? typeName(w.type) : w.name) || L("Trénink", "Workout")).slice(0, 120),
    sport: sportOf(w),
    minutes: num(w.durationHours) ? Math.round(num(w.durationHours) * 60) : null,
    tss: round(num(w.tss)),
    activityId: activityId && /^[a-zA-Z0-9_-]{1,80}$/.test(activityId) ? activityId : null,
    eventId: !done && /^planned:/.test(String(w.id || "")) ? String(w.id) : null,
    // A workout from the watch opens its own detail (watch-detail.js), one from Wahoo too (wahoo-detail.js).
    ...(done && ["google-wearables", "apple-health"].includes(w.family) && w.id ? { watch: { source: w.family, id: String(w.id) } }
      : done && /^wahoo:\d+$/.test(String(w.id || "")) ? { watch: { source: "wahoo", id: String(w.id) } }
      : done && /^(google-wearables|apple-health):./.test(String(w.payload?.pairedWith || "")) ? { watch: { source: w.payload.pairedWith.slice(0, w.payload.pairedWith.indexOf(":")), id: w.payload.pairedWith.slice(w.payload.pairedWith.indexOf(":") + 1) } } : {}),
    ...(done ? energyOf(w) : {}),
    ...(done ? distanceAndPower(w) : {}),
    // Who recorded a watch workout (workout-merge.js sourcesOf): two after a merge.
    ...(done && Array.isArray(w.sources) && w.sources.length ? { sources: w.sources } : {}),
    ...(done && w.payload?.loadwiseMerge?.energy ? { mergeEnergy: String(w.payload.loadwiseMerge.energy) } : {})
  };
}

// Dnes → Den: a done ride or run's distance and average power, from
// Intervals.icu or the watch's summary; absent when the device had none.
function distanceAndPower(w) {
  const p = w.payload && typeof w.payload === "object" ? w.payload : {};
  const m = p.exercise?.metricsSummary && typeof p.exercise.metricsSummary === "object" ? p.exercise.metricsSummary : {};
  const metric = match => {
    const key = Object.keys(m).find(k => match.test(k) && !/zone|variab|max/i.test(k));
    const v = key ? num(m[key] && typeof m[key] === "object" ? m[key].value : m[key]) : null;
    return v > 0 ? (/millimeter/i.test(key) ? v / 1000 : v) : null;
  };
  const meters = num(p.distance) ?? metric(/^distance/i);
  const watts = p.device_watts === false ? null : num(p.icu_average_watts ?? p.average_watts) ?? metric(/power/i);
  return { ...(meters > 0 ? { distanceKm: round(meters / 1000, 1) } : {}), ...(watts > 0 ? { watts: Math.round(watts) } : {}) };
}

// What the device says the session burned and, when that is implausible
// (activity-energy-check.js), the estimate the energy budget plans with.
// kcalChoice: what the user chose for it (activity-energy-choices.js),
// "estimate" or "device"; absent while it waits to be checked.
function energyOf(w) {
  const kcal = round(num(w.energyCheck?.reported ?? w.reportedCalories ?? w.calories));
  if (!(kcal > 0)) return {};
  // Set in Aurin by hand or by the coach (activity-edits.js); the device's number stays known.
  if (w.payload?.loadwiseKcal != null) return { kcal, kcalEdited: true, ...(num(w.payload.loadwiseKcalDevice) > 0 ? { kcalDevice: round(num(w.payload.loadwiseKcalDevice)) } : {}) };
  const c = w.energyCheck;
  if (c?.status !== "review") return { kcal };
  const out = { kcal, kcalEstimate: { value: round(num(w.autoCaloriesForPlanning ?? w.caloriesForPlanning ?? c.estimated)), low: c.low, high: c.high, reason: c.reason || null } };
  return w.energyChoice ? { ...out, kcalChoice: w.energyChoice } : out;
}

// The watch's calories left out of a day's active energy: what it counted
// above the estimate for the sessions the user chose to count the estimate for.
export function deviceEnergyExtra(completed = []) {
  let extra = 0;
  for (const w of completed || []) {
    if (w?.energyChoice !== "estimate") continue;
    const device = num(w.energyCheck?.reported ?? w.reportedCalories ?? w.calories), counted = num(w.caloriesForPlanning);
    if (device > 0 && counted != null && device > counted) extra += device - counted;
  }
  return Math.round(extra);
}

function strainBand(v) {
  if (v == null) return null;
  return v >= 18 ? L("maximální", "all out") : v >= 14 ? L("vysoká", "high") : v >= 10 ? L("střední", "moderate") : L("lehká", "light");
}

// The coach's first tip for today's session (coach-engine.js).
function coachAdvice(coaches) {
  const coach = (coaches.coaches || []).find(c => c && ["cycling", "gym"].includes(c.id) && Array.isArray(c.actions) && c.actions.length);
  return coach ? String(coach.actions[0]).slice(0, 280) : null;
}
