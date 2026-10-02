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
  assert.deepEqual(grantedExtras({}), { weightWrite: false, birthday: false });
  const granted = { GOOGLE_SCOPES: [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite, EXTRA_SCOPES.birthday] };
  assert.deepEqual(healthScopes(granted), [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite]);
  // People API never rides on a Google Health token.
  assert.ok(!healthScopes(granted).includes(EXTRA_SCOPES.birthday));
});

test("connecting asks for Google Health only; 'extra' adds the optional scopes incrementally", async () => {
  const plain = new URL((await handleGoogleOAuth(new Request("https://petrfitnessdata.eu/oauth/google"), google, "/oauth/google")).headers.get("Location"));
  assert.deepEqual(plain.searchParams.get("scope").split(" "), HEALTH_SCOPES);
  const extra = new URL((await handleGoogleOAuth(new Request("https://petrfitnessdata.eu/oauth/google?extra=1"), google, "/oauth/google")).headers.get("Location"));
  assert.deepEqual(extra.searchParams.get("scope").split(" "), [...HEALTH_SCOPES, EXTRA_SCOPES.weightWrite, EXTRA_SCOPES.birthday]);
  assert.equal(extra.searchParams.get("include_granted_scopes"), "true");
});

test("granted scopes are stored per user and offered in the connection status", async () => {
  const db = createD1();
  const env = { DB: db, STRENGTH_API_KEY: "k", USER_ID: 4, ...google };
  await saveConnectionSecret(env, "google", "refresh");
  await saveConnectionSecret(env, "google_scopes", [...HEALTH_SCOPES, EXTRA_SCOPES.birthday].join(" "));
  const resolved = await connectionEnvironment(env);
  assert.deepEqual(resolved.CONNECTED_PROVIDERS, ["google"]);
  assert.deepEqual(grantedExtras(resolved), { weightWrite: false, birthday: true });
  const g = (await connectionStatus(resolved)).providers.find(p => p.id === "google");
  assert.deepEqual(g.extras, { weightWrite: false, birthday: true });
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
