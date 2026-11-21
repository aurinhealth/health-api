import test from "node:test";
import assert from "node:assert/strict";
import { generateStrengthPlan, EXERCISES } from "../src/strength-generator.js";
import { coachGymSession, gymComposeFaults, gymHeld, sessionOf } from "../src/gym-compose.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const date = "2026-11-20";
const shift = n => new Date(Date.parse(date + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const history = (dates, names = ["DB bench press", "Low row", "Pivot leg press", "Cable curl"]) => dates.flatMap(d => names.map(exercise => ({ workout_date: d, exercise, actual_kg: 20, actual_reps: 8, set_no: 1 })));
const context = (extra = {}) => ({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: history([-16, -13, -10, -7, -5, -3].map(shift)), plannedSessions: [] }, athleteState: { status: "active", memories: [] }, trainingSetup: { experience: "regular" }, ...extra });
const env = () => ({ DB: scopedDb(createD1(), 1), USER_ID: 1, USER_IS_OWNER: true, OPENAI_API_KEY: "test", COACH_FIRST_GYM: "true" });
const answer = session => async () => ({ text: JSON.stringify(session) });
const options = { durationMinutes: 60 };

test("the coach steps aside for a plan, a chosen focus, a deload, beginners, pain, few sessions and a long break", () => {
  const ctx = context(), plan = generateStrengthPlan(ctx, options);
  assert.equal(gymHeld({ context: ctx, options, plan }), null);
  assert.equal(gymHeld({ context: ctx, options: { ...options, planPhase: { exercises: ["Low row"] } }, plan }), "plan");
  assert.equal(gymHeld({ context: ctx, options: { ...options, focusMuscles: ["back"] }, plan }), "chosen");
  assert.equal(gymHeld({ context: ctx, options: { ...options, focus: "upper", focusSource: "week" }, plan }), null, "the week's upper day is still the coach's");
  assert.equal(gymHeld({ context: ctx, options: { ...options, avoidExercises: ["Low row"] }, plan }), "variant");
  assert.equal(gymHeld({ context: ctx, options, plan: { ...plan, deload: { reason: "x" } } }), "deload");
  assert.equal(gymHeld({ context: context({ trainingSetup: { experience: "beginner" } }), options, plan }), "beginner");
  assert.equal(gymHeld({ context: context({ athleteState: { status: "active", memories: ["Bolí mě koleno při dřepech"] } }), options, plan }), "pain");
  assert.equal(gymHeld({ context: context({ strength: { recentCompletedSets: history([-5, -3].map(shift)) } }), options, plan }), "few sessions");
  assert.equal(gymHeld({ context: context({ strength: { recentCompletedSets: history([-60, -50, -40, -35, -30, -25].map(shift)) } }), options, plan }), "break");
});

test("the coach's session keeps to the rules' exercises, swaps, order, volume and spared legs", () => {
  const plan = generateStrengthPlan(context(), options), rules = sessionOf(plan);
  assert.ok(rules.length >= 3, "a rules session to edit");
  assert.deepEqual(gymComposeFaults({ session: { exercises: rules }, plan }), []);
  const swapMuscle = Object.keys(plan.swaps).find(m => plan.swaps[m].length && rules.some(e => EXERCISES[e.name].muscle === m && !EXERCISES[e.name].warmup)), from = rules.find(e => EXERCISES[e.name].muscle === swapMuscle && !EXERCISES[e.name].warmup);
  const swapped = rules.map(e => e === from ? { name: plan.swaps[swapMuscle][0], sets: e.sets } : e);
  assert.deepEqual(gymComposeFaults({ session: { exercises: swapped }, plan, history: [{ exercise: plan.swaps[swapMuscle][0] }] }), []);
  assert.deepEqual(gymComposeFaults({ session: { exercises: [...rules.slice(1), { name: "Made-up press", sets: 3 }] }, plan }), ["unknown"]);
  const main = rules.find(e => EXERCISES[e.name].warmup);
  if (main) assert.ok(gymComposeFaults({ session: { exercises: rules.filter(e => e !== main) }, plan }).includes("main"), "the rules' main lifts stay");
  assert.ok(gymComposeFaults({ session: { exercises: [...rules, rules[0]] }, plan }).includes("duplicate"));
  assert.deepEqual(gymComposeFaults({ session: { exercises: rules.map(e => ({ ...e, sets: 1 })) }, plan }), ["volume"]);
  assert.deepEqual(gymComposeFaults({ session: { exercises: rules.map(e => ({ ...e, sets: 5 })) }, plan }), ["sets"]);
  assert.ok(gymComposeFaults({ session: { exercises: rules.slice(0, 1) }, plan }).includes("count"));
  // A main lift after an isolation exercise of the same muscle.
  const fake = { rows: [["WORK", "Cable curl", "1"], ["WORK", "DB bench press", "1"], ["WORK", "Cable fly", "1"], ["WORK", "Low row", "1"]], swaps: {} };
  assert.ok(gymComposeFaults({ session: { exercises: [{ name: "Cable fly", sets: 1 }, { name: "DB bench press", sets: 1 }, { name: "Low row", sets: 1 }] }, plan: fake }).includes("order"));
  // Spared legs: no leg exercise the rules did not put there.
  const upper = { rows: [["WORK", "DB bench press", "1"], ["WORK", "Low row", "1"], ["WORK", "Cable curl", "1"]], swaps: { back: ["Barbell good morning"] }, protectedLegs: true };
  assert.ok(gymComposeFaults({ session: { exercises: [{ name: "DB bench press", sets: 1 }, { name: "Barbell good morning", sets: 1 }, { name: "Cable curl", sets: 1 }] }, plan: upper, history: [{ exercise: "Barbell good morning" }] }).includes("legs"));
});

test("the coach's session is built by the rules: its order, its fewer sets, never more sets or its own weights", async () => {
  const ctx = context(), plan = generateStrengthPlan(ctx, options), rules = sessionOf(plan);
  const mine = [...rules].reverse().sort((a, b) => Number(Boolean(EXERCISES[b.name].warmup)) - Number(Boolean(EXERCISES[a.name].warmup))).map((e, i) => ({ name: e.name, sets: i === rules.length - 1 ? Math.max(1, e.sets - 1) : 4 }));
  const own = await coachGymSession(env(), { context: ctx, options, plan, ask: answer({ name: "Coach day", exercises: mine, why: "Back and chest first while you are fresh." }), log: false });
  assert.equal(own.coach?.composed, true);
  assert.match(own.planName, /^Coach day/);
  assert.match(own.rationale, /^Back and chest first/);
  for (const e of sessionOf(own)) assert.ok(e.sets <= rules.find(r => r.name === e.name).sets, e.name + " never more sets than the rules");
  assert.ok(sessionOf(own).find(e => e.name === mine.at(-1).name).sets <= mine.at(-1).sets);
  const kg = p => Object.fromEntries(p.rows.filter(r => r[0] === "WORK").map(r => [r[1], r[3]]));
  for (const [name, w] of Object.entries(kg(own))) assert.equal(w, kg(plan)[name], name + " keeps the rules' weight");
});

test("a medical why is dropped, a refused or failed answer and the flag off keep the rules session", async () => {
  const ctx = context(), plan = generateStrengthPlan(ctx, options), rules = sessionOf(plan);
  const own = await coachGymSession(env(), { context: ctx, options, plan, ask: answer({ name: "Day", exercises: rules, why: "This will help your knee pain heal." }), log: false });
  assert.doesNotMatch(own.rationale, /knee|pain|heal/);
  assert.equal(await coachGymSession(env(), { context: ctx, options, plan, ask: answer({ name: "Day", exercises: [{ name: "Made-up press", sets: 3 }], why: "" }), log: false }), plan);
  assert.equal(await coachGymSession(env(), { context: ctx, options, plan, ask: async () => { throw new Error("timeout"); }, log: false }), plan);
  assert.equal(await coachGymSession({ ...env(), COACH_FIRST_GYM: undefined }, { context: ctx, options, plan, ask: answer({ name: "Day", exercises: rules, why: "" }), log: false }), plan);
  assert.equal(await coachGymSession({ ...env(), USER_IS_OWNER: false }, { context: ctx, options, plan, ask: answer({ name: "Day", exercises: rules, why: "" }), log: false }), plan, "no AI consent");
});

test("the eval's gym situations: the coach writes G01–G04 within the checks, G05–G06 leave the rules", async () => {
  const { COACH_EVAL_SCENARIOS, runGymScenario } = await import("../src/coach-eval.js");
  const ask = async (env, req) => { const f = JSON.parse(req.input.slice(req.input.indexOf("{"))); return { text: JSON.stringify({ name: "Coach day", exercises: f.session.map(e => ({ name: e.name, sets: e.sets })), why: "Upper body first." }) }; };
  for (const s of COACH_EVAL_SCENARIOS.filter(s => s.gym)) {
    const r = await runGymScenario({ OPENAI_API_KEY: "x" }, s, { ask });
    assert.ok(r.checks.every(c => c.ok), s.id + ": " + r.checks.filter(c => !c.ok).map(c => c.name).join(", "));
  }
});

test("review: no muscle gets more exercises or sets than the rules gave it, swaps no more tiring, a medical name is dropped", async () => {
  const ctx = context(), plan = generateStrengthPlan(ctx, options), rules = sessionOf(plan);
  // Two other muscles' slots filled with more of one muscle that has swaps.
  const m = Object.keys(plan.swaps).find(k => plan.swaps[k].length >= 2), keep = rules.filter(e => EXERCISES[e.name].muscle === m || EXERCISES[e.name].warmup);
  const piled = [...keep, ...plan.swaps[m].slice(0, rules.length - keep.length).map(name => ({ name, sets: 3 }))];
  assert.ok(gymComposeFaults({ session: { exercises: piled }, plan, history: plan.swaps[m].map(exercise => ({ exercise })) }).includes("muscle"));
  // A swap more tiring than every rules exercise of its muscle.
  const fake = { rows: [["WORK", "Cable curl", "1"], ["WORK", "Cable curl", "2"], ["WORK", "DB bench press", "1"], ["WORK", "Low row", "1"]], swaps: { biceps: ["Hammer curl"], back: ["Barbell good morning"] } };
  const heavy = Object.keys(EXERCISES).find(n => EXERCISES[n].muscle === "back" && EXERCISES[n].fatigue > EXERCISES["Low row"].fatigue);
  if (heavy) { fake.swaps.back = [heavy]; assert.ok(gymComposeFaults({ session: { exercises: [{ name: "DB bench press", sets: 1 }, { name: heavy, sets: 1 }, { name: "Cable curl", sets: 2 }] }, plan: fake, history: [{ exercise: heavy }] }).includes("fatigue")); }
  const own = await coachGymSession(env(), { context: ctx, options, plan, ask: answer({ name: "Rehab: šetříme koleno", exercises: rules, why: "Back first." }), log: false });
  assert.doesNotMatch(own.planName, /Rehab/);
  assert.match(own.rationale, /^Back first\./);
});
