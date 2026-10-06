import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { dateFormat } from "../src/date-format.js";

test("a table check runs once per database, not on every request", async () => {
  const raw = createD1();
  let sent = 0;
  const counting = { ...raw, prepare: sql => { const st = raw.prepare(sql); return /^CREATE/.test(sql) ? { ...st, run: () => { sent++; return st.run(); } } : st; } };
  for (let i = 0; i < 3; i++) await scopedDb(counting, 1).prepare("CREATE TABLE IF NOT EXISTS t (user_id INTEGER, v TEXT)").run();
  assert.equal(sent, 1);
  await scopedDb(counting, 1).prepare("INSERT INTO t(user_id,v) VALUES(?,?)").bind(1, "a").run();
  assert.equal((await raw.prepare("SELECT count(*) n FROM t").first()).n, 1);
  // A new database still gets its tables.
  const other = createD1();
  await scopedDb(other, 1).prepare("CREATE TABLE IF NOT EXISTS t (user_id INTEGER, v TEXT)").run();
  assert.ok(await other.prepare("SELECT name FROM sqlite_master WHERE name='t'").first());
});

test("a table check inside a batch still reaches the database", async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  await db.batch([db.prepare("CREATE TABLE IF NOT EXISTS b (user_id INTEGER)"), db.prepare("INSERT INTO b(user_id) VALUES(1)")]);
  assert.equal((await raw.prepare("SELECT count(*) n FROM b").first()).n, 1);
});

test("date formatters are reused", () => {
  const options = { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" };
  assert.equal(dateFormat("en-CA", options), dateFormat("en-CA", { ...options }));
  assert.equal(dateFormat("en-CA", options).format(new Date("2026-10-05T23:30:00Z")), "2026-10-06");
});
