import test from "node:test";
import assert from "node:assert/strict";
import {
  CYCLING_WORKOUTS, SYSTEMS, rankWorkoutCandidates, defaultCapabilities, calculateCapabilityUpdate, buildIntervalsEvent,
  parseWorkoutSearchFilters, scheduleWorkoutInIntervals,
  searchWorkoutLibrary, generateWorkout, recordWorkoutFeedback, getCapabilities, getScheduledWorkouts
} from "../src/workout-library.js";
import { renderForEnvironment, intervalsText, step, rep, sec } from "../src/workout-model.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

const byId = id => CYCLING_WORKOUTS.find(w => w.id === id);

test("the catalog is large and genuinely varied across every energy system", () => {
  assert.ok(CYCLING_WORKOUTS.length >= 600, String(CYCLING_WORKOUTS.length));
  assert.equal(new Set(CYCLING_WORKOUTS.map(w => w.id)).size, CYCLING_WORKOUTS.length);
  const templates = new Set(CYCLING_WORKOUTS.map(w => w.family + ":" + w.level));
  assert.ok(templates.size >= 120, String(templates.size));
  for (const system of SYSTEMS.filter(s => s !== "recovery")) {
    const families = new Set(CYCLING_WORKOUTS.filter(w => w.primary_system === system).map(w => w.family));
    assert.ok(families.size >= 3, system + " " + families.size);
  }
  for (const w of CYCLING_WORKOUTS) {
    assert.ok(w.difficulty >= 1 && w.difficulty <= 10, w.id);
    assert.ok(w.target_load > 0 && w.target_load < 450, w.id);
    assert.match(w.intervals_description, /\d+%/, w.id);
  }
});

test("research protocols carry their citation and public references their source", () => {
  const research = CYCLING_WORKOUTS.filter(w => w.source_kind === "research");
  assert.ok(research.length >= 5);
  assert.ok(research.every(w => /\d{4}/.test(w.citation || "")));
  assert.ok(CYCLING_WORKOUTS.filter(w => w.source_kind === "public_reference").every(w => /^https:\/\//.test(w.source_url)));
  assert.equal(CYCLING_WORKOUTS.some(w => /trainerroad|xert|zwift/i.test(w.source_name + " " + (w.source_url || ""))), false);
});

test("difficulty rises along each progression ladder", () => {
  for (const family of ["thr", "ss", "vo2", "tempo", "ana-1min", "sprint-10"]) {
    const at90 = CYCLING_WORKOUTS.filter(w => w.family === family && w.duration_minutes === 90).sort((a, b) => a.level - b.level);
    assert.ok(at90.length >= 3, family);
    assert.ok(at90.at(-1).difficulty > at90[0].difficulty + 1, family);
  }
});

test("90 minute VO2 search ranks a close duration and capability match first", () => {
  const caps = defaultCapabilities(); caps.vo2max.level = 5.8;
  const rows = rankWorkoutCandidates(CYCLING_WORKOUTS, { system: "vo2max", durationMinutes: 90, durationTolerance: 15 }, { readiness: "green", hardBikeDaysRolling7d: 0, phase: "build" }, caps);
  assert.ok(rows.length > 10);
  assert.equal(rows[0].primary_system, "vo2max");
  assert.ok(Math.abs(rows[0].duration_minutes - 90) <= 15);
  assert.ok(Math.abs(rows[0].difficulty - 6.5) <= 1.5);
});

test("long searches include structured rides", () => {
  for (const [system, minutes] of [["endurance", 240], ["tempo", 240], ["sweet_spot", 240], ["threshold", 180], ["vo2max", 180]]) {
    const rows = rankWorkoutCandidates(CYCLING_WORKOUTS, { system, durationMinutes: minutes, durationTolerance: 15 });
    assert.ok(rows.length > 0, system);
    assert.equal(rows[0].duration_minutes, minutes, system);
    assert.ok(JSON.parse(rows[0].structure_json).length >= 3, system);
  }
});

test("red readiness strongly penalizes hard sessions", () => {
  const caps = defaultCapabilities(); caps.vo2max.level = 7;
  const green = rankWorkoutCandidates(CYCLING_WORKOUTS, { system: "vo2max", durationMinutes: 90 }, { readiness: "green" }, caps)[0];
  const red = rankWorkoutCandidates(CYCLING_WORKOUTS, { system: "vo2max", durationMinutes: 90 }, { readiness: "red" }, caps)[0];
  assert.ok(green.suitability > red.suitability);
});

test("duration tolerance and maximum difficulty are hard filters", () => {
  const rows = rankWorkoutCandidates(CYCLING_WORKOUTS, { system: "vo2max", durationMinutes: 90, durationTolerance: 5, maxDifficulty: 6 }, { readiness: "green" });
  assert.ok(rows.length > 0);
  assert.ok(rows.every(w => Math.abs(w.duration_minutes - 90) <= 5 && w.difficulty <= 6));
});

test("empty optional search fields do not become zero", () => {
  const filters = parseWorkoutSearchFilters(new URLSearchParams("system=vo2max&load=&maxDifficulty=&duration=&environment=outdoor"));
  assert.equal(filters.targetLoad, undefined);
  assert.equal(filters.maxDifficulty, undefined);
  assert.equal(filters.durationMinutes, undefined);
  assert.equal(filters.environment, "outdoor");
  assert.equal(filters.sport, "ride");
});

test("successful feedback progresses capability and failed execution reduces it", () => {
  const w = CYCLING_WORKOUTS.find(x => x.primary_system === "threshold" && x.difficulty > 5);
  const current = { level: 5, confidence: .4, attempts: 4, successes: 3 };
  const success = calculateCapabilityUpdate(current, w, { completedPercent: 100, rpe: 7.5, survey: "completed" });
  const failed = calculateCapabilityUpdate(current, w, { completedPercent: 60, rpe: 10, survey: "failed" });
  assert.ok(success.level > current.level);
  assert.ok(failed.level < current.level);
  assert.equal(success.attempts, 5);
});

test("automatic activity matching does not claim interval completion", () => {
  const current = { level: 5, confidence: .4, attempts: 4, successes: 3 };
  const result = calculateCapabilityUpdate(current, { difficulty: 6 }, { completedPercent: 100, survey: "auto_completed" });
  assert.equal(result.level, 5);
  assert.equal(result.attempts, 4);
});

test("indoor keeps exact targets; outdoor uses ranges, free sprints and a longer warm-up", () => {
  const sprint = byId("pfd-sprint-10-8-75");
  const indoor = renderForEnvironment(sprint, "indoor"), outdoor = renderForEnvironment(sprint, "outdoor");
  assert.equal(indoor.intervals_type, "VirtualRide");
  assert.equal(outdoor.intervals_type, "Ride");
  assert.match(indoor.intervals_description, /- 10s 200%/);
  assert.match(outdoor.intervals_description, /- 10s 200% max/);
  const threshold = renderForEnvironment(byId("pfd-thr-3x12-90"), "outdoor");
  assert.match(threshold.intervals_description, /12m 95-101%/);
  assert.equal(JSON.parse(threshold.structure_json)[0].durationMinutes, 15);
  assert.ok(outdoor.environment_notes.length > 0);
  // Trainer-only protocols stay indoor.
  assert.equal(renderForEnvironment(byId("research-tabata"), "outdoor").environment, "indoor");
  assert.equal(rankWorkoutCandidates(CYCLING_WORKOUTS, { environment: "outdoor" }).some(w => w.id === "research-tabata"), false);
});

test("Intervals text expresses repeats, short steps and cadence", () => {
  const text = intervalsText([step(10, 55, "90"), rep(3, [step(sec(30), 120, "100-110"), step(sec(15), 55)]), step(10, 50)], { sport: "ride" });
  assert.match(text, /^Warmup\n- 10m 55% 90rpm/);
  assert.match(text, /3x\n- 30s 120% 100-110rpm\n- 15s 55%/);
  assert.match(text, /Cooldown\n- 10m 50%$/);
});

test("Intervals event is deterministic per environment", () => {
  const w = byId("pfd-vo2-5x4x112-90");
  const indoor = buildIntervalsEvent(w, "2026-10-03"), outdoor = buildIntervalsEvent(w, "2026-10-03", "outdoor");
  assert.equal(indoor.external_id, "pfd-library:pfd-vo2-5x4x112-90:2026-10-03");
  assert.equal(outdoor.external_id, "pfd-library:pfd-vo2-5x4x112-90:2026-10-03:outdoor");
  assert.equal(indoor.category, "WORKOUT");
  assert.equal(indoor.type, "VirtualRide");
  assert.equal(outdoor.type, "Ride");
  assert.match(indoor.description, /5x/);
  assert.ok(indoor.load_target > 0);
});

// Real SQL through the user-scoped facade.
function users() { const raw = createD1(); raw.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY,user_id INTEGER,source_family TEXT,data_type TEXT,external_id TEXT,sample_time TEXT,start_time TEXT,end_time TEXT,payload_json TEXT,updated_at TEXT,UNIQUE(user_id,source_family,data_type,external_id))"); return { raw, alice: scopedDb(raw, 1), bob: scopedDb(raw, 2) }; }
async function withIntervals(fn) {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify([{ id: 100 + calls, category: "WORKOUT" }]), { status: 200, headers: { "Content-Type": "application/json" } }); };
  try { await fn(() => calls); } finally { globalThis.fetch = original; }
}

test("scheduling is idempotent per user and separate between users", async () => {
  const { alice, bob } = users(), args = { workoutId: "pfd-vo2-5x4x112-90", date: "2026-10-03", confirm: true };
  await withIntervals(async calls => {
    assert.equal((await scheduleWorkoutInIntervals({ INTERVALS_API_KEY: "a" }, alice, args)).status, "ok");
    assert.equal((await scheduleWorkoutInIntervals({ INTERVALS_API_KEY: "a" }, alice, args)).status, "already_scheduled");
    assert.equal((await scheduleWorkoutInIntervals({ INTERVALS_API_KEY: "a" }, alice, { ...args, environment: "outdoor" })).status, "ok");
    assert.equal((await scheduleWorkoutInIntervals({ INTERVALS_API_KEY: "b" }, bob, args)).status, "ok");
    assert.equal(calls(), 3);
  });
  assert.equal((await getScheduledWorkouts(alice)).length, 2);
  assert.equal((await getScheduledWorkouts(bob)).length, 1);
  assert.equal((await scheduleWorkoutInIntervals({}, alice, {...args,date:'2026-10-04'})).sync.status,'not_connected');
});

test("feedback changes only the reviewer's capability", async () => {
  const { alice, bob } = users();
  const result = await recordWorkoutFeedback(alice, { workoutId: "pfd-thr-3x12-90", scheduledDate: "2026-10-01", completedPercent: 100, rpe: 6 });
  assert.ok(result.after > result.before);
  assert.equal((await getCapabilities(alice)).threshold.level, result.after);
  assert.equal((await getCapabilities(bob)).threshold.level, 3);
  await assert.rejects(recordWorkoutFeedback(alice, { workoutId: "pfd-thr-3x12-90", scheduledDate: "2026-10-01", rpe: 6 }), /už má uložené/);
});

test("search renders the chosen environment and reports the catalog size", async () => {
  const { alice } = users();
  const result = await searchWorkoutLibrary(alice, { system: "threshold", durationMinutes: 90, environment: "outdoor", limit: 5 }, { readiness: "green" });
  assert.equal(result.environment, "outdoor");
  assert.ok(result.catalogSize >= 600);
  assert.ok(result.workouts.every(w => w.intervals_type === "Ride" && w.primary_system === "threshold" || w.secondary_system === "threshold"));
});

const coach = (kind, readiness = "green", extra = {}) => ({ readiness: { status: readiness }, load: { hardBikeDaysRolling7d: 0 }, constraints: { phase: "build" }, recommendation: { session: { kind, durationMinutes: 90 }, progression: { targetDifficulty: 6 }, adaptations: [] }, ...extra });

test("generate picks the coach's system near the target difficulty and varies on request", async () => {
  const { alice } = users();
  const first = await generateWorkout(alice, { date: "2026-10-05", coach: coach("threshold") });
  assert.equal(first.status, "ok");
  assert.ok([first.workout.primary_system, first.workout.secondary_system].includes("threshold"));
  assert.ok(Math.abs(first.workout.duration_minutes - 90) <= 15);
  assert.ok(Math.abs(first.workout.difficulty - 6) <= 1.5);
  const second = await generateWorkout(alice, { date: "2026-10-05", coach: coach("threshold"), variant: 1 });
  assert.notEqual(second.workout.family, first.workout.family);
  assert.ok(first.alternatives.length >= 2);
  const easy = await generateWorkout(alice, { date: "2026-10-05", coach: coach("recovery", "red"), availabilityMinutes: 45, environment: "outdoor" });
  assert.equal(easy.workout.primary_system, "recovery");
  assert.equal(easy.environment, "outdoor");
  assert.equal(easy.workout.intervals_type, "Ride");
});

test("a system filter ranks workouts of that primary system first", () => {
  for (const system of ["vo2max", "threshold", "anaerobic"]) {
    const top = rankWorkoutCandidates(CYCLING_WORKOUTS, { system, durationMinutes: 90 }, { readiness: "green" }).slice(0, 5);
    assert.ok(top.every(w => w.primary_system === system), system + ": " + top.map(w => w.id).join(","));
  }
});
