// The AI's own ride or run for today (Trénink → Knihovna → Návrh kouče), when
// the library has nothing that fits the day well: the best library workout
// scores under COMPOSE_BELOW for the coach's type and length, or is another
// type. The rules still decide the type, the length and the morning's cap of
// hard minutes; the AI only writes the steps. Its workout must pass the same
// checks as a library candidate (ai-workout-pick.js safeCandidates), be of the
// coach's type and last the coach's length, or it is dropped and the library
// pick stays. Kept in ai_workouts so it can be planned and synced like any
// library workout ("ai-<id>", workout-library.js getWorkout).
// The library's search (Trénink → Knihovna) asks for one too when its filters
// leave fewer than COMPOSE_MATCHES workouts of the chosen type: then the
// athlete's own choice of type, length and difficulty is the brief (`asked`),
// readiness only adds a warning, and the same choice on the same day loads
// the workout already written instead of paying for another.
import { L } from "./lang.js";
import { consentStatus } from "./consent.js";
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { withFocus } from "./athlete-focus.js";
import { zonesFor, zoneOf, flattenSteps, buildWorkout, difficultyFromStructure, stepIntensities } from "./workout-model.js";
import { cleanEnduranceTemplate, enduranceStructure, enduranceSystem } from "./endurance-templates.js";
import { workoutLoadCheck, hardCapFor, HARD_CAP } from "./ai-workout-pick.js";
import { isHardKind } from "./session-intensity.js";
import { catalog, resizeWorkout } from "./workout-library.js";
import { instructions, secondTryNote } from './private/ai-workout-compose.js';

// Under this suitability (% of the reachable score) the library pick is a poor fit.
export const COMPOSE_BELOW = 80;
// Under this many workouts of the chosen type the library's search offers the AI's own.
export const COMPOSE_MATCHES = 3;
// How many other versions ("Jiný návrh") one choice may ask for in a day.
export const COMPOSE_VARIANTS = 3;
const ID = /^[A-Za-z0-9]{10}$/;

export async function ensureAiWorkouts(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_workouts (user_id INTEGER NOT NULL, id TEXT NOT NULL, sport TEXT NOT NULL, name TEXT NOT NULL, structure_json TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, id))").run();
  // The library search's choice the workout was written for (composeKey).
  await db.prepare("ALTER TABLE ai_workouts ADD COLUMN request_key TEXT").run().catch(() => {});
}

// Whether the library's search should offer the AI's own workout: fewer than
// COMPOSE_MATCHES of the chosen type (any type when none is chosen).
export function fewMatches(workouts = [], system = null) {
  return (workouts || []).filter(w => !system || w.primary_system === system).length < COMPOSE_MATCHES;
}

// The library choice a composed workout answers, for one day.
export function composeKey({ date, sport, environment, kind, minutes, minDifficulty = null, maxDifficulty = null, variant = 0 }) {
  return [date, sport, environment, kind, Math.round(Number(minutes) || 0), minDifficulty ?? "", maxDifficulty ?? "", Math.max(0, Math.min(COMPOSE_VARIANTS, Number(variant) || 0))].join("|");
}

// The library's type names as the coach's session kinds use them.
export function libraryKind(sport, kind) {
  const k = kind === "long_endurance" ? "endurance" : kind === "vo2" ? "vo2max" : kind || "endurance";
  return sport === "run" && k === "sweet_spot" ? "threshold" : k;
}

// Whether the library's pick is good enough for the day.
export function poorFit(workout, { sport = "ride", kind } = {}) {
  if (!workout) return true;
  return workout.primary_system !== libraryKind(sport, kind) || Number(workout.suitability ?? 100) < COMPOSE_BELOW;
}

function aiWorkout(row) {
  let structure = [];
  try { structure = JSON.parse(row.structure_json || "[]"); } catch { return null; }
  if (!structure.length) return null;
  const sport = row.sport === "run" ? "run" : "ride";
  return buildWorkout({ id: "ai-" + row.id, sport, name: row.name, system: enduranceSystem(structure, sport), structure, sourceName: L("Navrženo AI", "Designed by AI"), sourceKind: "ai", licenseNote: "", description: row.reason || "" });
}

export async function getAiWorkout(db, id) {
  if (!db?.userId || !ID.test(String(id || ""))) return null;
  await ensureAiWorkouts(db);
  const row = await db.prepare("SELECT id,sport,name,structure_json,reason FROM ai_workouts WHERE user_id=? AND id=?").bind(db.userId, String(id)).first().catch(() => null);
  return row ? aiWorkout(row) : null;
}

// A stored reason the model wrote, not the library fallback's "Z knihovny: …" (AI Act art. 50(2)).
const fromModel = reason => !/^(Z knihovny|From the library): /.test(String(reason || ""));

// The workout already written for this library choice, if any.
async function composedFor(db, key) {
  const row = await db.prepare("SELECT id,sport,name,structure_json,reason FROM ai_workouts WHERE user_id=? AND request_key=? ORDER BY created_at DESC LIMIT 1").bind(db.userId, key).first().catch(() => null);
  const workout = row ? aiWorkout(row) : null;
  return workout ? { ...workout, ai: { reason: row.reason, composed: true, ...(fromModel(row.reason) ? { aiGenerated: true } : {}) } } : null;
}

// One line when the athlete asked for a hard type on a morning the coach would keep easier.
export function composeWarning(kind, zone) {
  if (!isHardKind(kind) || zone === "green") return null;
  return zone === "red"
    ? L("Připravenost je dnes nízká, takhle těžký trénink tělo nejspíš nezvládne naplno.", "Readiness is low today; your body probably can't take a workout this hard in full.")
    : L("Připravenost je dnes střední, intervaly klidně zkrať, když nepůjdou.", "Readiness is moderate today; cut the intervals short if they don't go well.");
}

const STEP = { type: "object", additionalProperties: false, required: ["label", "seconds", "low", "high"], properties: {
  label: { type: "string" }, seconds: { type: "integer" }, low: { type: "integer" }, high: { type: "integer" }
} };
const SCHEMA = { type: "json_schema", name: "own_workout", strict: true, schema: { type: "object", additionalProperties: false, required: ["name", "blocks", "reason"], properties: {
  name: { type: "string" }, reason: { type: "string" },
  blocks: { type: "array", items: { type: "object", additionalProperties: false, required: ["repeats", "steps"], properties: { repeats: { type: "integer" }, steps: { type: "array", items: STEP } } } }
} } };


// The AI's workout for the day, saved, or null (no consent, no key, a failed
// call or a workout that breaks the limits).
// `asked`: the library search's choice ({ minDifficulty, maxDifficulty, key });
// `model` and `save: false` are for the coach evaluation (made-up data, nothing kept).
// `diagnose`: instead of null, return { rejected } naming the check the AI's
// workout failed (the coach evaluation). With a band, a workout whose only
// fault is a difficulty outside it is asked for once more with that number.
export async function composeWorkout(env, { sport = "ride", kind, minutes, coach = {}, today = {}, focus = null, asked = null, daily = null, model = null, save = true, ask = callOpenAI, diagnose = false, fallback = libraryFallback } = {}) {
  sport = sport === "run" ? "run" : "ride";
  const type = libraryKind(sport, kind), length = Math.round(Number(minutes) || 0);
  if (!env.OPENAI_API_KEY || (save && !env.DB?.userId) || !(length >= 20)) return null;
  if (save) {
    const consent = await consentStatus(env).catch(() => ({ aiAllowed: false }));
    if (!consent.aiAllowed) return null;
  }
  const zone = String(coach.readiness?.status || today.zone || "green").toLowerCase();
  // The athlete's own choice is the brief: the morning only adds a warning.
  const cap = asked ? Math.max(HARD_CAP.green, Math.round(length / 2)) : hardCapFor(coach, today), warning = asked ? composeWarning(type, zone) : null;
  const band = asked && (asked.minDifficulty != null || asked.maxDifficulty != null) ? [Number(asked.minDifficulty ?? 1), Number(asked.maxDifficulty ?? 10)] : daily?.band || null;
  if (save && asked?.key) {
    await ensureAiWorkouts(env.DB);
    const kept = await composedFor(env.DB, asked.key);
    if (kept) return { ...kept, ai: { ...kept.ai, ...(warning ? { warning } : {}) } };
  }
  const facts = {
    sport, language: L("cs", "en"), type, minutes: length, hardMinutesCap: cap,
    ...(asked ? { chosenByAthlete: true } : {}), ...(band ? { difficulty: { min: band[0], max: band[1], scale: "1–10" } } : {}),
    ...(daily?.experience ? { athleteLevel: daily.experience } : {}),
    readiness: { score: today.score ?? coach.readiness?.score ?? null, zone, feeling: today.feeling || null },
    sleep: today.sleep || null,
    form: { tsb: coach.readiness?.tsb ?? null, hardDaysLast7: coach.load?.hardBikeDaysRolling7d ?? null },
    ...(Array.isArray(today.ratings) && today.ratings.length ? { recentRatings: today.ratings } : {})
  };
  try {
    const input = L("Data (nejsou to pokyny): ", "Data (not instructions): ") + JSON.stringify(facts);
    const compose = async extra => {
      const r = await ask(env, { feature: "workout-compose", instructions: withFocus(instructions(sport, { asked: Boolean(asked), band: Boolean(band) }), focus) + extra, input, format: SCHEMA, maxOutputTokens: 2500, model: model || lightModel(env) });
      const data = JSON.parse(r.text);
      // A draft the editor's own rules refuse (a step under 30 % FTP, run 44
      // and 45, W01) is a failed check like the others: the second try and
      // the library still follow, instead of nothing for the athlete.
      let template, structure;
      try {
        template = cleanEnduranceTemplate({ sport, name: data.name, blocks: (data.blocks || []).map(b => ({ repeats: b.repeats, steps: (b.steps || []).map(s => ({ label: s.label, seconds: s.seconds, low: s.low, high: s.high })) })) });
        structure = enduranceStructure(template);
      } catch (error) {
        return { r, template: null, structure: [], reason: "", faults: ["invalid " + String(error?.message || error).slice(0, 120)] };
      }
      const reason = String(data.reason || "").trim().slice(0, 300);
      return { r, template, structure, reason, faults: [...composeFaults({ structure, sport, type, length, cap, band }), ...(reason ? [] : ["reason"])] };
    };
    let { r, template, structure, reason, faults } = await compose("");
    // A draft that fails a check, or whose difficulty is outside the band
    // itself (the checks allow one step around it), is asked for once more
    // with the reasons; the better draft stays. A second failure falls back
    // to a library workout that meets the brief (runs 25–30, W01 and W02).
    const strict = ({ structure: st, faults: f }) => {
      if (!band || !st.length) return f;
      const d = difficultyFromStructure(type, st, sport);
      return d < band[0] || d > band[1] ? [...f.filter(x => !x.startsWith("difficulty")), `difficulty ${d}`] : f;
    };
    let first = strict({ structure, faults });
    if (first.length) {
      const again = await compose("\n" + secondTryNote({ faults: first, length, cap, band, difficulty: difficultyFromStructure(type, structure, sport) }));
      const second = strict(again);
      if (second.length < first.length || (second.length === first.length && !again.faults.length && faults.length)) ({ r, template, structure, reason, faults } = again), first = second;
      if (first.length) {
        const library = fallback ? await fallback(env, { sport, type, length, cap, band }) : null;
        if (library) return { ...library, ai: { reason: library.ai.reason, fallback: true, composed: false, model: r.model || model || lightModel(env), usage: r.usage || null, tried: first.join(", "), ...(warning ? { warning } : {}) } };
      }
    }
    if (faults.length) return diagnose ? { rejected: faults.join(", "), ai: { model: r.model || model || lightModel(env), usage: r.usage || null } } : null;
    const id = newId();
    if (!save) {
      const workout = aiWorkout({ id, sport, name: template.name, structure_json: JSON.stringify(structure), reason });
      return workout ? { ...workout, ai: { reason, composed: true, aiGenerated: true, model: r.model || model || lightModel(env), usage: r.usage || null, ...(warning ? { warning } : {}) } } : null;
    }
    await ensureAiWorkouts(env.DB);
    await env.DB.prepare("INSERT INTO ai_workouts (user_id,id,sport,name,structure_json,reason,request_key) VALUES (?,?,?,?,?,?,?)").bind(env.DB.userId, id, sport, template.name, JSON.stringify(structure), reason, asked?.key || daily?.key || null).run();
    // Old ones never planned go after a month; a planned one stays for its calendar day.
    await env.DB.prepare("DELETE FROM ai_workouts WHERE user_id=? AND created_at<datetime('now','-30 days') AND 'ai-'||id NOT IN (SELECT workout_id FROM workout_schedule_links WHERE user_id=? AND workout_id LIKE 'ai-%')").bind(env.DB.userId, env.DB.userId).run().catch(() => {});
    const workout = aiWorkout({ id, sport, name: template.name, structure_json: JSON.stringify(structure), reason });
    return workout ? { ...workout, ai: { reason, composed: true, aiGenerated: true, ...(warning ? { warning } : {}) } } : null;
  } catch (error) {
    if (!error?.ai) console.error("Workout compose AI failed", error?.message || error);
    return diagnose ? { rejected: "error: " + String(error?.message || error).slice(0, 120) } : null;
  }
}

// Step 2 of the coach roadmap (Petr 2026-11-16, thread "Nechat kouče psát
// tréninky na míru"): with COACH_FIRST the AI writes today's ride or run
// first, the library stays the backstop. Only where the cycling and running
// coaches let it (/mnt/project-files/kouc-pise-prvni/): easy, tempo and sweet
// spot days for everyone with a threshold; harder types only for an
// experienced athlete on a green morning. A beginner or one returning after a
// break, a sick check-in, the plan's day, a ride over 120 min or a run over
// 90 min stay with the library. So do: a hard type the day after a hard
// session of either sport (hard/easy practice), a run longer than 1.1× the
// longest run of the last 30 days (Frandsen 2025) and a runner without a
// base: under 3 weeks in a row with 2+ runs, a break of 14+ days in the last
// 28, under 12 runs in 8 weeks or under 60 min in the last 7 days (our
// calibration, docs/methodology.md).
export const coachFirstOn = env => env?.COACH_FIRST === "true";
const COACH_FIRST_EASY = ["endurance", "long_endurance", "tempo", "sweet_spot", "recovery"];
const EASY_KINDS = ["endurance", "long_endurance", "recovery"];
export function runWithoutBase(b) {
  return !b || b.weeksWith2Runs < 3 || b.longestBreak28 >= 14 || b.runs8w < 12 || b.last7Minutes < 60;
}
export function coachFirst({ sport = "ride", kind, minutes, coach = {}, today = {}, experience = null, thresholds = {}, runBase = null } = {}) {
  const run = sport === "run", c = coach.constraints || {}, zone = String(coach.readiness?.status || today.zone || "green").toLowerCase();
  if (c.plannedToday) return "planned";
  if (c.novice) return "novice";
  if (c.returning) return "returning";
  if (today.feeling === "sick") return "sick";
  if (run ? !thresholds.runThresholdPace : !Number(thresholds.ftp)) return "no threshold";
  if (Number(minutes) > (run ? 90 : 120)) return "long";
  if (run && runWithoutBase(runBase)) return "run base";
  if (run && Number(minutes) > 1.1 * runBase.longestRun30) return "long";
  if (!EASY_KINDS.includes(kind) && c.lastHardDays != null && c.lastHardDays <= 1) return "hard yesterday";
  if (["race", "openers"].includes(kind)) return "race";
  if (!COACH_FIRST_EASY.includes(kind) && (experience !== "experienced" || zone !== "green")) return "hard type";
  return null;
}

// Today's proposal (Návrh kouče): the AI's own workout when the library's
// ranked pick fits the day poorly (poorFit). With no library fallback: a
// draft refused twice leaves `workout` null, so the ranked pick stays and
// aiWorkoutPick chooses among the safe candidates, instead of a library
// workout picked by its length alone. One log line per proposal counts how
// often poorFit fires and compose is refused: sport, type and the refused
// checks only, no health data.
// With COACH_FIRST (coachFirst lets it) the AI writes first whatever the fit,
// to the coach engine's target difficulty ± 0.75 (our calibration). No band on
// endurance and recovery days, where the difficulty follows the minutes alone,
// nor on a run sweet spot day, scored on the threshold scale.
// `key` and `defer` (the library's proposal, option A, Petr 2026-11-16): the
// coach's workout is written after the answer (defer = ctx.waitUntil) and kept
// under the key; the answer says pending and the library's pick shows until
// the app asks again. A failed or stale try leaves the library's pick.
export async function dailyOwnWorkout(env, pick, { sport = "ride", kind, log = true, experience = null, thresholds = {}, runBase = null, key = null, defer = null, ...opts } = {}) {
  const poor = poorFit(pick, { sport, kind });
  const held = coachFirstOn(env) ? coachFirst({ sport, kind, minutes: opts.minutes, coach: opts.coach, today: opts.today, experience, thresholds, runBase }) : "off";
  const first = held === null, target = Number(opts.coach?.recommendation?.progression?.targetDifficulty);
  const banded = !EASY_KINDS.includes(kind) && !(sport === "run" && kind === "sweet_spot");
  const band = first && banded && target > 0 ? [Math.max(1, Math.round((target - 0.75) * 10) / 10), Math.min(10, Math.round((target + 0.75) * 10) / 10)] : null;
  const compose = () => composeWorkout(env, { sport, kind, ...opts, ...(first ? { daily: { band, experience, ...(key && defer ? { key } : {}) } } : {}), diagnose: true, fallback: null });
  if (first && key && defer && env.DB?.userId && env.OPENAI_API_KEY && (await consentStatus(env).catch(() => ({}))).aiAllowed) {
    const state = await composeState(env.DB, key);
    if (state.workout) return { workout: state.workout, poorFit: poor, coachFirst: true, held: null, rejected: null };
    if (state.since && Date.now() - state.since < PENDING_MS) return { workout: null, poorFit: poor, coachFirst: true, held: null, rejected: null, pending: true };
    // Only the request that claims the key writes (two at once: one compose).
    if (!state.since && !state.failed) {
      if (!await markCompose(env.DB, key, sport, "pending")) return { workout: null, poorFit: poor, coachFirst: true, held: null, rejected: null, pending: true };
      defer(compose().then(r => r && !r.rejected ? r : markCompose(env.DB, key, sport, "failed").then(() => r)).then(r => logDaily(log, { poor, first, held, sport, kind, r }))
        .catch(error => console.error("Coach first compose", error?.message || error)));
      return { workout: null, poorFit: poor, coachFirst: true, held: null, rejected: null, pending: true };
    }
    // Failed or stale: the library's pick, without another AI call.
    return { workout: null, poorFit: poor, coachFirst: true, held: null, rejected: null, tried: true };
  }
  const r = poor || first ? await compose() : null;
  const rejected = r?.rejected || null, workout = r && !rejected ? r : null;
  logDaily(log, { poor, first, held, sport, kind, r });
  return { workout, poorFit: poor, coachFirst: first, held: held === "off" ? null : held, rejected };
}

function logDaily(log, { poor, first, held, sport, kind, r }) {
  const rejected = r?.rejected || null, workout = r && !rejected ? r : null;
  // Only the names of the refused checks ("hard", "length"): their numbers
  // (the hard-minute cap) would tell the morning's readiness, and an error's
  // text may quote the model.
  const error = Boolean(rejected?.startsWith("error:")), checks = rejected && !error ? [...new Set(rejected.split(", ").map(f => f.split(" ")[0]))].join(",") : null;
  if (log) console.log(JSON.stringify({ daily_compose: !poor && !first ? "library" : workout ? "composed" : error ? "error" : rejected ? "rejected" : "skipped", sport: sport === "run" ? "run" : "ride", type: libraryKind(sport, kind), ...(held !== "off" ? { coach_first: held ? "held" : "yes" } : {}), ...(checks ? { rejected: checks } : {}) }));
}

// The proposal's own workout under its key: the workout, a try still running
// (since, a row without steps named "pending") or a failed one.
export const PENDING_MS = 60000;
async function composeState(db, key) {
  await ensureAiWorkouts(db);
  const row = await db.prepare("SELECT id,sport,name,structure_json,reason,created_at FROM ai_workouts WHERE user_id=? AND request_key=? ORDER BY structure_json<>'[]' DESC, created_at DESC, rowid DESC LIMIT 1").bind(db.userId, key).first().catch(() => null);
  if (!row) return {};
  const workout = aiWorkout(row);
  if (workout) return { workout: { ...workout, ai: { reason: row.reason, composed: true, ...(fromModel(row.reason) ? { aiGenerated: true } : {}) } } };
  return row.name === "failed" ? { failed: true } : { since: Date.parse(String(row.created_at).replace(" ", "T") + "Z") || Date.now() };
}
// "pending" only while the key has no row yet: true when this request claimed it.
async function markCompose(db, key, sport, name) {
  const only = name === "pending" ? " WHERE NOT EXISTS (SELECT 1 FROM ai_workouts WHERE user_id=? AND request_key=?)" : "";
  const r = await db.prepare("INSERT INTO ai_workouts (user_id,id,sport,name,structure_json,reason,request_key) SELECT ?,?,?,?,?,?,?" + only).bind(db.userId, newId(), sport, name, "[]", null, key, ...(only ? [db.userId, key] : [])).run().catch(() => null);
  return Boolean(r?.meta?.changes ?? r?.changes);
}

// The AI's workout keeps to the brief: the length within 5 minutes, the type,
// the hard-minute cap and, when one was chosen, the difficulty band (± 1).
export function composeFits(args) { return composeFaults(args).length === 0; }

// The library workout of the brief's type nearest its length, with the
// difficulty inside the band itself, under the hard-minute cap and with its
// efforts apart, resized to the length; null when the library has none.
export async function libraryFallback(env, { sport = "ride", type, length, cap, band = null }) {
  const list = await catalog(env.DB, sport).catch(() => []);
  const aim = band ? band[0] + (band[1] - band[0]) / 3 : null;
  const fits = list.filter(w => w.primary_system === type).map(w => {
    const resized = resizeWorkout(w, length);
    let structure = [];
    try { structure = JSON.parse(resized.structure_json || "[]"); } catch { return null; }
    const d = Number(resized.difficulty);
    // A curated workout may run a surge straight after a tempo step, and a
    // shortened run keeps 8 min of warm-up; the other checks hold.
    if (composeFaults({ structure, sport, type, length, cap, band }).some(f => !f.startsWith("efforts") && !f.startsWith("warm-up")) || (band && (d < band[0] || d > band[1]))) return null;
    return { resized, score: Math.abs(Number(resized.duration_minutes) - length) + (aim == null ? 0 : Math.abs(d - aim)) };
  }).filter(Boolean).sort((a, b) => a.score - b.score);
  if (!fits.length) return null;
  const w = fits[0].resized;
  return { ...w, ai: { reason: L("Z knihovny: ", "From the library: ") + w.name } };
}

// The checks the workout failed, each with its number: "length 52 min", "hard 30 min over 22", "type endurance", "difficulty 5.7".
export function composeFaults({ structure, sport = "ride", type, length, cap, band = null }) {
  const check = workoutLoadCheck({ structure }, sport), faults = [];
  if (Math.abs(check.total - length) > 5) faults.push(`length ${Math.round(check.total)} min`);
  if (check.hard > cap) faults.push(`hard ${Math.round(check.hard)} min over ${cap}`);
  const system = enduranceSystem(structure, sport);
  if (system !== type) faults.push(`type ${system}`);
  if (band) {
    const d = difficultyFromStructure(type, structure, sport);
    if (!(d >= band[0] - 1 && d <= band[1] + 1)) faults.push(`difficulty ${d}`);
  }
  if (effortsBackToBack(structure, sport)) faults.push("efforts back to back");
  const work = workInZone(structure, sport, type);
  if (work != null && work < 0.6) faults.push(`zone ${Math.round(work * 100)} %`);
  if (["vo2max", "anaerobic"].includes(type) && shortRecoveries(structure, sport)) faults.push("recoveries under half the effort");
  const warm = HARD_TYPES.includes(type) ? warmupMinutes(structure, sport) : null;
  if (warm != null && warm < MIN_WARMUP) faults.push(`warm-up ${Math.round(warm)} min`);
  return faults;
}

// Of the minutes above easy riding or running (steps of 1 min and more), the
// share in the type's own zone (sweet spot 88–94 % FTP); null for an easy
// workout. At least 60 % is our calibration: every library ride and run but one
// passes it, 70 % would refuse 30 over-unders and the like (docs/methodology.md).
export function workInZone(structure = [], sport = "ride", type) {
  if (["endurance", "recovery"].includes(type)) return null;
  const zones = zonesFor(sport); let all = 0, own = 0, long = false, short = false;
  for (const s of flattenSteps(structure)) {
    if (s.rest) continue;
    const z = zoneOf(Number(s.power) || 50, zones), m = Number(s.durationMinutes) || 0;
    if (["recovery", "endurance"].includes(z)) continue;
    if (m < 1) { if (z === type) short = true; continue; }
    all += m; if (z === type) { own += m; long = true; }
  }
  // Only efforts under 1 min in the type's zone (30/30, sprints): not checked.
  return all > 0 && (long || !short) ? own / all : null;
}
// VO2max and anaerobic efforts of 2 min and more each followed by a recovery
// of at least half their length: any shorter one. Our calibration: 1:1 would
// refuse Helgerud's 4×4 min with 3 min and the library's 5×3 min runs with
// 2 min jogs (docs/methodology.md); 30/30 and 40/20 are short and exempt.
export function shortRecoveries(structure = [], sport = "ride") {
  const kinds = stepIntensities(structure, sport), flat = [];
  structure.forEach((block, i) => {
    const steps = Array.isArray(block.steps) ? block.steps : [block], list = Array.isArray(kinds[i]) ? kinds[i] : [kinds[i]];
    for (let k = 0; k < (Array.isArray(block.steps) ? Math.max(1, Number(block.repeats) || 1) : 1); k++) steps.forEach((st, j) => flat.push([list[j], Number(st.durationMinutes) || 0]));
  });
  return flat.some(([kind, m], i) => kind === "interval" && m >= 2 && flat[i + 1] && flat[i + 1][0] === "recovery" && flat[i + 1][1] < 0.5 * m - 0.01);
}

// A hard session starts after at least 10 easy minutes (the library's own
// VO2max rides have 15–18 with openers); Coach evaluation runs 35, 38 and 41
// let 7 min through, which only the prompt asked about.
export const MIN_WARMUP = 10;
const HARD_TYPES = ["threshold", "vo2max", "anaerobic", "sprint"];
// Minutes before the first effort (an "interval" step).
export function warmupMinutes(structure = [], sport = "ride") {
  const kinds = stepIntensities(structure, sport);
  let minutes = 0;
  for (const [i, block] of structure.entries()) {
    const steps = Array.isArray(block.steps) ? block.steps : [block], list = Array.isArray(kinds[i]) ? kinds[i] : [kinds[i]];
    for (let k = 0; k < (Array.isArray(block.steps) ? Math.max(1, Number(block.repeats) || 1) : 1); k++)
      for (const [j, st] of steps.entries()) { if (list[j] === "interval") return minutes; minutes += Number(st.durationMinutes) || 0; }
  }
  return minutes;
}

// Two efforts with no recovery between them: an effort as its own section
// right before the repeat, or a repeat that ends with an effort (Coach
// evaluation runs 27 and 28: 4 + 4×4 min VO2max, 8 + 2×8 min tempo).
export function effortsBackToBack(structure = [], sport = "ride") {
  const kinds = stepIntensities(structure, sport), flat = [];
  structure.forEach((block, i) => {
    const list = Array.isArray(kinds[i]) ? kinds[i] : [kinds[i]];
    for (let k = 0; k < (Array.isArray(block.steps) ? Math.max(1, Number(block.repeats) || 1) : 1); k++) flat.push(...list);
  });
  return flat.some((kind, i) => kind === "interval" && flat[i - 1] === "interval");
}

function newId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
