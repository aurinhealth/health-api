import test from "node:test";
import assert from "node:assert/strict";
import { athleteFocus, normalizeFocus, withFocus } from "../src/athlete-focus.js";
import { weekProposal } from "../src/adaptive-week.js";
import { sanitizeWeekPlan } from "../src/week-planner.js";
import { explainWorkout } from "../src/workout-explanation.js";
import { SWIMMING_WORKOUTS_EN } from "../src/swimming-workouts.js";

test("can't swim 100 m yet: lessons from the coach, no open water", () => {
  assert.equal(normalizeFocus({ swims100: "no" }).swims100, undefined);
  const focus = athleteFocus({ mainSport: "triathlon", swims100: false }, "2026-07-06");
  assert.equal(focus.cannotSwim100m, true);
  assert.equal(athleteFocus({ mainSport: "cycling", swims100: false }, "2026-07-06").cannotSwim100m, undefined);
  assert.match(withFocus("Jsi trenér Aurin.", focus), /lekc|lessons/);
  const prefs = sanitizeWeekPlan({ weeklyActivities: 3, availability: [60, 0, 60, 0, 60, 0, 0].map(minutes => ({ minutes, preferredSports: ["swim"] })) });
  const p = weekProposal({ prefs, start: "2026-07-06", today: "2026-07-06", state: { status: "active" }, focus: { ...focus, sport: "swimming" }, openWater: "season" });
  assert.ok(p.items.filter(x => x.sport === "swim").every(x => x.environment === "indoor"));
});

test("a swim's food and drink go by its length", () => {
  const short = SWIMMING_WORKOUTS_EN.find(w => w.duration_minutes <= 45);
  const lines = explainWorkout(short, { environment: "indoor", sport: "swim" }).fueling;
  assert.ok(lines.some(x => /water|vod/i.test(x)));
  const long = { ...short, duration_minutes: 90 };
  assert.ok(explainWorkout(long, { environment: "indoor", sport: "swim" }).fueling.some(x => /30–60 g/.test(x)));
  assert.ok(explainWorkout(long, { environment: "outdoor", sport: "swim" }).fueling.some(x => /wetsuit|neopren/.test(x)));
});
