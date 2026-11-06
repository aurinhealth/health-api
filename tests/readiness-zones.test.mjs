import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { userEnv } from "../src/tenancy.js";
import { saveAppleHealth } from "../src/apple-health.js";
import { localToday } from "../src/user-time.js";
import { accountZones, readOnlyD1, rescore, yellowCause, RULES } from "../scripts/readiness-zones.mjs";

const shift = (day, days) => new Date(Date.parse(day + "T12:00:00Z") + days * 864e5).toISOString().slice(0, 10);

test("the staging measurement counts each day's zone from stored Apple days and nights", async () => {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const env = userEnv({ DB: raw }, { id: 1, email: "", role: "user" });
  const today = localToday(), records = [];
  for (let i = 1; i <= 70; i++) {
    const d = shift(today, -i);
    records.push({ type: "daily-heart-rate-variability", id: "hrv:" + d, date: d, value: 40 + (i % 7) * 3, metric: "sdnn" });
    records.push({ type: "daily-resting-heart-rate", id: "rhr:" + d, date: d, value: 52 + (i % 3) });
    records.push({ type: "sleep", id: "night:" + d, start: shift(d, -1) + "T22:00:00Z", end: d + "T05:30:00Z", stages: [] });
  }
  await saveAppleHealth(env.DB, 1, { records }, { now: Date.now() });
  const all = await accountZones(env, 30), zones = all.now;
  assert.equal(zones.days, 30);
  assert.equal(zones.green + zones.yellow + zones.red + zones.none, 30);
  assert.ok(zones.green + zones.yellow + zones.red > 20, JSON.stringify(zones));
  // Every rule scores the same days, rescoring matches readinessFor, a rule
  // that only gives points back never takes a green day, and each yellow day has one cause.
  for (const name of Object.keys(RULES)) assert.equal(all[name].green + all[name].yellow + all[name].red, zones.green + zones.yellow + zones.red, name);
  assert.equal(all.causes.mismatch, 0, JSON.stringify(all.causes));
  for (const name of ["hrvBand", "allBand", "allFree"]) assert.ok(all[name].green >= zones.green && all[name].red <= zones.red, name);
  const c = all.causes;
  assert.equal(c.hrv + c.restingHR + c.sleep + c.shortNight + c.breathingOrTemp + c.none, zones.yellow, JSON.stringify(c));
});

test("a day scored again from its parts, and why it is yellow", () => {
  const day = (hrv, rhr, sleep, extra = {}) => ({ score: 0, flags: [], components: { hrv: { score: hrv }, restingHR: { score: rhr }, sleep: { score: sleep } }, ...extra });
  assert.equal(rescore(day(70, 70, 70)), 70);
  assert.equal(rescore(day(62, 70, 70)), 66);
  assert.equal(rescore(day(62, 70, 70), RULES.hrvBand), 70);
  assert.equal(rescore(day(40, 70, 70), RULES.hrvBand), 60);
  assert.equal(rescore(day(70, 70, 50), RULES.sleepFree), 70);
  // Without a night the parts left are weighted up; a short night caps at 66.
  assert.equal(rescore({ score: 0, flags: [], components: { hrv: { score: 80 }, restingHR: { score: 50 } } }), 70);
  assert.equal(rescore(day(90, 90, 90, { flags: ["short_night"] })), 66);
  assert.equal(rescore(day(70, 70, 70, { components: { hrv: { score: 70 }, restingHR: { score: 70 }, sleep: { score: 70 }, respiration: { elevated: true } } })), 60);
  assert.equal(yellowCause(day(62, 70, 70)), "hrv");
  assert.equal(yellowCause(day(66, 70, 54)), "sleep");
  assert.equal(yellowCause(day(90, 90, 90, { flags: ["short_night"] })), "shortNight");
  assert.equal(yellowCause(day(70, 70, 70, { components: { hrv: { score: 70 }, restingHR: { score: 70 }, sleep: { score: 70 }, wristTemp: { points: -5 } } })), "breathingOrTemp");
  assert.equal(rescore({ score: null }), null);
});

test("the staging measurement never writes", async () => {
  const sent = [];
  const db = readOnlyD1(async sql => { sent.push(sql); return [{ n: 1 }]; });
  await db.prepare("CREATE TABLE IF NOT EXISTS x (a)").run();
  await db.prepare("INSERT INTO readiness_locks(user_id,date,lock_json) VALUES(?,?,?)").bind(1, "2026-11-06", "{}").run();
  assert.deepEqual(await db.prepare("SELECT 1 AS n").first(), { n: 1 });
  assert.deepEqual(sent, ["SELECT 1 AS n"]);
});
