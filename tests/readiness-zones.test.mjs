import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { userEnv } from "../src/tenancy.js";
import { saveAppleHealth } from "../src/apple-health.js";
import { localToday } from "../src/user-time.js";
import { accountZones, readOnlyD1, ruleZ, HRV_RULES } from "../scripts/readiness-zones.mjs";

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
  // Every candidate HRV rule scores the same days; one that only softens a low morning never takes a green day.
  for (const name of Object.keys(HRV_RULES)) assert.equal(all[name].green + all[name].yellow + all[name].red, zones.green + zones.yellow + zones.red, name);
  for (const name of ["avg3low", "bandlow", "noDrop"]) assert.ok(all[name].green >= zones.green && all[name].red <= zones.red, name);
});

test("the candidate HRV rules: an average of the last mornings, a ±0.5 SD dead band", () => {
  const mean = Math.log(50), sd = 0.1, at = z => mean + z * sd;
  assert.equal(ruleZ(HRV_RULES.now, -0.8, mean, sd, [at(1)]), -0.8);
  assert.ok(Math.abs(ruleZ(HRV_RULES.avg3, -0.9, mean, sd, [at(0.3), at(0), at(-2)]) - -0.2) < 1e-9);
  assert.ok(Math.abs(ruleZ(HRV_RULES.band, -0.4, mean, sd, [])) < 1e-9);
  assert.ok(Math.abs(ruleZ(HRV_RULES.band, -1.2, mean, sd, []) - -0.7) < 1e-9);
  // A symmetric band also takes from a good morning; "low" keeps it.
  assert.ok(Math.abs(ruleZ(HRV_RULES.band, 1, mean, sd, []) - 0.5) < 1e-9);
  assert.equal(ruleZ(HRV_RULES.bandlow, 1, mean, sd, []), 1);
  assert.ok(Math.abs(ruleZ(HRV_RULES.avg3low, -1, mean, sd, [at(0), at(-2)]) - -1) < 1e-9);
  assert.equal(ruleZ(HRV_RULES.noDrop, -2, mean, sd, []), 0);
  // Too few mornings before: the average is over the ones there are.
  assert.ok(Math.abs(ruleZ(HRV_RULES.avg7, -1, mean, sd, [at(0)]) - -0.5) < 1e-9);
});

test("the staging measurement never writes", async () => {
  const sent = [];
  const db = readOnlyD1(async sql => { sent.push(sql); return [{ n: 1 }]; });
  await db.prepare("CREATE TABLE IF NOT EXISTS x (a)").run();
  await db.prepare("INSERT INTO readiness_locks(user_id,date,lock_json) VALUES(?,?,?)").bind(1, "2026-11-06", "{}").run();
  assert.deepEqual(await db.prepare("SELECT 1 AS n").first(), { n: 1 });
  assert.deepEqual(sent, ["SELECT 1 AS n"]);
});
