const TZ = "Europe/Prague";
const DEFAULT_ACTIVITY_DAYS = 14;
const DEFAULT_PLANNED_DAYS = 7;
const SPREADSHEET_ID = "1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw";
const SHEET_NAME = "Dnešní trénink";

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
    const rows = await env.DB.prepare(`SELECT data_type, sample_time, start_time, value_numeric, value_unit, payload_json FROM health_datapoints WHERE lower(data_type) LIKE '%weight%' AND (sample_time >= ? OR start_time >= ?) AND (sample_time <= ? OR start_time <= ?) ORDER BY COALESCE(sample_time,start_time)`)
      .bind(`${start}T00:00:00`,`${start}T00:00:00`,`${end}T23:59:59`,`${end}T23:59:59`).all();
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
  return /(tempo|sweet spot|threshold|interval|intervals|vo2|vo2max|sprint|anaerobic|over-under|over under|race|race pace|ftp)/.test(semantic);
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
async function d1Recovery(env, startDate, endDate) {
  const rows = await env.DB.prepare(`SELECT data_type, sample_time, start_time, end_time, value_numeric, value_unit, payload_json FROM health_datapoints WHERE source_family LIKE 'google%' AND (sample_time >= ? OR start_time >= ?) AND (sample_time < ? OR start_time < ?) ORDER BY COALESCE(sample_time, start_time)`).bind(`${startDate}T00:00:00`, `${startDate}T00:00:00`, `${endDate}T23:59:59`, `${endDate}T23:59:59`).all();
  const out = {}; for (const r of rows.results || []) { let payload = null; try { payload = JSON.parse(r.payload_json || "null"); } catch {} (out[r.data_type] ||= []).push({ sampleTime: r.sample_time, startTime: r.start_time, endTime: r.end_time, value: r.value_numeric, unit: r.value_unit, payload }); } return out;
}
async function syncCurrentStrengthSheet(env) {
  try {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Error("Google OAuth environment variables are missing");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" }) });
    const tokenText = await tokenResponse.text(); let tokenData; try { tokenData = JSON.parse(tokenText); } catch { tokenData = {}; }
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(`Google OAuth token error: HTTP ${tokenResponse.status}: ${tokenData.error || tokenText.slice(0, 300)}`);
    const range = `'${SHEET_NAME.replace(/'/g, "''")}'!A1:Z1000`;
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" } });
    const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = {}; }
    if (!response.ok) throw new Error(`Google Sheets read HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
    const { syncStrengthSheet, parseStrengthSheet } = await import("./strength-history.js");
    const parsed = parseStrengthSheet(data.values || []);
    const sync = await syncStrengthSheet(env.DB, data.values || []);
    return { ...sync, parsed };
  } catch (error) { throw new Error(`strength sheet sync failed: ${error instanceof Error ? error.message : String(error)}`); }
}
export async function buildStrengthContext(env, requestedDate = null) {
  const date = requestedDate || localDate();
  const oldest = localDate(-DEFAULT_ACTIVITY_DAYS + 1), newest = localDate(DEFAULT_PLANNED_DAYS);
  let sheetSync;
  try { sheetSync = await syncCurrentStrengthSheet(env); } catch (e) { throw new Error(`strength_context.sheet_sync: ${e.message}`); }
  let activitiesRaw, eventsRaw;
  try { [activitiesRaw, eventsRaw] = await Promise.all([intervalsGet(env, `/athlete/0/activities?oldest=${oldest}&newest=${newest}`), intervalsGet(env, `/athlete/0/events?oldest=${date}&newest=${newest}`)]); }
  catch (e) { throw new Error(`strength_context.intervals: ${e.message}`); }
  let recovery;
  try { recovery = await d1Recovery(env, localDate(-7), localDate(1)); } catch (e) { throw new Error(`strength_context.recovery_d1: ${e.message}`); }
  let strengthHistory;
  try { const { getStrengthHistory } = await import("./strength-history.js"); strengthHistory = await getStrengthHistory(env.DB, 150); } catch (e) { throw new Error(`strength_context.strength_d1: ${e.message}`); }
  const activities = (Array.isArray(activitiesRaw) ? activitiesRaw : []).map(activityInfo), events = (Array.isArray(eventsRaw) ? eventsRaw : []).map(eventInfo);
  const rides = activities.filter(x => x.cycling), plannedRides = events.filter(x => x.cycling && n(x.durationHours) > 0 && n(x.durationHours) <= 8);
  const recent = rides.filter(x => x.date <= date).sort((a,b) => String(b.start).localeCompare(String(a.start))), planned = plannedRides.filter(x => x.date >= date).sort((a,b) => String(a.start).localeCompare(String(b.start)));
  const { buildNutritionPlan } = await import("./nutrition-intelligence.js");
  const plannedStrengthRows = sheetSync?.parsed?.date === date
    ? (sheetSync.parsed.rows || []).filter(row => String(row.type || "").toUpperCase() === "WORK")
    : [];
  const plannedStrengthWorkout = plannedStrengthRows.length
    ? { date, rows: plannedStrengthRows.map(row => [row.type, row.exercise, row.setNo, row.plannedKg, row.plannedReps]) }
    : null;
  const context = { status: "ok", source: "live", date, cycling: { recentActivities: recent, plannedWorkouts: planned, recentRideHours: Math.round(recent.reduce((s,x)=>s+n(x.durationHours),0)*100)/100, recentRideTss: Math.round(recent.reduce((s,x)=>s+n(x.tss),0)), plannedRideHours: Math.round(planned.reduce((s,x)=>s+n(x.durationHours),0)*100)/100, plannedRideTss: Math.round(planned.reduce((s,x)=>s+n(x.tss),0)), nextRide: planned[0] || null, lastRide: recent[0] || null }, recovery, strength: { source: "google-sheet/d1", historyReady: true, completedSetCount: strengthHistory.length, recentCompletedSets: strengthHistory, plannedWorkout: plannedStrengthWorkout, sheetSync } , weightTrend: await d1WeightTrend(env,date) };
  context.nutrition = buildNutritionPlan(context, { weightTrend: context.weightTrend });
  const { buildAdaptiveDecision } = await import("./adaptive-engine.js");\n  context.adaptive = buildAdaptiveDecision(context, null);
  return context;
}
