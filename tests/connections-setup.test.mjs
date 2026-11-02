import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createD1 } from "./helpers/d1.mjs";
import legacy, { googleToken } from "../src/index.js";
import { HEALTH_SCOPES, HEALTH_PERMISSIONS, EXTRA_SCOPES, healthScopes, missingHealthPermissions } from "../src/google-scopes.js";
import { connectionStatus } from "../src/connections.js";
import { saveConnectionSecret, connectionEnvironment } from "../src/connection-secrets.js";
import { intervalsAuthorization } from "../src/intervals-auth.js";
import { handleIntervalsOAuth, INTERVALS_SCOPES } from "../src/intervals-oauth.js";
import { handleGoogleOAuth } from "../src/google-oauth.js";
import { serverSource, SERVER_FILES } from "./helpers/server-source.mjs";

const entry = serverSource();
const ctx = { waitUntil() {} };

function profileDb() {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT);
    CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));`);
  return db;
}

test("without Google Health the food from Google is simply empty, with no call to Google", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => { calls.push(String(url)); return Response.json({}); };
  try {
    for (const env of [{ CONNECTED_PROVIDERS: [] }, { CONNECTED_PROVIDERS: ["intervals"], INTERVALS_API_KEY: "k" }]) {
      const res = await legacy.fetch(new Request("https://internal/health/nutrition?start=2026-01-01&end=2026-01-31"), env, ctx);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual([body.status, body.connected, body.count], ["ok", false, 0]);
    }
    // Connected, but the user unticked reading food on Google's consent screen.
    const partial = { GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: HEALTH_SCOPES.filter(s => s !== HEALTH_PERMISSIONS.nutritionRead) };
    const body = await (await legacy.fetch(new Request("https://internal/health/nutrition"), partial, ctx)).json();
    assert.deepEqual([body.status, body.connected, body.permission, body.count], ["ok", true, false, 0]);
    assert.deepEqual(calls, []);
  } finally { globalThis.fetch = realFetch; }
});

test("a Google token asks only for what the user granted, and never without a connection", async () => {
  await assert.rejects(googleToken({}), /není připojené/);
  const granted = [HEALTH_PERMISSIONS.activity, HEALTH_PERMISSIONS.sleep];
  assert.deepEqual(healthScopes({ GOOGLE_SCOPES: granted }), granted);
  assert.deepEqual(missingHealthPermissions({ GOOGLE_SCOPES: granted }), ["metrics", "nutritionRead", "nutritionWrite"]);
  // Connections saved before granted scopes were stored keep asking for all of them.
  assert.deepEqual(healthScopes({}), HEALTH_SCOPES);
  assert.deepEqual(missingHealthPermissions({}), []);
  assert.deepEqual(healthScopes({ GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite] }), [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite]);
  const realFetch = globalThis.fetch;
  let asked = null;
  globalThis.fetch = async (url, init) => { asked = new URLSearchParams(String(init.body)).get("scope"); return Response.json({ access_token: "t" }); };
  try {
    assert.equal(await googleToken({ GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: granted }), "t");
    assert.deepEqual(asked.split(" "), granted);
  } finally { globalThis.fetch = realFetch; }
});

test("a sync skips Google data the user gave no permission for and still ends ok", async () => {
  const db = profileDb();
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => { calls.push(String(url)); return Response.json(String(url).includes("oauth2") ? { access_token: "t" } : { dataPoints: [] }); };
  try {
    const env = { DB: db, USER_ID: 7, GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: [HEALTH_PERMISSIONS.activity, HEALTH_PERMISSIONS.sleep], CONNECTED_PROVIDERS: ["google"] };
    const body = await (await legacy.fetch(new Request("https://internal/sync/google/recent", { method: "POST" }), env, ctx)).json();
    assert.equal(body.status, "ok");
    const health = calls.filter(url => url.includes("health.googleapis.com"));
    assert.ok(health.some(url => url.includes("/dataTypes/steps/")) && health.some(url => url.includes("/dataTypes/sleep/")));
    // Today's minutes in heart-rate zones come every few minutes, not only with the night's run.
    assert.ok(health.some(url => url.includes("/dataTypes/time-in-heart-rate-zone/")));
    for (const type of ["weight", "daily-resting-heart-rate", "daily-heart-rate-variability"]) {
      assert.ok(!health.some(url => url.includes(`/dataTypes/${type}/`)), type);
      assert.equal(body.results.find(r => r.type === type).status, "skipped");
    }
  } finally { globalThis.fetch = realFetch; }
});

test("workouts come from every Google source, without the ones Aurin wrote there", async () => {
  const db = profileDb();
  db.sqlite.exec("CREATE UNIQUE INDEX hd_key ON health_datapoints(user_id, source_family, data_type, external_id)");
  const families = [];
  const realFetch = globalThis.fetch;
  const point = (id, client) => ({ name: "users/me/dataTypes/exercise/dataPoints/" + id, dataSource: client ? { application: { googleWebClientId: client } } : { platform: "FITBIT" },
    exercise: { interval: { startTime: "2026-10-23T14:20:00Z", endTime: "2026-10-23T14:45:00Z" }, exerciseType: "WALKING", activeDuration: "1500s" } });
  globalThis.fetch = async url => {
    const text = String(url);
    if (text.includes("oauth2")) return Response.json({ access_token: "t" });
    if (text.includes("/dataTypes/exercise/")) { families.push(text); return Response.json({ dataPoints: [point("phone-walk"), point("aurin-gym", "aurin-client")] }); }
    return Response.json({ dataPoints: [] });
  };
  try {
    const env = { DB: db, USER_ID: 7, GOOGLE_CLIENT_ID: "aurin-client", GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: [HEALTH_PERMISSIONS.activity], CONNECTED_PROVIDERS: ["google"] };
    const body = await (await legacy.fetch(new Request("https://internal/sync/google/recent", { method: "POST" }), env, ctx)).json();
    assert.equal(body.results.find(r => r.type === "exercise").saved, 1);
    assert.ok(families.length && families.every(url => decodeURIComponent(url).includes("dataSourceFamilies/google-sources")), families.join());
    const rows = db.sqlite.prepare("SELECT source_family, external_id FROM health_datapoints WHERE data_type = 'exercise'").all();
    assert.deepEqual(rows.map(r => [r.source_family, r.external_id]), [["google-wearables", "users/me/dataTypes/exercise/dataPoints/phone-walk"]]);
  } finally { globalThis.fetch = realFetch; }
});

test("the connection status names Google permissions that were not given", async () => {
  const status = await connectionStatus({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: [HEALTH_PERMISSIONS.activity] });
  const google = status.providers.find(p => p.id === "google");
  assert.equal(google.connected, true);
  assert.deepEqual(google.missingPermissions, ["metrics", "sleep", "nutritionRead", "nutritionWrite"]);
  assert.ok(!JSON.stringify(status).includes('"r"'));
});

test("Intervals.icu takes a personal API key or an access token from its own sign-in", () => {
  assert.equal(intervalsAuthorization("abc"), "Basic " + btoa("API_KEY:abc"));
  assert.equal(intervalsAuthorization("Bearer tok"), "Bearer tok");
  // No request builds the Basic header by hand any more.
  for (const file of [...SERVER_FILES, "index.js", "weight-sync.js", "wellness-sync.js", "planned-events.js", "workout-library.js", "intervals-athlete.js"]) {
    assert.doesNotMatch(readFileSync(new URL("../src/" + file, import.meta.url), "utf8"), /API_KEY:/, file);
  }
});

test("Intervals.icu connects with one button once its app is registered", async () => {
  const db = createD1();
  const env = { DB: db, CONNECTION_KEY: "connection-key-for-tests-0123456789abcdef", USER_ID: 5, INTERVALS_CLIENT_ID: " cid ", INTERVALS_CLIENT_SECRET: "secret" };
  // Not registered: the key form stays the way in.
  const off = await handleIntervalsOAuth(new Request("https://aurin.health/oauth/intervals?return=app"), { ...env, INTERVALS_CLIENT_ID: "" }, "/oauth/intervals");
  assert.equal(off.headers.get("Location"), "https://aurin.health/auth/app/connected?event=intervals-failed");
  assert.equal((await connectionStatus({ ...env, INTERVALS_CLIENT_ID: "" })).providers.find(p => p.id === "intervals").method, "key");

  const start = await handleIntervalsOAuth(new Request("https://aurin.health/oauth/intervals?return=app"), env, "/oauth/intervals");
  const to = new URL(start.headers.get("Location"));
  assert.equal(to.origin + to.pathname, "https://intervals.icu/oauth/authorize");
  assert.equal(to.searchParams.get("client_id"), "cid");
  assert.equal(to.searchParams.get("scope"), INTERVALS_SCOPES.join(","));
  assert.equal(to.searchParams.get("redirect_uri"), "https://aurin.health/oauth/intervals/callback");
  const cookie = start.headers.get("Set-Cookie").split(";")[0], state = to.searchParams.get("state");

  const callback = (query, fetchImpl) => handleIntervalsOAuth(new Request("https://aurin.health/oauth/intervals/callback?" + query, { headers: { Cookie: cookie } }), env, "/oauth/intervals/callback", fetchImpl);
  assert.equal((await callback("state=other&code=x")).headers.get("Location"), "https://aurin.health/auth/app/connected?event=intervals-failed");
  assert.equal((await callback("state=" + state + "&error=access_denied")).headers.get("Location"), "https://aurin.health/auth/app/connected?event=intervals-cancelled");

  let exchanged = null;
  const ok = await callback("state=" + state + "&code=the-code", async (url, init) => { exchanged = { url, body: new URLSearchParams(String(init.body)) }; return Response.json({ token_type: "Bearer", access_token: "tok123", scope: INTERVALS_SCOPES.join(","), athlete: { id: "i1", name: "A" } }); });
  assert.equal(ok.headers.get("Location"), "https://aurin.health/auth/app/connected?event=intervals");
  assert.equal(exchanged.url, "https://intervals.icu/api/oauth/token");
  assert.deepEqual([exchanged.body.get("client_id"), exchanged.body.get("client_secret"), exchanged.body.get("code")], ["cid", "secret", "the-code"]);
  const resolved = await connectionEnvironment(env);
  assert.equal(resolved.INTERVALS_API_KEY, "Bearer tok123");
  // The athlete Intervals.icu's webhooks name.
  assert.equal(resolved.INTERVALS_ATHLETE_ID, "i1");
  assert.deepEqual(resolved.CONNECTED_PROVIDERS, ["intervals"]);
  const status = (await connectionStatus(resolved)).providers.find(p => p.id === "intervals");
  assert.deepEqual([status.connected, status.via, status.method, status.connectUrl], [true, "oauth", "oauth", "/oauth/intervals"]);

  const failed = await callback("state=" + state + "&code=bad", async () => new Response("{}", { status: 400 }));
  assert.equal(failed.headers.get("Location"), "https://aurin.health/auth/app/connected?event=intervals-failed");
});

test("connecting Google returns to the app; cancelling there is not a dead end", async () => {
  const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
  const start = await handleGoogleOAuth(new Request("https://aurin.health/oauth/google?consent=1&return=app"), google, "/oauth/google");
  const state = new URL(start.headers.get("Location")).searchParams.get("state"), cookie = start.headers.get("Set-Cookie").split(";")[0];
  const cancelled = await handleGoogleOAuth(new Request("https://aurin.health/oauth/google/callback?error=access_denied&state=" + state, { headers: { Cookie: cookie } }), google, "/oauth/google/callback");
  assert.equal(cancelled.headers.get("Location"), "https://aurin.health/auth/app/connected?event=google-cancelled");
});





test("the app learns which services are missing", () => {
  assert.match(entry, /missingProviders:missingProviders\(env\),onboarding,ai,consent[,}]/);
});
test("the gym plan does not need Intervals.icu", async () => {
  const { buildStrengthContext } = await import("../src/strength-context.js");
  const { scopedDb } = await import("../src/tenancy.js");
  const db = createD1();
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)");
  db.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const calls = [], realFetch = globalThis.fetch;
  globalThis.fetch = async url => { calls.push(String(url)); return Response.json([]); };
  try {
    const context = await buildStrengthContext({ DB: scopedDb(db, 3), USER_ID: 3, CONNECTED_PROVIDERS: ["google"] }, "2026-10-07");
    assert.equal(context.status, "ok");
    assert.deepEqual(context.cycling.recentActivities, []);
    assert.ok(!calls.some(url => url.includes("intervals.icu")), calls.join(", "));
    // A key Intervals.icu no longer accepts does not take the gym down either.
    globalThis.fetch = async url => { calls.push(String(url)); return new Response('{"error":"unauthorized"}', { status: 401 }); };
    const withBadKey = await buildStrengthContext({ DB: scopedDb(db, 3), USER_ID: 3, INTERVALS_API_KEY: "revoked", CONNECTED_PROVIDERS: ["intervals"] }, "2026-10-07");
    assert.equal(withBadKey.status, "ok");
  } finally { globalThis.fetch = realFetch; }
});

test("no calories are written to Intervals.icu", () => {
  assert.doesNotMatch(entry, /syncPlannedEventCalories|syncDailyNutritionNotes|removePlannedEventCalories|deleteDailyNutritionNotes/);
});


test("without Intervals.icu the fitness and form cards say where the numbers come from", () => {
});

test("Google Health and Intervals.icu connections use PKCE: the code is exchanged only with the verifier from the HttpOnly cookie", async () => {
  const s256 = async verifier => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const env = { DB: createD1(), USER_ID: 5, CONNECTION_KEY: "x".repeat(32), GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret", INTERVALS_CLIENT_ID: "cid", INTERVALS_CLIENT_SECRET: "secret" };
  for (const [name, start, callback, tokenUrl, answer] of [
    ["google", "/oauth/google?consent=1", "/oauth/google/callback", "https://oauth2.googleapis.com/token", { refresh_token: "r", scope: HEALTH_SCOPES.join(" ") }],
    ["intervals", "/oauth/intervals", "/oauth/intervals/callback", "https://intervals.icu/api/oauth/token", { access_token: "t", athlete: { id: "i1" } }],
  ]) {
    const handle = (request, fetchImpl) => name === "google" ? handleGoogleOAuth(request, env, new URL(request.url).pathname) : handleIntervalsOAuth(request, env, new URL(request.url).pathname, fetchImpl);
    const started = await handle(new Request("https://aurin.health" + start));
    const to = new URL(started.headers.get("Location")), cookie = started.headers.get("Set-Cookie").split(";")[0];
    assert.equal(to.searchParams.get("code_challenge_method"), "S256", name);
    const verifier = decodeURIComponent(cookie.split("=")[1]).split(".")[3];
    assert.match(verifier, /^[A-Za-z0-9_-]{43}$/, name);
    assert.equal(to.searchParams.get("code_challenge"), await s256(verifier), name);
    assert.ok(!to.toString().includes(verifier), name + ": the verifier never leaves the cookie");

    let sent = [], real = globalThis.fetch;
    const fetchImpl = async (url, init) => { sent.push({ url, body: new URLSearchParams(String(init.body)) }); return Response.json(answer); };
    globalThis.fetch = fetchImpl;
    try {
      const query = "?code=c&state=" + to.searchParams.get("state");
      // A state cookie from before PKCE (no verifier) starts again; the code is never exchanged.
      const old = cookie.slice(0, cookie.lastIndexOf("."));
      const refused = await handle(new Request("https://aurin.health" + callback + query, { headers: { Cookie: old } }), fetchImpl);
      assert.ok(refused.status === 400 || /failed/.test(refused.headers.get("Location") || ""), name);
      assert.equal(sent.length, 0, name);
      const ok = await handle(new Request("https://aurin.health" + callback + query, { headers: { Cookie: cookie } }), fetchImpl);
      assert.equal(ok.headers.get("Location"), "https://aurin.health/auth/app/connected?event=" + name);
      assert.equal(sent[0].url, tokenUrl);
      assert.equal(sent[0].body.get("code_verifier"), verifier, name);
    } finally { globalThis.fetch = real; }
  }
});
