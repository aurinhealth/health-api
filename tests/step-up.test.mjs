import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { createPasskey, signInWith } from "./helpers/passkey.mjs";
import { handlePasskeyApi } from "../src/passkeys.js";
import { handleEmailLogin } from "../src/email-login.js";
import { requireStepUp, handleStepUpApi, maskedEmail } from "../src/step-up.js";
import { handleAccountApi } from "../src/routes-account.js";
import { stepUpCookie, STEP_UP_SECONDS, isPublicPath } from "../src/dashboard-auth.js";
import { ensureTenancy, inviteUser, signInEmailUser, findUser, bumpSessionEpoch, _resetTenancyForTest } from "../src/tenancy.js";

const ORIGIN = "https://aurin.health";
const MIGRATION = ["0014_passkeys_email_codes.sql", "0027_email_code_limits.sql"].map(name => readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8")).join("\n");

async function setup(extra = {}) {
  _resetTenancyForTest();
  const sent = [];
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1(), EMAIL: { send: async message => { sent.push(message); return { messageId: "m" + sent.length }; } }, EMAIL_FROM: "noreply@aurin.health", ...extra };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(MIGRATION);
  env.RAW_DB = env.DB;
  return { env, sent };
}
async function member(env, email = "friend@example.com") {
  await inviteUser(env.DB, email, 1);
  const signedIn = await signInEmailUser(env.DB, env, email);
  return findUser(env.DB, signedIn.id, env);
}
let nextAddress = 0;
const request = (path, { body, method = body === undefined ? "GET" : "POST", cookie = "", origin = ORIGIN } = {}) => new Request(ORIGIN + path, {
  method, headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113." + (++nextAddress % 250), ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body)
});
const session = user => ({ signedIn: true, user });
const stepUp = (env, user, path, body) => handleStepUpApi(request(path, { body }), env, new URL(ORIGIN + path), session(user));
const codeIn = message => message.text.match(/\b(\d{6})\b/)[1];
const proofOf = response => (response.headers.getSetCookie?.() || []).find(c => c.startsWith("aurin_stepup="))?.split(";")[0] || "";
const GUARDED = [["/app/api/account/export", undefined], ["/app/api/account/delete", { confirm: "SMAZAT" }], ["/app/api/account/email/start", { email: "new@example.com" }], ["/app/api/passkeys/options", {}]];

test("the four sensitive routes ask to confirm it's you first, and say how", async () => {
  const { env } = await setup();
  const user = await member(env);
  for (const [path, body] of GUARDED) {
    const response = await handleAccountApi(request(path, { body }), env, {}, new URL(ORIGIN + path), session(user));
    assert.equal(response.status, 403, path);
    assert.deepEqual((await response.json()).stepUp, { passkey: false, email: "fr•••@example.com" }, path);
  }
  // The account is still there, and nothing was sent.
  assert.ok(await findUser(env.DB, user.id, env));
  // The routes that confirm need the session: none of them is public.
  for (const path of ["/app/api/account/step-up/start", "/app/api/account/step-up/verify", "/app/api/account/step-up/passkey"]) assert.equal(isPublicPath(path), false);
});

test("a code sent to the account's own address confirms it for ten minutes", async () => {
  const { env, sent } = await setup();
  const user = await member(env);
  const start = await stepUp(env, user, "/app/api/account/step-up/start", {});
  assert.deepEqual(await start.json(), { status: "ok", email: "fr•••@example.com" });
  assert.equal(sent.at(-1).to, "friend@example.com");
  assert.match(sent.at(-1).subject, /kód pro potvrzení/);
  // A sign-in with that code is not possible: it is for this check only.
  assert.equal((await handleEmailLogin(request("/auth/email/verify", { body: { email: "friend@example.com", code: codeIn(sent.at(-1)) } }), env, "/auth/email/verify")).status, 400);
  const wrong = await stepUp(env, user, "/app/api/account/step-up/verify", { code: codeIn(sent.at(-1)) === "000000" ? "111111" : "000000" });
  assert.equal(wrong.status, 400);
  assert.equal(proofOf(wrong), "");
  const right = await stepUp(env, user, "/app/api/account/step-up/verify", { code: codeIn(sent.at(-1)) });
  assert.equal(right.status, 200);
  const proof = proofOf(right);
  assert.match(proof, /^aurin_stepup=\d+\./);
  assert.match(right.headers.getSetCookie().find(c => c.startsWith("aurin_stepup=")), /Max-Age=600; HttpOnly; Secure; SameSite=Strict/);
  assert.equal(await requireStepUp(request("/app/api/account/export", { cookie: proof }), env, session(user)), null);
  // The code is used up.
  assert.equal((await stepUp(env, user, "/app/api/account/step-up/verify", { code: codeIn(sent.at(-1)) })).status, 400);
});

test("the proof holds only for its account, its session epoch and ten minutes", async () => {
  const { env } = await setup();
  const user = await member(env), other = await member(env, "other@example.com");
  const now = Math.floor(Date.now() / 1000);
  const proof = (await stepUpCookie(user.id, user.sessionEpoch, env.SESSION_SECRET, now)).split(";")[0];
  const check = (who, cookie) => requireStepUp(request("/app/api/account/export", { cookie }), env, session(who));
  assert.equal(await check(user, proof), null);
  assert.equal((await check(other, proof)).status, 403, "another account's proof");
  const old = (await stepUpCookie(user.id, user.sessionEpoch, env.SESSION_SECRET, now - STEP_UP_SECONDS - 1)).split(";")[0];
  assert.equal((await check(user, old)).status, 403, "expired");
  const [exp, signature] = proof.slice("aurin_stepup=".length).split(".");
  assert.equal((await check(user, `aurin_stepup=${Number(exp) + 3600}.${signature}`)).status, 403, "a longer expiry breaks the signature");
  const forged = (await stepUpCookie(user.id, user.sessionEpoch, "another-secret", now)).split(";")[0];
  assert.equal((await check(user, forged)).status, 403, "signed with another secret");
  // Sign out everywhere (the epoch moves on) ends it.
  await bumpSessionEpoch(env.DB, user.id);
  assert.equal((await check(await findUser(env.DB, user.id, env), proof)).status, 403);
});

test("signing in counts as confirming it's you", async () => {
  const { env, sent } = await setup();
  const user = await member(env);
  await handleEmailLogin(request("/auth/email/start", { body: { email: "friend@example.com" } }), env, "/auth/email/start");
  const login = await handleEmailLogin(request("/auth/email/verify", { body: { email: "friend@example.com", code: codeIn(sent.at(-1)) } }), env, "/auth/email/verify");
  assert.equal(login.status, 200);
  assert.ok(login.headers.getSetCookie().some(c => c.startsWith("pfd_session=")));
  assert.equal(await requireStepUp(request("/app/api/account/export", { cookie: proofOf(login) }), env, session(user)), null);
});

test("one of the account's own passkeys confirms it; another account's does not", async () => {
  const { env } = await setup();
  const user = await member(env), other = await member(env, "other@example.com");
  const add = async who => {
    const options = await (await handlePasskeyApi(request("/app/api/passkeys/options", { body: {} }), env, new URL(ORIGIN + "/app/api/passkeys/options"), session(who))).json();
    const { credential, passkey } = await createPasskey({ challenge: options.challenge, userHandle: options.user.id });
    assert.equal((await handlePasskeyApi(request("/app/api/passkeys", { body: { credential } }), env, new URL(ORIGIN + "/app/api/passkeys"), session(who))).status, 200);
    return passkey;
  };
  const mine = await add(user), theirs = await add(other);
  const refusal = await requireStepUp(request("/app/api/account/export"), env, session(user));
  assert.deepEqual((await refusal.json()).stepUp, { passkey: true, email: "fr•••@example.com" });

  const options = await (await stepUp(env, user, "/app/api/account/step-up/passkey/options", {})).json();
  assert.equal(options.userVerification, "required");
  assert.equal(options.allowCredentials.length, 1);
  const foreign = await stepUp(env, user, "/app/api/account/step-up/passkey", { credential: await signInWith(theirs, { challenge: options.challenge }) });
  assert.equal(foreign.status, 400);
  assert.equal(proofOf(foreign), "");
  // The challenge was used up by the refused try; a new one, with this account's passkey.
  const again = await (await stepUp(env, user, "/app/api/account/step-up/passkey/options", {})).json();
  const ok = await stepUp(env, user, "/app/api/account/step-up/passkey", { credential: await signInWith(mine, { challenge: again.challenge }) });
  assert.equal(ok.status, 200);
  assert.equal(await requireStepUp(request("/app/api/account/export", { cookie: proofOf(ok) }), env, session(user)), null);
  // Another account's challenge does not work for this one.
  const theirChallenge = await (await stepUp(env, other, "/app/api/account/step-up/passkey/options", {})).json();
  assert.equal((await stepUp(env, user, "/app/api/account/step-up/passkey", { credential: await signInWith(mine, { challenge: theirChallenge.challenge }) })).status, 400);
});

test("the routes that confirm refuse other sites and a missing session", async () => {
  const { env } = await setup();
  const user = await member(env);
  const path = "/app/api/account/step-up/start";
  assert.equal((await handleStepUpApi(request(path, { body: {}, origin: "https://evil.example" }), env, new URL(ORIGIN + path), session(user))).status, 403);
  assert.equal((await handleStepUpApi(request(path, { body: {} }), env, new URL(ORIGIN + path), { signedIn: false })).status, 401);
});

test("with no passkey and e-mails off, nothing can confirm, so the route goes on", async () => {
  const { env } = await setup({ EMAIL: undefined, EMAIL_FROM: undefined });
  const user = await member(env);
  assert.equal(await requireStepUp(request("/app/api/account/export"), env, session(user)), null);
});

test("the address is shown masked", () => {
  assert.equal(maskedEmail("petr@gmail.com"), "pe•••@gmail.com");
  assert.equal(maskedEmail("ab@x.cz"), "a•••@x.cz");
  assert.equal(maskedEmail("a@x.cz"), "a•••@x.cz");
  assert.equal(maskedEmail(""), "");
});
