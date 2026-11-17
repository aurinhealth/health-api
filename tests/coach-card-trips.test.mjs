// The coach's cards (check-in, week check, revision) read what does not wait
// on anything side by side, so their reads share database trips (d1-batch.js)
// instead of following each other (morning report 2026-11-14).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { recentWorkoutFeedback } from "../src/library-workouts.js";
import { catalog } from "../src/workout-library.js";

const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
const route = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

test("the cards start the athlete's state with their other first reads", () => {
  assert.match(route("if(url.pathname==='/app/api/coach/check-in'", "if(url.pathname==='/app/api/coach/nudge'"),
    /\[state,inputs\]=await Promise\.all\(\[getAthleteState\(env\.DB\),loadCoachInputs\(/);
  const week = route("if(url.pathname==='/app/api/coach/week-check'", "if(url.pathname==='/app/api/coach/week-check/draft'");
  assert.match(week, /\[athlete,stored\]=await Promise\.all\(\[getAthleteState\(env\.DB\)\.catch\(\(\)=>null\),readWeekCheck\(env\.DB,today\),cacheVersion\(env\.DB\)\]\)/);
  assert.match(week, /readRevision\(env\.DB,today\)\.catch\(\(\)=>null\)\]\)/);
  const revision = route("if(url.pathname==='/app/api/coach/revision'", "if(url.pathname==='/app/api/coach/week-check'");
  assert.match(revision, /\[athlete\]=await Promise\.all\(\[getAthleteState\(env\.DB\)\.catch\(\(\)=>null\),cacheVersion\(env\.DB\)\]\)/);
  assert.match(revision, /\[given,reflections,ratings,stored\]=await Promise\.all\(/);
  // The week check's days off: every week's plan at once; its efforts: feedback and reflections at once.
  assert.match(route("async function weekCheckFreeOn", "const stretchMinutes"), /Promise\.all\(weeks\.map\(/);
  assert.match(route("async function weekCheckState", "async function weekCheckSessions"), /\[given,reflections\]=await Promise\.all\(\[recentWorkoutFeedback\(/);
});

test("the recent feedback names its workouts in the order of the feedback", async () => {
  const raw = createD1(); raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const db = scopedDb(raw, 1);
  const [a, b] = (await catalog(db, "ride")).slice(0, 2);
  const add = raw.sqlite.prepare("INSERT INTO workout_feedback(user_id,workout_id,scheduled_date,sport,rpe,survey) VALUES(1,?,?,'ride',?,'manual')");
  add.run(a.id, "2026-11-12", 5); add.run(b.id, "2026-11-13", 7); add.run("unknown-id", "2026-11-14", 3);
  const out = await recentWorkoutFeedback(db, "2026-11-01");
  assert.deepEqual(out.map(f => [f.workoutId, f.name, f.rpe]), [["unknown-id", "unknown-id", 3], [b.id, b.name, 7], [a.id, a.name, 5]]);
});
