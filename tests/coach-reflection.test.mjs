import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { reflectionSignals, rulesReflection, createReflection, listReflections, activityFromRow, dedupeActivities, pragueLocal, reflectionInput } from "../src/coach-reflection.js";

const DATE = "2026-10-03";
const day = i => new Date(Date.parse(DATE + "T12:00:00Z") - i * 86400000).toISOString().slice(0, 10);
const ride = (i, tss, time = "09:00") => ({ date: day(i), start: day(i) + "T" + time, kind: "ride", name: "Jízda", minutes: 120, tss, source: "intervals" });

// Rides most mornings for five weeks, a lighter last week, today a dog walk before a Z2 ride.
function scenario() {
  const activities = [];
  for (let i = 1; i <= 35; i++) if (i % 7 !== 0) activities.push(ride(i, i <= 7 ? 45 : 90));
  activities.push({ date: DATE, start: DATE + "T08:10", kind: "walk", name: "Procházka", minutes: 50, tss: null, source: "google" });
  activities.push(ride(0, 180, "09:30"));
  const wellness = Array.from({ length: 28 }, (_, i) => ({ id: day(i), ctl: 70, atl: 90, tsb: -20, hrv: 80, restingHR: 48 }));
  const sleep = Array.from({ length: 15 }, (_, i) => ({ date: day(i), durationMin: 450 }));
  return { date: DATE, feedback: { rpe: 7, notes: "těžké nohy" }, workout: { system: "endurance", sport: "ride", name: "Endurance · 240 min" }, activities, wellness, sleep, recentFeedback: [] };
}

test("Z2 ride with heavy legs: RPE, the unusual walk before it and long-term low form", () => {
  const signals = reflectionSignals(scenario()), ids = signals.map(s => s.id);
  assert.equal(ids[0], "rpe_high");
  assert.ok(ids.includes("unusual_before"));
  assert.match(signals.find(s => s.id === "unusual_before").text, /chůze 50 min v 08:10/);
  const form = signals.find(s => s.id === "tsb_chronic");
  assert.ok(form);
  assert.match(form.text, /lehčí poslední týden/);
  assert.ok(!ids.includes("sleep_short") && !ids.includes("hrv_low"));
});

test("a walk before rides that is part of the routine is not flagged", () => {
  const s = scenario();
  for (let i = 1; i <= 10; i++) s.activities.push({ date: day(i), start: day(i) + "T07:30", kind: "walk", name: "Pes", minutes: 30, tss: null, source: "google" });
  const signals = reflectionSignals(s);
  assert.ok(!signals.some(x => x.id === "unusual_before"));
  assert.ok(signals.some(x => x.id === "usual_before"));
});

test("short sleep, low HRV and a load spike are named against the athlete's own normal", () => {
  const s = scenario();
  s.sleep[0] = { date: DATE, durationMin: 330 };
  s.wellness[0] = { ...s.wellness[0], hrv: 60 };
  s.activities.push(ride(1, 250, "17:00"), ride(2, 250, "17:00"));
  const ids = reflectionSignals(s).map(x => x.id);
  for (const id of ["sleep_short", "hrv_low", "load_spike"]) assert.ok(ids.includes(id), id);
});

test("without AI the note quotes the athlete and lists the strongest reasons", () => {
  const s = scenario(), text = rulesReflection({ feedback: s.feedback, workout: s.workout, signals: reflectionSignals(s) });
  assert.match(text, /„těžké nohy“ \(RPE 7\)/);
  assert.match(text, /Před tréninkem byla chůze/);
});

test("activities from Intervals.icu and Google Health become one Prague timeline", () => {
  const google = activityFromRow({ start_time: "2026-10-03T06:10:00Z", end_time: "2026-10-03T07:00:00Z", payload_json: JSON.stringify({ exercise: { exerciseType: "WALKING", displayName: "Chůze", activeDuration: "3000s" } }) });
  assert.deepEqual([google.start, google.kind, google.minutes], ["2026-10-03T08:10", "walk", 50]);
  const intervals = activityFromRow({ start_time: "2026-10-03T09:30:00", payload_json: JSON.stringify({ type: "Ride", name: "Z2", moving_time: 14400, icu_training_load: 180 }) });
  const echo = { ...intervals, source: "google", tss: null, start: "2026-10-03T09:35" };
  assert.equal(dedupeActivities([echo, intervals, google]).length, 2);
  assert.equal(pragueLocal("2026-01-10T06:00:00Z"), "2026-01-10T07:00");
});

function env(key) {
  const db = createD1();
  return { DB: scopedDb(db, 7), USER_ID: 7, OPENAI_API_KEY: key };
}

test("the note is stored per user; AI writes it when a key is set", async () => {
  const s = scenario(), load = async () => ({ ...s, food: [] });
  const original = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, init) => { request = { url, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ model: "test-model", output: [{ content: [{ type: "output_text", text: "Dnešní těžké nohy nejspíš způsobila procházka se psy." }] }] }), { status: 200 }); };
  try {
    const e = env("sk-test");
    const r = await createReflection(e, { date: DATE, workoutId: "w1", rpe: 7, notes: "těžké nohy" }, load);
    assert.equal(r.source, "ai");
    assert.match(request.url, /openai\.com/);
    assert.match(request.body.input, /unusual_before/);
    assert.match(request.body.input, /těžké nohy/);
    const stored = await listReflections(e.DB, { date: DATE });
    assert.equal(stored[0].text, "Dnešní těžké nohy nejspíš způsobila procházka se psy.");
    assert.equal(stored[0].workoutId, "w1");
  } finally { globalThis.fetch = original; }
});

test("an AI failure or a missing key falls back to the rule-based note", async () => {
  const s = scenario(), load = async () => ({ ...s, food: [] });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "down" } }), { status: 500 });
  try {
    assert.equal((await createReflection(env("sk-test"), { date: DATE, rpe: 7 }, load)).source, "rules");
    assert.equal((await createReflection(env(undefined), { date: DATE, rpe: 7 }, load)).source, "rules");
  } finally { globalThis.fetch = original; }
});

test("the AI input is compact and keeps notes as data", () => {
  const s = scenario(), input = reflectionInput({ ...s, signals: reflectionSignals(s), food: [{ consumed_at: DATE + "T07:00:00", recipe_title: "Ovesná kaše", kcal: 450, carbs_g: 70 }], previous: [] });
  assert.equal(input.todayTimeline.map(a => a.kind).join(","), "walk,ride");
  assert.equal(input.todayFood[0].time, "07:00");
  assert.ok(input.last14Days.every(a => a.date < DATE));
});

test("RPE feedback starts the coach's note in the background and the dashboard shows it", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  assert.match(entry, /if\(reflect\)ctx\.waitUntil\(createReflection\(/);
  assert.match(entry, /url\.pathname==='\/app\/api\/coach\/reflections'/);
  assert.match(entry, /coachContext\(\{\.\.\.inputs,availabilityMinutes,manualReadiness,goal,preferences,capabilities,athleteFeedback,coachNotes,athleteState,/);
  assert.match(client, /cls:'coach',title:'Kouč'/);
  assert.match(client, /\$\('timelineCoach'\)\.onclick=\(\)=>openCoachSheet\(date\)/);
  assert.match(client, /awaitReflection\(body\.scheduledDate\)/);
});
