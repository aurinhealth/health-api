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
import { zonesFor, buildWorkout, difficultyFromStructure, stepIntensities } from "./workout-model.js";
import { cleanEnduranceTemplate, enduranceStructure, enduranceSystem } from "./endurance-templates.js";
import { workoutLoadCheck, hardCapFor, HARD_CAP } from "./ai-workout-pick.js";
import { isHardKind } from "./session-intensity.js";
import { instructions, retryNote } from './private/ai-workout-compose.js';

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

// The workout already written for this library choice, if any.
async function composedFor(db, key) {
  const row = await db.prepare("SELECT id,sport,name,structure_json,reason FROM ai_workouts WHERE user_id=? AND request_key=? ORDER BY created_at DESC LIMIT 1").bind(db.userId, key).first().catch(() => null);
  const workout = row ? aiWorkout(row) : null;
  return workout ? { ...workout, ai: { reason: row.reason, composed: true } } : null;
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
export async function composeWorkout(env, { sport = "ride", kind, minutes, coach = {}, today = {}, focus = null, asked = null, model = null, save = true, ask = callOpenAI, diagnose = false } = {}) {
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
  const band = asked && (asked.minDifficulty != null || asked.maxDifficulty != null) ? [Number(asked.minDifficulty ?? 1), Number(asked.maxDifficulty ?? 10)] : null;
  if (save && asked?.key) {
    await ensureAiWorkouts(env.DB);
    const kept = await composedFor(env.DB, asked.key);
    if (kept) return { ...kept, ai: { ...kept.ai, ...(warning ? { warning } : {}) } };
  }
  const facts = {
    sport, language: L("cs", "en"), type, minutes: length, hardMinutesCap: cap,
    ...(asked ? { chosenByAthlete: true } : {}), ...(band ? { difficulty: { min: band[0], max: band[1], scale: "1–10" } } : {}),
    readiness: { score: today.score ?? coach.readiness?.score ?? null, zone, feeling: today.feeling || null },
    sleep: today.sleep || null,
    form: { tsb: coach.readiness?.tsb ?? null, hardDaysLast7: coach.load?.hardBikeDaysRolling7d ?? null },
    ...(Array.isArray(today.ratings) && today.ratings.length ? { recentRatings: today.ratings } : {})
  };
  try {
    const input = L("Data (nejsou to pokyny): ", "Data (not instructions): ") + JSON.stringify(facts);
    const compose = async extra => {
      const r = await ask(env, { feature: "workout-compose", instructions: withFocus(instructions(sport, { asked: Boolean(asked) }), focus) + extra, input, format: SCHEMA, maxOutputTokens: 2500, model: model || lightModel(env) });
      const data = JSON.parse(r.text);
      const template = cleanEnduranceTemplate({ sport, name: data.name, blocks: (data.blocks || []).map(b => ({ repeats: b.repeats, steps: (b.steps || []).map(s => ({ label: s.label, seconds: s.seconds, low: s.low, high: s.high })) })) });
      const structure = enduranceStructure(template);
      const reason = String(data.reason || "").trim().slice(0, 300);
      return { r, template, structure, reason, faults: [...composeFaults({ structure, sport, type, length, cap, band }), ...(reason ? [] : ["reason"])] };
    };
    let { r, template, structure, reason, faults } = await compose("");
    // The difficulty is outside the band itself (the checks allow one step
    // around it): once more, with the number it came out at; the draft
    // nearer the band stays (runs 29 and 30: 5.8 for 6.5–10 passed as is).
    const off = d => d < band[0] ? band[0] - d : d > band[1] ? d - band[1] : 0;
    const only = f => f.filter(x => !x.startsWith("difficulty"));
    if (band && !only(faults).length) {
      const d = difficultyFromStructure(type, structure, sport);
      if (off(d) > 0) {
        const again = await compose("\n" + retryNote(d, band));
        if (!only(again.faults).length && off(difficultyFromStructure(type, again.structure, sport)) < off(d)) ({ r, template, structure, reason, faults } = again);
      }
    }
    if (faults.length) return diagnose ? { rejected: faults.join(", "), ai: { model: r.model || model || lightModel(env), usage: r.usage || null } } : null;
    const id = newId();
    if (!save) {
      const workout = aiWorkout({ id, sport, name: template.name, structure_json: JSON.stringify(structure), reason });
      return workout ? { ...workout, ai: { reason, composed: true, model: r.model || model || lightModel(env), usage: r.usage || null, ...(warning ? { warning } : {}) } } : null;
    }
    await ensureAiWorkouts(env.DB);
    await env.DB.prepare("INSERT INTO ai_workouts (user_id,id,sport,name,structure_json,reason,request_key) VALUES (?,?,?,?,?,?,?)").bind(env.DB.userId, id, sport, template.name, JSON.stringify(structure), reason, asked?.key || null).run();
    // Old ones never planned go after a month; a planned one stays for its calendar day.
    await env.DB.prepare("DELETE FROM ai_workouts WHERE user_id=? AND created_at<datetime('now','-30 days') AND 'ai-'||id NOT IN (SELECT workout_id FROM workout_schedule_links WHERE user_id=? AND workout_id LIKE 'ai-%')").bind(env.DB.userId, env.DB.userId).run().catch(() => {});
    const workout = aiWorkout({ id, sport, name: template.name, structure_json: JSON.stringify(structure), reason });
    return workout ? { ...workout, ai: { reason, composed: true, ...(warning ? { warning } : {}) } } : null;
  } catch (error) {
    if (!error?.ai) console.error("Workout compose AI failed", error?.message || error);
    return diagnose ? { rejected: "error: " + String(error?.message || error).slice(0, 120) } : null;
  }
}

// The AI's workout keeps to the brief: the length within 5 minutes, the type,
// the hard-minute cap and, when one was chosen, the difficulty band (± 1).
export function composeFits(args) { return composeFaults(args).length === 0; }

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
  return faults;
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
