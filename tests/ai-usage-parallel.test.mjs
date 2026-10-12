import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { claimAiSlot, aiSpentToday, AI_PARALLEL_CALLS } from "../src/ai-usage.js";

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
