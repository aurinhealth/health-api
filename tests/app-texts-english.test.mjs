// The native app's screens in English: the texts the server writes for Food,
// Today, Training and the calendar follow X-Interface-Language (lang.js).
// The fixtures are the ones of app-food, app-today and app-training tests with
// English names, so whatever Czech is left comes from the server.
import test from "node:test";
import assert from "node:assert/strict";
import { withLang } from "../src/lang.js";
import { buildFood } from "../src/app-food.js";
import { buildToday } from "../src/app-today.js";
import { buildTraining, eventPlan, formZone } from "../src/app-training.js";
import { buildCalendar } from "../src/app-calendar.js";

const CZECH = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
const DATE = "2026-10-08";
const day = n => new Date(Date.parse(DATE + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const en = fn => withLang("en", fn);

// ---- Food (tests/app-food.test.mjs) ----
const entry = (id, title, at, kcal, note = {}) => ({ id, recipe_title: title, consumed_at: at, kcal, protein_g: kcal / 20, carbs_g: kcal / 8, fat_g: kcal / 40, note: JSON.stringify(note) });
const foodInput = {
  date: DATE,
  hour: 15,
  daily: { nutrition: { calorieTarget: 2650, macros: { protein_g: 150, carbs_g: 330, fat_g: 80 }, calorieBreakdown: { activityAdjustment: 500, trainingCoverage: 0.7 } } },
  food: {
    entries: [
      entry(1, "Oatmeal with yogurt", DATE + "T07:30:00", 430, { mealType: "breakfast", enteredQuantity: 1, enteredUnit: "portion" }),
      entry(2, "Rice with chicken", DATE + "T10:30:00Z", 640, { mealType: "lunch", enteredQuantity: 1.5, enteredUnit: "portion" }),
      entry(3, "Banana", DATE + "T08:10:00", 105, { enteredQuantity: 2, enteredUnit: "piece" }),
      entry(5, "", DATE + "T21:00:00", 90, { mealType: "snack_late" })
    ],
    totals: { kcal: 1265, protein_g: 63, carbs_g: 158, fat_g: 32 }
  },
  fluids: { totalMl: 1800, target: { ml: 2500 }, entries: [{ id: 1, ml: 500, kind: "water" }] },
  slots: ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "snack_late"]
};

test("Food in English: the sentence, meal labels and amounts", () => {
  const f = en(() => buildFood(foodInput));
  assert.match(f.sentence, /^Training day: 350 kcal extra\. 1385 kcal left, afternoon snack around \d+ kcal\.$/);
  assert.deepEqual(f.meals.map(m => m.label), ["Breakfast", "Morning snack", "Lunch", "Afternoon snack", "Dinner", "Late snack"]);
  const all = f.meals.flatMap(m => m.entries);
  assert.equal(all.find(e => e.id === 1).amount, "1 serving");
  assert.equal(all.find(e => e.id === 2).amount, "1.5 servings");
  assert.equal(all.find(e => e.id === 3).amount, "2 pcs");
  assert.equal(all.find(e => e.id === 5).name, "Food");
  assert.doesNotMatch(JSON.stringify(f), CZECH);
});

test("Food sentences over and on target in English, Czech by default", () => {
  const over = { ...foodInput, food: { ...foodInput.food, totals: { kcal: 2900 } } };
  assert.equal(en(() => buildFood(over)).sentence, "Training day: 350 kcal extra. 250 kcal over today's target.");
  const onTarget = { ...foodInput, food: { ...foodInput.food, totals: { kcal: 2600 } } };
  assert.equal(en(() => buildFood(onTarget)).sentence, "Training day: 350 kcal extra. Today's target is reached.");
  const evening = { ...foodInput, hour: 23 };
  assert.equal(en(() => buildFood(evening)).sentence, "Training day: 350 kcal extra. 1385 kcal left.");
  assert.equal(buildFood(evening).sentence, "Tréninkový den: o 350 kcal víc. Zbývá 1385 kcal.");
  const cs = buildFood(foodInput);
  assert.equal(cs.meals[0].label, "Snídaně");
  assert.equal(cs.meals.flatMap(m => m.entries).find(e => e.id === 3).amount, "2 ks");
});

// ---- Today (tests/app-today.test.mjs) ----
const wellness = Array.from({ length: 40 }, (_, i) => {
  const offset = i - 39, today = offset === 0;
  return { id: day(offset), hrv: today ? 66 : 56 + (i % 5), restingHR: today ? 47 : 50 + (i % 3), steps: 8000 + i * 10, hrZoneMinutes: { light: 40, moderate: today ? 10 : 20, vigorous: 5, peak: 0 } };
});
const sessions = Array.from({ length: 20 }, (_, i) => {
  const date = day(i - 19);
  return { date, startTime: day(i - 20) + "T21:48:00Z", endTime: date + "T05:02:00Z", durationMin: 412, timeInBedMin: 434, stages: { DEEP: 80, REM: 90, LIGHT: 230, AWAKE: 12 }, latencyMin: 9, wasoMin: 13 };
});
const todayInput = {
  date: DATE,
  health: { wellness },
  sleep: { sessions },
  daily: {
    training: { planned: [{ start: DATE + "T17:30:00", durationHours: 0.75, tss: 45 }], matched: [] },
    nutrition: { calorieTarget: 2650, macros: { protein_g: 150, carbs_g: 330, fat_g: 80 }, calorieBreakdown: { activityAdjustment: 500, trainingCoverage: 0.7 }, foodLog: { totals: { kcal: 1380, protein_g: 112, carbs_g: 205, fat_g: 37 } } }
  },
  fluids: { totalMl: 1800, target: { ml: 2500 } },
  weight: { records: [{ sample_time: day(-1) + "T06:00:00Z", value_numeric: 82.4 }] },
  coaches: { morningSummary: { headline: "How to start today", text: "Slept 6 h 52 min.", recommendation: "Go all in." } },
  profile: { age: 38, targetWeight: 80 }
};

test("Today in English: the plan's workout and bedtime", () => {
  const t = en(() => buildToday(todayInput));
  const [workout, bed] = t.plan;
  assert.equal(workout.title, "Workout");
  assert.equal(bed.title, "Bedtime");
  assert.match(bed.detail, /^sleep need \d+ h \d{2} min$/);
  assert.doesNotMatch(JSON.stringify(t), CZECH);
  const cs = buildToday(todayInput);
  assert.equal(cs.plan[1].title, "Do postele");
  assert.match(cs.plan[1].detail, /^potřeba spánku \d+ h \d{2} min$/);
});

// ---- Training (tests/app-training.test.mjs) ----
const google = [
  { id: day(-3), hrZoneMinutes: { light: 60, moderate: 30, vigorous: 10, peak: 0 }, activeCalories: 500, vo2max: 48 },
  { id: day(-2), hrZoneMinutes: { light: 40, moderate: 10, vigorous: 0, peak: 0 }, activeCalories: 300 },
  { id: day(-1), hrZoneMinutes: { light: 50, moderate: 20, vigorous: 5, peak: 2 }, activeCalories: 400, vo2max: 49.2 },
  { id: DATE, hrZoneMinutes: { light: 30, moderate: 5, vigorous: 0, peak: 0 }, activeCalories: 180 }
];
const intervals = Array.from({ length: 100 }, (_, i) => ({ id: day(i - 99), ctl: 40 + i * 0.2, atl: 45 + i * 0.25, ctlLoad: i % 2 ? 60 : 0 }));
const ride = { name: "Sweet spot 3x12", type: "VirtualRide", start: DATE + "T15:30:00Z", durationHours: 1.25, tss: 85, description: "Warm up 15 min\n3x12 min 90 %\nCool down" };
const days = Array.from({ length: 11 }, (_, i) => {
  const d = day(i - 3);
  const training = d === day(-3) ? { planned: [{ tss: 50 }], completed: [{ type: "Run", durationHours: 0.8, tss: 52 }], matched: [] }
    : d === day(-1) ? { planned: [], completed: [{ type: "Ride", durationHours: 1, tss: 60 }] }
    : d === DATE ? { planned: [ride], completed: [], matched: [] }
    : d === day(2) ? { planned: [{ type: "Run", tss: 110, durationHours: 1.6 }], completed: [] }
    : d === day(1) ? { planned: [{ tss: 40 }], completed: [] }
    : {};
  return { date: d, daily: { training } };
});
const trainingInput = {
  date: DATE,
  days,
  health: { wellness: google },
  fitness: { wellness: intervals },
  insights: { cardioFocus: { points: 900, percent: { low: 68, high: 26, anaerobic: 6 }, weeks: [{ low: 100, high: 40, anaerobic: 5 }] } },
  coaches: { coaches: [{ id: "cycling", actions: ["Hold the prescribed work blocks and spin easy between them."] }] },
  profile: { eventName: "Prague Half Marathon", eventDate: "2026-11-01" },
  gym: { [day(3)]: { exercises: ["Squat", "Bench press"] } }
};

test("Training in English: phases, form, strain band and default titles", () => {
  const t = en(() => buildTraining(trainingInput));
  assert.deepEqual(t.event.phases.map(p => [p.key, p.label]), [["base", "Base"], ["build", "Build"], ["taper", "Taper"]]);
  assert.equal(t.event.phase, "build", "ids stay as they are");
  assert.equal(t.form.zone, "grey");
  assert.equal(t.form.label, "maintaining");
  assert.match(t.form.text, /^Fatigue and fitness are balanced/);
  assert.ok(["light", "moderate", "high", "all out"].includes(t.strain.band), t.strain.band);
  assert.ok(t.sessions.some(s => s.title === "Workout"), "an unnamed plan");
  assert.ok(t.sessions.some(s => s.title === "Gym"), "an unnamed gym plan");
  assert.doesNotMatch(JSON.stringify(t), CZECH);
  const cs = buildTraining(trainingInput);
  assert.equal(cs.form.label, "udržování");
  assert.deepEqual(cs.event.phases.map(p => p.label), ["Základ", "Rozvoj", "Ladění"]);
});

test("Every form zone and phase has English text", () => en(() => {
  const zones = [30, 10, 0, -20, -40].map(formZone);
  assert.deepEqual(zones.map(z => z.key), ["transition", "fresh", "grey", "optimal", "risk"]);
  assert.deepEqual(zones.map(z => z.label), ["rested", "fresh", "maintaining", "building", "high risk"]);
  for (const z of zones) assert.doesNotMatch(z.text, CZECH, z.text);
  assert.match(zones[4].text, /overreaching/);
  assert.deepEqual(eventPlan({ name: "A", date: "2026-10-12" }, DATE).phases.map(p => p.label), ["Base", "Build", "Taper"]);
}));

test("Calendar titles of unnamed activities in English", () => {
  const row = (data_type, source_family, external_id, start_time, end_time, payload) => ({ data_type, source_family, external_id, start_time, end_time, value_numeric: null, payload_json: JSON.stringify(payload) });
  const input = {
    start: "2026-10-05", end: "2026-10-12", today: "2026-10-09",
    activities: [row("activity", "intervals", "activity:i101", "2026-10-07T07:00:00", "2026-10-07T08:30:00", { id: "i101", type: "Ride", moving_time: 5400, start_date_local: "2026-10-07T07:00:00" })],
    google: [row("exercise", "google-wearables", "g2", "2026-10-07T15:00:00Z", "2026-10-07T15:35:00Z", { exercise: { exerciseType: "WALKING", activeDuration: "2100s" } })],
    planned: [],
    gym: { "2026-10-11": { exercises: ["Bench press"] } }
  };
  const c = en(() => buildCalendar(input));
  const titles = c.days.flatMap(d => d.activities.map(a => a.title));
  assert.deepEqual(titles, ["Ride", "Walk", "Gym"]);
  assert.doesNotMatch(JSON.stringify(c), CZECH);
  assert.deepEqual(buildCalendar(input).days.flatMap(d => d.activities.map(a => a.title)), ["Kolo", "Chůze", "Posilovna"]);
});
