import test from "node:test";
import assert from "node:assert/strict";
import { weekProposal, capWeekTargets } from "../src/adaptive-week.js";
import { planWeekRoles, sanitizeWeekPlan, planRoleOptions } from "../src/week-planner.js";
import { getTemplate, planDays, applyPlan, planStart, planWeek, planQuality, planLoad } from "../src/training-plans.js";

const shift = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const quality = items => items.filter(x => x.role === "quality");
const ridesOn = (availability, days) => sanitizeWeekPlan({ availability: availability.map(minutes => ({ minutes })), days });

// Audit 22.1: form −20 to −30 is the usual build (Intervals.icu's optimal zone),
// not red: one key session and a line saying so; below −30 none.
test("form −20 to −30 keeps one key session and says so; below −30 none", () => {
  const prefs = ridesOn([0, 90, 0, 90, 0, 180, 120], [[], ["ride"], [], ["ride"], [], ["ride"], ["ride"]]);
  const start = "2027-04-12", form = tsb => weekProposal({ prefs, start, today: start, state: { status: "active" }, fitness: { wellness: [{ id: shift(start, -1), ctl: 60, atl: 60 - tsb, tsb }] } });
  assert.equal(quality(form(0).items).length, 2);
  const built = form(-22);
  assert.equal(quality(built.items).length, 1);
  assert.ok(built.warnings.some(w => w.text === "Forma −22: tento týden jen jeden klíčový trénink."));
  const deep = form(-32);
  assert.equal(quality(deep.items).length, 0);
  assert.ok(deep.warnings.some(w => /^Forma −32: tento týden žádný klíčový trénink/.test(w.text)));
  // A week that starts later: today's form speaks for this week only.
  const later = weekProposal({ prefs, start, today: shift(start, -3), state: { status: "active" }, fitness: { wellness: [{ id: shift(start, -4), ctl: 60, atl: 82, tsb: -22 }] } });
  assert.equal(quality(later.items).length, 2);
  assert.ok(!later.warnings.some(w => /Forma/.test(w.text)));
});

// Audit 22.5: the second quality day never sits next to the long day.
test("a runner on Tue, Wed, Sat and Sun gets one quality day, not one before the long run", () => {
  const roles = planWeekRoles([[], ["run"], ["run"], [], [], ["run"], ["run"]]);
  assert.deepEqual(roles.map(d => d.items[0]?.role || null), [null, "quality", "recovery", null, null, "endurance", "long"]);
  // With room for both, two stay.
  assert.equal(planWeekRoles(Array.from({ length: 7 }, () => ["run"])).filter(d => d.items[0].role === "quality").length, 2);
});

// Audit 22.9: the weekday order no longer decides the sport with intervals or the long day.
test("several endurance sports take turns at the quality days; the long day is a ride or run day", () => {
  const days = [["swim"], ["ride"], [], ["run"], [], ["ride", "run"], ["swim"]];
  const qualitySports = week => planWeekRoles(days, { week }).flatMap(d => d.items).filter(x => x.role === "quality").map(x => x.sport).join(",");
  const weeks = ["2027-04-05", "2027-04-12", "2027-04-19"].map(qualitySports);
  assert.ok(new Set(weeks).size >= 2, weeks.join(" | "));
  const roles = planWeekRoles(days, { week: "2027-04-12" });
  assert.equal(roles[5].items[0].role, "long");
  assert.equal(roles[6].items[0].role === "long", false);
  // One main sport keeps every key session.
  assert.ok(["2027-04-05", "2027-04-12"].every(week => planWeekRoles(days, { week, mainSport: "ride" }).flatMap(d => d.items).filter(x => x.role === "quality").every(x => x.sport === "ride")));
});

// Audit 22.3: a brick or capped session takes its minutes first, the long session the rest.
test("the long ride keeps the day's time next to a brick", () => {
  const prefs = ridesOn([0, 0, 0, 0, 0, 240, 0], [[], [], [], [], [], ["ride", "run"], []]);
  const date = "2027-04-17", items = [
    { date, sport: "ride", slot: 0, role: "long", minutes: 200, tss: 200 },
    { date, sport: "run", slot: 0, role: "recovery", brick: true, minutes: 15, maxMinutes: 15, tss: 10 }];
  const out = capWeekTargets({ items }, prefs, [], {});
  assert.deepEqual(out.items.map(x => [x.sport, x.minutes]), [["ride", 200], ["run", 15]]);
  const tight = capWeekTargets({ items }, ridesOn([0, 0, 0, 0, 0, 180, 0], prefs.days), [], {});
  assert.deepEqual(tight.items.map(x => [x.sport, x.minutes]), [["ride", 165], ["run", 15]]);
});

// Audit 22.10: a session shorter than the minimum by its own length (a 400 m swim) stays.
test("a short plan swim that fits the day is not skipped", () => {
  const prefs = ridesOn([60, 0, 0, 0, 0, 0, 0], [["swim"], [], [], [], [], [], []]);
  const out = capWeekTargets({ items: [{ date: "2027-04-12", sport: "swim", slot: 0, role: "long", minutes: 14, tss: 10, plan: { kind: "long" } }] }, prefs, [], {});
  assert.deepEqual(out.items.map(x => x.minutes), [14]);
  assert.deepEqual(out.skipped, []);
});

// A triathlon plan's week as the app makes it: the plan applied inside weekProposal.
function triWeek(id, n, { bricks = null } = {}) {
  const t = getTemplate(id), base = sanitizeWeekPlan({ weeklyActivities: 8, availability: [60, 60, 90, 60, 60, 180, 120].map(minutes => ({ minutes })) });
  const prefs = sanitizeWeekPlan({ ...base, days: planDays(t, base).days, ...(bricks ? { bricks } : {}) });
  const when = planStart(t, { today: "2026-11-02", raceDate: "2027-02-21" });
  const plan = { templateId: t.id, sport: "triathlon", ...when }, start = shift(when.startDate, (n - 1) * 7), pw = planWeek(plan, start);
  const apply = x => applyPlan(x, plan, start, { thresholdPace: 280, ftp: 250, swimCss: 110 });
  return weekProposal({ prefs, start, today: shift(start, -1), state: { status: "active" }, focus: { sport: "triathlon" }, triathlon: { year: null, levels: {} }, fitness: { wellness: [{ id: shift(start, -1), ctl: 50, atl: 50, tsb: 0 }] },
    plan: { plan, pw, roles: planRoleOptions(plan, planQuality(pw), ["ride", "run", "swim"]), load: planLoad(pw), apply } }).items;
}
const dayOf = x => (new Date(x.date + "T12:00:00Z").getUTCDay() + 6) % 7;

// Audit 22.2: one brick, on the long ride's day; the run there is never the long run.
test("a triathlon plan week has one brick after the long ride, with or without the Brick tile", () => {
  for (const bricks of [null, [5]]) for (const [id, n] of [["tri-olympic", 9], ["tri-half", 9], ["du-standard", 5]]) {
    const items = triWeek(id, n, { bricks }), longRide = items.find(x => x.sport === "ride" && x.plan?.kind === "long"), brick = items.filter(x => x.brick);
    assert.equal(brick.length, 1, id + " " + JSON.stringify(bricks));
    assert.equal(brick[0].date, longRide.date);
    assert.equal(brick[0].label, "Běh po kole");
    assert.ok(!items.some(x => x.sport === "run" && x.date === longRide.date && !x.brick), id);
  }
});

// Audit 22.4: a ride or run key session never next to another one; next to a
// ride's or run's long day only when the athlete's days leave no other choice.
test("triathlon key sessions of ride and run are spread out", () => {
  const apart = (a, b) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
  for (const [id, n, both, clear] of [["tri-olympic", 9, true, true], ["tri-half", 9, true, true], ["du-standard", 5, true, false], ["multi-base", 5, true, false], ["tri-sprint", 1, false, false], ["tri-sprint", 2, false, false]]) {
    const items = triWeek(id, n), of = kind => items.filter(x => ["ride", "run"].includes(x.sport) && x.plan?.kind === kind).map(dayOf);
    const keys = of("quality"), longs = of("long");
    assert.equal(keys.length, both ? 2 : 1, id + " " + n);
    if (keys.length === 2) assert.ok(apart(keys[0], keys[1]) >= 2, id + ": " + keys);
    if (clear) for (const k of keys) for (const l of longs) assert.ok(apart(k, l) >= 2, id + ": " + keys + " / " + longs);
  }
  // Ride and run on neighbouring days only: their key sessions take turns by week.
  const sport = n => triWeek("tri-sprint", n).find(x => ["ride", "run"].includes(x.sport) && x.plan?.kind === "quality").sport;
  assert.notEqual(sport(1), sport(2));
});
