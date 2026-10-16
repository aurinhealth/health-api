import test from "node:test";
import assert from "node:assert/strict";
import { verifyGitHubActionsToken, _resetGitHubJwksCacheForTest } from "../src/github-oidc.js";

const b64 = value => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const keyPair = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const first = await keyPair(), second = await keyPair();
const jwkOf = async (pair, kid) => ({ ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid });
async function token(pair, kid, overrides = {}) {
  const claims = {
    iss: "https://token.actions.githubusercontent.com", aud: "health-strength", repository: "shaarkyn/health-api", repository_id: "1371310425", repository_owner_id: "329509326",
    ref: "refs/heads/main", workflow_ref: "shaarkyn/health-api/.github/workflows/deploy-worker.yml@refs/heads/main", event_name: "push", actor: "shaarkyn",
    exp: Math.floor(Date.now() / 1000) + 300, ...overrides
  };
  const data = b64({ alg: "RS256", kid }) + "." + b64(claims);
  return data + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(data))).toString("base64url");
}
const request = jwt => new Request("https://petrfitnessdata.eu/automation/strength", { method: "POST", headers: { Authorization: "Bearer " + jwt } });

test("a workflow token signed with a key GitHub rotated in fetches the keys again, at most once a minute", async () => {
  _resetGitHubJwksCacheForTest();
  const old = await jwkOf(first, "gh-1"), fresh = await jwkOf(second, "gh-2");
  const fetches = [];
  const fetchImpl = async (url, init) => { fetches.push({ url: String(url), init }); return Response.json({ keys: fetches.length === 1 ? [old] : [old, fresh] }); };
  assert.equal((await verifyGitHubActionsToken(request(await token(first, "gh-1")), fetchImpl)).actor, "shaarkyn");
  assert.equal((await verifyGitHubActionsToken(request(await token(second, "gh-2")), fetchImpl)).actor, "shaarkyn");
  assert.equal(fetches.length, 2);
  assert.equal(fetches[1].url, "https://token.actions.githubusercontent.com/.well-known/jwks");
  assert.deepEqual(fetches[1].init, { cache: "no-store" });
  await assert.rejects(verifyGitHubActionsToken(request(await token(second, "gh-3")), fetchImpl), /signing key not found/);
  assert.equal(fetches.length, 2, "no second forced fetch within a minute");
  // The cached list still serves known keys without fetching.
  await verifyGitHubActionsToken(request(await token(first, "gh-1")), fetchImpl);
  assert.equal(fetches.length, 2);
});

test("the claims of another repository, workflow or actor are refused", async () => {
  _resetGitHubJwksCacheForTest();
  const fetchImpl = async () => Response.json({ keys: [await jwkOf(first, "gh-1")] });
  await assert.rejects(verifyGitHubActionsToken(request(await token(first, "gh-1", { repository: "someone/else" })), fetchImpl), /repository/);
  await assert.rejects(verifyGitHubActionsToken(request(await token(first, "gh-1", { actor: "mallory" })), fetchImpl), /actor/);
  await assert.rejects(verifyGitHubActionsToken(request(await token(first, "gh-1", { event_name: "pull_request" })), fetchImpl), /event/);
  // The nightly gym workflow is gone: neither it nor a scheduled run gets in.
  await assert.rejects(verifyGitHubActionsToken(request(await token(first, "gh-1", { workflow_ref: "shaarkyn/health-api/.github/workflows/health-strength.yml@refs/heads/main", event_name: "schedule" })), fetchImpl), /workflow/);
  await assert.rejects(verifyGitHubActionsToken(request(await token(first, "gh-1", { event_name: "schedule" })), fetchImpl), /event/);
  await assert.rejects(verifyGitHubActionsToken(request(await token(second, "gh-1")), fetchImpl), /signature/);
});
