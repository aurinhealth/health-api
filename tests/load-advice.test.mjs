// The coach's sentence above Training's load cards and its "Add to plan"
// (load-advice.js, Petr 2026-11-20 decision 6): rules, written only after the tap.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withLang } from "../src/lang.js";
import { loadAdvice, easySport, freeDay } from "../src/load-advice.js";

const DATE = "2026-11-20"; // a Friday

test("below the usual load: one easy session of the main sport on the next free day", () => withLang("en", () => {
  const a = loadAdvice({ level: "wellBelow", date: DATE, sport: "ride", planned: new Set(["2026-11-21"]) });
  assert.equal(a.text, "Your load is far below your usual. One easy ride on Sun brings it back.");
  assert.deepEqual(a.action, { kind: "add_easy", sport: "ride", date: "2026-11-22", minutes: 60 });
  withLang("cs", () => assert.equal(loadAdvice({ level: "below", date: DATE, sport: "swim" }).text, "Zátěž je trochu pod tvou obvyklou. Jedno lehké plavání v sobotu ji vrátí."));
}));

test("usual or above: a conclusion without an action; nothing without a level", () => withLang("en", () => {
  for (const level of ["usual", "above", "wellAbove"]) { const a = loadAdvice({ level, date: DATE, sport: "run" }); assert.ok(a.text); assert.equal(a.action, undefined); }
  assert.equal(loadAdvice({ level: null, date: DATE }), null);
  // A lifter only: the sentence, no endurance session to add.
  assert.equal(loadAdvice({ level: "below", date: DATE, sport: null }).action, undefined);
}));

test("the sport and the free day", () => {
  assert.equal(easySport("running"), "run");
  assert.equal(easySport("general", [{ sport: "swim", status: "done" }, { sport: "run", status: "done" }, { sport: "run", status: "done" }]), "run");
  assert.equal(easySport("strength", [{ sport: "strength", status: "done" }]), null);
  const week = new Set(Array.from({ length: 7 }, (_, i) => new Date(Date.parse(DATE + "T12:00:00Z") + (i + 1) * 86400000).toISOString().slice(0, 10)));
  assert.equal(freeDay(DATE, week), null);
});

test("Add to plan writes only on its own POST, an endurance session on the day the advice named", () => {
  const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const route = src.slice(src.indexOf("if(url.pathname==='/app/api/training/add-easy'"), src.indexOf("if(url.pathname==='/app/api/training/add-easy'") + 1400);
  assert.match(route, /request\.method==='POST'/);
  assert.match(route, /focus:'endurance'/);
  assert.match(route, /date<=localToday\(\)\|\|date>shiftDate\(localToday\(\),14\)/);
  assert.match(route, /scheduleWorkoutInIntervals\(env,env\.DB,\{workoutId:String\(w\.id\),date,confirm:true/);
  assert.match(readFileSync(new URL("../src/app-training.js", import.meta.url), "utf8"), /loadAdvice: workload\.historyDays > 0 \? loadAdvice\(/);
});
