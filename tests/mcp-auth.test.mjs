import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleMcp } from "../src/mcp.js";
import { handleMcpCompat } from "../src/mcp-compat.js";
import { isPublicPath } from "../src/dashboard-auth.js";

const env = { STRENGTH_API_KEY: "owner-master-key", MCP_API_KEY: "mcp-only-key" };
const toolsList = (authorization, handler = handleMcp, environment = env) => handler(new Request("https://petrfitnessdata.eu/mcp", { method: "POST", headers: { ...(authorization ? { Authorization: authorization } : {}), "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), environment);

// A token as the removed ChatGPT OAuth flow issued it: signed with the owner key.
function oauthAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const data = Buffer.from(JSON.stringify({ typ: "access", client_id: "health-strength-test", scope: "strength:read strength:write", exp: now + 3600, iat: now })).toString("base64url");
  return `${data}.${createHmac("sha256", env.STRENGTH_API_KEY).update(data).digest("base64url")}`;
}

test("/mcp takes its own MCP key or the demo key, nothing else", async () => {
  assert.equal((await toolsList(`Bearer ${env.MCP_API_KEY}`)).status, 200);
  assert.equal((await toolsList("Bearer health-strength-demo-2026")).status, 200);
  assert.equal((await toolsList(null)).status, 401);
  assert.equal((await toolsList("Bearer wrong")).status, 401);
  // The owner API key is not an MCP key.
  assert.equal((await toolsList(`Bearer ${env.STRENGTH_API_KEY}`)).status, 401);
  // Connections ChatGPT made through OAuth stop working.
  assert.equal((await toolsList(`Bearer ${oauthAccessToken()}`)).status, 401);
});

test("without MCP_API_KEY only the demo answers", async () => {
  const ownerOnly = { STRENGTH_API_KEY: env.STRENGTH_API_KEY };
  assert.equal((await toolsList("Bearer health-strength-demo-2026", handleMcp, ownerOnly)).status, 200);
  for (const authorization of [`Bearer ${env.STRENGTH_API_KEY}`, "Bearer ", "Bearer undefined", null]) assert.equal((await toolsList(authorization, handleMcp, ownerOnly)).status, 401, String(authorization));
});

test("there is no OAuth flow to connect ChatGPT", async () => {
  for (const path of ["/authorize", "/token", "/register"]) assert.equal(isPublicPath(path), false, path);
  // A refused MCP client is not pointed at OAuth discovery either.
  const refused = await toolsList(null, handleMcpCompat);
  assert.equal(refused.status, 401);
  assert.doesNotMatch(refused.headers.get("WWW-Authenticate") || "", /resource_metadata|oauth/i);
});
