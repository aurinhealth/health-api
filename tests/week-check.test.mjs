// "Kontrola týdne" (src/week-check.js): the athlete's state and the form
// ahead decide whether the coach proposes moving, cancelling or easing a
// session of the week (Petr, 2026-10-21).
import test from "node:test";
import assert from "node:assert/strict";
import { checkWeek, checkSummary, checkChips, checkSignature, strainOf, forecastForm, sessionLoad, kindOfPlanned, formFloor, shownWeekCheck, CHECK_SHOWN_MS } from "../src/week-check.js";
import { sanitizeWeekDays } from "../src/week-ai.js";
import { weekTargets, planWeekRoles } from "../src/week-planner.js";

const today = "2026-10-21"; // Wednesday
const S = (id, date, sport, minutes, name, kind) => ({ id, date, sport, minutes, name, ...(kind ? { kind } : {}) });
// Petr's week: rides Wed and Thu, gym Fri, ride + gym on Sat and Sun.
const week = [
  S("1", "2026-10-21", "ride", 90, "Endurance with low-cadence efforts"),
  S("2", "2026-10-22", "ride", 65, "Endurance with low-cadence efforts"),
  S("3", "2026-10-23", "gym", 70, "Full Body"),
  S("4", "2026-10-24", "ride", 115, "Durability – tempo at the end"),
  S("5", "2026-10-24", "gym", 70, "Full Body"),
  S("6", "2026-10-25", "ride", 150, "Long endurance"),
  S("7", "2026-10-25", "gym", 60, "Upper body")
];
const run = (strain, start, extra = {}) => checkWeek({ today, from: today, to: "2026-10-27", sessions: week, start, strain, ...extra });

test("the form is carried forward over the planned load", () => {
  const f = forecastForm({ date: "2026-10-20", ctl: 60, atl: 60 }, { "2026-10-21": 120 }, "2026-10-22");
  assert.equal(f.length, 2);
  assert.ok(f[0].tsb < 0 && f[0].atl > f[0].ctl);
  assert.ok(f[1].tsb > f[0].tsb, "a rest day recovers some form");
  assert.deepEqual(forecastForm(null, {}, "2026-10-22"), []);
});

test("a planned session's load: its own, else from its kind and length", () => {
  assert.equal(sessionLoad({ sport: "ride", minutes: 60, tss: 77 }), 77);
  assert.equal(sessionLoad({ sport: "ride", minutes: 60, kind: "endurance" }), 46);
  assert.ok(sessionLoad({ sport: "ride", minutes: 60, kind: "threshold" }) > sessionLoad({ sport: "ride", minutes: 60, kind: "endurance" }));
  assert.ok(sessionLoad({ sport: "gym", minutes: 70 }) > sessionLoad({ sport: "gym", minutes: 45 }));
  assert.equal(kindOfPlanned({ sport: "ride", name: "VO2max 5×4", minutes: 70 }), "vo2max");
  assert.equal(kindOfPlanned({ sport: "ride", name: "Durability – tempo na konci", minutes: 115 }), "endurance");
  assert.equal(kindOfPlanned({ sport: "ride", name: "Morning ride", minutes: 180 }), "long");
});

test("the state: today's readiness, the days before, hard-feeling sessions and the form", () => {
  assert.equal(strainOf({ today }).level, 0);
  const tired = strainOf({ today, readiness: { score: 41, zone: "red" } });
  assert.equal(tired.level, 2);
  assert.deepEqual(tired.chips, ["Připravenost 41"]);
  const days = strainOf({ today, past: [{ date: "2026-10-19", zone: "yellow" }, { date: "2026-10-20", zone: "yellow" }] });
  assert.equal(days.level, 1);
  assert.match(days.chips[0], /po a út/);
  // An endurance ride at 8/10 is far harder than it should be; a threshold one isn't.
  assert.equal(strainOf({ today, efforts: [{ date: "2026-10-20", rpe: 8, kind: "endurance" }] }).chips[0], "Včera: náročnost 8/10");
  assert.equal(strainOf({ today, efforts: [{ date: "2026-10-20", rpe: 8, kind: "threshold" }] }).level, 0);
  // An effort of unknown kind counts only from 9; one older than three days not at all.
  assert.equal(strainOf({ today, efforts: [{ date: "2026-10-20", rpe: 8, kind: null }] }).level, 0);
  assert.equal(strainOf({ today, efforts: [{ date: "2026-10-16", rpe: 10, kind: "endurance" }] }).level, 0);
  assert.equal(strainOf({ today, tsb: -32 }).level, 2);
  assert.deepEqual([0, 1, 2].map(formFloor), [-30, -25, -20]);
});

test("fresh, with the form fine ahead: the week stays", () => {
  const r = run({ level: 0, chips: [] }, { date: "2026-10-20", ctl: 60, atl: 62 });
  assert.deepEqual(r.changes, []);
  assert.equal(checkSummary({ ...r, strain: { level: 0 }, today }), null);
});

test("strained: the gym before the long ride leaves Saturday for a free day", () => {
  const strain = { level: 1, chips: ["Připravenost 52"] };
  const r = run(strain, { date: "2026-10-20", ctl: 60, atl: 70 });
  assert.deepEqual(r.changes.map(c => [c.id, c.type, c.to]), [["5", "move", { date: "2026-10-26" }]]);
  assert.equal(checkSummary({ ...r, strain, today }), "Po posledních dnech je toho dopředu moc. V sobotu bych posilovnu přesunul na pondělí.");
  // Only days that have time: with Monday and Tuesday off, the gym becomes stretching.
  const off = run(strain, { date: "2026-10-20", ctl: 60, atl: 70 }, { freeOn: d => !["2026-10-26", "2026-10-27"].includes(d) });
  assert.deepEqual(off.changes.map(c => [c.id, c.type]), [["5", "recovery"]]);
  assert.match(checkSummary({ ...off, strain, today }), /V sobotu bych místo posilovny dal protažení\./);
});

test("a heavy double day without a key session next keeps only the gym", () => {
  const sessions = [S("a", "2026-10-23", "ride", 120, "Endurance"), S("b", "2026-10-23", "gym", 60, "Full Body")];
  const r = checkWeek({ today, from: today, to: "2026-10-27", sessions, start: { date: "2026-10-20", ctl: 50, atl: 55 }, strain: { level: 1 }, freeOn: () => false });
  assert.deepEqual(r.changes.map(c => [c.id, c.type]), [["a", "cancel"]]);
  assert.match(checkSummary({ ...r, strain: { level: 1 }, today }), /V pátek bych nechal jen gym\./);
  // A short double day is no burden.
  const short = checkWeek({ today, from: today, to: "2026-10-27", sessions: [S("a", "2026-10-23", "ride", 40, "Easy"), S("b", "2026-10-23", "gym", 30, "Core")], start: { date: "2026-10-20", ctl: 50, atl: 55 }, strain: { level: 1 } });
  assert.deepEqual(short.changes, []);
});

test("the form ahead below the floor eases the hard session before it", () => {
  const sessions = [S("t", "2026-10-22", "ride", 90, "Threshold 3×15"), S("l", "2026-10-24", "ride", 240, "Long ride"), S("v", "2026-10-25", "ride", 90, "VO2max 6×3")];
  const r = checkWeek({ today, from: today, to: "2026-10-27", sessions, start: { date: "2026-10-20", ctl: 45, atl: 85 }, strain: { level: 0 } });
  assert.ok(r.lowest.tsb < -30);
  assert.ok(r.changes.length >= 1 && r.changes.every(c => c.type === "ease"));
  assert.equal(r.changes.find(c => c.id === "v")?.to.kind, "threshold");
  assert.ok(r.forecast.every(f => f.tsb >= -30) || r.changes.length === 3);
  const chips = checkChips({ strain: { chips: [] }, lowest: r.lowest, floor: r.floor, today });
  assert.match(chips[0], /^Forma v (sobotu|neděli) −\d+$/);
  assert.match(checkSummary({ ...r, strain: { level: 0 }, today }), /^Forma by v (sobotu|neděli) spadla na −\d+\./);
});

test("a red morning: today's ride becomes a short recovery one, today's gym stretching", () => {
  const sessions = [S("r", today, "ride", 90, "Sweet spot 3×12"), S("g", today, "gym", 60, "Full Body")];
  const r = checkWeek({ today, from: today, to: "2026-10-27", sessions, start: { date: "2026-10-20", ctl: 60, atl: 60 }, strain: { level: 2 }, readiness: { zone: "red", score: 30 }, morning: true });
  assert.deepEqual(r.changes.map(c => [c.id, c.type, c.to?.kind || null, c.to?.minutes || null]), [["r", "ease", "recovery", 45], ["g", "recovery", null, null]]);
  assert.match(checkSummary({ ...r, strain: { level: 2 }, today }), /^Připravenost je dnes nízká\. Dnes bych kolo odlehčil\./);
});

test("fixed sessions count but never change; three changes at most", () => {
  const sessions = week.map(s => ({ ...s, fixed: true }));
  assert.deepEqual(run({ level: 2 }, { date: "2026-10-20", ctl: 50, atl: 85 }, { sessions }).changes, []);
  assert.ok(run({ level: 2 }, { date: "2026-10-20", ctl: 40, atl: 95 }).changes.length <= 3);
});

test("a stored check: pending with changes until decided, a decided one for an hour", () => {
  const now = Date.parse("2026-10-21T08:00:00Z");
  assert.equal(shownWeekCheck({ date: today, status: "pending", changes: [] }, { today, now }), null);
  assert.ok(shownWeekCheck({ date: today, status: "pending", changes: [{}] }, { today, now }));
  assert.equal(shownWeekCheck({ date: "2026-10-20", status: "pending", changes: [{}] }, { today, now }), null);
  assert.equal(shownWeekCheck({ date: today, status: "kept", changes: [{}] }, { today, now }), null);
  assert.ok(shownWeekCheck({ date: today, status: "applied", decidedAt: "2026-10-21 07:30:00", changes: [{}] }, { today, now }));
  assert.equal(shownWeekCheck({ date: today, status: "applied", decidedAt: "2026-10-21 06:00:00", changes: [{}] }, { today, now: now + CHECK_SHOWN_MS }), null);
  assert.notEqual(checkSignature(week, { level: 0 }, { zone: "green" }), checkSignature(week, { level: 1 }, { zone: "green" }));
});

test("the plan of the week follows the state: strained holds the load, one quality day; tired none", () => {
  const days = [[], [], ["ride"], ["ride"], [], ["ride"], ["ride"]];
  const quality = r => planWeekRoles(days, { readiness: r }).flatMap(d => d.items).filter(x => x.role === "quality").length;
  assert.ok(quality("green") >= quality("yellow") && quality("yellow") <= 1 && quality("red") === 0);
  const base = { roles: planWeekRoles(days), ctl: 60, today: "2026-10-19", weekStart: "2026-10-19", weekLoads: [400, 400, 400] };
  assert.equal(weekTargets(base).target, Math.round(420 * 1.05));
  assert.equal(weekTargets({ ...base, strained: true }).target, 420);
  // The AI's week: tired allows no hard day, strained one.
  const ai = [{ date: "2026-10-21", sport: "ride", minutes: 60, kind: "threshold" }, { date: "2026-10-24", sport: "ride", minutes: 60, kind: "vo2max" }];
  const kinds = strain => sanitizeWeekDays(ai, { start: "2026-10-19", today, strain }).map(x => x.kind);
  assert.deepEqual(kinds(0), ["threshold", "vo2max"]);
  assert.deepEqual(kinds(1), ["threshold", "endurance"]);
  assert.deepEqual(kinds(2), ["endurance", "endurance"]);
});

test("next week's check carries the rest of this week's plan into the form", () => {
  const next = [S("n1", "2026-10-26", "ride", 90, "VO2max 5×4"), S("n2", "2026-10-27", "ride", 90, "Threshold 3×12"), S("n3", "2026-10-28", "ride", 120, "Endurance")];
  const start = { date: "2026-10-20", ctl: 50, atl: 50 }, check = sessions => checkWeek({ today, from: "2026-10-26", to: "2026-11-01", sessions, start, strain: { level: 0 }, moveUntil: "2026-11-01" });
  const alone = check(next), carried = check([...next, ...week.map(s => ({ ...s, fixed: true }))]);
  const monday = r => r.forecast.find(f => f.date === "2026-10-26").tsb;
  assert.ok(monday(carried) < monday(alone) - 10, "this week's load lowers Monday's form");
  assert.ok(carried.forecast.every(f => f.date >= "2026-10-26"), "only next week's days are checked");
  assert.ok(carried.changes.every(c => c.id.startsWith("n")), "this week's sessions stay as they are");
});
