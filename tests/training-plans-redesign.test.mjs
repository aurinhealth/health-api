import test from "node:test";
import assert from "node:assert/strict";
import { getTemplate, planStart, planWeek, planQuality, planLoad, applyPlan, planEdit, planWeekDays, planPreview, planCompletion, planName, templateSummary } from "../src/training-plans.js";
import { planWeekRoles, weekTargets } from "../src/week-planner.js";

const monday = "2026-10-12";
const days = [[], ["ride"], [], ["ride"], [], ["ride"], ["ride"]];
const ride = plan => {
  const pw = planWeek(plan, monday);
  return applyPlan(weekTargets({ roles: planWeekRoles(days, { quality: planQuality(pw), prefer: "ride" }), ctl: 50, days: [], today: monday, weekStart: monday, plan: planLoad(pw) }), plan, monday, {}).items.filter(x => x.sport === "ride");
};
const base = { templateId: "ride-ftp", startDate: monday };

test("a plan starts on the day the athlete picks, its first week from that day", () => {
  const t = getTemplate("ride-ftp");
  assert.deepEqual(planStart(t, { today: "2026-10-14", startDate: "2026-10-16" }), { startDate: monday, firstWeek: 1, firstDay: "2026-10-16", raceDate: null });
  assert.equal(planStart(t, { today: "2026-10-14", startDate: "2026-10-19" }).firstDay, null);
  assert.throws(() => planStart(t, { today: "2026-10-14", startDate: "2026-10-13" }));
  const first = ride({ ...base, firstDay: "2026-10-16" });
  assert.ok(first.every(x => x.date >= "2026-10-16"), "nothing before the first day");
  assert.ok(first.some(x => x.plan.kind === "test"), "the key sessions stay");
});

test("a session moves to another day, the other day's session takes its place", () => {
  const plain = ride(base), q = plain.find(x => x.plan.kind === "quality"), other = plain.find(x => x.plan.kind !== "quality" && x.date > q.date);
  const moved = ride(planEdit(base, { date: q.date, op: "move", to: other.date }, monday));
  assert.equal(moved.find(x => x.date === other.date).plan.family, q.plan.family);
  assert.equal(moved.find(x => x.date === q.date).plan.kind, other.plan.kind);
  // To a day without a ride: the session moves there and its day is free.
  const free = ride(planEdit(base, { date: q.date, op: "move", to: "2026-10-16" }, monday));
  assert.equal(free.find(x => x.date === "2026-10-16").plan.family, q.plan.family);
  assert.ok(!free.some(x => x.date === q.date));
  assert.throws(() => planEdit(base, { date: q.date, op: "move", to: "2026-10-20" }, monday), /tohoto týdne/);
});

test("a session is shortened or skipped", () => {
  const plain = ride(base), easy = plain.find(x => x.plan.kind === "easy" || x.plan.kind === "long");
  const short = ride(planEdit(base, { date: easy.date, op: "minutes", minutes: 40 }, monday));
  assert.equal(short.find(x => x.date === easy.date).minutes, 40);
  const skipped = ride(planEdit(base, { date: easy.date, op: "skip" }, monday));
  assert.ok(!skipped.some(x => x.date === easy.date));
  assert.throws(() => planEdit(base, { date: "2026-10-11", op: "skip" }, monday));
});

test("fewer days this week keep the key sessions", () => {
  const plain = ride(base), fewer = ride(planWeekDays(base, monday, 2));
  assert.equal(plain.length, 4);
  assert.equal(fewer.length, 2);
  assert.deepEqual(fewer.map(x => x.plan.kind).sort(), plain.filter(x => ["quality", "test"].includes(x.plan.kind)).map(x => x.plan.kind).sort());
  assert.equal(ride(planWeekDays(planWeekDays(base, monday, 2), monday, null)).length, 4);
});

test("the preview: sessions and time per week and the totals", () => {
  const t = getTemplate("ride-ftp"), p = planPreview(t, { ctl: 50, days: [1, 3, 5, 6], startDate: monday });
  assert.equal(p.weeks.length, 8);
  assert.equal(p.endDate, "2026-12-06");
  assert.ok(p.weeks.every(w => w.sessions === 4));
  assert.ok(p.weeks[3].minutes < p.weeks[2].minutes, "the lighter week is shorter");
  assert.equal(p.totals.minutes, p.weeks.reduce((a, w) => a + w.minutes, 0));
  // Free time of the days limits the week.
  const tight = planPreview(t, { ctl: 50, days: [1, 3], startDate: monday, availability: [{}, { minutes: 60 }, {}, { minutes: 60 }] });
  assert.ok(tight.weeks.every(w => w.minutes <= 180), JSON.stringify(tight.weeks.map(w => w.minutes)));
  // Started on Thursday: the first week has fewer sessions.
  assert.ok(planPreview(t, { ctl: 50, days: [1, 3, 5, 6], startDate: monday, firstDay: "2026-10-16" }).weeks[0].sessions < 4);
});

test("each past week done in %", () => {
  const plan = { templateId: "ride-ftp", startDate: "2026-09-28" };
  assert.deepEqual(planCompletion(plan, { days: [1, 3, 5, 6], doneDates: ["2026-09-29", "2026-10-01", "2026-10-03", "2026-10-04", "2026-10-07", "2026-10-11"], today: "2026-10-14" }), { 1: 100, 2: 50 });
  assert.deepEqual(planCompletion({ ...plan, weekDays: { "2026-10-05": 2 } }, { days: [1, 3, 5, 6], doneDates: ["2026-10-07", "2026-10-11"], today: "2026-10-14" })[2], 100);
});

test("the plan speaks Czech: capital phases, Czech session names", () => {
  const s = templateSummary(getTemplate("ride-ftp"));
  assert.deepEqual([...new Set(s.weeks.map(w => w.phaseLabel))], ["Test FTP", "Budování", "Odpočinek", "Vrchol"]);
  assert.equal(planName("Threshold Over-Under 3×9 (95/105)"), "Nad/pod prahem 3×9");
  assert.equal(planName("Sweet Spot 2×20"), "Sweet spot 2×20");
  assert.ok(!s.weeks.flatMap(w => w.keys).some(k => /Threshold|Over-Under/.test(k)));
});
