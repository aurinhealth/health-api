// Adaptive workout library: the shared catalog (built-in workouts plus any
// rows in workout_library), per-user capability progression, ranking, "generate a
// workout for this day" and scheduling to the user's Intervals.icu calendar.
// Every query on personal tables filters by db.userId (see tenancy.js).
import { renderForEnvironment, n, clamp } from "./workout-model.js";
import { CYCLING_WORKOUTS } from "./cycling-workouts.js";
import { RUNNING_WORKOUTS } from "./running-workouts.js";
import { explainWorkout, stepRows } from "./workout-explanation.js";

export const SYSTEMS = ["recovery", "endurance", "tempo", "sweet_spot", "threshold", "vo2max", "anaerobic", "sprint"];
const HARD_SYSTEMS = new Set(["sweet_spot", "threshold", "vo2max", "anaerobic", "sprint"]);
export { CYCLING_WORKOUTS, RUNNING_WORKOUTS, stepRows };
const BUILT_IN = { ride: CYCLING_WORKOUTS, run: RUNNING_WORKOUTS };
const BUILT_IN_BY_ID = new Map(Object.values(BUILT_IN).flat().map(w => [w.id, w]));
const now = () => new Date().toISOString();
const sportOf = value => value === "run" ? "run" : "ride";
const environmentOf = value => value === "outdoor" ? "outdoor" : "indoor";

export function defaultCapabilities(sport = "ride") {
  return Object.fromEntries(SYSTEMS.map(system => [system, { sport, system, level: 3, confidence: .2, attempts: 0, successes: 0 }]));
}

// Shared catalog table for imported workouts; per-user tables for progression.
export async function ensureTrainingTables(db) {
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS workout_library (id TEXT PRIMARY KEY, sport TEXT NOT NULL DEFAULT 'ride', name TEXT NOT NULL, family TEXT, level INTEGER, source_name TEXT NOT NULL, source_kind TEXT NOT NULL, source_url TEXT, license_note TEXT, attribution TEXT, citation TEXT, external_id TEXT, primary_system TEXT NOT NULL, secondary_system TEXT, duration_minutes INTEGER NOT NULL, work_minutes REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 1, intensity_factor REAL, target_load REAL, cadence TEXT, description TEXT, indoor_only INTEGER NOT NULL DEFAULT 0, intervals_description TEXT NOT NULL, tags_json TEXT NOT NULL DEFAULT '[]', structure_json TEXT NOT NULL DEFAULT '[]', zone_minutes_json TEXT NOT NULL DEFAULT '{}', verified INTEGER NOT NULL DEFAULT 0, popularity REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS training_capabilities (user_id INTEGER NOT NULL, sport TEXT NOT NULL, system TEXT NOT NULL, level REAL NOT NULL DEFAULT 3.0, confidence REAL NOT NULL DEFAULT 0.20, attempts INTEGER NOT NULL DEFAULT 0, successes INTEGER NOT NULL DEFAULT 0, last_workout_id TEXT, last_rpe REAL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, sport, system))`,
    `CREATE TABLE IF NOT EXISTS workout_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, sport TEXT NOT NULL DEFAULT 'ride', workout_id TEXT NOT NULL, family TEXT, scheduled_date TEXT, completed_percent REAL, rpe REAL, survey TEXT, notes TEXT, capability_before REAL, capability_after REAL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_feedback_manual_once ON workout_feedback(user_id, workout_id, scheduled_date) WHERE scheduled_date IS NOT NULL AND survey <> 'auto_completed'`,
    `CREATE TABLE IF NOT EXISTS workout_schedule_links (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, sport TEXT NOT NULL DEFAULT 'ride', workout_id TEXT NOT NULL, family TEXT, scheduled_date TEXT NOT NULL, environment TEXT NOT NULL DEFAULT 'indoor', intervals_external_id TEXT NOT NULL, intervals_event_id TEXT, status TEXT NOT NULL DEFAULT 'scheduled', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (user_id, intervals_external_id))`,
    `CREATE INDEX IF NOT EXISTS idx_workout_schedule_user_date ON workout_schedule_links(user_id, scheduled_date DESC)`
  ]) await db.prepare(sql).run();
}

async function importedWorkouts(db, sport) {
  const rows = await db.prepare("SELECT * FROM workout_library WHERE sport=?").bind(sport).all();
  return rows.results || [];
}
export async function catalog(db, sport = "ride") {
  await ensureTrainingTables(db);
  return [...(BUILT_IN[sport] || []), ...await importedWorkouts(db, sport)];
}
export async function getWorkout(db, id) {
  if (BUILT_IN_BY_ID.has(id)) return BUILT_IN_BY_ID.get(id);
  await ensureTrainingTables(db);
  return db.prepare("SELECT * FROM workout_library WHERE id=?").bind(String(id)).first();
}

export async function getCapabilities(db, sport = "ride") {
  await ensureTrainingTables(db);
  const rows = await db.prepare("SELECT * FROM training_capabilities WHERE user_id=? AND sport=?").bind(db.userId, sport).all();
  return { ...defaultCapabilities(sport), ...Object.fromEntries((rows.results || []).map(x => [x.system, x])) };
}

export function parseWorkoutSearchFilters(params) {
  const get = key => { const value = params.get(key); return value == null || value === "" ? undefined : value; };
  const num = key => { const value = get(key); return value == null ? undefined : n(value); };
  return {
    sport: sportOf(get("sport")),
    environment: environmentOf(get("environment")),
    system: get("system"),
    durationMinutes: num("duration") ?? num("durationMinutes"),
    durationTolerance: num("durationTolerance"),
    targetLoad: num("load") ?? num("targetLoad"),
    loadTolerance: num("loadTolerance"),
    maxDifficulty: num("maxDifficulty"),
    source: get("source"),
    limit: num("limit")
  };
}

// Ranks by energy-system match, duration and load fit, the gap between the
// workout's difficulty and the athlete's capability (adjusted for readiness
// and phase), recent hard days and variety versus recently done families.
export function rankWorkoutCandidates(workouts, filters = {}, context = {}, capabilities = defaultCapabilities()) {
  const system = String(filters.system || "").toLowerCase(), duration = n(filters.durationMinutes), durationTolerance = n(filters.durationTolerance, 15);
  const targetLoad = n(filters.targetLoad), loadTolerance = n(filters.loadTolerance, 35), maxDifficulty = n(filters.maxDifficulty);
  const readiness = String(context.readiness || "green").toLowerCase(), hardDays = n(context.hardBikeDaysRolling7d, 0), phase = String(context.phase || "").toLowerCase();
  const recentFamilies = new Set(context.recentFamilies || []);
  const source = filters.source ? String(filters.source) : null;
  return workouts.filter(w => (!system || w.primary_system === system || w.secondary_system === system)
    && (duration == null || Math.abs(n(w.duration_minutes, 0) - duration) <= durationTolerance)
    && (maxDifficulty == null || n(w.difficulty, 99) <= maxDifficulty)
    && (filters.environment !== "outdoor" || !n(w.indoor_only, 0))
    && (!source || w.source_kind === source)).map(w => {
    let score = 25; const reasons = [];
    if (system) {
      if (w.primary_system === system) { score += 25; reasons.push("přesný tréninkový systém"); }
      else { score += 4; reasons.push("sekundární zásah cílového systému"); }
    }
    if (duration != null) {
      const diff = Math.abs(n(w.duration_minutes, 0) - duration), fit = clamp(1 - diff / Math.max(durationTolerance, 1), 0, 1);
      score += 20 * fit; if (diff <= 5) reasons.push("téměř přesná délka"); else reasons.push("délka v toleranci");
    }
    if (targetLoad != null) {
      const diff = Math.abs(n(w.target_load, 0) - targetLoad), fit = clamp(1 - diff / Math.max(loadTolerance, 1), 0, 1); score += 12 * fit; if (diff <= 10) reasons.push("zátěž blízko cíli");
    }
    const capability = capabilities[w.primary_system] || { level: 3, confidence: .1 };
    const readinessOffset = readiness === "green" ? .45 : readiness === "yellow" ? -.25 : -1;
    const phaseOffset = phase === "build" ? .25 : phase === "recovery" ? -.8 : phase === "taper" ? -.3 : 0;
    const ideal = clamp(n(context.targetDifficulty, n(capability.level, 3) + readinessOffset + phaseOffset), 1, 10);
    const gap = Math.abs(n(w.difficulty, 5) - ideal);
    score += clamp(18 - gap * 4, 0, 18);
    if (gap <= .75) reasons.push("obtížnost odpovídá tvé aktuální úrovni");
    if (readiness === "red" && HARD_SYSTEMS.has(w.primary_system)) { score -= 30; reasons.push("penalizace kvůli nízké připravenosti"); }
    if (readiness === "yellow" && ["vo2max", "anaerobic", "sprint"].includes(w.primary_system)) score -= 12;
    if (hardDays >= 2 && HARD_SYSTEMS.has(w.primary_system)) { score -= 24; reasons.push("penalizace po dvou kvalitních dnech"); }
    if (w.family && recentFamilies.has(w.family)) { score -= 6; reasons.push("podobný trénink byl nedávno"); }
    if (w.source_kind === "research") { score += 2; reasons.push("ověřený vědecký protokol"); }
    if (n(w.verified, 0)) score += 2;
    score += Math.min(3, Math.log10(1 + n(w.popularity, 0)) * 1.5);
    return { ...w, suitability: Math.round(clamp(score, 0, 100)), capability_level: n(capability.level, 3), challenge_gap: Math.round((n(w.difficulty, 5) - n(capability.level, 3)) * 10) / 10, reasons };
  }).sort((a, b) => b.suitability - a.suitability || Math.abs((duration ?? a.duration_minutes) - a.duration_minutes) - Math.abs((duration ?? b.duration_minutes) - b.duration_minutes) || a.difficulty - b.difficulty || a.id.localeCompare(b.id));
}

async function recentFamilies(db, sport, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db.prepare("SELECT DISTINCT family FROM workout_schedule_links WHERE user_id=? AND sport=? AND scheduled_date>=? AND family IS NOT NULL").bind(db.userId, sport, since).all();
  return (rows.results || []).map(r => r.family);
}

export async function searchWorkoutLibrary(db, filters = {}, context = {}) {
  const sport = sportOf(filters.sport), environment = environmentOf(filters.environment);
  const [workouts, capabilities, families] = await Promise.all([catalog(db, sport), getCapabilities(db, sport), recentFamilies(db, sport).catch(() => [])]);
  const ranked = rankWorkoutCandidates(workouts, { ...filters, environment }, { ...context, recentFamilies: context.recentFamilies || families }, capabilities);
  const limit = clamp(n(filters.limit, 30), 1, 100);
  return { status: "ok", sport, environment, count: Math.min(limit, ranked.length), total: ranked.length, catalogSize: workouts.length, filters, capabilities, workouts: ranked.slice(0, limit).map(w => renderForEnvironment(w, environment)) };
}

// "Generate a workout": the coach decides the energy system, duration and the
// right challenge for the day; the library picks the best match. `variant`
// walks through the top candidates for a different but equally fitting option.
export async function generateWorkout(db, { sport = "ride", environment = "indoor", date, coach = {}, availabilityMinutes = null, variant = 0, thresholds = {} } = {}) {
  sport = sportOf(sport);
  const rec = coach.recommendation?.session || {};
  let kind = rec.kind === "long_endurance" ? "endurance" : rec.kind === "vo2" ? "vo2max" : rec.kind || "endurance";
  // Running has no sweet-spot band; the nearest is sub-threshold work.
  if (sport === "run" && kind === "sweet_spot") kind = "threshold";
  const minutes = sport === "run" ? clamp(n(availabilityMinutes, n(rec.durationMinutes, 60)), 20, 240) : clamp(n(availabilityMinutes, n(rec.durationMinutes, 90)), 30, 360);
  const context = { readiness: coach.readiness?.status || "green", hardBikeDaysRolling7d: coach.load?.hardBikeDaysRolling7d ?? 0, phase: coach.constraints?.phase === "auto" ? "" : coach.constraints?.phase, targetDifficulty: coach.recommendation?.progression?.targetDifficulty };
  let result = await searchWorkoutLibrary(db, { sport, environment, system: kind, durationMinutes: minutes, durationTolerance: 15, limit: 12 }, context);
  if (!result.workouts.length) result = await searchWorkoutLibrary(db, { sport, environment, system: kind, durationMinutes: minutes, durationTolerance: 45, limit: 12 }, context);
  if (!result.workouts.length) return { status: "empty", message: "Pro tento den jsem nenašel vhodný workout. Zkus jinou délku.", system: kind, durationMinutes: minutes };
  // Prefer distinct families among the alternatives so "another option" is really different.
  const seen = new Set(), distinct = [];
  for (const w of result.workouts) if (!seen.has(w.family || w.id)) { seen.add(w.family || w.id); distinct.push(w); }
  const pool = distinct.slice(0, 5), pick = pool[Math.abs(Math.trunc(n(variant, 0))) % pool.length];
  const plannedToday = coach.constraints?.plannedToday;
  const planned = plannedToday?.system ? { name: plannedToday.name, minutes: plannedToday.minutes, system: plannedToday.system, intensityFactor: plannedToday.intensityFactor, structure: plannedToday.structure } : null;
  return {
    status: "ok", sport, environment, date, system: kind, durationMinutes: minutes,
    readiness: coach.readiness || null, progression: coach.recommendation?.progression || null, adaptations: coach.recommendation?.adaptations || [],
    workout: pick, alternatives: pool.filter(w => w.id !== pick.id).slice(0, 3), variantCount: pool.length,
    explanation: explainWorkout(pick, { coach, environment: pick.environment || environment, thresholds, planned, sport })
  };
}

export function calculateCapabilityUpdate(current,workout,feedback={}){
  const level=n(current?.level,3),difficulty=n(workout?.difficulty,level),completed=clamp(n(feedback.completedPercent,100)/100,0,1),rpe=n(feedback.rpe),survey=String(feedback.survey||"").toLowerCase();
  let delta=0;let success=false;
  if(survey==="auto_completed"){
    // A paired activity and its duration do not prove that the work intervals were completed.
  } else if(completed>=.9&&survey!=="failed"){
    success=true;
    if(rpe!=null&&rpe<=6.5)delta=.30;
    else if(rpe!=null&&rpe<=8.5)delta=.18;
    else delta=.08;
    delta*=clamp(.7+(difficulty-level)*.25,.5,1.35);
  } else if(completed>=.75){delta=-.08}
  else delta=-.22;
  if(rpe!=null&&rpe>=9.5&&completed<.95)delta-=.08;
  const next=clamp(level+delta,1,10),attempts=n(current?.attempts,0)+(survey==="auto_completed"?0:1),successes=n(current?.successes,0)+(success?1:0),confidence=clamp(n(current?.confidence,.2)+(survey==="auto_completed"?0:.04),0,1);
  return {level:Math.round(next*100)/100,confidence:Math.round(confidence*100)/100,attempts,successes,delta:Math.round(delta*100)/100,success};
}

export async function recordWorkoutFeedback(db, { workoutId, scheduledDate = null, completedPercent = 100, rpe = null, survey = "completed", notes = null }) {
  if (!Number.isFinite(Number(completedPercent)) || Number(completedPercent) < 0 || Number(completedPercent) > 150) throw new Error("Dokončení musí být 0–150 %.");
  if (rpe != null && (!Number.isFinite(Number(rpe)) || Number(rpe) < 1 || Number(rpe) > 10)) throw new Error("RPE musí být 1–10.");
  if (scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) throw new Error("Neplatné datum tréninku.");
  await ensureTrainingTables(db);
  const w = await getWorkout(db, workoutId); if (!w) throw new Error("Workout nebyl nalezen.");
  const sport = sportOf(w.sport);
  if (scheduledDate && survey !== "auto_completed") {
    const previous = await db.prepare("SELECT id FROM workout_feedback WHERE user_id=? AND workout_id=? AND scheduled_date=? AND survey<>'auto_completed' LIMIT 1").bind(db.userId, workoutId, scheduledDate).first();
    if (previous) throw new Error("Tento workout už má uložené hodnocení.");
  }
  const capabilities = await getCapabilities(db, sport), current = capabilities[w.primary_system];
  const next = calculateCapabilityUpdate(current, w, { completedPercent, rpe, survey });
  await db.batch([
    db.prepare(`INSERT INTO training_capabilities(user_id,sport,system,level,confidence,attempts,successes,last_workout_id,last_rpe,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id,sport,system) DO UPDATE SET level=excluded.level,confidence=excluded.confidence,attempts=excluded.attempts,successes=excluded.successes,last_workout_id=excluded.last_workout_id,last_rpe=excluded.last_rpe,updated_at=excluded.updated_at`)
      .bind(db.userId, sport, w.primary_system, next.level, next.confidence, next.attempts, next.successes, w.id, rpe, now()),
    db.prepare("INSERT INTO workout_feedback(user_id,sport,workout_id,family,scheduled_date,completed_percent,rpe,survey,notes,capability_before,capability_after) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(db.userId, sport, w.id, w.family || null, scheduledDate, n(completedPercent, 100), rpe, survey, notes, n(current.level, 3), next.level),
    ...(scheduledDate ? [db.prepare("UPDATE workout_schedule_links SET status='completed' WHERE user_id=? AND workout_id=? AND scheduled_date=?").bind(db.userId, w.id, scheduledDate)] : [])
  ]);
  return { status: "ok", sport, system: w.primary_system, before: n(current.level, 3), after: next.level, delta: next.delta, confidence: next.confidence };
}

export async function getScheduledWorkouts(db, limit = 20) {
  await ensureTrainingTables(db);
  const rows = await db.prepare(`SELECT l.workout_id,l.sport,l.scheduled_date,l.environment,l.intervals_event_id,l.status,
    (SELECT f.id FROM workout_feedback f WHERE f.user_id=l.user_id AND f.workout_id=l.workout_id AND f.scheduled_date=l.scheduled_date AND f.survey<>'auto_completed' ORDER BY f.id DESC LIMIT 1) AS feedback_id
    FROM workout_schedule_links l WHERE l.user_id=? ORDER BY l.scheduled_date DESC LIMIT ?`).bind(db.userId, clamp(n(limit, 20), 1, 50)).all();
  const out = [];
  for (const row of rows.results || []) {
    const w = await getWorkout(db, row.workout_id);
    out.push({ ...row, name: w?.name || row.workout_id, primary_system: w?.primary_system || null, duration_minutes: w?.duration_minutes || null });
  }
  return out;
}

// Scheduled but not yet reviewed workouts on or before `date`, for matching
// against completed activities.
export async function pendingScheduledWorkouts(db, date) {
  await ensureTrainingTables(db);
  const rows = await db.prepare("SELECT id,workout_id,scheduled_date,intervals_event_id FROM workout_schedule_links WHERE user_id=? AND status='scheduled' AND scheduled_date<=? ORDER BY scheduled_date DESC LIMIT 20").bind(db.userId, date).all();
  const out = [];
  for (const row of rows.results || []) { const w = await getWorkout(db, row.workout_id); if (w) out.push({ ...row, name: w.name, duration_minutes: w.duration_minutes }); }
  return out;
}
export async function markScheduleCompleted(db, id) {
  await db.prepare("UPDATE workout_schedule_links SET status='completed' WHERE user_id=? AND id=?").bind(db.userId, id).run();
}
export async function hasFeedback(db, workoutId, date) {
  return Boolean(await db.prepare("SELECT id FROM workout_feedback WHERE user_id=? AND workout_id=? AND scheduled_date=? LIMIT 1").bind(db.userId, workoutId, date).first());
}

export function buildIntervalsEvent(workout, date, environment = "indoor") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("Neplatné datum.");
  const rendered = renderForEnvironment(workout, environment);
  const externalId = "pfd-library:" + workout.id + ":" + date + (rendered.environment === "outdoor" ? ":outdoor" : "");
  const tags = (() => { try { return JSON.parse(workout.tags_json || "[]"); } catch { return []; } })();
  const notes = rendered.environment_notes.join(" ");
  return {
    external_id: externalId, category: "WORKOUT", start_date_local: date + "T00:00:00", type: rendered.intervals_type, name: workout.name,
    description: (workout.description ? workout.description + "\n" + notes + "\n\n" : notes + "\n\n") + rendered.intervals_description,
    load_target: Math.round(n(workout.target_load, 0)), tags: [...new Set(["PFD Workout Library", rendered.environment, ...tags])]
  };
}

export async function scheduleWorkoutInIntervals(env, db, { workoutId, date, confirm = false, environment = "indoor" }) {
  if (confirm !== true) throw new Error("Zápis do Intervals.icu vyžaduje potvrzení.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("Neplatné datum.");
  const workout = await getWorkout(db, workoutId); if (!workout) throw new Error("Workout nebyl nalezen.");
  if (!env.INTERVALS_API_KEY) throw new Error("Intervals.icu není připojeno.");
  await ensureTrainingTables(db);
  const event = buildIntervalsEvent(workout, date, environmentOf(environment)), auth = "Basic " + btoa("API_KEY:" + String(env.INTERVALS_API_KEY));
  const existing = await db.prepare("SELECT intervals_event_id,status FROM workout_schedule_links WHERE user_id=? AND intervals_external_id=?").bind(db.userId, event.external_id).first();
  if (existing) return { status: "already_scheduled", workout: { id: workout.id, name: workout.name }, date, externalId: event.external_id, intervalsEventId: existing.intervals_event_id || null };
  const response = await fetch("https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true", { method: "POST", headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify([event]) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Intervals.icu HTTP " + response.status);
  const first = Array.isArray(data) ? data[0] : data;
  if (!first?.id || first.category !== "WORKOUT") throw new Error("Intervals.icu nepotvrdilo vytvoření workoutu.");
  await db.prepare(`INSERT INTO workout_schedule_links(user_id,sport,workout_id,family,scheduled_date,environment,intervals_external_id,intervals_event_id,status) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,intervals_external_id) DO UPDATE SET intervals_event_id=excluded.intervals_event_id,status=excluded.status`)
    .bind(db.userId, sportOf(workout.sport), workout.id, workout.family || null, date, event.tags.includes("outdoor") ? "outdoor" : "indoor", event.external_id, String(first.id), "scheduled").run();
  return { status: "ok", workout: { id: workout.id, name: workout.name }, date, environment: event.tags.includes("outdoor") ? "outdoor" : "indoor", externalId: event.external_id, intervalsEventId: first.id };
}
