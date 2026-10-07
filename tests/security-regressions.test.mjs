import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createD1 } from "./helpers/d1.mjs";
import legacy from "../src/index.js";
import { planValues } from "../src/gym-plan-store.js";

const ctx = { waitUntil() {} };
const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");

function healthDb() {
  const d = createD1();
  d.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, sample_time TEXT, start_time TEXT, end_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, updated_at TEXT, UNIQUE (user_id, source_family, data_type, external_id))");
  return d;
}

// A link opened from another site is a GET that carries the session cookie.
test("the food diary takes text only by POST", async () => {
  const response = await legacy.fetch(new Request("https://internal/food/log-text?text=str.%2012"), { DB: healthDb(), USER_ID: 7 }, ctx);
  assert.equal(response.status, 405);
});

// The periodic sync prints this answer in a public GitHub Actions log.
test("the Intervals sync answers with counts, not the activities or planned workouts", async t => {
  const d = healthDb();
  t.mock.method(globalThis, "fetch", async url => Response.json(String(url).includes("/activities?")
    ? [{ id: "i1", name: "Ranní jízda", type: "Ride", average_heartrate: 142, start_date_local: "2026-10-05T07:00:00" }]
    : [{ id: 9, name: "Posilovna", category: "WORKOUT", start_date_local: "2026-10-07T17:00:00" }]));
  const response = await legacy.fetch(new Request("https://internal/sync/intervals/recent", { method: "POST" }), { DB: d, USER_ID: 7, INTERVALS_API_KEY: "key" }, ctx);
  const body = await response.json();
  assert.deepEqual(body.activities, { activities_found: 1, activities_saved: 1 });
  assert.equal(body.planned.events_found, 1);
  assert.equal(body.planned.events, undefined);
  assert.doesNotMatch(JSON.stringify(body), /Ranní jízda|Posilovna|142/);
  // Still stored for the app.
  assert.equal((await d.prepare("SELECT count(*) n FROM health_datapoints").first()).n, 2);
});

test("a sheet-era video formula becomes a link only when it is http(s)", () => {
  const row = (exercise, video) => ["WORK", exercise, 1, 100, 5, "", "", "", "", "", video];
  const values = planValues({ date: "2026-10-06", rows: [row("Dřep", '=HYPERLINK("javascript:alert(document.cookie)";"🎥 Video")'), row("Bench", '=HYPERLINK("https://youtu.be/abc";"🎥 Video")')] });
  assert.equal(values[7][10], "https://www.youtube.com/results?search_query=D%C5%99ep%20exercise%20technique");
  assert.equal(values[8][10], "https://youtu.be/abc");
  // The Video button in the app checks the same for plans saved earlier.
  assert.ok(client.includes("const video=/^https?:\\/\\//i.test(formula)?formula:/^https?:\\/\\//i.test(formulaUrl)?formulaUrl:("));
});

test("signing out leaves nothing of the account on the device; onboarding keeps the profile", () => {
  const store = new Map(["lw-dashboard-ready", "lw-dashboard-snapshot", "fitnessProfile", "fitnessProfileSuggested", "pfd-assistant-chat", "pfd-meals-v1", "lw-training-tab"].map(key => [key, "x"]));
  const context = vm.createContext({ SNAPSHOT_KEY: "lw-dashboard-snapshot", localStorage: { removeItem: key => store.delete(key) } });
  vm.runInContext(client.match(/^function forgetDashboard\(\)\{.*$/m)[0] + "\n" + client.match(/^function forgetAccount\(\)\{.*$/m)[0], context);
  vm.runInContext("forgetDashboard()", context);
  assert.ok(store.has("fitnessProfile") && store.has("pfd-assistant-chat"));
  vm.runInContext("forgetAccount()", context);
  assert.deepEqual([...store.keys()].sort(), ["lw-training-tab", "pfd-meals-v1"]);
});
