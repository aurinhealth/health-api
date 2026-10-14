import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";
import { apnsJwt, pkcs8FromP8, sendPush, sendMorningReadiness, handlePushToken, savePushToken, listPushTokens, readinessMessage, hasLastNight, inMorningWindow, pushConfigured, APNS_TOPIC, _resetPushForTest } from "../src/push.js";
import { withLang } from "../src/lang.js";
import { withTimeZone } from "../src/user-time.js";

const migration = readFileSync(new URL("../migrations/0022_push_tokens.sql", import.meta.url), "utf8");
const TOKEN_A = "a".repeat(64), TOKEN_B = "b1".repeat(32);
const ORIGIN = "https://x.test";

const b64 = bytes => Buffer.from(bytes).toString("base64");
const fromB64url = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

// A P-256 key like the .p8 file Apple gives out (PKCS#8 in PEM armour).
async function testKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const body = b64(der).match(/.{1,64}/g).join("\n");
  return { publicKey: pair.publicKey, p8: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n` };
}
const KEY = await testKey();

let nextUser = 100;
function setup({ secrets = true, language = null, extra = {} } = {}) {
  const raw = createD1();
  raw.sqlite.exec(migration);
  const userId = nextUser++;
  if (language) {
    raw.sqlite.exec("CREATE TABLE IF NOT EXISTS user_language (user_id INTEGER PRIMARY KEY, language TEXT NOT NULL, units TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    raw.sqlite.prepare("INSERT INTO user_language(user_id,language) VALUES(?,?)").run(userId, language);
  }
  const env = { DB: scopedDb(raw, userId), USER_ID: userId, ...(secrets ? { APNS_KEY_P8: KEY.p8, APNS_KEY_ID: "KEY1234567", APPLE_TEAM_ID: "TEAM123456" } : {}), ...extra };
  return { raw, env, userId };
}
function fakeApns(answer = () => new Response(null, { status: 200 })) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return answer(url, init); };
  return { calls, fetchImpl };
}
const request = (method, body, origin = ORIGIN) => new Request(ORIGIN + "/app/api/push/token", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
// 07:00 in Prague (summer time) on 2026-10-12.
const MORNING = new Date("2026-10-12T05:00:00Z");

test("the provider token is an ES256 JWT signed with the .p8 key and kept for 50 minutes", async () => {
  _resetPushForTest();
  const env = { APNS_KEY_P8: KEY.p8, APNS_KEY_ID: "KEY1234567", APPLE_TEAM_ID: "TEAM123456" };
  const now = Date.parse("2026-10-12T05:00:00Z");
  const jwt = await apnsJwt(env, now);
  const [header, claims, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(fromB64url(header)), { alg: "ES256", kid: "KEY1234567" });
  assert.deepEqual(JSON.parse(fromB64url(claims)), { iss: "TEAM123456", iat: now / 1000 });
  const raw = fromB64url(signature);
  assert.equal(raw.length, 64);
  assert.equal(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, KEY.publicKey, raw, new TextEncoder().encode(header + "." + claims)), true);
  assert.doesNotMatch(jwt, /[+/=]/);
  assert.equal(await apnsJwt(env, now + 49 * 60000), jwt);
  assert.notEqual(await apnsJwt(env, now + 51 * 60000), jwt);
});

test("the .p8 secret is read with or without its line breaks", () => {
  const der = pkcs8FromP8(KEY.p8);
  assert.deepEqual(pkcs8FromP8(KEY.p8.replace(/\n/g, "\\n")), der);
  assert.deepEqual(pkcs8FromP8(KEY.p8.replace(/\n/g, "")), der);
  assert.equal(der[0], 0x30);
});

test("a push goes to APNs with the app's topic, an alert type and the bearer token", async () => {
  _resetPushForTest();
  const { env } = setup();
  const { calls, fetchImpl } = fakeApns();
  assert.deepEqual(await sendPush(env, { token: TOKEN_A, environment: "production" }, "Ahoj", { fetchImpl }), { ok: true });
  assert.equal(calls[0].url, "https://api.push.apple.com/3/device/" + TOKEN_A);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["apns-topic"], APNS_TOPIC);
  assert.equal(APNS_TOPIC, "eu.petrfitnessdata.loadwise.native");
  assert.equal(calls[0].init.headers["apns-push-type"], "alert");
  assert.match(calls[0].init.headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.deepEqual(calls[0].body, { aps: { alert: "Ahoj", sound: "default" } });
  // APNS_SANDBOX=1, or a token from a development build, goes to the sandbox.
  await sendPush({ ...env, APNS_SANDBOX: "1" }, { token: TOKEN_A, environment: "production" }, "x", { fetchImpl });
  await sendPush(env, { token: TOKEN_A, environment: "development" }, "x", { fetchImpl });
  assert.equal(new URL(calls[1].url).host, "api.sandbox.push.apple.com");
  assert.equal(new URL(calls[2].url).host, "api.sandbox.push.apple.com");
});

test("without the APNs secrets nothing is sent and nothing fails", async () => {
  const { env } = setup({ secrets: false });
  await savePushToken(env.DB, TOKEN_A);
  const { calls, fetchImpl } = fakeApns();
  assert.equal(pushConfigured(env), false);
  assert.deepEqual(await sendPush(env, { token: TOKEN_A }, "x", { fetchImpl }), { ok: false, skipped: true });
  let asked = false;
  assert.deepEqual(await sendMorningReadiness(env, { readiness: () => { asked = true; return { score: 80, zone: "green" }; }, now: MORNING, fetchImpl }), { sent: 0, reason: "not-configured" });
  assert.equal(calls.length, 0);
  assert.equal(asked, false);
  assert.equal(pushConfigured({ APNS_KEY_P8: "x", APNS_KEY_ID: "y" }), false);
});

test("POST and DELETE /app/api/push/token save and remove the phone's token", async () => {
  const { raw, env, userId } = setup();
  const options = { signedIn: true, origin: ORIGIN };
  let response = await handlePushToken(request("POST", { token: TOKEN_A.toUpperCase(), environment: "development" }), env, options);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", environment: "development" });
  // Sent again on the next launch: still one row.
  await handlePushToken(request("POST", { token: TOKEN_A, environment: "production" }), env, options);
  await handlePushToken(request("POST", { token: TOKEN_B, environment: "weird" }), env, options);
  assert.deepEqual(raw.sqlite.prepare("SELECT user_id, token, environment FROM push_tokens ORDER BY token").all().map(r => ({ ...r })), [
    { user_id: userId, token: TOKEN_A, environment: "production" },
    { user_id: userId, token: TOKEN_B, environment: "production" }
  ]);
  response = await handlePushToken(request("DELETE", { token: TOKEN_A }), env, options);
  assert.deepEqual(await response.json(), { status: "ok", removed: 1 });
  assert.deepEqual((await listPushTokens(env.DB)).map(r => r.token), [TOKEN_B]);
  // Without a token (sign-out): every token of the user.
  response = await handlePushToken(request("DELETE", {}), env, options);
  assert.deepEqual(await response.json(), { status: "ok", removed: 1 });
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM push_tokens").get().n, 0);
});

test("a token registered by another account on the same phone moves to it", async () => {
  const raw = createD1();
  raw.sqlite.exec(migration);
  const first = { DB: scopedDb(raw, 7), RAW_DB: raw, USER_ID: 7 }, second = { DB: scopedDb(raw, 8), RAW_DB: raw, USER_ID: 8 };
  const options = { signedIn: true, origin: ORIGIN };
  await handlePushToken(request("POST", { token: TOKEN_A }), first, options);
  await handlePushToken(request("POST", { token: TOKEN_B }), first, options);
  await handlePushToken(request("POST", { token: TOKEN_A }), second, options);
  assert.deepEqual(raw.sqlite.prepare("SELECT user_id, token FROM push_tokens ORDER BY user_id, token").all().map(r => ({ ...r })), [
    { user_id: 7, token: TOKEN_B },
    { user_id: 8, token: TOKEN_A }
  ]);
});

test("the token endpoint wants a signed-in user, the site's origin and a real token", async () => {
  const { raw, env } = setup();
  assert.equal((await handlePushToken(request("POST", { token: TOKEN_A }), env, { signedIn: false, origin: ORIGIN })).status, 401);
  assert.equal((await handlePushToken(request("POST", { token: TOKEN_A }, "https://evil.test"), env, { signedIn: true, origin: ORIGIN })).status, 403);
  assert.equal((await handlePushToken(request("DELETE", {}, "https://evil.test"), env, { signedIn: true, origin: ORIGIN })).status, 403);
  assert.equal((await handlePushToken(request("POST", { token: "not-hex" }), env, { signedIn: true, origin: ORIGIN })).status, 400);
  assert.equal((await handlePushToken(request("POST", {}), env, { signedIn: true, origin: ORIGIN })).status, 400);
  assert.equal((await handlePushToken(new Request(ORIGIN + "/app/api/push/token"), env, { signedIn: true, origin: ORIGIN })).status, 405);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM push_tokens").get().n, 0);
});

test("the morning push goes out once a local day, between 5:00 and 11:00", async () => {
  _resetPushForTest();
  const { raw, env } = setup();
  await savePushToken(env.DB, TOKEN_A);
  const { calls, fetchImpl } = fakeApns();
  let asked = 0;
  const readiness = date => { asked++; assert.equal(date, "2026-10-12"); return { score: 72, zone: "green" }; };
  // 4:30 and 11:30 in Prague: too early, too late, and the readiness is not even computed.
  assert.equal((await sendMorningReadiness(env, { readiness, now: new Date("2026-10-12T02:30:00Z"), fetchImpl })).reason, "outside-window");
  assert.equal((await sendMorningReadiness(env, { readiness, now: new Date("2026-10-12T09:30:00Z"), fetchImpl })).reason, "outside-window");
  assert.equal(asked, 0);
  const first = await sendMorningReadiness(env, { readiness, now: MORNING, fetchImpl });
  assert.equal(first.sent, 1);
  assert.equal(first.date, "2026-10-12");
  assert.deepEqual(calls[0].body.aps.alert, "Připravenost 72 · dnes klidně intervaly");
  // The next sync the same morning sends nothing.
  assert.equal((await sendMorningReadiness(env, { readiness, now: new Date("2026-10-12T07:00:00Z"), fetchImpl })).reason, "already-sent");
  assert.equal(calls.length, 1);
  assert.equal(asked, 1);
  assert.deepEqual(raw.sqlite.prepare("SELECT kind, local_date FROM push_log").all().map(r => ({ ...r })), [{ kind: "morning-readiness", local_date: "2026-10-12" }]);
  // The next morning sends again.
  assert.equal((await sendMorningReadiness(env, { readiness: () => ({ score: 40, zone: "yellow" }), now: new Date("2026-10-13T05:00:00Z"), fetchImpl })).sent, 1);
  assert.equal(calls.length, 2);
});

test("the window and the day follow the user's stored time zone", async () => {
  _resetPushForTest();
  const { raw, env, userId } = setup();
  raw.sqlite.exec("CREATE TABLE IF NOT EXISTS user_time_zone (user_id INTEGER PRIMARY KEY, time_zone TEXT NOT NULL, updated_at TEXT)");
  raw.sqlite.prepare("INSERT INTO user_time_zone(user_id,time_zone) VALUES(?,?)").run(userId, "America/New_York");
  await savePushToken(env.DB, TOKEN_A);
  const { calls, fetchImpl } = fakeApns();
  // 07:00 UTC is 3:00 in New York, whatever the request's zone.
  const early = await withTimeZone("Europe/Prague", () => sendMorningReadiness(env, { readiness: () => ({ score: 80, zone: "green" }), now: new Date("2026-10-12T07:00:00Z"), fetchImpl }));
  assert.equal(early.reason, "outside-window");
  // 11:00 UTC is 7:00 there.
  assert.equal((await sendMorningReadiness(env, { readiness: () => ({ score: 80, zone: "green" }), now: new Date("2026-10-12T11:00:00Z"), fetchImpl })).sent, 1);
  assert.equal(calls.length, 1);
});

test("no push without a score, without a token, and in the user's stored language", async () => {
  _resetPushForTest();
  const { raw, env } = setup({ language: "en" });
  const { calls, fetchImpl } = fakeApns();
  assert.equal((await sendMorningReadiness(env, { readiness: () => ({ score: 50, zone: "yellow" }), now: MORNING, fetchImpl })).reason, "no-tokens");
  await savePushToken(env.DB, TOKEN_A);
  assert.equal((await sendMorningReadiness(env, { readiness: () => ({ score: null, zone: null }), now: MORNING, fetchImpl })).reason, "no-score");
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM push_log").get().n, 0);
  // A Czech request does not change the English user's push.
  await withLang("cs", () => sendMorningReadiness(env, { readiness: () => ({ score: 25, zone: "red" }), now: MORNING, fetchImpl }));
  assert.deepEqual(calls.map(c => c.body.aps.alert), ["Readiness 25 · rest or only light movement today"]);
});

test("a token APNs calls dead (410, BadDeviceToken) is deleted", async () => {
  _resetPushForTest();
  const { raw, env } = setup();
  const dead = "c".repeat(64), bad = "d".repeat(64);
  for (const t of [TOKEN_A, dead, bad]) await savePushToken(env.DB, t);
  const { calls, fetchImpl } = fakeApns(url => url.endsWith(dead) ? Response.json({ reason: "Unregistered" }, { status: 410 })
    : url.endsWith(bad) ? Response.json({ reason: "BadDeviceToken" }, { status: 400 }) : new Response(null, { status: 200 }));
  const result = await sendMorningReadiness(env, { readiness: () => ({ score: 90, zone: "green" }), now: MORNING, fetchImpl });
  assert.equal(calls.length, 3);
  assert.equal(result.sent, 1);
  assert.equal(result.removed, 2);
  assert.deepEqual(raw.sqlite.prepare("SELECT token FROM push_tokens").all().map(r => r.token), [TOKEN_A]);
});

test("when no phone got the push the day stays open for the next sync", async () => {
  _resetPushForTest();
  const { raw, env } = setup();
  await savePushToken(env.DB, TOKEN_A);
  const down = fakeApns(() => Response.json({ reason: "ServiceUnavailable" }, { status: 503 }));
  const result = await sendMorningReadiness(env, { readiness: () => ({ score: 70, zone: "green" }), now: MORNING, fetchImpl: down.fetchImpl });
  assert.equal(result.sent, 0);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM push_log").get().n, 0);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM push_tokens").get().n, 1);
  const up = fakeApns();
  assert.equal((await sendMorningReadiness(env, { readiness: () => ({ score: 70, zone: "green" }), now: MORNING, fetchImpl: up.fetchImpl })).sent, 1);
});

test("the advice follows the zone in both languages", () => {
  assert.equal(readinessMessage({ score: 72, zone: "green" }), "Připravenost 72 · dnes klidně intervaly");
  assert.equal(readinessMessage({ score: 50, zone: "yellow" }), "Připravenost 50 · dnes spíš lehčeji, bez intervalů");
  assert.equal(readinessMessage({ score: 20, zone: "red" }), "Připravenost 20 · dnes odpočinek nebo jen lehký pohyb");
  assert.equal(withLang("en", () => readinessMessage({ score: 72, zone: "green" })), "Readiness 72 · intervals are fine today");
  assert.equal(withLang("en", () => readinessMessage({ score: 50, zone: "yellow" })), "Readiness 50 · go easier today, skip the intervals");
});

test("an Apple Health upload with the night that ended today triggers the push", () => {
  withTimeZone("Europe/Prague", () => {
    const now = new Date("2026-10-12T05:00:00Z");
    assert.equal(hasLastNight([{ type: "sleep", start: "2026-10-11T21:00:00Z", end: "2026-10-12T04:30:00Z" }], now), true);
    assert.equal(hasLastNight([{ type: "sleep", start: "2026-10-12T02:00:00+02:00", end: "2026-10-12T06:30:00+02:00", nap: true }], now), false);
    assert.equal(hasLastNight([{ type: "sleep", start: "2026-10-10T21:00:00Z", end: "2026-10-11T04:30:00Z" }], now), false);
    assert.equal(hasLastNight([{ type: "steps", date: "2026-10-12", value: 100 }], now), false);
    assert.equal(hasLastNight(undefined, now), false);
  });
  assert.equal(inMorningWindow(5), true);
  assert.equal(inMorningWindow(10), true);
  assert.equal(inMorningWindow(4), false);
  assert.equal(inMorningWindow(11), false);
});

test("push tokens and the push log are personal data", () => {
  assert.deepEqual(PERSONAL_TABLES.push_tokens, { pk: ["user_id", "token"] });
  assert.deepEqual(PERSONAL_TABLES.push_log, { pk: ["user_id", "kind", "local_date"] });
  const { env } = setup();
  assert.throws(() => env.DB.prepare("SELECT token FROM push_tokens"), /Unscoped query/);
});

test("the morning push waits for last night and never says 'intervals' to a sick athlete", async () => {
  assert.equal(readinessMessage({ score: 80, zone: "green", flags: ["skin_temp_elevated"] }), "Připravenost 80 · dech nebo teplota jsou vyšší, dnes bez intenzity");
  assert.equal(readinessMessage({ score: 80, zone: "green", flags: ["checkin_sick"] }), "Připravenost 80 · dnes odpočinek");
  assert.equal(readinessMessage({ score: 80, zone: "green", athleteState: "injured" }), "Připravenost 80 · dnes odpočinek");
  _resetPushForTest();
  const { env } = setup();
  await savePushToken(env.DB, TOKEN_A);
  const { fetchImpl } = fakeApns();
  const readiness = () => ({ score: 70, zone: "green", missing: ["sleep"] });
  assert.equal((await sendMorningReadiness(env, { readiness, now: MORNING, fetchImpl })).reason, "waiting-for-sleep");
  // 10:30 in Prague, the last hour of the window: it goes out anyway.
  assert.equal((await sendMorningReadiness(env, { readiness, now: new Date("2026-10-12T08:30:00Z"), fetchImpl })).sent, 1);
});
