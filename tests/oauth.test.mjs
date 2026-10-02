import test from "node:test";
import assert from "node:assert/strict";
import { handleOAuth, verifyAccessToken } from "../src/oauth.js";
import { handleMcp } from "../src/mcp.js";

const env = { STRENGTH_API_KEY: "owner-master-key" };
const redirect = "https://chatgpt.com/connector/oauth/callback";
const b64url = bytes => Buffer.from(bytes).toString("base64url");

async function tokens() {
  const verifier = "v".repeat(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const form = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return f; };
  const authorize = await handleOAuth(new Request("https://petrfitnessdata.eu/authorize", { method: "POST", body: form({ client_id: "health-strength-test", redirect_uri: redirect, code_challenge: challenge, code_challenge_method: "S256", authorization_key: env.STRENGTH_API_KEY }) }), env, "/authorize");
  const code = new URL(authorize.headers.get("Location")).searchParams.get("code");
  const response = await handleOAuth(new Request("https://petrfitnessdata.eu/token", { method: "POST", body: form({ grant_type: "authorization_code", code, client_id: "health-strength-test", redirect_uri: redirect, code_verifier: verifier }) }), env, "/token");
  return { response: await response.json(), form };
}

const toolsList = token => handleMcp(new Request("https://petrfitnessdata.eu/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env);

test("OAuth hands out a scoped access token, never the owner key", async () => {
  const { response } = await tokens();
  assert.ok(response.access_token);
  assert.notEqual(response.access_token, env.STRENGTH_API_KEY);
  const payload = await verifyAccessToken(response.access_token, env);
  assert.equal(payload.typ, "access");
  assert.equal(payload.client_id, "health-strength-test");
});

test("the access token opens /mcp; refresh, forged and other tokens do not", async () => {
  const { response } = await tokens();
  assert.equal((await toolsList(response.access_token)).status, 200);
  assert.equal((await toolsList(env.STRENGTH_API_KEY)).status, 200);
  assert.equal((await toolsList(response.refresh_token)).status, 401);
  // Change a character in the middle of the signature: the last base64
  // character carries padding bits, so changing it can leave the bytes as they were.
  const sig = response.access_token.indexOf(".") + 10;
  const forged = response.access_token.slice(0, sig) + (response.access_token[sig] === "A" ? "B" : "A") + response.access_token.slice(sig + 1);
  assert.equal((await toolsList(forged)).status, 401);
  assert.equal(await verifyAccessToken(response.access_token, { STRENGTH_API_KEY: "rotated" }), null);
});

test("a refresh returns a new scoped access token", async () => {
  const { response, form } = await tokens();
  const refreshed = await (await handleOAuth(new Request("https://petrfitnessdata.eu/token", { method: "POST", body: form({ grant_type: "refresh_token", refresh_token: response.refresh_token }) }), env, "/token")).json();
  assert.notEqual(refreshed.access_token, env.STRENGTH_API_KEY);
  assert.ok(await verifyAccessToken(refreshed.access_token, env));
});
