import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { restoreCentralRows } from "../scripts/restore-central-rows.mjs";
import { parseConfig, shardPlan } from "../scripts/provision-user-shards.mjs";

const plan = shardPlan(parseConfig(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")));

function fakeApi(databases) {
  async function batch(id, statements) {
    const db = databases[id];
    return statements.map(({ sql, params = [] }) => {
      const statement = db.prepare(sql);
      if (/^\s*(SELECT|PRAGMA)/i.test(sql)) return { success: true, results: statement.all(...params).map(r => ({ ...r })) };
      const info = statement.run(...params);
      return { success: true, results: [], meta: { changes: Number(info.changes) } };
    });
  }
  return { batch, query: async (id, sql, params = []) => (await batch(id, [{ sql, params }]))[0] };
}

const CENTRAL = `
  CREATE TABLE user_consents (user_id INTEGER NOT NULL, kind TEXT NOT NULL, given_at TEXT, PRIMARY KEY(user_id, kind));
  CREATE TABLE push_tokens (user_id INTEGER NOT NULL, token TEXT NOT NULL, PRIMARY KEY(user_id, token));
  CREATE TABLE connection_credentials (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, provider TEXT);
  CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, value REAL);`;

function setup() {
  const central = new DatabaseSync(":memory:"), one = new DatabaseSync(":memory:"), two = new DatabaseSync(":memory:");
  central.exec(CENTRAL + "INSERT INTO connection_credentials VALUES (9, 2, 'google');");
  one.exec(CENTRAL + `INSERT INTO user_consents VALUES (6, 'health', 'a'), (6, 'ai', 'b');
    INSERT INTO push_tokens VALUES (6, 'tok');
    INSERT INTO connection_credentials VALUES (4, 6, 'oura'), (9, 6, 'whoop');
    INSERT INTO health_datapoints VALUES (1, 6, 1.5);`);
  // The account consented again since: the central row stays.
  central.exec("INSERT INTO user_consents VALUES (6, 'health', 'newer')");
  const ids = { "health-data-users-001": "one", "health-data-users-002": "two" };
  return { central, one, two, ids, api: fakeApi({ [plan.core.database_id]: central, one, two }) };
}
const count = (db, sql) => db.prepare(sql).get().n;

test("a dry run only counts", async () => {
  const { central, one, ids, api } = setup();
  const lines = [];
  await restoreCentralRows({ api, plan, ids, apply: false, log: l => lines.push(l) });
  assert.ok(lines.includes("health-data-users-001: user_consents 2 rows (accounts 6)"));
  assert.ok(!lines.some(l => /health_datapoints/.test(l)), "shard tables are not touched");
  assert.equal(count(one, "SELECT COUNT(*) AS n FROM user_consents"), 2);
  assert.equal(count(central, "SELECT COUNT(*) AS n FROM push_tokens"), 0);
  assert.doesNotMatch(lines.join("\n"), /\btok\b|oura|whoop/);
});

test("central rows come back from the shard; a newer row and another account's id stay", async () => {
  const { central, one, ids, api } = setup();
  const result = await restoreCentralRows({ api, plan, ids, apply: true, log: () => {} });
  assert.equal(central.prepare("SELECT given_at FROM user_consents WHERE user_id=6 AND kind='health'").get().given_at, "newer");
  assert.equal(central.prepare("SELECT given_at FROM user_consents WHERE user_id=6 AND kind='ai'").get().given_at, "b");
  assert.equal(count(central, "SELECT COUNT(*) AS n FROM push_tokens WHERE user_id=6"), 1);
  assert.equal(count(central, "SELECT COUNT(*) AS n FROM connection_credentials WHERE user_id=6"), 1);
  assert.equal(central.prepare("SELECT user_id FROM connection_credentials WHERE id=9").get().user_id, 2);
  assert.equal(count(one, "SELECT COUNT(*) AS n FROM user_consents"), 0);
  assert.equal(count(one, "SELECT COUNT(*) AS n FROM push_tokens"), 0);
  assert.equal(one.prepare("SELECT id FROM connection_credentials").all().map(r => r.id).join(), "9", "a key another account holds stays on the shard");
  assert.equal(count(one, "SELECT COUNT(*) AS n FROM health_datapoints"), 1);
  assert.deepEqual(result.find(r => r.table === "connection_credentials"), { shard: "health-data-users-001", table: "connection_credentials", rows: 2, restored: 1, left: 1 });
  const lines = [];
  await restoreCentralRows({ api, plan, ids, apply: true, log: l => lines.push(l) });
  assert.equal(count(central, "SELECT COUNT(*) AS n FROM connection_credentials"), 2, "a second run adds nothing");
});
