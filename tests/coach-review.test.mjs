import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildReviewInput, reviewDay, usageCost, dayReadiness, reviewInstructions, reviewInstructionsText } from "../src/coach-review.js";
import { withLang } from "../src/lang.js";
import { serverSource } from "./helpers/server-source.mjs";

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



test("the review gets the recovery model's readiness and may not be more aggressive than its zone", async () => {
  const rows = []; for (let i = 20; i >= 0; i--) { const d = new Date(Date.parse("2026-10-07T12:00:00Z") - i * 86400000).toISOString().slice(0, 10); rows.push({ id: d, hrv: i === 0 ? 40 : 60 + (i % 3), restingHR: i === 0 ? 58 : 50 + (i % 2), ctl: 50, atl: 60 }); }
  const readiness = dayReadiness({ date: "2026-10-07", fitness: { wellness: rows }, health: { wellness: [], sleep: [] }, checkin: "tired" });
  assert.equal(readiness.zone, "red");
  assert.equal(readiness.score, 0);
  assert.deepEqual(readiness.parts.map(p => p.key), ["hrv", "restingHR"]);
  assert.deepEqual(readiness.flags, ["hrv_trend_down", "checkin_tired"]);
  assert.equal(readiness.checkin, "tired");
  // Without any body signal only a check-in says something; otherwise nothing is sent.
  assert.deepEqual(dayReadiness({ date: "2026-10-07", fitness: {}, health: {}, checkin: "sick" }).flags, ["checkin_sick"]);
  assert.equal(dayReadiness({ date: "2026-10-07", fitness: {}, health: {} }), null);
  const input = buildReviewInput({ date: "2026-10-07", today: "2026-10-07", week, fitness: { wellness: rows }, readiness });
  assert.equal(input.readiness.zone, "red");
  assert.equal(buildReviewInput({ date: "2026-10-07", today: "2026-10-07", week }).readiness, undefined);
  // The form rows are the compact recovery projection.
  assert.deepEqual(Object.keys(input.form.at(-1)), ["date", "ctl", "atl", "tsb", "hrv", "restingHR"]);
  assert.match(reviewInstructions, /red = jen volno nebo lehká regenerace, yellow = žádná nová intenzita/);
  withLang("en", () => { assert.match(reviewInstructionsText(), /Write in English/); assert.match(reviewInstructionsText(), /red = rest or easy recovery only, yellow = no new intensity/); assert.doesNotMatch(reviewInstructionsText(), /česky/); });
  // The route passes the readiness of the reviewed day (today's for a day ahead).
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /const readinessDate=date<localToday\(\)\?date:localToday\(\);\s*const readiness=dayReadiness\(\{date:readinessDate,fitness:inputs\.fitness,health:inputs\.health,profile:inputs\.profile,checkin:/);
  assert.match(entry, /coachNotes:notes\.map\(r=>\(\{date:r\.date,text:r\.text\}\)\),readiness\}\)/);
});

test("an answer that is not JSON is an error, never a headline", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ model: "gpt-6-luna", output: [{ content: [{ type: "output_text", text: "Sorry, I cannot do that." }] }] }), { status: 200 });
  try { await assert.rejects(reviewDay({ OPENAI_API_KEY: "sk" }, { date: "2026-10-04" }), /Hodnocení se nepodařilo zpracovat/); }
  finally { globalThis.fetch = original; }
});

test("the day review counts nights, not naps, and names English weekdays in English", async () => {
  const { buildReviewInput } = await import("../src/coach-review.js");
  const { withLang } = await import("../src/lang.js");
  const health = { sleep: [{ date: "2026-10-13", durationMin: 470 }, { date: "2026-10-13", durationMin: 25, nap: true }] };
  const input = withLang("en", () => buildReviewInput({ date: "2026-10-14", today: "2026-10-14", health }));
  assert.deepEqual(input.sleep.map(s => s.minutes), [470]);
  assert.equal(input.day.weekday, "Wednesday");
});
