import { getStrengthHistory, syncStrengthSheet } from "./strength-history.js";

const TZ = "Europe/Prague";
const DEFAULT_ACTIVITY_DAYS = 14;
const DEFAULT_PLANNED_DAYS = 7;
const SPREADSHEET_ID = "1lpCB_YfpVI4LdbvjKxDL7M6PDO_yXRtPvzPpwZyo4vw";
const SHEET_NAME = "Dnešní trénink";

function localDate(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const y = Number(parts.find(x => x.type === "year").value);
  const m = Number(parts.find(x => x.type === "month").value);
  const d = Number(parts.find(x => x.type === "day").value);
  const dt = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return dt.toISOString().slice(0, 10);
}

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function durationHours(a) {
  for (const key of ["duration", "duration_seconds", "moving_time", "elapsed_time"]) {
    const x = n(a?.[key], NaN);
    if (Number.isFinite(x) && x > 0) return x > 1000 ? x / 3600 : x > 12 ? x / 60 : x;
  }
  const start = a?.start_date_local || a?.start_date;
  const end = a?.end_date_local || a?.end_date;
  if (start && end) {
    const h = (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
    if (Number.isFinite(h) && h >= 0) return h;
  }
  return null;
}

function textOf(a) { return `${a?.type || ""} ${a?.activity_type || ""} ${a?.category || ""} ${a?.name || a?.title || ""} ${a?.description || ""}`.toLowerCase(); }
function isRide(a) { return /\b(ride|bike|cycling|cycle|gravel|mountain bike|mtb|road cycling|indoor cycling)\b/.test(textOf(a)); }
function isIntensity(a) { return /(tempo|sweet spot|threshold|interval|intervals|vo2|vo2max|sprint|anaerobic|over-under|over under|race|race pace|ftp)/.test(textOf(a)); }

function activityInfo(a) {
  return {
    id: String(a?.id ?? ""), date: String(a?.start_date_local || a?.start_date || "").slice(0, 10),
    start: a?.start_date_local || a?.start_date || null, end: a?.end_date_local || a?.end_date || null,
    type: a?.type || a?.activity_type || a?.category || "Unknown", name: a?.name || a?.title || "",
    durationHours: durationHours(a), calories: n(a?.calories ?? a?.calories_kcal ?? a?.icu_calories),
    tss: n(a?.icu_training_load ?? a?.training_load ?? a?.tss), ctl: n(a?.icu_ctl ?? a?.ctl),
    atl: n(a?.icu_atl ?? a?.atl), tsb: n(a?.icu_form ?? a?.tsb),
    normalizedPower: n(a?.icu_weighted_average_watts ?? a?.weighted_average_watts ?? a?.normalized_power),
    averagePower: n(a?.average_watts ?? a?.average_power), cycling: isRide(a), intensity: isIntensity(a)
  };
}

function eventInfo(e) {
  return {
    id: String(e?.id ?? e?.event_id ?? ""), date: String(e?.start_date_local || e?.start_date || e?.date || "").slice(0, 10),
    start: e?.start_date_local || e?.start_date || e?.date || null, end: e?.end_date_local || e?.end_date || null,
    type: e?.type || e?.activity_type || e?.category || "", name: e?.name || e?.title || "",
    durationHours: durationHours(e), tss: n(e?.icu_training_load ?? e?.training_load ?? e?.tss),
    cycling: isRide(e), intensity: isIntensity(e), payload: e
  };
}

function intervalsAuth(env) {
  if (!env.INTERVALS_API_KEY) throw new Error("INTERVALS_API_KEY is not configured");
  return "Basic " + btoa("API_KEY:" + env.INTERVALS_API_KEY);
}

async function intervalsGet(env, path) {
  const response = await fetch("https://intervals.icu/api/v1" + path, { headers: { Authorization: intervalsAuth(env), Accept: "application/json" } });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(`Intervals.icu HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function d1Recovery(env, startDate, endDate) {
  const rows = await env.DB.prepare(`
    SELECT data_type, sample_time, start_time, end_time, value_numeric, value_unit, payload_json
    FROM health_datapoints WHERE source_family LIKE 'google%'
      AND (sample_time >= ? OR start_time >= ?) AND (sample_time < ? OR start_time < ?)
    ORDER BY COALESCE(sample_time, start_time)
  `).bind(`${startDate}T00:00:00`, `${startDate}T00:00:00`, `${endDate}T23:59:59`, `${endDate}T23:59:59`).all();
  const out = {};
  for (const r of rows.results || []) {
    let payload = null; try { payload = JSON.parse(r.payload_json || "null"); } catch {}
    (out[r.data_type] ||= []).push({ sampleTime: r.sample_time, startTime: r.start_time, endTime: r.end_time, value: r.value_numeric, unit: r.value_unit, payload });
  }
  return out;
}

async function syncCurrentStrengthSheet(env) {
  const accessTokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" })
  });
  const tokenData = await accessTokenResponse.json();
  if (!accessTokenResponse.ok || !tokenData.access_token) throw new Error(`Google OAuth token error: ${tokenData.error || accessTokenResponse.status}`);
  const range = `'${SHEET_NAME.replace(/'/g, "''")}'!A1:Z1000`;
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(`Google Sheets read HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  return syncStrengthSheet(env.DB, data.values || []);
}

export async function buildStrengthContext(env, requestedDate = null) {
  const date = requestedDate || localDate();
  const oldest = localDate(-DEFAULT_ACTIVITY_DAYS + 1);
  const newest = localDate(DEFAULT_PLANNED_DAYS);

  // Always capture completed sets from the live sheet before reading D1 history.
  // This means workout generation and history queries can use the latest user-entered results.
  const sheetSync = await syncCurrentStrengthSheet(env);

  const [activitiesRaw, eventsRaw, recovery, strengthHistory] = await Promise.all([
    intervalsGet(env, `/athlete/0/activities?oldest=${oldest}&newest=${newest}`),
    intervalsGet(env, `/athlete/0/events?oldest=${date}&newest=${newest}`),
    d1Recovery(env, localDate(-7), localDate(1)),
    getStrengthHistory(env.DB, 150)
  ]);

  const activities = (Array.isArray(activitiesRaw) ? activitiesRaw : []).map(activityInfo);
  const events = (Array.isArray(eventsRaw) ? eventsRaw : []).map(eventInfo);
  const rides = activities.filter(x => x.cycling);
  const plannedRides = events.filter(x => x.cycling);
  const recent = rides.filter(x => x.date <= date).sort((a, b) => String(b.start).localeCompare(String(a.start)));
  const planned = plannedRides.filter(x => x.date >= date).sort((a, b) => String(a.start).localeCompare(String(b.start)));

  return {
    status: "ok", source: "live", date,
    cycling: {
      recentActivities: recent, plannedWorkouts: planned,
      recentRideHours: Math.round(recent.reduce((s, x) => s + n(x.durationHours), 0) * 100) / 100,
      recentRideTss: Math.round(recent.reduce((s, x) => s + n(x.tss), 0)),
      plannedRideHours: Math.round(planned.reduce((s, x) => s + n(x.durationHours), 0) * 100) / 100,
      plannedRideTss: Math.round(planned.reduce((s, x) => s + n(x.tss), 0)), nextRide: planned[0] || null, lastRide: recent[0] || null
    },
    recovery,
    strength: {
      source: "google-sheet/d1", historyReady: true, completedSetCount: strengthHistory.length,
      recentCompletedSets: strengthHistory, sheetSync
    }
  };
}
