import test from "node:test";
import assert from "node:assert/strict";
import { cached, closedDay } from "../src/api-cache.js";

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

// /app/api/fitness without Intervals.icu (ownFitness) behind the callers' cache,
// on a real schema whose workout read fails when `failing` says so.
async function fitnessSetup() {
  const { readFileSync } = await import("node:fs");
  const { createD1 } = await import("./helpers/d1.mjs");
  const { scopedDb } = await import("../src/tenancy.js");
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const state = { failing: 0 };
  const flaky = { ...raw, prepare: sql => { const wrap = st => ({ ...st, bind: (...v) => wrap(st.bind(...v)), all: () => /'activity','exercise'/.test(sql) && state.failing-- > 0 ? Promise.reject(new Error("D1_ERROR: overloaded")) : st.all() }); return wrap(raw.prepare(sql)); } };
  const env = { DB: scopedDb(flaky, 1), USER_ID: 1, CONNECTED_PROVIDERS: [] };
  const map = new Map(), store = { match: async key => (map.has(key) ? new Response(map.get(key)) : undefined), put: async (key, response) => { map.set(key, await response.text()); } };
  return { raw, env, state, map, store };
}

test("a failed workout read is not cached as a fitness of 0: the next request reads again", async () => {
  const { ownFitness } = await import("../src/own-fitness.js");
  const { raw, env, state, map, store } = await fitnessSetup();
  const run = JSON.stringify({ exercise: { exerciseType: "RUNNING", displayName: "Run", activeDuration: "3600s" } });
  for (let i = 1; i <= 20; i++) raw.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, end_time, payload_json, record_role) VALUES (1, 'google-wearables', 'exercise', ?, ?, ?, ?, 'primary')")
    .run("run" + i, "2026-10-" + String(i).padStart(2, "0") + "T06:00:00Z", "2026-10-" + String(i).padStart(2, "0") + "T07:00:00Z", run);
  let calls = 0;
  // As the route answers: an error when a read fails (the callers fall back to {} for that request).
  const route = async () => { calls++; try { return { status: "ok", source: "aurin", connected: false, days: 42, wellness: await ownFitness(env, "2026-09-09", "2026-10-20") }; } catch (error) { return { status: "error", message: error.message }; } };
  state.failing = 1;
  assert.deepEqual(await cached(env, null, "fitness:42", route, { store }), { status: "error", message: "D1_ERROR: overloaded" });
  assert.equal(map.size, 0);
  const second = await cached(env, null, "fitness:42", route, { store });
  assert.equal(second.status, "ok");
  assert.ok(second.wellness.at(-1).ctl > 0, JSON.stringify(second.wellness.at(-1)));
  assert.deepEqual(await cached(env, null, "fitness:42", route, { store }), second);
  assert.equal(calls, 2);
});

test("a new user's empty fitness is an answer and stays cached", async () => {
  const { ownFitness } = await import("../src/own-fitness.js");
  const { raw, env, map, store } = await fitnessSetup();
  // coach_reflections is created with the first note: before that it has no rows, it is not a failure.
  raw.sqlite.exec("DROP TABLE coach_reflections");
  let calls = 0;
  const route = async () => { calls++; return { status: "ok", source: "aurin", connected: false, days: 42, wellness: await ownFitness(env, "2026-09-09", "2026-10-20") }; };
  const first = await cached(env, null, "fitness:42", route, { store });
  assert.ok(first.wellness.length > 0 && first.wellness.every(r => r.ctl === 0 && r.load === 0));
  assert.deepEqual(await cached(env, null, "fitness:42", route, { store }), first);
  assert.equal(calls, 1);
  assert.equal(map.size, 1);
});

test("with Intervals.icu a failed read of the watch's workouts gives a degraded answer that is not cached", async () => {
  const { watchOnlyFitness } = await import("../src/own-fitness.js");
  const { readFileSync } = await import("node:fs");
  const { env, state, map, store } = await fitnessSetup();
  state.failing = 1;
  await assert.rejects(watchOnlyFitness(env, null, "2026-09-09", "2026-10-20"), /overloaded/);
  assert.equal(await watchOnlyFitness(env, null, "2026-09-09", "2026-10-20"), null);
  await cached(env, null, "fitness:90", async () => ({ status: "ok", source: "intervals.icu", days: 90, wellness: [{ id: "2026-10-17", ctl: 40 }], degraded: true }), { store });
  assert.equal(map.size, 0);
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /watchOnlyFitness\(env,ctx,from,to\)\.catch\(error=>\{console\.error\('Watch-only load',error\.message\);return false;\}\);/);
  assert.match(entry, /\.\.\.\(watchExtra===false\?\{degraded:true\}:\{\}\)/);
});

test("requests asking for the same entry at once compute it once, and each gets its own copy", async () => {
  const { env, store } = setup();
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const compute = async () => { calls++; await gate; return { status: "ok", days: [{ date: "2026-10-28", kcal: 2100 }] }; };
  const all = Promise.all([1, 2, 3, 4].map(() => cached(env, null, "coach-inputs:2026-10-29", compute, { store })));
  release();
  const answers = await all;
  assert.equal(calls, 1);
  answers.forEach(a => assert.deepEqual(a, answers[0]));
  answers[1].days[0].kcal = 0;
  assert.equal(answers[0].days[0].kcal, 2100, "a caller changing its answer leaves the others alone");
  // A failure reaches every waiting request and is not kept: the next one asks again.
  let failing = 0;
  const failed = await Promise.allSettled([1, 2].map(() => cached(env, null, "week:2026-10-27", async () => { failing++; throw new Error("D1 overloaded"); }, { store })));
  assert.deepEqual(failed.map(f => f.status), ["rejected", "rejected"]);
  assert.equal(failing, 1);
  await cached(env, null, "week:2026-10-27", async () => { failing++; return { days: [] }; }, { store });
  assert.equal(failing, 2);
});

// A meal or a glass of water keeps what never shows food (C in
// audit/zrychleni-aplikace-mereni-2026-10-29.md): the 90 days of fitness, zones,
// a workout's detail stay; Today's inputs and the food week are computed again.
test("a food write keeps entries without food; any other write makes everything outdated", async () => {
  const { readFileSync } = await import("node:fs");
  const { createD1 } = await import("./helpers/d1.mjs");
  const { scopedDb } = await import("../src/tenancy.js");
  const { bumpCacheVersion, FOOD_WRITE } = await import("../src/api-cache.js");
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../migrations/0005_api_cache_versions.sql", import.meta.url), "utf8"));
  raw.sqlite.exec(readFileSync(new URL("../migrations/0030_food_cache_version.sql", import.meta.url), "utf8"));
  const map = new Map(), store = { match: async key => (map.has(key) ? new Response(map.get(key)) : undefined), put: async (key, response) => { map.set(key, await response.text()); } };
  const env = { DB: scopedDb(raw, 7) }, computed = [];
  const read = key => cached(env, null, key, async () => { computed.push(key); return { key }; }, { store });
  const both = async () => { computed.length = 0; await read("fitness:90"); await read("coach-inputs:2026-10-29"); return [...computed]; };
  assert.deepEqual(await both(), ["fitness:90", "coach-inputs:2026-10-29"]);
  assert.deepEqual(await both(), []);
  await bumpCacheVersion(env.DB, { food: true });
  assert.deepEqual(await both(), ["coach-inputs:2026-10-29"]);
  await bumpCacheVersion(env.DB);
  assert.deepEqual(await both(), ["fitness:90", "coach-inputs:2026-10-29"]);
  // Before migration 0030 a food write bumps everything, as before.
  const old = createD1();
  old.sqlite.exec(readFileSync(new URL("../migrations/0005_api_cache_versions.sql", import.meta.url), "utf8"));
  await bumpCacheVersion(scopedDb(old, 7), { food: true });
  assert.equal(old.sqlite.prepare("SELECT version FROM api_cache_versions WHERE user_id=7").get().version, 1);
  for (const path of ["/app/api/fluids", "/app/api/water", "/app/api/food/entry", "/app/api/food/entries", "/app/api/food/log", "/app/api/food/personal", "/app/api/food/recipes/12", "/app/api/food/nutrients/favorites", "/app/api/food/suggestions/decide"]) assert.ok(FOOD_WRITE.test(path), path);
  for (const path of ["/app/api/food-today", "/app/api/food/nutrients", "/app/api/profile", "/app/api/gym", "/app/api/weight", "/app/api/fluidsx"]) assert.ok(!FOOD_WRITE.test(path), path);
});

// G in audit/zrychleni-aplikace-mereni-2026-10-29.md: Aktivita dne asks for
// several cached entries, each read the version again (three trips to D1).
test("the version is read once per request until the request bumps it", async () => {
  const { cacheVersion, bumpCacheVersion } = await import("../src/api-cache.js");
  let reads = 0, version = 4;
  const db = { userId: 7, prepare: sql => ({ bind: () => ({ first: async () => { if (/^SELECT/.test(sql)) reads++; return { version }; }, run: async () => { version++; return {}; } }) }) };
  assert.deepEqual(await Promise.all([cacheVersion(db), cacheVersion(db), cacheVersion(db)]).then(all => all.map(v => v.version)), [4, 4, 4]);
  assert.equal(reads, 1);
  await bumpCacheVersion(db);
  assert.equal((await cacheVersion(db)).version, 5);
  assert.equal(reads, 2);
  // Another request (another database object) reads its own.
  assert.equal((await cacheVersion({ ...db })).version, 5);
  assert.equal(reads, 3);
});

test("a closed day is two or more days back: today and yesterday still get late syncs", () => {
  assert.equal(closedDay("2026-10-31", "2026-10-31"), false);
  assert.equal(closedDay("2026-10-30", "2026-10-31"), false);
  assert.equal(closedDay("2026-10-29", "2026-10-31"), true);
  assert.equal(closedDay("2026-09-30", "2026-10-01"), false);
  assert.equal(closedDay("2026-09-29", "2026-10-01"), true);
  assert.equal(closedDay("2026-11-02", "2026-10-31"), false);
  assert.equal(closedDay("", "2026-10-31"), false);
});
