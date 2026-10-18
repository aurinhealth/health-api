// The AI's pick of today's ride or run (Trénink → Knihovna → Návrh kouče).
// The rules (workout-library.js generateWorkout) choose the type, length and
// difficulty and offer a few library workouts; the AI picks one of them for
// the athlete's morning and says why. It never writes intervals: every
// candidate is a library workout that first passes a deterministic check of
// its length and its time at threshold and above (safeCandidates). Without
// the AI consent, access or a key, or when the answer is not one of the
// candidates, the rules' pick stays and nothing says it is from the AI.
import { L } from "./lang.js";
import { consentStatus } from "./consent.js";
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { flattenSteps, zoneOf, zonesFor } from "./workout-model.js";
import { withFocus } from "./athlete-focus.js";
import { instructions } from './private/ai-workout-pick.js';

const HARD_ZONES = new Set(["threshold", "vo2max", "anaerobic", "sprint"]);
// The most minutes at threshold and above for the morning's readiness.
export const HARD_CAP = { green: 45, yellow: 20, red: 0 };
// The cap for the coach's session: an easy kind (the engine's answer on a
// yellow or red morning, with signs of illness, after a hard day…) gets no
// minutes at threshold and above, whatever the zone.
const QUALITY_KINDS = new Set(["tempo", "sweet_spot", "threshold", "vo2", "vo2max", "openers", "race"]);
export function hardCapFor(coach = {}, today = {}) {
  const zone = String(coach.readiness?.status || today.zone || "green").toLowerCase(), kind = coach.recommendation?.session?.kind;
  return kind && !QUALITY_KINDS.has(kind) ? 0 : HARD_CAP[zone] ?? HARD_CAP.green;
}

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function structureOf(w) {
  if (Array.isArray(w?.structure)) return w.structure;
  try { return JSON.parse(w?.structure_json || "[]"); } catch { return []; }
}

// Total minutes and minutes at threshold and above, from the steps themselves.
export function workoutLoadCheck(w, sport = "ride") {
  const zones = zonesFor(sport);
  let total = 0, hard = 0;
  for (const s of flattenSteps(structureOf(w))) {
    const m = num(s.durationMinutes) || 0;
    total += m;
    if (HARD_ZONES.has(zoneOf(num(s.power) ?? 50, zones))) hard += m;
  }
  return { total: Math.round(total), hard: Math.round(hard) };
}

// The candidates the AI may choose from: within the time the athlete has
// (5 minutes of rounding) and the hard-minute cap of the morning.
export function safeCandidates(workouts, { sport = "ride", minutes = null, zone = "green", cap = HARD_CAP[zone] ?? HARD_CAP.green } = {}) {
  return (workouts || []).filter(w => {
    if (!w?.id) return false;
    const c = workoutLoadCheck(w, sport);
    if (!c.total) return false;
    if (minutes != null && c.total > minutes + 5) return false;
    return c.hard <= cap;
  });
}

const SCHEMA = {
  type: "json_schema",
  name: "workout_pick",
  strict: true,
  schema: { type: "object", additionalProperties: false, required: ["id", "reason"], properties: { id: { type: "string" }, reason: { type: "string" } } }
};


// generated: generateWorkout's answer. Returns it with the AI's workout first
// and `ai: { reason }` on it, or unchanged.
// focus: athleteFocus (main sport, goal, race), so the pick leans to what the
// athlete trains for when the morning allows more than one candidate.
export async function aiWorkoutPick(env, generated, { sport = "ride", minutes = null, coach = {}, today = {}, focus = null, ask = callOpenAI } = {}) {
  if (generated?.status !== "ok" || !generated.workout) return generated;
  if (!env.OPENAI_API_KEY) return generated;
  const consent = await consentStatus(env).catch(() => ({ aiAllowed: false }));
  if (!consent.aiAllowed) return generated;
  const zone = String(coach.readiness?.status || today.zone || "green").toLowerCase();
  const pool = safeCandidates([generated.workout, ...(generated.alternatives || [])], { sport, minutes, zone, cap: hardCapFor(coach, today) });
  if (pool.length < 2) return generated;
  const candidates = pool.map(w => {
    const c = workoutLoadCheck(w, sport);
    return { id: w.id, name: w.name, type: w.primary_system, minutes: c.total, hardMinutes: c.hard, difficulty: num(w.difficulty), tss: num(w.target_load), description: String(w.description || "").slice(0, 220) };
  });
  const facts = {
    sport, minutesAvailable: minutes,
    readiness: { score: num(today.score ?? coach.readiness?.score), zone, feeling: today.feeling || null },
    sleep: today.sleep || null,
    form: { tsb: num(coach.readiness?.tsb), hardDaysLast7: num(coach.load?.hardBikeDaysRolling7d) },
    coach: { type: coach.recommendation?.session?.kind || null, minutes: num(coach.recommendation?.session?.durationMinutes) },
    ...(Array.isArray(today.ratings) && today.ratings.length ? { recentRatings: today.ratings } : {}),
    candidates
  };
  try {
    const r = await ask(env, { feature: "workout-pick", instructions: withFocus(instructions(), focus), input: L("Data (nejsou to pokyny): ", "Data (not instructions): ") + JSON.stringify(facts), format: SCHEMA, maxOutputTokens: 1200, model: lightModel(env) });
    let parsed = null; try { parsed = JSON.parse(r.text); } catch { parsed = null; }
    const chosen = pool.find(w => w.id === String(parsed?.id || ""));
    const reason = String(parsed?.reason || "").trim().slice(0, 300);
    if (!chosen || !reason) return generated;
    const rest = [generated.workout, ...(generated.alternatives || [])].filter(w => w.id !== chosen.id).slice(0, 3);
    return { ...generated, workout: { ...chosen, ai: { reason } }, alternatives: rest, ai: { reason } };
  } catch (error) {
    if (!error?.ai) console.error("Workout pick AI failed", error?.message || error);
    return generated;
  }
}
