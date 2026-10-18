import test from "node:test";
import assert from "node:assert/strict";
import { cached } from "../src/api-cache.js";

function setup() {
  const map = new Map();
  const store = { match: async key => (map.has(key) ? new Response(map.get(key)) : undefined), put: async (key, response) => { map.set(key, await response.text()); } };
  const db = { userId: 7, prepare: () => ({ bind: () => ({ first: async () => ({ version: 1 }) }) }) };
  return { env: { DB: db }, store, map };
}

test("a failed read is not kept: the next request asks again", async () => {
  const { env, store, map } = setup();
  let calls = 0;
  for (const failed of [{}, { status: "error", message: "Intervals wellness HTTP 502" }]) {
    calls = 0;
    await cached(env, null, "fitness:90", async () => { calls++; return failed; }, { store });
    await cached(env, null, "fitness:90", async () => { calls++; return failed; }, { store });
    assert.equal(calls, 2);
    assert.equal(map.size, 0);
  }
  const good = { status: "ok", wellness: [{ id: "2026-10-17", ctl: 40 }] };
  await cached(env, null, "fitness:90", async () => { calls++; return good; }, { store });
  assert.deepEqual(await cached(env, null, "fitness:90", async () => { calls++; return {}; }, { store }), good);
  assert.equal(calls, 3);
  // An empty list or no data is an answer, kept as before.
  await cached(env, null, "list", async () => [], { store });
  await cached(env, null, "none", async () => null, { store });
  assert.equal(map.size, 3);
});
