import test from "node:test";
import assert from "node:assert/strict";
import { triathlonSplit, disciplineCategory, splitFacts } from "../src/triathlon-split.js";
import { yearFromWeeks } from "../src/training-history.js";
import { weekProposal } from "../src/adaptive-week.js";
import { sanitizeWeekPlan, planWeekRoles } from "../src/week-planner.js";
import { sanitizeWeekDays } from "../src/week-ai.js";
import { rankOptions } from "../src/coach-pick.js";

// A cyclist who runs now and then and has just started swimming.
const CYCLIST = { ride: { count: 150, hours: 300 }, run: { count: 30, hours: 20 }, swim: { count: 4, hours: 3 } };

test("the discipline being learnt gets more short sessions, the strongest keeps two", () => {
  assert.equal(disciplineCategory("swim", CYCLIST), "new");
  assert.equal(disciplineCategory("run", CYCLIST), "occasional");
  assert.equal(disciplineCategory("ride", CYCLIST), "regular");
  assert.equal(disciplineCategory("swim", CYCLIST, "experienced"), "regular", "a level chosen by hand wins");
  assert.equal(disciplineCategory("swim", null), "occasional", "no year counted yet: no priority");
  const s = triathlonSplit({ year: CYCLIST, sessions: 8, minutes: 600 });
  assert.deepEqual(s.sessions, { ride: 2, run: 3, swim: 3 });
  assert.equal(s.weak, "swim");
  assert.equal(s.short.swim, 30);
  assert.ok(s.minutes.ride > s.minutes.run && s.minutes.swim === 90);
  assert.match(s.reason, /nejnovější|newest/);
  assert.deepEqual(triathlonSplit({ year: CYCLIST, sessions: 10 }).sessions, { ride: 3, run: 3, swim: 4 });
  assert.equal(triathlonSplit({ year: CYCLIST, sessions: 8, daysToRace: 5 }).brick, null, "no brick in race week");
  assert.equal(splitFacts(s).weakest, "swim");
});

test("the year per sport comes from the stored weeks", () => {
  const y = yearFromWeeks([{ week: "2025-12-29", swim_n: 1, swim_min: 30 }, { week: "2024-12-30", swim_n: 1, swim_min: 30 }, { week: "2026-01-26", ride_n: 1, ride_min: 90 }], "2025-10-27");
  assert.deepEqual(y, { swim: { count: 1, hours: .5 }, ride: { count: 1, hours: 1.5 } });
});

test("a triathlete's week: swims by the split, a brick after the longest ride, no key swim", () => {
  const prefs = sanitizeWeekPlan({ weeklyActivities: 8, availability: [90, 60, 90, 60, 60, 180, 120].map(minutes => ({ minutes })) });
  const p = weekProposal({ prefs, start: "2026-11-02", today: "2026-11-02", state: { status: "active" }, focus: { sport: "triathlon" }, triathlon: { year: CYCLIST, levels: {} } });
  const count = sport => p.items.filter(x => x.sport === sport).length;
  assert.equal(count("swim"), 3);
  assert.equal(count("ride"), 2);
  assert.equal(count("run"), 3);
  const brick = p.items.find(x => x.brick);
  assert.ok(brick, "one brick");
  assert.equal(brick.minutes, 20);
  assert.ok(p.items.some(x => x.sport === "ride" && x.date === brick.date));
  assert.equal(brick.date, "2026-11-07", "on the day with the most time");
  assert.equal(p.items.find(x => x.date === "2026-11-07" && x.sport === "ride").role, "long");
  assert.ok(!p.items.some(x => x.sport !== "ride" && x.role === "quality"), "key sessions only for the strongest");
  for (const x of p.items.filter(x => x.sport === "swim")) {
    assert.ok(x.minutes <= 30, "short swims");
    assert.notEqual(x.role, "quality");
  }
  assert.equal(p.split.weak, "swim");
});

test("the weak discipline gets no key day from the roles or the AI", () => {
  const roles = planWeekRoles([["swim"], ["ride"], ["swim"], ["run"], ["swim"], ["ride"], ["run"]], { avoid: "swim" });
  for (const i of [0, 2, 4]) assert.ok(!["quality", "long"].includes(roles[i].items[0].role));
  const split = triathlonSplit({ year: CYCLIST, sessions: 8 });
  const [swim] = sanitizeWeekDays([{ date: "2026-11-03", sport: "swim", minutes: 60, kind: "threshold", environment: "indoor" }], { start: "2026-11-02", today: "2026-11-02", split });
  assert.equal(swim.kind, "endurance");
  assert.equal(swim.minutes, 30);
});

test("Today: a triathlete has three main sports; tired legs favour the swim", () => {
  const coach = { readiness: { status: "green" }, recommendation: { session: { kind: "endurance", durationMinutes: 60 } }, load: { lowerBodyGymSignals48h: 1 } };
  const order = mainSport => rankOptions({ ride: coach, run: coach, swim: coach, mainSport, sports: ["ride", "run", "swim"] }).options.map(o => o.kind);
  const tri = order("triathlon");
  assert.ok(tri.indexOf("swim") < tri.indexOf("gym"));
  assert.deepEqual(tri.slice(0, 2).sort(), ["ride", "run"]);
  const cyclist = order("cycling");
  assert.equal(cyclist[0], "ride");
});
