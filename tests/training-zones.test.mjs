import test from "node:test";
import assert from "node:assert/strict";
import { estimateFtp, powerZones, hrZones, sanitizeTrainingProfile, zoneForPercent } from "../src/training-zones.js";
import { saveTrainingProfile } from "../src/training-profile.js";
import { athleteThresholds } from "../src/intervals-athlete.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

test("FTP methods", () => {
  assert.equal(estimateFtp("test20", { power20: 300 }).ftp, 285);
  assert.equal(estimateFtp("test8", { power8: 320 }).ftp, 288);
  assert.equal(estimateFtp("ramp", { rampMinute: 380 }).ftp, 285);
  assert.equal(estimateFtp("test60", { power60: 270 }).ftp, 270);
  assert.equal(estimateFtp("criticalPower", { power3: 380, power12: 300 }).ftp, 273);
  assert.equal(estimateFtp("weight", { weightKg: 80, wattsPerKg: 3.5 }).ftp, 280);
  assert.throws(() => estimateFtp("test20", { power20: 20 }), /mimo rozumný/);
  assert.throws(() => estimateFtp("nope", {}), /Neznámá/);
});

test("power zone models and custom bounds", () => {
  const coggan = powerZones({}, 300);
  assert.equal(coggan.length, 7);
  assert.deepEqual([coggan[1].percentLow, coggan[1].percentHigh, coggan[1].wattsLow, coggan[1].wattsHigh], [56, 75, 168, 225]);
  assert.equal(coggan[6].percentHigh, null);
  assert.equal(powerZones({ powerZoneModel: "seiler3" }, 300).length, 3);
  const custom = powerZones(sanitizeTrainingProfile({ powerZoneModel: "custom", powerZoneBounds: [60, 80, 100] }), 250);
  assert.deepEqual(custom.map(z => z.percentHigh), [60, 80, 100, null]);
  assert.equal(zoneForPercent(coggan, 98).name, "Z4 Práh");
  assert.throws(() => sanitizeTrainingProfile({ powerZoneModel: "custom", powerZoneBounds: [80, 60] }), /rostoucí/);
});

test("heart-rate zones from LTHR, max HR and heart-rate reserve", () => {
  const friel = hrZones({ lthr: 170 });
  assert.equal(friel.length, 7);
  assert.equal(friel[0].bpmHigh, 138);
  assert.equal(friel[1].bpmLow, 139);
  assert.equal(hrZones({ hrZoneModel: "hrMax5", maxHr: 190 })[4].bpmLow, 172);
  const karvonen = hrZones({ hrZoneModel: "karvonen", maxHr: 190, restHr: 50 });
  assert.equal(karvonen[1].bpmLow, 135);
  assert.equal(hrZones({ hrZoneModel: "hrMax5" })[1].bpmLow, null);
  assert.throws(() => sanitizeTrainingProfile({ lthr: 20 }), /LTHR/);
});

test("a manual FTP wins over Intervals and the latest ride, per user", async () => {
  const raw = createD1(), alice = scopedDb(raw, 1), bob = scopedDb(raw, 2);
  await saveTrainingProfile(alice, { ftp: 301, lthr: 172, powerZoneModel: "five" });
  const fetchImpl = async () => Response.json({ sportSettings: [{ types: ["Ride"], ftp: 280, indoor_ftp: 270 }] });
  const a = await athleteThresholds({ DB: alice, USER_ID: 1, INTERVALS_API_KEY: "k" }, fetchImpl);
  assert.deepEqual([a.ftp, a.source, a.indoorFtp, a.lthr, a.powerZones.length], [301, "manual", null, 172, 5]);
  const b = await athleteThresholds({ DB: bob, USER_ID: 2, INTERVALS_API_KEY: "k" }, fetchImpl);
  assert.deepEqual([b.ftp, b.source, b.indoorFtp, b.powerZones.length], [280, "intervals-settings", 270, 7]);
});

const week = rides => ({ days: rides.map(([date, completed]) => ({ date, daily: { training: { planned: [], completed } } })) });
const fresh = { wellness: [{ id: "2026-09-30", ctl: 60, atl: 50 }] };
const sleep = { sleep: [{ type: "sleep", durationMin: 480, startTime: "2026-09-29T22:00:00Z", endTime: "2026-09-30T06:00:00Z" }] };

test("after a week off the coach eases back in and says why", () => {
  const coach = buildCyclingCoachV2({ date: "2026-09-30", week: week([["2026-09-20", [{ name: "Ride", type: "Ride", durationHours: 2, tss: 100 }]]]), fitness: fresh, health: sleep });
  assert.equal(coach.recommendation.session.kind, "endurance");
  assert.match(coach.rationale.join(" "), /Posledních 10 dní bez jízdy/);
});

test("rested with no quality this week, the coach picks the quality system trained longest ago", () => {
  const easy = { name: "Easy ride", type: "Ride", durationHours: 1.5, tss: 60 };
  const caps = { sweet_spot: { level: 4, updated_at: "2026-09-28T10:00:00Z" }, threshold: { level: 4, updated_at: "2026-09-10T10:00:00Z" }, vo2max: { level: 4, updated_at: "2026-09-20T10:00:00Z" } };
  const coach = buildCyclingCoachV2({ date: "2026-09-30", week: week([["2026-09-28", [easy]]]), fitness: fresh, health: sleep, capabilities: caps });
  assert.equal(coach.readiness.status, "green");
  assert.equal(coach.recommendation.session.kind, "threshold");
  assert.match(coach.rationale.join(" "), /žádná kvalita.*Práh jsi/);
});
