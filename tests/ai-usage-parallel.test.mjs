import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { claimAiSlot, aiSpentToday, estimateAiCostUsd, recordAiUsage, AI_PARALLEL_CALLS } from "../src/ai-usage.js";

test("a limited user runs at most a few AI calls at once; the owner is not limited", async () => {
  const DB = createD1(), env = { DB, USER_ID: 4 };
  const releases = [];
  for (let i = 0; i < AI_PARALLEL_CALLS; i++) releases.push(await claimAiSlot(env));
  await assert.rejects(claimAiSlot(env, { waitMs: 0 }), error => error.limit === true && error.status === 429);
  // Another user has their own slots.
  await (await claimAiSlot({ DB, USER_ID: 5 }))();
  await releases.pop()();
  releases.push(await claimAiSlot(env));
  for (const release of releases) await release();
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_usage").get().n, 0);
  assert.equal(await aiSpentToday(env), 0);
  const owner = { DB, USER_ID: 1, USER_IS_OWNER: true };
  for (let i = 0; i < AI_PARALLEL_CALLS + 2; i++) await claimAiSlot(owner);
  // A slot left behind by a Worker that died stops counting after a few minutes.
  for (let i = 0; i < AI_PARALLEL_CALLS; i++) await claimAiSlot(env);
  DB.sqlite.exec("UPDATE ai_usage SET created_at = datetime('now', '-6 minutes')");
  await claimAiSlot(env);
});

test("a call over the parallel limit waits in line instead of failing", async () => {
  const DB = createD1(), env = { DB, USER_ID: 7 };
  const releases = [];
  for (let i = 0; i < AI_PARALLEL_CALLS; i++) releases.push(await claimAiSlot(env));
  // Five photos at once: the extra calls wait for a slot and all get one.
  const waiting = [claimAiSlot(env, { pollMs: 5 }), claimAiSlot(env, { pollMs: 5 })];
  setTimeout(() => { releases.shift()(); releases.shift()(); }, 30);
  const late = await Promise.all(waiting);
  assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE model = 'pending'").get().n, AI_PARALLEL_CALLS);
  for (const release of [...releases, ...late]) await release();
  // Still full after the wait: refused.
  for (let i = 0; i < AI_PARALLEL_CALLS; i++) await claimAiSlot(env);
  await assert.rejects(claimAiSlot(env, { waitMs: 40, pollMs: 5 }), error => error.status === 429);
});

test("calls sent at once cannot spend past the limit together: the running ones count at their reservation", async () => {
  const db = grantAiConsent(createD1(), 7), env = { DB: scopedDb(db, 7), USER_ID: 7, OPENAI_API_KEY: "k", AI_DAILY_LIMIT_USD: "1" };
  const realFetch = globalThis.fetch;
  let calls = 0;
  // Each answer costs 0.15 USD (15k output tokens of gpt-6-sol), as much as it may.
  globalThis.fetch = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return Response.json({ model: "gpt-6-sol", output: [{ content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 0, output_tokens: 15000 } }); };
  try {
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => callOpenAI(env, { feature: "day-review", instructions: "x", input: "y", maxOutputTokens: 15000 })));
    assert.ok(results.some(r => r.status === "rejected" && r.reason.limit === true), "the calls over the limit are refused");
    // Before, all 12 reached the model (1.80 USD). Now the last call let through started under the limit.
    assert.ok(calls <= 7, `${calls} calls reached the model`);
    const spent = await aiSpentToday(env);
    assert.ok(spent < 1 + 0.15 + 1e-9, `spent ${spent}`);
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE model = 'pending'").get().n, 0, "every reservation became a record or was given back");
  } finally { globalThis.fetch = realFetch; }
});

test("a reservation is the most a call can cost; the real cost replaces it and a call without an answer gives it back", async () => {
  assert.equal(estimateAiCostUsd("gpt-6-sol", { instructions: "x".repeat(3000), input: "y", maxOutputTokens: 5000 }), 0.052);
  // An image counts as a picture, not as the length of its data.
  const photo = [{ role: "user", content: [{ type: "input_image", image_url: "data:image/jpeg;base64," + "A".repeat(4e6) }] }];
  assert.ok(estimateAiCostUsd("gpt-6-luna", { input: photo, maxOutputTokens: 4000 }) < 0.01);
  // A web search tool reserves a few searches; an unknown model counts at gpt-6-sol's price.
  assert.equal(estimateAiCostUsd("gpt-6-sol", { maxOutputTokens: 0, tools: [{ type: "web_search" }] }), 0.03);
  assert.equal(estimateAiCostUsd("other", { maxOutputTokens: 1000 }), 0.01);

  const DB = createD1(), env = { DB, USER_ID: 4 };
  const release = await claimAiSlot(env, { feature: "food-photo", reserveUsd: 0.4 });
  assert.equal(await aiSpentToday(env), 0.4, "a running call counts at its reservation");
  assert.equal(await aiSpentToday(env, { exceptId: release.id }), 0, "but not against itself");
  await recordAiUsage(env, { feature: "food-photo", model: "gpt-6-luna", usage: { input_tokens: 1000, output_tokens: 1000 }, slotId: release.id });
  await release();
  assert.deepEqual({ ...DB.sqlite.prepare("SELECT feature, model, cost_usd FROM ai_usage").get() }, { feature: "food-photo", model: "gpt-6-luna", cost_usd: 0.0006 });
  await (await claimAiSlot(env, { reserveUsd: 0.4 }))();
  assert.equal(await aiSpentToday(env), 0.0006);
});
