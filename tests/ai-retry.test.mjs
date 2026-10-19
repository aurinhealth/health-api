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
