import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildToday, activeMinutes, withHeartRateLoad } from "../src/app-today.js";
import { googleHealthSummary } from "../src/google-dashboard.js";
import { serverSource } from "./helpers/server-source.mjs";

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
  const t = buildToday({ ...input, hour: 12 });
  assert.deepEqual(t.plan.map(p => p.kind), ["workout", "bedtime"]);
  assert.equal(t.plan[0].time, null, "a planned session has no clock: it comes after the last record");
  assert.equal(t.plan[0].status, "planned");
  assert.equal(t.plan[0].detail, "45 min · 45 TSS");
  assert.equal(t.plan[0].done, false);
  assert.match(t.plan[1].time, /^\d{2}:\d{2}$/);
  assert.equal(t.tonight.wake, "07:02", "the usual wake time");
  assert.equal(t.tonight.bedtime, t.plan[1].time);
  assert.equal(t.plan[1].end, t.tonight.wake, "the night ahead ends at the planned wake time");
});

test("Tonight's own length and wake time from Spánek move the bedtime row on Today", () => {
  const plain = buildToday({ ...input, hour: 12 });
  const t = buildToday({ ...input, hour: 12, profile: { ...(input.profile || {}), sleepTonight: { date: DATE, minutes: 420, wake: "06:00" } } });
  const row = t.plan.find(p => p.kind === "bedtime");
  assert.equal(t.tonight.wake, "06:00");
  assert.equal(t.tonight.need, 420);
  assert.equal(row.time, t.tonight.bedtime);
  assert.notEqual(row.time, plain.tonight.bedtime);
  assert.equal(row.detail, "spánek 7 h 00 min");
  assert.equal(row.end, "06:00", "the dashed night ends at the chosen wake time");
});

test("Today's plan shows what was done at its time, then the plan, a gym session outside the plan too", () => {
  const training = {
    planned: [{ id: "planned:1", start: DATE + "T17:30:00", durationHours: 1, tss: 60, name: "Endurance", type: "Ride" }],
    completed: [{ id: "activity:i1", source: "intervals", start: DATE + "T07:10:00", durationHours: 0, name: null, type: null }],
    matched: []
  };
  const t = buildToday({ ...input, hour: 12, daily: { ...input.daily, training }, gym: { name: "Push", exercises: ["Bench"], logged: 3 } });
  const workouts = t.plan.filter(p => p.kind === "workout");
  assert.deepEqual(workouts.map(p => [p.status, p.time]), [["done", "07:10"], ["done", null], ["planned", null]]);
  assert.equal(workouts[0].session.kind, "activity");
  assert.ok(workouts.some(p => p.session.kind === "gym" && p.done), "the gym session saved in the app");
  assert.equal(workouts.find(p => p.status === "planned").title, "Endurance");
  // Viewing a past day: what was not done is missed.
  const past = buildToday({ ...input, date: DATE, hour: null, daily: { ...input.daily, training: { planned: training.planned, completed: [], matched: [] } } });
  assert.equal(past.plan.find(p => p.kind === "workout").status, "missed");
});

test("Den: a done ride carries its distance, power and what it added to the strain", () => {
  const training = {
    planned: [],
    completed: [
      { id: "activity:i2", source: "intervals", start: DATE + "T17:30:00", durationHours: 1.2, tss: 85, name: "Kolo · tempo", type: "Ride", payload: { distance: 34600, icu_average_watts: 198.4 } },
      { id: "watch:1", family: "apple-health", start: DATE + "T07:00:00", durationHours: 0.5, name: "Běh", type: "Run", payload: { exercise: { metricsSummary: { distanceMillimeters: 5200000, averagePowerWatts: 0 } } } }
    ],
    matched: []
  };
  const t = buildToday({ ...input, hour: 20, daily: { ...input.daily, training } });
  const [run, ride] = t.plan.filter(p => p.kind === "workout");
  assert.equal(ride.session.distanceKm, 34.6);
  assert.equal(ride.session.watts, 198);
  assert.ok(ride.strain > 0 && ride.strain < 21);
  assert.equal(run.session.distanceKm, 5.2);
  assert.equal(run.session.watts, undefined, "no power from the watch");
  assert.equal(run.strain, undefined, "no TSS, no estimate");
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

test("An hourly bucket that ends at midnight counts on the day it started", async () => {
  const { appleRow } = await import("../src/apple-health.js");
  // Apple Health's 23:00–24:00 steps bucket on 10 October (Prague, UTC+2) ends exactly at midnight.
  const r = appleRow({ type: "steps", id: "s1", value: 500, start: "2026-10-10T23:00:00+02:00", end: "2026-10-11T00:00:00+02:00" });
  const s = googleHealthSummary([{ ...r, source_family: "apple-health", payload_json: JSON.stringify(r.payload) }], "2026-10-11");
  assert.equal(s.wellness.find(x => x.id === "2026-10-10").steps, 500);
  assert.equal(s.today.steps, undefined, "nothing on 11 October");
  assert.equal(s.stepsByHour["2026-10-10"][23], 500);
  assert.equal(s.coverage.steps, "2026-10-10");
});

test("Google's light zone (every minute below moderate) does not count towards strain", () => {
  // Google Health sends one row per minute; LIGHT covers sleep and sitting too.
  const minute = (source_family, zone, i) => { const t = Date.parse(DATE + "T00:00:00Z") + i * 60000; return { source_family, zone, start_time: new Date(t).toISOString(), end_time: new Date(t + 60000).toISOString() }; };
  const rows = [...Array.from({ length: 222 }, (_, i) => minute("google-wearables", "LIGHT", i)), ...Array.from({ length: 10 }, (_, i) => minute("google-wearables", "MODERATE", 600 + i)), minute("apple-health", "LIGHT", 900)];
  const s = googleHealthSummary([], DATE, rows);
  assert.deepEqual(s.wellness.find(r => r.id === DATE).hrZoneMinutes, { light: 1, moderate: 10, vigorous: 0, peak: 0 });
});

test("Today says how the HRV was measured when the source does", () => {
  const sdnn = wellness.map(r => ({ ...r, hrvSource: "apple-health:sdnn" }));
  assert.equal(buildToday({ ...input, health: { wellness: sdnn } }).hrv.metric, "sdnn");
  assert.equal(buildToday(input).hrv.metric, null);
});

test("Before tonight's sleep has synced, Today stays empty and the coming night is the current one", () => {
  // 00:54: the night that ends this morning is not over yet, Google has no HRV for today.
  const early = {
    ...input,
    hour: 0,
    sleep: { sessions: sessions.filter(s => s.date < DATE) },
    health: { wellness: wellness.map(r => (r.id === DATE ? { id: DATE, steps: 37 } : r)) }
  };
  const t = buildToday(early);
  assert.equal(t.readiness.score, null);
  assert.equal(t.sleep, null);
  assert.equal(t.hrv, null);
  // The coming night is the one that ends this morning.
  assert.equal(t.tonight.wake, "07:02");
  // The day before is still there with ?date=.
  const before = buildToday({ ...early, date: day(-1), hour: null });
  assert.ok(before.readiness.score > 0);
  assert.equal(before.sleep.minutes, 412);
});

test("Today's weather at the week plan's place with the indoor/outdoor advice", () => {
  const location = { name: "Brno", latitude: 49.1951, longitude: 16.6068, source: "search" };
  const sunny = buildToday({ ...input, location, forecast: { code: 1, max: 18.4, min: 7.2, wind: 12, rain: 0, rainProb: 10 } });
  assert.deepEqual(sunny.weather, {
    place: "Brno", code: 1, max: 18, min: 7, wind: 12, rain: 0, rainProb: 10, hours: null,
    outdoor: { environment: "outdoor", reason: "Podle dostupné předpovědi." },
    outdoorRun: { environment: "outdoor", reason: "Podle dostupné předpovědi." }
  });
  const wet = buildToday({ ...input, location, forecast: { code: 63, max: 11, min: 6, wind: 20, rain: 6.4, rainProb: 90 } });
  assert.equal(wet.weather.outdoor.environment, "indoor");
  assert.match(wet.weather.outdoor.reason, /nepřeje/);
  assert.equal(wet.weather.rain, 6.4);
  const hourly = buildToday({ ...input, location, forecast: { code: 1, max: 18, min: 7, hours: [{ hour: 8, temp: 9, code: 3 }] } });
  assert.deepEqual(hourly.weather.hours, [{ hour: 8, temp: 9, code: 3 }]);
  // A place without a forecast: the season decides, the numbers stay empty.
  const offline = buildToday({ ...input, location, forecast: null });
  assert.equal(offline.weather.place, "Brno");
  assert.equal(offline.weather.max, null);
  assert.match(offline.weather.outdoor.reason, /není dostupná/);
  // No place chosen: no weather, the app offers to set it.
  assert.equal(buildToday(input).weather, null);
  const src = serverSource();
  assert.match(src, /location:place\.location,forecast:place\.forecast/);
  assert.match(src, /cached\(env,ctx,'weather:'/);
});

test('active minutes count vigorous minutes twice, today and since Monday', () => {
  const rows = [
    { id: '2026-10-05', hrZoneMinutes: { light: 90, moderate: 20, vigorous: 10, peak: 0 } },
    { id: '2026-10-04', hrZoneMinutes: { light: 0, moderate: 60, vigorous: 0, peak: 0 } },
    { id: '2026-10-07', hrZoneMinutes: { light: 10, moderate: 15, vigorous: 2, peak: 1 } }
  ];
  assert.deepEqual(activeMinutes(rows, '2026-10-07'), { today: 21, week: 61, target: 150 });
  assert.equal(activeMinutes([{ id: '2026-10-07', steps: 100 }], '2026-10-07'), null);
});

test("Today shows today's HRV even when its source has no baseline yet", () => {
  // Today's value from a new source (Apple Health), every earlier day from Google.
  const fresh = wellness.map(r => r.id === DATE ? { ...r, hrvSource: "apple-health" } : { ...r, hrvSource: "google-wearables" });
  const t = buildToday({ ...input, health: { wellness: fresh } });
  assert.equal(t.hrv.value, 66);
  assert.equal(t.hrv.baseline, null);
});

test("a day's Apple Health HRV wins over Google's copy of it", () => {
  const hrvRow = (source, ms) => ({ data_type: "daily-heart-rate-variability", source_family: source, sample_time: DATE + "T06:00:00Z", value_numeric: ms, payload_json: "{}" });
  const s = googleHealthSummary([hrvRow("apple-health", 48), hrvRow("google-wearables", 61)], DATE);
  assert.equal(s.today.hrv, 48);
  assert.equal(s.today.hrvSource, "apple-health");
});

test("the day's strain target follows readiness, the plan, sleep debt and the zone", async () => {
  const { strainTarget } = await import("../src/app-today.js");
  assert.deepEqual(strainTarget({ readiness: 72, zone: "green" }), { low: 11.1, high: 14.1 });
  assert.deepEqual(strainTarget({ readiness: 72, zone: "green", debt: 30 }), { low: 10.6, high: 13.6 });
  assert.deepEqual(strainTarget({ readiness: 72, zone: "green", planned: 8.6 }), { low: 9.1, high: 12.1 });
  assert.ok(strainTarget({ readiness: 50, zone: "yellow", planned: 18 }).high <= 13.5);
  assert.ok(strainTarget({ readiness: 25, zone: "red" }).high <= 7.5);
  assert.deepEqual(strainTarget({ readiness: 72, zone: "green", rest: true }), { low: 5, high: 8 });
  const t = buildToday(input);
  assert.ok(t.strain.target.low < t.strain.target.high);
  assert.equal(t.strain.target.readiness, t.readiness.score);
  assert.equal(t.strain.target.plan, "Silový trénink");
});

test("the week strip: Monday to Sunday of the day's week, the day's own zone, no zone after it", async () => {
  const { readinessWeek } = await import("../src/app-today.js");
  const week = readinessWeek({ date: "2026-10-14", readiness: { score: 72, zone: "green", rows: [] } });
  assert.deepEqual(week.map(d => d.date), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.equal(week[2].zone, "green");
  assert.equal(week[0].zone, null, "no readiness without data");
  assert.ok(week.slice(3).every(d => d.zone === null));
  assert.equal(readinessWeek({ date: "2026-10-18", readiness: { score: null, zone: null, rows: [] } })[0].date, "2026-10-12", "Sunday belongs to its Monday");
});

test("a watch gym session without TSS gets one from its heart rate, so the strain detail can split the day", () => {
  const wellness = Array.from({ length: 20 }, (_, i) => ({ id: `2026-10-${String(i + 1).padStart(2, "0")}`, restingHR: 56 }));
  const training = { completed: [
    { id: "gym", type: "WeightTraining", averageHeartRate: 115, durationHours: 1.1 },
    { id: "ride", type: "Ride", tss: 40 },
    { id: "nohr", type: "WeightTraining", durationHours: 1 }
  ] };
  const out = withHeartRateLoad(training, wellness, { age: 35 }, "2026-10-17").completed;
  assert.ok(out[0].tss > 0 && out[0].tssFromHeartRate);
  assert.equal(out[1].tss, 40);
  assert.equal(out[2].tss, undefined);
  // Without a resting or max heart rate nothing is guessed.
  assert.equal(withHeartRateLoad(training, [], {}, "2026-10-17"), training);
});

test("the day's strain counts the training and the steps when the zones saw little (Petr, 2026-10-18)", async () => {
  const { dayStrainParts } = await import("../src/recovery-model.js");
  // 21 light minutes from the watch, a gym hour (17 TSS), a 25 min run (8 TSS), 11,616 steps.
  const parts = dayStrainParts({ zoneMinutes: { light: 21 }, steps: 11616, sessions: [{ tss: 17, sport: "strength", minutes: 63 }, { tss: 8, sport: "run", minutes: 25 }] });
  assert.ok(parts.score > 6 && parts.score < 9, String(parts.score));
  assert.ok(parts.movement > 2, String(parts.movement));
  assert.equal(Math.round((parts.training + parts.movement) * 10) / 10, parts.score);
  // A hard day the zones measured keeps its zone strain.
  const hard = dayStrainParts({ zoneMinutes: { moderate: 60, vigorous: 30 }, steps: 6000, sessions: [{ tss: 40, sport: "ride", minutes: 90 }] });
  assert.equal(hard.score, 15.5);
  // Nothing measured: no score.
  assert.equal(dayStrainParts({}).score, null);
});
