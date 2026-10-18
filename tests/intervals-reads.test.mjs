import test from "node:test";
import assert from "node:assert/strict";
import { intervalsReads, intervalsChanged, intervalsKinds } from "../src/intervals-reads.js";

// sync_status as the module uses it, and the Workers cache as a Map.
function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return { bind(...args) { return {
        first: async () => sql.startsWith("SELECT") ? (rows.has(args[1]) ? { details_json: rows.get(args[1]) } : null) : null,
        run: async () => { rows.set(args[1], args[2]); }
      }; } };
    }
  };
}
function fakeStore() {
  const map = new Map();
  return { map, match: async key => (map.has(key) ? new Response(map.get(key)) : undefined), put: async (key, response) => { map.set(key, await response.text()); } };
}
const NOW = Date.parse("2026-10-16T09:00:00Z");
const wellness = [{ id: "2026-10-01", weight: 70 }, { id: "2026-10-10", weight: 71 }, { id: "2026-10-15", weight: 72 }];

function setup(key = "Bearer tok") {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([(init.method || "GET"), String(url)]);
    if (String(url).includes("/wellness?")) return Response.json(wellness);
    return Response.json({ id: "x", url: String(url) });
  };
  const env = { INTERVALS_API_KEY: key, USER_ID: 1, DB: fakeDb() };
  const store = fakeStore();
  let now = NOW;
  const reads = () => intervalsReads(env, null, { fetchImpl, store, now: () => now });
  return { env, calls, reads, store, tick: ms => { now += ms; } };
}

test("a personal API key reads Intervals.icu as before", async () => {
  const { reads, calls } = setup("personal-key");
  await reads()("https://intervals.icu/api/v1/athlete/0");
  await reads()("https://intervals.icu/api/v1/athlete/0");
  assert.equal(calls.length, 2);
});

test("for an OAuth connection every wellness range is cut from one cached answer", async () => {
  const { reads, calls } = setup();
  const a = await (await reads()("https://intervals.icu/api/v1/athlete/0/wellness?oldest=2026-10-09&newest=2026-10-16")).json();
  const b = await (await reads()("https://intervals.icu/api/v1/athlete/0/wellness?oldest=2026-07-18&newest=2026-10-16")).json();
  assert.deepEqual(a.map(r => r.id), ["2026-10-10", "2026-10-15"]);
  assert.equal(b.length, 3);
  assert.deepEqual(calls, [["GET", "https://intervals.icu/api/v1/athlete/0/wellness?oldest=2026-03-30&newest=2026-10-23"]]);
  // A range older than the window goes to Intervals.icu as asked.
  await reads()("https://intervals.icu/api/v1/athlete/0/wellness?oldest=2025-10-16&newest=2026-10-16");
  assert.equal(calls.length, 2);
});

test("a write or a change Intervals.icu reports makes only its own kind old", async () => {
  const { env, reads, calls, tick } = setup();
  const get = url => reads()(url).then(r => r.json());
  await get("https://intervals.icu/api/v1/athlete/0");
  await get("https://intervals.icu/api/v1/activity/i55?intervals=true");
  await get("https://intervals.icu/api/v1/athlete/0/power-curves?type=Ride&curves=42d,90d");
  assert.equal(calls.length, 3);
  tick(1000);
  await reads()("https://intervals.icu/api/v1/athlete/0/wellness/2026-10-16", { method: "PUT", body: "{}" });
  await get("https://intervals.icu/api/v1/athlete/0");
  await get("https://intervals.icu/api/v1/activity/i55?intervals=true");
  assert.equal(calls.length, 4, "a wellness write keeps settings and the activity");
  tick(1000);
  // A new activity: the curves are old, the laps of an older ride are not.
  await intervalsChanged(env, ["activities"], NOW + 2000);
  await get("https://intervals.icu/api/v1/athlete/0/power-curves?type=Ride&curves=42d,90d");
  await get("https://intervals.icu/api/v1/activity/i55?intervals=true");
  assert.deepEqual(calls.slice(4).map(c => c[1]), ["https://intervals.icu/api/v1/athlete/0/power-curves?type=Ride&curves=42d,90d"]);
  // Editing the activity in Aurin makes its answers and the list old.
  tick(2000);
  await reads()("https://intervals.icu/api/v1/activity/i55", { method: "PUT", body: "{}" });
  await get("https://intervals.icu/api/v1/activity/i55?intervals=true");
  await get("https://intervals.icu/api/v1/athlete/0/power-curves?type=Ride&curves=42d,90d");
  assert.equal(calls.filter(c => c[0] === "GET").length, 6);
});

test("a failed answer is not kept and other hosts pass through", async () => {
  const { env, store } = setup();
  let status = 429;
  const fetchImpl = async () => new Response("{}", { status });
  const reads = intervalsReads(env, null, { fetchImpl, store, now: () => NOW });
  assert.equal((await reads("https://intervals.icu/api/v1/athlete/0")).status, 429);
  status = 200;
  assert.equal((await reads("https://intervals.icu/api/v1/athlete/0")).status, 200);
  assert.equal((await reads("https://health.googleapis.com/v4/x")).status, 200);
  assert.equal(intervalsKinds(new URL("https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true"))[0], "calendar");
  assert.equal(intervalsKinds(new URL("https://intervals.icu/api/v1/athlete/0/sport-settings/123"))[0], "settings");
  assert.equal(intervalsKinds(new URL("https://intervals.icu/api/v1/disconnect-app")), null);
});

test("an Intervals.icu read is given up after a time limit, writes and other hosts keep theirs", async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => { seen.push([String(url), init.signal]); return Response.json({}); };
  for (const key of ["personal-key", "Bearer tok"]) {
    seen.length = 0;
    const reads = intervalsReads({ INTERVALS_API_KEY: key, USER_ID: 1, DB: fakeDb() }, null, { fetchImpl, store: fakeStore() });
    await reads("https://intervals.icu/api/v1/athlete/0");
    await reads("https://intervals.icu/api/v1/athlete/0/wellness/2026-10-16", { method: "PUT", body: "{}" });
    await reads("https://example.com/x");
    const own = new AbortController().signal;
    await reads("https://intervals.icu/api/v1/athlete/0/events", { signal: own });
    assert.ok(seen[0][1] instanceof AbortSignal, key);
    assert.equal(seen[1][1], undefined);
    assert.equal(seen[2][1], undefined);
    assert.equal(seen[3][1], own);
  }
  const slow = intervalsReads({ INTERVALS_API_KEY: "personal-key" }, null, {
    timeoutMs: 20,
    fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)))
  });
  // AbortSignal.timeout does not keep Node's event loop alive on its own.
  const alive = setTimeout(() => {}, 1000);
  await assert.rejects(slow("https://intervals.icu/api/v1/athlete/0"), { name: "TimeoutError" });
  clearTimeout(alive);
});
