import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { aiSpentToday, estimateAiCostUsd } from "../src/ai-usage.js";
import { assistantStreamResponse } from "../src/assistant-stream.js";

const envFor = db => ({ DB: scopedDb(db, 7), USER_ID: 7, OPENAI_API_KEY: "k", AI_DAILY_LIMIT_USD: "1" });
const ask = { feature: "day-review", instructions: "x", input: "y", maxOutputTokens: 6000 };
const reserved = estimateAiCostUsd("gpt-6-sol", ask);
async function withFetch(fake, fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = fake;
  try { await fn(); } finally { globalThis.fetch = realFetch; }
}
const rows = db => db.sqlite.prepare("SELECT feature, model, cost_usd FROM ai_usage").all().map(row => ({ ...row }));

test("a stream that breaks off without usage counts at its reservation", async () => {
  const db = grantAiConsent(createD1(), 7), env = envFor(db), seen = [];
  const encoder = new TextEncoder();
  // Text arrives, then the connection drops before response.completed.
  await withFetch(async () => new Response(new ReadableStream({ start(c) { for (let i = 0; i < 50; i++) c.enqueue(encoder.encode("data: " + JSON.stringify({ type: "response.output_text.delta", delta: "slovo " }) + "\n\n")); c.close(); } })), async () => {
    await assert.rejects(callOpenAI(env, { ...ask, onText: text => seen.push(text) }), /přerušilo|interrupted/);
  });
  assert.equal(seen.length, 50);
  assert.deepEqual(rows(db), [{ feature: "day-review", model: "gpt-6-sol", cost_usd: reserved }], "before, nothing was recorded");
  assert.equal(await aiSpentToday(env), reserved);
});

test("a call that timed out counts at its reservation; one the AI service refused costs nothing", async () => {
  const db = grantAiConsent(createD1(), 7), env = envFor(db);
  await withFetch(async () => { throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }); }, async () => {
    await assert.rejects(callOpenAI(env, ask), /timed out/);
  });
  assert.deepEqual(rows(db), [{ feature: "day-review", model: "gpt-6-sol", cost_usd: reserved }]);
  db.sqlite.exec("DELETE FROM ai_usage");
  await withFetch(async () => Response.json({ error: { message: "Invalid model" } }, { status: 400 }), async () => {
    await assert.rejects(callOpenAI(env, ask), /400/);
  });
  assert.deepEqual(rows(db), [], "a refused request is not billed");
});

test("a streamed answer keeps working after the app hangs up, under waitUntil", async () => {
  const pending = [];
  let finished = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  const response = assistantStreamResponse(async emit => { emit("Část"); await gate; finished = true; return { answer: "Část", actions: [] }; }, { waitUntil: promise => pending.push(promise) });
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  release();
  assert.equal(pending.length, 1);
  await pending[0];
  assert.equal(finished, true, "the answer is still saved, counted and billed");
});
