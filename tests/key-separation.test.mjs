import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createD1 } from "./helpers/d1.mjs";
import { saveConnectionSecret, connectionEnvironment, migrateConnectionSecrets } from "../src/connection-secrets.js";
import { internalHeaders, isInternalCall } from "../src/internal-auth.js";
import gateway from "../src/strength-gateway.js";

const CONNECTION_KEY = "Qm9yZWQgYnkgdGVzdHMsIHRoaXMgaXMgbm90IGEga2V5IQ==";
const OWNER_KEY = "owner-master-key";
const ctx = { waitUntil() {} };
const stored = db => db.sqlite.prepare("SELECT user_id, provider, encrypted FROM connection_credentials ORDER BY user_id, provider").all();

test("with CONNECTION_KEY, connection keys are encrypted with it and bound to their user", async t => {
  const errors = t.mock.method(console, "error", () => {});
  const DB = createD1();
  const alice = { DB, CONNECTION_KEY, USER_ID: 1 };
  await saveConnectionSecret(alice, "google", "alice-google-token");
  await saveConnectionSecret(alice, "intervals", "alice-intervals-key");
  assert.ok(stored(DB).every(row => row.encrypted.startsWith("v2.") && !row.encrypted.includes("alice")));
  // Readable without the owner API key.
  const resolved = await connectionEnvironment(alice);
  assert.equal(resolved.GOOGLE_REFRESH_TOKEN, "alice-google-token");
  assert.equal(resolved.INTERVALS_API_KEY, "alice-intervals-key");
  assert.deepEqual(resolved.CONNECTED_PROVIDERS, ["google", "intervals"]);
  // A row copied to another account does not decrypt there; the owner API key does not open it either.
  DB.sqlite.exec("INSERT INTO connection_credentials SELECT 2, provider, encrypted, updated_at FROM connection_credentials WHERE user_id = 1");
  const copied = await connectionEnvironment({ DB, CONNECTION_KEY, USER_ID: 2 });
  assert.equal(copied.GOOGLE_REFRESH_TOKEN, undefined);
  assert.deepEqual(copied.CONNECTED_PROVIDERS, []);
  assert.deepEqual((await connectionEnvironment({ DB, STRENGTH_API_KEY: OWNER_KEY, USER_ID: 1 })).CONNECTED_PROVIDERS, []);
  assert.ok(errors.mock.callCount() >= 4);
});

test("keys saved before CONNECTION_KEY stay readable and the cron moves them over to it", async () => {
  const DB = createD1();
  const before = { DB, STRENGTH_API_KEY: OWNER_KEY, USER_ID: 3 };
  await saveConnectionSecret(before, "google", "old-google-token");
  await saveConnectionSecret(before, "intervals", "old-intervals-key");
  await saveConnectionSecret({ ...before, USER_ID: 4 }, "intervals", "other-user-key");
  assert.ok(stored(DB).every(row => !row.encrypted.startsWith("v2.")));
  assert.equal((await connectionEnvironment({ ...before, CONNECTION_KEY })).GOOGLE_REFRESH_TOKEN, "old-google-token");
  // Nothing happens until CONNECTION_KEY is set.
  assert.deepEqual(await migrateConnectionSecrets({ DB, STRENGTH_API_KEY: OWNER_KEY }), { migrated: 0, failed: 0 });
  assert.deepEqual(await migrateConnectionSecrets({ DB, STRENGTH_API_KEY: OWNER_KEY, CONNECTION_KEY }), { migrated: 3, failed: 0 });
  assert.ok(stored(DB).every(row => row.encrypted.startsWith("v2.")));
  assert.deepEqual(await migrateConnectionSecrets({ DB, STRENGTH_API_KEY: OWNER_KEY, CONNECTION_KEY }), { migrated: 0, failed: 0 });
  // From then on the owner API key guards nobody's keys and can be replaced.
  const after = await connectionEnvironment({ DB, CONNECTION_KEY, USER_ID: 3 });
  assert.equal(after.GOOGLE_REFRESH_TOKEN, "old-google-token");
  assert.equal(after.INTERVALS_API_KEY, "old-intervals-key");
  assert.equal((await connectionEnvironment({ DB, CONNECTION_KEY, USER_ID: 4 })).INTERVALS_API_KEY, "other-user-key");
});

test("the migration keeps a key the user saved while it ran", async () => {
  const DB = createD1(), before = { DB, STRENGTH_API_KEY: OWNER_KEY, USER_ID: 5 };
  await saveConnectionSecret(before, "google", "old-token");
  // The user connects again between the migration's read and its write.
  const racing = { ...DB, prepare(sql) {
    const statement = DB.prepare(sql);
    if (!sql.startsWith("SELECT user_id")) return statement;
    return { bind: (...args) => ({ all: async () => { const rows = await statement.bind(...args).all(); await saveConnectionSecret({ ...before, CONNECTION_KEY }, "google", "new-token"); return rows; } }) };
  } };
  assert.deepEqual(await migrateConnectionSecrets({ DB: racing, STRENGTH_API_KEY: OWNER_KEY, CONNECTION_KEY }), { migrated: 0, failed: 0 });
  assert.equal((await connectionEnvironment({ DB, CONNECTION_KEY, USER_ID: 5 })).GOOGLE_REFRESH_TOKEN, "new-token");
});

test("a key that does not decrypt counts as not connected instead of failing every request", async t => {
  t.mock.method(console, "error", () => {});
  const DB = createD1();
  await saveConnectionSecret({ DB, STRENGTH_API_KEY: OWNER_KEY, USER_ID: 6 }, "google", "token");
  await saveConnectionSecret({ DB, CONNECTION_KEY, USER_ID: 6 }, "intervals", "key");
  const wrong = await connectionEnvironment({ DB, STRENGTH_API_KEY: "another-key", CONNECTION_KEY, USER_ID: 6 });
  assert.deepEqual(wrong.CONNECTED_PROVIDERS, ["intervals"]);
  // The migration leaves such a row alone.
  const row = stored(DB).find(r => r.provider === "google").encrypted;
  assert.deepEqual(await migrateConnectionSecrets({ DB, STRENGTH_API_KEY: "another-key", CONNECTION_KEY }), { migrated: 0, failed: 1 });
  assert.equal(stored(DB).find(r => r.provider === "google").encrypted, row);
});

test("a CONNECTION_KEY too short to be a key is not used", async t => {
  const errors = t.mock.method(console, "error", () => {});
  const DB = createD1(), env = { DB, STRENGTH_API_KEY: OWNER_KEY, CONNECTION_KEY: "short", USER_ID: 7 };
  await saveConnectionSecret(env, "google", "token");
  assert.ok(!stored(DB)[0].encrypted.startsWith("v2."));
  assert.equal((await connectionEnvironment(env)).GOOGLE_REFRESH_TOKEN, "token");
  assert.ok(errors.mock.callCount() <= 1);
});

test("the app's layers call each other with a token of their own, not the owner API key", async () => {
  const headers = internalHeaders();
  assert.match(headers.Authorization, /^Bearer [A-Za-z0-9+/]{43}=$/);
  assert.deepEqual(internalHeaders(), headers);
  const call = authorization => new Request("https://internal/strength/unknown", { headers: authorization ? { Authorization: authorization } : {} });
  assert.equal(isInternalCall(call(headers.Authorization)), true);
  assert.equal(isInternalCall(call(`Bearer ${OWNER_KEY}`)), false);
  assert.equal(isInternalCall(call(null)), false);
  // The strength routes take the internal token (no owner key needed) or the owner key, nothing else.
  const env = { STRENGTH_API_KEY: OWNER_KEY, MCP_API_KEY: "mcp-only-key" };
  assert.equal((await gateway.fetch(call(headers.Authorization), {}, ctx)).status, 404);
  assert.equal((await gateway.fetch(call(`Bearer ${OWNER_KEY}`), env, ctx)).status, 404);
  for (const authorization of [null, "Bearer mcp-only-key", "Bearer ", "Bearer undefined"]) assert.equal((await gateway.fetch(call(authorization), env, ctx)).status, 401, String(authorization));
  assert.equal((await gateway.fetch(call("Bearer undefined"), {}, ctx)).status, 401);
  // No layer sends the owner API key along any more.
  for (const file of readdirSync(new URL("../src/", import.meta.url)).filter(name => name.endsWith(".js"))) {
    const source = readFileSync(new URL("../src/" + file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Authorization["']?\s*[:,]\s*[^,;\n]*STRENGTH_API_KEY/, file);
    // Nor stands in for the session, MCP or connection key.
    assert.doesNotMatch(source, /(SESSION_SECRET|MCP_API_KEY|CONNECTION_KEY)\s*\|\|\s*env\.STRENGTH_API_KEY|STRENGTH_API_KEY\s*\|\|\s*env\.(SESSION_SECRET|MCP_API_KEY|CONNECTION_KEY)/, file);
  }
});

test("a deploy stops before going live when the Worker has no SESSION_SECRET", () => {
  const check = (input, ...names) => spawnSync(process.execPath, [new URL("../scripts/require-secrets.mjs", import.meta.url).pathname, ...names], { input, encoding: "utf8" });
  const listed = JSON.stringify([{ name: "GOOGLE_CLIENT_ID", type: "secret_text" }, { name: "SESSION_SECRET", type: "secret_text" }]);
  assert.equal(check(listed, "SESSION_SECRET").status, 0);
  const missing = check(JSON.stringify([{ name: "STRENGTH_API_KEY", type: "secret_text" }]), "SESSION_SECRET");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing SESSION_SECRET/);
  assert.equal(check("Authentication error", "SESSION_SECRET").status, 1);
  // Both deploys run the check before they change anything.
  for (const [file, env] of [["deploy-worker.yml", ""], ["deploy-staging.yml", " --env staging"]]) {
    const workflow = readFileSync(new URL("../.github/workflows/" + file, import.meta.url), "utf8");
    const at = workflow.indexOf(`wrangler@4 secret list${env} | node scripts/require-secrets.mjs SESSION_SECRET`);
    assert.ok(at > 0 && at < workflow.indexOf("d1 "), file);
  }
});
