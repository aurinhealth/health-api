import {trainingSetup} from './onboarding.js';
import {storeLocalEvent,syncLocalWorkout,ensureLocalWorkouts} from './local-workouts.js';
// Adaptive workout library: the shared catalog (built-in workouts plus any
// rows in workout_library), per-user capability progression, ranking, "generate a
// workout for this day" and scheduling to the user's Intervals.icu calendar.
// Every query on personal tables filters by db.userId (see tenancy.js).
import { renderForEnvironment, buildWorkout, totalMinutes, step, n, clamp } from "./workout-model.js";
import { CYCLING_WORKOUTS } from "./cycling-workouts.js";
import { RUNNING_WORKOUTS } from "./running-workouts.js";
import { explainWorkout, stepRows } from "./workout-explanation.js";
import { getAthleteState, assertTrainingAllowed } from './athlete-state.js';
import { intervalsAuthorization } from "./intervals-auth.js";

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
  // "<id>~<minutes>": a workout resized to another length (see resizeWorkout).
  const resized = String(id).match(/^(.+)~(\d{2,3})$/);
  if (resized) { const base = await getWorkout(db, resized[1]); return base ? resizeWorkout(base, Number(resized[2])) : null; }
  await ensureTrainingTables(db);
  return db.prepare("SELECT * FROM workout_library WHERE id=?").bind(String(id)).first();
}

export async function getCapabilities(db, sport = "ride") {
  await ensureTrainingTables(db);
  const rows = await db.prepare("SELECT * FROM training_capabilities WHERE user_id=? AND sport=?").bind(db.userId, sport).all();
  const training=await trainingSetup(db),defaults=defaultCapabilities(sport);
  if(training.experience)for(const value of Object.values(defaults))value.level=training.experience==='beginner'?1:training.experience==='experienced'?4:3;
  return { ...defaults, ...Object.fromEntries((rows.results || []).map(x => [x.system, x])) };
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
  // A soft length (the coach's suggestion) only ranks; nothing is filtered out by length.
  const softDuration = filters.durationSoft === true && duration != null, durationScale = softDuration ? Math.max(30, duration * .6) : durationTolerance;
  const targetLoad = n(filters.targetLoad), loadTolerance = n(filters.loadTolerance, 35), maxDifficulty = n(filters.maxDifficulty);
  const readiness = String(context.readiness || "green").toLowerCase(), hardDays = n(context.hardBikeDaysRolling7d, 0), phase = String(context.phase || "").toLowerCase();
  const recentFamilies = new Set(context.recentFamilies || []);
  const source = filters.source ? String(filters.source) : null;
  const preferred = !system && filters.preferredSystem ? String(filters.preferredSystem) : null;
  const reachable = 25 + (system ? 25 : preferred ? 15 : 0) + (duration != null ? 20 : 0) + (targetLoad != null ? 12 : 0) + 18;
  return workouts.filter(w => (!system || w.primary_system === system || w.secondary_system === system)
    && (duration == null || softDuration || Math.abs(n(w.duration_minutes, 0) - duration) <= durationTolerance)
    && (maxDifficulty == null || n(w.difficulty, 99) <= maxDifficulty)
    && (filters.environment !== "outdoor" || !n(w.indoor_only, 0))
    && (!source || w.source_kind === source)).map(w => {
    let score = 25; const reasons = [];
    if (system) {
      if (w.primary_system === system) { score += 25; reasons.push("přesný tréninkový systém"); }
      else { score += 4; reasons.push("sekundární zásah cílového systému"); }
    }
    if (preferred && w.primary_system === preferred) { score += 15; reasons.push("typ, který trenér na dnešek doporučuje"); }
    if (duration != null) {
      const diff = Math.abs(n(w.duration_minutes, 0) - duration), fit = clamp(1 - diff / Math.max(durationScale, 1), 0, 1);
      score += 20 * fit; if (diff <= 5) reasons.push(softDuration ? "délka, kterou trenér pro dnešek doporučuje" : "téměř přesná délka"); else if (!softDuration) reasons.push("délka v toleranci");
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
    // The points available depend on the filters in use (no type or load
    // filter = fewer points), so the score is a share of the reachable maximum.
    return { ...w, suitability: Math.round(clamp(score / reachable * 100, 0, 100)), score_points: Math.round(score), capability_level: n(capability.level, 3), challenge_gap: Math.round((n(w.difficulty, 5) - n(capability.level, 3)) * 10) / 10, reasons };
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
export async function generateWorkout(db, { sport = "ride", environment = "indoor", date, coach = {}, availabilityMinutes = null, variant = 0, thresholds = {}, workoutId = null, resizeTo = null } = {}) {
  if (workoutId && resizeTo) return resizeGenerated(db, { sport, environment, date, coach, thresholds, workoutId, resizeTo });
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
  // A beginning runner starts with run/walk when the session is easy.
  if (sport === "run" && coach.constraints?.novice && ["endurance", "recovery"].includes(kind)) distinct.sort((a, b) => (b.family === "run-walk") - (a.family === "run-walk"));
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

// ---- Changing the length of a workout --------------------------------------
// The main set stays; the aerobic part around it grows or shrinks. Only when
// that is not enough are repetitions removed, then warm-up and cool-down trimmed.
const EASY_BELOW = { ride: 76, run: 89 };
export function resizeStructure(structure = [], target, { sport = "ride", system = "endurance" } = {}) {
  const run = sport === "run", s = JSON.parse(JSON.stringify(structure)), notes = [];
  const easy = b => !b.steps && n(b.power, 0) < EASY_BELOW[run ? "run" : "ride"] && !b.free;
  const aerobic = run ? 82 : 65, wholeEasy = ["recovery", "endurance"].includes(system);
  const fillers = () => s.map((b, i) => i > 0 && i < s.length - 1 && easy(b) ? i : -1).filter(i => i >= 0);
  const round1 = x => Math.round(x * 10) / 10;
  // Run/walk changes length by its run/walk cycles: a beginner does not get continuous jogging.
  const cycle = run && wholeEasy ? s.find(b => b.steps && b.steps.some(x => n(x.power, 100) < 60)) : null;
  if (cycle) {
    const per = totalMinutes([{ ...cycle, repeats: 1 }]), before = n(cycle.repeats, 1);
    cycle.repeats = Math.max(1, before + Math.round((target - totalMinutes(s)) / per));
    if (cycle.repeats !== before) notes.push("úseků běhu s chůzí " + before + " → " + cycle.repeats);
    return { structure: s, notes };
  }
  let delta = target - totalMinutes(s);
  if (delta > 0) {
    const f = fillers();
    if (f.length && (wholeEasy || delta < 30)) {
      const sum = f.reduce((x, i) => x + n(s[i].durationMinutes, 0), 0) || 1;
      f.forEach(i => { s[i].durationMinutes = round1(n(s[i].durationMinutes, 0) + delta * n(s[i].durationMinutes, 0) / sum); });
      notes.push(wholeEasy ? "prodloužená aerobní část" : "delší aerobní část kolem hlavní série");
    } else {
      // Long sessions put the quality after a first aerobic block, like a real ride.
      const firstSet = s.findIndex((b, i) => i > 0 && !easy(b));
      const before = delta >= 30 && firstSet > 0 ? Math.round(delta / 2) : 0;
      if (before) s.splice(firstSet, 0, step(before, aerobic, null, run ? "lehce" : "aerobní blok"));
      s.splice(s.length - 1, 0, step(round1(delta - before), aerobic, null, run ? "volný klus" : "aerobní dojezd"));
      notes.push(before ? "aerobní blok před hlavní sérií a dojezd po ní" : "aerobní dojezd po hlavní sérii");
    }
  } else if (delta < 0) {
    let cut = -delta;
    for (const i of fillers().sort((a, b) => n(s[b].durationMinutes, 0) - n(s[a].durationMinutes, 0))) {
      const take = Math.min(cut, n(s[i].durationMinutes, 0));
      s[i].durationMinutes = round1(n(s[i].durationMinutes, 0) - take); cut -= take;
      if (cut <= 0) break;
    }
    if (-delta - cut > 0) notes.push("kratší aerobní část");
    for (let i = s.length - 1; i >= 0; i--) if (!s[i].steps && n(s[i].durationMinutes, 0) < (wholeEasy ? 1 : 3) && i > 0 && i < s.length - 1 && easy(s[i])) s.splice(i, 1);
    // Trim warm-up and cool-down down to a minimum, then the repetitions.
    for (const [i, min] of [[0, run ? 8 : 10], [s.length - 1, 5]]) {
      if (cut <= .5 || !s[i] || s[i].steps) continue;
      const take = Math.min(cut, Math.max(0, n(s[i].durationMinutes, 0) - min));
      if (take > 0) { s[i].durationMinutes = round1(n(s[i].durationMinutes, 0) - take); cut -= take; notes.push(i === 0 ? "kratší rozjetí" : "kratší vyjetí"); }
    }
    // Fewer repetitions of the biggest set, never below one.
    let repsFrom = null, repsTo = null;
    while (cut > .5) {
      const blocks = s.filter(b => b.steps && n(b.repeats, 1) > 1);
      if (!blocks.length) break;
      const b = blocks.reduce((a, x) => n(x.repeats, 1) > n(a.repeats, 1) ? x : a);
      const per = totalMinutes([{ ...b, repeats: 1 }]);
      if (per > cut + per / 2 && n(b.repeats, 1) <= 2) break;
      repsFrom ??= b.repeats; b.repeats -= 1; repsTo = b.repeats; cut -= per;
    }
    if (repsFrom != null) notes.push("méně opakování (" + repsFrom + " → " + repsTo + ")");
    // Removing a repetition can overshoot: give the rest back as easy riding.
    if (cut < -.5) s.splice(s.length - 1, 0, step(round1(-cut), aerobic, null, run ? "volný klus" : "aerobní dojezd"));
  }
  return { structure: s, notes: [...new Set(notes)] };
}

// The same workout at another length. A library sibling (same family and
// main set) is used when it has the length already; otherwise the structure
// is resized and the workout gets the id "<id>~<minutes>".
export function resizeWorkout(base, minutes) {
  const sport = sportOf(base.sport), run = sport === "run";
  const target = Math.round(clamp(n(minutes, n(base.duration_minutes, 60)), run ? 20 : 30, run ? 240 : 360));
  if (Math.abs(target - n(base.duration_minutes, 0)) <= 1) return base;
  const prefix = String(base.id).replace(/-\d+$/, "");
  const sibling = (BUILT_IN[sport] || []).find(w => w.family === base.family && w.id !== base.id && String(w.id).replace(/-\d+$/, "") === prefix && Math.abs(n(w.duration_minutes, 0) - target) <= 2);
  if (sibling) return { ...sibling, resize_notes: [(["recovery", "endurance"].includes(base.primary_system) ? "stejný typ jízdy" : "stejná hlavní série") + " v délce " + sibling.duration_minutes + " min z knihovny"] };
  let structure = [];
  try { structure = JSON.parse(base.structure_json || "[]"); } catch {}
  const resized = resizeStructure(structure, target, { sport, system: base.primary_system });
  let tags = [];
  try { tags = JSON.parse(base.tags_json || "[]"); } catch {}
  const built = buildWorkout({
    id: base.id + "~" + target, sport, name: String(base.name).replace(/ · \d+ min$/, "") + " · " + target + " min",
    system: base.primary_system, secondarySystem: base.secondary_system, structure: resized.structure, family: base.family, level: base.level,
    sourceName: base.source_name, sourceKind: base.source_kind, sourceUrl: base.source_url, licenseNote: base.license_note, attribution: base.attribution, citation: base.citation,
    description: base.description, tags: tags.filter(t => !/^\d+min$/.test(t)).concat(target + "min"), cadence: base.cadence, indoorOnly: Boolean(n(base.indoor_only, 0))
  });
  return { ...built, verified: base.verified, resized_from: base.id, resize_notes: resized.notes };
}

// "Změnit délku": the proposal stays, only its length changes.
async function resizeGenerated(db, { sport, environment, date, coach, thresholds, workoutId, resizeTo }) {
  sport = sportOf(sport);
  const base = await getWorkout(db, String(workoutId).replace(/~\d+$/, ""));
  if (!base) return { status: "empty", message: "Původní trénink jsem nenašel – vygeneruj nový." };
  let resized = resizeWorkout(base, resizeTo);
  // Outdoor rendering can lengthen the warm-up; correct once so the ridden length matches.
  const drift = renderForEnvironment(resized, environmentOf(environment)).duration_minutes - Math.round(resizeTo);
  if (Math.abs(drift) >= 2) resized = resizeWorkout(base, Math.round(resizeTo) - drift);
  const context = { readiness: coach.readiness?.status || "green", hardBikeDaysRolling7d: coach.load?.hardBikeDaysRolling7d ?? 0, targetDifficulty: coach.recommendation?.progression?.targetDifficulty };
  const capabilities = await getCapabilities(db, sport);
  const [ranked] = rankWorkoutCandidates([resized], { environment: environmentOf(environment) }, context, capabilities);
  const pick = renderForEnvironment({ ...resized, ...ranked, resize_notes: resized.resize_notes }, environmentOf(environment));
  const plannedToday = coach.constraints?.plannedToday;
  const planned = plannedToday?.system ? { name: plannedToday.name, minutes: plannedToday.minutes, system: plannedToday.system, intensityFactor: plannedToday.intensityFactor, structure: plannedToday.structure } : null;
  const explanation = explainWorkout(pick, { coach, environment: pick.environment, thresholds, planned, sport });
  if (resized.id !== base.id) explanation.why = ["Délku jsem změnil z " + base.duration_minutes + " na " + pick.duration_minutes + " min – princip tréninku zůstává" + (resized.resize_notes?.length ? ": " + resized.resize_notes.join(", ") : "") + ".", ...explanation.why.filter(x => !/^Délka \d+ min:/.test(x))];
  return {
    status: "ok", sport, environment: pick.environment, date, system: pick.primary_system, durationMinutes: pick.duration_minutes, resizedFrom: base.id,
    readiness: coach.readiness || null, progression: coach.recommendation?.progression || null, adaptations: coach.recommendation?.adaptations || [],
    workout: pick, alternatives: [], variantCount: 1, explanation
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
    (SELECT f.id FROM workout_feedback f WHERE f.user_id=l.user_id AND f.workout_id=l.workout_id AND f.scheduled_date=l.scheduled_date AND f.survey<>'auto_completed' ORDER BY f.id DESC LIMIT 1) AS feedback_id,
    (SELECT f.rpe FROM workout_feedback f WHERE f.user_id=l.user_id AND f.workout_id=l.workout_id AND f.scheduled_date=l.scheduled_date AND f.survey<>'auto_completed' ORDER BY f.id DESC LIMIT 1) AS feedback_rpe,
    (SELECT f.completed_percent FROM workout_feedback f WHERE f.user_id=l.user_id AND f.workout_id=l.workout_id AND f.scheduled_date=l.scheduled_date ORDER BY f.id DESC LIMIT 1) AS completed_percent
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
// One scheduled workout with its library name and length.
export async function scheduledLink(db, workoutId, date) {
  await ensureTrainingTables(db);
  const row = await db.prepare("SELECT id,workout_id,scheduled_date,intervals_event_id FROM workout_schedule_links WHERE user_id=? AND workout_id=? AND scheduled_date=? LIMIT 1").bind(db.userId, String(workoutId || ""), String(date || "")).first();
  const w = row ? await getWorkout(db, row.workout_id) : null;
  return row && w ? { ...row, name: w.name, duration_minutes: w.duration_minutes } : null;
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
  if (confirm !== true) throw new Error("Uložení tréninku vyžaduje potvrzení.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("Neplatné datum.");
  const workout = await getWorkout(db, workoutId); if (!workout) throw new Error("Workout nebyl nalezen.");
  assertTrainingAllowed(await getAthleteState(db));
  // Confirmation saves the athlete's choice, including replacements and chat
  // proposals. Availability limits belong to generation, never to this write.
  await ensureTrainingTables(db);
  await ensureLocalWorkouts(db);
  const event = buildIntervalsEvent(workout, date, environmentOf(environment));
  const existing = await db.prepare("SELECT intervals_event_id,status FROM workout_schedule_links WHERE user_id=? AND intervals_external_id=?").bind(db.userId, event.external_id).first();
  if (existing) return { sync: await syncLocalWorkout({...env,DB:db},existing.intervals_event_id), status: "already_scheduled", workout: { id: workout.id, name: workout.name }, date, externalId: event.external_id, intervalsEventId: existing.intervals_event_id || null };
  const rendered=renderForEnvironment(workout,environmentOf(environment));
  event.moving_time=Math.round(rendered.duration_minutes*60);event.icu_training_load=event.load_target;
  const local=await storeLocalEvent(db,event);
  await db.prepare(`INSERT INTO workout_schedule_links(user_id,sport,workout_id,family,scheduled_date,environment,intervals_external_id,intervals_event_id,status) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,intervals_external_id) DO NOTHING`)
    .bind(db.userId,sportOf(workout.sport),workout.id,workout.family||null,date,rendered.environment,event.external_id,local.id,'scheduled').run();
  const sync=await syncLocalWorkout({...env,DB:db},local.id);
  return {status:'ok',workout:{id:workout.id,name:workout.name},date,environment:rendered.environment,externalId:event.external_id,intervalsEventId:sync.eventId||null,eventId:'planned:'+local.id,sync};
}
