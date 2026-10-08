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
import { connectReturnUrl } from "../src/connect-return.js";
import { dashboardPage } from "../src/dashboard.js";

const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
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
    for (const type of ["weight", "daily-resting-heart-rate", "daily-heart-rate-variability"]) {
      assert.ok(!health.some(url => url.includes(`/dataTypes/${type}/`)), type);
      assert.equal(body.results.find(r => r.type === type).status, "skipped");
    }
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
  for (const file of ["entrypoint.js", "index.js", "weight-sync.js", "wellness-sync.js", "planned-events.js", "workout-library.js", "intervals-athlete.js"]) {
    assert.doesNotMatch(readFileSync(new URL("../src/" + file, import.meta.url), "utf8"), /API_KEY:/, file);
  }
});

test("Intervals.icu connects with one button once its app is registered", async () => {
  const db = createD1();
  const env = { DB: db, STRENGTH_API_KEY: "k", USER_ID: 5, INTERVALS_CLIENT_ID: " cid ", INTERVALS_CLIENT_SECRET: "secret" };
  // Not registered: the key form stays the way in.
  const off = await handleIntervalsOAuth(new Request("https://petrfitnessdata.eu/oauth/intervals?return=setup"), { ...env, INTERVALS_CLIENT_ID: "" }, "/oauth/intervals");
  assert.equal(off.headers.get("Location"), "/app?connected=intervals-failed#setup");
  assert.equal((await connectionStatus({ ...env, INTERVALS_CLIENT_ID: "" })).providers.find(p => p.id === "intervals").method, "key");

  const start = await handleIntervalsOAuth(new Request("https://petrfitnessdata.eu/oauth/intervals?return=setup"), env, "/oauth/intervals");
  const to = new URL(start.headers.get("Location"));
  assert.equal(to.origin + to.pathname, "https://intervals.icu/oauth/authorize");
  assert.equal(to.searchParams.get("client_id"), "cid");
  assert.equal(to.searchParams.get("scope"), INTERVALS_SCOPES.join(","));
  assert.equal(to.searchParams.get("redirect_uri"), "https://petrfitnessdata.eu/oauth/intervals/callback");
  const cookie = start.headers.get("Set-Cookie").split(";")[0], state = to.searchParams.get("state");

  const callback = (query, fetchImpl) => handleIntervalsOAuth(new Request("https://petrfitnessdata.eu/oauth/intervals/callback?" + query, { headers: { Cookie: cookie } }), env, "/oauth/intervals/callback", fetchImpl);
  assert.equal((await callback("state=other&code=x")).headers.get("Location"), "/app?connected=intervals-failed#settings-connections");
  assert.equal((await callback("state=" + state + "&error=access_denied")).headers.get("Location"), "/app?connected=intervals-cancelled#setup");

  let exchanged = null;
  const ok = await callback("state=" + state + "&code=the-code", async (url, init) => { exchanged = { url, body: new URLSearchParams(String(init.body)) }; return Response.json({ token_type: "Bearer", access_token: "tok123", scope: INTERVALS_SCOPES.join(","), athlete: { id: "i1", name: "A" } }); });
  assert.equal(ok.headers.get("Location"), "/app?connected=intervals#setup");
  assert.equal(exchanged.url, "https://intervals.icu/api/oauth/token");
  assert.deepEqual([exchanged.body.get("client_id"), exchanged.body.get("client_secret"), exchanged.body.get("code")], ["cid", "secret", "the-code"]);
  const resolved = await connectionEnvironment(env);
  assert.equal(resolved.INTERVALS_API_KEY, "Bearer tok123");
  assert.deepEqual(resolved.CONNECTED_PROVIDERS, ["intervals"]);
  const status = (await connectionStatus(resolved)).providers.find(p => p.id === "intervals");
  assert.deepEqual([status.connected, status.via, status.method, status.connectUrl], [true, "oauth", "oauth", "/oauth/intervals"]);

  const failed = await callback("state=" + state + "&code=bad", async () => new Response("{}", { status: 400 }));
  assert.equal(failed.headers.get("Location"), "/app?connected=intervals-failed#setup");
});

test("connecting Google from the setup window returns to it; cancelling there is not a dead end", async () => {
  const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
  const start = await handleGoogleOAuth(new Request("https://petrfitnessdata.eu/oauth/google?consent=1&return=setup"), google, "/oauth/google");
  const state = new URL(start.headers.get("Location")).searchParams.get("state"), cookie = start.headers.get("Set-Cookie").split(";")[0];
  const cancelled = await handleGoogleOAuth(new Request("https://petrfitnessdata.eu/oauth/google/callback?error=access_denied&state=" + state, { headers: { Cookie: cookie } }), google, "/oauth/google/callback");
  assert.equal(cancelled.headers.get("Location"), "/app?connected=google-cancelled#setup");
  // Plain connects (Settings) keep returning to the connections.
  assert.equal(connectReturnUrl("settings", "google"), "/app?connected=google#settings-connections");
  assert.equal(connectReturnUrl("setup", "unknown"), "/app#setup");
});

test("the setup window keeps provider cards and lets prefilled profiles bypass extra setup steps", () => {
  assert.match(entry, /missingProviders:missingProviders\(env\),onboarding,ai,consent[,}]/);
  assert.match(client, /providers\.map\(p=>serviceCardHtml\(p,'setup'\)\)/);
  assert.match(client, /wireIntervalsKey\(\$\('setupBody'\)/);
  // The provider pages return to the step the user left.
  assert.match(client, /'return='\+back/);
  assert.match(client, /if\(!edit&&setup\.baseline\.ready\)return finish\(\)/);
  assert.match(client, /\$\('restartSetup'\)\.onclick=\(\)=>showAccountSetup\(\{edit:true\}\)/);
});

test("data kept on the device belongs to the signed-in account", async () => {
  assert.match(await dashboardPage({ account: 7 }).text(), /<meta name="lw-account" content="7">/);
  assert.match(await dashboardPage({ account: "<x>" }).text(), /<meta name="lw-account" content="">/);
  assert.match(entry, /account: \(await verifyDashboardSession\(request, sessionSecret\(env\)\)\)\?\.uid \?\? ""/);
  const run = (pageAccount, kept) => {
    const store = new Map(Object.entries({ "lw-dashboard-ready": "1", "lw-dashboard-snapshot": "{}", fitnessProfile: "{}", "pfd-meals-v1": "x", ...(kept ? { "lw-account": kept } : {}) }));
    const localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
    const context = vm.createContext({ SNAPSHOT_KEY: "lw-dashboard-snapshot", localStorage, PAGE_ACCOUNT: pageAccount });
    for (const name of ["forgetDashboard", "forgetAccount", "bindDeviceToAccount"]) vm.runInContext(client.match(new RegExp("^function " + name + "\\(\\)\\{.*$", "m"))[0], context);
    vm.runInContext("bindDeviceToAccount()", context);
    return store;
  };
  // Someone else signed in on this browser: the previous account's day and profile go.
  const other = run("8", "7");
  assert.deepEqual([...other.keys()].sort(), ["lw-account", "pfd-meals-v1"]);
  assert.equal(other.get("lw-account"), "8");
  // The same account keeps everything.
  assert.ok(run("7", "7").has("lw-dashboard-snapshot"));
  // Signed out (no account on the page): nothing changes until the next sign-in.
  assert.ok(run("", "7").has("fitnessProfile"));
});

test("a part that did not load is named, not just 'a data service'", () => {
  const jobs = client.match(/const jobs=\[(.*?)\]\.filter/)[1];
  const keys = [...jobs.matchAll(/\['([a-zA-Z]+)','\/app\/api/g)].map(m => m[1]);
  const labels = client.match(/const LOAD_PART_LABELS=\{(.*?)\};/)[1];
  for (const key of keys) assert.match(labels, new RegExp("\\b" + key + ":\\["), key);
  assert.doesNotMatch(client, /Některá datová služba není dostupná/);
});

test("settings are sections that open one at a time and links open the right one", () => {
  for (const key of ["connections", "profile", "training", "appearance", "account", "users"]) assert.ok(client.includes("settingsSectionHtml('" + key + "'"), key);
  assert.match(client, /name="settings"/);
  assert.match(client, /data-open-section="connections">Zkontrolovat propojení/);
  assert.match(client, /openSettings\('profile','fitnessProfileForm'\)/);
  // The Language and Appearance cards keep their headings (i18n tests rely on them).
  assert.match(client, /<h3>Jazyk<\/h3>/);
  assert.match(client, /<h3>Vzhled<\/h3>/);
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

test("no calories are written to Intervals.icu; the automations only remove the old ones", async () => {
  assert.doesNotMatch(entry, /syncPlannedEventCalories|syncDailyNutritionNotes/);
  assert.match(entry, /forEachUser\(rawEnv,\["intervals"\],env=>removePlannedEventCalories\(env,\{oldest,newest\}\)\)/);
  assert.match(entry, /forEachUser\(rawEnv,\["intervals"\],env=>deleteDailyNutritionNotes\(env,\{oldest,newest\}\)\)/);
  const { removePlannedEventCalories } = await import("../src/intervals-calories.js");
  const realFetch = globalThis.fetch, puts = [];
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === "PUT") { puts.push(JSON.parse(init.body)); return Response.json({}); }
    return Response.json([{ id: 1, description: "Z2\n\nEstimated calories: 500 kcal" }, { id: 2, description: "Bez kalorií" }]);
  };
  try {
    const result = await removePlannedEventCalories({ INTERVALS_API_KEY: "k" }, { oldest: "2099-01-01" });
    assert.equal(result.cleanedCount, 1);
    assert.deepEqual(puts.map(p => [p.id, p.description]), [[1, "Z2"]]);
  } finally { globalThis.fetch = realFetch; }
});

test("without a service the app does not offer what needs it", () => {
  // The page knows what this account has connected.
  assert.match(client, /setConnectedServices\(\['google','intervals'\]\.filter\(id=>!\(me\.missingProviders\|\|\[\]\)\.includes\(id\)\)\)/);
  // Workouts are saved in the app; Intervals.icu is only a destination.
  assert.match(client, /function proposalWaiting\(p\)\{return Boolean\(p\?\.workout/);
  assert.doesNotMatch(client, /Kolo a běh se zapisují do Intervals\.icu/);
  // Food entries carry no "Google · není připojené" badge without Google Health.
  assert.match(client, /function foodExportHtml\(entry\)\{\n  if\(!serviceConnected\('google'\)\)return '';/);
});

test("without Intervals.icu the fitness and form cards say where the numbers come from", () => {
  assert.match(client, /Kondice · jen s Intervals\.icu/);
  assert.match(client, /const ownLoad=serviceConnected\('intervals'\);\n  \$\("oFitness"\)\.innerHTML=ownLoad\?/);
  assert.doesNotMatch(dashboardPage.toString() + client, /targetWeightKg\|\|80/);
});
