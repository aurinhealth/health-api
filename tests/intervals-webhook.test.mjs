import test from "node:test";
import assert from "node:assert/strict";
import { handleIntervalsWebhook, webhookWork } from "../src/intervals-webhook.js";
import { disconnectIntervalsApp } from "../src/intervals-oauth.js";
import { serverSource } from "./helpers/server-source.mjs";

const post = (body, headers = {}) => new Request("https://aurin.health/webhooks/intervals", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const env = { INTERVALS_WEBHOOK_SECRET: "s3cret", INTERVALS_CLIENT_ID: "77" };

test("each Intervals.icu event asks for only the part of the import it changed", () => {
  const work = webhookWork({ events: [
    { athlete_id: "i1", type: "ACTIVITY_UPLOADED" }, { athlete_id: "i1", type: "ACTIVITY_ANALYZED" },
    { athlete_id: "i1", type: "WELLNESS_UPDATED" }, { athlete_id: "i2", type: "CALENDAR_UPDATED", oauth_client_id: 12 },
    { athlete_id: "i3", type: "SPORT_SETTINGS_UPDATED" },
    // A planned workout or the wellness Aurin itself sent: nothing to fetch back.
    { athlete_id: "i4", type: "CALENDAR_UPDATED", oauth_client_id: 77, external_id: "pfd-library:x" },
    { athlete_id: "i4", type: "WELLNESS_UPDATED", oauth_client_id: 77 },
    { type: "ACTIVITY_UPLOADED" }
  ] }, "77");
  assert.deepEqual([...work].map(([a, w]) => [a, [...w.parts], [...w.kinds]]), [
    ["i1", ["activities", "weight"], ["activities", "activity", "wellness"]], ["i2", ["planned"], ["calendar"]], ["i3", [""], ["settings"]]
  ]);
});

test("the webhook needs the secret, answers at once and fetches for the athlete after", async () => {
  const calls = [], waits = [];
  const forAthlete = async (athlete, parts) => { calls.push([athlete, parts]); };
  const ctx = { waitUntil: p => waits.push(p) };
  const body = { events: [{ athlete_id: "i1", type: "ACTIVITY_UPLOADED" }, { athlete_id: "i1", type: "FITNESS_UPDATED" }] };
  assert.equal((await handleIntervalsWebhook(post(body), env, ctx, forAthlete)).status, 401);
  assert.equal((await handleIntervalsWebhook(post(body, { Authorization: "wrong" }), env, ctx, forAthlete)).status, 401);
  // Without a secret set nothing is accepted.
  assert.equal((await handleIntervalsWebhook(post({ ...body, secret: "" }), { INTERVALS_CLIENT_ID: "77" }, ctx, forAthlete)).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await handleIntervalsWebhook(post(body, { Authorization: "s3cret" }), env, ctx, forAthlete)).status, 200);
  assert.equal((await handleIntervalsWebhook(post({ ...body, secret: "s3cret" }), env, ctx, forAthlete)).status, 200);
  await Promise.all(waits);
  assert.deepEqual(calls, [["i1", ["activities"]], ["i1", ["activities"]]]);
});

test("disconnecting an OAuth connection gives the access back to Intervals.icu; a key has nothing to give", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([String(url), init.method, init.headers.Authorization]); return new Response(null, { status: 204 }); };
  await disconnectIntervalsApp({ INTERVALS_API_KEY: "personal-key" }, fetchImpl);
  assert.equal(calls.length, 0);
  await disconnectIntervalsApp({ INTERVALS_API_KEY: "Bearer tok" }, fetchImpl);
  assert.deepEqual(calls, [["https://intervals.icu/api/v1/disconnect-app", "DELETE", "Bearer tok"]]);
});

test("an OAuth connection is not imported every 5 minutes; the webhook route is wired", () => {
  const entry = serverSource();
  assert.match(entry, /url\.pathname === "\/webhooks\/intervals"/);
  assert.match(entry, /name: "intervals-recent".*intervalsOAuthQuiet\(scoped, 40, .*\) \? null : legacyHealthApi\.fetch/);
  assert.match(entry, /if \(intervalsOAuthQuiet\(scoped, 30, .*\)\) return;\n    await syncWeights/);
  assert.match(entry, /disconnectIntervalsApp\(env\);await deleteConnectionSecret\(env,'intervals_athlete'\)/);
});
