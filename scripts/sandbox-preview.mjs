// Sandbox of the dashboard with sample data: nothing touches the live app,
// Intervals.icu, Google or the production database.
//   node scripts/sandbox-preview.mjs            → http://127.0.0.1:8792/app
//   node scripts/sandbox-preview.mjs --build F  → one static HTML file F
//   (add --fragment for a page whose host supplies <html>/<head>/<body>)
// Workout ranking and generation run the real code on an in-memory SQLite.
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dashboardPage } from "../src/dashboard.js";
import { gymExerciseCatalog } from "../src/gym-catalog.js";
import { FOCUS_GROUPS, generateStrengthPlan } from "../src/strength-generator.js";
import { planValues } from "../src/gym-plan-store.js";
import { searchWorkoutLibrary, generateWorkout, getCapabilities } from "../src/workout-library.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { planWeekRoles, sanitizeWeekPlan, weekTargets, ROLE_LABELS, ROLE_FOCUS } from "../src/week-planner.js";
import { powerZones, hrZones, paceZones, POWER_ZONE_MODELS, HR_ZONE_MODELS, PACE_ZONE_MODELS, FTP_METHODS, PACE_METHODS } from "../src/training-zones.js";
import { fitnessInsights } from "../src/fitness-insights.js";
import { sampleActivityStreams, activityIntervals, heartRateRecovery } from "../src/activity-detail.js";
import { createD1 } from "../tests/helpers/d1.mjs";
const plannerText = await readFile(new URL("../src/week-planner.js", import.meta.url), "utf8");
import { scopedDb } from "../src/tenancy.js";

const day = (offset, base = today()) => { const d = new Date(base + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
const monday = () => { const t = today(), wd = (new Date(t + "T12:00:00Z").getUTCDay() + 6) % 7; return day(-wd, t); };
const T = today(), MON = monday();

// ---- Sample athlete -------------------------------------------------------
const wellness = Array.from({ length: 90 }, (_, i) => {
  const id = day(i - 89), ctl = 48 + i * .09, atl = ctl + Math.sin(i / 3) * 9 - 2;
  return { id, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +(ctl - atl).toFixed(1), rampRate: 3.1, hrv: 58 + Math.round(Math.sin(i / 4) * 6), restingHR: 49 + Math.round(Math.cos(i / 5) * 2), ctlLoad: 40 + (i % 7) * 12 };
});
const sleep = Array.from({ length: 60 }, (_, i) => {
  const date = day(-i), minutes = 420 + Math.round(Math.sin(i) * 40);
  return { date, startTime: day(-i - 1) + "T21:40:00Z", endTime: date + "T05:" + String(10 + (i % 40)).padStart(2, "0") + ":00Z", durationMin: minutes, timeInBedMin: minutes + 25, stages: { DEEP: 80, REM: 95, LIGHT: minutes - 200, AWAKE: 25 } };
});
const ride = (date, name, hours, tss, hr) => ({ id: "i" + date.replace(/-/g, "") + name.length, source: "intervals", type: "Ride", name, durationHours: hours, tss, calories: Math.round(hours * 640), start: date + "T15:00:00Z", payload: { id: "i" + date.replace(/-/g, ""), average_heartrate: hr } });
const walk = (date, minutes, hr) => ({ id: "g" + date, source: "google-health", type: "Walk", name: "Chůze", durationHours: minutes / 60, calories: Math.round(minutes * 4.2), start: date + "T12:10:00Z", averageHeartRate: hr, payload: { average_heartrate: hr, exercise: { exerciseType: "WALKING", metricsSummary: { caloriesKcal: Math.round(minutes * 4.2), steps: minutes * 105, distanceMillimeters: minutes * 83000, averageHeartRateBeatsPerMinute: hr } } } });
const meal = (id, time, title, kcal, p, c, f, mealType) => ({ id, consumed_date: T, consumed_at: T + "T" + time + ":00", recipe_title: title, kcal, protein_g: p, carbs_g: c, fat_g: f, note: JSON.stringify({ mealType }) });
const demoFoods = [meal(1, "07:20", "Ovesná kaše s banánem", 430, 18, 70, 9, "breakfast"), meal(2, "07:20", "Řecký jogurt", 150, 15, 6, 6, "breakfast"), meal(3, "12:30", "Rýže s kuřecím masem", 640, 47, 78, 15, "lunch"), meal(4, "16:10", "Tyčinka a banán", 310, 9, 55, 7, "snack_pm")];
const weekActivities = {
  [day(1, MON)]: { completed: [ride(day(1, MON), "Sweet Spot 3×12", 1.25, 82, 141)] },
  [day(2, MON)]: { completed: [walk(day(2, MON), 38, 97)] },
  [day(3, MON)]: { planned: [{ id: "planned:e1", name: "Threshold 4×8", type: "Ride", durationHours: 1.33, tss: 95, start: day(3, MON) }] },
  [day(6, MON)]: { planned: [{ id: "planned:e2", name: "Long Endurance", type: "Ride", durationHours: 3.5, tss: 190, start: day(6, MON) }] }
};
// Six weeks of gym (upper on Monday, lower on Thursday) with slowly rising weights.
const gymSession = (date, list, w) => list.flatMap(([exercise, kg, reps]) => [1, 2, 3].map(n => ({ workout_date: date, exercise, set_no: n, actual_kg: Math.round((kg + w * (kg > 60 ? 5 : 1.5)) * 2) / 2, actual_reps: reps + (n === 3 && w === 5 ? 2 : 0), rpe: 7 + (n === 3 ? 1 : 0) })));
const UPPER = [["DB bench press", 18, 10], ["Lat pulldown", 40, 10], ["Low row", 45, 10], ["Cable lateral raise", 6, 12], ["Cable triceps extension", 20, 12]];
const LOWER = [["Pivot leg press", 120, 10], ["Prone leg curl Prime", 30, 12], ["Hip thrust", 60, 10], ["Standing calf raise", 50, 12], ["Abs bench crunch", 20, 15]];
const gymHistory = Array.from({ length: 6 }, (_, w) => [gymSession(day(-7 * (5 - w), MON), UPPER, w), gymSession(day(-7 * (5 - w) + 3, MON), LOWER, w)]).flat(2).filter(r => r.workout_date <= T && r.workout_date !== day(3, MON));
// Six weeks of rides and one run a week, with heart-rate zone times (Intervals.icu fields).
const zones = (z1, z2, z3, z4, z5) => [z1, z2, z3, z4, z5].map(m => m * 60);
const pastActivities = Array.from({ length: 6 }, (_, w) => {
  const base = day(-7 * (6 - w), MON);
  return [
    { type: "Ride", name: "Sweet Spot 3×12", date: day(1, base), tss: 82, moving_time: 4500, distance: 38000, total_elevation_gain: 320, icu_weighted_avg_watts: 228 + w * 2, payload: { icu_hr_zone_times: zones(12, 25, 20, 16, 2) } },
    { type: "Ride", name: "VO₂ 5×4", date: day(3, base), tss: 88, moving_time: 4200, distance: 34000, total_elevation_gain: 280, icu_weighted_avg_watts: 236, payload: { icu_hr_zone_times: zones(18, 22, 8, 10, 12) } },
    { type: "Run", name: "Lehký běh", date: day(4, base), tss: 45, moving_time: 2900, distance: 9000 + w * 300, total_elevation_gain: 60, payload: { icu_hr_zone_times: zones(10, 34, 4, 0, 0) } },
    { type: "Ride", name: "Long Endurance", date: day(6, base), tss: 170 + w * 8, moving_time: 11400 + w * 600, distance: 92000 + w * 4000, total_elevation_gain: 1100 + w * 90, icu_weighted_avg_watts: 196, payload: { icu_hr_zone_times: zones(70, 95, 18, 4, 0) } }
  ];
}).flat();
let gymValues = [[], [], ["", "Silový trénink · horní tělo"], [], [], [], [], ["WORK", "Lat pulldown", "1", "45", "10", "", "", "", "FALSE", "", ""], ["WORK", "Lat pulldown", "2", "45", "10", "", "", "", "FALSE", "", ""], ["WORK", "DB bench press", "1", "22", "10", "", "", "", "FALSE", "", ""]];
let weekPlan = sanitizeWeekPlan({ days: [["gym"], ["ride"], [], ["ride"], ["gym"], ["ride"], ["gym"]] });

function dailyFor(date) {
  const w = weekActivities[date] || {}, kcal = date <= T ? 2200 + (date.charCodeAt(9) % 5) * 90 : 0;
  return {
    date,
    daily: { status: "ok", date, training: { planned: w.planned || [], completed: w.completed || [], matched: [] }, nutrition: { calorieTarget: 2650, macros: { protein_g: 150, carbs_g: 330, fat_g: 80 }, foodLog: { totals: { kcal, protein_g: kcal / 18, carbs_g: kcal / 7.5, fat_g: kcal / 32 } }, reason: "Ukázkový den" }, calories: { target: 2650 }, burned: { total: 2900, activity: 600 }, weight: { current: 82.4, records: [] } },
    food: { totals: { kcal, protein_g: kcal / 18, carbs_g: kcal / 7.5, fat_g: kcal / 32 } },
    recommendations: { mealRecommendations: [], storeAlternatives: [] }
  };
}
const week = start => ({ status: "ok", start, end: day(6, start), days: Array.from({ length: 7 }, (_, i) => dailyFor(day(i, start))) });

// ---- Real workout library on an in-memory database ------------------------
const db = scopedDb(createD1(), 1);
const coachFor = (sport, date = T, goal = null) => buildCyclingCoachV2({ date, week: week(MON), fitness: { wellness }, health: { sleep: sleep.map(s => ({ ...s, type: "sleep" })) }, gym: { history: gymHistory }, sport, goal, capabilities: {} });
async function search(params) {
  const sport = params.get("sport") === "run" ? "run" : "ride", coach = coachFor(sport);
  const duration = Number(params.get("duration")) || null, kind = coach.recommendation.session.kind;
  const filters = { sport, environment: params.get("environment") || "outdoor", system: params.get("system") || undefined, maxDifficulty: Number(params.get("maxDifficulty")) || undefined, targetLoad: Number(params.get("load")) || undefined, limit: 15 };
  if (duration) Object.assign(filters, { durationMinutes: duration, durationTolerance: Number(params.get("durationTolerance")) || 15 });
  else Object.assign(filters, { durationMinutes: coach.constraints.availableMinutes, durationSoft: true });
  if (!filters.system) filters.preferredSystem = kind === "long_endurance" ? "endurance" : kind === "vo2" ? "vo2max" : kind;
  const context = { readiness: coach.readiness.status, hardBikeDaysRolling7d: coach.load.hardBikeDaysRolling7d, phase: params.get("phase") || "" };
  const r = await searchWorkoutLibrary(db, filters, context);
  return { ...r, athlete: { ftp: 260, indoorFtp: 260, runThresholdPace: 285 }, rankingContext: { ...context, tsb: coach.readiness.tsb }, coachPick: { system: filters.preferredSystem || null, durationMinutes: duration ? null : coach.constraints.availableMinutes }, date: T };
}
const CTL = wellness.at(-1).ctl, LAST_WEEK = 420;
const sportOf = t => /weight|strength|gym/i.test(t) ? "gym" : /ride/i.test(t) ? "ride" : /run/i.test(t) ? "run" : null;
const weekDays = start => week(start).days.map(d => ({ date: d.date, done: (d.daily.training.completed || []).reduce((s, a) => s + (a.tss || 0), 0), planned: (d.daily.training.planned || []).reduce((s, a) => s + (a.tss || 0), 0), sports: [...(d.daily.training.completed || []), ...(d.daily.training.planned || [])].map(a => sportOf(a.type)).filter(Boolean).concat(gymHistory.some(r => r.workout_date === d.date) ? ["gym"] : []) }));
const targetsFor = start => weekTargets({ roles: planWeekRoles(weekPlan.days), ctl: CTL, lastWeekLoad: LAST_WEEK, days: weekDays(start), today: T, weekStart: start });
async function generate(body) {
  const sport = body.sport === "run" ? "run" : "ride", date = body.date || T, wd = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
  const weekRole = planWeekRoles(weekPlan.days)[wd].items.find(x => x.sport === sport) || null;
  const weekTarget = targetsFor(MON).items.find(x => x.date === date && x.sport === sport) || null, minutes = Number(body.availabilityMinutes) || weekTarget?.minutes || null;
  const coach = buildCyclingCoachV2({ date, week: week(MON), fitness: { wellness }, health: { sleep: sleep.map(s => ({ ...s, type: "sleep" })) }, gym: { history: gymHistory }, sport, availabilityMinutes: minutes, goal: weekRole?.focus ? { focus: weekRole.focus } : null });
  const r = await generateWorkout(db, { sport, environment: body.environment, date, coach, availabilityMinutes: Number(body.resizeTo) || minutes, variant: body.variant, thresholds: { ftp: 260, indoorFtp: 260, runThresholdPace: 285, powerZones: powerZones({}, 260), paceZones: paceZones({}, 285) }, workoutId: body.workoutId || null, resizeTo: Number(body.resizeTo) || null });
  return { ...r, weekRole, weekTarget };
}
function trainingProfile() {
  const profile = { lthr: 175, maxHr: 192, restHr: 48 };
  return { status: "ok", profile: {}, resolved: { ftp: 260, ftpSource: "intervals-settings", indoorFtp: 260, intervalsFtp: 260, latestRideFtp: 245, lthr: 175, maxHr: 192, restHr: 48, runThresholdPace: 285, runPaceSource: "intervals-settings" }, powerZones: powerZones({}, 260), hrZones: hrZones(profile), paceZones: paceZones({}, 285),
    ftpMethods: Object.entries(FTP_METHODS).map(([id, m]) => ({ id, label: m.label, inputs: m.inputs.map(([key, label]) => ({ key, label })) })),
    paceMethods: Object.entries(PACE_METHODS).map(([id, m]) => ({ id, label: m.label, inputs: m.inputs.map(([key, label]) => ({ key, label })) })),
    paceZoneModels: Object.entries(PACE_ZONE_MODELS).map(([id, m]) => ({ id, label: m.label, bounds: m.bounds })),
    powerZoneModels: Object.entries(POWER_ZONE_MODELS).map(([id, m]) => ({ id, label: m.label, bounds: m.bounds })), hrZoneModels: Object.entries(HR_ZONE_MODELS).map(([id, m]) => ({ id, label: m.label, reference: m.reference })) };
}
function gymPlanFor(muscles = []) {
  const ids = muscles.length ? muscles : ["chest", "upper_back", "lats", "side_delts", "abs"];
  const rows = ids.flatMap(id => [1, 2, 3].map(n => ["WORK", FOCUS_GROUPS[id].exercises[0], String(n), "", "10", "", "", "", "FALSE", "", ""]));
  gymValues = [[], [], ["", "Cílený trénink · " + ids.map(id => FOCUS_GROUPS[id].label).join(", ")], [], [], [], [], ...rows];
}

// Gym plans from the real generator, day by day in the week's order: each one
// sees the plans already made for the days around it, as the live app does.
function gymPlansForWeek() {
  const out = {}, made = [];
  const roles = targetsFor(MON).items.filter(x => x.sport === "gym");
  for (const offset of [0, 1, 2, 3, 4, 5, 6]) {
    const date = day(offset), chip = roles.find(x => x.date === date);
    const near = made.filter(m => Math.abs(Date.parse(m.date) - Date.parse(date)) <= 4 * 86400000);
    const plan = generateStrengthPlan({ status: "ok", date, recovery: {}, cycling: { recentRideHours: 4, recentRideTss: 260, recentActivities: [], plannedWorkouts: [], nextRide: null }, strength: { recentCompletedSets: gymHistory.map(r => ({ ...r, type: "WORK", completed: 1 })), plannedSessions: near } }, { durationMinutes: chip?.minutes ?? 60, focus: chip?.role === "gym_upper" ? "upper" : undefined, focusSource: chip?.role === "gym_upper" ? "week" : undefined });
    out[date] = { values: planValues(plan), rationale: plan.rationale };
    if (chip) made.push({ date, exercises: [...new Set(plan.rows.filter(r => r[0] === "WORK").map(r => r[1]))] });
  }
  return out;
}

// Every response the page needs: fixed ones are precomputed for the static build.
async function staticResponses() {
  const searches = {};
  for (const sport of ["ride", "run"]) searches[sport] = await search(new URLSearchParams({ sport, environment: "outdoor" }));
  const generated = {};
  for (const sport of ["ride", "run"]) for (const offset of [0, 1, 2, 3, 4, 5, 6]) generated[sport + "|" + day(offset)] = await generate({ sport, date: day(offset), environment: "outdoor" });
  return {
    "/app/api/me": { status: "ok", user: { email: "sandbox@example.com", isAdmin: false }, missingProviders: [] },
    "/app/api/connections": { status: "ok", providers: [{ id: "google", name: "Google Health", connected: true, configured: true, metrics: ["Spánek", "Aktivity"], note: "Sandbox" }, { id: "intervals", name: "Intervals.icu", connected: true, configured: true, metrics: ["Aktivity", "Plán"], note: "Sandbox", connectUrl: "#" }] },
    "/app/api/daily": dailyFor(T).daily, "/app/api/coaches": { status: "ok", coaches: [], reviews: [], priorities: ["Sandbox: ukázková data, nic se neukládá do živé aplikace."] },
    "/app/api/fitness": { status: "ok", wellness }, "/app/api/weight": { status: "ok", current: 82.4, records: Array.from({ length: 30 }, (_, i) => ({ sample_time: day(i - 29) + "T06:30:00Z", value_numeric: 83.6 - i * .04 })) },
    "/app/api/fitness-insights": fitnessInsights({ sets: gymHistory, activities: [...pastActivities, ...Object.entries(weekActivities).flatMap(([date, w]) => (w.completed || []).map(a => ({ ...a, date, moving_time: a.durationHours * 3600, payload: { ...(a.payload || {}), icu_hr_zone_times: a.type === "Ride" ? zones(14, 24, 22, 14, 1) : null } })))], today: T }),
    "/app/api/activity-detail": activitySample(),
    "/app/api/activities": { status: "ok", count: 3, activities: [] }, "/app/api/nutrition": { status: "ok", records: [] }, "/app/api/sleep": { status: "ok", sessions: sleep },
    "/app/api/google-health": { status: "ok", wellness: [] }, "/app/api/inbox": { status: "ok", items: [] }, "/app/api/food/day": { status: "ok", preview: true, entries: demoFoods, totals: {} },
    "/app/api/gym/exercises": { status: "ok", exercises: gymExerciseCatalog() }, "/app/api/training-profile": trainingProfile(), "/app/api/profile": { status: "ok" },
    "/app/api/workouts/scheduled": { status: "ok", workouts: [{ workout_id: searches.ride.workouts[0].id, name: searches.ride.workouts[0].name, sport: "ride", scheduled_date: day(1, MON) <= T ? day(1, MON) : T, status: "completed", completed_percent: 96, primary_system: searches.ride.workouts[0].primary_system, duration_minutes: searches.ride.workouts[0].duration_minutes }] },
    searches, generated, weeks: { [MON]: week(MON), [day(-7, MON)]: week(day(-7, MON)), [day(7, MON)]: week(day(7, MON)) }
  };
}
// A 75 min Sweet Spot ride: streams, detected intervals and the recovery at the end.
function activitySample() {
  const time = [], watts = [], hr = [], cadence = [], latlng = [];
  for (let t = 0; t < 4500; t += 5) {
    const block = t < 900 ? "warm" : t > 4140 ? "cool" : ((t - 900) % 1020) < 720 ? "work" : "rest";
    const target = block === "work" ? 235 : block === "warm" ? 150 + t / 900 * 40 : block === "cool" ? 120 : 140;
    time.push(t); watts.push(Math.round(target + Math.sin(t / 37) * 12)); cadence.push(block === "work" ? 90 : 84);
    const last = hr.at(-1) || 105, goal = block === "work" ? 158 : block === "cool" ? 104 : 128;
    hr.push(Math.round(last + (goal - last) * (block === "cool" ? .09 : .14)));
    latlng.push([49.948 + Math.sin(t / 700) * .03, 15.268 + Math.cos(t / 900) * .05 + t / 4500 * .02]);
  }
  const streams = [["time", time], ["watts", watts], ["heartrate", hr], ["cadence", cadence], ["latlng", latlng]].map(([type, data]) => ({ type, data }));
  const intervals = [0, 1, 2].map(i => ({ type: "WORK", label: "Sweet Spot " + (i + 1), start_time: 900 + i * 1020, moving_time: 720, average_watts: 233 + i * 2, weighted_average_watts: 236 + i * 2, average_heartrate: 151 + i * 3, max_heartrate: 158 + i * 3, average_cadence: 90 }));
  return { status: "ok", source: "intervals.icu", activity: { id: "i20260929", name: "Sweet Spot 3×12", type: "Ride", distance: 38200, moving_time: 4500, total_elevation_gain: 320, icu_normalized_watts: 214, average_heartrate: 138 }, streams: sampleActivityStreams(streams), intervals: activityIntervals({ icu_intervals: intervals }), hrr: heartRateRecovery(time, hr, 150) };
}
function weatherSample(params) {
  const days = Array.from({ length: 30 }, (_, i) => day(i - 14));
  return { daily: { time: days, weather_code: days.map((_, i) => [0, 2, 3, 61, 80, 1, 3][i % 7]), temperature_2m_max: days.map((_, i) => 14 + (i % 5)), temperature_2m_min: days.map((_, i) => 5 + (i % 4)), precipitation_probability_max: days.map((_, i) => [5, 10, 30, 80, 60, 0, 20][i % 7]), precipitation_sum: days.map(() => 0), wind_speed_10m_max: days.map((_, i) => 8 + i % 9) } };
}

// ---- Browser shim (static build): answers fetch() from the precomputed data.
function shim(data, planner) {
  return `<script>
(()=>{const DATA=${JSON.stringify(data).replace(/</g, "\\u003c")};${planner}
let prefs=${JSON.stringify(weekPlan)},gymHistory=${JSON.stringify(gymHistory)},gymByDay={${JSON.stringify(T)}:${JSON.stringify(gymValues)}},GYM_WEEK=${JSON.stringify(gymPlansForWeek())};
const T=${JSON.stringify(T)},CTL=${JSON.stringify(CTL)},LAST=${JSON.stringify(LAST_WEEK)},WEEKDAYS=${JSON.stringify(Object.fromEntries([day(-7, MON), MON, day(7, MON)].map(w => [w, weekDays(w)])))};
const FOCUS=${JSON.stringify(FOCUS_GROUPS)},weather=${JSON.stringify(weatherSample())};
const ok=b=>new Response(JSON.stringify(b),{status:200,headers:{'Content-Type':'application/json'}});
const realFetch=window.fetch.bind(window);window.confirm=()=>true;
window.fetch=async(input,opts={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href),m=(opts.method||'GET').toUpperCase(),body=opts.body?JSON.parse(opts.body):{};
 if(/open-meteo/.test(url.host)){if(/geocoding/.test(url.host))return ok({results:[{name:url.searchParams.get('name')||'Praha',admin1:'Ukázka',country_code:'CZ',latitude:50.08,longitude:14.43}]});return ok(weather);}
 const p=url.pathname;
 if(p==='/app/api/week-plan'){if(m==='POST')prefs={days:body.days,location:body.location||prefs.location};const start=url.searchParams.get('start')||Object.keys(WEEKDAYS)[1];return ok({status:'ok',prefs,roles:planWeekRoles(prefs.days),start,targets:weekTargets({roles:planWeekRoles(prefs.days),ctl:CTL,lastWeekLoad:LAST,days:WEEKDAYS[start]||[],today:T,weekStart:start})});}
 if(p==='/app/api/week')return ok(DATA.weeks[url.searchParams.get('start')]||DATA.weeks[Object.keys(DATA.weeks)[1]]);
 if(p==='/app/api/workouts/search')return ok(DATA.searches[url.searchParams.get('sport')==='run'?'run':'ride']);
 if(p==='/app/api/workouts/generate'){const g=DATA.generated[(body.sport==='run'?'run':'ride')+'|'+body.date]||Object.values(DATA.generated)[0];return ok(g);}
 if(p==='/app/api/planned/move'||p==='/app/api/planned/delete'){const id=String(body.eventId).replace(/^planned:/,'');let item=null;for(const w of Object.values(DATA.weeks))for(const d of w.days){const t=d.daily.training,i=t.planned.findIndex(x=>String(x.id).replace(/^planned:/,'')===id);if(i>=0)item=t.planned.splice(i,1)[0];}
  if(p.endsWith('/move')&&item){for(const w of Object.values(DATA.weeks))for(const d of w.days)if(d.date===body.date)d.daily.training.planned.push({...item,start:body.date});}
  return ok({status:'ok',eventId:id,date:body.date});}
 if(p==='/app/api/workouts/feedback')return ok({status:'ok',completedPercent:96,intervals:{status:'ok'}});
 if(p==='/app/api/workouts/schedule')return ok({status:'ok',workout:{name:'Workout'},date:body.date});
 if(p==='/app/api/gym'){const d=(m==='POST'?body.date:url.searchParams.get('date'))||T;if(m==='POST'&&body.values)gymByDay[d]=body.fullValues||body.values;return ok({status:'ok',date:d,values:gymByDay[d]||[],history:gymHistory,videoLinks:[],stored:Boolean(gymByDay[d])});}
 if(p==='/app/api/gym/generate'&&!body.focusMuscles?.length&&GYM_WEEK[body.date||T]){const d=body.date||T;gymByDay[d]=GYM_WEEK[d].values;return ok({status:'ok',rationale:GYM_WEEK[d].rationale});}
 if(p==='/app/api/gym/generate'){const d=body.date||T,ids=body.focusMuscles?.length?body.focusMuscles:['chest','upper_back','lats','side_delts','abs'];gymByDay[d]=[[],[],['','Cílený trénink · '+ids.map(i=>FOCUS[i].label).join(', ')],[],[],[],[],...ids.flatMap(i=>[1,2,3].map(n=>['WORK',FOCUS[i].exercises[0],String(n),'','10','','','','FALSE','','']))];return ok({status:'ok',rationale:'Sandbox: plán podle zvolených partií.'});}
 if(p==='/app/api/sync')return ok({status:'accepted'});
 if(DATA[p])return ok(DATA[p]);
 if(p.startsWith('/app/'))return ok({status:'ok'});
 return realFetch(input,opts);};
})();
</script>`;
}
// The planner module itself runs in the page, without its exports.
function plannerSource() {
  return plannerText.replace(/^export /gm, "");
}
const banner = '<div style="position:sticky;top:0;z-index:25;background:#4a2f00;color:#ffe2a8;padding:7px 14px;font:600 12px/1.4 system-ui;text-align:center">SANDBOX · ukázková data · nic se neukládá do živé aplikace ani do Intervals.icu</div>';

async function page({ inline }) {
  let html = await dashboardPage().text();
  html = html.replace("<body>", "<body>" + banner);
  if (inline) {
    const client = (await readFile(new URL("../src/dashboard-client.js", import.meta.url), "utf8")).replace(/<\/script/gi, "<\\/script");
    html = html.replace(/<script src="\/app\/dashboard-client\.js[^"]*" defer><\/script>/, () => shim(inlineData, plannerSource()) + "<script>" + client + "</script>");
    html = html.replace('<link rel="manifest" href="/manifest.webmanifest">', "");
  }
  return html;
}

// A hosted page supplies its own document skeleton: keep the styles and body only.
function fragment(html) {
  return '<title>PFD Workouty Sandbox</title>\n' + html.replace(/^<!doctype html>\s*<html[^>]*>\s*<head>/i, "").replace(/<meta[^>]*>\s*/g, "").replace(/<title>[^<]*<\/title>/, "").replace("</head>\n<body>", "").replace(/<\/body><\/html>\s*$/, "");
}

let inlineData;
const buildIndex = process.argv.indexOf("--build");
if (buildIndex > 0) {
  inlineData = await staticResponses();
  const html = await page({ inline: true });
  await writeFile(process.argv[buildIndex + 1], process.argv.includes("--fragment") ? fragment(html) : html);
  console.log("Sandbox uložen: " + process.argv[buildIndex + 1]);
} else {
  // Local server: the same shim, so the browser sees exactly the static build.
  inlineData = await staticResponses();
  const port = Number(process.env.PORT) || 8792;
  http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/app" || url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(await page({ inline: true })); return; }
    res.writeHead(404); res.end();
  }).listen(port, "127.0.0.1", () => console.log("Sandbox: http://127.0.0.1:" + port + "/app"));
}
