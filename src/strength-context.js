import { getAthleteState } from './athlete-state.js';
import { isQualityName } from './session-intensity.js';
const TZ = "Europe/Prague";
const DEFAULT_ACTIVITY_DAYS = 14;
const DEFAULT_PLANNED_DAYS = 7;

function localDate(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = Number(parts.find(x => x.type === "year").value);
  const m = Number(parts.find(x => x.type === "month").value);
  const d = Number(parts.find(x => x.type === "day").value);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}
function n(v, fallback = 0) { const x = Number(v); return Number.isFinite(x) ? x : fallback; }
async function d1WeightTrend(env, endDate) {
  try {
    const end = String(endDate || localDate()).slice(0,10);
    const start = localDate(-35);
    const rows = await env.DB.prepare(`SELECT data_type, sample_time, start_time, value_numeric, value_unit, payload_json FROM health_datapoints WHERE user_id = ? AND lower(data_type) LIKE '%weight%' AND (sample_time >= ? OR start_time >= ?) AND (sample_time <= ? OR start_time <= ?) ORDER BY COALESCE(sample_time,start_time)`)
      .bind(env.USER_ID, `${start}T00:00:00`,`${start}T00:00:00`,`${end}T23:59:59`,`${end}T23:59:59`).all();
    const points=[];
    for(const row of rows.results||[]){
      let value=n(row.value_numeric,NaN);
      const unit=String(row.value_unit||"").toLowerCase();
      if(!Number.isFinite(value)) continue;
      if(unit.includes("lb")||unit.includes("pound")) value=value*0.45359237;
      if(value<35||value>250) continue;
      points.push({date:String(row.sample_time||row.start_time||"").slice(0,10),kg:value});
    }
    const byDate=new Map();
    for(const p of points) if(p.date) byDate.set(p.date,p.kg);
    const daily=[...byDate.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,kg])=>({date,kg}));
    if(!daily.length) return {samples:0,latestKg:null,weeklyRateKg:null,average7Kg:null,average28Kg:null};
    const last=daily.slice(-7), last28=daily.slice(-28);
    const mean=a=>a.length?a.reduce((s,x)=>s+x.kg,0)/a.length:null;
    const first=daily[0], latest=daily[daily.length-1];
    const days=Math.max(1,(new Date(latest.date)-new Date(first.date))/86400000);
    const weeklyRateKg=Math.round(((latest.kg-first.kg)/days)*7*100)/100;
    return {samples:daily.length,latestKg:Math.round(latest.kg*10)/10,average7Kg:mean(last)==null?null:Math.round(mean(last)*10)/10,average28Kg:mean(last28)==null?null:Math.round(mean(last28)*10)/10,weeklyRateKg,points:daily.slice(-14)};
  } catch (_) { return {samples:0,latestKg:null,weeklyRateKg:null,average7Kg:null,average28Kg:null}; }
}
function durationHours(a) {
  for (const key of ["duration", "duration_seconds", "moving_time", "elapsed_time"]) {
    const x = n(a?.[key], NaN);
    if (Number.isFinite(x) && x > 0) return x > 1000 ? x / 3600 : x > 12 ? x / 60 : x;
  }
  const start = a?.start_date_local || a?.start_date, end = a?.end_date_local || a?.end_date;
  if (start && end) { const h = (new Date(end) - new Date(start)) / 3600000; if (Number.isFinite(h) && h >= 0) return h; }
  return null;
}
function textOf(a) { return `${a?.type || ""} ${a?.activity_type || ""} ${a?.category || ""} ${a?.name || a?.title || ""}`.toLowerCase(); }
export function isRide(a) { return /\b(ride|bike|cycling|cycle|gravel|mountain bike|mtb|road cycling|indoor cycling)\b/.test(textOf(a)); }
function semanticIntensityText(a) {
  const fields = [
    a?.name, a?.title, a?.workout_type, a?.workoutType,
    a?.icu_intensity, a?.intensity_label, a?.intensityLabel,
    a?.category
  ];
  const tags = Array.isArray(a?.tags) ? a.tags : [];
  return [...fields, ...tags].filter(x => typeof x === "string").join(" ").toLowerCase();
}
export function isIntensity(a) {
  if (typeof a?.intensity === "boolean") return a.intensity;
  if (typeof a?.is_intensity === "boolean") return a.is_intensity;
  const semantic = semanticIntensityText(a);
  return /(tempo|sweet spot|threshold|interval|intervals|vo2|vo2max|sprint|anaerobic|over-under|over under|race|race pace|ftp)/.test(semantic) || isQualityName(semantic);
}
function activityInfo(a) { return { id: String(a?.id ?? ""), date: String(a?.start_date_local || a?.start_date || "").slice(0, 10), start: a?.start_date_local || a?.start_date || null, end: a?.end_date_local || a?.end_date || null, type: a?.type || a?.activity_type || a?.category || "Unknown", name: a?.name || a?.title || "", durationHours: durationHours(a), calories: n(a?.calories ?? a?.calories_kcal ?? a?.icu_calories), tss: n(a?.icu_training_load ?? a?.training_load ?? a?.tss), ctl: n(a?.icu_ctl ?? a?.ctl), atl: n(a?.icu_atl ?? a?.atl), tsb: n(a?.icu_form ?? a?.tsb), normalizedPower: n(a?.icu_weighted_average_watts ?? a?.weighted_average_watts ?? a?.normalized_power), averagePower: n(a?.average_watts ?? a?.average_power), cycling: isRide(a), intensity: isIntensity(a) }; }
function eventInfo(e) { return { id: String(e?.id ?? e?.event_id ?? ""), date: String(e?.start_date_local || e?.start_date || e?.date || "").slice(0, 10), start: e?.start_date_local || e?.start_date || e?.date || null, end: e?.end_date_local || e?.end_date || null, type: e?.type || e?.activity_type || e?.category || "", name: e?.name || e?.title || "", durationHours: durationHours(e), tss: n(e?.icu_training_load ?? e?.training_load ?? e?.tss), cycling: isRide(e), intensity: isIntensity(e), payload: e }; }
function intervalsAuth(env) { if (!env.INTERVALS_API_KEY) throw new Error("INTERVALS_API_KEY is not configured"); return "Basic " + btoa("API_KEY:" + env.INTERVALS_API_KEY); }
async function intervalsGet(env, path) {
  const response = await fetch("https://intervals.icu/api/v1" + path, { headers: { Authorization: intervalsAuth(env), Accept: "application/json" } });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(`Intervals.icu HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}
// Latest sleep, HRV and heart-rate values from Google Health. Only the newest
// row of each data type is read: the consumers (adaptive engine, strength
// generator) use just that, and minute-level heart-rate samples over a week
// are far too many to load and parse (it exceeded the Worker's limits).
const RECOVERY_TYPES = ["sleep", "hrv", "heart_rate", "resting"];
export async function d1Recovery(env, startDate, endDate) {
  const from = `${startDate}T00:00:00`, to = `${endDate}T23:59:59`;
  const typeFilter = RECOVERY_TYPES.map(() => "lower(data_type) LIKE ?").join(" OR ");
  const typeBinds = RECOVERY_TYPES.map(t => `%${t}%`);
  const latest = await env.DB.prepare(`SELECT data_type, MAX(COALESCE(sample_time, start_time)) AS t FROM health_datapoints WHERE user_id = ? AND source_family LIKE 'google%' AND COALESCE(sample_time, start_time) >= ? AND COALESCE(sample_time, start_time) <= ? AND (${typeFilter}) GROUP BY data_type`).bind(env.USER_ID, from, to, ...typeBinds).all();
  const out = {};
  for (const { data_type: type, t } of latest.results || []) {
    if (!t) continue;
    const r = await env.DB.prepare(`SELECT data_type, sample_time, start_time, end_time, value_numeric, value_unit, payload_json FROM health_datapoints WHERE user_id = ? AND source_family LIKE 'google%' AND data_type = ? AND COALESCE(sample_time, start_time) = ? LIMIT 1`).bind(env.USER_ID, type, t).first();
    if (!r) continue;
    let payload = null; try { payload = JSON.parse(r.payload_json || "null"); } catch {}
    out[type] = [{ sampleTime: r.sample_time, startTime: r.start_time, endTime: r.end_time, value: r.value_numeric, unit: r.value_unit, payload }];
    // HRV and resting heart rate only mean something against the athlete's
    // own average: 4 weeks before the latest value.
    if (/hrv|variability|resting/i.test(type)) {
      const from28 = new Date(Date.parse(String(t).slice(0, 10) + "T12:00:00Z") - 28 * 86400000).toISOString().slice(0, 10) + "T00:00:00";
      const avg = await env.DB.prepare(`SELECT AVG(value_numeric) AS v, COUNT(value_numeric) AS c FROM health_datapoints WHERE user_id = ? AND source_family LIKE 'google%' AND data_type = ? AND COALESCE(sample_time, start_time) >= ? AND COALESCE(sample_time, start_time) < ?`).bind(env.USER_ID, type, from28, String(t).slice(0, 10) + "T00:00:00").first().catch(() => null);
      if (avg?.c >= 5 && Number(avg.v) > 0) out[type][0].baseline = Math.round(Number(avg.v) * 10) / 10;
    }
  }
  return out;
}
// The day's strength plan from D1 (gym_plans).
async function readStrengthPlan(env, date) {
  const { readGymPlan } = await import("./gym-plan-store.js");
  const { parseStrengthPlan } = await import("./strength-history.js");
  const plan = await readGymPlan(env.DB, date);
  return { status: "ok", source: "d1", stored: plan.stored, parsed: parseStrengthPlan(plan.values) };
}
// Gym plans for the days around the date (not the date itself): the exercises
// not yet done there, so two sessions in one week get different exercises.
export async function plannedGymSessions(env, date, span = 4) {
  const { ensureGymPlans } = await import("./gym-plan-store.js");
  const { parseStrengthPlan } = await import("./strength-history.js");
  await ensureGymPlans(env.DB);
  const shift = d => new Date(Date.parse(date + "T12:00:00Z") + d * 86400000).toISOString().slice(0, 10);
  const rows = (await env.DB.prepare("SELECT workout_date, values_json FROM gym_plans WHERE user_id = ? AND workout_date >= ? AND workout_date <= ? AND workout_date != ?").bind(env.USER_ID, shift(-span), shift(span), date).all()).results || [];
  const sessions = [];
  for (const r of rows) {
    let parsed; try { parsed = parseStrengthPlan(JSON.parse(r.values_json)); } catch { continue; }
    const exercises = [...new Set((parsed.rows || []).filter(x => x.type === "WORK" && !x.completed).map(x => x.exercise))];
    if (exercises.length && !(await env.DB.prepare('SELECT workout_date FROM gym_plan_cancellations WHERE user_id=? AND workout_date=?').bind(env.USER_ID, r.workout_date).first())) sessions.push({ date: r.workout_date, exercises });
  }
  return sessions.sort((a, b) => a.date.localeCompare(b.date));
}
export async function buildStrengthContext(env, requestedDate = null) {
  const date = requestedDate || localDate();
  const oldest = localDate(-DEFAULT_ACTIVITY_DAYS + 1), newest = localDate(DEFAULT_PLANNED_DAYS);
  let planRead;
  try { planRead = await readStrengthPlan(env, date); } catch (e) { throw new Error(`strength_context.plan_d1: ${e.message}`); }
  let activitiesRaw, eventsRaw;
  try { [activitiesRaw, eventsRaw] = await Promise.all([intervalsGet(env, `/athlete/0/activities?oldest=${oldest}&newest=${newest}`), intervalsGet(env, `/athlete/0/events?oldest=${date}&newest=${newest}`)]); }
  catch (e) { throw new Error(`strength_context.intervals: ${e.message}`); }
  let recovery;
  try { recovery = await d1Recovery(env, localDate(-7), localDate(1)); } catch (e) { throw new Error(`strength_context.recovery_d1: ${e.message}`); }
  let strengthHistory;
  try { const { getStrengthHistory } = await import("./strength-history.js"); strengthHistory = await getStrengthHistory(env.DB, 500); } catch (e) { throw new Error(`strength_context.strength_d1: ${e.message}`); }
  const activities = (Array.isArray(activitiesRaw) ? activitiesRaw : []).map(activityInfo), events = (Array.isArray(eventsRaw) ? eventsRaw : []).map(eventInfo);
  const rides = activities.filter(x => x.cycling), plannedRides = events.filter(x => x.cycling && n(x.durationHours) > 0 && n(x.durationHours) <= 8);
  const recent = rides.filter(x => x.date <= date).sort((a,b) => String(b.start).localeCompare(String(a.start))), planned = plannedRides.filter(x => x.date >= date).sort((a,b) => String(a.start).localeCompare(String(b.start)));
  const { buildNutritionPlan } = await import("./nutrition-intelligence.js");
  const plannedStrengthRows = planRead?.parsed?.date === date
    ? (planRead.parsed.rows || []).filter(row => String(row.type || "").toUpperCase() === "WORK")
    : [];
  const plannedStrengthWorkout = plannedStrengthRows.length
    ? { date, rows: plannedStrengthRows.map(row => [row.type, row.exercise, row.setNo, row.plannedKg, row.plannedReps]) }
    : null;
  const context = { status: "ok", source: "live", date, cycling: { recentActivities: recent, plannedWorkouts: planned, recentRideHours: Math.round(recent.reduce((s,x)=>s+n(x.durationHours),0)*100)/100, recentRideTss: Math.round(recent.reduce((s,x)=>s+n(x.tss),0)), plannedRideHours: Math.round(planned.reduce((s,x)=>s+n(x.durationHours),0)*100)/100, plannedRideTss: Math.round(planned.reduce((s,x)=>s+n(x.tss),0)), nextRide: planned[0] || null, lastRide: recent[0] || null }, recovery, strength: { source: "d1", historyReady: true, completedSetCount: strengthHistory.length, recentCompletedSets: strengthHistory, plannedWorkout: plannedStrengthWorkout, planRead } , weightTrend: await d1WeightTrend(env,date) };
  context.sports={recentActivities:activities.filter(x=>x.date<=date).sort((a,b)=>String(b.start).localeCompare(String(a.start)))};
  // One recovery week for everything: the gym deloads in the week the plan
  // and the ride/run coach treat as a recovery week (src/week-planner.js).
  try {
    const { recoveryWeek, weekLoadsBefore } = await import("./week-planner.js");
    const monday = new Date(Date.parse(date + "T12:00:00Z") - ((new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const oldestWellness = new Date(Date.parse(monday + "T12:00:00Z") - 22 * 86400000).toISOString().slice(0, 10);
    const wellness = await intervalsGet(env, `/athlete/0/wellness?oldest=${oldestWellness}&newest=${date}`);
    const rows = Array.isArray(wellness) ? wellness : [], ctl = Number([...rows].reverse().find(r => Number(r.ctl) > 0)?.ctl) || null;
    const weekLoads = weekLoadsBefore(rows, monday);
    context.recoveryWeek = { ...recoveryWeek({ base: ctl ? ctl * 7 : null, weekLoads }), weekLoads, ctl, known: Boolean(ctl && weekLoads.length) };
  } catch { context.recoveryWeek = { recovery: false, reason: null, known: false }; }
  try { context.strength.plannedSessions = await plannedGymSessions(env, date); } catch { context.strength.plannedSessions = []; }
  // Sex sets the muscle priorities and the starting loads without history.
  try { const { loadEffectiveProfile } = await import("./profile-suggestions.js"); const profile = await loadEffectiveProfile(env.DB, env.USER_ID); context.profile = { sex: profile?.sex || "" }; } catch { context.profile = { sex: "" }; }
  const athleteState=await getAthleteState(env.DB);
  context.athleteState={status:athleteState.status,note:athleteState.note};
  context.nutrition = buildNutritionPlan(context, { weightTrend: context.weightTrend });
  const { buildAdaptiveDecision } = await import("./adaptive-engine.js");
  context.adaptive = buildAdaptiveDecision(context, null);
  return context;
}
