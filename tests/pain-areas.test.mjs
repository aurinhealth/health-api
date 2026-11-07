import test from "node:test";
import assert from "node:assert/strict";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { generateStrengthPlan, painfulExercises } from "../src/strength-generator.js";
import { sorePartsFor } from "../src/pain-words.js";

// Audit "Kouč jako skutečný trenér" 2026-11-07, points 4 and 5.
const date = "2026-10-08";
const day = offset => new Date(Date.parse(date + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
const wellness = [...Array.from({ length: 20 }, (_, i) => ({ id: day(-20 + i), ctl: 70, atl: 72, hrv: 80, restingHR: 48 })), { id: date, ctl: 70, atl: 68, tsb: 2, hrv: 80, restingHR: 48 }];
const coach = args => buildCyclingCoachV2({ date, week: { days: [{ date: day(-3), daily: { training: { completed: [{ date: day(-3), type: "Ride", name: "Endurance", tss: 60, durationHours: 1.25 }] } } }] }, fitness: { wellness }, health: { sleep: [{ type: "sleep", durationMin: 470, endTime: date + "T06:30:00" }] }, gym: { history: [] }, goal: { focus: "threshold" }, ...args });
const active = memories => ({ status: "active", memories });

test("a remembered pain holds back the intensity of the sports that load it, insisted or not", () => {
  assert.equal(coach({}).recommendation.session.kind, "threshold");
  const knee = coach({ athleteState: active(["Bolí mě levé koleno"]) });
  assert.equal(knee.recommendation.session.kind, "endurance");
  assert.ok(knee.recommendation.adaptations.some(a => /bolest kolena z toho, co si kouč pamatuje: bez intenzity/.test(a)));
  assert.equal(coach({ goal: { focus: "threshold", asked: true, chat: true, insisted: true }, athleteState: active(["Bolí mě koleno"]) }).recommendation.session.kind, "endurance");
  // A sore shoulder leaves the ride as it was; a healed knee, memory off or a knee without pain too.
  assert.equal(coach({ athleteState: active(["Bolí mě rameno"]) }).recommendation.session.kind, "threshold");
  assert.equal(coach({ athleteState: active(["Koleno už mě nebolí"]) }).recommendation.session.kind, "threshold");
  assert.equal(coach({ athleteState: { ...active(["Bolí mě koleno"]), memoryOff: true } }).recommendation.session.kind, "threshold");
  assert.equal(coach({ athleteState: active(["Koleno mám po operaci v pořádku"]) }).recommendation.session.kind, "threshold");
});

test("which sports each sore part holds back", () => {
  const sports = text => ["ride", "run", "swim"].filter(s => sorePartsFor(s, [text]).length);
  assert.deepEqual(sports("Bolí mě koleno"), ["ride", "run"]);
  assert.deepEqual(sports("Natažené lýtko"), ["run"]);
  assert.deepEqual(sports("Bolí mě kyčel"), ["ride", "run"]);
  assert.deepEqual(sports("Bolí mě záda"), ["run"]);
  assert.deepEqual(sports("Shoulder pain"), ["swim"]);
  assert.deepEqual(sports("Bolí mě krk"), ["swim"]);
  assert.deepEqual(sports("Bolí mě loket"), []);
  assert.deepEqual(sports("Bolí mě koleno, hip thrust dělám rád"), ["ride", "run"]);
});

test("the gym knows the ankle, hip, wrist and elbow and neck too", () => {
  const avoid = text => painfulExercises([text]).avoid;
  for (const name of ["Standing calf raise", "Box Jump", "Pogo Hops", "Tibialis Raise", "Walking Lunge"]) assert.ok(avoid("Bolí mě kotník").has(name), name);
  for (const name of ["Hip thrust", "Adduction machine", "Abduction machine", "Sumo Deadlift", "Banded Clamshell"]) assert.ok(avoid("Bolí mě tříslo").has(name), name);
  for (const name of ["DB curl", "Cable triceps extension", "Push-up", "DB wrist curl", "Dips"]) assert.ok(avoid("Bolí mě zápěstí").has(name), name);
  for (const name of ["DB shrug", "Cable upright row", "Barbell overhead press"]) assert.ok(avoid("Bolí mě krk").has(name), name);
  assert.ok(!avoid("Bolí mě kotník").has("Leg extension Prime"));
  assert.equal(avoid("Kotník už nebolí").size, 0);
});

test("a lower-body day with a sore knee, ankle and hip still fills its time", () => {
  const context = memories => ({ date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: [], plannedSessions: [] }, athleteState: { status: "active", memories } });
  const sore = ["Bolí mě koleno", "Bolí mě kotník", "Bolí mě kyčel"];
  const avoid = painfulExercises(sore).avoid;
  const plan = generateStrengthPlan(context(sore), { focusMuscles: ["quads", "hamstrings", "hips"], durationMinutes: 45 });
  const work = plan.rows.filter(r => r[0] === "WORK");
  assert.ok(work.length >= 3, work.map(r => r[1]).join());
  for (const r of work) assert.ok(!avoid.has(r[1]), r[1]);
  assert.match(plan.rationale, /kolena, kotníku a lýtka, kyčle/);
});

test("only quads with a sore knee: the coach says why instead of an empty session", () => {
  const context = { date, cycling: { recentActivities: [], plannedWorkouts: [], recentRideTss: 0 }, strength: { recentCompletedSets: [], plannedSessions: [] }, athleteState: { status: "active", memories: ["Bolí mě koleno"] } };
  assert.throws(() => generateStrengthPlan(context, { focusMuscles: ["quads"], durationMinutes: 45 }), /Partii Přední stehna teď vynechám kvůli bolesti kolena, kterou si kouč pamatuje/);
  const plan = generateStrengthPlan(context, { focusMuscles: ["quads", "hamstrings"], durationMinutes: 45 });
  assert.ok(plan.rows.some(r => r[0] === "WORK"));
  assert.deepEqual(plan.focusMuscles, ["hamstrings"]);
});
