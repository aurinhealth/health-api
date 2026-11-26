import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { ownerOverview, ownerPageResponse } from "../src/owner-overview.js";
import { ensureTenancy, inviteUser, signInEmailUser, _resetTenancyForTest } from "../src/tenancy.js";
import { ensureStoreColumns } from "../src/app-store.js";
import { ensureAiUsage } from "../src/ai-usage.js";

const NOW = Date.parse("2026-12-20T12:00:00Z"), DAY = 864e5;

async function setup() {
  _resetTenancyForTest();
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", APP_REVIEW_EMAIL: "review@example.com", AI_UNPAID_LIMIT_USD: "1.25", DB: createD1() };
  await ensureTenancy(env.DB, env);
  const owner = await signInEmailUser(env.DB, env, "owner@example.com");
  const people = {};
  for (const name of ["paid", "trial", "ended", "review", "fresh"]) {
    await inviteUser(env.DB, `${name}@example.com`, owner.id);
    people[name] = await signInEmailUser(env.DB, env, `${name}@example.com`);
  }
  await ensureStoreColumns(env.DB);
  await ensureAiUsage(env.DB);
  for (const statement of readFileSync(new URL("../migrations/0038_owner_overview.sql", import.meta.url), "utf8").replace(/--.*$/gm, "").split(";").map(s => s.trim()).filter(Boolean)) await env.DB.prepare(statement).run();
  return { env, owner, people };
}

let uuid = 0;
const event = (db, userId, original, type, at, extra = {}) => db.prepare("INSERT INTO store_events (notification_uuid, user_id, original_transaction_id, type, subtype, product_id, environment, ownership, free_trial, expires_at, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
  .bind(String(++uuid), userId, original, type, extra.subtype ?? null, extra.product ?? "eu.app.pro.monthly", extra.environment ?? "Production", extra.ownership ?? "PURCHASED", extra.trial ? 1 : 0, extra.expires ?? null, at).run();
const sub = (db, userId, values) => db.prepare("INSERT INTO subscriptions (user_id, plan, valid_until, product_id, store_environment, free_trial, offer_type, auto_renew, first_download_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, valid_until=excluded.valid_until, product_id=excluded.product_id, store_environment=excluded.store_environment, free_trial=excluded.free_trial, offer_type=excluded.offer_type, auto_renew=excluded.auto_renew, first_download_at=excluded.first_download_at")
  .bind(userId, values.plan ?? "ai", values.until, values.product ?? "eu.app.pro.monthly", values.environment ?? "Production", values.trial ? 1 : 0, values.offer ?? null, values.autoRenew ?? 1, values.downloaded ?? null).run();

test("the overview shows each account by number with its trial, plan, refund and history, the owner and App Review left out", async () => {
  const { env, owner, people } = await setup();
  const db = env.DB;
  // Paid after the trial, a refund request this month, renews within 30 days.
  await sub(db, people.paid.id, { until: new Date(NOW + 10 * DAY).toISOString(), downloaded: "2026-11-01" });
  await event(db, people.paid.id, "A", "SUBSCRIBED", NOW - 30 * DAY, { trial: true, expires: NOW - 23 * DAY });
  await event(db, people.paid.id, "A", "DID_RENEW", NOW - 23 * DAY);
  await event(db, people.paid.id, "A", "CONSUMPTION_REQUEST", NOW - 2 * DAY);
  // In the trial, renewal off on its second day.
  await sub(db, people.trial.id, { until: new Date(NOW + 2 * DAY).toISOString(), trial: true, autoRenew: 0 });
  await event(db, people.trial.id, "B", "SUBSCRIBED", NOW - 5 * DAY, { trial: true });
  await event(db, people.trial.id, "B", "DID_CHANGE_RENEWAL_STATUS", NOW - 4 * DAY + 3600e3, { trial: true, subtype: "AUTO_RENEW_DISABLED" });
  // A trial that ended unpaid.
  await event(db, people.ended.id, "C", "SUBSCRIBED", NOW - 20 * DAY, { trial: true, expires: NOW - 13 * DAY });
  await event(db, people.ended.id, "C", "EXPIRED", NOW - 13 * DAY, { trial: true });
  // The owner's and App Review's own purchases and a Sandbox one count nowhere.
  await sub(db, owner.id, { until: new Date(NOW + 300 * DAY).toISOString(), product: "eu.app.pro.yearly" });
  await sub(db, people.review.id, { until: new Date(NOW + 300 * DAY).toISOString() });
  await event(db, people.fresh.id, "D", "SUBSCRIBED", NOW - DAY, { trial: true, environment: "Sandbox" });
  await db.prepare("INSERT INTO ai_usage (user_id, day, model, cost_usd) VALUES (?, '2026-12-19', 'm', 4.2), (?, '2026-12-19', 'm', 1.1)").bind(people.paid.id, people.trial.id).run();

  const data = await ownerOverview(env, { now: NOW });
  const ids = data.accounts.map(a => a.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [people.paid.id, people.trial.id, people.ended.id, people.fresh.id].sort((a, b) => a - b));
  const byId = Object.fromEntries(data.accounts.map(a => [a.id, a]));
  const paid = byId[people.paid.id];
  assert.deepEqual(paid.trial, { state: "paid", at: "2026-11-27" });
  assert.deepEqual(paid.plan, { yearly: false, since: "2026-11-27", state: "ok" });
  assert.deepEqual(paid.refund, { type: "CONSUMPTION_REQUEST", at: "2026-12-18" });
  assert.equal(paid.downloaded, "2026-11-01");
  assert.deepEqual([paid.ai, paid.limit], [4.2, 5]);
  const names = paid.history.map(h => h[1]);
  assert.deepEqual(names.filter(x => x !== "Registrace"), ["Stáhl aplikaci (App Store)", "Začal zkušební období", "Zaplatil po zkušebním období", "Žádost o vrácení peněz"]);
  assert.ok(names.includes("Registrace"));
  assert.deepEqual(byId[people.trial.id].trial, { state: "off", day: 2 });
  assert.equal(byId[people.trial.id].limit, 1.25);
  assert.deepEqual(byId[people.ended.id].trial, { state: "ended", at: "2026-12-07" });
  assert.equal(byId[people.fresh.id].trial, null, "a Sandbox trial is not a trial here");
  for (const a of data.accounts) assert.equal(JSON.stringify(a).includes("@"), false, "no e-mail");
  assert.equal(JSON.stringify(data).includes("\"A\""), false, "no transaction id");

  const n = data.numbers;
  assert.deepEqual([n.accounts, n.trials, n.trialsEnding, n.monthly, n.yearly, n.renew30, n.end30], [4, 1, 1, 1, 0, 1, 0]);
  assert.deepEqual([n.trialsPaid, n.trialsDone], [1, 2]);
  assert.deepEqual([n.refundRequests, n.refunds, n.aiWeek], [1, 0, 2]);
  assert.equal(n.earnsUsd, 8);
  assert.deepEqual(data.cancelDays, [0, 1, 0, 0, 0, 0, 0]);
  assert.deepEqual(data.aiBuckets, [2, 0, 0, 0, 2]);
});

test("the overview page holds no data, runs only its own script and stays out of search", async () => {
  const response = ownerPageResponse();
  const html = await response.text();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("X-Robots-Tag"), /noindex/);
  assert.match(response.headers.get("Content-Security-Policy"), /script-src 'sha256-/);
  assert.match(html, /\/app\/owner\/data/);
  assert.doesNotMatch(html, /@example|#\d+</);
});

test("only the owner's session reads the overview; anyone else gets nothing", async () => {
  const { default: worker } = await import("../src/entrypoint.js");
  const { userSessionCookie } = await import("../src/dashboard-auth.js");
  const { env, owner, people } = await setup();
  env.CONNECTION_KEY = "k".repeat(40);
  env.SESSION_SECRET = "s".repeat(40);
  const get = async (path, userId, accept = "application/json") => {
    const headers = { Accept: accept };
    if (userId) headers.Cookie = (await userSessionCookie(env.DB, userId, env.SESSION_SECRET)).split(";")[0];
    return worker.fetch(new Request("https://aurin.health" + path, { headers }), env, { waitUntil() {} });
  };
  const mine = await get("/app/owner/data", owner.id);
  assert.equal(mine.status, 200);
  assert.ok(Array.isArray((await mine.json()).accounts));
  assert.equal((await get("/app/owner/data", people.paid.id)).status, 404, "another account");
  assert.equal((await get("/app/owner/data")).status, 401, "nobody signed in");
  assert.equal((await get("/app/owner", people.paid.id, "text/html")).status, 404, "the page for another account");
  const shell = await get("/app/owner", null, "text/html");
  assert.equal(shell.status, 200, "the sign-in page for nobody signed in");
  assert.doesNotMatch(await shell.text(), /paid@example/);
});

test("with Cloudflare Access set up, the data also needs Access's signed token for the owner", async () => {
  const { accessAllowed } = await import("../src/owner-overview.js");
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1" };
  const b64 = v => Buffer.from(JSON.stringify(v)).toString("base64url");
  const token = async claims => { const data = b64({ alg: "RS256", kid: "k1" }) + "." + b64(claims); return data + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(data))).toString("base64url"); };
  const env = { OWNER_EMAIL: "owner@example.com", ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud1" };
  const certs = async url => { assert.equal(url, "https://team.cloudflareaccess.com/cdn-cgi/access/certs"); return Response.json({ keys: [jwk] }); };
  const request = async claims => new Request("https://aurin.health/app/owner/data", { headers: claims ? { "Cf-Access-Jwt-Assertion": await token(claims) } : {} });
  const good = { iss: "https://team.cloudflareaccess.com", aud: ["aud1"], email: "owner@example.com", exp: Math.floor(Date.now() / 1000) + 60 };
  assert.equal(await accessAllowed(await request(good), env, certs), true);
  assert.equal(await accessAllowed(await request(null), env, certs), false, "no token");
  assert.equal(await accessAllowed(await request({ ...good, email: "someone@example.com" }), env, certs), false, "another e-mail");
  assert.equal(await accessAllowed(await request({ ...good, aud: ["other"] }), env, certs), false, "another application");
  assert.equal(await accessAllowed(await request({ ...good, exp: 1 }), env, certs), false, "expired");
  const forged = (await token(good)).split("."); forged[1] = b64({ ...good, email: "owner@example.com", exp: good.exp + 1 });
  assert.equal(await accessAllowed(new Request("https://aurin.health/", { headers: { "Cf-Access-Jwt-Assertion": forged.join(".") } }), env, certs), false, "a changed token");
  assert.equal(await accessAllowed(await request(null), { OWNER_EMAIL: "owner@example.com" }, certs), true, "before Access is set up the session decides");
});
