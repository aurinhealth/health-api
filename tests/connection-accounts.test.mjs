import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { ensureTenancy, scopedDb, PERSONAL_TABLES, _resetTenancyForTest } from "../src/tenancy.js";
import { saveConnectionSecret, deleteConnectionSecret } from "../src/connection-secrets.js";
import { deleteAccount } from "../src/account-data.js";
import { CENTRAL_PERSONAL_TABLES } from "../src/user-data-routing.js";
import worker, { runIntervalsWebhookInvocation } from "../src/entrypoint.js";

// Webhooks find their user by the account they name (connection_accounts),
// not by decrypting every user's keys: that hit the 1000 queries an invocation
// may make at around 200 users.
const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const KEY = "k".repeat(40);
const wahooTokens = id => JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: 0, user_id: id });

async function setup(count, { old = false } = {}) {
  _resetTenancyForTest();
  const env = { DB: createD1(), OWNER_EMAIL: "owner@example.com", CONNECTION_KEY: KEY, SESSION_SECRET: "s".repeat(40), WAHOO_WEBHOOK_TOKEN: "wtok", INTERVALS_WEBHOOK_SECRET: "isec" };
  await ensureTenancy(env.DB, env);
  env.DB.sqlite.exec(read("staging/schema.sql") + ["0011_account_deletions", "0013_cookbook_and_consents", "0026_account_deletion_retries", "0028_connection_accounts"].map(name => read("migrations/" + name + ".sql")).join("\n"));
  for (let id = 2; id <= count + 1; id++) {
    env.DB.sqlite.prepare("INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, 'user')").run(id, "u" + id + "@example.com", "U" + id);
    env.DB.sqlite.prepare("INSERT INTO user_consents VALUES (?, 'health', '1', '2026-01-01', NULL)").run(id);
    const user = { ...env, DB: scopedDb(env.DB, id), USER_ID: id };
    await saveConnectionSecret(user, "wahoo", wahooTokens(String(5000 + id)));
    await saveConnectionSecret(user, "intervals", "Bearer:token" + id);
    await saveConnectionSecret(user, "intervals_athlete", "i" + (5000 + id));
  }
  // Connections saved before connection_accounts existed.
  if (old) env.DB.sqlite.exec("DELETE FROM connection_accounts");
  return env;
}
const accounts = env => env.DB.sqlite.prepare("SELECT user_id, provider, external_id FROM connection_accounts ORDER BY provider, user_id").all().map(r => ({ ...r }));
const wahooRows = (env, id) => env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM health_datapoints WHERE user_id = ? AND source_family = 'wahoo'").get(id).n;
const cacheVersion = (env, id) => env.DB.sqlite.prepare("SELECT version FROM api_cache_versions WHERE user_id = ?").get(id)?.version || 0;

const wahooEvent = (id, workout = 300) => new Request("https://aurin.health/webhooks/wahoo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_type: "workout_summary", webhook_token: "wtok", user: { id }, workout_summary: { id: workout, duration_active_accum: "3600", workout: { id: workout, starts: "2026-10-14T05:30:00Z", minutes: 60, name: "Ride", workout_type_id: 0 } } }) });
const intervalsEvent = athlete => new Request("https://aurin.health/webhooks/intervals", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer isec" }, body: JSON.stringify({ events: [{ athlete_id: athlete, type: "FITNESS_UPDATED" }] }) });

// The webhook's answer and the database queries it made (the work after the answer included).
async function deliver(env, request) {
  let queries = 0;
  const prepare = env.DB.prepare;
  env.DB.prepare = sql => { queries++; return prepare.call(env.DB, sql); };
  const pending = [];
  try {
    const response = await worker.fetch(request, env, { waitUntil: p => pending.push(p) });
    await Promise.all(pending);
    return { status: response.status, queries };
  } finally { env.DB.prepare = prepare; }
}

test("a webhook reaches its user with the same few queries whether there are 5 users or 300", async () => {
  const counts = {};
  for (const users of [5, 300]) {
    const env = await setup(users);
    const target = users + 1, other = 2;
    const wahoo = await deliver(env, wahooEvent(5000 + target));
    assert.equal(wahoo.status, 200);
    assert.equal(wahooRows(env, target), 1, "saved for the user connected to that Wahoo account");
    assert.equal(wahooRows(env, other), 0);
    const intervals = await deliver(env, intervalsEvent("i" + (5000 + target)));
    assert.equal(intervals.status, 200);
    assert.ok(cacheVersion(env, target) > 0, "the athlete's numbers refresh");
    assert.equal(cacheVersion(env, other), 0);
    counts[users] = [wahoo.queries, intervals.queries];
  }
  assert.deepEqual(counts[300], counts[5]);
  assert.ok(counts[300].every(n => n <= 15), JSON.stringify(counts));
});

test("each athlete of an Intervals.icu webhook gets an invocation of their own; a refused call runs here", async () => {
  const env = await setup(3);
  const calls = [];
  env.USER_JOBS = { intervalsWebhook: async message => { calls.push(message); if (message.athlete === "i5003") throw new Error("over the limit"); return { ok: true }; } };
  const both = new Request("https://aurin.health/webhooks/intervals", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer isec" },
    body: JSON.stringify({ events: [{ athlete_id: "i5002", type: "FITNESS_UPDATED" }, { athlete_id: "i5003", type: "FITNESS_UPDATED" }] }) });
  assert.equal((await deliver(env, both)).status, 200);
  assert.deepEqual(calls.map(c => c.athlete).sort(), ["i5002", "i5003"]);
  assert.deepEqual(calls[0].kinds, ["wellness"]);
  // i5002's invocation did the work (not here); i5003's call failed, so it ran here.
  assert.equal(cacheVersion(env, 2), 0);
  assert.ok(cacheVersion(env, 3) > 0);
  // The invocation itself (UserJobs.intervalsWebhook).
  assert.deepEqual(await runIntervalsWebhookInvocation({ ...env, USER_JOBS: undefined }, { waitUntil() {} }, calls[0]), { ok: true });
  assert.ok(cacheVersion(env, 2) > 0);
});

test("a connection from before the table is found by its keys once, then by its row", async () => {
  const env = await setup(40, { old: true });
  assert.deepEqual(accounts(env), []);
  const first = await deliver(env, wahooEvent(5020));
  assert.equal(wahooRows(env, 20), 1);
  // Every old Wahoo connection got its row in that one pass, and no token is in it.
  assert.equal(accounts(env).filter(a => a.provider === "wahoo").length, 40);
  assert.deepEqual(accounts(env).find(a => a.user_id === 20 && a.provider === "wahoo"), { user_id: 20, provider: "wahoo", external_id: "5020" });
  assert.ok(accounts(env).every(a => /^i?\d+$/.test(a.external_id)));
  const again = await deliver(env, wahooEvent(5021, 301));
  assert.equal(wahooRows(env, 21), 1);
  assert.ok(again.queries < 15 && again.queries < first.queries, JSON.stringify([first.queries, again.queries]));
  // Intervals.icu the same way.
  await deliver(env, intervalsEvent("i5030"));
  assert.ok(cacheVersion(env, 30) > 0);
  assert.equal(accounts(env).filter(a => a.provider === "intervals").length, 40);
  // Nobody connected as that athlete: no keys are read again.
  const unknown = await deliver(env, intervalsEvent("i999999"));
  assert.equal(unknown.status, 200);
  assert.ok(unknown.queries <= 3, String(unknown.queries));
});

test("the row follows the connection: reconnecting moves it, disconnecting and deleting the account remove it", async () => {
  const env = await setup(3);
  const user = id => ({ ...env, DB: scopedDb(env.DB, id), USER_ID: id });
  // Another Wahoo account: the webhooks of the old one reach nobody.
  await saveConnectionSecret(user(2), "wahoo", wahooTokens("7777"));
  assert.equal(accounts(env).find(a => a.user_id === 2 && a.provider === "wahoo").external_id, "7777");
  await deliver(env, wahooEvent(5002));
  assert.equal(wahooRows(env, 2), 0);
  await deliver(env, wahooEvent(7777));
  assert.equal(wahooRows(env, 2), 1);
  // Disconnecting Wahoo and Intervals.icu (the athlete id goes with it).
  await deleteConnectionSecret(user(3), "wahoo");
  await deleteConnectionSecret(user(3), "intervals_athlete");
  assert.deepEqual(accounts(env).filter(a => a.user_id === 3), []);
  await deliver(env, wahooEvent(5003));
  assert.equal(wahooRows(env, 3), 0, "a disconnected account is not found again from old keys");
  assert.deepEqual(accounts(env).filter(a => a.user_id === 3), []);
  // A row that no longer matches the keys does nothing.
  env.DB.sqlite.prepare("UPDATE connection_accounts SET external_id = '5003' WHERE user_id = 4 AND provider = 'wahoo'").run();
  await deliver(env, wahooEvent(5003, 302));
  assert.equal(wahooRows(env, 4), 0);
  // Deleting the account removes its rows with its keys.
  const fetchImpl = async () => new Response(null, { status: 204 });
  await deleteAccount({ ...user(4), WAHOO_TOKEN: wahooTokens("5004") }, { id: 4, email: "u4@example.com", isOwner: false }, { fetchImpl });
  assert.deepEqual(accounts(env).filter(a => a.user_id === 4), []);
  assert.ok(accounts(env).some(a => a.user_id === 2), "the others keep theirs");
});

test("connection_accounts is central, deleted with the account and holds no token", () => {
  assert.deepEqual(PERSONAL_TABLES.connection_accounts, { pk: ["user_id", "provider"] });
  assert.ok(CENTRAL_PERSONAL_TABLES.has("connection_accounts"));
  const migration = read("migrations/0028_connection_accounts.sql");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS connection_accounts_external ON connection_accounts\(provider, external_id\)/);
  assert.doesNotMatch(migration.replace(/--[^\n]*/g, ""), /token|encrypted/i);
});
