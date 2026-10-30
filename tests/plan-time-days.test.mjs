import test from "node:test";
import assert from "node:assert/strict";
import { getTemplate, planDays, planPreview, gymPhaseFor, gymSessions, gymPickDays, gymPart, gymPartSlots, planSummary } from "../src/training-plans.js";
import { sanitizeWeekPlan, isWeekB, usualFor, freeMinutes, planWeekRoles } from "../src/week-planner.js";

const monday = "2026-10-12";
const day = (m, n) => new Date(Date.parse(m + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const time = list => list.map(minutes => ({ minutes }));

test("shift work: two weeks in turn, week B with its own time by weekday", () => {
  const prefs = sanitizeWeekPlan({ availability: time([60, 60, 60, 60, 60, 120, 120]), availabilityB: time([0, 0, 90, 90, 90, 240, 240]), alternate: "2026-10-14" });
  assert.equal(prefs.alternate, monday, "the anchor is that week's Monday");
  assert.equal(isWeekB(prefs, monday), false);
  assert.equal(isWeekB(prefs, day(monday, 9)), true);
  assert.equal(isWeekB(prefs, day(monday, 14)), false);
  assert.equal(isWeekB(prefs, day(monday, -3)), true, "weeks before the anchor alternate too");
  assert.deepEqual(freeMinutes(usualFor(prefs, day(monday, 7))), [0, 0, 90, 90, 90, 240, 240]);
  assert.deepEqual(freeMinutes(usualFor(prefs, monday)), [60, 60, 60, 60, 60, 120, 120]);
  // Without week B the usual week stays.
  assert.equal(sanitizeWeekPlan({ availability: time([60, 60, 60, 60, 60, 60, 60]) }).alternate, undefined);
});

test("the long session goes to the day with the most free time", () => {
  const days = [["ride"], [], ["ride"], [], ["ride"], ["ride"], ["ride"]];
  const long = minutes => planWeekRoles(days, { quality: 2, minutes }).findIndex(d => d.items.some(x => x.role === "long"));
  assert.equal(long(null), 6, "without times the weekend");
  assert.equal(long([60, 0, 60, 0, 240, 90, 90]), 4, "Friday has 2.5 hours more");
  assert.equal(long([60, 0, 60, 0, 100, 90, 90]), 6, "a little more is not enough");
});

test("rides a week: the athlete's number, days added or left out by free time", () => {
  const t = getTemplate("ride-ftp");
  const prefs = { days: [["ride"], [], ["ride"], [], ["ride"], ["ride"], ["ride"]], availability: time([45, 60, 90, 60, 30, 180, 180]) };
  const three = planDays(t, prefs, 3);
  assert.deepEqual(three.removed, [0, 4], "the shortest days go");
  assert.equal(three.days.filter(d => d.includes("ride")).length, 3);
  const gym = planDays(getTemplate("gym-muscle"), { days: [[], [], [], [], [], [], []], availability: time([60, 60, 60, 60, 60, 60, 60]) }, 6);
  assert.equal(gym.added.length, 6, "a gym plan up to 7 days");
  assert.equal(planDays(t, prefs).removed.length, 0, "without a number nothing is left out");
});

test("gym 2–7 a week: full body, upper and lower, push pull legs, a light seventh day", () => {
  assert.deepEqual(gymPickDays([["gym"], ["gym"], [], ["gym"], [], ["gym"], []], 2), [0, 3]);
  assert.deepEqual(gymPickDays([["gym"], ["gym"], ["gym"], [], [], [], []], 3), [0, 1, 2], "too close days: a day apart");
  assert.deepEqual([0, 1, 2, 3].map(k => gymPart(4, k)), ["upper", "lower", "upper", "lower"]);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(k => gymPart(7, k)), ["push", "pull", "legs", "push", "pull", "legs", "light"]);
  assert.equal(gymPart(3, 0), null);
  const every = Array.from({ length: 7 }, () => ["gym"]), date = n => day(monday, n);
  const seven = { templateId: "gym-muscle", startDate: monday, perWeek: 7 };
  assert.match(gymPhaseFor(seven, date(0), every).name, /tlaky/);
  const light = gymPhaseFor(seven, date(6), every);
  assert.match(light.name, /lehký den/);
  assert.equal(light.sets, 2);
  const legs = gymPhaseFor(seven, date(2), every);
  assert.ok(legs.exercises.every(slot => /squat|lunge|deadlift|thrust|glute|calf|curl|bridge|dead bug|pallof|plank|raise|press/i.test([].concat(slot)[0])), "legs and trunk");
  // Weekly sets stay about the same: two full-body sessions get more sets each.
  const two = { templateId: "gym-muscle", startDate: monday, perWeek: 2 }, days2 = [["gym"], [], [], ["gym"], [], [], []];
  assert.ok(gymPhaseFor(two, date(0), days2).sets > gymPhaseFor({ templateId: "gym-muscle", startDate: monday }, date(0), [["gym"], [], ["gym"], [], ["gym"], [], []]).sets);
  // A lighter phase (fewer sessions in the plan) stays lighter.
  const t = getTemplate("gym-muscle"), recovery = t.weeks.findIndex(w => w.gym.sessions < 3);
  assert.ok(gymSessions(seven, { spec: t.weeks[recovery], template: t }) < 7);
  assert.equal(planSummary(seven, monday).split, "Tlaky / tahy / nohy ×2 + pohyblivost");
});

test("a split day's exercises are of that part, at least four", () => {
  const slots = [["Barbell back squat"], ["Barbell bench press"], ["Lat pulldown"], ["Barbell Romanian deadlift"], ["Low row"], ["DB shoulder press"], ["Cable curl"]];
  assert.deepEqual(gymPartSlots(slots, "pull").map(s => s[0]), ["Lat pulldown", "Low row", "Cable curl"].concat(gymPartSlots(slots, "pull").slice(3).map(s => s[0])));
  assert.ok(gymPartSlots(slots, "push").length >= 4);
  assert.ok(gymPartSlots(slots, "upper").every(s => !/squat|deadlift/i.test(s[0])));
});

test("plan preview: a lot of free time is a ceiling the plan grows into", () => {
  const t = getTemplate("ride-ftp"), days = [0, 1, 2, 3, 4, 5, 6];
  const wide = planPreview(t, { ctl: 50, days, startDate: monday, availability: time([180, 180, 180, 180, 180, 300, 300]) });
  assert.ok(wide.weeks[0].minutes < 20 * 60, "not 20 hours in the first week");
  assert.ok(wide.weeks[2].minutes > wide.weeks[0].minutes, "the plan ramps up");
  assert.equal(wide.time.short, false);
  assert.ok(wide.time.suits[0] < wide.time.suits[1]);
  const tight = planPreview(t, { ctl: 50, days: [1, 3, 5], startDate: monday, availability: time([0, 45, 0, 45, 0, 60, 0]) });
  assert.equal(tight.time.short, true);
  assert.match(tight.time.note, /Klíčové jízdy zůstanou/);
  assert.ok(tight.weeks.some(w => w.capped));
});

test("plan preview with shift work: week B has its own time", () => {
  const t = getTemplate("run-10k"), days = [1, 3, 5, 6];
  const p = planPreview(t, { ctl: 40, days, startDate: monday, availability: time([0, 45, 0, 45, 0, 60, 90]), availabilityB: time([0, 90, 0, 90, 0, 120, 150]), alternate: monday });
  assert.equal(p.weeks[0].weekB, undefined);
  assert.equal(p.weeks[1].weekB, true);
  assert.equal(p.time.totalB, 450);
  assert.equal(p.time.total, 240);
});

test("gym preview: sessions a week, the split and the day's time up to 90 minutes", () => {
  const p = planPreview(getTemplate("gym-muscle"), { days: [0, 1, 2, 3, 4, 5, 6], startDate: monday, perWeek: 7, availability: time([45, 120, 60, 60, 60, 20, 60]) });
  assert.equal(p.gym.perWeek, 7);
  assert.equal(p.gym.days.length, 7);
  assert.equal(p.gym.days[1].minutes, 90);
  assert.equal(p.gym.days[6].part, "light");
  assert.equal(p.gym.noRest, true);
  assert.equal(p.weeks[0].sessions, 7);
});

test("the plan routes take the time, the days and the gym sessions a week", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  for (const action of ["freeTime", "weekTime", "days", "perWeek"]) assert.ok(source.includes(`body.action==='${action}'`), action);
  assert.ok(source.includes("searchParams.get('perWeek')") && source.includes("searchParams.get('count')"));
  const gateway = readFileSync(new URL("../src/strength-gateway.js", import.meta.url), "utf8");
  assert.ok(gateway.includes("trainingBudget(prefs, context.date)") && gateway.includes("Math.min(90, free)"), "a plan day up to 90 minutes, the usual length without a set time");
});

test("review fixes: the plan's sport keeps its key days, two weekdays get no long day for equal time", () => {
  // A ride plan: quality stays on ride days even when the run day has more time.
  const days = [[], ["ride"], ["run"], ["ride"], [], ["ride"], []];
  const roles = planWeekRoles(days, { quality: 2, prefer: "ride", minutes: [0, 45, 90, 45, 0, 180, 0] });
  const q = roles.flatMap(d => d.items.filter(x => x.role === "quality").map(x => x.sport));
  assert.ok(q.length >= 1 && q.every(s => s === "ride"), "quality only on rides: " + q);
  // Two weekdays with the same time: one quality, one easy, no long.
  const two = planWeekRoles([[], ["ride"], [], ["ride"], [], [], []], { minutes: [0, 60, 0, 60, 0, 0, 0] });
  assert.ok(!two.some(d => d.items.some(x => x.role === "long")));
  assert.ok(planWeekRoles([[], ["ride"], [], ["ride"], [], [], []], { minutes: [0, 60, 0, 150, 0, 0, 0] })[3].items[0].role === "long", "clearly longer: long");
});

test("review fixes: a lighter gym phase stays lighter, the home plan stays bodyweight, a day with no time counts", () => {
  const muscle = getTemplate("gym-muscle");
  const recovery = muscle.weeks.findIndex(w => w.phase === "recovery"), start = monday;
  const date = day(start, recovery * 7);
  const days = [["gym"], [], ["gym"], [], ["gym"], [], []];
  const phase = gymPhaseFor({ templateId: "gym-muscle", startDate: start, perWeek: 3 }, date, days);
  assert.equal(phase.sets, muscle.weeks[recovery].gym.sets, "recovery sets unchanged");
  const pull = gymPartSlots([["Bodyweight squat"], ["Push-up"]], "pull", "bodyweight").flat();
  assert.ok(pull.length && !pull.some(n => /cable|DB|machine|Low row/i.test(n)), "no equipment: " + pull);
  const gym = planPreview(getTemplate("gym-muscle"), { days: [0, 2, 4], startDate: start, availability: time([0, 60, 60, 60, 60, 60, 60]) });
  assert.equal(gym.gym.days[0].minutes, 0);
  assert.equal(gym.gym.short, true);
});

test("the athlete's own long day wins, with no key session the day before", async () => {
  const { roleTime } = await import("../src/week-planner.js");
  const days = [[], ["run"], [], ["run"], [], ["run"], ["run"]];
  const roles = longDay => planWeekRoles(days, { quality: 2, ...roleTime({ availability: time([0, 60, 0, 75, 0, 150, 120]), longDay }) });
  const longOf = r => r.findIndex(d => d.items.some(x => x.role === "long"));
  assert.equal(longOf(roles(undefined)), 5, "automatic: Saturday has the most time");
  const own = roles(6);
  assert.equal(longOf(own), 6, "Sunday chosen");
  assert.notEqual(own[5].items[0].role, "quality", "no key session on Saturday");
  assert.equal(longOf(roles(2)), 5, "a day without a run is ignored");
  assert.equal(sanitizeWeekPlan({ longDay: 6 }).longDay, 6);
  assert.equal(sanitizeWeekPlan({ longDay: 9 }).longDay, undefined);
});
