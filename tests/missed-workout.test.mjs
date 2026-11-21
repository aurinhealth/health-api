import test from "node:test";
import assert from "node:assert/strict";
import { missedWorkout, missedWorkoutView, decideMissed, missedDecisions } from "../src/missed-workout.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withLang } from "../src/lang.js";

// Friday 2026-11-20; Monday is the 16th.
const today = "2026-11-20";
const ride = (date, title, minutes, status = "planned", extra = {}) => ({ id: "planned:" + date + title, eventId: "planned:" + date + title, sport: "ride", title, minutes, status, date, ...extra });
const day = (date, ...activities) => ({ date, activities });

test("a missed interval ride moves to today in place of today's easy ride", () => {
  const days = [day("2026-11-19", ride("2026-11-19", "VO2max 5x4 min", 75, "missed")), day("2026-11-20", ride("2026-11-20", "Easy Z2 ride", 45)),
    day("2026-11-21"), day("2026-11-22", ride("2026-11-22", "Long ride", 180))];
  const m = missedWorkout({ days, today });
  assert.equal(m.suggest, "2026-11-20");
  assert.deepEqual(m.replaces.map(r => r.title), ["Easy Z2 ride"]);
  const v = withLang("en", () => missedWorkoutView(m, today));
  assert.equal(missedWorkoutView(m, today).move, "Přesunout na dnešek");
  assert.equal(v.text, "Yesterday you missed VO2max 5x4 min.");
  assert.equal(v.move, "Move to today");
  assert.match(v.detail, /From Thursday, replaces Easy Z2 ride/);
});

test("not next to a hard day; on a red morning not today; no day fits, let it go", () => {
  const base = [day("2026-11-19", ride("2026-11-19", "Threshold 3x10", 70, "missed")), day("2026-11-20"), day("2026-11-21", ride("2026-11-21", "Long ride", 180)), day("2026-11-22")];
  // Friday is next to Saturday's long ride, Sunday too: nothing fits.
  const none = withLang("en", () => missedWorkoutView(missedWorkout({ days: base, today }), today));
  assert.equal(none.suggest, null);
  assert.equal(none.move, null);
  assert.match(none.advice, /Let it go/);
  const free = [day("2026-11-19", ride("2026-11-19", "Threshold 3x10", 70, "missed")), day("2026-11-20"), day("2026-11-21"), day("2026-11-22")];
  assert.equal(missedWorkout({ days: free, today }).suggest, "2026-11-20");
  assert.equal(missedWorkout({ days: free, today, red: true }).suggest, "2026-11-21");
});

test("an easy missed ride, an old miss or one let go gets no card", () => {
  assert.equal(missedWorkout({ days: [day("2026-11-19", ride("2026-11-19", "Easy Z2 ride", 45, "missed"))], today }), null);
  assert.equal(missedWorkout({ days: [day("2026-11-17", ride("2026-11-17", "VO2max 5x4 min", 75, "missed"))], today }), null);
  const days = [day("2026-11-19", ride("2026-11-19", "VO2max 5x4 min", 75, "missed"))];
  assert.equal(missedWorkout({ days, today, decided: new Set(["planned:2026-11-19VO2max 5x4 min"]) }), null);
});

test("a missed gym plan goes to the first day without gym; its strength event is the same session", () => {
  const gym = (date, title, status = "planned") => ({ id: "gym:" + date, eventId: null, sport: "strength", title, status, date });
  const event = (date, status) => ({ id: "planned:local-" + date, eventId: "planned:local-" + date, sport: "strength", title: "Strength — Upper Body", status, date });
  const days = [day("2026-11-19", gym("2026-11-19", "Upper Body", "missed"), event("2026-11-19", "missed")), day("2026-11-20", gym("2026-11-20", "Legs")), day("2026-11-21"), day("2026-11-22", gym("2026-11-22", "Push"))];
  const m = missedWorkout({ days, today });
  assert.equal(m.key, "gym:2026-11-19");
  assert.equal(m.gymDate, "2026-11-19");
  assert.equal(m.suggest, "2026-11-21");
  assert.deepEqual(m.replaces, []);
  assert.equal(missedWorkout({ days, today, decided: new Set(["gym:2026-11-19"]) }), null);
});

test("a Sunday miss is offered on Monday, and an interval swim is key (an easy swim is not)", () => {
  const monday = "2026-11-23";
  const days = [day("2026-11-22", ride("2026-11-22", "Sweet spot 3x15", 90, "missed")), day("2026-11-23"), day("2026-11-24")];
  assert.equal(missedWorkout({ days, today: monday }).suggest, monday);
  assert.equal(withLang("en", () => missedWorkoutView(missedWorkout({ days, today: monday }), monday)).text, "Yesterday you missed Sweet spot 3x15.");
  const swim = (title, status) => ({ ...ride("2026-11-19", title, 50, status), sport: "swim" });
  assert.equal(missedWorkout({ days: [day("2026-11-19", swim("10x100 threshold", "missed")), day("2026-11-20")], today }).suggest, today);
  assert.equal(missedWorkout({ days: [day("2026-11-19", swim("Easy technique swim", "missed"))], today }), null);
  // A planned interval swim is not an easy session to replace.
  const hardSwim = [day("2026-11-19", ride("2026-11-19", "VO2max 5x4 min", 75, "missed")), day("2026-11-20", { ...ride("2026-11-20", "10x100 threshold", 50), sport: "swim" }), day("2026-11-21"), day("2026-11-22")];
  assert.notEqual(missedWorkout({ days: hardSwim, today }).suggest, today);
});

test("Skip it is kept, and its Undo brings the card back", async () => {
  const db = scopedDb(createD1(), 1);
  await decideMissed(db, "gym:2026-11-19", true);
  assert.ok((await missedDecisions(db)).has("gym:2026-11-19"));
  await decideMissed(db, "gym:2026-11-19", false);
  assert.equal((await missedDecisions(db)).size, 0);
  await assert.rejects(decideMissed(db, "x'; DROP", true));
});
