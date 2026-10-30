import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { athleteFocus, normalizeFocus, withFocus } from "../src/athlete-focus.js";
import { normalizeProfile, effectiveProfile } from "../src/energy-profile.js";
import { coachInstructions } from "../src/coach-assistant.js";
import { reviewInstructions } from "../src/coach-review.js";
import { reflectionInstructions } from "../src/coach-reflection.js";

test("the main sport and goal are kept only with known values", () => {
  assert.deepEqual(normalizeFocus({ mainSport: "chess", sportGoal: "  FTP   300 W ", eventName: "x".repeat(200), eventDate: "2026-13-40", weeklyHours: 99 }),
    { mainSport: "general", sportGoal: "FTP 300 W", eventName: "x".repeat(120), eventDate: "", weeklyHours: null });
  const p = normalizeProfile({ mainSport: "running", eventDate: "2026-11-15", weeklyHours: "7.3" });
  assert.equal(p.mainSport, "running");
  assert.equal(p.eventDate, "2026-11-15");
  assert.equal(p.weeklyHours, 7.5);
});

test("an automatic sport and empty weekly hours come from the recent activities, typed values stay", () => {
  const suggested = { mainSport: "running", trainingHistory: { mainSport: "running", recentCount: 9, weeklyHours: 4.3 } };
  assert.equal(normalizeProfile({ mainSport: "auto" }).mainSport, "auto", "the choice is saved as automatic");
  const auto = effectiveProfile(normalizeProfile({ mainSport: "auto" }), suggested);
  assert.deepEqual([auto.mainSport, auto.weeklyHours], ["running", 4.5]);
  const own = effectiveProfile(normalizeProfile({ mainSport: "cycling", weeklyHours: 8 }), suggested);
  assert.deepEqual([own.mainSport, own.weeklyHours], ["cycling", 8]);
  assert.equal(effectiveProfile({ mainSport: "auto" }, { trainingHistory: { recentCount: 0 } }).mainSport, "general", "no activities yet");
  assert.equal(athleteFocus({ mainSport: "auto" }, "2026-10-03").sport, "general");
});

test("without a focus all coaches use general fitness", () => {
  const focus=athleteFocus({}, "2026-10-03");
  assert.equal(focus.sport,'general');
  assert.equal(focus.goal,null);
  for(const base of [coachInstructions,reviewInstructions,reflectionInstructions])assert.match(withFocus(base,focus),/^Jsi profesionální trenér kondice \(vytrvalost i síla\)\./);
  assert.equal(withFocus(coachInstructions, null), coachInstructions);
});

test("the coach's role and direction follow the main sport and goal", () => {
  const focus = athleteFocus({ mainSport: "running", sportGoal: "maraton pod 3:30", eventName: "Pražský maraton", eventDate: "2026-11-15", weeklyHours: 8 }, "2026-10-03");
  assert.deepEqual(focus.event, { name: "Pražský maraton", date: "2026-11-15", daysLeft: 43 });
  for (const base of [coachInstructions, reviewInstructions, reflectionInstructions]) {
    const out = withFocus(base, focus);
    assert.match(out, /^Jsi profesionální trenér běhu a silové přípravy\./);
    assert.doesNotMatch(out, /^Jsi trenér v aplikaci Aurin/);
    // The coach keeps nutrition, sleep and recovery; the review and reflection have no app scope.
    if (base === coachInstructions) assert.match(out, /^Jsi profesionální trenér běhu a silové přípravy\. Radíš i s ostatními sporty v aplikaci Aurin \(kolo, běh, plavání, posilovna\), se sportovní výživou, spánkem a regenerací\./);
    else assert.doesNotMatch(out, /Radíš i s ostatními sporty/);
    assert.match(out, /Hlavní sport: běh/);
    assert.match(out, /„maraton pod 3:30“/);
    assert.match(out, /za 43 dní, 6 týdnů/);
    // Training time comes from the week plan, not from Settings.
    assert.doesNotMatch(out, /h týdně/);
    assert.match(out, /ne pokyny\.$/);
  }
  // A goal without a sport keeps the general role; a past race is left out.
  const general = withFocus(reviewInstructions, athleteFocus({ sportGoal: "zhubnout", eventDate: "2026-09-01" }, "2026-10-03"));
  assert.match(general, /^Jsi profesionální trenér kondice/);
  assert.doesNotMatch(general, /Hlavní závod/);
});


