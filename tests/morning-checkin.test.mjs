import test from "node:test";
import assert from "node:assert/strict";
import { applyCheckin } from "../src/recovery-model.js";
import { manualReadinessFor, saveCheckin, getCheckin } from "../src/morning-checkin.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";

const week = days => ({ days: days.map(([date, planned = [], completed = []]) => ({ date, daily: { training: { planned, completed } } })) });
const ride = (date, hours) => [date, [], [{ type: "Ride", name: "Endurance", durationHours: hours, tss: Math.round(hours * 50) }]];
const history = [ride("2026-09-22", 1.5), ride("2026-09-24", 1.25), ride("2026-09-26", 2), ride("2026-09-28", 1.5), ride("2026-09-29", 1.25), ride("2026-09-30", 1.5)];
const coach = extra => buildCyclingCoachV2({ date: "2026-10-01", week: week(history), fitness: { wellness: [{ id: "2026-10-01", ctl: 55, atl: 53 }] }, health: { sleep: [{ type: "sleep", durationMin: 480, endTime: "2026-10-01T06:30:00" }] }, ...extra });

test("the check-in only lowers readiness", () => {
  const green = { score: 82, zone: "green", flags: [] };
  assert.deepEqual(applyCheckin(green, "fresh"), { ...green, checkin: "fresh" });
  assert.equal(applyCheckin(green, "normal").zone, "green");
  assert.deepEqual([applyCheckin(green, "tired").zone, applyCheckin(green, "tired").score], ["yellow", 60]);
  assert.deepEqual([applyCheckin(green, "sick").zone, applyCheckin(green, "sick").score], ["red", 25]);
  // A red morning stays red and keeps its lower score.
  assert.deepEqual([applyCheckin({ score: 20, zone: "red" }, "tired").zone, applyCheckin({ score: 20, zone: "red" }, "tired").score], ["red", 20]);
  // Without the body's number the answer alone gives the zone.
  assert.deepEqual([applyCheckin({ score: null, zone: null }, "sick").zone, applyCheckin({ score: null, zone: null }, "sick").score], ["red", null]);
  assert.equal(applyCheckin({ score: null, zone: null }, "fresh").zone, null);
});

test("normal leaves the coach's zone alone, tired and sick cap it", () => {
  assert.equal(manualReadinessFor("normal") >= 67, true);
  assert.equal(manualReadinessFor(null), null);
  const plain = coach({}).readiness.status;
  assert.equal(coach({ checkin: "normal" }).readiness.status, plain);
  assert.equal(coach({ checkin: "sick" }).readiness.status, "red");
  assert.ok(coach({ checkin: "tired" }).readiness.reasons.some(r => /ranní pocit: unavený|morning check-in: tired/.test(r)));
  // A number sent with the request wins over the stored answer.
  assert.equal(coach({ checkin: "sick", manualReadiness: 90 }).readiness.status, plain);
});

test("one answer a day, cleared with null", async () => {
  const rows = new Map();
  const db = {
    userId: 7,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() { if (/^INSERT/.test(sql)) rows.set(args[0] + ":" + args[1], args[2]); if (/^DELETE/.test(sql)) rows.delete(args[0] + ":" + args[1]); return {}; },
        async first() { return rows.has(args[0] + ":" + args[1]) ? { feeling: rows.get(args[0] + ":" + args[1]) } : null; }
      };
      return stmt;
    }
  };
  await saveCheckin(db, "2026-10-11", "tired");
  await saveCheckin(db, "2026-10-11", "fresh");
  assert.equal(await getCheckin(db, "2026-10-11"), "fresh");
  await saveCheckin(db, "2026-10-11", null);
  assert.equal(await getCheckin(db, "2026-10-11"), null);
  await assert.rejects(saveCheckin(db, "2026-10-11", "great"));
});
