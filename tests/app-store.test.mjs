// Aurin Pro from the App Store (src/app-store.js): the signed transactions the
// app sends and Apple's Server Notifications V2. The fixtures in
// fixtures/app-store/ are a chain made like Apple's (a P-384 root, an
// intermediate with Apple's marker, a P-256 leaf with the StoreKit marker);
// the tests trust that root instead of Apple Root CA - G3.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, createPrivateKey, sign, X509Certificate } from "node:crypto";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { APPLE_ROOT_CA_G3, verifyAppStoreJws, saveAppTransaction, handleAppStoreNotification, appAccountToken, storePurchase } from "../src/app-store.js";
import { subscriptionStatus } from "../src/subscription.js";
import { handleAccountApi } from "../src/routes-account.js";

const fixture = name => readFileSync(new URL(`./fixtures/app-store/${name}`, import.meta.url), "utf8");
const der = name => new X509Certificate(fixture(name)).raw.toString("base64");
const ROOT = createHash("sha256").update(new X509Certificate(fixture("root.pem")).raw).digest("hex");
const roots = [ROOT];
const key = createPrivateKey(fixture("leaf.key"));
const chain = [der("leaf.pem"), der("inter.pem"), der("root.pem")];
const b64url = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

function jws(payload, { x5c = chain, alg = "ES256" } = {}) {
  const head = b64url({ alg, x5c }) + "." + b64url(payload);
  return head + "." + sign("sha256", Buffer.from(head), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
}

const DAY = 86400000;
const now = Date.now();
const transaction = (extra = {}) => ({
  transactionId: "2000000001", originalTransactionId: "2000000000", bundleId: "health.aurin.app",
  productId: "health.aurin.app.pro.yearly", purchaseDate: now, expiresDate: now + 7 * DAY, type: "Auto-Renewable Subscription",
  environment: "Sandbox", signedDate: now, offerType: 1, ...extra
});

function setup() {
  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE subscriptions (user_id INTEGER PRIMARY KEY,plan TEXT NOT NULL DEFAULT 'free',valid_until TEXT)");
  const user = id => ({ DB: scopedDb(raw, id), RAW_DB: raw, USER_ID: id });
  return { raw, user };
}
const row = (raw, id) => raw.sqlite.prepare("SELECT * FROM subscriptions WHERE user_id=?").get(id);

test("an offer code (the pilot's discount, a gift) is kept with the subscription; a free promotional offer is a free week", async () => {
  const { raw, user } = setup();
  await saveAppTransaction(user(1), { signedTransaction: jws(transaction({ offerType: 3, environment: "Production", offerDiscountType: "PAY_UP_FRONT" })) }, { roots });
  assert.deepEqual([row(raw, 1).free_trial, row(raw, 1).offer_type], [0, 3]);
  await saveAppTransaction(user(2), { signedTransaction: jws(transaction({ originalTransactionId: "3000000000", offerType: 2, offerDiscountType: "FREE_TRIAL" })) }, { roots });
  assert.deepEqual([row(raw, 2).free_trial, row(raw, 2).offer_type], [1, 2]);
});

test("Apple's root is pinned by its SHA-256", () => {
  assert.equal(APPLE_ROOT_CA_G3, "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
});

test("a JWS signed through the chain verifies, anything else does not", async () => {
  const payload = await verifyAppStoreJws(jws(transaction()), { roots });
  assert.equal(payload.productId, "health.aurin.app.pro.yearly");
  // Apple's root by default: the test chain is not Apple's.
  await assert.rejects(verifyAppStoreJws(jws(transaction())), /not signed by the App Store|nepodepsal App Store/);
  // A changed payload, another algorithm, a leaf without the StoreKit marker, a short chain.
  const [h, , s] = jws(transaction()).split(".");
  await assert.rejects(verifyAppStoreJws([h, b64url(transaction({ expiresDate: now + 999 * DAY })), s].join("."), { roots }), { status: 400 });
  await assert.rejects(verifyAppStoreJws(jws(transaction(), { alg: "HS256" }), { roots }), { status: 400 });
  await assert.rejects(verifyAppStoreJws(jws(transaction(), { x5c: [der("plain-leaf.pem"), chain[1], chain[2]] }), { roots }), { status: 400 });
  await assert.rejects(verifyAppStoreJws(jws(transaction(), { x5c: [chain[0], chain[2], chain[2]] }), { roots }), { status: 400 });
  await assert.rejects(verifyAppStoreJws(jws(transaction(), { x5c: chain.slice(0, 2) }), { roots }), { status: 400 });
  await assert.rejects(verifyAppStoreJws("not.a.jws", { roots }), { status: 400 });
  // Signed before the certificates were valid.
  await assert.rejects(verifyAppStoreJws(jws(transaction({ signedDate: Date.UTC(2001, 0, 1) })), { roots }), { status: 400 });
});

test("the app's transaction unlocks Pro for the account until it expires", async () => {
  const { raw, user } = setup();
  const env = user(1);
  const token = await appAccountToken(env);
  assert.match(token, /^[0-9a-f-]{36}$/);
  assert.equal(await appAccountToken(env), token, "one token per account");
  assert.equal(await storePurchase(env), null);
  const saved = await saveAppTransaction(env, { signedTransaction: jws(transaction({ appAccountToken: token })) }, { roots });
  assert.equal(saved.plan, "ai");
  assert.equal(Date.parse(saved.validUntil), now + 7 * DAY);
  assert.equal(row(raw, 1).original_transaction_id, "2000000000");
  assert.deepEqual([row(raw, 1).free_trial, row(raw, 1).offer_type], [1, 1], "the free week, Apple's introductory offer");
  const purchase = await storePurchase(env);
  assert.equal(purchase.active, true);
  assert.equal(purchase.productId, "health.aurin.app.pro.yearly");
  assert.equal(purchase.environment, "Sandbox");
  // With the paywall on, the bought plan is what gives AI.
  const paid = { ...env, AI_PAYWALL_ENABLED: "true", CONSENT_REQUIRED: false, DB: env.DB };
  raw.sqlite.exec("CREATE TABLE IF NOT EXISTS user_consents (user_id INTEGER NOT NULL, kind TEXT NOT NULL, version TEXT, granted_at TEXT, withdrawn_at TEXT, PRIMARY KEY(user_id, kind))");
  raw.sqlite.prepare("INSERT INTO user_consents VALUES (1,'health','2026-10-11','2026-10-11',NULL),(1,'ai','2026-10-11','2026-10-11',NULL),(2,'health','2026-10-11','2026-10-11',NULL),(2,'ai','2026-10-11','2026-10-11',NULL)").run();
  assert.equal((await subscriptionStatus(paid)).plan, "ai");
  assert.equal((await subscriptionStatus({ ...user(2), AI_PAYWALL_ENABLED: "true" })).plan, "free");
  // In the pilot everyone has AI, bought or not.
  const pilot = await subscriptionStatus(user(2));
  assert.equal(pilot.mode, "pilot");
  assert.equal(pilot.aiAccess, true);
  assert.equal(pilot.checkoutAvailable, false);
  assert.equal((await subscriptionStatus({ ...user(2), APP_STORE_APP_ID: "6740000000" })).checkoutAvailable, true);
});

test("a purchase of another account, app or plan is refused", async () => {
  const { raw, user } = setup();
  const first = user(1), second = user(2);
  const token = await appAccountToken(first);
  await assert.rejects(saveAppTransaction(second, { signedTransaction: jws(transaction({ appAccountToken: token })) }, { roots }), { status: 409 });
  // A code redeemed outside the app has no token: the first account to send it keeps it.
  await saveAppTransaction(first, { signedTransaction: jws(transaction()) }, { roots });
  await assert.rejects(saveAppTransaction(second, { signedTransaction: jws(transaction()) }, { roots }), { status: 409 });
  assert.equal(row(raw, 2).original_transaction_id, null);
  await assert.rejects(saveAppTransaction(first, { signedTransaction: jws(transaction({ bundleId: "health.aurin.other" })) }, { roots }), { status: 400 });
  await assert.rejects(saveAppTransaction(first, { signedTransaction: jws(transaction({ productId: "health.aurin.app.coins" })) }, { roots }), { status: 400 });
  await assert.rejects(saveAppTransaction(first, { signedTransaction: jws(transaction({ environment: "Xcode" })) }, { roots }), { status: 400 });
  await assert.rejects(saveAppTransaction(first, { signedTransaction: "" }, { roots }), { status: 400 });
});

test("an older transaction does not undo a newer one", async () => {
  const { raw, user } = setup();
  const env = user(1);
  await saveAppTransaction(env, { signedTransaction: jws(transaction({ expiresDate: now + 365 * DAY, signedDate: now + 1000 })) }, { roots });
  await saveAppTransaction(env, { signedTransaction: jws(transaction({ expiresDate: now + 7 * DAY, signedDate: now })) }, { roots });
  assert.equal(Date.parse(row(raw, 1).valid_until), now + 365 * DAY);
});

const notify = (payload, env, options = { roots }) => handleAppStoreNotification(new Request("https://aurin.health/webhooks/app-store", { method: "POST", body: JSON.stringify({ signedPayload: jws(payload) }) }), env, options);
const notification = (type, tx, extra = {}) => ({
  notificationType: type, notificationUUID: crypto.randomUUID(), version: "2.0", signedDate: now + 1000,
  data: { bundleId: "health.aurin.app", environment: tx.environment || "Sandbox", appAppleId: 6740000000, signedTransactionInfo: jws(tx), ...extra }
});

test("Server Notifications renew, expire, refund and revoke the same row", async () => {
  const { raw, user } = setup();
  const env = user(1);
  const token = await appAccountToken(env);
  const central = { DB: raw };
  await saveAppTransaction(env, { signedTransaction: jws(transaction({ appAccountToken: token })) }, { roots });

  // A renewal a year on, found by the token.
  let answer = await notify(notification("DID_RENEW", transaction({ appAccountToken: token, transactionId: "2000000002", expiresDate: now + 372 * DAY, signedDate: now + 2000 }),
    { signedRenewalInfo: jws({ originalTransactionId: "2000000000", autoRenewStatus: 1, signedDate: now + 2000 }) }), central);
  assert.equal(answer.status, 200);
  assert.equal(row(raw, 1).plan, "ai");
  assert.equal(Date.parse(row(raw, 1).valid_until), now + 372 * DAY);
  assert.equal(row(raw, 1).auto_renew, 1);

  // Grace period: Pro stays on while Apple retries the payment.
  await notify(notification("DID_FAIL_TO_RENEW", transaction({ expiresDate: now - DAY, signedDate: now + 3000 }),
    { signedRenewalInfo: jws({ originalTransactionId: "2000000000", autoRenewStatus: 1, gracePeriodExpiresDate: now + 6 * DAY, signedDate: now + 3000 }) }), central);
  assert.equal(Date.parse(row(raw, 1).valid_until), now + 6 * DAY);

  // Expired, found by the original transaction id (no token).
  await notify(notification("EXPIRED", transaction({ expiresDate: now - DAY, signedDate: now + 4000 })), central);
  assert.equal(row(raw, 1).plan, "free");
  assert.equal((await storePurchase(env)).active, false);

  // Bought again, then refunded.
  await notify(notification("SUBSCRIBED", transaction({ expiresDate: now + 30 * DAY, signedDate: now + 5000 })), central);
  assert.equal(row(raw, 1).plan, "ai");
  await notify(notification("REFUND", transaction({ expiresDate: now + 30 * DAY, revocationDate: now + 5500, signedDate: now + 6000 })), central);
  assert.equal(row(raw, 1).plan, "free");
  assert.equal(Date.parse(row(raw, 1).valid_until), now + 5500);

  // A stale notification arriving late changes nothing.
  await notify(notification("DID_RENEW", transaction({ expiresDate: now + 400 * DAY, signedDate: now + 100 })), central);
  assert.equal(row(raw, 1).plan, "free");

  // Revoked by Family Sharing.
  await notify(notification("REFUND_REVERSED", transaction({ expiresDate: now + 30 * DAY, signedDate: now + 7000 })), central);
  assert.equal(row(raw, 1).plan, "ai");
  await notify(notification("REVOKE", transaction({ expiresDate: now + 30 * DAY, revocationDate: now + 7500, signedDate: now + 8000 })), central);
  assert.equal(row(raw, 1).plan, "free");
});

test("Server Notifications: test pings, unknown accounts, other apps and bad signatures", async () => {
  const { raw } = setup();
  const central = { DB: raw, APP_STORE_APP_ID: "6740000000" };
  let answer = await notify({ notificationType: "TEST", signedDate: now, data: { bundleId: "health.aurin.app", environment: "Sandbox" } }, central);
  assert.equal(answer.status, 200);
  // A purchase no account has sent yet: answered, so Apple does not retry it.
  answer = await notify(notification("SUBSCRIBED", transaction({ originalTransactionId: "999" })), central);
  assert.equal(answer.status, 200);
  assert.equal((await answer.json()).unknown, true);
  answer = await notify({ ...notification("SUBSCRIBED", transaction()), data: { ...notification("SUBSCRIBED", transaction()).data, bundleId: "other.app" } }, central);
  assert.equal(answer.status, 400);
  // Production must name this app's Apple ID.
  answer = await notify({ ...notification("SUBSCRIBED", transaction({ environment: "Production" })), data: { ...notification("SUBSCRIBED", transaction({ environment: "Production" })).data, appAppleId: 1 } }, central);
  assert.equal(answer.status, 400);
  // Not signed by Apple (the default root).
  answer = await notify(notification("SUBSCRIBED", transaction()), central, {});
  assert.equal(answer.status, 400);
  answer = await handleAppStoreNotification(new Request("https://aurin.health/webhooks/app-store", { method: "POST", body: "{" }), central, { roots });
  assert.equal(answer.status, 400);
});

test("the routes: the token comes with the status, a transaction needs the app's origin", async () => {
  const { user } = setup();
  const env = user(1);
  const url = path => new URL("https://aurin.health" + path);
  const session = { signedIn: true, user: { id: 1 } };
  const status = await handleAccountApi(new Request("https://aurin.health/app/api/subscription"), env, {}, url("/app/api/subscription"), session);
  const body = await status.json();
  assert.match(body.appAccountToken, /^[0-9a-f-]{36}$/);
  assert.equal(body.purchase, null);
  const post = headers => handleAccountApi(new Request("https://aurin.health/app/api/subscription/transaction", { method: "POST", headers, body: JSON.stringify({ signedTransaction: jws(transaction()) }) }), env, {}, url("/app/api/subscription/transaction"), session);
  assert.equal((await post({})).status, 403);
  // Apple's root in the route: the test chain is refused there.
  assert.equal((await post({ Origin: "https://aurin.health" })).status, 400);
  const signedOut = await handleAccountApi(new Request("https://aurin.health/app/api/subscription/transaction", { method: "POST", headers: { Origin: "https://aurin.health" }, body: "{}" }), env, {}, url("/app/api/subscription/transaction"), { signedIn: false });
  assert.equal(signedOut.status, 401);
});
