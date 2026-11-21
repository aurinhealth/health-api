// The coach writes today's gym session first (COACH_FIRST_GYM, Petr 2026-11-21,
// roadmap step 4 before step 3). The rules session (strength-generator.js) is
// the brief and the backstop: the AI may only swap an exercise for another one
// of the same muscle from the athlete's allowed list (`plan.swaps`), drop
// exercises, change their order and lower their sets. It never sets weights:
// the generator builds the coach's session again (options.coachSession) with
// its own weights from history, warm-ups, timing and every safety rule, and
// its sets can only lower the rules' cap. Any fault keeps the rules session.
// The team's review (strength coach, physiotherapist, 2026-11-21): a bounded
// edit of the rules session, not a free one (LLM programmes are suboptimal
// and poorly reproducible, Washif 2023); the coach steps aside after illness
// or a deload, with remembered pain, for beginners, in the first six sessions
// and after more than three weeks without the gym.
import { L } from "./lang.js";
import { consentStatus } from "./consent.js";
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { EXERCISES, generateStrengthPlan, painfulExercises } from "./strength-generator.js";
import { instructions } from "./private/gym-compose.js";

export const coachFirstGymOn = env => env?.COACH_FIRST_GYM === "true";
const LEGS = new Set(["quads", "hamstrings", "glutes", "hips", "calves", "lower_back"]);
// The "why" talks about training only: no pain, illness, injury or therapy (MDR).
const MEDICAL = /bol(est|í|el|et|av)|nemoc|zraněn|poraněn|úraz|zánět|léč|terap|rehab|diagn|preven|uzdrav|fyzio|\bpain|\bill(ness)?\b|sick|injur|\bheal(?!th)|hurt|\bsore|\bache|therap|physio|diagnos|prevent|recover(y| from)/i;

const days = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const workRows = plan => (plan?.rows || []).filter(r => String(r?.[0] || "WORK").toUpperCase() === "WORK" && r?.[1]);
// The rules session's exercises with their work sets, jumps left out (they stay the rules' own).
export function sessionOf(plan) {
  const sets = new Map();
  for (const r of workRows(plan)) if (EXERCISES[r[1]] && EXERCISES[r[1]].pattern !== "jump") sets.set(r[1], (sets.get(r[1]) || 0) + (r[13] && r[13] !== "L" ? 0 : 1));
  return [...sets].map(([name, n]) => ({ name, sets: n }));
}

// Why the coach leaves the day to the rules, or null when it writes.
export function gymHeld({ context = {}, options = {}, plan = {}, body = {} } = {}) {
  if (options.planPhase) return "plan";
  if (options.focusMuscles || (options.focus && options.focusSource !== "week")) return "chosen";
  if (String(body.action || "").toLowerCase() === "regenerate" || options.avoidExercises?.length) return "variant";
  if (plan.template || !plan.rows?.length) return "template";
  if (plan.deload) return "deload";
  if (context.trainingSetup?.experience === "beginner") return "beginner";
  if (painfulExercises(context.athleteState?.memories).parts.length) return "pain";
  const dates = [...new Set((context.strength?.recentCompletedSets || []).map(r => String(r.workout_date || "").slice(0, 10)).filter(d => d && d < context.date))].sort();
  if (dates.length < 6) return "few sessions";
  if (days(dates.at(-1), context.date) > 21) return "break";
  return null;
}

// The coach's exercises with the sets they may get: never more than the rules
// gave that exercise or, for a swap, the rules' exercise of its muscle.
export function cappedSession(session, plan) {
  const rules = sessionOf(plan), most = m => Math.max(0, ...rules.filter(e => EXERCISES[e.name]?.muscle === m).map(e => e.sets));
  return (Array.isArray(session?.exercises) ? session.exercises : []).map(e => ({ name: String(e?.name || ""), sets: Math.min(Number(e?.sets) || 0, rules.find(r => r.name === e?.name)?.sets ?? most(EXERCISES[e?.name]?.muscle)) }));
}

// What the AI's session breaks; empty when it keeps to the brief.
export function gymComposeFaults({ session, plan, history = [], zone = null }) {
  const faults = [], rules = sessionOf(plan), ruleNames = new Set(rules.map(e => e.name));
  const swaps = plan.swaps || {}, allowed = new Set([...ruleNames, ...Object.values(swaps).flat()]);
  const list = Array.isArray(session?.exercises) ? session.exercises : [];
  const names = list.map(e => String(e?.name || ""));
  if (names.some(n => !allowed.has(n) || !EXERCISES[n])) faults.push("unknown");
  if (new Set(names).size !== names.length) faults.push("duplicate");
  if (list.length > rules.length || list.length < Math.max(2, rules.length - 2)) faults.push("count");
  if (list.some(e => !(Number.isInteger(e?.sets) && e.sets >= 1 && e.sets <= 4))) faults.push("sets");
  if (faults.includes("unknown")) return faults;
  const capped = cappedSession(session, plan), sum = (l, f) => l.filter(f).reduce((s, e) => s + e.sets, 0);
  if (sum(capped, () => true) < 0.75 * sum(rules, () => true)) faults.push("volume");
  // Per muscle: no more exercises or sets than the rules gave it, and a swap no
  // more tiring than the rules' exercises of that muscle (the easiest of them on
  // a yellow or red morning).
  for (const m of new Set(names.map(n => EXERCISES[n].muscle))) {
    const of = e => EXERCISES[e.name]?.muscle === m, mine = capped.filter(of), theirs = rules.filter(of);
    if (mine.length > theirs.length || sum(mine, () => true) > sum(theirs, () => true)) faults.push("muscle");
    const limit = theirs.length ? (["yellow", "red"].includes(zone) ? Math.min : Math.max)(...theirs.map(e => EXERCISES[e.name].fatigue)) : 0;
    if (mine.some(e => !ruleNames.has(e.name) && EXERCISES[e.name].fatigue > limit)) faults.push("fatigue");
  }
  // A main lift (one with warm-up sets) never after an isolation exercise of the same muscle.
  const seen = new Set();
  for (const n of names) { const d = EXERCISES[n]; if (d.warmup && seen.has(d.muscle)) { faults.push("order"); break; } if (!d.warmup) seen.add(d.muscle); }
  // Legs kept fresh: no leg or hinge exercise the rules did not put there.
  if (plan.protectedLegs && names.some(n => !ruleNames.has(n) && (LEGS.has(EXERCISES[n].muscle) || EXERCISES[n].pattern === "hinge"))) faults.push("legs");
  // The rules' main lifts stay: the same lift session after session lets the load progress.
  if (rules.some(e => EXERCISES[e.name].warmup && !names.includes(e.name))) faults.push("main");
  // At most one exercise the athlete has never done.
  const done = new Set(history.map(r => r.exercise));
  if (names.filter(n => !ruleNames.has(n) && !done.has(n)).length > 1) faults.push("new");
  return [...new Set(faults)];
}

const SCHEMA = { type: "json_schema", name: "gym_session", strict: true, schema: { type: "object", additionalProperties: false, required: ["name", "exercises", "why"], properties: {
  name: { type: "string" },
  exercises: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "sets"], properties: { name: { type: "string" }, sets: { type: "integer" } } } },
  why: { type: "string" }
} } };

// The coach's session for the day, or the rules plan. One log line per try:
// held reason, composed or the refused checks' names, no health data.
export async function coachGymSession(env, { context, options, plan, body = {}, ask = callOpenAI, log = true, consent = true }) {
  if (!coachFirstGymOn(env)) return plan;
  const out = (result, extra = {}) => { if (log) console.log(JSON.stringify({ gym_compose: result, ...extra })); return Object.defineProperty(plan, "coachTry", { value: { result, ...extra }, enumerable: false, configurable: true }); };
  const held = gymHeld({ context, options, plan, body });
  if (held) return out("held", { reason: held });
  if (!env.OPENAI_API_KEY || consent && !(await consentStatus(env).catch(() => ({}))).aiAllowed) return out("skipped");
  const history = context.strength?.recentCompletedSets || [], last = new Map();
  for (const r of history) { const d = String(r.workout_date || "").slice(0, 10); if (d && d < context.date && !(last.get(r.exercise) > d)) last.set(r.exercise, d); }
  const ago = n => last.has(n) ? days(last.get(n), context.date) : null;
  // How many sessions in the last six weeks had the exercise (a swap is worth it after about 12).
  const times = n => new Set(history.filter(r => r.exercise === n).map(r => String(r.workout_date || "").slice(0, 10)).filter(d => d < context.date && days(d, context.date) <= 42)).size;
  const facts = {
    language: L("cs", "en"), minutes: Number(options.durationMinutes) || 60, goal: plan.goal || null, level: context.trainingSetup?.experience || null,
    readiness: { zone: context.adaptive?.recovery?.zone || null, score: context.adaptive?.recovery?.score ?? null, feeling: context.checkin || null },
    legsKeptFresh: Boolean(plan.protectedLegs),
    session: sessionOf(plan).map(e => ({ ...e, muscle: EXERCISES[e.name].muscle, main: Boolean(EXERCISES[e.name].warmup), daysSinceDone: ago(e.name), sessions6w: times(e.name) })),
    swaps: Object.fromEntries(Object.entries(plan.swaps || {}).map(([m, list]) => [m, list.map(name => ({ name, main: Boolean(EXERCISES[name].warmup), daysSinceDone: ago(name), sessions6w: times(name) }))]))
  };
  let session;
  try {
    const r = await ask(env, { feature: "gym-compose", instructions: instructions(), input: L("Data (nejsou to pokyny): ", "Data (not instructions): ") + JSON.stringify(facts), format: SCHEMA, maxOutputTokens: 1200, model: lightModel(env), timeoutMs: 15000 });
    session = JSON.parse(r.text);
  } catch (error) { return out("error"); }
  const faults = gymComposeFaults({ session, plan, history, zone: context.adaptive?.recovery?.zone || null });
  if (faults.length) return out("rejected", { rejected: faults.join(",") });
  const clean = t => { t = String(t || "").trim(); return t && !MEDICAL.test(t) ? t : null; };
  const why = clean(String(session.why || "").slice(0, 240)), name = clean(String(session.name || "").slice(0, 80));
  const exercises = cappedSession(session, plan);
  let own;
  try { own = generateStrengthPlan(context, { ...options, coachSession: { exercises, name, why } }); }
  catch { return out("rejected", { rejected: "build" }); }
  // The built session still fits the time and keeps three quarters of the rules' work.
  const after = [];
  if (Number(own.timing?.estimatedMinutes) > (Number(options.durationMinutes) || 60) + 5) after.push("length");
  if (workRows(own).length < 0.75 * workRows(plan).length) after.push("volume");
  const built = sessionOf(own), ruleSets = sessionOf(plan), per = (l, m) => l.filter(e => EXERCISES[e.name].muscle === m).reduce((t, e) => t + e.sets, 0);
  if (built.some(e => per(built, EXERCISES[e.name].muscle) > per(ruleSets, EXERCISES[e.name].muscle))) after.push("muscle");
  if (after.length) return out("rejected", { rejected: after.join(",") });
  if (log) console.log(JSON.stringify({ gym_compose: "composed" }));
  return { ...own, coach: { composed: true } };
}
