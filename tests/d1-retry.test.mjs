import test from "node:test";
import assert from "node:assert/strict";
import { readOnlySql, transientD1Error, withD1Retry } from "../src/d1-retry.js";
import { retryingDb, scopedDb } from "../src/tenancy.js";
import { createD1 } from "./helpers/d1.mjs";

const overloaded = () => new Error("D1_ERROR: D1 DB is overloaded. Requests queued for too long.");
const reset = () => new Error("D1_ERROR: D1 DB exceeded its CPU time limit and was reset.");
const noSleep = { sleep: async () => {} };

test("a read is tried again after a database blip, a write only when it never ran", async () => {
  assert.equal(transientD1Error(overloaded()), true);
  assert.equal(transientD1Error(reset()), true);
  assert.equal(transientD1Error(new Error("D1_ERROR: no such table: x")), false);
  assert.equal(transientD1Error(overloaded(), { read: false }), true);
  assert.equal(transientD1Error(reset(), { read: false }), false);
  assert.equal(transientD1Error(new Error("Network connection lost."), { read: false }), false);

  let calls = 0;
  assert.equal(await withD1Retry(async () => { if (++calls < 3) throw overloaded(); return "ok"; }, noSleep), "ok");
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(withD1Retry(async () => { calls++; throw overloaded(); }, noSleep), /overloaded/);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(withD1Retry(async () => { calls++; throw reset(); }, { read: false, ...noSleep }), /reset/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(withD1Retry(async () => { calls++; throw new Error("UNIQUE constraint failed"); }, noSleep), /UNIQUE/);
  assert.equal(calls, 1);
});

test("only a SELECT without a write counts as a read", () => {
  assert.equal(readOnlySql("SELECT * FROM t WHERE user_id=?"), true);
  assert.equal(readOnlySql("  WITH x AS (SELECT 1) SELECT * FROM x"), true);
  assert.equal(readOnlySql("SELECT 'DELETE' AS word FROM t"), true);
  assert.equal(readOnlySql("INSERT INTO t SELECT * FROM u"), false);
  assert.equal(readOnlySql("WITH x AS (SELECT 1) DELETE FROM t"), false);
  assert.equal(readOnlySql("CREATE TABLE IF NOT EXISTS t (a)"), false);
});

// A D1 whose next `failures` statements fail as overloaded.
function flaky(failures, error = overloaded) {
  const db = createD1();
  let left = failures;
  const fail = fn => (...args) => { if (left > 0) { left--; return Promise.reject(error()); } return fn(...args); };
  const statement = s => ({ bind: (...v) => statement(s.bind(...v)), first: fail((...a) => s.first(...a)), all: fail((...a) => s.all(...a)), run: fail((...a) => s.run(...a)), raw: fail((...a) => s.raw(...a)), real: s });
  return { prepare: sql => statement(db.prepare(sql)), batch: list => db.batch(list.map(s => s.real || s)), exec: sql => db.exec(sql), left: () => left };
}

test("the user's database and the central one ride out a moment of overload", async () => {
  const real = setTimeout;
  globalThis.setTimeout = fn => real(fn, 0);
  try {
    const busy = flaky(2);
    assert.equal((await scopedDb(busy, 1).prepare("SELECT 1 AS one").first()).one, 1);
    assert.equal(busy.left(), 0);
    const central = flaky(2);
    assert.equal((await retryingDb(central).prepare("SELECT 2 AS two").all()).results[0].two, 2);
    assert.equal(central.left(), 0);
    // After a reset a write may already have happened: it is not run again.
    const writes = flaky(1, reset);
    await assert.rejects(scopedDb(writes, 1).prepare("CREATE TABLE IF NOT EXISTS x (user_id INTEGER)").run(), /reset/);
    const queued = flaky(1);
    await scopedDb(queued, 1).prepare("CREATE TABLE IF NOT EXISTS y (user_id INTEGER)").run();
    assert.equal(queued.left(), 0);
  } finally { globalThis.setTimeout = real; }
});

test("the owner's report names why a route answered 500, not just the status", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(src, /count\(await serverErrorReason\(answered\)\)/);
  assert.ok(src.indexOf("serverErrorReason(answered)") < src.indexOf("withPlainErrors(request, answered)"));
});
