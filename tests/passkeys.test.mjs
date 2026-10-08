import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { createPasskey, signInWith } from "./helpers/passkey.mjs";
import { handlePasskeyLogin, handlePasskeyApi, listPasskeys, passkeyName } from "../src/passkeys.js";
import { ensureTenancy, findUser, inviteUser, scopedDb, signInEmailUser, setUserDisabled, _resetTenancyForTest } from "../src/tenancy.js";
import { isPublicPath, resolvePrincipal } from "../src/dashboard-auth.js";
import { exportAccountData, deleteAccount } from "../src/account-data.js";

const ORIGIN = "https://petrfitnessdata.eu";
const MIGRATION = readFileSync(new URL("../migrations/0014_passkeys_email_codes.sql", import.meta.url), "utf8");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

async function setup(extra = {}) {
  _resetTenancyForTest();
  const env = { SESSION_SECRET: "test-secret-key", OWNER_EMAIL: "owner@example.com", DB: createD1(), ...extra };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(MIGRATION);
  env.RAW_DB = env.DB;
  return env;
}
async function member(env, email = "friend@example.com") {
  await inviteUser(env.DB, email, 1);
  return signInEmailUser(env.DB, env, email);
}
const post = (path, body, { origin = ORIGIN, ua = IPHONE } = {}) => new Request(ORIGIN + path, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", "User-Agent": ua }, body: body === undefined ? undefined : JSON.stringify(body) });
const api = (env, user, request, ctx) => handlePasskeyApi(request, env, new URL(request.url), { signedIn: true, user }, ctx);

// Adds a passkey for the user through the API, as Settings does.
async function addPasskey(env, user, options = {}) {
  const optionsResponse = await api(env, user, post("/app/api/passkeys/options", {}));
  assert.equal(optionsResponse.status, 200);
  const publicKey = await optionsResponse.json();
  const { credential, passkey } = await createPasskey({ challenge: publicKey.challenge, userHandle: publicKey.user.id, ...options });
  const response = await api(env, user, post("/app/api/passkeys", { credential }), options.ctx);
  return { response, body: await response.json(), passkey, publicKey };
}
async function signIn(env, passkey, options = {}) {
  const { challenge } = await (await handlePasskeyLogin(post("/auth/passkey/options", {}), env, "/auth/passkey/options")).json();
  const credential = await signInWith(passkey, { challenge, ...options });
  return handlePasskeyLogin(post("/auth/passkey/verify", { credential }), env, "/auth/passkey/verify");
}

test("a passkey added in Settings signs the user in", async () => {
  const env = await setup(), user = await member(env);
  const { response, body, passkey, publicKey } = await addPasskey(env, user);
  assert.equal(response.status, 200);
  assert.equal(body.name, "iPhone");
  assert.deepEqual(body.passkeys.map(p => p.name), ["iPhone"]);
  assert.equal(publicKey.rp.id, "petrfitnessdata.eu");
  assert.equal(publicKey.user.name, "friend@example.com");
  assert.equal(publicKey.authenticatorSelection.userVerification, "required");
  assert.equal(publicKey.authenticatorSelection.residentKey, "required");
  assert.equal(publicKey.attestation, "none");
  assert.deepEqual(publicKey.pubKeyCredParams.map(p => p.alg), [-7, -8, -257]);
  // The user handle is random, never the e-mail or the account number.
  assert.match(publicKey.user.id, /^[A-Za-z0-9_-]{43}$/);
  const handle = Buffer.from(publicKey.user.id, "base64url").toString("latin1");
  assert.ok(handle !== String(user.id) && !handle.includes("friend@example.com"));

  env.DB.sqlite.prepare("UPDATE users SET last_login_at = NULL WHERE id = ?").run(user.id);
  const login = await signIn(env, passkey);
  assert.equal(login.status, 200);
  // Signing in counts as activity: accounts unused for two years are deleted by last_login_at.
  assert.ok(env.DB.sqlite.prepare("SELECT last_login_at FROM users WHERE id = ?").get(user.id).last_login_at);
  const cookie = login.headers.get("Set-Cookie");
  assert.match(cookie, /^pfd_session=.+HttpOnly; Secure; SameSite=Lax/);
  const principal = await resolvePrincipal(new Request(ORIGIN + "/app", { headers: { Cookie: cookie.split(";")[0] } }), env);
  assert.deepEqual(principal, { kind: "user", userId: user.id });
  const [stored] = await listPasskeys(env.DB, user.id);
  assert.ok(stored.lastUsedAt);
  assert.equal("publicKey" in stored, false);
});

test("passkey routes are public only where they must be", () => {
  for (const path of ["/auth/passkey/options", "/auth/passkey/verify", "/auth/email/start", "/auth/email/verify"]) assert.ok(isPublicPath(path), path);
  for (const path of ["/app/api/passkeys", "/app/api/passkeys/options"]) assert.equal(isPublicPath(path), false, path);
});

test("a signed sign-in cannot be replayed and needs a fresh challenge from this server", async () => {
  const env = await setup(), user = await member(env);
  const { passkey } = await addPasskey(env, user);
  const { challenge } = await (await handlePasskeyLogin(post("/auth/passkey/options", {}), env, "/auth/passkey/options")).json();
  const credential = await signInWith(passkey, { challenge });
  assert.equal((await handlePasskeyLogin(post("/auth/passkey/verify", { credential }), env, "/auth/passkey/verify")).status, 200);
  const replay = await handlePasskeyLogin(post("/auth/passkey/verify", { credential }), env, "/auth/passkey/verify");
  assert.equal(replay.status, 400);
  const invented = await signInWith(passkey, { challenge: "bm90LWlzc3VlZC1ieS10aGUtc2VydmVy" });
  assert.equal((await handlePasskeyLogin(post("/auth/passkey/verify", { credential: invented }), env, "/auth/passkey/verify")).status, 400);
  // An expired challenge is refused too.
  const { challenge: old } = await (await handlePasskeyLogin(post("/auth/passkey/options", {}), env, "/auth/passkey/options")).json();
  env.DB.sqlite.prepare("UPDATE auth_challenges SET expires_at = 1 WHERE challenge = ?").run(old);
  const late = await signInWith(passkey, { challenge: old });
  assert.equal((await handlePasskeyLogin(post("/auth/passkey/verify", { credential: late }), env, "/auth/passkey/verify")).status, 400);
});

test("sign-in refuses other sites, unknown passkeys, a wrong account and blocked users", async () => {
  const env = await setup(), user = await member(env);
  const { passkey } = await addPasskey(env, user);
  assert.equal((await handlePasskeyLogin(post("/auth/passkey/options", {}, { origin: "https://evil.example" }), env, "/auth/passkey/options")).status, 403);
  assert.equal((await handlePasskeyLogin(new Request(ORIGIN + "/auth/passkey/options"), env, "/auth/passkey/options")).status, 405);
  // The page of another origin cannot make a passkey answer for this one.
  assert.equal((await signIn(env, passkey, { origin: "https://staging.petrfitnessdata.eu" })).status, 401);

  const stranger = (await createPasskey({ challenge: "x" })).passkey;
  const unknown = await signIn(env, stranger);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await unknown.json(), { message: "Tenhle přístupový klíč Loadwise nezná. Přihlas se jinak a přidej si nový v Nastavení → Účet.", unknownCredential: true, rpId: "petrfitnessdata.eu" });

  assert.equal((await signIn(env, passkey, { userHandle: "c29tZW9uZS1lbHNl" })).status, 401);
  assert.equal((await signIn(env, passkey, { userHandle: null })).status, 401);
  assert.equal((await signIn(env, passkey, { flags: 0x01 })).status, 401);

  await setUserDisabled(env.DB, env, user.id, true);
  assert.equal((await signIn(env, passkey)).status, 403);
});

test("each passkey is EdDSA, ES256 or RS256 and works after a counter-based sign-in", async () => {
  const env = await setup(), user = await member(env);
  for (const alg of [-8, -257]) {
    const { passkey } = await addPasskey(env, user, { alg });
    assert.equal((await signIn(env, passkey)).status, 200);
  }
  const { passkey } = await addPasskey(env, user, { signCount: 4, flags: 0x45 });
  assert.equal((await signIn(env, passkey, { signCount: 5 })).status, 200);
  // A copied authenticator would repeat the counter.
  assert.equal((await signIn(env, passkey, { signCount: 5 })).status, 401);
});

test("adding a passkey checks the challenge owner, duplicates and the limit", async () => {
  const env = await setup(), user = await member(env), other = await member(env, "other@example.com");
  const optionsFor = async who => (await api(env, who, post("/app/api/passkeys/options", {}))).json();
  // A challenge issued to another account does not add a passkey here.
  const foreign = await optionsFor(other);
  const { credential } = await createPasskey({ challenge: foreign.challenge, userHandle: foreign.user.id });
  assert.equal((await api(env, user, post("/app/api/passkeys", { credential }))).status, 400);
  // A sign-in challenge cannot add a passkey either.
  const { challenge } = await (await handlePasskeyLogin(post("/auth/passkey/options", {}), env, "/auth/passkey/options")).json();
  const viaLogin = await createPasskey({ challenge });
  assert.equal((await api(env, user, post("/app/api/passkeys", { credential: viaLogin.credential }))).status, 400);
  // Without user verification the passkey is refused.
  const { response } = await addPasskey(env, user, { flags: 0x41 });
  assert.equal(response.status, 400);

  const first = await addPasskey(env, user);
  assert.equal(first.response.status, 200);
  const again = await optionsFor(user);
  assert.equal(again.user.id, first.publicKey.user.id, "one user handle per account");
  assert.deepEqual(again.excludeCredentials.map(c => c.id), [first.body.passkeys[0].id]);
  assert.deepEqual(again.excludeCredentials[0].transports, ["internal", "hybrid"]);
  const duplicate = await createPasskey({ challenge: again.challenge, userHandle: again.user.id, credentialId: new Uint8Array(Buffer.from(first.body.passkeys[0].id, "base64url")) });
  assert.equal((await api(env, user, post("/app/api/passkeys", { credential: duplicate.credential }))).status, 409);

  for (let i = 1; i < 20; i++) assert.equal((await addPasskey(env, user)).response.status, 200);
  assert.equal((await api(env, user, post("/app/api/passkeys/options", {}))).status, 400);
  assert.equal((await listPasskeys(env.DB, user.id)).length, 20);
});

test("only the signed-in browser manages passkeys, and only its own", async () => {
  const env = await setup(), user = await member(env), other = await member(env, "other@example.com");
  const mine = (await addPasskey(env, user)).body.passkeys[0];
  const theirs = (await addPasskey(env, other)).body.passkeys[0];
  const viaApiKey = await handlePasskeyApi(post("/app/api/passkeys/options", {}), env, new URL(ORIGIN + "/app/api/passkeys/options"), { signedIn: false, user });
  assert.equal(viaApiKey.status, 401);
  assert.equal((await api(env, user, post("/app/api/passkeys/options", {}, { origin: "https://evil.example" }))).status, 403);
  const listed = await (await api(env, user, post("/app/api/passkeys"))).json();
  assert.deepEqual(listed.passkeys.map(p => p.id), [mine.id]);
  assert.equal(listed.rpId, "petrfitnessdata.eu");
  const remove = id => api(env, user, new Request(ORIGIN + "/app/api/passkeys?id=" + encodeURIComponent(id), { method: "DELETE", headers: { Origin: ORIGIN } }));
  await remove(theirs.id);
  assert.equal((await listPasskeys(env.DB, other.id)).length, 1, "another user's passkey stays");
  const removed = await (await remove(mine.id)).json();
  assert.deepEqual(removed.passkeys, []);
  assert.match(removed.userHandle, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await api(env, user, new Request(ORIGIN + "/app/api/passkeys?id=x", { method: "DELETE", headers: { Origin: "https://evil.example" } }))).status, 403);
});

test("adding a passkey e-mails the account owner when e-mail is set up", async () => {
  const sent = [], pending = [];
  const env = await setup({ EMAIL: { send: async message => { sent.push(message); return { messageId: "m1" }; } }, EMAIL_FROM: "noreply@petrfitnessdata.eu" });
  const user = await member(env);
  await addPasskey(env, user, { ctx: { waitUntil: p => pending.push(p) } });
  await Promise.all(pending);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "friend@example.com");
  assert.deepEqual(sent[0].from, { email: "noreply@petrfitnessdata.eu", name: "Loadwise" });
  assert.match(sent[0].subject, /přístupový klíč/);
  assert.match(sent[0].text, /„iPhone“/);
});

test("too many open sign-ins are refused instead of filling the database", async () => {
  const env = await setup();
  const insert = env.DB.sqlite.prepare("INSERT INTO auth_challenges(challenge, purpose, expires_at) VALUES(?, 'login', ?)");
  for (let i = 0; i < 500; i++) insert.run("c" + i, Math.floor(Date.now() / 1000) + 300);
  assert.equal((await handlePasskeyLogin(post("/auth/passkey/options", {}), env, "/auth/passkey/options")).status, 429);
  env.DB.sqlite.exec("UPDATE auth_challenges SET expires_at = 1");
  assert.equal((await handlePasskeyLogin(post("/auth/passkey/options", {}), env, "/auth/passkey/options")).status, 200);
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM auth_challenges").get().n, 1, "expired challenges are cleared");
});

test("the data download lists the passkeys and deleting the account removes them", async () => {
  const env = await setup(), user = await member(env);
  const { passkey } = await addPasskey(env, user);
  const own = { DB: scopedDb(env.DB, user.id), USER_ID: user.id };
  const [exported] = (await exportAccountData(own, user)).tables.user_passkeys;
  assert.equal(exported.id, passkey.id);
  assert.equal(exported.user_id, undefined);
  env.DB.sqlite.exec(readFileSync(new URL("../migrations/0011_account_deletions.sql", import.meta.url), "utf8"));
  await deleteAccount(own, await findUser(env.DB, user.id, env));
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM user_passkeys").get().n, 0);
  assert.equal((await signIn(env, passkey)).status, 401);
});

test("passkeys are named after their provider and device", () => {
  assert.equal(passkeyName("fbfc3007-154e-4ecc-8c0b-6e020557d7bd", IPHONE), "Apple Passwords (iPhone)");
  assert.equal(passkeyName("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4", "Mozilla/5.0 (Linux; Android 15; Pixel 9)"), "Google Password Manager (Android)");
  assert.equal(passkeyName("08987058-cadc-4b81-b6e1-30de50dcbe96", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Windows Hello");
  assert.equal(passkeyName("adce0002-35bc-c60a-648b-0b25f1f05503", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "Chrome on Mac");
  assert.equal(passkeyName("00000000-0000-0000-0000-000000000000", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "Mac");
  assert.equal(passkeyName("00000000-0000-0000-0000-000000000000", ""), "Passkey");
});
