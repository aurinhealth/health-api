import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { handleUltrahumanOAuth, ultrahumanRows, syncUltrahuman, disconnectUltrahuman, ultrahumanAccessToken } from "../src/ultrahuman.js";
import { resolveSources } from "../src/source-priority.js";
import { saveAppleHealth } from "../src/apple-health.js";
import { googleDashboard } from "../src/google-dashboard.js";
import { connectionStatus } from "../src/connections.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}
const rows = (raw, where = "1=1") => raw.sqlite.prepare(`SELECT * FROM health_datapoints WHERE ${where} ORDER BY id`).all().map(r => ({ ...r }));
const ts = iso => Date.parse(iso) / 1000;
const env = (db, tokens = { access_token: "a", refresh_token: "r", expires_at: 0 }, extra = {}) => ({
  DB: db, USER_ID: 1, ULTRAHUMAN_CLIENT_ID: "cid", ULTRAHUMAN_CLIENT_SECRET: "s", ULTRAHUMAN_TOKEN: JSON.stringify(tokens), CONNECTION_KEY: "x".repeat(32), ...extra
});

// The shape of /user_data/metrics (data.metric_data), one night.
const day = date => [
  { type: "hr", object: { day_start_timestamp: ts(date + "T00:00:00Z"), values: [{ value: 58, timestamp: ts(date + "T00:05:00Z") }] } },
  { type: "night_rhr", object: { avg: 52, values: [] } },
  { type: "sleep_rhr", object: { value: 51, day_start_timestamp: ts(date + "T00:00:00Z") } },
  { type: "avg_sleep_hrv", object: { value: 64, day_start_timestamp: ts(date + "T00:00:00Z") } },
  { type: "vo2_max", object: { value: 51.5 } },
  { type: "temperature_deviation", object: { value: -0.2, unit: "°C" } },
  { type: "Sleep", object: {
    bedtime_start: ts(date + "T00:00:00Z") - 2 * 3600, bedtime_end: ts(date + "T05:30:00Z"),
    sleep_graph: { data: [
      { type: "light_sleep", start: ts(date + "T00:00:00Z") - 2 * 3600, end: ts(date + "T00:00:00Z") },
      { type: "deep_sleep", start: ts(date + "T00:00:00Z"), end: ts(date + "T01:30:00Z") },
      { type: "awake", start: ts(date + "T01:30:00Z"), end: ts(date + "T01:45:00Z") },
      { type: "rem_sleep", start: ts(date + "T01:45:00Z"), end: ts(date + "T05:30:00Z") },
      { type: "mystery", start: 1, end: 2 }
    ] }
  } }
];
function api(handler = () => null) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body ? String(opts.body) : null, auth: opts.headers?.Authorization });
    const own = handler(String(url), opts);
    if (own) return own;
    if (String(url).includes("/oauth/token")) return Response.json({ access_token: "a2", expires_in: 3600 });
    const date = new URL(url).searchParams.get("date");
    return Response.json({ data: { metric_data: day(date) } });
  };
  return { calls, fetchImpl };
}

test("a day's metrics become Apple-shaped rows: the night, RMSSD, resting HR, temperature, VO2max", () => {
  const out = ultrahumanRows("2026-10-12", day("2026-10-12"));
  const by = Object.fromEntries(out.map(r => [r.data_type, r]));
  assert.deepEqual(Object.keys(by).sort(), ["daily-heart-rate-variability", "daily-resting-heart-rate", "daily-skin-temperature-deviation", "daily-vo2-max", "sleep"]);
  assert.deepEqual(by["daily-heart-rate-variability"].payload.dailyHeartRateVariability, { date: { year: 2026, month: 10, day: 12 }, averageHeartRateVariabilityMilliseconds: 64, metric: "rmssd" });
  assert.equal(by["daily-resting-heart-rate"].value_numeric, 51);
  assert.equal(by["daily-skin-temperature-deviation"].value_numeric, -0.2);
  const sleep = by.sleep.payload.sleep;
  assert.equal(sleep.interval.startTime, "2026-10-11T22:00:00Z");
  assert.equal(sleep.type, "STAGES");
  assert.deepEqual(sleep.stages.map(s => s.type), ["LIGHT", "DEEP", "AWAKE", "REM"]);
  assert.equal(sleep.summary.minutesAwake, 15);
  // Without the single value the sleep-time average stands in; nothing usable, no rows.
  assert.equal(ultrahumanRows("2026-10-12", [{ type: "night_rhr", object: { avg: 49 } }])[0].value_numeric, 49);
  assert.deepEqual(ultrahumanRows("2026-10-12", [{ type: "sleep_rhr", object: { value: 900 } }, { type: "Sleep", object: { bedtime_start: 5, bedtime_end: 1 } }]), []);
});

test("OAuth asks for the ring's data and saves the tokens", async () => {
  const { db } = setup();
  const e = env(db, undefined, { APP_ORIGIN: "https://aurin.health" });
  delete e.ULTRAHUMAN_TOKEN;
  const start = await handleUltrahumanOAuth(new Request("https://aurin.health/oauth/ultrahuman?return=native"), e, "/oauth/ultrahuman");
  const to = new URL(start.headers.get("Location"));
  assert.equal(to.origin + to.pathname, "https://auth.ultrahuman.com/authorise");
  assert.equal(to.searchParams.get("scope"), "ring_data profile");
  assert.equal(to.searchParams.get("redirect_uri"), "https://aurin.health/oauth/ultrahuman/callback");
  const cookie = start.headers.get("Set-Cookie").split(";")[0];
  const { calls, fetchImpl } = api(url => url.includes("/oauth/token") ? Response.json({ access_token: "acc", refresh_token: "ref", expires_in: 3600 }) : null);
  const done = await handleUltrahumanOAuth(new Request("https://aurin.health/oauth/ultrahuman/callback?code=c&state=" + to.searchParams.get("state"), { headers: { Cookie: cookie } }), e, "/oauth/ultrahuman/callback", fetchImpl);
  assert.equal(done.headers.get("Location"), "loadwise://connected?event=ultrahuman");
  assert.match(calls[0].body, /grant_type=authorization_code/);
  assert.match(calls[0].body, /redirect_uri=https%3A%2F%2Faurin.health%2Foauth%2Fultrahuman%2Fcallback/);
  assert.equal(JSON.parse(e.ULTRAHUMAN_TOKEN).refresh_token, "ref");
  // A wrong state, or no app registered, ends without a connection.
  assert.match((await handleUltrahumanOAuth(new Request("https://aurin.health/oauth/ultrahuman/callback?code=c&state=x", { headers: { Cookie: cookie } }), e, "/oauth/ultrahuman/callback")).headers.get("Location"), /ultrahuman-failed/);
  assert.match((await handleUltrahumanOAuth(new Request("https://aurin.health/oauth/ultrahuman"), {}, "/oauth/ultrahuman")).headers.get("Location"), /ultrahuman-failed/);
});

test("an expired access token is refreshed and the refresh token kept", async () => {
  const { db } = setup();
  const e = env(db, { access_token: "old", refresh_token: "keep", expires_at: 1000 });
  const { calls, fetchImpl } = api();
  assert.equal(await ultrahumanAccessToken(e, { fetchImpl }), "a2");
  assert.match(calls[0].body, /grant_type=refresh_token&refresh_token=keep/);
  assert.equal(JSON.parse(e.ULTRAHUMAN_TOKEN).refresh_token, "keep");
  const fresh = env(db, { access_token: "valid", refresh_token: "r", expires_at: Date.now() / 1000 + 3600 });
  assert.equal(await ultrahumanAccessToken(fresh, { fetchImpl }), "valid");
});

test("the ring's nights replace the Apple copies of those days, readiness reads the ring", async () => {
  const { raw, db } = setup();
  // Apple Health has the same night (the ring writes there too) and a day the ring lacks.
  await saveAppleHealth(db, 1, { records: [
    { type: "daily-heart-rate-variability", id: "hrv:2026-10-12", date: "2026-10-12", value: 40, metric: "sdnn" },
    { type: "daily-heart-rate-variability", id: "hrv:2026-10-01", date: "2026-10-01", value: 41, metric: "sdnn" },
    { type: "sleep", id: "night:2026-10-12", start: "2026-10-11T22:05:00Z", end: "2026-10-12T05:25:00Z", stages: [] }
  ] }, { now: Date.parse("2026-10-12T12:00:00Z") });
  const { calls, fetchImpl } = api();
  const e = env(db, { access_token: "a", refresh_token: "r", expires_at: Date.now() / 1000 + 3600 });
  const result = await syncUltrahuman(e, { days: 2, fetchImpl, today: "2026-10-12" });
  assert.deepEqual([result.status, result.saved], ["ok", 10]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer a");
  assert.match(calls[0].url, /\/api\/partners\/v1\/user_data\/metrics\?date=2026-10-12$/);
  const apple = rows(raw, "source_family='apple-health'");
  assert.deepEqual(apple.map(r => [r.sample_time || r.data_type, r.record_role]), [["2026-10-12", "duplicate"], ["2026-10-01", "primary"], ["sleep", "duplicate"]]);
  const dash = await googleDashboard(db, "2026-10-12");
  const today = dash.wellness.find(d => d.id === "2026-10-12");
  assert.equal(today.hrv, 64);
  assert.equal(today.hrvSource, "ultrahuman:rmssd");
  assert.equal(today.skinTempDeviation, -0.2);
  assert.equal(dash.wellness.find(d => d.id === "2026-10-01").hrvSource, "apple-health:sdnn");
  // A later Apple upload of a ring day does not take it back.
  await saveAppleHealth(db, 1, { records: [{ type: "daily-heart-rate-variability", id: "hrv:2026-10-11", date: "2026-10-11", value: 39, metric: "sdnn" }] }, { now: Date.parse("2026-10-12T12:00:00Z") });
  assert.equal(rows(raw, "source_family='apple-health' AND sample_time='2026-10-11'")[0].record_role, "duplicate");
  // Running it again changes nothing.
  assert.equal(await resolveSources(db, 1, { since: "2026-09-01" }), 0);
});

test("a refused token marks the connection for reconnecting", async () => {
  const { raw, db } = setup();
  const { fetchImpl } = api(url => url.includes("/user_data/") ? new Response("", { status: 401 }) : null);
  const e = env(db, { access_token: "a", refresh_token: "r", expires_at: Date.now() / 1000 + 3600 });
  assert.equal((await syncUltrahuman(e, { days: 1, fetchImpl, today: "2026-10-12" })).status, "error");
  assert.equal(raw.sqlite.prepare("SELECT status FROM sync_status WHERE sync_name='connection_ultrahuman'").get().status, "broken");
  const status = await connectionStatus(e);
  const ring = status.providers.find(p => p.id === "ultrahuman");
  assert.deepEqual([ring.connected, ring.needsReconnect, ring.connectUrl], [true, true, "/oauth/ultrahuman"]);
});

test("disconnecting deletes the ring's data and gives the days back to Apple", async () => {
  const { raw, db } = setup();
  await saveAppleHealth(db, 1, { records: [{ type: "daily-heart-rate-variability", id: "hrv:2026-10-12", date: "2026-10-12", value: 40, metric: "sdnn" }] }, { now: Date.parse("2026-10-12T12:00:00Z") });
  const e = env(db, { access_token: "a", refresh_token: "r", expires_at: Date.now() / 1000 + 3600 });
  await syncUltrahuman(e, { days: 1, fetchImpl: api().fetchImpl, today: "2026-10-12" });
  const { calls, fetchImpl } = api(() => new Response("{}"));
  await disconnectUltrahuman(e, { fetchImpl });
  assert.match(calls[0].url, /oauth\/revoke$/);
  assert.equal(rows(raw, "source_family='ultrahuman'").length, 0);
  assert.equal(rows(raw, "source_family='apple-health'")[0].record_role, "primary");
  assert.equal(e.ULTRAHUMAN_TOKEN, undefined);
});
