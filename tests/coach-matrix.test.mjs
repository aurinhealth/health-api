// The engine's safety rules across every combination the review of 2026-10-16
// checked (audit "revize doporučování tréninků"): 6 mornings × 9 loads × 10
// situations × ride and run = 1080 days. Each rule holds whatever chose the
// session: the plan in Intervals.icu, a kind asked for in the chat, the phase
// or the coach itself.
import test from "node:test";
import assert from "node:assert/strict";
import { buildCyclingCoachV2 } from "../src/cycling-coach-v2.js";
import { localToday } from "../src/user-time.js";

const D = localToday();
const day = o => new Date(Date.parse(D + "T12:00:00Z") + o * 86400000).toISOString().slice(0, 10);
// 60 nights of steady HRV, resting heart rate and breathing; `today` changes last night.
const rows = (today = {}) => Array.from({ length: 60 }, (_, i) => { const o = i - 59; return { id: day(o), hrv: 60 + (i % 3), restingHR: 50 + (i % 2), respiration: 14 + (i % 2) * 0.2, ...(o === 0 ? today : {}) }; });
const night = minutes => [{ type: "sleep", durationMin: minutes, startTime: day(-1) + "T23:00:00", endTime: D + "T07:00:00", date: D }];
const QUALITY = ["tempo", "sweet_spot", "threshold", "vo2"];

const MORNINGS = {
  green: { wellness: rows(), sleep: night(480) },
  yellow: { wellness: rows({ hrv: 52 }), sleep: night(480) },
  red: { wellness: rows({ hrv: 44, restingHR: 56 }), sleep: night(380) },
  breathing: { wellness: rows({ respiration: 17.5 }), sleep: night(480), illness: true },
  shortSleep: { wellness: rows(), sleep: night(320) },
  noWatch: { wellness: [], sleep: night(480) }
};
const act = (sport, o, name, tss = 70, hours = 1.25) => ({ date: day(o), name, type: sport === "run" ? "Run" : "Ride", tss, durationHours: sport === "run" ? Math.min(hours, 1) : hours });
const easy = s => [act(s, -2, "Endurance"), act(s, -4, "Endurance"), act(s, -6, "Endurance")];
const other = s => (s === "run" ? "ride" : "run");
const LOADS = {
  rested: { acts: s => easy(s), tsb: 8 },
  qualityThreeDaysAgo: { acts: s => [act(s, -3, "VO2max intervals", 90), ...easy(s).slice(0, 1)], tsb: 2 },
  hardYesterday: { acts: s => [act(s, -1, "VO2max intervals", 90), ...easy(s).slice(1)], tsb: 0, hard48: true },
  twoQuality: { acts: s => [act(s, -3, "VO2max intervals", 90), act(s, -5, "Threshold intervals", 90), act(s, -6, "Endurance")], tsb: 0, twoQuality: true },
  otherHardYesterday: { acts: s => [act(other(s), -1, "VO2max intervals", 90), ...easy(s)], tsb: 2, hard48: true },
  tsb25: { acts: s => easy(s), tsb: -25 },
  tsb35: { acts: s => easy(s), tsb: -35, deep: true },
  afterBreak: { acts: s => [act(s, -10, "Endurance")], tsb: 15, afterBreak: true },
  novice: { acts: s => [act(s, -2, "Easy", 20, 0.5), act(s, -5, "Easy", 20, 0.5)], tsb: 3, ctl: 8, novice: true }
};
const SITUATIONS = {
  none: {},
  plannedVo2: { planned: s => [{ date: D, name: "VO2max 5x4", type: s === "run" ? "Run" : "Ride", tss: 80, durationHours: 1.25 }] },
  short: { availabilityMinutes: 45 },
  long: { availabilityMinutes: 180 },
  askedVo2: { goal: { focus: "vo2max" }, availabilityMinutes: 120 },
  build: { goal: { phase: "build" } },
  taper: { focus: { event: { date: day(5), name: "Race" } }, taper: true },
  sick: { athleteState: { status: "sick" }, paused: true },
  dayAfterIllness: { athleteState: { status: "active", recoveredAt: day(-1) }, afterIllness: true },
  askedTempo: { goal: { focus: "tempo" }, availabilityMinutes: 120 }
};

const days = [];
for (const sport of ["ride", "run"]) for (const [m, morning] of Object.entries(MORNINGS)) for (const [l, load] of Object.entries(LOADS)) for (const [s, sit] of Object.entries(SITUATIONS)) {
  const ctl = load.ctl ?? 60, coach = buildCyclingCoachV2({
    date: D, sport, gym: { history: [] },
    week: { days: [...new Set([...load.acts(sport), ...(sit.planned?.(sport) || [])].map(a => a.date))].map(date => ({ date, daily: { training: { completed: load.acts(sport).filter(a => a.date === date), planned: (sit.planned?.(sport) || []).filter(a => a.date === date) } } })) },
    fitness: { wellness: [{ id: D, ctl, atl: ctl - load.tsb, tsb: load.tsb }] },
    health: { wellness: morning.wellness, sleep: morning.sleep },
    ...(sit.goal ? { goal: sit.goal } : {}), ...(sit.focus ? { focus: sit.focus } : {}), ...(sit.athleteState ? { athleteState: sit.athleteState } : {}),
    ...(sit.availabilityMinutes ? { availabilityMinutes: sit.availabilityMinutes } : {})
  });
  days.push({ label: [sport, m, l, s].join(" · "), sport, morning, load, sit, coach, kind: coach.recommendation.session.kind, minutes: coach.recommendation.session.durationMinutes });
}

const rule = (name, applies, holds) => test(name, () => {
  const broken = days.filter(d => applies(d) && !holds(d));
  assert.ok(days.some(applies), "the rule applies somewhere");
  assert.deepEqual(broken.map(d => d.label + " → " + d.kind + " " + d.minutes), []);
});
const run = d => d.sport === "run";

test("the matrix has 1080 days", () => assert.equal(days.length, 1080));
rule("Nemoc: no training at all", d => d.sit.paused, d => d.kind === "rest" && d.minutes === 0);
const live = d => !d.sit.paused;
rule("red: only a short recovery", d => live(d) && d.coach.readiness.status === "red", d => d.kind === "recovery" && d.minutes <= (run(d) ? 30 : 45));
rule("deep fatigue (TSB −35) is red", d => live(d) && d.load.deep, d => d.coach.readiness.status === "red");
rule("yellow: no intensity, tempo included", d => live(d) && d.coach.readiness.status === "yellow", d => !QUALITY.includes(d.kind));
rule("signs of illness: no intensity and short", d => live(d) && d.morning.illness, d => !QUALITY.includes(d.kind) && d.minutes <= (run(d) ? 40 : 60));
rule("48 h after a hard day of either sport: no quality", d => live(d) && d.load.hard48, d => !QUALITY.includes(d.kind));
rule("two quality days in 7: no third", d => live(d) && d.load.twoQuality, d => !QUALITY.includes(d.kind));
rule("after a break: no intensity and not long", d => live(d) && d.load.afterBreak, d => !QUALITY.includes(d.kind) && d.kind !== "long_endurance" && d.minutes <= (run(d) ? 45 : 90));
rule("beginner: no intensity", d => live(d) && d.load.novice, d => !QUALITY.includes(d.kind));
rule("the days after Nemoc: no intensity and shorter", d => d.sit.afterIllness, d => !QUALITY.includes(d.kind) && d.minutes <= (run(d) ? 40 : 75));
rule("the length never exceeds the time given", d => live(d) && d.sit.availabilityMinutes, d => d.minutes <= d.sit.availabilityMinutes);
rule("the taper stays short", d => live(d) && d.sit.taper, d => d.minutes <= 80);
