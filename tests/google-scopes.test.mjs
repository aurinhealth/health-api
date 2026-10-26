import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { HEALTH_SCOPES, EXTRA_SCOPES, grantedExtras, healthScopes } from "../src/google-scopes.js";
import { saveConnectionSecret, connectionEnvironment } from "../src/connection-secrets.js";
import { connectionStatus } from "../src/connections.js";
import { handleGoogleOAuth } from "../src/google-oauth.js";
import { googleBirthDate, refreshSuggestions } from "../src/profile-suggestions.js";
import { effectiveProfile, ageFrom } from "../src/energy-profile.js";

const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };

test("Google Health tokens carry weight writing only when it was granted", () => {
  assert.deepEqual(healthScopes({}), HEALTH_SCOPES);
  assert.deepEqual(grantedExtras({}), { weightWrite: false, activityWrite: false, birthday: false, location: false });
  const granted = { GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite, EXTRA_SCOPES.birthday] };
  assert.deepEqual(healthScopes(granted), [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite]);
  // Writing workouts (Synchronizace) rides along once granted; it is never a base scope.
  assert.ok(!HEALTH_SCOPES.includes(EXTRA_SCOPES.activityWrite));
  assert.deepEqual(healthScopes({ GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.activityWrite] }), [...HEALTH_SCOPES, EXTRA_SCOPES.activityWrite]);
  // People API never rides on a Google Health token.
  assert.ok(!healthScopes(granted).includes(EXTRA_SCOPES.birthday));
});

test("connecting asks for everything on one Google page and keeps what was granted before", async () => {
  // Reconnecting with only the base scopes dropped the writing granted earlier (Petr, 2026-10-23).
  for (const path of ["/oauth/google?consent=1", "/oauth/google?consent=1&extra=1"]) {
    const url = new URL((await handleGoogleOAuth(new Request("https://aurin.health" + path), google, "/oauth/google")).headers.get("Location"));
    assert.deepEqual(url.searchParams.get("scope").split(" "), [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite, EXTRA_SCOPES.activityWrite, EXTRA_SCOPES.birthday, EXTRA_SCOPES.location]);
    assert.equal(url.searchParams.get("include_granted_scopes"), "true");
  }
});

test("Google's consent screen comes only after the app's own disclosure and consent", async () => {
  // Google Health data policy: the disclosure and consent in the app come right before Google's.
  // A visit without it (a bookmark, an old link) never reaches Google.
  for (const path of ["/oauth/google", "/oauth/google?extra=1", "/oauth/google?return=native"]) {
    const response = await handleGoogleOAuth(new Request("https://aurin.health" + path), google, "/oauth/google");
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("Location"), null);
  }
});

test("a Google Health connection started by one account is not stored for another signed in before the callback", async () => {
  const start = await handleGoogleOAuth(new Request("https://aurin.health/oauth/google?consent=1"), { ...google, USER_ID: 11 }, "/oauth/google");
  const state = new URL(start.headers.get("Location")).searchParams.get("state"), cookie = start.headers.get("Set-Cookie").split(";")[0];
  const db = createD1(), real = globalThis.fetch;
  let exchanged = false;
  globalThis.fetch = async () => { exchanged = true; return Response.json({ refresh_token: "r", scope: HEALTH_SCOPES.join(" ") }); };
  try {
    const other = await handleGoogleOAuth(new Request("https://aurin.health/oauth/google/callback?code=c&state=" + state, { headers: { Cookie: cookie } }), { ...google, DB: db, USER_ID: 22, CONNECTION_KEY: "x".repeat(32) }, "/oauth/google/callback");
    assert.equal(other.status, 403);
    assert.equal(exchanged, false, "the code is never exchanged");
    // The account that started gets it.
    const same = await handleGoogleOAuth(new Request("https://aurin.health/oauth/google/callback?code=c&state=" + state, { headers: { Cookie: cookie } }), { ...google, DB: db, USER_ID: 11, CONNECTION_KEY: "x".repeat(32) }, "/oauth/google/callback");
    assert.equal(same.headers.get("Location"), "loadwise://connected?event=google");
  } finally { globalThis.fetch = real; }
  assert.deepEqual(db.sqlite.prepare("SELECT DISTINCT user_id FROM connection_credentials").all().map(r => r.user_id), [11]);
});

test("granted scopes are stored per user and offered in the connection status", async () => {
  const db = createD1();
  const env = { DB: db, CONNECTION_KEY: "connection-key-for-tests-0123456789abcdef", USER_ID: 4, ...google };
  await saveConnectionSecret(env, "google", "refresh");
  await saveConnectionSecret(env, "google_scopes", [...HEALTH_SCOPES, EXTRA_SCOPES.birthday].join(" "));
  const resolved = await connectionEnvironment(env);
  assert.deepEqual(resolved.CONNECTED_PROVIDERS, ["google"]);
  assert.deepEqual(grantedExtras(resolved), { weightWrite: false, activityWrite: false, birthday: true, location: false });
  const g = (await connectionStatus(resolved)).providers.find(p => p.id === "google");
  assert.deepEqual(g.extras, { weightWrite: false, activityWrite: false, birthday: true, location: false });
  assert.equal(g.extrasUrl, "/oauth/google?extra=1");
});

test("the Google account birth date: primary first, full dates only", async () => {
  const reply = body => async () => Response.json(body);
  assert.equal(await googleBirthDate("t", reply({ birthdays: [{ date: { month: 5, day: 14 } }, { metadata: { primary: true }, date: { year: 1990, month: 5, day: 14 } }] })), "1990-05-14");
  assert.equal(await googleBirthDate("t", reply({ birthdays: [{ date: { month: 5, day: 14 } }] })), null);
  assert.equal(await googleBirthDate("t", async () => new Response("{}", { status: 403 })), null);
});

test("a newly granted birth date is read at once and sets the age; a saved one wins", async () => {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT);
    CREATE TABLE dashboard_profile (user_id INTEGER NOT NULL, id INTEGER NOT NULL, profile_json TEXT NOT NULL, PRIMARY KEY (user_id, id));`);
  const now = Date.parse("2026-10-02T10:00:00Z");
  const tokens = [];
  const deps = { now, googleToken: async (_env, scopes) => { tokens.push(scopes); return "t"; }, fetchImpl: async url => Response.json(String(url).includes("people.googleapis.com") ? { birthdays: [{ date: { year: 1990, month: 5, day: 14 } }] } : {}) };
  const env = { DB: db, USER_ID: 7, GOOGLE_REFRESH_TOKEN: "r", GOOGLE_SCOPES: HEALTH_SCOPES };
  assert.equal((await refreshSuggestions(env, deps)).birthDate, null);
  // Granted an hour later: no waiting for the daily refresh.
  const granted = { ...env, GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.birthday] };
  const s = await refreshSuggestions(granted, { ...deps, now: now + 3600000 });
  assert.equal(s.birthDate, "1990-05-14");
  assert.deepEqual(tokens.at(-1), [EXTRA_SCOPES.birthday]);
  assert.equal(effectiveProfile({ sex: "male" }, s).age, ageFrom("1990-05-14"));
  assert.equal(effectiveProfile({ birthDate: "1985-01-01" }, s).age, ageFrom("1985-01-01"));
});
