import test from "node:test";
import assert from "node:assert/strict";
import { applyPlan, getTemplate, planPreview, templateSummary, raceWorkout, openWaterMinutes, triRaceDay, planSports, raceDay } from "../src/training-plans.js";
import { getTestWorkout } from "../src/threshold-check.js";
import { manualTestResult, TEST_IDS } from "../src/threshold-check-state.js";
import { rideRace } from "../src/race-estimate.js";

const swimItems = (monday, roles = ["quality", "endurance", "quality", "long"]) => roles.map((role, i) => ({ date: new Date(Date.parse(monday + "T12:00:00Z") + [1, 3, 4, 6][i] * 86400000).toISOString().slice(0, 10), sport: "swim", slot: 0, role, minutes: role === "long" ? 120 : 45, tss: 30, intensity: .7 }));
const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

test("the new plans: open-water race, faster swimming, faster 5 km, strength for swimmers, the long aquabikes", () => {
  const ids = { "swim-open-water": ["swim", 12], "swim-css": ["swim", 10], "run-5k": ["run", 8], "gym-swimming": ["gym", 10], "aquabike-half": ["triathlon", 16], "aquabike-full": ["triathlon", 20] };
  for (const [id, [sport, weeks]] of Object.entries(ids)) {
    const t = getTemplate(id);
    assert.equal(t.sport, sport, id);
    assert.equal(t.weeks.length, weeks, id);
    assert.ok(templateSummary(t).weeks.every(w => w.keys.length || w.race), id + " names each week");
  }
  assert.deepEqual(planSports(getTemplate("aquabike-full")), ["ride", "swim"]);
  assert.deepEqual(getTemplate("swim-open-water").race.options, [1.5, 3.8, 5]);
  assert.ok(planPreview(getTemplate("swim-open-water"), { days: [1, 3, 5, 6], startDate: "2026-11-02" }).weeks.every(w => w.minutes > 0));
});

test("open-water race: sighting in the pool, a long swim that grows with the race, the race from CSS", () => {
  const t = getTemplate("swim-open-water");
  assert.ok(t.weeks.filter(w => w.q.some(k => k.family === "swim-sighting")).length >= 6, "sighting most weeks");
  const plan = (raceKm, raceDate = "2027-01-24") => ({ templateId: t.id, sport: "swim", startDate: "2026-11-02", raceDate, raceKm });
  // Week 10 (peak): the long swim about 80 % of the race.
  const week10 = shift("2026-11-02", 63);
  const longOf = km => applyPlan({ items: swimItems(week10) }, plan(km), week10, { swimCss: 105 }).items.find(x => x.role === "long").plan.workoutId;
  assert.equal(longOf(3.8), "swim-continuous-3000");
  assert.equal(longOf(1.5), "swim-continuous-1200");
  assert.equal(longOf(5), "swim-continuous-4000");
  // Less time on the long day: a shorter swim of the family, never a harder one.
  assert.equal(applyPlan({ items: swimItems(week10).map(x => ({ ...x, minutes: 45 })) }, plan(3.8), week10, { swimCss: 105 }).items.find(x => x.role === "long").plan.workoutId, "swim-continuous-2000");
  // Race week: the race on race day, the day before easy, nothing after.
  const race = "2027-01-24", monday = shift(race, -6);
  const out = applyPlan({ items: [...swimItems(monday), { date: race, sport: "swim", slot: 0, role: "endurance", minutes: 45, tss: 30, intensity: .7 }] }, plan(3.8, race), monday, { swimCss: 105 });
  const day = out.items.find(x => x.date === race);
  assert.equal(day.role, "race");
  assert.match(day.plan.workoutId, /^race-swim-3800-\d+-ow$/);
  const w = raceWorkout(day.plan.workoutId);
  assert.equal(w.sport, "swim");
  assert.match(w.name, /3800/);
  assert.match(w.description, /wetsuit|neopren/);
  assert.match(w.description, /feed|občerstv/, "food at 3.8 km");
  // 3.8 km at CSS 1:45: 90 % of CSS speed, 3 % slower in open water: about 77 min.
  assert.equal(openWaterMinutes(3800, 105), 76);
  assert.equal(raceDay(t, 3.8, { swimCss: 105 }).minutes, 76);
  // A triathlon's swim stays as it was.
  assert.match(triRaceDay("olympic", { swimCss: 105 }).swim.workoutId, /^race-swim-1500-\d+$/);
});

test("faster swimming: a CSS test in weeks 1, 6 and 10, the times give CSS", () => {
  const t = getTemplate("swim-css");
  assert.deepEqual(t.weeks.map((w, i) => w.q.some(k => k.test) ? i + 1 : 0).filter(Boolean), [1, 6, 10]);
  const out = applyPlan({ items: swimItems("2026-11-02") }, { templateId: t.id, sport: "swim", startDate: "2026-11-02" }, "2026-11-02", { swimCss: 112 });
  const test = out.items.find(x => x.plan?.kind === "test");
  assert.equal(test.plan.workoutId, "test-swim-css");
  assert.match(test.label, /CSS/);
  assert.equal(test.minutes, 45);
  const w = getTestWorkout("test-swim-css");
  assert.equal(w.sport, "swim");
  assert.equal(w.distance_meters, 1500);
  assert.deepEqual(TEST_IDS.swim, ["test-swim-css"]);
  // 400 m in 6:40 and 200 m in 3:10: CSS (400 − 190) / 2 = 105 s, 1:45 /100 m.
  assert.deepEqual(manualTestResult("test-swim-css", { t400: "6:40", t200: "3:10" }), { swimCss: 105, t400: 400, t200: 190 });
  assert.equal(manualTestResult("test-swim-css", { t400: 400, t200: 190 }).swimCss, 105);
  assert.throws(() => manualTestResult("test-swim-css", { t400: "3:10", t200: "6:40" }));
});

test("faster 5 km: one VO₂max and one threshold session a week, the race at the end", () => {
  const t = getTemplate("run-5k");
  assert.equal(t.race.km, 5);
  for (const w of t.weeks.slice(0, -1).filter(w => w.phase !== "recovery")) assert.equal(w.q.length, 2);
  assert.ok(t.weeks.every(w => w.q.filter(k => /vo2|30-30|reps|fartlek/.test(k.family)).length <= 1), "at most one VO₂max session a week");
});

test("the long aquabikes: swim then ride, the ride a little harder than a triathlon's", () => {
  const half = triRaceDay("aquabike-half", { ftp: 250, weight: 72, swimCss: 105 });
  assert.deepEqual(half.legs.map(x => x.sport), ["swim", "ride"]);
  assert.equal(half.legs[0].meters, 1900);
  assert.equal(half.legs[1].km, 90);
  assert.ok(raceWorkout(half.legs[1].workoutId), "the ride's workout");
  assert.ok(rideRace("aquabike-half", 90, { ftp: 250, weight: 72 }).minutes < rideRace("tri-half", 90, { ftp: 250, weight: 72 }).minutes);
  const full = triRaceDay("aquabike-full", { ftp: 250, weight: 72, swimCss: 105 });
  assert.deepEqual(full.legs.map(x => [x.sport, x.meters || x.km]), [["swim", 3800], ["ride", 180]]);
});

test("one free starter plan in every sport; the rest need Pro once payments are on", async () => {
  const { FREE_PLANS, planTemplates } = await import("../src/training-plans.js");
  const { plansUnlocked, assertPlanAccess } = await import("../src/subscription.js");
  const ids = new Set(planTemplates().map(t => t.id));
  for (const id of FREE_PLANS) assert.ok(ids.has(id), id + " exists");
  assert.deepEqual([...FREE_PLANS].map(id => getTemplate(id).sport).sort(), ["gym", "ride", "run", "swim", "triathlon"]);
  // The pilot: everything open, no query.
  assert.equal(await plansUnlocked({}), true);
  await assertPlanAccess({}, getTemplate("run-marathon"));
  // Payments on: a row with the paid plan opens them, none (or an expired one) does not.
  const db = row => ({ userId: 7, prepare: () => ({ bind: () => ({ first: async () => row }) }) });
  const future = new Date(Date.now() + 86400000).toISOString(), past = new Date(Date.now() - 86400000).toISOString();
  assert.equal(await plansUnlocked({ AI_PAYWALL_ENABLED: "true", DB: db({ plan: "ai", valid_until: future }) }), true);
  assert.equal(await plansUnlocked({ AI_PAYWALL_ENABLED: "true", DB: db({ plan: "ai", valid_until: past }) }), false);
  assert.equal(await plansUnlocked({ AI_PAYWALL_ENABLED: "true", DB: db(null) }), false);
  // AI_PAYWALL_ENABLED=owner locks the plans for the owner's account only.
  assert.equal(await plansUnlocked({ AI_PAYWALL_ENABLED: "owner", USER_IS_OWNER: true, DB: db(null) }), false);
  assert.equal(await plansUnlocked({ AI_PAYWALL_ENABLED: "owner", USER_IS_OWNER: true, DB: db({ plan: "ai", valid_until: future }) }), true);
  assert.equal(await plansUnlocked({ AI_PAYWALL_ENABLED: "owner", DB: db(null) }), true, "testers keep every plan");
  const paywall = { AI_PAYWALL_ENABLED: "true", DB: db(null) };
  await assertPlanAccess(paywall, getTemplate("ride-base"));
  await assert.rejects(assertPlanAccess(paywall, getTemplate("ride-ftp")), e => e.status === 402);
});
