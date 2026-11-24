import test from "node:test";
import assert from "node:assert/strict";
import { generateStrengthPlan, EXERCISES } from "../src/strength-generator.js";
import { sessionOf } from "../src/gym-compose.js";
import { markGymForMorning, coachMorningGym } from "../src/gym-morning.js";
import { readGymPlan, writeStrengthPlanToDb, saveGymPlan } from "../src/gym-plan-store.js";
import { localToday } from "../src/user-time.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const date = new Date(Date.parse(localToday() + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
const shift = n => new Date(Date.parse(date + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const history = [-16, -13, -10, -7, -5, -3].map(shift).flatMap(d => ["DB bench press", "Low row", "Pivot leg press", "Cable curl"].map(exercise => ({ workout_date: d, exercise, actual_kg: 20, actual_reps: 8, set_no: 1 })));
const context = () => ({ status: "ok", date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: history, plannedSessions: [] }, athleteState: { status: "active", memories: [] }, trainingSetup: { experience: "regular" } });
const setup = async () => {
  const env = { DB: scopedDb(createD1(), 1), USER_ID: 1, USER_IS_OWNER: true, OPENAI_API_KEY: "test", COACH_FIRST_GYM: "true" };
  const week = generateStrengthPlan(context(), { durationMinutes: 60 });
  await writeStrengthPlanToDb(env.DB, week);
  return { env, week };
};
// The coach keeps the exercises and drops a set of the last one.
const ask = async (env, req) => { const f = JSON.parse(req.input.slice(req.input.indexOf("{"))); return { text: JSON.stringify({ name: "Coach day", exercises: f.session.map((e, i, a) => ({ name: e.name, sets: i === a.length - 1 ? Math.max(1, e.sets - 1) : e.sets })), why: "Back first today." }) }; };

test("a week day saved as the rules built it is written by the coach on its morning, once", async () => {
  const { env, week } = await setup();
  assert.equal(await markGymForMorning(env, date), true);
  const r = await coachMorningGym(env, { build: async () => context(), ask, date });
  assert.equal(r.result, "composed");
  const saved = await readGymPlan(env.DB, date);
  assert.match(saved.values[2][3], /^Coach day/);
  assert.match(saved.values[3][1], /^Back first today\./);
  const names = new Set(sessionOf({ rows: saved.values.slice(7) }).map(e => e.name));
  for (const e of sessionOf(week)) assert.ok(names.has(e.name) || names.has(EXERCISES[e.name]?.variantOf), e.name);
  assert.equal((await coachMorningGym(env, { build: async () => context(), ask, date })).result, "none", "one try per day");
});

test("a changed day, no mark or the flag off keep the week's session", async () => {
  const { env, week } = await setup();
  await markGymForMorning(env, date);
  const stored = await readGymPlan(env.DB, date), edited = stored.values.map(r => [...r]);
  edited[7][3] = "99";
  await saveGymPlan(env.DB, date, edited);
  assert.equal((await coachMorningGym(env, { build: async () => context(), ask, date })).result, "changed");
  assert.equal((await readGymPlan(env.DB, date)).values[7][3], "99");
  const other = await setup();
  assert.equal((await coachMorningGym(other.env, { build: async () => context(), ask, date })).result, "none");
  assert.equal(await markGymForMorning({ ...other.env, COACH_FIRST_GYM: undefined }, date), false);
  assert.equal(await markGymForMorning(other.env, localToday()), false, "only a later day");
  assert.ok(week.rows.length);
});

test("two requests at the same moment run the coach once (audit 2026-11-24)", async () => {
  const { env } = await setup();
  await markGymForMorning(env, date);
  let asked = 0;
  const once = async (e, req) => { asked++; return ask(e, req); };
  const results = await Promise.all([1, 2, 3].map(() => coachMorningGym(env, { build: async () => context(), ask: once, date })));
  assert.equal(results.filter(r => r.result === "none").length, 2);
  assert.equal(asked, 1);
});
