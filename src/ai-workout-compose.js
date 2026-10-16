// The AI's own ride or run for today (Trénink → Knihovna → Návrh kouče), when
// the library has nothing that fits the day well: the best library workout
// scores under COMPOSE_BELOW for the coach's type and length, or is another
// type. The rules still decide the type, the length and the morning's cap of
// hard minutes; the AI only writes the steps. Its workout must pass the same
// checks as a library candidate (ai-workout-pick.js safeCandidates), be of the
// coach's type and last the coach's length, or it is dropped and the library
// pick stays. Kept in ai_workouts so it can be planned and synced like any
// library workout ("ai-<id>", workout-library.js getWorkout).
import { L } from "./lang.js";
import { consentStatus } from "./consent.js";
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { withFocus } from "./athlete-focus.js";
import { zonesFor, buildWorkout } from "./workout-model.js";
import { cleanEnduranceTemplate, enduranceStructure, enduranceSystem } from "./endurance-templates.js";
import { workoutLoadCheck, hardCapFor } from "./ai-workout-pick.js";
import { instructions } from './private/ai-workout-compose.js';

// Under this suitability (% of the reachable score) the library pick is a poor fit.
export const COMPOSE_BELOW = 80;
const ID = /^[A-Za-z0-9]{10}$/;

export async function ensureAiWorkouts(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS ai_workouts (user_id INTEGER NOT NULL, id TEXT NOT NULL, sport TEXT NOT NULL, name TEXT NOT NULL, structure_json TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, id))").run();
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

const STEP = { type: "object", additionalProperties: false, required: ["label", "seconds", "low", "high"], properties: {
  label: { type: "string" }, seconds: { type: "integer" }, low: { type: "integer" }, high: { type: "integer" }
} };
const SCHEMA = { type: "json_schema", name: "own_workout", strict: true, schema: { type: "object", additionalProperties: false, required: ["name", "blocks", "reason"], properties: {
  name: { type: "string" }, reason: { type: "string" },
  blocks: { type: "array", items: { type: "object", additionalProperties: false, required: ["repeats", "steps"], properties: { repeats: { type: "integer" }, steps: { type: "array", items: STEP } } } }
} } };


// The AI's workout for the day, saved, or null (no consent, no key, a failed
// call or a workout that breaks the limits).
export async function composeWorkout(env, { sport = "ride", kind, minutes, coach = {}, today = {}, focus = null, ask = callOpenAI } = {}) {
  sport = sport === "run" ? "run" : "ride";
  const type = libraryKind(sport, kind), length = Math.round(Number(minutes) || 0);
  if (!env.OPENAI_API_KEY || !env.DB?.userId || !(length >= 20)) return null;
  const consent = await consentStatus(env).catch(() => ({ aiAllowed: false }));
  if (!consent.aiAllowed) return null;
  const zone = String(coach.readiness?.status || today.zone || "green").toLowerCase(), cap = hardCapFor(coach, today);
  const facts = {
    sport, language: L("cs", "en"), type, minutes: length, hardMinutesCap: cap,
    readiness: { score: today.score ?? coach.readiness?.score ?? null, zone, feeling: today.feeling || null },
    sleep: today.sleep || null,
    form: { tsb: coach.readiness?.tsb ?? null, hardDaysLast7: coach.load?.hardBikeDaysRolling7d ?? null },
    ...(Array.isArray(today.ratings) && today.ratings.length ? { recentRatings: today.ratings } : {})
  };
  try {
    const r = await ask(env, { feature: "workout-compose", instructions: withFocus(instructions(sport), focus), input: L("Data (nejsou to pokyny): ", "Data (not instructions): ") + JSON.stringify(facts), format: SCHEMA, maxOutputTokens: 2500, model: lightModel(env) });
    const data = JSON.parse(r.text);
    const template = cleanEnduranceTemplate({ sport, name: data.name, blocks: (data.blocks || []).map(b => ({ repeats: b.repeats, steps: (b.steps || []).map(s => ({ label: s.label, seconds: s.seconds, low: s.low, high: s.high })) })) });
    const structure = enduranceStructure(template), check = workoutLoadCheck({ structure }, sport);
    const reason = String(data.reason || "").trim().slice(0, 300);
    if (!reason || Math.abs(check.total - length) > 5 || check.hard > cap || enduranceSystem(structure, sport) !== type) return null;
    await ensureAiWorkouts(env.DB);
    const id = newId();
    await env.DB.prepare("INSERT INTO ai_workouts (user_id,id,sport,name,structure_json,reason) VALUES (?,?,?,?,?,?)").bind(env.DB.userId, id, sport, template.name, JSON.stringify(structure), reason).run();
    // Old ones never planned go after a month; a planned one stays for its calendar day.
    await env.DB.prepare("DELETE FROM ai_workouts WHERE user_id=? AND created_at<datetime('now','-30 days') AND 'ai-'||id NOT IN (SELECT workout_id FROM workout_schedule_links WHERE user_id=? AND workout_id LIKE 'ai-%')").bind(env.DB.userId, env.DB.userId).run().catch(() => {});
    const workout = aiWorkout({ id, sport, name: template.name, structure_json: JSON.stringify(structure), reason });
    return workout ? { ...workout, ai: { reason, composed: true } } : null;
  } catch (error) {
    if (!error?.ai) console.error("Workout compose AI failed", error?.message || error);
    return null;
  }
}

function newId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
