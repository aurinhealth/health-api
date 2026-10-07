import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import legacy from "../src/index.js";

const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");

test("a data reload does not take the timeline out of the visible Přehled", () => {
  assert.match(client, /if\(tl&&el\.classList\.contains\('active'\)\)\$\('todayTimelineSlot'\)\.appendChild\(tl\)/);
});

test("rebuilding Dnes parks the timeline first instead of deleting it", () => {
  assert.match(client, /const parked=\$\('dayTimeline'\);if\(parked&&el\.contains\(parked\)\)\$\('dailyPulse'\)\?\.after\(parked\);\s*\(\$\('todayTop'\)\|\|el\)\.innerHTML='<div class="today-layout">/);
});

test("Dnes is the one day screen: no separate Přehled tab, the rest of Přehled moves under it", () => {
  assert.match(page, /<button class="navbtn active" data-view="today">/);
  assert.doesNotMatch(page, /data-view="overview"/);
  assert.match(page, /<section id="today" class="view active"/);
  assert.doesNotMatch(page, /phone-only/);
  assert.match(client, /for\(const el of \[\.\.\.overview\.children\]\)if\(!keep\(el\)\)\$\('todayMore'\)\.append\(el\);/);
  assert.match(client, /activate=function\(id\)\{act\(id==='overview'\?'today':id\);\}/);
  assert.doesNotMatch(client, /Celý přehled dne/);
});

test("the timeline shows the day's weigh-ins and logs a weight for the shown day", () => {
  assert.match(client, /cls:'weight',title:uiText\('Váha · ','Weight · '\)/);
  assert.match(client, /\$\('timelineWeight'\)\.onclick=\(\)=>openWeightSheet\(date\)/);
  assert.match(client, /body:JSON\.stringify\(\{kg:v,date\}\)/);
});

function weightEnv() {
  const db = createD1();
  db.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, value_unit TEXT, payload_json TEXT, record_role TEXT, updated_at TEXT, UNIQUE (user_id, source_family, data_type, external_id));`);
  return { DB: db, USER_ID: 7, CONNECTED_PROVIDERS: [] };
}
const post = (env, body) => legacy.fetch(new Request("https://internal/app/api/weight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, { waitUntil() {} });

test("today's manual weigh-in keeps its Prague time, an earlier day gets noon", async () => {
  const env = weightEnv();
  assert.equal((await post(env, { kg: 80.2 })).status, 200);
  assert.equal((await post(env, { kg: 80.9, date: "2026-01-05" })).status, 200);
  const rows = env.DB.sqlite.prepare("SELECT sample_time FROM health_datapoints ORDER BY sample_time").all().map(r => r.sample_time);
  assert.equal(rows[0], "2026-01-05T12:00:00+02:00");
  assert.match(rows[1], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+0[12]:00$/);
});

test("a weight for a future or malformed day is refused", async () => {
  const env = weightEnv();
  assert.equal((await post(env, { kg: 80, date: "2999-01-01" })).status, 400);
  assert.equal((await post(env, { kg: 80, date: "zítra" })).status, 400);
});

test("one bad record does not empty the timeline: each source is drawn on its own", () => {
  for (const source of ["sleep", "activities", "other activities", "planned", "food", "weight", "coach"]) assert.ok(client.includes("add('" + source + "',()=>{"), source);
  assert.match(client, /add=\(source,fn\)=>\{try\{fn\(\);\}catch\(error\)\{console\.error\('Timeline: '\+source,error\);\}\}/);
  // A weight without a valid day (null sample_time) is skipped before dateLabel can throw.
  assert.match(client, /\.filter\(r=>\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(r\.day\)/);
  assert.match(client, /items\.sort\(\(a,b\)=>\(clock\(a\.t\)\|\|''\)\.localeCompare\(clock\(b\.t\)\|\|''\)\)/);
});

test("weights without sample_time use start_time; ones without any time are left out", async () => {
  const env = weightEnv();
  env.DB.sqlite.exec(`INSERT INTO health_datapoints (user_id, source_family, data_type, external_id, start_time, sample_time, value_numeric) VALUES
    (7, 'google', 'weight', 'a', '2026-10-03T05:12:00Z', NULL, 81.4),
    (7, 'google', 'weight', 'b', NULL, NULL, 90),
    (7, 'manual', 'weight', 'c', NULL, '2026-10-02T12:00:00+02:00', 81.9)`);
  const r = await (await legacy.fetch(new Request("https://internal/health/weight"), env, { waitUntil() {} })).json();
  assert.deepEqual(r.records.map(x => [x.sample_time, x.value_numeric]), [["2026-10-02T12:00:00+02:00", 81.9], ["2026-10-03T05:12:00Z", 81.4]]);
});
