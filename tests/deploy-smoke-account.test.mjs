import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { ensureTenancy, signInEmailUser, smokeUser, findUser, _resetTenancyForTest } from "../src/tenancy.js";
import { _resetGitHubJwksCacheForTest } from "../src/github-oidc.js";
import worker from "../src/entrypoint.js";

// Security audit 2026-11, SEC-010: the deploy smoke test used to act as the
// owner, so a slip in the workflow would have printed his health data into the
// public Actions log. It now acts as its own empty, disabled account.
const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const b64 = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "gh-test" };
async function deployToken() {
  const claims = {
    iss: "https://token.actions.githubusercontent.com", aud: "health-strength", repository: "aurinhealth/health-api", repository_id: "1371310425", repository_owner_id: "329509326",
    ref: "refs/heads/main", workflow_ref: "aurinhealth/health-api/.github/workflows/deploy-worker.yml@refs/heads/main", event_name: "push", actor: "aurinhealth",
    exp: Math.floor(Date.now() / 1000) + 300
  };
  const data = b64({ alg: "RS256", kid: "gh-test" }) + "." + b64(claims);
  return data + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(data))).toString("base64url");
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => String(url).startsWith("https://token.actions.githubusercontent.com/") ? Response.json({ keys: [jwk] }) : realFetch(url, options);

const SMOKE = "deploy-check@example.com";
async function setup(extra = {}) {
  _resetTenancyForTest();
  _resetGitHubJwksCacheForTest();
  const env = { DB: createD1(), OWNER_EMAIL: "owner@example.com", SESSION_SECRET: "s".repeat(40), CONNECTION_KEY: "k".repeat(40), SMOKE_USER_EMAIL: SMOKE, ...extra };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(read("staging/schema.sql"));
  const owner = await signInEmailUser(env.DB, env, "owner@example.com");
  // The owner's own night, which the smoke test must never see.
  env.DB.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, value_numeric, payload_json, record_role) VALUES (?, 'apple', 'sleep_session', 'owner-night', '2026-11-01T23:00:00', '2026-11-02T06:47:00', 467, '{\"note\":\"OWNER-SECRET-NIGHT\"}', 'primary')").run(owner.id);
  return { env, owner };
}
const call = async (env, path, method = "GET", body) => {
  const response = await worker.fetch(new Request("https://aurin.health" + path, { method, headers: { Authorization: "Bearer " + await deployToken(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  return { status: response.status, text: await response.text() };
};

test("the deploy token reads its own empty account, never the owner's", async () => {
  const { env, owner } = await setup();
  for (const path of ["/app/api/sleep", "/app/api/daily", "/app/api/activities"]) {
    const { status, text } = await call(env, path);
    assert.equal(status, 200, path + " " + text.slice(0, 200));
    assert.doesNotMatch(text, /OWNER-SECRET-NIGHT/, path);
    assert.equal(JSON.parse(text).status, "ok", path);
  }
  // What deploy-worker.yml checks holds for the empty account too.
  const json = async (...args) => { const { status, text } = await call(env, ...args); assert.equal(status, 200, args[0] + " " + text.slice(0, 200)); assert.doesNotMatch(text, /OWNER-SECRET-NIGHT/, args[0]); return JSON.parse(text); };
  const today = await json("/app/api/today");
  assert.ok(today.status === "ok" && today.date && typeof today.readiness === "object");
  const gym = await json("/app/api/gym");
  assert.ok(gym.status === "ok" && "values" in gym && "videoLinks" in gym);
  assert.equal((await json("/app/api/week?start=2026-11-02")).days.length, 7);
  const plan = await json("/automation/strength", "POST", { action: "generate", date: "2026-11-02", preview: true });
  assert.ok(plan.status === "ok" && plan.preview === true && plan.plan?.rows?.length && plan.plan.loadEstimates != null, "the gym preview builds a plan");
  assert.equal((await json("/app/api/food/search", "POST", { name: "banana" })).status, "ok");
  const smoke = env.DB.sqlite.prepare("SELECT id, email, disabled, role FROM users WHERE email = ?").get(SMOKE);
  assert.ok(smoke && smoke.id !== owner.id, "a separate account");
  assert.deepEqual({ disabled: smoke.disabled, role: smoke.role }, { disabled: 1, role: "user" });
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?").get(SMOKE).n, 1, "made once");
  // The token still opens nothing else.
  assert.equal((await call(env, "/health/nutrition")).status, 401);
  assert.equal((await call(env, "/app/api/me")).status, 401);
});

test("nobody can sign in to the smoke account, and it never takes over a real one", async () => {
  const { env } = await setup();
  const smoke = await smokeUser(env.DB, env);
  assert.equal(smoke.isOwner, false);
  assert.equal(await signInEmailUser(env.DB, env, SMOKE), null, "disabled: no sign-in");
  assert.equal(await findUser(env.DB, smoke.id, env), null, "disabled: no session");
  // An address a real account uses: no smoke account, and the check fails instead of reading that account.
  const taken = await setup({ SMOKE_USER_EMAIL: "friend@example.com", OPEN_SIGNUP: "true" });
  await signInEmailUser(taken.env.DB, taken.env, "friend@example.com");
  assert.equal(await smokeUser(taken.env.DB, taken.env), null);
  assert.equal((await call(taken.env, "/app/api/sleep")).status, 503);
  // Never the owner's address, and nothing without the setting.
  assert.equal(await smokeUser(env.DB, { ...env, SMOKE_USER_EMAIL: "Owner@Example.com" }), null);
  const unset = await setup({ SMOKE_USER_EMAIL: "" });
  const { status, text } = await call(unset.env, "/app/api/sleep");
  assert.equal(status, 503);
  assert.match(text, /SMOKE_USER_EMAIL/);
});
