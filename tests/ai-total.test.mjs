import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { aiSpentTodayAll } from "../src/ai-total.js";

// 100k input + 50k output tokens of gpt-6-sol: 0.70 USD a call.
async function withOpenAI(fn) {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ model: "gpt-6-sol", output: [{ content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 100000, output_tokens: 50000 } }); };
  try { await fn(() => calls); } finally { globalThis.fetch = realFetch; }
}

const mailer = () => { const sent = []; return { sent, EMAIL: { send: async message => { sent.push(message); return { messageId: "m" }; } }, EMAIL_FROM: "noreply@aurin.health" }; };
const envFor = (db, id, extra = {}) => ({ DB: scopedDb(db, id), RAW_DB: db, USER_ID: id, OPENAI_API_KEY: "k", ...extra });

test("the costs of all users add up in the central day total", async () => {
  const db = grantAiConsent(grantAiConsent(createD1(), 7, 8), 9, 8);
  await withOpenAI(async () => {
    await callOpenAI(envFor(db, 7), { feature: "food-lookup", instructions: "x", input: "y" });
    await callOpenAI(envFor(db, 9), { feature: "food-lookup", instructions: "x", input: "y" });
    assert.equal(await aiSpentTodayAll(db), 1.4);
  });
});

test("past the day's brake AI waits for everyone but the owner", async () => {
  const db = grantAiConsent(grantAiConsent(createD1(), 7, 8), 9, 8);
  await withOpenAI(async calls => {
    const limits = { AI_TOTAL_DAILY_LIMIT_USD: "1" };
    await callOpenAI(envFor(db, 7, limits), { feature: "food-lookup", instructions: "x", input: "y" });
    await callOpenAI(envFor(db, 9, limits), { feature: "food-lookup", instructions: "x", input: "y" });
    await assert.rejects(callOpenAI(envFor(db, 7, limits), { feature: "food-lookup", instructions: "x", input: "y" }), error => error.limit === true && error.status === 429);
    assert.equal(calls(), 2);
    await callOpenAI(envFor(db, 9, { ...limits, USER_IS_OWNER: true }), { feature: "food-lookup", instructions: "x", input: "y" });
    assert.equal(calls(), 3);
  });
});

test("the owner gets one e-mail the first time the day passes the alert", async () => {
  const db = grantAiConsent(createD1(), 7, 8), mail = mailer();
  await withOpenAI(async () => {
    const env = envFor(db, 7, { AI_TOTAL_DAILY_ALERT_USD: "1", AI_TOTAL_DAILY_LIMIT_USD: "50", OWNER_EMAIL: "owner@example.com", ...mail });
    await callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
    assert.equal(mail.sent.length, 0);
    await callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
    await callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
    assert.equal(mail.sent.length, 1);
    assert.equal(mail.sent[0].to, "owner@example.com");
    assert.match(mail.sent[0].text, /1\.40 USD/);
  });
});

test("without the settings nothing is limited or sent", async () => {
  const db = grantAiConsent(createD1(), 7, 8);
  await withOpenAI(async calls => {
    for (let i = 0; i < 3; i++) await callOpenAI(envFor(db, 7), { feature: "food-lookup", instructions: "x", input: "y" });
    assert.equal(calls(), 3);
  });
});
