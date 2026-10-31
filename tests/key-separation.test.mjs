import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createD1 } from "./helpers/d1.mjs";
import { saveConnectionSecret, connectionEnvironment } from "../src/connection-secrets.js";
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

// v2 and v3: the same CONNECTION_KEY, derived under the app's old name and under Aurin.
// Rows are still written as v2, which the version before this one reads (rollback, deploy).
async function sealed(version, name, value) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(CONNECTION_KEY), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(name + " connection credentials") }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("4:intervals") }, key, new TextEncoder().encode(value));
  return version + "." + Buffer.from(iv).toString("base64") + "." + Buffer.from(cipher).toString("base64");
}
test("v2 and v3 keys are both read, and loading them rewrites nothing", async () => {
  const DB = createD1();
  await saveConnectionSecret({ DB, CONNECTION_KEY, USER_ID: 4 }, "intervals", "placeholder");
  for (const [version, name] of [["v2", "loadwise"], ["v3", "aurin"]]) {
    const value = await sealed(version, name, version + "-intervals-key");
    DB.sqlite.prepare("UPDATE connection_credentials SET encrypted = ? WHERE user_id = 4").run(value);
    assert.equal((await connectionEnvironment({ DB, CONNECTION_KEY, USER_ID: 4 })).INTERVALS_API_KEY, version + "-intervals-key");
    assert.equal(stored(DB)[0].encrypted, value);
  }
  // A v3 row under the wrong name does not open.
  DB.sqlite.prepare("UPDATE connection_credentials SET encrypted = ? WHERE user_id = 4").run((await sealed("v3", "loadwise", "x")));
  const errors = console.error; console.error = () => {};
  try { assert.equal((await connectionEnvironment({ DB, CONNECTION_KEY, USER_ID: 4 })).INTERVALS_API_KEY, undefined); } finally { console.error = errors; }
});

test("a key in the old format (encrypted with the owner API key) no longer opens", async t => {
  t.mock.method(console, "error", () => {});
  const DB = createD1();
  await saveConnectionSecret({ DB, CONNECTION_KEY, USER_ID: 6 }, "intervals", "key");
  // How the old format looked: iv.cipher, AES-GCM with SHA-256 of STRENGTH_API_KEY, no user binding.
  const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(OWNER_KEY)), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12)), b64 = bytes => Buffer.from(bytes).toString("base64");
  const old = b64(iv) + "." + b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("token")));
  DB.sqlite.prepare("INSERT INTO connection_credentials VALUES (6, 'google', ?, '2026-10-01')").run(old);
  const resolved = await connectionEnvironment({ DB, STRENGTH_API_KEY: OWNER_KEY, CONNECTION_KEY, USER_ID: 6 });
  assert.deepEqual(resolved.CONNECTED_PROVIDERS, ["intervals"]);
  assert.equal(resolved.GOOGLE_REFRESH_TOKEN, undefined);
});

test("without a usable CONNECTION_KEY nothing is saved", async t => {
  const errors = t.mock.method(console, "error", () => {});
  for (const env of [{ STRENGTH_API_KEY: OWNER_KEY }, { STRENGTH_API_KEY: OWNER_KEY, CONNECTION_KEY: "short" }]) {
    const DB = createD1();
    await assert.rejects(saveConnectionSecret({ DB, ...env, USER_ID: 7 }, "google", "token"), /Connection security is missing|Chybí zabezpečení propojení/);
    assert.deepEqual(stored(DB), []);
  }
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
  // The deploy runs the check before it changes anything.
  for (const [file, env] of [["deploy-worker.yml", ""]]) {
    const workflow = readFileSync(new URL("../.github/workflows/" + file, import.meta.url), "utf8");
    const at = workflow.search(new RegExp(`wrangler@4[.\\d]* secret list${env} \\| node scripts/require-secrets\\.mjs SESSION_SECRET`));
    assert.ok(at > 0 && at < workflow.indexOf("d1 "), file);
  }
});
