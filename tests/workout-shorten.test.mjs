import test from "node:test";
import assert from "node:assert/strict";
import { resizeWorkout, generateWorkout, CYCLING_WORKOUTS, RUNNING_WORKOUTS } from "../src/workout-library.js";
import { renderForEnvironment, flattenSteps } from "../src/workout-model.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";

// A shortened workout lasts the asked length within 2 min indoors. Outdoors the
// warm-up grows to 15 min and steps are rounded (adaptStructure), which the
// "change the length" proposal corrects where it can; what remains is the
// outdoor allowance of up to 8 min.
const ALL = [...CYCLING_WORKOUTS, ...RUNNING_WORKOUTS];
const byId = id => { const w = ALL.find(x => x.id === id); assert.ok(w, id); return w; };
const OUTDOOR_ALLOWANCE = 8;
const indoor = w => renderForEnvironment(w, "indoor").duration_minutes;
const outdoor = w => renderForEnvironment(w, "outdoor").duration_minutes;

test("one long tempo block is shortened itself: pfd-tempo-1x60-90 at 30, 45 and 60 min", async () => {
  const base = byId("pfd-tempo-1x60-90"), db = scopedDb(createD1(), 1);
  for (const minutes of [30, 45, 60]) {
    const r = resizeWorkout(base, minutes);
    assert.ok(Math.abs(indoor(r) - minutes) <= 2, `${minutes}: indoor ${indoor(r)}`);
    // Still one continuous block at the same intensity, with a warm-up and a cool-down.
    const tempo = flattenSteps(JSON.parse(r.structure_json)).filter(s => s.power === 84);
    assert.equal(tempo.length, 1);
    assert.ok(tempo[0].durationMinutes >= 10 && tempo[0].durationMinutes < 60, String(tempo[0].durationMinutes));
    assert.match(r.resize_notes.join(), /kratší úseky \(60 → \d+ min\)/);
    const g = await generateWorkout(db, { sport: "ride", environment: "outdoor", date: "2026-10-01", workoutId: base.id, resizeTo: minutes, thresholds: { ftp: 260 } });
    assert.equal(g.workout.environment, "outdoor");
    assert.ok(g.workout.duration_minutes >= minutes - 2 && g.workout.duration_minutes <= minutes + OUTDOOR_ALLOWANCE, `${minutes}: outdoor ${g.workout.duration_minutes}`);
  }
  const r45 = resizeWorkout(base, 45);
  assert.equal(r45.duration_minutes, 45);
  assert.equal(r45.intervals_description.match(/- (\d+)m 84%/)[1], "25");
  // Outdoors the proposal corrects for the longer warm-up and lands on the length.
  const g45 = await generateWorkout(db, { sport: "ride", environment: "outdoor", date: "2026-10-01", workoutId: base.id, resizeTo: 45, thresholds: { ftp: 260 } });
  assert.equal(g45.workout.duration_minutes, 45);
});

test("intervals, continuous and mixed workouts shorten to 30, 45 and 60 min", () => {
  const ids = [
    // intervals
    "pfd-ss-3x12-90", "pfd-thr-4x8-90", "pfd-vo2-5x4x112-75", "research-ronnestad-30-15", "run-cruise-4x8-90",
    // one continuous block
    "pfd-tempo-1x60-90", "pfd-ss-1x60-105", "pfd-z2-120", "run-tempo-1x40-90", "run-long-120",
    // mixed: blocks around Z2, surges, cadence drills, a late tempo block
    "public-join-2x20-threshold", "pfd-thr-split-15x20-120", "pfd-tempo-surges-3x10-105", "pfd-z2-cadence-90", "pfd-z2-durability-120", "run-long-mp-120"
  ];
  for (const id of ids) {
    const base = byId(id);
    for (const minutes of [30, 45, 60]) {
      if (minutes >= base.duration_minutes) continue;
      const r = resizeWorkout(base, minutes);
      assert.ok(Math.abs(indoor(r) - minutes) <= 2, `${id} → ${minutes}: indoor ${indoor(r)}`);
      if (!r.indoor_only) assert.ok(outdoor(r) >= indoor(r) - 2 && outdoor(r) <= indoor(r) + OUTDOOR_ALLOWANCE, `${id} → ${minutes}: outdoor ${outdoor(r)}`);
      assert.equal(r.primary_system, base.primary_system);
      assert.ok(r.work_minutes <= base.work_minutes, `${id} → ${minutes}: more work than before`);
    }
  }
});

test("below a sensible block length a shorter level of the same family is used", () => {
  // Tempo surges 2×12 cannot drop a set and keep its 2-min surges; at 30 min a lower level fits.
  const base = byId("pfd-tempo-surges-2x12-90"), r = resizeWorkout(base, 30);
  assert.ok(Math.abs(r.duration_minutes - 30) <= 2, String(r.duration_minutes));
  assert.equal(r.family, base.family);
  assert.notEqual(r.id.replace(/~\d+$/, ""), base.id);
  assert.equal(r.resized_from, base.id);
  assert.match(r.resize_notes.join(), /kratší varianta z knihovny: Tempo se zrychleními/);
});

test("every library workout shortens to 30, 45 and 60 min within 2 min indoors and the allowance outdoors", () => {
  const misses = [];
  for (const base of ALL) {
    for (const minutes of [30, 45, 60]) {
      if (minutes >= base.duration_minutes) continue;
      const r = resizeWorkout(base, minutes), inside = indoor(r), outside = r.indoor_only ? inside : outdoor(r);
      // A VO₂ pyramid with its openers needs 34 min at the least: its efforts and the pyramid stay whole.
      const longest = base.family === "vo2-pyramid" && minutes === 30 ? 34 : minutes + 2;
      if (inside < minutes - 2 || inside > longest || outside < inside - 2 || outside > inside + OUTDOOR_ALLOWANCE) misses.push(`${base.id} → ${minutes}: ${inside} indoor, ${outside} outdoor`);
    }
  }
  assert.deepEqual(misses, []);
});
