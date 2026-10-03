import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildReviewInput, reviewDay, usageCost } from "../src/coach-review.js";

const week = { days: [
  { date: "2026-10-03", daily: { training: { completed: [{ name: "Leg day", type: "WeightTraining", durationHours: 1, tss: 60 }], planned: [] } } },
  { date: "2026-10-04", daily: { training: { planned: [{ name: "Endurance 240 min", type: "Ride", durationHours: 4, tss: 210 }, { name: "Nutrition", type: "Nutrition" }], completed: [] } } }
] };

test("the review input has the day, the days around, form, sleep and feedback", () => {
  const input = buildReviewInput({ date: "2026-10-04", today: "2026-10-03", week,
    fitness: { wellness: [{ id: "2026-10-03", ctl: 70, atl: 92, hrv: 70 }] }, health: { sleep: [{ date: "2026-10-03", durationMin: 380 }] },
    gymRows: [{ type: "WARMUP", exercise: "Leg press" }, { type: "WORK", exercise: "Hip thrust", plannedKg: 60, plannedReps: "8–12" }, { type: "WORK", exercise: "Hip thrust", plannedKg: 60, plannedReps: "8–12" }],
    roles: [{}, {}, {}, {}, {}, {}, { items: [{ label: "Dlouhá jízda" }] }], feedback: [{ date: "2026-10-02", rpe: 8, notes: "těžké nohy" }] });
  assert.equal(input.day.weekday, "neděle");
  assert.deepEqual(input.day.planned.map(p => p.name), ["Endurance 240 min"]); // nutrition events are left out
  assert.deepEqual(input.day.role, ["Dlouhá jízda"]);
  assert.deepEqual(input.day.gymPlan, [{ exercise: "Hip thrust", sets: 2, kg: 60, reps: "8–12" }]);
  assert.equal(input.around.find(d => d.date === "2026-10-03").done[0].name, "Leg day");
  assert.equal(input.form[0].tsb, -22);
  assert.equal(input.sleep[0].minutes, 380);
  assert.equal(input.recentFeedback[0].notes, "těžké nohy");
});

test("each model is asked with the same schema; time, tokens and cost are reported", async () => {
  const original = globalThis.fetch, bodies = [];
  globalThis.fetch = async (url, init) => { const b = JSON.parse(init.body); bodies.push(b); return new Response(JSON.stringify({ model: b.model, usage: { input_tokens: 4000, output_tokens: 500 }, output: [{ content: [{ type: "output_text", text: JSON.stringify({ verdict: "adjust", headline: "Zkrať jízdu.", reasons: ["TSB −22"], changes: [{ what: "240 → 180 min", why: "po leg day" }], missing: "" }) }] }] }), { status: 200 }); };
  try {
    const env = { OPENAI_API_KEY: "sk" };
    const luna = await reviewDay(env, { date: "2026-10-04" });
    const sol = await reviewDay(env, { date: "2026-10-04" }, "gpt-6.1-sol");
    assert.deepEqual(bodies.map(b => [b.model, b.text.format.name]), [["gpt-6-luna", "day_review"], ["gpt-6.1-sol", "day_review"]]);
    assert.equal(luna.review.verdict, "adjust");
    assert.equal(luna.costUsd, 0.00065);
    assert.equal(sol.costUsd, 0.013);
  } finally { globalThis.fetch = original; }
  assert.equal(usageCost("unknown-model", { input_tokens: 1 }), null);
});

test("the dashboard offers Revize dne on the light model, without a model comparison", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /url\.pathname==='\/app\/api\/coach\/review'&&request\.method==='POST'/);
  assert.match(entry, /const reviews=\[await reviewDay\(env,input\)/);
  assert.doesNotMatch(entry, /body\.compare/);
  assert.match(client, /data-review="'\+esc\(pick\)\+'">🔍 Revize dne/);
  assert.match(client, /async function openReviewSheet\(date\)\{/);
  assert.doesNotMatch(client, /Luna × Sol|assistantCompare/);
});

test("Hodnocení replaces the bare RPE button: RPE and a note for any finished session", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.match(client, /data-today="rate" data-name="'\+esc\(x\.name\|\|'Trénink'\)\+'">Hodnocení<\/button>/);
  assert.doesNotMatch(client, /data-today="rpe">RPE<\/button>/);
  // A library workout gets the RPE (and Intervals.icu); any other session goes to the coach.
  assert.match(client, /if\(match&&rpe\)\{\s*const res=await jsonFetch\('\/app\/api\/workouts\/feedback'/);
  assert.match(client, /jsonFetch\('\/app\/api\/coach\/reflections',\{method:'POST'[^)]*body:JSON\.stringify\(\{date,rpe,notes:\(pick\?pick\+': ':''\)\+notes\}\)/);
});
