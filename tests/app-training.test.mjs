import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTraining, eventPlan, formZone, isoWeek, plannedStrain, weekStart } from "../src/app-training.js";

const DATE = "2026-10-08"; // Thursday, week 41
const day = n => new Date(Date.parse(DATE + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

const google = [
  { id: day(-3), hrZoneMinutes: { light: 60, moderate: 30, vigorous: 10, peak: 0 }, activeCalories: 500, vo2max: 48 },
  { id: day(-2), hrZoneMinutes: { light: 40, moderate: 10, vigorous: 0, peak: 0 }, activeCalories: 300 },
  { id: day(-1), hrZoneMinutes: { light: 50, moderate: 20, vigorous: 5, peak: 2 }, activeCalories: 400, vo2max: 49.2 },
  { id: DATE, hrZoneMinutes: { light: 30, moderate: 5, vigorous: 0, peak: 0 }, activeCalories: 180 }
];
const intervals = Array.from({ length: 100 }, (_, i) => ({ id: day(i - 99), ctl: 40 + i * 0.2, atl: 45 + i * 0.25, ctlLoad: i % 2 ? 60 : 0 }));
const ride = { name: "Sweet spot 3×12", type: "VirtualRide", start: DATE + "T15:30:00Z", durationHours: 1.25, tss: 85, description: "Rozjetí 15 min\n3×12 min 90 %\nVyjetí" };
const days = Array.from({ length: 11 }, (_, i) => {
  const d = day(i - 3);
  const training = d === day(-3) ? { planned: [{ name: "Běh", tss: 50 }], completed: [{ type: "Run", durationHours: 0.8, tss: 52 }], matched: [] }
    : d === day(-1) ? { planned: [], completed: [{ type: "Ride", durationHours: 1, tss: 60 }] }
    : d === DATE ? { planned: [ride], completed: [], matched: [] }
    : d === day(2) ? { planned: [{ name: "Dlouhý běh", type: "Run", tss: 110, durationHours: 1.6 }], completed: [] }
    : {};
  return { date: d, daily: { training } };
});
const input = {
  date: DATE,
  days,
  health: { wellness: google },
  fitness: { wellness: intervals },
  insights: { cardioFocus: { points: 900, percent: { low: 68, high: 26, anaerobic: 6 }, weeks: [{ low: 100, high: 40, anaerobic: 5 }, { low: 120, high: 30, anaerobic: 10 }, { low: 90, high: 50, anaerobic: 0 }, { low: 60, high: 20, anaerobic: 5 }] } },
  coaches: { coaches: [{ id: "cycling", actions: ["Drž předepsané pracovní bloky a mezi nimi lehce regeneruj."] }] },
  profile: { eventName: "Pražský půlmaraton", eventDate: "2026-11-01" },
  gym: { [day(4)]: { name: "Celé tělo", exercises: ["Dřep", "Tlak na lavici"] } }
};

test("Week numbers and Mondays", () => {
  assert.equal(isoWeek(DATE), 41);
  assert.equal(isoWeek("2026-01-01"), 1);
  assert.equal(isoWeek("2027-01-01"), 53, "2026 has 53 weeks");
  assert.equal(weekStart(DATE), "2026-10-05");
  assert.equal(weekStart("2026-10-05"), "2026-10-05");
  assert.equal(weekStart("2026-10-11"), "2026-10-05");
});

test("The Training screen: today's strain, the week and the next session", () => {
  const t = buildTraining(input);
  assert.equal(t.week, 41);
  assert.equal(t.days.length, 7);
  assert.equal(t.days[0].date, "2026-10-05");
  assert.ok(t.days[0].strain > 0, "Monday from heart rate");
  assert.equal(t.days[3].today, true);
  assert.equal(t.days[5].strain, null, "Saturday is still ahead");
  assert.equal(t.days[5].planned, plannedStrain(110));
  assert.ok(t.strain.score > 0);
  assert.ok(t.strain.target > t.strain.score, "the ride still to do raises it");
  assert.equal(t.next.date, DATE);
  assert.equal(t.next.time, "17:30");
  assert.equal(t.next.minutes, 75);
  assert.equal(t.next.title, "Sweet spot 3×12");
  assert.equal(t.next.strain, plannedStrain(85));
  assert.match(t.next.description, /^Rozjetí 15 min 3×12/);
  assert.match(t.next.advice, /pracovní bloky/);
  assert.deepEqual(t.thisWeek, { done: 2, planned: 4, doneLoad: 112, plannedLoad: 307 });
});

test("After today's ride the next session is the one planned for Saturday", () => {
  const done = days.map(d => d.date === DATE ? { ...d, daily: { training: { planned: [ride], completed: [{ type: "VirtualRide", durationHours: 1.2, tss: 84 }], matched: [{ planned: ride }] } } } : d);
  const t = buildTraining({ ...input, days: done });
  assert.equal(t.next.date, day(2));
  assert.equal(t.next.advice, null);
  assert.equal(t.strain.target, t.days[3].planned);
});

test("A saved gym plan is a session with its exercises", () => {
  const t = buildTraining({ ...input, days: days.filter(d => d.date !== DATE && d.date !== day(2)) });
  assert.equal(t.next.date, day(4));
  assert.equal(t.next.sport, "strength");
  assert.deepEqual(t.next.exercises, ["Dřep", "Tlak na lavici"]);
});

test("Form, load per week, zones and VO2max", () => {
  const t = buildTraining(input);
  assert.equal(t.form.form, Math.round(t.form.fitness - t.form.fatigue));
  assert.equal(t.form.zone, "grey");
  assert.equal(t.form.series.length, 84);
  assert.equal(t.load.weeks.length, 8);
  assert.equal(t.load.weeks[7].start, "2026-10-05");
  assert.equal(t.load.weeks[7].planned, 307);
  assert.ok(t.load.weeks[0].load > 0);
  assert.equal(t.load.intensity.low, 68);
  assert.equal(t.zones.minutes, 262);
  assert.equal(t.zones.light, 180);
  assert.equal(t.vo2max.value, 49.2);
  assert.equal(t.activeCalories.today, 180);
  assert.equal(t.activeCalories.usual, 400);
});

test("Form zones follow Intervals.icu", () => {
  assert.equal(formZone(30).key, "transition");
  assert.equal(formZone(10).key, "fresh");
  assert.equal(formZone(0).key, "grey");
  assert.equal(formZone(-20).key, "optimal");
  assert.equal(formZone(-40).key, "risk");
  assert.equal(formZone(null), null);
});

test("The event: base, build in the last 12 weeks, taper in the final week", () => {
  const e = eventPlan({ name: "Půlmaraton", date: "2026-11-01" }, DATE);
  assert.equal(e.daysLeft, 24);
  assert.equal(e.phase, "build");
  assert.deepEqual(e.phases.map(p => p.state), ["done", "now", "next"]);
  assert.equal(e.phases[1].week, 9);
  assert.equal(e.phases[1].weeks, 11);
  assert.equal(e.phases[2].from, "2026-10-25");
  assert.equal(eventPlan({ name: "Závod", date: "2026-10-12" }, DATE).phase, "taper");
  assert.equal(eventPlan({ name: "Závod", date: "2027-06-01" }, DATE).phase, "base");
  assert.equal(eventPlan(null, DATE), null);
  assert.equal(buildTraining(input).event.name, "Pražský půlmaraton");
});

test("Training stays usable without data", () => {
  const t = buildTraining({ date: DATE });
  assert.equal(t.days.length, 7);
  assert.equal(t.strain.score, null);
  assert.equal(t.next, null);
  assert.equal(t.event, null);
  assert.equal(t.form, null);
  assert.equal(t.zones, null);
  assert.equal(t.vo2max, null);
  assert.equal(t.activeCalories, null);
  assert.equal(t.load.intensity, null);
  assert.deepEqual(t.thisWeek, { done: 0, planned: 0, doneLoad: 0, plannedLoad: 0 });
});

test("The server answers GET /app/api/training with buildTraining", () => {
  const src = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname==='\/app\/api\/training'&&request\.method==='GET'/);
  assert.match(src, /buildTraining\(\{date,days,gym,health,fitness,insights,coaches,profile/);
});

test("The week's sessions: done with the activity id, planned with the event id", () => {
  const withIds = days.map(d => d.date === day(-1)
    ? { ...d, daily: { training: { planned: [], completed: [{ id: "activity:i123", source: "intervals", payload: { id: "i123" }, type: "Ride", name: "Odpolední jízda", start: day(-1) + "T15:00:00Z", durationHours: 1, tss: 60 }] } } }
    : d.date === DATE ? { ...d, daily: { training: { planned: [{ ...ride, id: "planned:77" }], completed: [], matched: [] } } } : d);
  const t = buildTraining({ ...input, days: withIds });
  const done = t.sessions.find(s => s.date === day(-1));
  assert.deepEqual([done.kind, done.status, done.activityId, done.sport, done.minutes, done.time], ["activity", "done", "i123", "ride", 60, "17:00"]);
  const today = t.sessions.find(s => s.date === DATE);
  assert.deepEqual([today.kind, today.status, today.eventId, today.sport], ["planned", "planned", "planned:77", "ride"]);
  assert.ok(!t.sessions.some(s => s.date === day(-3) && s.status === "missed"), "a past plan with a session done is not missed");
  assert.equal(t.sessions.find(s => s.date === day(2)).sport, "run");
});
