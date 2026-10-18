import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { grantAiConsent } from "./helpers/consent.mjs";
import { isReviewAccount, reviewCodeActive, reviewRefusal, REVIEW_AI_MONTHLY_LIMIT_USD } from "../src/app-review.js";
import { handleEmailLogin, reviewCode, sendCode } from "../src/email-login.js";
import { ensureTenancy, inviteUser, signInEmailUser, scopedDb, _resetTenancyForTest } from "../src/tenancy.js";
import { aiAllowance, aiMonthlyLimitUsd } from "../src/ai-usage.js";
import { localToday } from "../src/user-time.js";
import { callOpenAI } from "../src/coach-assistant.js";

const ORIGIN = "https://petrfitnessdata.eu";
const REVIEW = { APP_REVIEW_EMAIL: "Review@Example.com", APP_REVIEW_CODE: "246810" };
const MIGRATION = ["0014_passkeys_email_codes.sql", "0026_email_code_limits.sql"].map(name => readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8")).join("\n");

test("the fixed review code works until the end of APP_REVIEW_UNTIL (UTC) and never without it", () => {
  const env = { ...REVIEW, APP_REVIEW_UNTIL: "2026-11-30" };
  assert.equal(reviewCode(env, "review@example.com", Date.parse("2026-11-01T12:00:00Z")), "246810", "before the date");
  assert.equal(reviewCode(env, "review@example.com", Date.parse("2026-11-30T00:00:00Z")), "246810", "on the date");
  assert.equal(reviewCode(env, "review@example.com", Date.parse("2026-11-30T23:59:59.999Z")), "246810", "end of the date");
  assert.equal(reviewCode(env, "review@example.com", Date.parse("2026-12-01T00:00:00Z")), null, "after the date");
  assert.equal(reviewCode(env, "someone@example.com", Date.parse("2026-11-01T12:00:00Z")), null, "other addresses");
  // No date, or a date that is not one: fail closed.
  assert.equal(reviewCode(REVIEW, "review@example.com", Date.parse("2026-11-01T12:00:00Z")), null);
  for (const until of ["", "2026-11-31", "30.11.2026", "2026-11-30T23:00", "tomorrow"]) assert.equal(reviewCodeActive({ APP_REVIEW_UNTIL: until }, 0), false, until);
});

async function reviewSetup(extra) {
  _resetTenancyForTest();
  const sent = [];
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1(), EMAIL: { send: async message => { sent.push(message); return { messageId: "m" }; } }, EMAIL_FROM: "noreply@petrfitnessdata.eu", ...REVIEW, ...extra };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(MIGRATION);
  await inviteUser(env.DB, "review@example.com", 1);
  return { env, sent };
}

async function sentCode(extra) {
  const { env, sent } = await reviewSetup(extra);
  const pending = [];
  await handleEmailLogin(new Request(ORIGIN + "/auth/email/start", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify({ email: "review@example.com" }) }), env, "/auth/email/start", { waitUntil: p => pending.push(p) });
  await Promise.all(pending);
  return sent[0].text.match(/\b(\d{6})\b/)[1];
}

test("sign-in: the review address gets a random code once APP_REVIEW_UNTIL is missing or past", async () => {
  assert.equal(await sentCode({ APP_REVIEW_UNTIL: "2999-12-31" }), "246810");
  assert.notEqual(await sentCode({}), "246810");
  assert.notEqual(await sentCode({ APP_REVIEW_UNTIL: "2000-01-01" }), "246810");
});

let caller = 0;
async function tryCode(env, code, time) {
  const real = Date.now;
  Date.now = () => time;
  try {
    const request = new Request(ORIGIN + "/auth/email/verify", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100." + (++caller % 250) }, body: JSON.stringify({ email: "review@example.com", code }) });
    return (await handleEmailLogin(request, env, "/auth/email/verify")).status;
  } finally { Date.now = real; }
}

test("the fixed review code stops working after twenty wrong tries in all, however many days they take", async () => {
  const { env } = await reviewSetup({ APP_REVIEW_UNTIL: "2999-12-31" });
  // Ten wrong tries a day stay under the daily lock of an address, but add up.
  for (const day of ["2026-10-07", "2026-10-08"]) {
    for (let round = 0; round < 2; round++) {
      const time = Date.parse(day + "T08:00:00Z") + round * 61_000;
      assert.equal(await sendCode(env, "review@example.com", "en", { now: time }), true);
      for (let i = 0; i < 5; i++) assert.equal(await tryCode(env, "135790", time + 1000), 400);
    }
  }
  const later = Date.parse("2026-10-09T08:00:00Z");
  assert.equal(await sendCode(env, "review@example.com", "en", { now: later }), true);
  assert.equal(await tryCode(env, "246810", later + 1000), 429, "the right code no longer signs in");
  // A new APP_REVIEW_CODE starts over.
  const renewed = { ...env, APP_REVIEW_CODE: "975310" };
  assert.equal(await sendCode(renewed, "review@example.com", "en", { now: later + 61_000 }), true);
  assert.equal(await tryCode(renewed, "975310", later + 62_000), 200);
});

test("the fixed review code is never for the owner or an admin", async () => {
  const active = { ...REVIEW, APP_REVIEW_UNTIL: "2999-12-31" };
  assert.equal(reviewCode({ ...active, OWNER_EMAIL: " REVIEW@example.com" }, "review@example.com"), null, "the owner");
  const { env, sent } = await reviewSetup({ APP_REVIEW_UNTIL: "2999-12-31" });
  await signInEmailUser(env.DB, env, "review@example.com");
  env.DB.sqlite.exec("UPDATE users SET role = 'admin' WHERE email = 'review@example.com'");
  assert.equal(await sendCode(env, "review@example.com", "en"), true);
  assert.notEqual(sent[0].text.match(/\b(\d{6})\b/)[1], "246810", "an admin gets a random code");
});

test("the review account is the APP_REVIEW_EMAIL user, never the owner", () => {
  assert.equal(isReviewAccount(REVIEW, { email: "review@example.com" }), true);
  assert.equal(isReviewAccount({ ...REVIEW, USER_EMAIL: " REVIEW@example.com" }), true);
  assert.equal(isReviewAccount(REVIEW, { email: "friend@example.com" }), false);
  assert.equal(isReviewAccount(REVIEW, { email: "review@example.com", isOwner: true }), false);
  assert.equal(isReviewAccount({}, { email: "review@example.com" }), false);
  assert.equal(isReviewAccount({ APP_REVIEW_EMAIL: "" }, { email: "" }), false);
});

test("the review account cannot start a connection or send data out; the rest of the app works", async () => {
  const reviewer = { id: 9, email: "review@example.com" }, friend = { id: 3, email: "friend@example.com" };
  const blocked = [["GET", "/oauth/intervals"], ["GET", "/oauth/intervals/callback"], ["GET", "/oauth/google"],
    ["POST", "/app/api/connect/start"], ["POST", "/auth/app/connect"], ["POST", "/app/api/connections"], ["POST", "/app/api/sync/activity"], ["POST", "/app/api/sync/retry"], ["POST", "/app/api/workouts/export"]];
  for (const [method, path] of blocked) {
    const refused = reviewRefusal(REVIEW, reviewer, method, path);
    assert.equal(refused?.status, 403, path);
    assert.equal((await refused.json()).status, "demo_account");
    assert.equal(reviewRefusal(REVIEW, friend, method, path), null, "others: " + path);
  }
  for (const [method, path] of [["POST", "/app/api/health/apple"], ["GET", "/app/api/connections"], ["DELETE", "/app/api/connections"], ["GET", "/app/api/today"], ["POST", "/app/api/assistant"], ["GET", "/oauth/googlex"]]) {
    assert.equal(reviewRefusal(REVIEW, reviewer, method, path), null, path);
  }
  assert.equal(reviewRefusal(REVIEW, null, "GET", "/oauth/intervals"), null, "signed out: the route's own 401");
  // Checked before any connection or sync route, and the cron jobs skip the account.
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.ok(entry.indexOf("reviewRefusal(rawEnv, user, request.method, url.pathname)") < entry.indexOf("handleGoogleOAuth(request, env, url.pathname)"));
  assert.match(entry, /if \(isReviewAccount\(env, user\)\) continue;/);
});

test("the review account's AI budget is a small fixed monthly cap", async () => {
  const review = { ...REVIEW, USER_EMAIL: "review@example.com" };
  assert.equal(aiMonthlyLimitUsd(review), REVIEW_AI_MONTHLY_LIMIT_USD);
  assert.equal(aiMonthlyLimitUsd({ ...review, AI_MONTHLY_LIMIT_USD: "50" }), REVIEW_AI_MONTHLY_LIMIT_USD);
  assert.equal(aiMonthlyLimitUsd({ ...review, AI_MONTHLY_LIMIT_USD: "0" }), 0);
  assert.equal(aiMonthlyLimitUsd({ ...REVIEW, USER_EMAIL: "friend@example.com", AI_MONTHLY_LIMIT_USD: "50" }), 50);
  // Once this month's spending reaches the cap, the next call is refused before asking.
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({}); };
  try {
    const db = grantAiConsent(createD1(), 7), env = { DB: scopedDb(db, 7), USER_ID: 7, OPENAI_API_KEY: "k", ...review };
    await aiAllowance(env);
    db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, cost_usd) VALUES (7, ?, 0.5)").run(localToday());
    await assert.rejects(callOpenAI(env, { instructions: "x", input: "y" }), error => error.limit === true && /pozastavená/.test(error.message));
    assert.equal(calls, 0);
  } finally { globalThis.fetch = realFetch; }
});
