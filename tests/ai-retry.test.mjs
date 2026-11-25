import test from "node:test";
import assert from "node:assert/strict";
import { callOpenAI, AI_RETRY_DELAYS_MS } from "../src/coach-assistant.js";

const env = () => ({ OPENAI_API_KEY: "k", DB: null });
const ok = () => new Response(JSON.stringify({ model: "m", output: [{ content: [{ type: "output_text", text: "hi" }] }], usage: {} }), { status: 200 });

test("a 503 from OpenAI is asked again and the answer comes back", async t => {
  const delays = [...AI_RETRY_DELAYS_MS];
  AI_RETRY_DELAYS_MS.splice(0, delays.length, 1, 1);
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => (++calls === 1 ? new Response("{}", { status: 503 }) : ok());
  t.after(() => { globalThis.fetch = real; AI_RETRY_DELAYS_MS.splice(0, 2, ...delays); });
  const answer = await callOpenAI(env(), { instructions: "x", input: "y" }).catch(error => error);
  assert.equal(calls, 2);
  assert.equal(answer.text, "hi");
});

test("an exhausted quota is not asked again", async t => {
  const delays = [...AI_RETRY_DELAYS_MS];
  AI_RETRY_DELAYS_MS.splice(0, delays.length, 1, 1);
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "quota" } }), { status: 429 }); };
  t.after(() => { globalThis.fetch = real; AI_RETRY_DELAYS_MS.splice(0, 2, ...delays); });
  await assert.rejects(callOpenAI(env(), { instructions: "x", input: "y" }), error => /^AI 429: /.test(error.message) && !/quota/.test(error.message), "OpenAI's own text stays in the log");
  assert.equal(calls, 1);
});

test("an exhausted credit or limit e-mails the owner at once, once a day", async t => {
  const { createD1 } = await import("./helpers/d1.mjs");
  const { readFileSync } = await import("node:fs");
  const { alertAiQuota } = await import("../src/ai-total.js");
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../migrations/0025_ops_events.sql", import.meta.url), "utf8"));
  const sent = [];
  const env = { RAW_DB: raw, OWNER_EMAIL: "owner@example.test", EMAIL_FROM: "noreply@aurin.health", EMAIL: { send: async mail => { sent.push(mail); return { messageId: "m" }; } } };
  // The refused call itself raises it (fetchOpenAI, coach-assistant.js).
  assert.match(readFileSync(new URL("../src/coach-assistant.js", import.meta.url), "utf8"), /insufficient_quota'\)\{await alertAiQuota\(env\);return response;\}/);
  await alertAiQuota(env);
  assert.equal(sent.length, 1);
  await alertAiQuota(env);
  assert.equal(sent.length, 1, "not again the same day");
  assert.match(sent[0].subject, /došel kredit nebo strop OpenAI/);
  await alertAiQuota(env, new Date(Date.now() + 86400000));
  assert.equal(sent.length, 2);
});
