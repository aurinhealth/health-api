import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { scopedDb } from "../src/tenancy.js";
import { callOpenAI } from "../src/coach-assistant.js";
import { estimateAiCostUsd } from "../src/ai-usage.js";
import { aiSpentTodayAll } from "../src/ai-total.js";

// Security audit 2026-11-04, points 1, 3 and 40: a full group stops only the
// accounts that spent past their share; calls running at once are held in the
// group's day before they run; a call that broke off still counts.

// 100k input + 50k output tokens of gpt-6-sol: 0.70 USD a call, after `delayMs`.
async function withOpenAI(fn, { delayMs = 0, reply = null } = {}) {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    return reply ? reply() : Response.json({ model: "gpt-6-sol", output: [{ content: [{ type: "output_text", text: "ok" }] }], usage: { input_tokens: 100000, output_tokens: 50000 } });
  };
  try { await fn(() => calls); } finally { globalThis.fetch = realFetch; }
}
const envFor = (db, id, extra = {}) => ({ DB: scopedDb(db, id), RAW_DB: db, USER_ID: id, OPENAI_API_KEY: "k", ...extra });
const ask = env => callOpenAI(env, { feature: "food-lookup", instructions: "x", input: "y" });
const reserved = estimateAiCostUsd("gpt-6-sol", { instructions: "x", input: "y", maxOutputTokens: 5000 });
const today = () => new Date().toISOString().slice(0, 10);
const groupSpent = (db, grp) => db.sqlite.prepare("SELECT cost_usd FROM ai_spend_groups WHERE grp = ? AND day = ?").get(grp, today())?.cost_usd ?? 0;

// Accounts without a purchase, older than a week: the "free" group (the pilot).
function pilot(ids) {
  const db = grantAiConsent(createD1(), ...ids);
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const user = db.sqlite.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, '2026-01-01 00:00:00')");
  for (const id of ids) user.run(id, `u${id}@example.com`);
  return db;
}
// A free group of 20 accounts: brake 20 × 0.25 = 5 USD, each account's share 0.25 USD.
const FREE = { AI_GROUP_BRAKES: { free: { perAccount: 0.25, min: 1, max: 5 } } };
const ids = Array.from({ length: 20 }, (_, i) => 100 + i);

test("a full group stops the accounts that spent past their share; the others go on up to twice the brake", async () => {
  const db = pilot(ids);
  await withOpenAI(async calls => {
    // Accounts 100-107 fill the brake (8 × 0.70 = 5.6 USD past 5).
    for (const id of ids.slice(0, 8)) await ask(envFor(db, id, FREE));
    assert.equal(groupSpent(db, "free"), 5.6);
    await assert.rejects(ask(envFor(db, 100, FREE)), error => error.status === 429, "an account past its share waits until tomorrow");
    assert.equal(calls(), 8);
    // Accounts that spent nothing today still get their answer.
    for (const id of ids.slice(8, 15)) await ask(envFor(db, id, FREE));
    assert.equal(calls(), 15);
    assert.equal(groupSpent(db, "free"), 10.5);
    // Past twice the brake (10 USD) the group waits, every account in it.
    await assert.rejects(ask(envFor(db, 115, FREE)), error => error.status === 429);
    assert.equal(calls(), 15);
  });
});

test("a fixed brake still stops the whole group", async () => {
  const db = grantAiConsent(createD1(), 7, 8);
  await withOpenAI(async calls => {
    const limits = { AI_GROUP_BRAKES: { new: { usd: 1 } } };
    await ask(envFor(db, 7, limits));
    await ask(envFor(db, 7, limits));
    await assert.rejects(ask(envFor(db, 8, limits)), error => error.status === 429, "a fixed brake has no share");
    assert.equal(calls(), 2);
  });
});

test("new accounts made to use up the brake do not stop the AI of the others who joined this week", async () => {
  // Accounts made today, no purchase: the "new" group. They are not counted, so
  // the brake stays at its least (1 USD here), each account's share 0.25 USD.
  const db = grantAiConsent(createD1(), ...ids);
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const id of ids) db.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(id, `u${id}@example.com`);
  const NEW = { AI_GROUP_BRAKES: { new: { perAccount: 0.25, min: 1 } } };
  await withOpenAI(async calls => {
    await ask(envFor(db, 100, NEW));
    await ask(envFor(db, 101, NEW));
    assert.equal(groupSpent(db, "new"), 1.4);
    await assert.rejects(ask(envFor(db, 100, NEW)), error => error.status === 429, "an account past its share waits");
    await ask(envFor(db, 102, NEW));
    assert.equal(calls(), 3, "an account that spent nothing today still gets its answer");
    // Past twice the brake (2 USD) the group waits, every account in it.
    await assert.rejects(ask(envFor(db, 103, NEW)), error => error.status === 429);
    assert.equal(calls(), 3);
  });
});

test("the App Review account is not stopped by its group's brake", async () => {
  const db = pilot([7, 8]);
  await withOpenAI(async calls => {
    const limits = { AI_GROUP_BRAKES: { free: { usd: 0.5 } }, APP_REVIEW_EMAIL: "review@example.com" };
    await ask(envFor(db, 7, limits));
    await assert.rejects(ask(envFor(db, 8, limits)), error => error.status === 429);
    await ask(envFor(db, 8, { ...limits, USER_EMAIL: "review@example.com" }));
    assert.equal(calls(), 2);
  });
});

test("calls running at the same time are held in the group's day, so they cannot run past its brake", async () => {
  const db = grantAiConsent(createD1(), ...ids);
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS ai_spend_groups (day TEXT NOT NULL, grp TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, brake_usd REAL, alerted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, grp))");
  db.sqlite.prepare("INSERT INTO ai_spend_groups (day, grp, cost_usd, brake_usd) VALUES (?, 'new', 4.9, 5)").run(today());
  const big = { feature: "assistant", instructions: "x", input: "y", maxOutputTokens: 25000 };
  await withOpenAI(async calls => {
    const runs = ids.slice(0, 8).flatMap(id => [0, 1, 2].map(() => callOpenAI(envFor(db, id, { AI_GROUP_BRAKES: { new: { usd: 5 } } }), big)));
    const results = await Promise.allSettled(runs);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1, "one call fits under the brake, 23 wait");
    assert.equal(calls(), 1);
    assert.ok(results.filter(r => r.status === "rejected").every(r => r.reason.status === 429));
    assert.equal(groupSpent(db, "new"), 5.6, "4.9 + the one answer's 0.70");
  }, { delayMs: 25 });
});

test("a call the AI service refused gives its hold back; one that broke off keeps it in the group and the day", async () => {
  const db = pilot([7]);
  await withOpenAI(async () => {
    await assert.rejects(ask(envFor(db, 7, FREE)), /400/);
  }, { reply: () => Response.json({ error: { message: "Invalid model" } }, { status: 400 }) });
  assert.equal(groupSpent(db, "free"), 0);
  assert.equal(await aiSpentTodayAll(db), 0);
  await withOpenAI(async () => {
    await assert.rejects(ask(envFor(db, 7, FREE)), /timed out/);
  }, { reply: () => { throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }); } });
  assert.equal(groupSpent(db, "free"), reserved, "the model may have worked on it");
  assert.equal(await aiSpentTodayAll(db), reserved);
});

test("past the brake an account's calls at the same time pass one by one, on the group's UTC day", async () => {
  const db = pilot(ids);
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS ai_spend_groups (day TEXT NOT NULL, grp TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, brake_usd REAL, alerted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, grp))");
  db.sqlite.prepare("INSERT INTO ai_spend_groups (day, grp, cost_usd, brake_usd) VALUES (?, 'free', 5, 5)").run(today());
  await withOpenAI(async calls => {
    const runs = [0, 1, 2].map(() => callOpenAI(envFor(db, 100, FREE), { feature: "assistant", instructions: "x", input: "y", maxOutputTokens: 25000 }));
    const results = await Promise.allSettled(runs);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1, "the first one held counts against the others");
    assert.equal(calls(), 1);
  }, { delayMs: 25 });
  // A zone far east puts the rows on the account's next day: still today in UTC.
  db.sqlite.exec("UPDATE ai_usage SET day = date('now', '+1 day')");
  await withOpenAI(async () => {
    await assert.rejects(ask(envFor(db, 100, FREE)), error => error.status === 429);
  });
});
