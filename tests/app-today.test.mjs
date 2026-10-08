import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildToday } from "../src/app-today.js";
import { googleHealthSummary } from "../src/google-dashboard.js";

const DATE = "2026-10-08";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);

// 40 days of Google Health wellness with a stable baseline, today a little better.
const wellness = Array.from({ length: 40 }, (_, i) => {
  const offset = i - 39, today = offset === 0;
  return {
    id: day(offset),
    hrv: today ? 66 : 56 + (i % 5),
    restingHR: today ? 47 : 50 + (i % 3),
    steps: 8000 + i * 10,
    hrZoneMinutes: { light: 40, moderate: today ? 10 : 20, vigorous: 5, peak: 0 }
  };
});
// Nights from 23:48 to 07:02 Prague time (UTC+2 in October).
const sessions = Array.from({ length: 20 }, (_, i) => {
  const date = day(i - 19);
  return { date, startTime: day(i - 20) + "T21:48:00Z", endTime: date + "T05:02:00Z", durationMin: 412, timeInBedMin: 434, stages: { DEEP: 80, REM: 90, LIGHT: 230, AWAKE: 12 }, latencyMin: 9, wasoMin: 13 };
});

const input = {
  date: DATE,
  health: { wellness },
  sleep: { sessions },
  daily: {
    training: { planned: [{ start: DATE + "T17:30:00", durationHours: 0.75, tss: 45, name: "Silový trénink" }], matched: [] },
    nutrition: {
      calorieTarget: 2650,
      macros: { protein_g: 150, carbs_g: 330, fat_g: 80 },
      calorieBreakdown: { activityAdjustment: 500, trainingCoverage: 0.7 },
      foodLog: { totals: { kcal: 1380.4, protein_g: 112, carbs_g: 205, fat_g: 37 } }
    }
  },
  fluids: { totalMl: 1800, target: { ml: 2500 } },
  weight: { records: [{ sample_time: day(-20) + "T06:00:00Z", value_numeric: 83 }, { sample_time: day(-1) + "T06:00:00Z", value_numeric: 82.4 }, { sample_time: day(-60) + "T06:00:00Z", value_numeric: 85 }] },
  coaches: { morningSummary: { headline: "Jak dnes začít", text: "Spánek 6 h 52 min.", recommendation: "Trénink dej naplno." } },
  profile: { age: 38, targetWeight: 80 }
};

test("Today combines readiness, sleep, strain, food and plan for the app", () => {
  const t = buildToday(input);
  assert.equal(t.status, "ok");
  assert.equal(t.date, DATE);
  assert.ok(t.readiness.score >= 0 && t.readiness.score <= 100, "readiness on the 0–100 scale");
  assert.equal(t.readiness.zone, t.readiness.score >= 67 ? "green" : t.readiness.score >= 34 ? "yellow" : "red");
  assert.equal(t.sleep.minutes, 412);
  assert.equal(t.sleep.start, "23:48");
  assert.equal(t.sleep.end, "07:02");
  assert.ok(t.sleep.index > 0 && t.sleep.index <= 100);
  assert.equal(t.hrv.value, 66);
  assert.ok(t.hrv.series.length >= 28 && t.hrv.series.at(-1).value === 66);
  assert.equal(t.restingHR.value, 47);
  assert.equal(t.restingHR.series.length, 14);
  assert.ok(t.strain.score > 0 && t.strain.score <= 21);
  assert.ok(t.strain.planned > 0 && t.strain.planned <= 21);
  assert.deepEqual(t.summary, { headline: "Jak dnes začít", text: "Spánek 6 h 52 min.", recommendation: "Trénink dej naplno." });
  assert.deepEqual(t.nutrition, {
    kcal: 1380, target: 2650, trainingBonus: 350,
    protein: { eaten: 112, target: 150 }, carbs: { eaten: 205, target: 330 }, fat: { eaten: 37, target: 80 },
    water: { ml: 1800, target: 2500 }
  });
  assert.equal(t.steps.goal, 10000);
  assert.equal(t.steps.week.length, 7);
  assert.equal(t.steps.today, wellness.at(-1).steps);
  assert.deepEqual(t.weight.series.map(p => p.value), [83, 82.4], "only the last 30 days");
  assert.equal(t.weight.goal, 80);
});

test("Today's plan lists workouts and tonight's bedtime in time order", () => {
  const t = buildToday(input);
  assert.deepEqual(t.plan.map(p => p.kind), ["workout", "bedtime"]);
  assert.equal(t.plan[0].time, "17:30");
  assert.equal(t.plan[0].detail, "45 min · 45 TSS");
  assert.equal(t.plan[0].done, false);
  assert.match(t.plan[1].time, /^\d{2}:\d{2}$/);
  assert.equal(t.tonight.wake, "07:02", "the usual wake time");
  assert.equal(t.tonight.bedtime, t.plan[1].time);
});

test("Today stays usable without data", () => {
  const t = buildToday({ date: DATE });
  assert.equal(t.readiness.score, null);
  assert.equal(t.sleep, null);
  assert.equal(t.hrv, null);
  assert.equal(t.weight, null);
  assert.deepEqual(t.plan, []);
  assert.equal(t.nutrition.kcal, null);
});

test("The server answers GET /app/api/today with buildToday", () => {
  const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname==='\/app\/api\/today'&&request\.method==='GET'/);
  assert.match(src, /buildToday\(\{date,hour:date===localToday\(\)\?localHour\(\):null,daily,health,fitness,sleep,fluids,weight,coaches,profile/);
});

test("Steps through the day: today's hours and the usual climb of the earlier days", () => {
  const hours = (morning, evening) => Array.from({ length: 24 }, (_, h) => (h === 8 ? morning : h === 18 ? evening : 0));
  const t = buildToday({ ...input, hour: 15, health: { wellness, stepsByHour: { [day(-2)]: hours(1000, 3000), [day(-1)]: hours(3000, 5000), [DATE]: hours(2500.4, 0) } } });
  assert.equal(t.steps.hour, 15);
  assert.equal(t.steps.hourly.length, 24);
  assert.equal(t.steps.hourly[8], 2500);
  assert.equal(t.steps.usual[7], 0);
  assert.equal(t.steps.usual[8], 2000, "average running total at 8:00");
  assert.equal(t.steps.usual[23], 6000, "average day total");
  const none = buildToday({ ...input, health: { wellness } });
  assert.equal(none.steps.hourly, null);
  assert.equal(none.steps.usual, null);
});

test("Google Health steps are counted per local hour", () => {
  const row = (start, count) => ({ data_type: "steps", start_time: start, end_time: start, value_numeric: count, payload_json: "{}" });
  // 06:30 UTC is 08:30 in Prague (summer time), 16:10 UTC is 18:10.
  const s = googleHealthSummary([row(DATE + "T06:30:00Z", 400), row(DATE + "T06:45:00Z", 100), row(DATE + "T16:10:00Z", 900), row(day(-20) + "T06:30:00Z", 50)], DATE);
  assert.equal(s.stepsByHour[DATE][8], 500);
  assert.equal(s.stepsByHour[DATE][18], 900);
  assert.equal(s.wellness.find(r => r.id === DATE).steps, 1400);
  assert.equal(s.stepsByHour[day(-20)], undefined, "only the last 15 days");
});
