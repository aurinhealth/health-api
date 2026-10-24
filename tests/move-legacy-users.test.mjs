import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { moveLegacyUsers, insertStatements, requests } from "../scripts/move-legacy-users.mjs";
import { parseConfig, shardPlan } from "../scripts/provision-user-shards.mjs";

const plan = shardPlan(parseConfig(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")));

// The Cloudflare D1 HTTP API over local databases.
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

const PERSONAL = `
  CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, data_type TEXT, external_id TEXT, value REAL, UNIQUE(user_id, data_type, external_id));
  CREATE INDEX idx_hd_user ON health_datapoints(user_id, data_type);
  CREATE TABLE assistant_chats (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT);
  CREATE TABLE assistant_messages (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, chat_id INTEGER, text TEXT);
  CREATE INDEX idx_messages_chat ON assistant_messages(user_id, chat_id);
  CREATE TABLE sync_status (user_id INTEGER NOT NULL, sync_name TEXT NOT NULL, state TEXT, PRIMARY KEY(user_id, sync_name));`;

function setup() {
  const central = new DatabaseSync(":memory:"), one = new DatabaseSync(":memory:"), two = new DatabaseSync(":memory:");
  central.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE user_data_routes (user_id INTEGER PRIMARY KEY, shard_key TEXT NOT NULL);
    CREATE TABLE user_data_shards (shard_key TEXT PRIMARY KEY, binding_name TEXT, state TEXT, accepting_new INTEGER, max_users INTEGER);
    INSERT INTO users VALUES (1),(2),(3);
    INSERT INTO user_data_shards VALUES ('data-001','USER_DATA_001','ready',1,10),('data-002','USER_DATA_002','ready',1,10);
    INSERT INTO user_data_routes VALUES (1,'legacy'),(2,'legacy'),(3,'data-001');` + PERSONAL);
  for (let i = 1; i <= 1200; i++) central.prepare("INSERT INTO health_datapoints (user_id, data_type, external_id, value) VALUES (?, 'hr', ?, ?)").run(i % 2 ? 1 : 2, "x" + i, i / 3);
  central.exec(`INSERT INTO assistant_chats VALUES (5, 1, 'it''s a chat'), (6, 2, NULL);
    INSERT INTO assistant_messages VALUES (10, 1, 5, 'ahoj'), (11, 1, 5, NULL), (12, 2, 6, 'hi');
    INSERT INTO sync_status VALUES (1, 'oura', 'ok'), (2, 'oura', 'ok');`);
  // data-001 already holds account 3; data-002 has the schema but no tables yet
  // for chats, as a shard made before a table existed.
  one.exec(PERSONAL + "INSERT INTO health_datapoints (id, user_id, data_type, external_id, value) VALUES (5000, 3, 'hr', 'y', 1);");
  two.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, data_type TEXT, external_id TEXT, value REAL, extra TEXT, UNIQUE(user_id, data_type, external_id));
    CREATE TABLE sync_status (user_id INTEGER NOT NULL, sync_name TEXT NOT NULL, state TEXT, PRIMARY KEY(user_id, sync_name));`);
  const ids = { "health-data-users-001": "one", "health-data-users-002": "two" };
  const api = fakeApi({ [plan.core.database_id]: central, one, two });
  return { central, one, two, ids, api };
}

const count = (db, sql) => db.prepare(sql).get().n;

test("a dry run only counts", async () => {
  const { central, two, ids, api } = setup();
  const lines = [];
  assert.deepEqual(await moveLegacyUsers({ api, plan, ids, apply: false, log: l => lines.push(l) }), []);
  assert.match(lines.join("\n"), /Account 1 → health-data-users-002: 604 rows in 4 tables/);
  assert.equal(count(central, "SELECT COUNT(*) AS n FROM user_data_routes WHERE shard_key='legacy'"), 2);
  assert.equal(count(two, "SELECT COUNT(*) AS n FROM health_datapoints"), 0);
  assert.doesNotMatch(lines.join("\n"), /ahoj|it's/);
});

test("legacy accounts move to the emptiest EU databases with their ids, and leave the central one", async () => {
  const { central, one, two, ids, api } = setup();
  const before = central.prepare("SELECT id, user_id, data_type, external_id, value FROM health_datapoints WHERE user_id=1 ORDER BY id").all().map(r => ({ ...r }));
  const moved = await moveLegacyUsers({ api, plan, ids, apply: true, log: () => {} });
  assert.deepEqual(moved.map(m => [m.userId, m.shard]), [[1, "health-data-users-002"], [2, "health-data-users-001"]]);
  assert.deepEqual(moved.map(m => m.left), [[], []]);
  for (const table of ["health_datapoints", "assistant_chats", "assistant_messages", "sync_status"]) {
    assert.equal(count(central, `SELECT COUNT(*) AS n FROM ${table} WHERE user_id IN (1,2)`), 0, table);
  }
  assert.deepEqual(central.prepare("SELECT user_id, shard_key FROM user_data_routes ORDER BY user_id").all().map(r => ({ ...r })),
    [{ user_id: 1, shard_key: "data-002" }, { user_id: 2, shard_key: "data-001" }, { user_id: 3, shard_key: "data-001" }]);
  assert.deepEqual(two.prepare("SELECT id, user_id, data_type, external_id, value FROM health_datapoints WHERE user_id=1 ORDER BY id").all().map(r => ({ ...r })), before);
  // Missing tables come with their indexes; messages keep pointing at their chat.
  assert.deepEqual({ ...two.prepare("SELECT m.text, c.title FROM assistant_messages m JOIN assistant_chats c ON c.id=m.chat_id AND c.user_id=m.user_id WHERE m.id=10").get() }, { text: "ahoj", title: "it's a chat" });
  assert.equal(count(two, "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_messages_chat'"), 1);
  assert.equal(count(one, "SELECT COUNT(*) AS n FROM health_datapoints WHERE user_id=3"), 1);
  assert.equal(count(one, "SELECT COUNT(*) AS n FROM health_datapoints WHERE user_id=2"), 600);
  // A second run finds nothing to do.
  const lines = [];
  assert.deepEqual(await moveLegacyUsers({ api, plan, ids, apply: true, log: l => lines.push(l) }), []);
  assert.deepEqual(lines, ["No account is on the legacy route."]);
});

test("a row the shard already holds newer stays the shard's, and the central copy goes", async () => {
  const { central, two, ids, api } = setup();
  two.exec("INSERT INTO sync_status VALUES (1, 'oura', 'newer')");
  await moveLegacyUsers({ api, plan, ids, apply: true, log: () => {} });
  assert.equal(two.prepare("SELECT state FROM sync_status WHERE user_id=1").get().state, "newer");
  assert.equal(count(central, "SELECT COUNT(*) AS n FROM sync_status"), 0);
});

test("an id another account holds in the shard stops the move before anything changes", async () => {
  const { central, two, ids, api } = setup();
  two.exec("INSERT INTO health_datapoints (id, user_id, data_type, external_id) VALUES (7, 9, 'hr', 'z')");
  await assert.rejects(moveLegacyUsers({ api, plan, ids, apply: true, log: () => {} }), /ids of account 1 are taken/);
  assert.equal(count(central, "SELECT COUNT(*) AS n FROM user_data_routes WHERE shard_key='legacy'"), 2);
  assert.equal(count(two, "SELECT COUNT(*) AS n FROM health_datapoints WHERE user_id=1"), 0);
});

test("a column the shard lacks is added before the copy; one without a default is refused", async () => {
  const { central, two, ids, api } = setup();
  two.exec("DROP TABLE sync_status; CREATE TABLE sync_status (user_id INTEGER NOT NULL, sync_name TEXT NOT NULL, PRIMARY KEY(user_id, sync_name))");
  const lines = [];
  await moveLegacyUsers({ api, plan, ids, apply: false, log: l => lines.push(l) });
  assert.match(lines.join("\n"), /health-data-users-002 gets 1 columns it lacks \(sync_status\)/);
  assert.equal(two.prepare("PRAGMA table_info(sync_status)").all().length, 2, "a dry run changes nothing");
  await moveLegacyUsers({ api, plan, ids, apply: true, log: () => {} });
  assert.equal(two.prepare("SELECT state FROM sync_status WHERE user_id=1").get().state, "ok");
  assert.equal(count(central, "SELECT COUNT(*) AS n FROM sync_status"), 0);

  const other = setup();
  other.central.exec("ALTER TABLE assistant_chats ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0; CREATE TABLE coach_picks (user_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(user_id, date))");
  other.two.exec("CREATE TABLE coach_picks (user_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY(user_id, date))");
  await assert.rejects(moveLegacyUsers({ api: other.api, plan, ids: other.ids, apply: false, log: () => {} }), /lacks column coach_picks.kind, which has no default/);
});

test("inserts stay under D1's parameter limit", () => {
  const table = { name: "t", columns: Array.from({ length: 12 }, (_, i) => "c" + i) };
  const page = Array.from({ length: 50 }, () => Object.fromEntries(table.columns.map(c => [c, 1])));
  const statements = insertStatements(table, page);
  assert.ok(statements.every(s => s.params.length <= 99));
  assert.equal(statements.reduce((n, s) => n + s.params.length, 0), 600);
});

test("large rows go in smaller statements and requests", () => {
  const table = { name: "t", columns: ["user_id", "payload_json"] };
  const page = Array.from({ length: 40 }, () => ({ user_id: 1, payload_json: "x".repeat(100 * 1024) }));
  const statements = insertStatements(table, page);
  assert.ok(statements.every(s => s.bytes <= 256 * 1024 + 16));
  const sent = requests(statements);
  assert.ok(sent.every(r => r.length && r.every(s => !("bytes" in s))));
  assert.equal(sent.flat().reduce((n, s) => n + s.params.length, 0), 80);
  assert.ok(sent.length >= 2);
});
