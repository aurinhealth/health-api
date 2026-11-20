// The coach's sentence above Training's load cards and its "Add to plan"
// (load-advice.js, Petr 2026-11-20 decision 6): rules, written only after the tap.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withLang } from "../src/lang.js";
import { loadAdvice, easySport, freeDay } from "../src/load-advice.js";

const DATE = "2026-11-20"; // a Friday

test("below the usual load: one easy session of the main sport tomorrow", () => withLang("en", () => {
  const a = loadAdvice({ level: "wellBelow", date: DATE, sport: "ride", planned: new Set(["2026-11-25"]) });
  assert.equal(a.text, "Your load is far below your usual. One easy ride tomorrow helps bring it back.");
  assert.deepEqual(a.action, { kind: "add_easy", sport: "ride", date: "2026-11-21", minutes: 60 });
  withLang("cs", () => assert.equal(loadAdvice({ level: "below", date: DATE, sport: "swim" }).text, "Zátěž je trochu pod tvou obvyklou. Jedno lehké plavání zítra ji pomůže vrátit."));
  // A session planned in the next three days (or the one just added): no second offer.
  const soon = loadAdvice({ level: "wellBelow", date: DATE, sport: "ride", planned: new Set(["2026-11-23"]) });
  assert.equal(soon.action, undefined);
  assert.equal(soon.text, "Your load is far below your usual.");
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
  assert.equal(easySport("strength", [{ sport: "run", status: "done" }]), null);
  // Sick, injured, on a break or tapering: the sentence without a session to add.
  assert.equal(loadAdvice({ level: "wellBelow", date: DATE, sport: "ride", hold: true }).action, undefined);
  assert.equal(freeDay(DATE, new Set(["2026-11-22"])), null);
  assert.equal(freeDay(DATE, new Set()), "2026-11-21");
});

test("Add to plan writes only on its own POST, an endurance session on the day the advice named", () => {
  const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const route = src.slice(src.indexOf("if(url.pathname==='/app/api/workouts/add-easy'"), src.indexOf("if(url.pathname==='/app/api/workouts/add-easy'") + 2400);
  assert.match(route, /request\.method==='POST'/);
  assert.match(route, /focus:'endurance'/);
  // A second tap adds nothing.
  assert.match(route, /FROM workout_schedule_links WHERE user_id=\? AND scheduled_date=\?[\s\S]*already:true/);
  assert.match(route, /date<=localToday\(\)\|\|date>shiftDate\(localToday\(\),14\)/);
  assert.match(route, /scheduleWorkoutInIntervals\(env,env\.DB,\{workoutId:String\(w\.id\),date,confirm:true/);
  assert.match(readFileSync(new URL("../src/app-training.js", import.meta.url), "utf8"), /loadAdvice: workload\.historyDays > 0 \? loadAdvice\(/);
});

test("Add to plan is reachable: a past day gets 400, not 405", async () => {
  const { createD1 } = await import("./helpers/d1.mjs");
  const { ensureTenancy, _resetTenancyForTest } = await import("../src/tenancy.js");
  const { sessionCookie } = await import("../src/dashboard-auth.js");
  const worker = (await import("../src/entrypoint.js")).default;
  _resetTenancyForTest();
  const env = { DB: createD1(), OWNER_EMAIL: "owner@example.com", CONNECTION_KEY: "k".repeat(40), SESSION_SECRET: "s".repeat(40) };
  await ensureTenancy(env.DB, env);
  const sql = n => readFileSync(new URL(n, import.meta.url), "utf8");
  env.DB.sqlite.exec(sql("../staging/schema.sql") + sql("../migrations/0011_account_deletions.sql") + sql("../migrations/0013_cookbook_and_consents.sql"));
  env.DB.sqlite.prepare("INSERT INTO users (id, email, name, role) VALUES (2, 'u2@example.com', 'U2', 'user')").run();
  env.DB.sqlite.prepare("INSERT INTO user_consents VALUES (2, 'health', '1', '2026-01-01', NULL)").run();
  const cookie = (await sessionCookie(2, Math.floor(Date.now() / 1000) + 3600, env.SESSION_SECRET)).split(";")[0];
  const post = body => worker.fetch(new Request("https://aurin.health/app/api/workouts/add-easy", { method: "POST", headers: { Cookie: cookie, Origin: "https://aurin.health", "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, { waitUntil() {} });
  const r = await post({ sport: "ride", date: "2000-01-01" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).status, "error");
  assert.equal((await post({ sport: "climb", date: "2099-01-01" })).status, 400);
  _resetTenancyForTest();
});
