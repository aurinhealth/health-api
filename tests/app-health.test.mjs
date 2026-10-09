import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHealth, readinessParts } from "../src/app-health.js";

const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);

const wellness = Array.from({ length: 40 }, (_, i) => {
  const offset = i - 39, today = offset === 0;
  return {
    id: day(offset),
    hrv: today ? 66 : 56 + (i % 5),
    restingHR: today ? 47 : 50 + (i % 3),
    respiration: 14 + (i % 3) * 0.2,
    skinTempDeviation: (i % 4 - 2) * 0.1,
    hrZoneMinutes: { light: 40, moderate: today ? 10 : 20, vigorous: 5, peak: 0 }
  };
});
const sessions = Array.from({ length: 20 }, (_, i) => {
  const date = day(i - 19);
  return { date, startTime: day(i - 20) + "T21:48:00Z", endTime: date + "T05:02:00Z", durationMin: 412, timeInBedMin: 434, stages: { DEEP: 80, REM: 90, LIGHT: 230, AWAKE: 12 }, latencyMin: 9, wasoMin: 13 };
});
const weight = { records: Array.from({ length: 60 }, (_, i) => ({ sample_time: day(i - 59) + "T06:00:00Z", value_numeric: 84 - i * 0.03 })) };
const intervals = Array.from({ length: 20 }, (_, i) => ({ id: day(i - 19), spO2: 95 + (i % 3), bodyFat: 18.4 - i * 0.02 }));
const input = { date: DATE, health: { wellness }, fitness: { wellness: intervals }, sleep: { sessions }, weight, profile: { age: 38, targetWeight: 80 } };

test("Health: readiness with its parts and 14 days of history", () => {
  const h = buildHealth(input);
  assert.ok(h.readiness.score > 70);
  assert.equal(h.readiness.zone, "green");
  const keys = h.readiness.parts.map(p => p.key);
  assert.deepEqual(keys, ["hrv", "restingHR", "sleep"]);
  assert.ok(Math.abs(70 + h.readiness.parts.reduce((s, p) => s + p.points, 0) - h.readiness.score) <= 2, "parts add up to the score");
  assert.ok(h.readiness.parts[0].points > 0, "HRV above normal raises it");
  assert.equal(h.readiness.history.length, 14);
  assert.equal(h.readiness.history.at(-1).value, h.readiness.score);
  assert.equal(h.readiness.hrv, 66);
});

test("Health: the night, its stages, the week and the coming night", () => {
  const h = buildHealth({ ...input, hour: 15 });
  const n = h.sleep.night;
  assert.equal(n.minutes, 412);
  assert.equal(n.start, "23:48");
  assert.equal(n.end, "07:02");
  assert.equal(n.efficiency, 95);
  assert.equal(n.latencyMinutes, 9);
  assert.deepEqual(n.stages, { deep: 80, light: 230, rem: 90, awake: 12 });
  assert.ok(n.index > 0);
  assert.equal(h.sleep.week.length, 7);
  assert.equal(h.sleep.tonight.base, 480);
  assert.ok(h.sleep.tonight.need >= 480);
  assert.equal(h.sleep.tonight.bedtime != null, true);
  assert.equal(h.sleep.debt.minutes, 7 * (480 - 412));
  assert.equal(h.sleep.regularity.bedtime, "23:48");
  assert.equal(h.sleep.regularity.spread, 0);
});

test("Health: heart, breathing, temperature, oxygen and weight", () => {
  const h = buildHealth(input);
  assert.equal(h.hrv.value, 66);
  assert.equal(h.hrv.series.length, 30);
  assert.ok(h.hrv.low < h.hrv.baseline && h.hrv.baseline < h.hrv.high);
  assert.equal(h.restingHR.value, 47);
  assert.equal(h.respiration.series.length, 14);
  assert.equal(h.skinTemp.series.length, 14);
  assert.equal(h.oxygen.high, 97);
  assert.equal(h.weight.goal, 80);
  assert.ok(h.weight.change < 0);
  assert.equal(h.weight.series.length, 60);
  assert.ok(h.weight.bodyFat.change < 0);
});

test("Readiness parts: penalties for breathing and temperature", () => {
  const parts = readinessParts({ score: 50, components: { hrv: { score: 70 }, respiration: { elevated: true }, skinTemp: { elevated: true } } });
  assert.deepEqual(parts, [{ key: "hrv", points: 0 }, { key: "respiration", points: -10 }, { key: "skinTemp", points: -10 }]);
  assert.deepEqual(readinessParts({ score: null, components: {} }), []);
});

test("Health stays usable without data", () => {
  const h = buildHealth({ date: DATE });
  assert.equal(h.readiness.score, null);
  assert.deepEqual(h.readiness.parts, []);
  assert.equal(h.sleep.night, null);
  assert.equal(h.sleep.debt, null);
  assert.equal(h.sleep.regularity, null);
  for (const key of ["hrv", "restingHR", "respiration", "skinTemp", "oxygen", "weight"]) assert.equal(h[key], null, key);
});

test("The server answers GET /app/api/health with buildHealth", () => {
  const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname==='\/app\/api\/health'&&request\.method==='GET'/);
  assert.match(src, /buildHealth\(\{date,hour:date===localToday\(\)\?localHour\(\):null,health,fitness,sleep,weight,profile/);
});
