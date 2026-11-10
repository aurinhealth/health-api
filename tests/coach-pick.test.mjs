import test from "node:test";
import assert from "node:assert/strict";
import { rankOptions, saunaSigns, dayChoice, doneSentence, setLess, lessKinds, pickSignature, storedDetails, storeDetails, workoutLines, gymLines } from "../src/coach-pick.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const coach = (status, kind = "tempo", minutes = 65, lower = 0, reasons = []) => ({ readiness: { status, score: 70, reasons }, recommendation: { session: { kind, durationMinutes: minutes } }, load: { lowerBodyGymSignals48h: lower } });

test("a rested cyclist gets the ride the coach chose, the rest under Jiné možnosti", () => {
  const r = rankOptions({ ride: coach("green"), run: coach("green", "endurance", 40), mainSport: "cycling", sports: ["ride", "run", "strength"] });
  assert.equal(r.options[0].kind, "ride");
  assert.equal(r.options[0].title, "Kolo · tempo");
  assert.equal(r.options[0].best, true);
  assert.equal(r.options[0].action, "library");
  assert.deepEqual(r.options.map(o => o.kind).sort(), ["gym", "rest", "ride", "run", "sauna", "swim"]);
});

test("a bad night recommends a day off with a walk, the sauna second at most, and says why", () => {
  const r = rankOptions({ ride: coach("red", "recovery", 30, 0, ["spánek 5,8 h z potřebných 7,5 h"]), run: coach("red", "recovery"), mainSport: "cycling", sports: ["ride"] });
  assert.equal(r.options[0].kind, "rest");
  assert.equal(r.options[0].title, "Volno");
  assert.match(r.options[0].detail, /Procházka/);
  assert.equal(r.options[1].kind, "sauna");
  // Declined days off still never put the sauna first on a red day.
  const declined = rankOptions({ ride: coach("red", "recovery"), run: coach("red", "recovery"), mainSport: "cycling", sports: ["ride"], declines: [{ top: "rest" }, { top: "rest" }, { top: "rest" }] });
  assert.equal(declined.options[0].kind, "rest");
  assert.match(r.options[0].reason, /^Spánek 5,8 h/);
  assert.equal(r.options[0].action, "accept");
});

test("tired legs make the gym upper body; declines push an option down", () => {
  const r = rankOptions({ ride: coach("yellow", "endurance", 60, 2), run: coach("yellow", "endurance"), mainSport: "strength", sports: ["strength", "ride"] });
  const gym = r.options.find(o => o.kind === "gym");
  assert.equal(gym.title, "Posilovna · horní polovina");
  const declined = rankOptions({ ride: coach("yellow", "endurance", 60, 2), run: coach("yellow", "endurance"), mainSport: "strength", sports: ["strength", "ride"], declines: [{ top: r.options[0].kind }, { top: r.options[0].kind }, { top: r.options[0].kind }] });
  assert.notEqual(declined.options[0].kind, r.options[0].kind);
});

test("a workout done today turns the pick to recovery", () => {
  const r = rankOptions({ ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"], today: ["ride"] });
  assert.ok(["rest", "sauna"].includes(r.options[0].kind));
});

test("the reason speaks of quality only when the pick is a hard session", () => {
  assert.match(rankOptions({ ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"] }).options[0].reason, /kvalitu/);
  const easy = rankOptions({ ride: coach("green", "endurance", 90), run: coach("green", "endurance"), mainSport: "cycling", sports: ["ride"] }).options[0];
  assert.equal(easy.kind, "ride");
  assert.doesNotMatch(easy.reason, /kvalitu/);
  assert.match(easy.reason, /klidném tempu/);
});

test("Doporučení trenéra builds the ride and run like the library's proposal (plan, role, free time, abilities)", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  // The ranked options (pickBase), kept under the data version by the route.
  const base = src.slice(src.indexOf("async function pickBase"), src.indexOf("function loadCoachInputs("));
  assert.match(base, /defaultDayCoach\(env,\{\.\.\.inputs,athleteState:athlete\},date,'ride',week\)/);
  const route = src.slice(src.indexOf("if(url.pathname==='/app/api/coach/pick')"), src.indexOf("if(url.pathname==='/app/api/coach/check-in'"));
  assert.match(route, /cached\(env,ctx,'pick-base:'\+date,\(\)=>pickBase\(env,ctx,internalAuth,date\)\)/);
  const helper = src.slice(src.indexOf("async function defaultDayCoach"), src.indexOf("// The athlete's ratings since a day"));
  for (const part of [/targetFor\(targets,date,sport\)/, /roleFor\(prefs,date,sport/, /trainingBudget\(prefs,date/, /capabilitiesWithLevel\(env\.DB,sport\)/]) assert.match(helper, part);
});

test("after a ride the activity says what was done, then recommends stretching", () => {
  const r = rankOptions({ ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"], today: ["ride"], done: [{ kind: "ride", minutes: 67, tss: 74 }] });
  const best = r.options[0];
  assert.equal(best.kind, "rest");
  assert.equal(best.title, "Protažení");
  assert.equal(best.detail, "15 min · večer procházka 30 min");
  assert.equal(best.reason, "Dnes máš za sebou kolo, 1 h 07, 74 TSS. Doporučuju 15 minut protažení a večer lehkou procházku.");
  assert.equal(doneSentence([{ kind: "run", minutes: 40 }]), "Dnes máš za sebou běh, 40 min.");
});

test("Doporučovat méně is kept per athlete and can be undone", async () => {
  const db = scopedDb(createD1(), 1);
  await setLess(db, 1, "sauna");
  await setLess(db, 1, "swim");
  assert.deepEqual((await lessKinds(db, 1)).sort(), ["sauna", "swim"]);
  await setLess(db, 1, "sauna", false);
  assert.deepEqual(await lessKinds(db, 1), ["swim"]);
  await assert.rejects(setLess(db, 1, "golf"));
});

test("the ready workouts are reused only while the options stay the same", async () => {
  const db = scopedDb(createD1(), 1);
  const a = rankOptions({ ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"] });
  const sig = pickSignature(a);
  await storeDetails(db, 1, "2026-10-14", sig, { ride: { minutes: 65 } });
  assert.deepEqual(await storedDetails(db, 1, "2026-10-14", sig), { ride: { minutes: 65 } });
  const b = rankOptions({ ride: coach("red", "recovery", 30), run: coach("red", "recovery"), mainSport: "cycling", sports: ["ride"] });
  assert.equal(await storedDetails(db, 1, "2026-10-14", pickSignature(b)), null);
});

test("the lines of a workout and a gym plan", () => {
  const steps = [{ repeats: 1, steps: [{ durationSeconds: 600, percentLow: 50, percentHigh: 60, wattsLow: 130, wattsHigh: 156 }] }, { repeats: 3, steps: [{ durationSeconds: 480, percentLow: 80, percentHigh: 85, wattsLow: 208, wattsHigh: 221, note: "tempo" }, { durationSeconds: 180, percentLow: 50, percentHigh: 55 }] }, { repeats: 1, steps: [{ durationSeconds: 300, percentLow: 50, percentHigh: 55, wattsLow: 130, wattsHigh: 143 }] }];
  assert.deepEqual(workoutLines(steps, "ride"), [["Rozjetí", "10 min · 143 W"], ["3 × tempo", "8 min · 215 W"], ["Vyjetí", "5 min · 137 W"]]);
  assert.deepEqual(gymLines([["Typ", "Cvik"], ["WORK", "Bench press", 1, "70", 8], ["WORK", "Bench press", 2, "70", 8], ["WARMUP", "Bench press", 1, "40", 10], ["WORK", "Shyby", 1, "", 6]]), [["Bench press", "2 × 8 · 70 kg"], ["Shyby", "1 × 6"]]);
});

test("Aktivita dne asks for the ready workouts only when the options change, the AI only for the best", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const route = src.slice(src.indexOf("if(url.pathname==='/app/api/coach/pick')"), src.indexOf("if(url.pathname==='/app/api/coach/check-in'"));
  assert.match(route, /storedDetails\(env\.DB,env\.USER_ID,date,signature\)/);
  assert.match(route, /o\.best\|\|!less\.includes\(o\.kind\)/);
  const helper = src.slice(src.indexOf("async function pickDetails"), src.indexOf("async function workoutPreview"));
  assert.match(helper, /ai:ai&&o\.best===true/);
  // The AI's workout after the answer: the rules' first, the AI asked by the request whose claim lands.
  assert.match(route, /pickDetails\(env,ctx,ranked,date,gym,\{ai:!aiKind\}\)/);
  assert.match(route, /if\(await claimDetails\([^)]*\)\.catch\(\(\)=>false\)\)askAi\(details\)/);
  assert.match(route, /if\(state\.chosen\)await finishDetails\(env\.DB,env\.USER_ID,date,signature,rest\)/);
});

test("the AI's workout is asked once per options and replaces the rules' only while the options stay", async () => {
  const { claimDetails, finishDetails, AI_RETRY_MS } = await import("../src/coach-pick.js");
  const db = scopedDb(createD1(), 1), date = "2026-10-14", now = new Date("2026-10-14T07:00:00Z");
  const provisional = { ride: { minutes: 60, rules: true }, aiPending: now.toISOString() };
  assert.equal(await claimDetails(db, 1, date, "A", provisional, now), true);
  // A second request at the same moment with the same options: no second AI call.
  assert.equal(await claimDetails(db, 1, date, "A", provisional, new Date(now.getTime() + 1000)), false);
  // New options take the entry over at once; still pending long after, it may be claimed again.
  assert.equal(await claimDetails(db, 1, date, "B", provisional, new Date(now.getTime() + 2000)), true);
  assert.equal(await claimDetails(db, 1, date, "B", provisional, new Date(now.getTime() + 2000 + AI_RETRY_MS + 1)), true);
  // The AI's answer for the old options is dropped, for the current ones it is kept.
  await finishDetails(db, 1, date, "A", { ride: { minutes: 70, ai: true } });
  assert.deepEqual(await storedDetails(db, 1, date, "B"), provisional);
  await finishDetails(db, 1, date, "B", { ride: { minutes: 70, ai: true } });
  assert.deepEqual(await storedDetails(db, 1, date, "B"), { ride: { minutes: 70, ai: true } });
  // A finished entry is never taken back for the same options, however old.
  assert.equal(await claimDetails(db, 1, date, "B", provisional, new Date(now.getTime() + 10 * AI_RETRY_MS)), false);
  assert.deepEqual(await storedDetails(db, 1, date, "B"), { ride: { minutes: 70, ai: true } });
});

test("the AI after the answer fits Cloudflare's time, and a try without its workout gets one more", async () => {
  const { AI_BUDGET_MS } = await import("../src/coach-pick.js");
  assert.ok(AI_BUDGET_MS <= 25000);
  const src = (await import("node:fs")).readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const route = src.slice(src.indexOf("if(url.pathname==='/app/api/coach/pick')"), src.indexOf("if(url.pathname==='/app/api/coach/check-in'"));
  assert.match(route, /\{aiBudgetMs:AI_BUDGET_MS\}/);
  assert.match(route, /consentStatus\(env\)/);
  assert.match(route, /got=ai\[aiKind\]\?\.workout\?\.ai/);
  assert.match(route, /\(aiTries\|\|1\)>=2/);
  assert.match(route, /aiTries:\(details\.aiTries\|\|1\)\+1/);
  // The generator's AI calls end within the budget, with a short wait for a slot.
  assert.match(src, /slotWaitMs:Math\.min\(5000,/);
  assert.match(src, /aiWorkoutPick\(env,generated,\{[^}]*\.\.\.\(ask\?\{ask\}:\{\}\)\}\)/);
  assert.match(src, /composeWorkout\(env,\{sport:genSport[^}]*\.\.\.\(ask\?\{ask\}:\{\}\)\}\)/);
});

test("a choice without a workout goes into the day's plan, and a changed mind takes it out", async () => {
  const { savePick } = await import("../src/coach-pick.js");
  const { listRecovery, updateRecovery } = await import("../src/recovery-plan.js");
  const db = scopedDb(createD1(), 7), date = "2026-10-15";
  const kinds = async () => (await listRecovery(db, { from: date, to: date })).map(r => r.kind).sort();
  await savePick(db, 7, { date, kind: "rest", top: "ride" });
  assert.deepEqual(await kinds(), ["stretch", "walk"]);
  const walk = (await listRecovery(db, { from: date, to: date })).find(r => r.kind === "walk");
  assert.equal(walk.title, "Procházka");
  assert.equal(walk.minutes, 30);
  // The same choice again adds nothing; a done walk stays when the mind changes.
  await savePick(db, 7, { date, kind: "rest", top: "ride" });
  assert.deepEqual(await kinds(), ["stretch", "walk"]);
  await updateRecovery(db, walk.id, { done: true });
  await savePick(db, 7, { date, kind: "swim", top: "ride" });
  assert.deepEqual(await kinds(), ["swim", "walk"]);
  await savePick(db, 7, { date, kind: "ride", top: "ride" });
  assert.deepEqual(await kinds(), ["walk"]);
});

test("Odmítnout hides the day's activity, counts as a decline of the top, and Vrátit takes it back", async () => {
  const { savePick, undoSkip, pickState } = await import("../src/coach-pick.js");
  const db = scopedDb(createD1(), 7), date = "2026-10-19";
  await savePick(db, 7, { date, kind: "skip", top: "rest" });
  let state = await pickState(db, 7, date);
  assert.equal(state.chosen, "skip");
  assert.equal(dayChoice({ chosen: state.chosen, planned: [] }), "skip");
  assert.deepEqual(state.declines.map(d => d.top), ["rest"]);
  await undoSkip(db, 7, date);
  state = await pickState(db, 7, date);
  assert.equal(state.chosen, null);
  assert.deepEqual(state.declines, []);
  // Vrátit leaves a real choice alone.
  await savePick(db, 7, { date, kind: "swim", top: "rest" });
  await undoSkip(db, 7, date);
  assert.equal((await pickState(db, 7, date)).chosen, "swim");
});

test("Nemoc, Zranění or Pauza leave only rest; signs of an illness drop the sauna", () => {
  const sick = rankOptions({ ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"], athleteStatus: "sick" });
  assert.deepEqual(sick.options.map(o => o.kind), ["rest"]);
  assert.equal(sick.options[0].best, true);
  assert.match(sick.options[0].reason, /^Máš nastavenou Nemoc/);
  assert.deepEqual(rankOptions({ ride: coach("green"), run: coach("green"), athleteStatus: "injured" }).options.map(o => o.kind), ["rest"]);
  assert.deepEqual(rankOptions({ ride: coach("green"), run: coach("green"), athleteStatus: "on_break" }).options.map(o => o.kind), ["rest", "sauna"]);
  assert.deepEqual(rankOptions({ ride: coach("green"), run: coach("green"), athleteStatus: "on_break", noSauna: true }).options.map(o => o.kind), ["rest"]);
  const signs = rankOptions({ ride: coach("red", "recovery"), run: coach("red", "recovery"), mainSport: "cycling", sports: ["ride"], noSauna: true });
  assert.ok(!signs.options.some(o => o.kind === "sauna"));
  assert.equal(signs.options[0].title, "Volno");
  // The reason says why there is no sauna without naming a cause.
  assert.match(signs.options[0].reason, /Sauna je taky zátěž, dnes ne\.$/);
  assert.doesNotMatch(signs.options[0].reason, /nemoc|alkohol|zranění/i);
  // After training the sauna is gone too.
  const trained = rankOptions({ ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"], today: ["ride"], noSauna: true });
  assert.ok(!trained.options.some(o => o.kind === "sauna"));
  assert.equal(trained.options[0].kind, "rest");
});

test("the sauna dropping keeps the day's ready workouts", () => {
  const args = { ride: coach("green"), run: coach("green"), mainSport: "cycling", sports: ["ride"] };
  assert.equal(pickSignature(rankOptions({ ...args, noSauna: true })), pickSignature(rankOptions(args)));
  assert.notEqual(pickSignature(rankOptions({ ...args, ride: coach("red", "recovery") })), pickSignature(rankOptions(args)));
});

test("any one warning sign of the night takes the sauna off", () => {
  assert.equal(saunaSigns(null), false);
  assert.equal(saunaSigns({ components: { hrv: { z: -1.5 }, restingHR: { z: 1.5 } } }), false);
  assert.equal(saunaSigns({ components: { wristTemp: { raised: true } } }), true);
  assert.equal(saunaSigns({ components: { skinTemp: { elevated: true } } }), true);
  assert.equal(saunaSigns({ components: { respiration: { elevated: true } } }), true);
  assert.equal(saunaSigns({ components: { restingHR: { z: 2 } } }), true);
});

test("a workout the athlete planned for today takes Aktivita dne like a choice", async () => {
  assert.equal(dayChoice({ chosen: null, planned: [] }), null);
  assert.equal(dayChoice({ chosen: null, planned: ["gym"] }), "gym");
  assert.equal(dayChoice({ chosen: "sauna", planned: ["gym"] }), "sauna");
  const src = (await import("node:fs")).readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const route = src.slice(src.indexOf("if(url.pathname==='/app/api/coach/pick')"), src.indexOf("if(url.pathname==='/app/api/coach/check-in'"));
  assert.match(route, /chosen:dayChoice\(\{chosen:state\.chosen,planned\}\)/);
});

// Marie, 2026-11-02: runs and the gym, never a ride; three declined runs and a
// declined gym day put the ride first on a tie (yellow and green mornings).
test("declines never turn a sport the athlete doesn't do into the day's activity", () => {
  const declines = [{ top: "run" }, { top: "gym" }, { top: "run" }, { top: "run" }];
  for (const status of ["yellow", "green"]) {
    const r = rankOptions({ ride: coach(status, "endurance", 60, 1), run: coach(status, "endurance"), mainSport: "general", sports: ["run", "strength", "walk"], declines });
    assert.notEqual(r.options[0].kind, "ride", status);
    assert.ok(r.options.some(o => o.kind === "ride"), "the ride stays among the other options");
  }
});

test("a new general-fitness account gets the gym or a run, never a ride", () => {
  const r = rankOptions({ ride: coach("yellow", "endurance"), run: coach("yellow", "endurance"), mainSport: "general", sports: [] });
  assert.ok(["gym", "run"].includes(r.options[0].kind), r.options[0].kind);
  const cyclist = rankOptions({ ride: coach("yellow", "endurance"), run: coach("yellow", "endurance"), mainSport: "cycling", sports: [] });
  assert.equal(cyclist.options[0].kind, "ride");
});
