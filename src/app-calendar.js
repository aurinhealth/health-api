// The training calendar of the native app (Training → the day strip and the
// month): per day what was done and what is planned, with the sport, length,
// distance and calories, and the day's main sport for its icon. Each day's
// sessions are paired with the plan as the week's are (plan-match.js, then
// app-training.js daySessions): a done session says how it kept to its plan,
// a past plan nothing was done for is "missed", and the day gets one state for
// its colour. Pure: GET /app/api/training/calendar reads the rows of
// health_datapoints, gym plans and the pairings made by hand.
import { pairSessions, sessionLocalStart } from "./activity-match.js";
import { matchPlannedWorkouts } from "./plan-match.js";
import { daySessions, dayPlanState } from "./app-training.js";
import { localDate, localDateTime } from "./user-time.js";
import { bilingual, L } from "./lang.js";
import { groupOfType } from "./activity-type.js";
import { mergeProposal, mergedSpan, sourcesOf } from "./workout-merge.js";
import { intervalsOrigin } from "./activity-origin.js";

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const parse = json => { if (json && typeof json === "object") return json; try { return JSON.parse(json || "{}"); } catch { return {}; } };
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

const SPORTS = [[/virtualride|ride|cycl|bik|kolo/i, "ride"], [/run|běh/i, "run"], [/weight|strength|gym|posil|síl/i, "strength"], [/swim|plav/i, "swim"], [/walk|hike|chůze|procház/i, "walk"]];
export function sportOf(text) {
  return (SPORTS.find(([re]) => re.test(String(text || ""))) || [null, "other"])[1];
}
// A known type decides (a run renamed to a walk keeps "Afternoon Run" as its
// name); only an unknown one is guessed from the type and the name.
const sportOfActivity = (type, name) => groupOfType(type) ?? sportOf(type + " " + (name || ""));

const GOOGLE_TYPES = { WALKING: "Walk", RUNNING: "Run", BIKING: "Ride", CYCLING: "Ride", MOUNTAIN_BIKING: "Ride", INDOOR_BIKING: "VirtualRide", TREADMILL_RUNNING: "VirtualRun", SWIMMING: "Swim", HIKING: "Hike", WEIGHTLIFTING: "WeightTraining", WEIGHTS: "WeightTraining", STRENGTH_TRAINING: "WeightTraining" };
const NAMES = bilingual(
  { ride: "Kolo", run: "Běh", strength: "Posilovna", swim: "Plavání", walk: "Chůze", other: "Aktivita" },
  { ride: "Ride", run: "Run", strength: "Gym", swim: "Swim", walk: "Walk", other: "Activity" }
);
const seconds = v => { const n = Number(String(v ?? "").replace(/s$/i, "")); return Number.isFinite(n) && n > 0 ? n : null; };
const minutesBetween = (a, b) => { const m = (Date.parse(b) - Date.parse(a)) / 60000; return Number.isFinite(m) && m > 0 && m < 24 * 60 ? m : null; };

const watchRef = key => { const m = /^(google-wearables|apple-health):(.{1,200})$/.exec(String(key || "")); return m ? { source: m[1], id: m[2] } : null; };

// A done activity from Intervals.icu (or one made in the app).
function intervalsActivity(row) {
  const p = parse(row.payload_json);
  const type = p.type || p.category || "";
  const sport = sportOfActivity(type, p.name);
  const minutes = (seconds(p.moving_time) ?? seconds(p.elapsed_time) ?? seconds(p.duration_seconds) ?? seconds(p.duration)) / 60 || minutesBetween(row.start_time, row.end_time);
  const meters = num(p.distance) ?? num(p.icu_distance);
  const id = String(p.id || String(row.external_id || "").replace(/^activity:/, ""));
  return {
    row, id: String(row.external_id || id), sport, type: type || null, source: row.source_family, status: "done",
    title: String(p.name || NAMES[sport]).slice(0, 120),
    date: localDate(sessionLocalStart(row) || row.start_time) || String(row.start_time || "").slice(0, 10),
    time: (sessionLocalStart(row) || "").slice(11, 16) || null,
    minutes: round(minutes), km: meters > 0 ? round(meters / 1000, 1) : null,
    kcal: round(num(p.calories_kcal ?? p.calories ?? p.icu_calories ?? row.value_numeric)) || null,
    activityId: /^[a-zA-Z0-9_-]{1,80}$/.test(id) && row.source_family === "intervals" ? id : null,
    eventId: null,
    sources: [row.source_family === "local" ? { name: "Aurin", logo: "aurin" } : row.source_family === "wahoo" ? { name: "Wahoo", logo: "wahoo" } : intervalsOrigin(p)],
    // Typed in and paired with the watch's record: that record is its detail.
    ...(watchRef(p.pairedWith) ? { watch: watchRef(p.pairedWith) } : {}),
    // What the pairing with the plan reads (as index.js's daily activities).
    pair: {
      id: String(row.external_id || id), source: "intervals", type, name: p.name || "", start: row.start_time, payload: p,
      durationHours: minutes > 0 ? minutes / 60 : null, tss: num(p.icu_training_load ?? p.training_load ?? p.tss),
      pairedEventId: p.paired_event_id ?? p.pairedEventId ?? p.event_id ?? p.eventId ?? null
    }
  };
}

// A value from Google's metricsSummary by the shape of its name (the API
// names them e.g. averageHeartRateBeatsPerMinute), a number or {bpm|value}.
function metric(metrics, match, skip = /zone|variab/i) {
  const key = Object.keys(metrics).find(k => match(k) && !skip.test(k));
  if (!key) return null;
  const v = metrics[key];
  const n = num(v && typeof v === "object" ? v.bpm ?? v.value ?? v.count : v);
  return n > 0 ? n : null;
}

// What the app's detail of a watch session shows: Google gives a summary only
// (no laps, no track), so the detail stays to these.
function googleSummary(row, metrics, span = null) {
  const local = (span ? localDateTime(span.start) : sessionLocalStart(row)) || "";
  const endLocal = localDateTime(span?.end || row.end_time) || "";
  const avgHr = metric(metrics, k => /heart/i.test(k) && /avg|average/i.test(k));
  const maxHr = metric(metrics, k => /heart/i.test(k) && /max/i.test(k));
  const steps = metric(metrics, k => /steps/i.test(k));
  const elevation = metric(metrics, k => /elevation/i.test(k) && /gain|meter|m$/i.test(k));
  return {
    source: "google",
    start: local.slice(11, 16) || null,
    end: /T\d{2}:\d{2}/.test(endLocal) ? endLocal.slice(11, 16) : null,
    avgHr: avgHr && avgHr < 250 ? Math.round(avgHr) : null,
    maxHr: maxHr && maxHr < 250 ? Math.round(maxHr) : null,
    steps: steps ? Math.round(steps) : null,
    elevationM: elevation ? Math.round(/millimeter/i.test(Object.keys(metrics).find(k => /elevation/i.test(k)) || "") ? elevation / 1000 : elevation) : null
  };
}

// A watch session from Google Health (also the walks it finds on its own).
function googleActivity(row) {
  const p = parse(row.payload_json), ex = p.exercise || {}, metrics = ex.metricsSummary || {};
  const type = GOOGLE_TYPES[String(ex.exerciseType || "")] || String(ex.exerciseType || "");
  const sport = sportOfActivity(type, ex.displayName);
  // Merged with another device's record (workout-merge.js): the time chosen then.
  const span = mergedSpan(p);
  const minutes = span ? minutesBetween(span.start, span.end) : (seconds(ex.activeDuration) ?? 0) / 60 || minutesBetween(row.start_time, row.end_time);
  const mm = num(metrics.distanceMillimeters), m = num(metrics.distanceMeters);
  const meters = m ?? (mm != null ? mm / 1000 : null);
  const local = (span ? localDateTime(span.start) : sessionLocalStart(row)) || "";
  return {
    row, id: String(row.external_id), sport, type: type || null, source: row.source_family, status: "done",
    title: String(ex.displayName || NAMES[sport]).slice(0, 120),
    date: local.slice(0, 10) || localDate(row.start_time),
    time: local.slice(11, 16) || null,
    minutes: round(minutes), km: meters > 0 ? round(meters / 1000, 1) : null,
    kcal: round(num(metrics.caloriesKcal)) || null,
    activityId: null, eventId: null,
    sources: sourcesOf(row, p),
    ...(p.loadwiseMerge?.energy ? { mergeEnergy: String(p.loadwiseMerge.energy) } : {}),
    summary: googleSummary(row, metrics, span),
    pair: { id: String(row.external_id), source: "google", type, name: ex.displayName || "", start: row.start_time, payload: p, durationHours: minutes > 0 ? minutes / 60 : null, tss: null, pairedEventId: null }
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
    pair: { id: String(row.external_id), name, type: p.type || "", start, durationHours: hours > 0 && hours < 12 ? hours : null, tss: num(p.icu_training_load ?? p.training_load) },
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

// manual: the pairings made by hand (manual-pairs.js), planned id → activity id.
export function buildCalendar({ start, end, today, activities = [], google = [], planned = [], gym = {}, manual = new Map() }) {
  const done = activities.map(intervalsActivity);
  const watch = google.map(googleActivity);
  // One workout from both sources counts once (activity-match.js).
  const drop = new Set(pairSessions([...activities, ...google]).map(p => p.drop));
  const kept = [...done, ...watch].filter(a => !drop.has(a.row) && a.date);
  const plans = planned.map(plannedWorkout).filter(w => !w.weekly && w.date);

  const days = new Map(), merges = new Map();
  for (let d = start; d <= end; d = shift(d, 1)) days.set(d, []);
  for (const [date, items] of days) {
    const dayDone = kept.filter(a => a.date === date), dayPlans = plans.filter(w => w.date === date);
    // The same pairing as the week's sessions: plan-match.js, then daySessions.
    const pairs = matchPlannedWorkouts(dayPlans.map(w => w.pair), dayDone.map(a => a.pair), new Map(), manual);
    const matched = [...pairs].map(([plan, actual]) => ({ planned: plan, actualId: actual.id }));
    const paired = new Set(matched.map(m => String(m.actualId)));
    const training = { planned: dayPlans.map(w => w.pair).filter(w => !pairs.has(w)), completed: dayDone.map(a => a.pair), matched };
    const gymPlan = gym?.[date]?.exercises?.length ? gym[date] : null;
    const byId = new Map(daySessions(date, today, training, gymPlan).sessions.map(s => [s.id, s]));
    // Done: what lasted five minutes, and a stub without a length its plan names.
    for (const a of dayDone) {
      if ((a.minutes || 0) < 5 && !paired.has(a.pair.id)) continue;
      const { row, pair, ...rest } = a;
      const s = byId.get(pair.id);
      rest.adherence = s?.adherence || "offplan";
      if (s?.adherenceReason) rest.adherenceReason = s.adherenceReason;
      if (s?.compliance != null) rest.compliance = s.compliance;
      if (s?.plannedId) {
        rest.plannedId = s.plannedId;
        const plan = dayPlans.find(w => w.id === s.plannedId);
        if (plan && rest.sport === "other") Object.assign(rest, { sport: plan.sport, title: plan.title });
      }
      items.push(rest);
    }
    // Plans nothing was paired with: still ahead, or missed on a past day.
    for (const w of dayPlans) {
      const s = byId.get(w.id);
      if (!s || s.status === "done") continue;
      const { weekly, tss, pair, ...rest } = w;
      items.push({ ...rest, status: s.status });
    }
    // Two devices recorded one workout: the proposal to merge them (workout-merge.js).
    const proposal = mergeProposal(dayDone.filter(a => a.summary).map(a => a.row));
    if (proposal) merges.set(date, proposal);
    // A gym plan saved in the app; its sets logged there make it done.
    const gymSession = byId.get("gym:" + date);
    if (gymSession && gymPlan) {
      items.push({
        id: gymSession.id, sport: gymSession.sport || "strength", ...(gymPlan.type ? { type: gymPlan.type, source: "gym" } : {}), status: gymSession.status, title: gymSession.title, date, time: null, minutes: null, km: null, kcal: null, activityId: null, eventId: null, exercises: gymPlan.exercises.length,
        ...(gymSession.adherence ? { adherence: gymSession.adherence } : {}), ...(gymSession.adherenceReason ? { adherenceReason: gymSession.adherenceReason } : {}), ...(gymSession.compliance != null ? { compliance: gymSession.compliance } : {})
      });
    }
  }

  return {
    status: "ok", start, end, today,
    days: [...days.entries()].map(([date, items]) => {
      const rank = a => (a.status === "done" ? 0 : 1);
      const sorted = items.sort((a, b) => rank(a) - rank(b) || String(a.time || "99").localeCompare(String(b.time || "99")));
      const real = sorted.filter(a => a.status === "done");
      return {
        date,
        primary: primarySport(sorted),
        count: real.length,
        minutes: Math.round(real.reduce((s, a) => s + (a.minutes || 0), 0)),
        kcal: Math.round(real.reduce((s, a) => s + (a.kcal || 0), 0)),
        planned: sorted.filter(a => a.status === "planned").length,
        missed: sorted.filter(a => a.status === "missed").length,
        // The day's colour (app-training.js dayPlanState): good, off, missed,
        // planned or offplan; null for a day without sessions.
        plan: dayPlanState(sorted),
        activities: sorted,
        ...(merges.has(date) ? { merge: merges.get(date) } : {})
      };
    })
  };
}
