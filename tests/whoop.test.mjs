import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleWhoopOAuth, whoopRows, syncWhoop, disconnectWhoop } from "../src/whoop.js";
import { sleepSessionFromRow } from "../src/sleep-sessions.js";
import { connectionStatus } from "../src/connections.js";
import { saveSourcePriority } from "../src/source-priority.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}
const rows = (raw, where = "1=1") => raw.sqlite.prepare(`SELECT * FROM health_datapoints WHERE ${where} ORDER BY id`).all().map(r => ({ ...r }));
const env = (db, tokens = { access_token: "a", refresh_token: "r", expires_at: 0 }, extra = {}) => ({
  DB: db, USER_ID: 1, WHOOP_CLIENT_ID: "cid", WHOOP_CLIENT_SECRET: "s", WHOOP_TOKEN: JSON.stringify(tokens), CONNECTION_KEY: "x".repeat(32), ...extra
});
const NOW = Date.parse("2026-10-12T09:00:00Z");

// The shapes of /v2/activity/sleep and /v2/recovery records.
const sleep = (id, end, { nap = false, offset = "+02:00" } = {}) => ({
  id, start: new Date(Date.parse(end) - 8 * 3600000).toISOString(), end, timezone_offset: offset, nap, score_state: "SCORED",
  score: { respiratory_rate: 15.2, stage_summary: { total_in_bed_time_milli: 28800000, total_awake_time_milli: 1800000, total_light_sleep_time_milli: 12600000, total_slow_wave_sleep_time_milli: 6000000, total_rem_sleep_time_milli: 8400000 } }
});
const recovery = (sleepId, extra = {}) => ({ cycle_id: 1, sleep_id: sleepId, score_state: "SCORED", score: { user_calibrating: false, recovery_score: 70, resting_heart_rate: 49, hrv_rmssd_milli: 81.37, spo2_percentage: 96.5, skin_temp_celsius: 33.7 }, ...extra });

function api({ sleeps = [sleep("s1", "2026-10-12T05:00:00Z")], recoveries = [recovery("s1")], pages = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || "GET", body: opts.body ? String(opts.body) : null, auth: opts.headers?.Authorization });
    if (String(url).includes("/oauth2/token")) return Response.json({ access_token: "a2", refresh_token: "r2", expires_in: 3600 });
    const u = new URL(url);
    if (u.pathname.endsWith("/v2/activity/sleep")) {
      if (pages && !u.searchParams.get("nextToken")) return Response.json({ records: sleeps.slice(0, 1), next_token: "p2" });
      return Response.json({ records: pages ? sleeps.slice(1) : sleeps });
    }
    if (u.pathname.endsWith("/v2/recovery")) return Response.json({ records: recoveries });
    return new Response(null, { status: 204 });
  };
  return { calls, fetchImpl };
}

test("a night and its recovery become Apple-shaped rows on the day of waking up", () => {
  const out = whoopRows([sleep("s1", "2026-10-11T23:30:00Z")], [recovery("s1")]);
  const by = Object.fromEntries(out.map(r => [r.data_type, r]));
  assert.deepEqual(Object.keys(by).sort(), ["daily-heart-rate-variability", "daily-oxygen-saturation", "daily-respiratory-rate", "daily-resting-heart-rate", "sleep"]);
  // 23:30 UTC at +02:00 is the morning of the 12th.
  assert.equal(by["daily-resting-heart-rate"].sample_time, "2026-10-12");
  assert.deepEqual(by["daily-heart-rate-variability"].payload.dailyHeartRateVariability, { date: { year: 2026, month: 10, day: 12 }, averageHeartRateVariabilityMilliseconds: 81.4, metric: "rmssd" });
  assert.equal(by["daily-oxygen-saturation"].value_numeric, 96.5);
  const session = sleepSessionFromRow({ ...by.sleep, payload_json: JSON.stringify(by.sleep.payload) });
  assert.deepEqual(session.stages, { DEEP: 100, LIGHT: 210, REM: 140, AWAKE: 30 });
  assert.equal(session.durationMin, 450);
});

test("naps, unscored nights and calibrating recoveries add no daily values", () => {
  const out = whoopRows([sleep("n1", "2026-10-12T14:00:00Z", { nap: true }), { ...sleep("s2", "2026-10-12T05:00:00Z"), score_state: "PENDING_SCORE" }],
    [recovery("n1"), recovery("s2", { score: { user_calibrating: true, resting_heart_rate: 50 } })]);
  assert.deepEqual(out.map(r => r.data_type), ["sleep", "sleep"]);
  assert.equal(out[0].payload.sleep.metadata.nap, true);
  assert.equal(out[1].payload.sleep.stageTotals, undefined);
});

test("connecting stores the tokens; the import pages through, refreshes and saves the new pair", async () => {
  const { db, raw } = setup();
  const e = env(db, null, { WHOOP_TOKEN: undefined });
  const start = await handleWhoopOAuth(new Request("https://aurin.health/oauth/whoop"), e, "/oauth/whoop");
  const to = new URL(start.headers.get("Location"));
  assert.equal(to.origin + to.pathname, "https://api.prod.whoop.com/oauth/oauth2/auth");
  assert.match(to.searchParams.get("scope"), /read:recovery .*offline/);
  const state = to.searchParams.get("state"), cookie = start.headers.get("Set-Cookie").split(";")[0];
  const { fetchImpl, calls } = api({ sleeps: [sleep("s1", "2026-10-11T05:00:00Z"), sleep("s2", "2026-10-12T05:00:00Z")], recoveries: [recovery("s1"), recovery("s2")], pages: true });
  const done = await handleWhoopOAuth(new Request("https://aurin.health/oauth/whoop/callback?code=c&state=" + state, { headers: { Cookie: cookie } }), e, "/oauth/whoop/callback", fetchImpl);
  assert.match(done.headers.get("Location"), /whoop/);
  assert.equal(JSON.parse(e.WHOOP_TOKEN).refresh_token, "r2");

  const later = env(db, { access_token: "old", refresh_token: "r2", expires_at: 1 });
  const result = await syncWhoop(later, { days: 3, fetchImpl, now: NOW });
  assert.equal(result.status, "ok");
  assert.equal(JSON.parse(later.WHOOP_TOKEN).access_token, "a2");
  assert.ok(calls.some(c => c.url.includes("nextToken=p2")));
  assert.equal(rows(raw, "source_family='whoop' AND data_type='sleep'").length, 2);
  assert.equal(rows(raw, "source_family='whoop' AND data_type='daily-resting-heart-rate'").length, 2);
  assert.equal(raw.sqlite.prepare("SELECT provider FROM connection_credentials").get().provider, "whoop");
});

test("a connection started by one account is not stored for another signed in before the callback", async () => {
  const { db, raw } = setup();
  const start = await handleWhoopOAuth(new Request("https://aurin.health/oauth/whoop"), env(db, null, { WHOOP_TOKEN: undefined, USER_ID: 11 }), "/oauth/whoop");
  const state = new URL(start.headers.get("Location")).searchParams.get("state"), cookie = start.headers.get("Set-Cookie").split(";")[0];
  const other = env(scopedDb(raw, 22), null, { WHOOP_TOKEN: undefined, USER_ID: 22 });
  const { fetchImpl, calls } = api();
  const done = await handleWhoopOAuth(new Request("https://aurin.health/oauth/whoop/callback?code=c&state=" + state, { headers: { Cookie: cookie } }), other, "/oauth/whoop/callback", fetchImpl);
  assert.equal(done.headers.get("Location"), "loadwise://connected?event=whoop-failed");
  assert.equal(calls.length, 0, "the code is never exchanged");
  assert.equal(other.WHOOP_TOKEN, undefined);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM connection_credentials").get().n, 0);
});

test("WHOOP takes the night from the watch when worn more nights, can be chosen, and its data goes on disconnect", async () => {
  const { db, raw } = setup();
  // The watch measured a resting heart rate on the 12th but slept no full nights.
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,value_numeric,payload_json) VALUES(1,'apple-health','daily-resting-heart-rate','a12','2026-10-12',58,'{}')").run();
  const { fetchImpl } = api();
  await syncWhoop(env(db), { days: 3, fetchImpl, now: NOW });
  const apple = () => raw.sqlite.prepare("SELECT record_role FROM health_datapoints WHERE external_id='a12'").get().record_role;
  assert.equal(apple(), "duplicate");
  assert.deepEqual((await saveSourcePriority(db, 1, { night: "whoop" }, { now: NOW })).priority, { night: "whoop", day: "auto" });
  const status = await connectionStatus(env(db));
  assert.equal(status.providers.find(p => p.id === "whoop").connected, true);
  await disconnectWhoop(env(db), { fetchImpl });
  assert.equal(rows(raw, "source_family='whoop'").length, 0);
  assert.equal(apple(), "primary");
});
