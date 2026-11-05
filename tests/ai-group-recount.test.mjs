import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";

// Today audit point 35: a group whose brake grows with its accounts counts
// them again when it is full, so a campaign's new accounts of the day do not
// meet a brake counted in the morning. 0.70 USD a call (gpt-6-sol).
async function withOpenAI(fn) {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ model: "gpt-6-sol", output: [{ content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 100000, output_tokens: 50000 } }); };
  try { await fn(() => calls); } finally { globalThis.fetch = realFetch; }
}
const BRAKES = { AI_GROUP_BRAKES: { free: { perAccount: 0.25, min: 1 } } };
const envFor = (db, id) => ({ DB: scopedDb(db, id), RAW_DB: db, USER_ID: id, OPENAI_API_KEY: "k", ...BRAKES });
const ask = env => callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });

test("a full group counts its accounts again and goes on with the grown brake", async () => {
  const ids = Array.from({ length: 24 }, (_, i) => 200 + i);
  const db = grantAiConsent(createD1(), ...ids);
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const user = db.sqlite.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, '2026-01-01 00:00:00')");
  // Morning: 4 accounts, a brake of 1 USD.
  for (const id of ids.slice(0, 4)) user.run(id, `u${id}@example.com`);
  await withOpenAI(async calls => {
    await ask(envFor(db, 200));
    await ask(envFor(db, 201));
    assert.equal(calls(), 2);
    // 20 more accounts during the day: the full group counts again (5 USD) and answers.
    for (const id of ids.slice(4)) user.run(id, `u${id}@example.com`);
    await ask(envFor(db, 202));
    assert.equal(calls(), 3);
    assert.equal(db.sqlite.prepare("SELECT brake_usd FROM ai_spend_groups WHERE grp = 'free'").get().brake_usd, 6);
  });
});
