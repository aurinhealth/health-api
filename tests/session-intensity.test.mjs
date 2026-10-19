import test from "node:test";
import assert from "node:assert/strict";
import { isHardSession, isHardKind, intensityClass, HARD_KINDS, qualityDomain } from "../src/session-intensity.js";
import { SYSTEMS } from "../src/workout-library.js";
import { KINDS, kindOfSystem } from "../src/week-ai.js";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { validateCoachActions } from "../src/coach-actions.js";
import { isIntensity } from "../src/strength-context.js";

test("hard: tempo, sweet spot, threshold, VO2max, anaerobic and sprint; easy: endurance, long and recovery", () => {
  for (const kind of ["tempo", "sweet_spot", "threshold", "vo2", "vo2max", "anaerobic", "sprint"]) assert.ok(isHardKind(kind) && isHardSession(kind), kind);
  for (const kind of ["recovery", "endurance", "long", "long_endurance", "gym", "rest", "openers", "", null, undefined]) assert.ok(!isHardKind(kind), String(kind));
  assert.deepEqual([...HARD_KINDS].sort(), ["anaerobic", "sprint", "sweet_spot", "tempo", "threshold", "vo2", "vo2max"]);
  // The library's systems and the week plan's kinds: all but the easy ones are hard.
  assert.deepEqual(SYSTEMS.filter(isHardKind), ["tempo", "sweet_spot", "threshold", "vo2max", "anaerobic", "sprint"]);
  assert.deepEqual(KINDS.filter(isHardKind), ["tempo", "sweet_spot", "threshold", "vo2max"]);
  // A sprint or anaerobic workout is a VO2max day in the week plan, not an easy one.
  assert.deepEqual(["sprint", "anaerobic", "Sprinty 6×10 s"].map(s => kindOfSystem(s)), ["vo2max", "vo2max", "vo2max"]);
  // How hard: VO2max, anaerobic and sprint are high, the rest moderate.
  assert.deepEqual(["tempo", "sweet_spot", "threshold", "vo2max", "anaerobic", "sprint", "endurance"].map(k => intensityClass(k)), ["moderate", "moderate", "moderate", "high", "high", "high", null]);
});

test("names: the same words in both sports, tempo included", () => {
  for (const sport of ["ride", "run"]) {
    for (const name of ["Tempo 2×20", "Tempový běh 20 min", "Sweet Spot 3×12", "Threshold 4×8", "Prahové úseky", "VO₂max 5×4", "Norský 4×4", "Anaerobní 6×1 min", "Sprinty 6×10 s", "Tabata", "Závod", "Race day", "Ramp test", "Billat 30-30"]) assert.ok(isHardSession(name, sport), sport + ": " + name);
    for (const name of ["Endurance · 90 min", "Lehký běh", "Recovery · 30 min", "Regenerační běh", "Morning Ride", "Dlouhá jízda", "Endurance 3x20 Z2", ""]) assert.ok(!isHardSession(name, sport), sport + ": " + name);
  }
  assert.equal(intensityClass("Tempo"), "moderate");
  assert.equal(intensityClass("Sprinty do kopce 6×10 s", "run"), "high");
  // Hills make a run hard, not a ride.
  assert.ok(isHardSession("Hill run", "run"));
  assert.ok(!isHardSession("Hill ride", "ride"));
});

test("shapes: library workouts, week sessions, planned events and done activities", () => {
  // A library workout: its system decides, whatever the name says.
  assert.ok(isHardSession({ id: "tempo-2x20", name: "Tempo 2×20", primary_system: "tempo" }));
  assert.ok(isHardSession({ name: "Pro-inspired · Pidcock MTB Champs 45", primary_system: "anaerobic" }));
  assert.ok(!isHardSession({ name: "Endurance se silovými úseky · 60 min", primary_system: "endurance" }));
  assert.equal(intensityClass({ primary_system: "sprint" }), "high");
  // A week plan's session and the coach's session kind.
  assert.ok(isHardSession({ date: "2026-10-06", sport: "ride", minutes: 60, kind: "tempo" }));
  assert.ok(!isHardSession({ date: "2026-10-06", sport: "run", minutes: 45, kind: "endurance" }));
  // A planned Intervals.icu event: name and tags, a race by its category.
  assert.ok(isHardSession({ id: "planned:1", name: "Středa", type: "Ride", tags: ["indoor", "sweet_spot"] }));
  assert.ok(isHardSession({ id: "planned:2", name: "Krušnoton", type: "Ride", category: "RACE_A" }));
  assert.ok(isHardSession({ id: "planned:3", name: "Krušnoton", type: "RACE_B" }));
  assert.ok(!isHardSession({ id: "planned:4", name: "Vyjížďka", type: "Ride", category: "WORKOUT", durationHours: 2, tss: 110 }));
  // A done activity without a telling name: its intensity or load.
  assert.ok(isHardSession({ name: "Morning Ride", type: "Ride", durationHours: 1.5, tss: 90, payload: { icu_weighted_average_watts: 240, icu_ftp: 270 } }));
  assert.ok(!isHardSession({ name: "Morning Ride", type: "Ride", durationHours: 2, tss: 90, payload: { icu_weighted_average_watts: 190, icu_ftp: 270 } }));
  assert.ok(isHardSession({ name: "Morning Ride", type: "VirtualRide", durationHours: 1.2, tss: 105 }));
  assert.ok(isHardSession({ name: "Morning Ride", type: "Ride", normalizedPower: 240, ftp: 270, durationHours: 1.5, tss: 80 }), "the chat's compact activity");
  assert.ok(isHardSession({ name: "Odpolední běh", type: "Run", durationHours: 0.75, tss: 50, payload: { icu_intensity: 91 } }));
  assert.ok(isHardSession({ name: "Odpolední běh", type: "Run", durationHours: 0.8, tss: 64, intensityFactor: 0.89 }));
  assert.ok(isHardSession({ name: "Odpolední běh", type: "Run", durationHours: 0.6, tss: 52 }), "dense load");
  assert.ok(!isHardSession({ name: "Odpolední běh", type: "Run", durationHours: 1, tss: 55, payload: { icu_intensity: 80 } }));
  // Gym or a walk is never hard by load.
  assert.ok(!isHardSession({ name: "Posilovna", type: "WeightTraining", durationHours: 1, tss: 120 }));
  // An explicit flag wins over the name.
  assert.equal(isHardSession({ name: "Endurance Ride", intensity: false, tags: ["interval"] }), false);
  assert.equal(isHardSession({ name: "Recovery Ride", intensity: true }), true);
  assert.equal(isHardSession({ name: "VO2", is_intensity: false }), false);
  // Works as a filter callback: the index is not a sport.
  assert.deepEqual([{ name: "Tempo", type: "Ride" }, { name: "Endurance", type: "Ride" }, { name: "Hill run", type: "Run" }].filter(isHardSession).map(a => a.name), ["Tempo", "Hill run"]);
  for (const empty of [null, undefined, {}, ""]) assert.equal(isHardSession(empty), false);
});

test("the coach, the chat's check and the gym agree: a tempo ride is a hard day", () => {
  const date = "2026-10-08", day = o => new Date(Date.parse(date + "T12:00:00Z") + o * 86400000).toISOString().slice(0, 10);
  const wellness = [...Array.from({ length: 20 }, (_, i) => ({ id: day(-20 + i), ctl: 70, atl: 72, hrv: 80, restingHR: 48 })), { id: date, ctl: 70, atl: 72, hrv: 80, restingHR: 48, tsb: 2 }];
  const coach = name => buildCyclingCoachV2({ date, fitness: { wellness }, health: { sleep: [{ type: "sleep", durationMin: 470, endTime: date + "T06:30:00" }] }, gym: { history: [] },
    week: { days: [{ date: day(-5), daily: { training: { completed: [{ date: day(-5), type: "Ride", name: "Endurance", tss: 60, durationHours: 1.25 }] } } }, { date: day(-1), daily: { training: { completed: [{ date: day(-1), type: "Ride", name, tss: 75, durationHours: 1.25 }] } } }] } });
  for (const name of ["Tempo", "Sprinty 6×10 s", "Anaerobní 6×1 min"]) {
    const r = coach(name);
    assert.equal(r.load.hardBikeDaysRolling7d, 1, name);
    assert.ok(!isHardKind(r.recommendation.session.kind), name + " → " + r.recommendation.session.kind);
  }
  assert.ok(isHardKind(coach("Endurance").recommendation.session.kind), "an easy yesterday leaves room for quality");
  // The chat's proposal: 48 h from a done tempo or sprint ride.
  const ride = kind => ({ type: "workout", date: "2026-10-05", sport: "ride", minutes: 75, reason: "Intervaly", kind });
  const week = name => ({ athleteState: "active", week: [{ date: "2026-10-04", completed: [{ name, type: "Ride" }] }] });
  for (const name of ["Tempo", "Sprinty 6×10 s", "Anaerobní 6×1 min"]) assert.deepEqual(validateCoachActions([ride("threshold")], week(name), "2026-10-05"), [], name);
  assert.equal(validateCoachActions([ride("threshold")], week("Endurance"), "2026-10-05")[0].kind, "threshold");
  // Asked again in the chat after the coach's concern (Petr 2026-10-19): the 48 h rule gives way, red does not.
  const again = { ...ride("threshold"), insisted: true }, chat = { ...week("Tempo"), conversation: [{ role: "user", content: "Chci intervaly." }, { role: "assistant", content: "Dnes ne." }] };
  assert.equal(validateCoachActions([again], chat, "2026-10-05")[0].insisted, true);
  assert.deepEqual(validateCoachActions([again], week("Tempo"), "2026-10-05"), [], "a first ask is no insisting");
  assert.deepEqual(validateCoachActions([{ ...again, date: "2026-10-05" }], { ...chat, cyclingCoachV2: { readiness: { status: "red" } } }, "2026-10-05"), []);
  // The gym keeps the legs fresh before a tempo ride.
  assert.ok(isIntensity({ type: "Ride", name: "Tempo 2×20" }));
  assert.ok(!isIntensity({ type: "Ride", name: "Endurance" }));
});

test("Praha is a city, not a threshold; a tempo finish keeps an endurance ride easy unless its load says otherwise", () => {
  for (const name of ["Praha – Brno", "Okruh kolem Prahy", "Výjezd z Prahu"]) assert.equal(qualityDomain(name, "ride"), null, name);
  for (const name of ["Práh 2×20", "Na prahu 3×10", "Prahový běh", "Pod prahem 4×8"]) assert.equal(qualityDomain(name, "run"), "moderate", name);
  assert.equal(qualityDomain("Durability – tempo na konci", "ride"), null);
  assert.equal(qualityDomain("Tempo 3×15", "ride"), "moderate");
  assert.equal(isHardSession({ name: "Durability – tempo na konci", type: "Ride" }), false);
  // Ridden hard all the same: the load decides.
  assert.equal(isHardSession({ name: "Durability – tempo na konci", type: "Ride", normalizedPower: 260, ftp: 280 }), true);
});
