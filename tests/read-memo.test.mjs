import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, memoizableSql } from "../src/tenancy.js";

function counted() {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE dashboard_profile(user_id INTEGER,id INTEGER,profile_json TEXT); CREATE TABLE sync_status(user_id INTEGER,sync_name TEXT,status TEXT); INSERT INTO dashboard_profile VALUES(3,1,'{\"age\":30}'); INSERT INTO sync_status VALUES(3,'google','ok')");
  const asked = [];
  const prepare = db.prepare;
  db.prepare = sql => { const s = prepare(sql); const wrap = st => ({ ...st, bind: (...v) => wrap(st.bind(...v)), first: () => { asked.push(sql); return st.first(); }, all: () => { asked.push(sql); return st.all(); }, run: () => { asked.push(sql); return st.run(); } }); return wrap(s); };
  return { db, asked };
}
const PROFILE = "SELECT profile_json FROM dashboard_profile WHERE user_id=? AND id=?";

test("within a GET an identical read of the user's tables is asked once, a copy each time", async () => {
  const { db, asked } = counted();
  const scoped = scopedDb(db, 3, { memo: true });
  const [a, b] = await Promise.all([scoped.prepare(PROFILE).bind(3, 1).first(), scoped.prepare(PROFILE).bind(3, 1).first()]);
  const c = await scoped.prepare(PROFILE).bind(3, 1).first();
  assert.equal(asked.length, 1);
  assert.deepEqual([a, b, c].map(r => r.profile_json), Array(3).fill('{"age":30}'));
  a.profile_json = "changed by a caller";
  assert.equal((await scoped.prepare(PROFILE).bind(3, 1).first()).profile_json, '{"age":30}');
  // Other values are another read.
  await scoped.prepare(PROFILE).bind(3, 2).first();
  assert.equal(asked.length, 2);
});

test("a write forgets every kept read; table creation does not", async () => {
  const { db, asked } = counted();
  const scoped = scopedDb(db, 3, { memo: true });
  await scoped.prepare(PROFILE).bind(3, 1).first();
  await scoped.prepare("CREATE TABLE IF NOT EXISTS dashboard_profile(user_id INTEGER,id INTEGER,profile_json TEXT)").run();
  await scoped.prepare(PROFILE).bind(3, 1).first();
  assert.equal(asked.filter(s => s === PROFILE).length, 1);
  await scoped.prepare("UPDATE dashboard_profile SET profile_json='{\"age\":31}' WHERE user_id=? AND id=1").bind(3).run();
  assert.equal((await scoped.prepare(PROFILE).bind(3, 1).first()).profile_json, '{"age":31}');
  await scoped.batch([scoped.prepare("UPDATE dashboard_profile SET profile_json='{\"age\":32}' WHERE user_id=? AND id=1").bind(3)]);
  assert.equal((await scoped.prepare(PROFILE).bind(3, 1).first()).profile_json, '{"age":32}');
});

test("without memo, and for tables other requests change, every read goes to D1", async () => {
  const { db, asked } = counted();
  const plain = scopedDb(db, 3);
  await plain.prepare(PROFILE).bind(3, 1).first(); await plain.prepare(PROFILE).bind(3, 1).first();
  assert.equal(asked.length, 2);
  const scoped = scopedDb(db, 3, { memo: true });
  const SYNC = "SELECT status FROM sync_status WHERE user_id=? AND sync_name='google'";
  await scoped.prepare(SYNC).bind(3).first(); await scoped.prepare(SYNC).bind(3).first();
  assert.equal(asked.filter(s => s === SYNC).length, 2);
});

test("only reads of the listed tables are kept", () => {
  assert.equal(memoizableSql("SELECT * FROM health_datapoints WHERE user_id=? AND data_type='weight'"), true);
  assert.equal(memoizableSql("SELECT * FROM food_logs f JOIN dashboard_profile p ON p.user_id=f.user_id WHERE f.user_id=?"), true);
  assert.equal(memoizableSql("SELECT * FROM health_datapoints h JOIN sync_status s ON s.user_id=h.user_id WHERE h.user_id=?"), false);
  assert.equal(memoizableSql("SELECT * FROM health_datapoints, connection_credentials WHERE health_datapoints.user_id=?"), false);
  assert.equal(memoizableSql("SELECT secret FROM connection_credentials WHERE user_id=?"), false);
  assert.equal(memoizableSql("INSERT INTO food_logs(user_id) VALUES(?) RETURNING id"), false);
  assert.equal(memoizableSql("SELECT * FROM users WHERE id=?"), false);
});
