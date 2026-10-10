import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { buildCopy, sqlLiteral, SqlFiles, DONE_KEY } from "../scripts/copy-owner-data.mjs";

const SCHEMA = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
const OWNER = "chelseafc.czsk@gmail.com";
const TRICKY = "it's; a \"test\"\nnový řádek 💪 -- not a comment */ ('x');";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  return db;
}

// The live database: the owner is user 1, someone invited is user 2.
function liveDatabase() {
  const db = database();
  db.exec(`INSERT INTO users (id, email, role) VALUES (1, '${OWNER}', 'admin'), (2, 'friend@example.com', 'user')`);
  db.exec("INSERT INTO user_invites (email, invited_by) VALUES ('friend@example.com', 1)");
  const point = db.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, sample_time, value_numeric, payload_json) VALUES (?, 'google-wearables', 'heart-rate', ?, '2026-10-01T10:00:00Z', ?, ?)");
  for (let i = 1; i <= 12; i++) point.run(1, "hr-" + i, 60 + i + 0.5, JSON.stringify({ bpm: 60 + i, note: TRICKY }));
  point.run(2, "friend-hr", 70, "{}");
  db.prepare("INSERT INTO food_logs (user_id, consumed_date, recipe_title, kcal, note) VALUES (1, '2026-10-01', ?, 512.25, NULL)").run(TRICKY);
  db.exec("INSERT INTO food_logs (user_id, consumed_date, recipe_title, kcal) VALUES (2, '2026-10-01', 'friend lunch', 300)");
  db.exec("INSERT INTO assistant_chats (id, user_id, title) VALUES (7, 1, 'Plan'), (8, 2, 'Friend chat')");
  db.exec("INSERT INTO assistant_messages (chat_id, user_id, role, content) VALUES (7, 1, 'user', 'hi'), (8, 2, 'user', 'secret')");
  db.exec("INSERT INTO connection_credentials (user_id, provider, encrypted, updated_at) VALUES (1, 'intervals', 'cipher', '2026-10-01')");
  db.exec("INSERT INTO sync_status (user_id, sync_name, status) VALUES (1, 'google', 'ok')");
  db.exec("INSERT INTO shared_foods (food_key, search_name, product_json) VALUES ('milk', 'mleko', '{}')");
  return db;
}

// Staging after its first request: the owner exists (with a different id here).
function stagingDatabase() {
  const db = database();
  db.exec(`INSERT INTO users (id, email, role) VALUES (3, '${OWNER}', 'admin')`);
  return db;
}

function sqliteQuery(databases) {
  return async (name, sql, params = []) => {
    const statement = databases[name].prepare(sql);
    statement.setReturnArrays(true);
    return { columns: statement.columns().map(c => c.name), rows: statement.all(...params) };
  };
}

async function copy(live, staging, options = {}) {
  const result = await buildCopy({ query: sqliteQuery({ live, staging }), source: "live", target: "staging", ownerEmail: OWNER, ...options });
  for (const file of result.files) staging.exec(file);
  return result;
}

test("refreshing staging personal history preserves the independently managed food catalogue", async () => {
  const live=liveDatabase(),staging=stagingDatabase();
  staging.exec("INSERT INTO schema_meta(key,value) VALUES('food_catalog_state','ready'); INSERT INTO shared_foods(food_key,search_name,product_json) VALUES('staging-food','staging food','{}')");
  const result=await copy(live,staging,{refresh:true});
  assert.equal(result.counts.shared_foods,undefined);
  assert.deepEqual(staging.prepare('SELECT food_key FROM shared_foods').all().map(r=>r.food_key),['staging-food']);
});

test("SQL literals survive quotes, newlines, semicolons and emoji", () => {
  const db = new DatabaseSync(":memory:");
  const values = [TRICKY, "", null, 0, -1.25, 1e21, true, false, Infinity];
  const row = db.prepare(`SELECT ${values.map(sqlLiteral).join(", ")}`);
  row.setReturnArrays(true);
  assert.deepEqual(row.get(), [TRICKY, "", null, 0, -1.25, 1e21, 1, 0, null]);
});

test("only the owner's rows are copied, without sign-in keys or sync state", async () => {
  const live = liveDatabase(), staging = stagingDatabase();
  const result = await copy(live, staging, { pageRows: 5 });
  assert.equal(result.counts.health_datapoints, 12);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM health_datapoints WHERE user_id = 3").get().n, 12);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM health_datapoints WHERE user_id <> 3").get().n, 0);
  const point = staging.prepare("SELECT value_numeric, payload_json FROM health_datapoints WHERE external_id = 'hr-12'").get();
  assert.equal(point.value_numeric, 72.5);
  assert.equal(JSON.parse(point.payload_json).note, TRICKY);
  const food = staging.prepare("SELECT recipe_title, kcal, note FROM food_logs").all();
  assert.deepEqual(food.map(f => ({ ...f })), [{ recipe_title: TRICKY, kcal: 512.25, note: null }]);
  assert.deepEqual(staging.prepare("SELECT id, title FROM assistant_chats").all().map(r => ({ ...r })), [{ id: 7, title: "Plan" }]);
  assert.deepEqual(staging.prepare("SELECT chat_id, content FROM assistant_messages").all().map(r => ({ ...r })), [{ chat_id: 7, content: "hi" }]);
  for (const table of ["connection_credentials", "sync_status", "user_invites"]) {
    assert.equal(staging.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM shared_foods").get().n, 1);
  assert.ok(staging.prepare("SELECT value FROM schema_meta WHERE key = ?").get(DONE_KEY));
});

test("a finished copy is not repeated, a refresh replaces what staging has", async () => {
  const live = liveDatabase(), staging = stagingDatabase();
  await copy(live, staging);
  assert.equal((await copy(live, staging)).skipped, true);
  staging.exec("INSERT INTO food_logs (user_id, consumed_date, recipe_title) VALUES (3, '2026-10-02', 'tried on staging')");
  live.exec("UPDATE food_logs SET kcal = 600 WHERE user_id = 1");
  const refreshed = await copy(live, staging, { refresh: true });
  assert.equal(refreshed.skipped, false);
  assert.deepEqual(staging.prepare("SELECT recipe_title, kcal FROM food_logs").all().map(r => ({ ...r })), [{ recipe_title: TRICKY, kcal: 600 }]);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM health_datapoints").get().n, 12);
});

test("a refresh removes the old rows in small pieces, each in its own file", async () => {
  const live = liveDatabase(), staging = stagingDatabase();
  await copy(live, staging);
  const result = await buildCopy({ query: sqliteQuery({ live, staging }), source: "live", target: "staging", ownerEmail: OWNER, refresh: true, deleteRows: 5 });
  const deletes = result.files.filter(text => /DELETE FROM "health_datapoints"/.test(text));
  assert.equal(deletes.length, 3);
  for (const text of deletes) assert.equal((text.match(/DELETE FROM "health_datapoints"/g) || []).length, 1);
  for (const text of result.files) staging.exec(text);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM health_datapoints").get().n, 12);
});

test("an interrupted refresh is finished by the next run", async () => {
  const live = liveDatabase(), staging = stagingDatabase();
  await copy(live, staging);
  const refresh = await buildCopy({ query: sqliteQuery({ live, staging }), source: "live", target: "staging", ownerEmail: OWNER, refresh: true, files: new SqlFiles({ maxStatementBytes: 600, maxFileBytes: 2000 }) });
  staging.exec(refresh.files[0]);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM schema_meta WHERE key = ?").get(DONE_KEY).n, 0);
  assert.equal((await copy(live, staging)).skipped, false);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM health_datapoints").get().n, 12);
});

test("files are handed over one by one as they fill up", async () => {
  const live = liveDatabase(), staging = stagingDatabase();
  const handed = [];
  const result = await buildCopy({ query: sqliteQuery({ live, staging }), source: "live", target: "staging", ownerEmail: OWNER, files: new SqlFiles({ maxStatementBytes: 600, maxFileBytes: 2000, onFile: (text, n) => handed.push([n, text]) }) });
  assert.deepEqual(result.files, []);
  assert.equal(result.fileCount, handed.length);
  assert.deepEqual(handed.map(([n]) => n), handed.map((_, i) => i + 1));
  for (const [, text] of handed) staging.exec(text);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM health_datapoints").get().n, 12);
});

test("an interrupted copy continues where it stopped", async () => {
  const live = liveDatabase(), staging = stagingDatabase();
  const first = await buildCopy({ query: sqliteQuery({ live, staging }), source: "live", target: "staging", ownerEmail: OWNER, files: new SqlFiles({ maxStatementBytes: 600, maxFileBytes: 2000 }) });
  assert.ok(first.files.length > 2);
  assert.ok(first.files.every(f => Buffer.byteLength(f) <= 2000 + 600));
  staging.exec(first.files[0]);
  await copy(live, staging);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM health_datapoints").get().n, 12);
  assert.equal(staging.prepare("SELECT COUNT(*) AS n FROM food_logs").get().n, 1);
});

test("the copy stops when the owner is missing", async () => {
  const live = liveDatabase(), staging = database();
  await assert.rejects(() => buildCopy({ query: sqliteQuery({ live, staging }), source: "live", target: "staging", ownerEmail: OWNER }), /open the staging copy once/);
});
