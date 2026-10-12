import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { TABLES, sqlLiteral, planMoves, copyStatements, coveredRows, deleteStatements, chunks } from "../scripts/move-personal-rows.mjs";
import { parseConfig, shardPlan } from "../scripts/provision-user-shards.mjs";
import { USER_ROUTES_SQL } from "../src/user-data-shards.js";

const plan = shardPlan(parseConfig(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")));
const [pairs, choices] = TABLES;

test("values are quoted for SQL", () => {
  assert.equal(sqlLiteral(null), "NULL");
  assert.equal(sqlLiteral(7), "7");
  assert.equal(sqlLiteral("it's"), "'it''s'");
  assert.throws(() => sqlLiteral({}));
  assert.throws(() => sqlLiteral(Infinity));
  assert.throws(() => sqlLiteral("a\0b"));
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("each user's rows go to the database the user is routed to", () => {
  const routes = [
    { user_id: 1, shard_key: "legacy", binding_name: "DB", state: "ready" },
    { user_id: 2, shard_key: "data-003", binding_name: "USER_DATA_003", state: "ready" },
    { user_id: 3, shard_key: "data-004", binding_name: "USER_DATA_004", state: "draining" },
    { user_id: 4, shard_key: "data-099", binding_name: "USER_DATA_099", state: "ready" },
    { user_id: 6, shard_key: "data-005", binding_name: "DB", state: "ready" }
  ];
  const counts = [
    { table: "manual_activity_pairs", user_id: 1, n: 4 },
    { table: "manual_activity_pairs", user_id: 2, n: 3 },
    { table: "activity_energy_choices", user_id: 2, n: 1 },
    { table: "activity_energy_choices", user_id: 3, n: 2 },
    { table: "activity_energy_choices", user_id: 4, n: 1 },
    { table: "activity_energy_choices", user_id: 5, n: 6 },
    { table: "activity_energy_choices", user_id: 6, n: 1 }
  ];
  const result = planMoves(routes, counts, plan);
  assert.deepEqual(result.moves, [
    { table: "manual_activity_pairs", userId: 2, rows: 3, shardKey: "data-003", database: "health-data-users-003" },
    { table: "activity_energy_choices", userId: 2, rows: 1, shardKey: "data-003", database: "health-data-users-003" }
  ]);
  assert.deepEqual(result.legacy, [{ table: "manual_activity_pairs", userId: 1, rows: 4 }]);
  assert.deepEqual(result.unrouted, [{ table: "activity_energy_choices", userId: 5, rows: 6 }]);
  // Not ready, outside the configured shards, or pointing at the central binding.
  assert.deepEqual(result.unavailable.map(m => m.userId), [3, 4, 6]);
});

test("the route query is the one the Worker uses", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE user_data_routes (user_id INTEGER PRIMARY KEY, shard_key TEXT NOT NULL); CREATE TABLE user_data_shards (shard_key TEXT PRIMARY KEY, binding_name TEXT, state TEXT)");
  db.exec("INSERT INTO user_data_shards VALUES ('data-002','USER_DATA_002','ready'); INSERT INTO user_data_routes VALUES (5,'data-002'),(1,'legacy')");
  const rows = db.prepare(USER_ROUTES_SQL + " ORDER BY r.user_id").all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ user_id: 1, shard_key: "legacy", binding_name: null, state: null }, { user_id: 5, shard_key: "data-002", binding_name: "USER_DATA_002", state: "ready" }]);
});

test("copying keeps the shard's newer rows and deletes only what the shard holds; a second run changes nothing", () => {
  const central = new DatabaseSync(":memory:"), shard = new DatabaseSync(":memory:");
  for (const table of TABLES) central.exec(table.create);
  central.exec(`INSERT INTO manual_activity_pairs VALUES
    (2,'p1','a1','2026-09-01','2026-09-01T10:00:00Z'),
    (2,'p2','a2','2026-09-02','2026-09-02T10:00:00Z'),
    (2,'p3','a3','2026-09-03','2026-09-03T10:00:00Z'),
    (2,'p4','','2026-09-04','2026-09-04T10:00:00Z')`);
  central.exec(`INSERT INTO activity_energy_choices VALUES (2,'a1','2026-09-01','estimate','2026-09-01T10:00:00Z'), (2,'a9','2026-09-09','it''s','2026-09-09T10:00:00Z')`);
  // Written on the shard after the change: p2 re-paired, a3 paired with another plan, a1 chosen again.
  for (const table of TABLES) shard.exec(table.create);
  shard.exec(`INSERT INTO manual_activity_pairs VALUES (2,'p2','a7','2026-09-02','2026-10-01T10:00:00Z'), (2,'p8','a3','2026-09-03','2026-10-01T10:00:00Z')`);
  shard.exec(`INSERT INTO activity_energy_choices VALUES (2,'a1','2026-09-01','device','2026-10-01T10:00:00Z')`);

  const run = () => {
    let deleted = 0;
    for (const table of TABLES) {
      const select = `SELECT ${table.columns.join(", ")} FROM ${table.name} WHERE user_id IN (2)`;
      const rows = central.prepare(select).all().map(r => ({ ...r }));
      shard.exec([table.create + ";", ...copyStatements(table, rows)].join("\n"));
      const covered = coveredRows(table, rows, shard.prepare(select).all().map(r => ({ ...r })));
      if (covered.length) central.exec(deleteStatements(table, covered).join("\n"));
      deleted += covered.length;
    }
    return deleted;
  };
  assert.equal(run(), 6);
  const all = (db, table) => db.prepare(`SELECT * FROM ${table} ORDER BY 2`).all().map(r => ({ ...r }));
  assert.deepEqual(all(central, pairs.name), []);
  assert.deepEqual(all(central, choices.name), []);
  assert.deepEqual(all(shard, pairs.name).map(r => [r.planned_id, r.activity_id]), [["p1", "a1"], ["p2", "a7"], ["p4", ""], ["p8", "a3"]]);
  assert.deepEqual(all(shard, choices.name).map(r => [r.activity_id, r.choice]), [["a1", "device"], ["a9", "it's"]]);
  assert.equal(run(), 0, "idempotent");
});
