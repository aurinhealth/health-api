// The training calendar of the native app (Training → the day strip and the
// month): per day what was done and what is planned, with the sport, length,
// distance and calories, and the day's main sport for its icon. Pure: GET
// /app/api/training/calendar reads the rows of health_datapoints and gym plans.
import { pairSessions, sessionLocalStart } from "./activity-match.js";
import { localDate } from "./user-time.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const parse = json => { if (json && typeof json === "object") return json; try { return JSON.parse(json || "{}"); } catch { return {}; } };
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

const SPORTS = [[/virtualride|ride|cycl|bik|kolo/i, "ride"], [/run|běh/i, "run"], [/weight|strength|gym|posil|síl/i, "strength"], [/swim|plav/i, "swim"], [/walk|hike|chůze|procház/i, "walk"]];
export function sportOf(text) {
  return (SPORTS.find(([re]) => re.test(String(text || ""))) || [null, "other"])[1];
}

const GOOGLE_TYPES = { WALKING: "Walk", RUNNING: "Run", BIKING: "Ride", CYCLING: "Ride", MOUNTAIN_BIKING: "Ride", INDOOR_BIKING: "VirtualRide", TREADMILL_RUNNING: "VirtualRun", SWIMMING: "Swim", HIKING: "Hike", WEIGHTLIFTING: "WeightTraining", WEIGHTS: "WeightTraining", STRENGTH_TRAINING: "WeightTraining" };
const NAMES = { ride: "Kolo", run: "Běh", strength: "Posilovna", swim: "Plavání", walk: "Chůze", other: "Aktivita" };
const seconds = v => { const n = Number(String(v ?? "").replace(/s$/i, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const minutesBetween = (a, b) => { const m = (Date.parse(b) - Date.parse(a)) / 60000; return Number.isFinite(m) && m > 0 && m < 24 * 60 ? m : null; };

// A done activity from Intervals.icu (or one made in the app).
function intervalsActivity(row) {
  const p = parse(row.payload_json);
  const type = p.type || p.category || "";
  const sport = sportOf(type + " " + (p.name || ""));
  const minutes = (seconds(p.moving_time) ?? seconds(p.elapsed_time) ?? seconds(p.duration_seconds) ?? seconds(p.duration)) / 60 || minutesBetween(row.start_time, row.end_time);
  const meters = num(p.distance) ?? num(p.icu_distance);
  const id = String(p.id || String(row.external_id || "").replace(/^activity:/, ""));
  return {
    row, id: String(row.external_id || id), sport, status: "done",
    title: String(p.name || NAMES[sport]).slice(0, 120),
    date: localDate(sessionLocalStart(row) || row.start_time) || String(row.start_time || "").slice(0, 10),
    time: (sessionLocalStart(row) || "").slice(11, 16) || null,
    minutes: round(minutes), km: meters > 0 ? round(meters / 1000, 1) : null,
    kcal: round(num(p.calories_kcal ?? p.calories ?? p.icu_calories ?? row.value_numeric)) || null,
    activityId: /^[a-zA-Z0-9_-]{1,80}$/.test(id) && row.source_family === "intervals" ? id : null,
    eventId: null
  };
}

// A watch session from Google Health (also the walks it finds on its own).
function googleActivity(row) {
  const p = parse(row.payload_json), ex = p.exercise || {}, metrics = ex.metricsSummary || {};
  const type = GOOGLE_TYPES[String(ex.exerciseType || "")] || String(ex.exerciseType || "");
  const sport = sportOf(type + " " + (ex.displayName || ""));
  const minutes = (seconds(ex.activeDuration) ?? 0) / 60 || minutesBetween(row.start_time, row.end_time);
  const mm = num(metrics.distanceMillimeters), m = num(metrics.distanceMeters);
  const meters = m ?? (mm != null ? mm / 1000 : null);
  const local = sessionLocalStart(row) || "";
  return {
    row, id: String(row.external_id), sport, status: "done",
    title: String(ex.displayName || NAMES[sport]).slice(0, 120),
    date: local.slice(0, 10) || localDate(row.start_time),
    time: local.slice(11, 16) || null,
    minutes: round(minutes), km: meters > 0 ? round(meters / 1000, 1) : null,
    kcal: round(num(metrics.caloriesKcal)) || null,
    activityId: null, eventId: null
  };
}

// A planned workout from the Intervals.icu calendar.
function plannedWorkout(row) {
  const p = parse(row.payload_json);
  const name = String(p.name || p.type || "").trim();
  let hours = num(p.moving_time ?? p.duration ?? p.duration_seconds);
  hours = hours != null ? (hours > 1000 || p.moving_time != null ? hours / 3600 : hours) : null;
  const sport = sportOf((p.type || "") + " " + name);
  const start = String(p.start_date_local || row.start_time || "");
  const meters = num(p.distance);
  const kj = num(p.joules) != null ? num(p.joules) / 1000 : null;
  return {
    id: String(row.external_id), sport, status: "planned",
    title: (name || NAMES[sport]).slice(0, 120),
    date: start.slice(0, 10), time: /T\d{2}:\d{2}/.test(start) && start.slice(11, 16) !== "00:00" ? start.slice(11, 16) : null,
    minutes: hours > 0 && hours < 12 ? round(hours * 60) : null,
    km: meters > 0 ? round(meters / 1000, 1) : null,
    // Work in kJ is about the kcal a rider burns (body efficiency ~24 %).
    kcal: kj > 0 ? round(kj) : null,
    activityId: null,
    eventId: /^planned:/.test(String(row.external_id || "")) ? String(row.external_id) : null,
    tss: num(p.icu_training_load ?? p.training_load),
    // "Weekly" notes, nutrition and plain notes are no workouts.
    weekly: (/^weekly$/i.test(name) && !hours) || /nutrition/i.test(name + " " + (p.category || "")) || /^(NOTE|HOLIDAY|SICK|INJURED|SET_EFTP|FITNESS_DAYS|TARGET)$/i.test(String(p.category || ""))
  };
}

// The day's main sport for its icon: the longest workout done, else the
// longest planned; a walk only when the day has nothing else. "rest" for a
// day without any.
export function primarySport(activities) {
  const longest = list => list.slice().sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0]?.sport;
  const real = activities.filter(a => a.sport !== "walk");
  return longest(real.filter(a => a.status === "done")) || longest(real) || longest(activities) || "rest";
}

export function buildCalendar({ start, end, today, activities = [], google = [], planned = [], gym = {} }) {
  const done = activities.map(intervalsActivity);
  const watch = google.map(googleActivity);
  // One workout from both sources counts once (activity-match.js).
  const drop = new Set(pairSessions([...activities, ...google]).map(p => p.drop));
  const list = [...done, ...watch].filter(a => !drop.has(a.row) && a.date && (a.minutes || 0) >= 5);

  const days = new Map();
  for (let d = start; d <= end; d = shift(d, 1)) days.set(d, []);
  for (const a of list) {
    if (!days.has(a.date)) continue;
    const { row, ...rest } = a;
    days.get(a.date).push(rest);
  }
  // Plans: from today on, the ones not yet done (a done sport that day takes its plan).
  for (const w of planned.map(plannedWorkout)) {
    if (w.weekly || !days.has(w.date) || w.date < today) continue;
    const day = days.get(w.date);
    if (day.some(a => a.status === "done" && a.sport === w.sport)) continue;
    const { weekly, tss, ...rest } = w;
    day.push(rest);
  }
  for (const [date, plan] of Object.entries(gym || {})) {
    if (!days.has(date) || date < today || !plan?.exercises?.length) continue;
    const day = days.get(date);
    if (day.some(a => a.sport === "strength")) continue;
    day.push({ id: "gym:" + date, sport: "strength", status: "planned", title: plan.name || "Posilovna", date, time: null, minutes: null, km: null, kcal: null, activityId: null, eventId: null, exercises: plan.exercises.length });
  }

  return {
    status: "ok", start, end, today,
    days: [...days.entries()].map(([date, items]) => {
      const sorted = items.sort((a, b) => (a.status === b.status ? 0 : a.status === "done" ? -1 : 1) || String(a.time || "99").localeCompare(String(b.time || "99")));
      const real = sorted.filter(a => a.status === "done");
      return {
        date,
        primary: primarySport(sorted),
        count: real.length,
        minutes: Math.round(real.reduce((s, a) => s + (a.minutes || 0), 0)),
        kcal: Math.round(real.reduce((s, a) => s + (a.kcal || 0), 0)),
        planned: sorted.length - real.length,
        activities: sorted
      };
    })
  };
}
