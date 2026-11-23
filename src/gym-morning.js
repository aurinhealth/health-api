// The coach writes a gym day of the week plan on its morning (Petr 2026-11-23,
// "Ráno v den tréninku"): the week plan builds its gym days days ahead, by the
// rules, without that morning's readiness. When the athlete opens the app on
// the day, the day's session as the week saved it is rebuilt by the rules with
// today's context (sets, weights) and the coach edits it within the same
// bounds as any other day (gym-compose.js). Only a session nobody has changed
// since the week saved it: its stored values must still be exactly the ones
// marked at saving (gym_coach_pending), and the write is conditional on them,
// so an edit, a swap or a logged set always wins. One try per day.
import { coachFirstGymOn, coachGymSession, sessionOf } from "./gym-compose.js";
import { generateStrengthPlan } from "./strength-generator.js";
import { readGymPlan, replaceStrengthPlanInDb } from "./gym-plan-store.js";
import { localToday } from "./user-time.js";

const ensure = db => db.prepare("CREATE TABLE IF NOT EXISTS gym_coach_pending (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, source_json TEXT NOT NULL, PRIMARY KEY (user_id, workout_date))").run();

// After the week plan saved a gym day for a later date, as the rules built it.
export async function markGymForMorning(env, date) {
  if (!coachFirstGymOn(env) || !(date > localToday())) return false;
  const plan = await readGymPlan(env.DB, date);
  if (!plan.stored) return false;
  await ensure(env.DB);
  await env.DB.prepare("INSERT INTO gym_coach_pending(user_id,workout_date,source_json) VALUES(?,?,?) ON CONFLICT(user_id,workout_date) DO UPDATE SET source_json=excluded.source_json").bind(env.USER_ID, date, JSON.stringify(plan.values)).run();
  return true;
}

// Today's marked session, edited by the coach. `build` makes the strength
// context (strength-context.js buildStrengthContext), `ask` the model call.
export async function coachMorningGym(env, { build, ask, date = localToday() } = {}) {
  if (!coachFirstGymOn(env)) return { result: "off" };
  // No table yet: nobody has saved a week day since this came out (made at marking).
  const mark = await env.DB.prepare("SELECT source_json FROM gym_coach_pending WHERE user_id=? AND workout_date=?").bind(env.USER_ID, date).first().catch(() => null);
  if (!mark) return { result: "none" };
  await env.DB.prepare("DELETE FROM gym_coach_pending WHERE user_id=? AND workout_date<=?").bind(env.USER_ID, date).run();
  const source = JSON.parse(mark.source_json), current = await readGymPlan(env.DB, date);
  if (!current.stored || JSON.stringify(current.values) !== mark.source_json) return { result: "changed" };
  const context = await build(env, date);
  if (context?.status !== "ok") return { result: "context" };
  const rows = source.slice(7), minutes = Number(source[4]?.[1]) || 60, name = String(source[2]?.[3] || "").trim() || null;
  const exercises = sessionOf({ rows });
  if (!exercises.length) return { result: "empty" };
  // The week's session rebuilt for this morning: the brief the coach edits.
  const options = { durationMinutes: minutes };
  const plan = generateStrengthPlan(context, { ...options, coachSession: { exercises, name, why: null } });
  const own = await coachGymSession(env, { context, options, plan, ...(ask ? { ask } : {}) });
  if (!own.coach?.composed) return { result: plan.coachTry?.result || "kept" };
  delete own.swaps;
  const saved = await replaceStrengthPlanInDb(env.DB, own, source);
  return { result: saved ? "composed" : "changed", plan: saved ? own : null };
}
