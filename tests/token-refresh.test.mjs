import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { saveConnectionSecret, connectionEnvironment, refreshConnectionTokens } from "../src/connection-secrets.js";
import { syncWhoop, whoopAccessToken } from "../src/whoop.js";
import { wahooAccessToken } from "../src/wahoo.js";
import { syncUltrahuman, ultrahumanAccessToken } from "../src/ultrahuman.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
const PROVIDERS = { whoop: ["WHOOP", whoopAccessToken], wahoo: ["WAHOO", wahooAccessToken], ultrahuman: ["ULTRAHUMAN", ultrahumanAccessToken] };
// One user with an expired pair stored; `load()` is the env a request starts with.
async function setup(provider) {
  const raw = createD1();
  raw.sqlite.exec(schema);
  const P = PROVIDERS[provider][0];
  const base = { DB: scopedDb(raw, 1), USER_ID: 1, CONNECTION_KEY: "x".repeat(32), [P + "_CLIENT_ID"]: "cid", [P + "_CLIENT_SECRET"]: "s" };
  await saveConnectionSecret(base, provider, JSON.stringify({ access_token: "a0", refresh_token: "r0", expires_at: 1, user_id: "55" }));
  const load = () => connectionEnvironment(base);
  const stored = async () => JSON.parse((await load())[P + "_TOKEN"]);
  const health = () => raw.sqlite.prepare("SELECT status FROM sync_status WHERE sync_name=?").get("connection_" + provider)?.status ?? null;
  return { raw, base, load, stored, health };
}
// A token endpoint that rotates the refresh token and refuses one used before
// (as WHOOP and Wahoo do); the provider's data calls answer with nothing.
function rotating() {
  const state = { valid: "r0", issued: 0, refused: 0, used: [] };
  const fetchImpl = async (url, opts = {}) => {
    if (!/\/oauth2?\/token$/.test(new URL(url).pathname)) return /ultrahuman/.test(url) ? Response.json({ data: { metric_data: [] } }) : Response.json({ records: [] });
    const token = new URLSearchParams(String(opts.body)).get("refresh_token");
    state.used.push(token);
    await state.before?.(token);
    await new Promise(resolve => setTimeout(resolve, 20));
    if (token !== state.valid) { state.refused++; return Response.json({ error: "invalid_grant" }, { status: 400 }); }
    state.issued++;
    state.valid = "r" + state.issued;
    return Response.json({ access_token: "a" + state.issued, refresh_token: state.valid, expires_in: 3600 });
  };
  return { state, fetchImpl };
}

for (const provider of Object.keys(PROVIDERS)) {
  test(`${provider}: two requests refreshing the same pair at once both get the one new pair`, async () => {
    const { load, stored } = await setup(provider);
    const accessToken = PROVIDERS[provider][1];
    const { state, fetchImpl } = rotating();
    const [a, b] = [await load(), await load()];
    assert.deepEqual(await Promise.all([accessToken(a, { fetchImpl }), accessToken(b, { fetchImpl })]), ["a1", "a1"]);
    assert.deepEqual([state.issued, state.refused, state.used], [1, 0, ["r0"]]);
    assert.equal((await stored()).refresh_token, "r1");
    if (provider === "wahoo") assert.equal((await stored()).user_id, "55");
  });
}

test("the hourly import and the app's sync at once keep WHOOP and Ultrahuman connected", async () => {
  const syncs = { whoop: (env, fetchImpl) => syncWhoop(env, { days: 1, fetchImpl }), ultrahuman: (env, fetchImpl) => syncUltrahuman(env, { days: 1, fetchImpl, today: "2026-10-12" }) };
  for (const [provider, sync] of Object.entries(syncs)) {
    const { state, fetchImpl } = rotating();
    const { load, stored, health } = await setup(provider);
    const results = await Promise.all([sync(await load(), fetchImpl), sync(await load(), fetchImpl)]);
    assert.deepEqual(results.map(r => r.status), ["ok", "ok"], provider);
    assert.equal(health(), "ok", provider);
    assert.equal(state.refused, 0, provider);
    assert.equal((await stored()).refresh_token, state.valid, provider);
  }
});

test("a request whose pair was refreshed after it started uses the stored pair without refreshing", async () => {
  const { load, stored } = await setup("whoop");
  const { state, fetchImpl } = rotating();
  const late = await load();
  assert.equal(await whoopAccessToken(await load(), { fetchImpl }), "a1");
  assert.equal(await whoopAccessToken(late, { fetchImpl }), "a1");
  assert.deepEqual(state.used, ["r0"]);
  assert.equal((await stored()).refresh_token, "r1");
});

test("a refused refresh takes the pair another request saved meanwhile instead of breaking the connection", async () => {
  const { base, load, stored, health } = await setup("whoop");
  const { state, fetchImpl } = rotating();
  // Another request (one that did not wait for the lease) refreshes while this one asks.
  state.before = async () => {
    state.before = null; state.valid = "r9";
    await saveConnectionSecret(base, "whoop", JSON.stringify({ access_token: "a9", refresh_token: "r9", expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  };
  const result = await syncWhoop(await load(), { days: 1, fetchImpl, now: Date.now() });
  assert.equal(result.status, "ok");
  assert.equal(state.refused, 1);
  assert.equal(health(), "ok");
  assert.equal((await stored()).refresh_token, "r9");
});

test("a refresh refused with no newer pair still fails, and a lease left by a dead request is not waited for", async () => {
  const { raw, load, health } = await setup("whoop");
  const refuse = async () => Response.json({ error: "invalid_grant" }, { status: 400 });
  assert.equal((await syncWhoop(await load(), { days: 1, fetchImpl: refuse })).status, "error");
  assert.equal(health(), "broken");
  raw.sqlite.prepare("UPDATE sync_status SET status='running',updated_at=datetime('now') WHERE sync_name='refresh_whoop'").run();
  const env = await load();
  const text = await refreshConnectionTokens(env, "whoop", env.WHOOP_TOKEN, async t => JSON.stringify({ ...t, access_token: "a5", expires_at: Math.floor(Date.now() / 1000) + 3600 }), { pause: 5, patience: 30 });
  assert.equal(JSON.parse(text).access_token, "a5");
});
