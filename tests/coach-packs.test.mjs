// Extra coach messages bought in the app (src/coach-packs.js): the purchase the
// app sends, Apple's refund, and the coach taking them once the week's are used up.
// The signing chain is the one of app-store.test.mjs (fixtures/app-store/).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, createPrivateKey, sign, X509Certificate } from "node:crypto";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { saveAppTransaction, handleAppStoreNotification, appAccountToken } from "../src/app-store.js";
import { packMessages, packMessagesLeft, packPurchases } from "../src/coach-packs.js";
import { coachAllowance, checkCoachMessage, claimCoachMessage, recordCoachMessage, releaseCoachMessage } from "../src/coach-allowance.js";

const fixture = name => readFileSync(new URL(`./fixtures/app-store/${name}`, import.meta.url), "utf8");
const der = name => new X509Certificate(fixture(name)).raw.toString("base64");
const roots = [createHash("sha256").update(new X509Certificate(fixture("root.pem")).raw).digest("hex")];
const key = createPrivateKey(fixture("leaf.key"));
const chain = [der("leaf.pem"), der("inter.pem"), der("root.pem")];
const b64url = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const jws = payload => {
  const head = b64url({ alg: "ES256", x5c: chain }) + "." + b64url(payload);
  return head + "." + sign("sha256", Buffer.from(head), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
};

const now = Date.now();
const TODAY = "2026-10-18";
const pack = (extra = {}) => ({
  transactionId: "3000000001", originalTransactionId: "3000000001", bundleId: "health.aurin.app",
  productId: "health.aurin.app.coach.messages40", purchaseDate: now, type: "Consumable",
  environment: "Production", signedDate: now, price: 3990, currency: "EUR", ...extra
});

function setup(extra = {}) {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE subscriptions (user_id INTEGER PRIMARY KEY,plan TEXT NOT NULL DEFAULT 'free',valid_until TEXT)");
  raw.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, data_type TEXT, source_family TEXT, start_time TEXT, end_time TEXT, payload_json TEXT, record_role TEXT)");
  const user = id => ({ DB: scopedDb(raw, id), RAW_DB: raw, USER_ID: id, ...extra });
  return { raw, user };
}
const buy = async (env, tx) => saveAppTransaction(env, { signedTransaction: jws({ appAccountToken: await appAccountToken(env), ...tx }) }, { roots });
async function send(env, chatId) {
  const claim = await claimCoachMessage(env, chatId, { today: TODAY, now });
  return recordCoachMessage(env, chatId, claim, { today: TODAY, now });
}

test("the two packs carry 40 and 100 messages, nothing else does", () => {
  assert.equal(packMessages("health.aurin.app.coach.messages40", "health.aurin.app"), 40);
  assert.equal(packMessages("health.aurin.app.coach.messages100", "health.aurin.app"), 100);
  assert.equal(packMessages("health.aurin.app.pro.yearly", "health.aurin.app"), 0);
  assert.equal(packMessages("other.app.coach.messages40", "health.aurin.app"), 0);
});

test("a bought pack adds its messages once and stays with the account that bought it", async () => {
  const { raw, user } = setup();
  const env = user(1);
  const saved = await buy(env, pack());
  assert.deepEqual([saved.messages, saved.added, saved.left], [40, true, 40]);
  const again = await buy(env, pack());
  assert.deepEqual([again.added, again.left], [false, 40], "the app sending it again changes nothing");
  await assert.rejects(buy(user(2), pack()), { status: 409 });
  assert.equal(await packMessagesLeft(user(2)), 0);
  const [row] = await packPurchases(env);
  assert.deepEqual([row.messages, row.price, row.currency, row.refunded], [40, 3.99, "EUR", false]);
  // The account is deleted (its rows go): the same purchase cannot fill a new account.
  raw.sqlite.exec("DELETE FROM coach_pack_purchases; DELETE FROM coach_pack_balance");
  await assert.rejects(buy(user(3), pack()), { status: 409 });
});

test("a Sandbox purchase counts only on the test server", async () => {
  const live = setup().user(1);
  const sandbox = await buy(live, pack({ environment: "Sandbox" }));
  assert.deepEqual([sandbox.added, sandbox.left], [false, 0]);
  assert.equal((await packPurchases(live))[0].counted, false, "it still shows among the purchases");
  const staging = setup({ ENVIRONMENT: "staging" }).user(1);
  assert.equal((await buy(staging, pack({ environment: "Sandbox", productId: "health.aurin.app.coach.messages100" }))).left, 100);
});

test("Apple's refund takes the pack's messages away, the used ones stay used", async () => {
  const { raw, user } = setup();
  const env = user(1);
  await buy(env, pack());
  await buy(env, pack({ transactionId: "3000000002", originalTransactionId: "3000000002", productId: "health.aurin.app.coach.messages100" }));
  assert.equal(await packMessagesLeft(env), 140);
  const body = {
    notificationType: "REFUND", notificationUUID: crypto.randomUUID(), version: "2.0", signedDate: now + 1000,
    data: { bundleId: "health.aurin.app", environment: "Production", appAppleId: 6740000000, signedTransactionInfo: jws(pack({ revocationDate: now + 1000 })) }
  };
  const response = await handleAppStoreNotification(new Request("https://aurin.health/webhooks/app-store", { method: "POST", body: JSON.stringify({ signedPayload: jws(body) }) }), { DB: raw }, { roots });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).refunded, true);
  assert.equal(await packMessagesLeft(env), 100);
  assert.equal((await packPurchases(env)).find(p => p.messages === 40).refunded, true);
});

test("the coach takes bought messages after the week's and the conversation's extra ones", async () => {
  const { user } = setup({ COACH_WEEKLY_MESSAGES: "2" });
  const env = user(1);
  await buy(env, pack());
  let allowance = await coachAllowance(env, TODAY);
  assert.deepEqual([allowance.left, allowance.weekLeft, allowance.extra, allowance.near], [42, 2, 40, false]);
  await send(env, 1);
  await send(env, 1);
  assert.equal((await checkCoachMessage(env, 1, { today: TODAY, now })).kind, "extra", "the running conversation's 2 free ones first");
  await send(env, 1);
  await send(env, 1);
  assert.equal((await checkCoachMessage(env, 1, { today: TODAY, now })).kind, "pack");
  assert.equal((await checkCoachMessage(env, null, { today: TODAY, now })).kind, "pack", "a new conversation too");
  const after = await send(env, 2);
  assert.deepEqual([after.left, after.weekLeft, after.extra, after.more], [39, 0, 39, true]);
  // A failed answer gives the bought message back.
  const claim = await claimCoachMessage(env, 3, { today: TODAY, now });
  assert.equal(await packMessagesLeft(env), 38);
  await releaseCoachMessage(env, claim);
  assert.equal(await packMessagesLeft(env), 39);
  assert.equal((await coachAllowance(env, TODAY)).used, 2, "bought messages do not count against the week");
});

test("the low warning comes only when the week's and bought ones together run low", async () => {
  const { user } = setup({ COACH_WEEKLY_MESSAGES: "30" });
  const env = user(1);
  await buy(env, pack());
  for (let i = 0; i < 30; i++) await send(env, 100 + i);
  const allowance = await coachAllowance(env, TODAY);
  assert.deepEqual([allowance.left, allowance.near], [40, false]);
  for (let i = 0; i < 33; i++) await send(env, 200 + i);
  assert.deepEqual([(await coachAllowance(env, TODAY)).left, (await coachAllowance(env, TODAY)).near], [7, true]);
  for (let i = 0; i < 7; i++) await send(env, 300 + i);
  await assert.rejects(claimCoachMessage(env, null, { today: TODAY, now }), error => error.status === 429 && error.coachAllowance.exhausted === true);
});
