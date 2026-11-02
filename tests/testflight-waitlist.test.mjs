import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { handleWaitlistSignup, listWaitlist, decideWaitlist, ascToken, TESTER_LIMIT, forgetOldWaitlist } from "../src/testflight-waitlist.js";

const origin = "https://aurin.health";
// Turnstile as Cloudflare answers for a person on aurin.health; a test's env without
// TURNSTILE_SECRET_KEY gets one, an env that names it (even empty) keeps its own.
const person = async (url, init) => Response.json({ success: init.body.get("response") === "ok", action: "waitlist", hostname: "aurin.health" });
const withKey = env => ("TURNSTILE_SECRET_KEY" in env ? env : { ...env, TURNSTILE_SECRET_KEY: "secret" });
const signup = (env, email, headers = {}, token = "ok", fetchImpl = person) => handleWaitlistSignup(new Request(origin + "/waitlist", { method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9", ...headers }, body: JSON.stringify({ email, token }) }), withKey(env), "/waitlist", fetchImpl);

async function keyPem() {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  return { pem: `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`, publicKey: pair.publicKey };
}

// A small App Store Connect: one app, an internal and an external group.
function fakeApple(members = []) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const path = url.replace("https://api.appstoreconnect.apple.com/v1", ""), method = init.method || "GET";
    calls.push(method + " " + path);
    const body = init.body ? JSON.parse(init.body) : null;
    const ok = data => new Response(JSON.stringify(data), { status: 200 });
    if (path.startsWith("/apps?")) return ok({ data: [{ id: "app1" }] });
    if (path.startsWith("/apps/app1/betaGroups")) return ok({ data: [{ id: "int", attributes: { name: "Interní", isInternalGroup: true } }, { id: "ext", attributes: { name: "Testeři", isInternalGroup: false } }] });
    if (path.startsWith("/betaGroups/ext/betaTesters")) return ok({ data: members.map((email, i) => ({ id: "t" + i, attributes: { email } })) });
    if (path.startsWith("/betaTesters?")) return ok({ data: [] });
    if (path === "/betaTesters" && method === "POST") { members.push(body.data.attributes.email); return new Response(JSON.stringify({ data: { id: "new" } }), { status: 201 }); }
    if (path === "/betaTesterInvitations") return new Response("{}", { status: 201 });
    return new Response(JSON.stringify({ errors: [{ detail: "unexpected " + path }] }), { status: 404 });
  };
  return { fetcher, calls, members };
}

test("the website's sign-up stores an address once and answers the same either way", async () => {
  const env = { DB: createD1(), SESSION_SECRET: "s" };
  assert.equal((await signup(env, "Jana.Novak@gmail.com")).status, 200);
  assert.equal((await signup(env, "jana.novak@gmail.com")).status, 200);
  assert.equal((await signup(env, "not an email")).status, 400);
  assert.equal((await signup(env, "a@b.cz", { Origin: "https://evil.example" })).status, 403);
  const { pending } = await listWaitlist(env.DB, {});
  assert.deepEqual(pending.map(p => p.email), ["jana.novak@gmail.com"]);
});

test("one caller can't fill the list", async () => {
  const env = { DB: createD1(), SESSION_SECRET: "s" };
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await signup(env, `p${i}@x.cz`)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test("approving adds the address to the external group and asks Apple to invite; without the key it says so", async () => {
  const db = createD1(), env = { DB: db, SESSION_SECRET: "s" };
  await signup(env, "jana@x.cz");
  const [{ id }] = (await listWaitlist(db, {})).pending;
  assert.match((await listWaitlist(db, {})).error, /ASC_KEY_P8/);
  await assert.rejects(decideWaitlist(db, {}, { id, decision: "approve" }), e => e.status === 503);

  const { pem } = await keyPem(), apple = fakeApple(["lukas@x.cz"]);
  const asc = { ASC_KEY_ID: "K1", ASC_ISSUER_ID: "I1", ASC_KEY_P8: pem };
  assert.equal((await listWaitlist(db, asc, apple.fetcher)).testers, 1);
  await decideWaitlist(db, asc, { id, decision: "approve" }, apple.fetcher);
  assert.deepEqual(apple.members, ["lukas@x.cz", "jana@x.cz"]);
  assert.ok(apple.calls.includes("POST /betaTesterInvitations"));
  const after = await listWaitlist(db, asc, apple.fetcher);
  assert.deepEqual([after.pending.length, after.invited[0].email, after.testers], [0, "jana@x.cz", 2]);
});

test("a full group refuses, and a deleted address leaves the list", async () => {
  const db = createD1(), env = { DB: db, SESSION_SECRET: "s" };
  await signup(env, "a@x.cz"); await signup(env, "b@x.cz");
  const [b, a] = (await listWaitlist(db, {})).pending;
  const { pem } = await keyPem(), apple = fakeApple(Array.from({ length: TESTER_LIMIT }, (_, i) => `t${i}@x.cz`));
  await assert.rejects(decideWaitlist(db, { ASC_KEY_ID: "K", ASC_ISSUER_ID: "I", ASC_KEY_P8: pem }, { id: a.id, decision: "approve" }, apple.fetcher), e => e.status === 409);
  await decideWaitlist(db, {}, { id: b.id, decision: "delete" });
  assert.deepEqual((await listWaitlist(db, {})).pending.map(p => p.email), ["a@x.cz"]);
});

test("the App Store Connect token is an ES256 JWT that verifies with the key", async () => {
  const { pem, publicKey } = await keyPem();
  const token = await ascToken({ ASC_KEY_ID: "K1", ASC_ISSUER_ID: "I1", ASC_KEY_P8: pem }, 1_700_000_000_000);
  const [h, p, s] = token.split(".");
  const part = x => JSON.parse(Buffer.from(x, "base64url").toString());
  assert.deepEqual(part(h), { alg: "ES256", kid: "K1", typ: "JWT" });
  assert.deepEqual(part(p), { iss: "I1", iat: 1_700_000_000, exp: 1_700_001_200, aud: "appstoreconnect-v1" });
  assert.ok(await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(h + "." + p)));
});

test("addresses a year on the lists are forgotten, newer ones stay", async () => {
  const db = createD1();
  assert.equal(await forgetOldWaitlist(db), 0);
  await signup({ DB: db, SESSION_SECRET: "s" }, "new@example.com");
  db.sqlite.exec(`INSERT INTO testflight_waitlist (email, created_at) VALUES ('old@example.com', datetime('now', '-13 months'));
    INSERT INTO testflight_waitlist (email, status, created_at, invited_at) VALUES ('invited@example.com', 'invited', datetime('now', '-14 months'), datetime('now', '-2 months'));
    CREATE TABLE signup_waitlist (email TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO signup_waitlist (email, created_at) VALUES ('full@example.com', datetime('now', '-13 months')), ('later@example.com', datetime('now'));`);
  assert.equal(await forgetOldWaitlist(db), 2);
  assert.deepEqual(db.sqlite.prepare("SELECT email FROM testflight_waitlist ORDER BY email").all().map(r => r.email), ["invited@example.com", "new@example.com"]);
  assert.deepEqual(db.sqlite.prepare("SELECT email FROM signup_waitlist").all().map(r => r.email), ["later@example.com"]);
});

test("with Turnstile on, only a form a person sent is stored, and a bot doesn't use up the day for everyone", async t => {
  t.mock.method(console, "error", () => {});
  const calls = [];
  const cloudflare = async (url, init) => {
    calls.push({ url, secret: init.body.get("secret"), response: init.body.get("response"), ip: init.body.get("remoteip") });
    const token = init.body.get("response");
    if (token === "down") throw new Error("network");
    return Response.json(token === "good" ? { success: true, action: "waitlist", hostname: "aurin.health" }
      : token === "other" ? { success: true, action: "login", hostname: "aurin.health" }
      // A token solved on another site that embeds the public site key (SEC-005).
      : token === "elsewhere" ? { success: true, action: "waitlist", hostname: "evil.example" }
      // The test server's token is no token for the live server.
      : token === "staging" ? { success: true, action: "waitlist", hostname: "staging.aurin.health" }
      : { success: false });
  };
  const env = { DB: createD1(), SESSION_SECRET: "s", TURNSTILE_SECRET_KEY: "secret" };
  const codes = [];
  for (const [i, token] of ["", "bad", "other", "down", "elsewhere", "staging", "good"].entries()) {
    codes.push((await signup(env, `p${i}@x.cz`, { "CF-Connecting-IP": "203.0.113." + i }, token, cloudflare)).status);
  }
  assert.deepEqual(codes, [403, 403, 403, 403, 403, 403, 200]);
  assert.equal(calls.length, 6, "no token, no call to Cloudflare");
  assert.deepEqual(calls.at(-1), { url: "https://challenges.cloudflare.com/turnstile/v0/siteverify", secret: "secret", response: "good", ip: "203.0.113.6" });
  assert.deepEqual((await listWaitlist(env.DB, {})).pending.map(p => p.email), ["p6@x.cz"]);
  // Only the one that passed counts towards the day's 300 for everyone.
  assert.equal(env.DB.sqlite.prepare("SELECT day_count FROM request_limits WHERE key = 'waitlist:all'").get().day_count, 1);
});

test("without TURNSTILE_SECRET_KEY nothing is stored and nothing is counted (SEC-005)", async t => {
  const errors = t.mock.method(console, "error", () => {});
  const env = { DB: createD1(), SESSION_SECRET: "s", TURNSTILE_SECRET_KEY: "" };
  const response = await signup(env, "a@x.cz", {}, "ok", () => { throw new Error("no call"); });
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /closed/);
  assert.match(String(errors.mock.calls[0].arguments[0]), /TURNSTILE_SECRET_KEY/);
  assert.deepEqual((await listWaitlist(env.DB, {})).pending, []);
  assert.equal(env.DB.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'request_limits'").get(), undefined, "no D1 write for a closed list");
});

test("on the test server a token from staging.aurin.health passes", async () => {
  const env = { DB: createD1(), SESSION_SECRET: "s", TURNSTILE_SECRET_KEY: "secret" };
  const staging = "https://staging.aurin.health";
  const cloudflare = async () => Response.json({ success: true, action: "waitlist", hostname: "staging.aurin.health" });
  const request = new Request(staging + "/waitlist", { method: "POST", headers: { Origin: staging, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" },
    body: JSON.stringify({ email: "a@x.cz", token: "ok" }) });
  assert.equal((await handleWaitlistSignup(request, env, "/waitlist", cloudflare)).status, 200);
});

test("the security review's test sign-up leaves the test server's list", async () => {
  const db = createD1();
  await signup({ DB: db, SESSION_SECRET: "s" }, "sec005-poc-1730550000@example.com", { "CF-Connecting-IP": "203.0.113.1" });
  await signup({ DB: db, SESSION_SECRET: "s" }, "jana@x.cz", { "CF-Connecting-IP": "203.0.113.2" });
  db.sqlite.exec(readFileSync(new URL("../migrations/0036_waitlist_review_entry.sql", import.meta.url), "utf8"));
  assert.deepEqual((await listWaitlist(db, {})).pending.map(p => p.email), ["jana@x.cz"]);
  // A database that never had a sign-up gets the table and nothing else.
  const empty = createD1();
  empty.sqlite.exec(readFileSync(new URL("../migrations/0036_waitlist_review_entry.sql", import.meta.url), "utf8"));
  assert.deepEqual((await listWaitlist(empty, {})).pending, []);
});
