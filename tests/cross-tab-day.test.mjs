// One day, the same values on every tab (redesign 602 review, 2026-11-20):
// Today, Training, Food and Health built from the same inputs show the same
// readiness, sleep need, bedtime, strain, calorie target and decision of the day.
import test from "node:test";
import assert from "node:assert/strict";
import { withLang } from "../src/lang.js";
import { withTimeZone } from "../src/user-time.js";
import { buildToday } from "../src/app-today.js";
import { buildHealth } from "../src/app-health.js";
import { buildTraining } from "../src/app-training.js";
import { buildFood } from "../src/app-food.js";
import { screenFacts } from "../src/screen-texts.js";
import { todayRecovery } from "../src/recovery-time.js";
import { verdictText } from "../src/day-verdict.js";

const DATE = "2026-10-08", now = Date.parse(DATE + "T07:00:00Z");
const day = o => new Date(Date.parse(DATE + "T12:00:00Z") + o * 86400000).toISOString().slice(0, 10);
const wellness = Array.from({ length: 40 }, (_, i) => ({ id: day(i - 39), hrv: i === 39 ? 66 : 56 + (i % 5), restingHR: i === 39 ? 47 : 50 + (i % 3), steps: 8000, hrZoneMinutes: { light: 40, moderate: 20, vigorous: 5, peak: 0 } }));
const sessions = Array.from({ length: 20 }, (_, i) => ({ date: day(i - 19), startTime: day(i - 20) + "T21:30:00Z", endTime: day(i - 19) + "T05:30:00Z", durationMin: 470, timeInBedMin: 480 }));
const daily = { training: { planned: [{ start: DATE + "T17:30:00", durationHours: 1, tss: 80, name: "Threshold 3×10 min", type: "Ride" }], matched: [], completed: [] }, nutrition: { calorieTarget: 2650, macros: { protein_g: 150 } } };
const longRide = { kind: "ride", type: "Ride", source: "intervals", name: "Long ride", tss: 420, icu_intensity: 75, minutes: 300, end: now - 20 * 3600000 };

for (const [name, activities] of [["a fresh morning", []], ["a morning after a long ride", [longRide]]]) {
  test("the same values on Today, Training, Food and Health: " + name, () => withTimeZone("UTC", () => withLang("en", () => {
    const training = todayRecovery({ sets: [], history: [], activities, today: DATE }, { now, today: DATE });
    const today = buildToday({ date: DATE, hour: 9, now, health: { wellness }, sleep: { sessions }, daily, training, coaches: { morningSummary: { headline: "How to start today", text: "Sleep 7 h 50 min.", recommendation: "Stick to the plan." } } });
    const health = buildHealth({ date: DATE, hour: 9, health: { wellness }, sleep: { sessions } });
    const train = buildTraining({ date: DATE, days: [{ date: DATE, daily }], health: { wellness } });
    const food = buildFood({ date: DATE, hour: 9, daily });

    assert.equal(health.readiness.score, today.readiness.score, "readiness");
    assert.equal(health.readiness.zone, today.readiness.zone, "readiness zone");
    assert.equal(health.sleep.need, today.sleep.need, "last night's sleep need");
    assert.equal(health.sleep.tonight.bedtime, today.tonight.bedtime, "tonight's bedtime");
    assert.equal(health.sleep.tonight.need, today.tonight.need, "tonight's sleep need");
    assert.equal(train.strain.score, today.strain.score, "today's strain");
    assert.equal(food.target, today.nutrition.target, "calorie target");

    // The decision: the line under the number, the coach card (Today, Health's
    // readiness detail reads the same summary) and the coach on Training.
    const key = today.day.key;
    assert.equal(today.readiness.verdict, key);
    assert.equal(today.summary.headline, verdictText(key));
    assert.equal(today.readiness.numbersLine === "hard", key === "hard" && !today.day.done);
    assert.equal(screenFacts("training", { ...train, day: today.day }).facts.dayVerdict, verdictText(key));
    if (activities.length) {
      assert.equal(key, "steady");
      // A hard session on the plan gets the steady day's line, not "go for it".
      assert.ok(today.plan.find(i => i.kind === "workout")?.steady, JSON.stringify(today.plan));
    } else assert.equal(key, "hard");
  })));
}
