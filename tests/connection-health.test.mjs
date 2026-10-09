import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { googleToken } from "../src/index.js";
import { connectionStatus } from "../src/connections.js";
import { markConnectionBroken, markConnectionOk, clearConnectionHealth, readConnectionHealth, connectionProblems } from "../src/connection-health.js";

const envFor = (db, extra = {}) => ({ DB: scopedDb(db, 4), USER_ID: 4, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REFRESH_TOKEN: "refresh", INTERVALS_API_KEY: "key", ...extra });
async function withFetch(answer, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => answer();
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test("a revoked Google grant marks Google for reconnecting; the next token clears it", async () => {
  const db = createD1(), env = envFor(db);
  await withFetch(() => Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 }), () => assert.rejects(googleToken(env), /invalid or expired/));
  let health = await readConnectionHealth(env);
  assert.equal(health.google.needsReconnect, true);
  assert.equal(health.google.lastError, "Token has been expired or revoked.");
  assert.equal(health.intervals.needsReconnect, false);
  const status = await connectionStatus(env);
  const google = status.providers.find(p => p.id === "google");
  assert.equal(google.needsReconnect, true);
  assert.equal(connectionProblems(status).length, 1);
  assert.equal(connectionProblems(status)[0].provider, "google");
  await withFetch(() => Response.json({ access_token: "t" }), () => googleToken(env));
  health = await readConnectionHealth(env);
  assert.equal(health.google.needsReconnect, false);
  assert.equal(health.google.lastError, null);
  assert.ok(Date.parse(health.google.lastSuccessAt));
});

test("a Google outage is not a broken connection", async () => {
  const db = createD1(), env = envFor(db);
  await withFetch(() => Response.json({ error: "internal_failure" }, { status: 500 }), () => assert.rejects(googleToken(env)));
  assert.equal((await readConnectionHealth(env)).google.needsReconnect, false);
});

test("Intervals.icu state is kept per user, cleared on reconnect, hidden when disconnected", async () => {
  const db = createD1(), env = envFor(db), other = envFor(db, { DB: scopedDb(db, 5), USER_ID: 5 });
  await markConnectionBroken(env, "intervals", "Intervals.icu HTTP 401");
  assert.equal((await readConnectionHealth(env)).intervals.needsReconnect, true);
  assert.equal((await readConnectionHealth(other)).intervals.needsReconnect, false);
  // Disconnected: nothing to reconnect.
  const status = await connectionStatus({ ...env, INTERVALS_API_KEY: undefined });
  assert.equal(status.providers.find(p => p.id === "intervals").needsReconnect, false);
  await clearConnectionHealth(env, "intervals");
  assert.equal((await readConnectionHealth(env)).intervals.needsReconnect, false);
  await markConnectionBroken(env, "intervals", "Intervals.icu HTTP 403");
  await markConnectionOk(env, "intervals");
  const health = (await readConnectionHealth(env)).intervals;
  assert.equal(health.needsReconnect, false);
  assert.ok(health.lastErrorAt && health.lastSuccessAt);
});

test("missing Google permissions are a problem too; tracking never throws", async () => {
  const problems = connectionProblems({ providers: [{ id: "google", name: "Google Health", connected: true, needsReconnect: false, missingPermissions: ["sleep"] }, { id: "intervals", name: "Intervals.icu", connected: false, needsReconnect: true }] });
  assert.deepEqual(problems.map(p => [p.provider, p.needsReconnect, p.missingPermissions]), [["google", false, ["sleep"]]]);
  await markConnectionBroken({ DB: { prepare() { throw new Error("down"); }, userId: 1 }, USER_ID: 1 }, "google", "x");
  await markConnectionOk({}, "google");
});

test("sync, reconnects and Today use the connection state", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /isIntervalsAuthFailure\(response\.status\)\) await markConnectionBroken\(env, "intervals"/);
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /clearConnectionHealth\(env,'google'\)/);
  assert.match(entry, /clearConnectionHealth\(env,'intervals'\)/);
  assert.match(entry, /connectionProblems:problems/);
});

test("Today carries the connection problems it is given", async () => {
  const { buildToday } = await import("../src/app-today.js");
  const problem = { provider: "intervals", name: "Intervals.icu", needsReconnect: true, missingPermissions: [], message: "x" };
  assert.deepEqual(buildToday({ date: "2026-10-09", connectionProblems: [problem] }).connectionProblems, [problem]);
  assert.deepEqual(buildToday({ date: "2026-10-09" }).connectionProblems, []);
});
