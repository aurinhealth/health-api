import test from "node:test";
import assert from "node:assert/strict";
import { cycleState, cycleLength, periodStarts, askPeriodToday, cycleTrainingCaution, cycleMonth, markCyclePhases, normalizeCycleSettings, pillState } from "../src/cycle-model.js";
import { recoveryReadiness, lutealOffset } from "../src/recovery-model.js";

const bleed = (start, n = 4, flow = 2) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(start + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10), flow }));
const on = extra => ({ enabled: true, ...extra });

test("period starts group bleeding days and add the setup date only when nothing is near it", () => {
  assert.deepEqual(periodStarts([...bleed("2026-09-05"), ...bleed("2026-10-03")], on()), ["2026-09-05", "2026-10-03"]);
  assert.deepEqual(periodStarts(bleed("2026-10-03"), on({ lastPeriod: "2026-10-04" })), ["2026-10-03"]);
  assert.deepEqual(periodStarts([], on({ lastPeriod: "2026-10-03" })), ["2026-10-03"]);
});

test("the cycle length is the athlete's number until two cycles are on record, then the mean", () => {
  assert.deepEqual(cycleLength(["2026-10-03"], { cycleLength: 31 }), { length: 31, spread: 1, learned: false, cycles: 0 });
  assert.equal(cycleLength(["2026-10-03"], {}).length, 28);
  const learned = cycleLength(["2026-08-01", "2026-08-27", "2026-09-28"], { cycleLength: 28 });
  assert.equal(learned.length, 29);
  assert.equal(learned.learned, true);
  assert.equal(learned.spread, 3);
  // A gap of 60 days (a missed log) is not a cycle.
  assert.equal(cycleLength(["2026-06-01", "2026-08-01", "2026-08-29"], {}).learned, false);
});

test("a natural cycle has a day, a phase, an ovulation and a forecast range", () => {
  const days = bleed("2026-10-03");
  const st = cycleState({ settings: on(), days, date: "2026-10-12" });
  assert.equal(st.cycleDay, 10);
  assert.equal(st.phase, "follicular");
  assert.equal(st.ovulation, "2026-10-16");
  assert.deepEqual(st.next, { start: "2026-10-31", from: "2026-10-30", to: "2026-11-01", late: false });
  assert.equal(cycleState({ settings: on(), days, date: "2026-10-03" }).phase, "menstrual");
  assert.equal(cycleState({ settings: on(), days, date: "2026-10-16" }).phase, "ovulation");
  assert.equal(cycleState({ settings: on(), days, date: "2026-10-22" }).phase, "luteal");
  // A positive ovulation test moves ovulation to the next day.
  const tested = cycleState({ settings: on(), days: [...days, { date: "2026-10-19", ovulationTest: true }], date: "2026-10-21" });
  assert.equal(tested.ovulation, "2026-10-20");
  assert.equal(tested.phase, "ovulation");
});

test("the cycle stays quiet when it is off or nothing is known", () => {
  assert.equal(cycleState({ settings: {}, days: bleed("2026-10-03"), date: "2026-10-12" }), null);
  const st = cycleState({ settings: on(), days: [], date: "2026-10-12" });
  assert.equal(st.phase, null);
  assert.equal(st.next, null);
});

test("hormonal contraception has no phases, ovulation or forecast", () => {
  const st = cycleState({ settings: on({ contraception: "pill", packStart: "2026-10-06" }), days: bleed("2026-10-01"), date: "2026-10-12" });
  assert.equal(st.hormonal, true);
  assert.equal(st.phase, undefined);
  assert.equal(st.next, undefined);
  assert.equal(st.daysSinceBleeding, 8);
  assert.deepEqual(st.pill, { pack: "21+7", number: 7, of: 21, pause: false, pauseDay: null, taken: null });
  assert.equal(askPeriodToday(st), false);
  // A copper IUD leaves the natural cycle.
  assert.equal(cycleState({ settings: on({ contraception: "copper_iud" }), days: bleed("2026-10-03"), date: "2026-10-12" }).phase, "follicular");
});

test("the pill pack counts pills and pause days", () => {
  const s = normalizeCycleSettings(on({ contraception: "pill", packStart: "2026-10-06", pillPack: "24+4" }));
  assert.equal(pillState(s, "2026-10-29", null).number, 24);
  assert.deepEqual([pillState(s, "2026-10-30", null).pause, pillState(s, "2026-10-30", null).pauseDay], [true, 1]);
  assert.equal(pillState(s, "2026-11-03", null).number, 1);
  assert.equal(pillState(s, "2026-10-05", null), null);
});

test("the morning question comes in the forecast range until a period or a 'not yet'", () => {
  const days = bleed("2026-10-03");
  const ask = (date, extra = []) => askPeriodToday(cycleState({ settings: on(), days: [...days, ...extra], date }));
  assert.equal(ask("2026-10-29"), false);
  assert.equal(ask("2026-10-30"), true);
  assert.equal(ask("2026-11-05"), true);
  assert.equal(ask("2026-10-30", [{ date: "2026-10-30", noPeriod: true }]), false);
  assert.equal(ask("2026-10-31", [{ date: "2026-10-30", noPeriod: true }]), true);
  assert.equal(ask("2026-10-31", bleed("2026-10-30", 2)), false);
  assert.equal(ask("2026-11-12"), false);
});

test("a hard bleeding day with cramps or fatigue eases training, unless turned off", () => {
  const days = [...bleed("2026-10-03"), { date: "2026-10-30", flow: 2, symptoms: ["cramps", "fatigue"] }];
  const st = cycleState({ settings: on(), days, date: "2026-10-30" });
  assert.deepEqual(cycleTrainingCaution(st), { reasons: ["cramps", "fatigue"], cycleDay: 1 });
  assert.equal(cycleTrainingCaution(cycleState({ settings: on({ adaptTraining: false }), days, date: "2026-10-30" })), null);
  assert.equal(cycleTrainingCaution(cycleState({ settings: on(), days: [...bleed("2026-10-03"), { date: "2026-10-30", flow: 1 }], date: "2026-10-30" })), null);
  assert.deepEqual(cycleTrainingCaution(cycleState({ settings: on(), days: [...bleed("2026-10-03"), { date: "2026-10-30", flow: 3 }], date: "2026-10-30" })).reasons, ["heavy"]);
});

test("the month shows logged days, the forecast and the pill", () => {
  const month = cycleMonth({ settings: on(), days: bleed("2026-10-03"), today: "2026-10-12" }, "2026-10");
  assert.equal(month.length, 31);
  assert.equal(month[2].flow, 2);
  assert.equal(month[15].ovulation, true);
  assert.deepEqual(month.filter(d => d.forecast).map(d => d.date), ["2026-10-30", "2026-10-31"]);
  const pill = cycleMonth({ settings: on({ contraception: "pill", packStart: "2026-10-06" }), days: [{ date: "2026-10-06", pill: "21:04" }], today: "2026-10-12" }, "2026-10");
  assert.deepEqual([pill[4].pill, pill[5].pill, pill[6].pill, pill[26].pill], [undefined, "taken", "planned", "pause"]);
  assert.equal(pill.some(d => d.forecast), false);
});

test("in the luteal phase a higher resting heart rate is the athlete's normal", () => {
  const rows = [];
  for (let i = 1; i <= 40; i++) {
    const id = new Date(Date.parse("2026-09-12T12:00:00Z") + i * 86400000).toISOString().slice(0, 10);
    rows.push({ id, hrv: 60, restingHR: 50 + (i % 3) * 0.5 });
  }
  const date = "2026-10-22";
  rows.push({ id: date, hrv: 60, restingHR: 53 });
  const days = [...bleed("2026-09-05"), ...bleed("2026-10-03")];
  // The athlete's luteal days ran 2 bpm higher.
  const marked = markCyclePhases(rows, { settings: on(), days }).map(r => r.cyclePhase === "luteal" && r.id < date ? { ...r, restingHR: r.restingHR + 2 } : r);
  assert.equal(marked.at(-1).cyclePhase, "luteal");
  const plain = recoveryReadiness({ rows: marked.map(({ cyclePhase, ...r }) => r), date });
  const luteal = recoveryReadiness({ rows: marked, date });
  assert.ok(luteal.components.restingHR.score > plain.components.restingHR.score);
  assert.ok(luteal.components.restingHR.cycle > 0);
  // Hormonal contraception: no phases, no change.
  assert.equal(markCyclePhases(rows, { settings: on({ contraception: "ring" }), days }).at(-1).cyclePhase, undefined);
});

test("the luteal offset is the athlete's own once there are enough days, within limits", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push({ id: `2026-09-${String(i + 1).padStart(2, "0")}`, restingHR: i < 10 ? 50 : 54, cyclePhase: i < 10 ? "follicular" : "luteal" });
  assert.equal(lutealOffset(rows, "2026-09-25", "restingHR", 1, 3), 2);
  assert.equal(lutealOffset(rows.slice(0, 12), "2026-09-25", "restingHR", 1, 3), 1);
  assert.equal(lutealOffset(rows.map(r => ({ ...r, restingHR: r.cyclePhase === "luteal" ? 70 : 50 })), "2026-09-25", "restingHR", 1, 3), 3);
});

test("cycleForCoach shares today's cycle only when the athlete turns it on", async () => {
  const { cycleForCoach } = await import("../src/cycle-model.js");
  const days = [{ date: "2026-10-11", flow: 3, symptoms: ["cramps"] }, { date: "2026-10-12", flow: 3, symptoms: ["cramps"] }];
  const settings = { enabled: true, lastPeriod: "2026-10-11", cycleLength: 28 };
  assert.equal(cycleForCoach({ settings, days, date: "2026-10-12" }), null);
  const out = cycleForCoach({ settings: { ...settings, shareWithCoach: true }, days, date: "2026-10-12" });
  assert.deepEqual(out, { hormonal: false, flow: "heavy", symptoms: ["cramps"], cycleDay: 2, phase: "menstrual", cycleLength: 28, daysToNextPeriod: 27, easeToday: true });
  assert.ok(!JSON.stringify(out).includes("2026-"));
  const pill = cycleForCoach({ settings: { ...settings, contraception: "pill", shareWithCoach: true }, days: [], date: "2026-10-12" });
  assert.deepEqual(pill, { hormonal: true, flow: "none", symptoms: [] });
});

test("perimenopause: irregular gaps count, no phases, a wide range and no morning question", () => {
  const settings = on({ lifeStage: "perimenopause" });
  assert.equal(normalizeCycleSettings(settings).lifeStage, "perimenopause");
  assert.equal(normalizeCycleSettings(on({ lifeStage: "other" })).lifeStage, "regular");
  // Gaps of 24, 45 and 62 days: all of them count in perimenopause.
  const days = [...bleed("2026-05-01"), ...bleed("2026-05-25"), ...bleed("2026-07-09"), ...bleed("2026-09-09")];
  const len = cycleLength(periodStarts(days, settings), settings);
  assert.equal(len.learned, true);
  assert.deepEqual([len.shortest, len.longest], [24, 62]);
  const st = cycleState({ settings, days, date: "2026-10-12" });
  assert.equal(st.phase, null);
  assert.equal(st.ovulation, undefined);
  assert.deepEqual(st.range, { shortest: 24, longest: 62 });
  assert.equal(st.next.from, "2026-10-03");
  assert.equal(st.next.to, "2026-11-10");
  assert.equal(askPeriodToday(st), false);
  // The calendar marks no forecast and the readiness no phases.
  assert.ok(!cycleMonth({ settings, days, today: "2026-10-12" }, "2026-10").some(d => d.forecast));
  assert.deepEqual(markCyclePhases([{ id: "2026-10-12" }], { settings, days }), [{ id: "2026-10-12" }]);
});

test("menopause has no cycle, only the symptoms, which the coach sees with hormone therapy", async () => {
  const { cycleForCoach } = await import("../src/cycle-model.js");
  const settings = on({ lifeStage: "menopause", hrt: true, shareWithCoach: true });
  const days = [{ date: "2026-10-12", symptoms: ["hot_flashes", "night_sweats", "nonsense"] }];
  const st = cycleState({ settings, days, date: "2026-10-12" });
  assert.equal(st.cycleDay, undefined);
  assert.equal(st.next, undefined);
  assert.deepEqual(st.today.symptoms, ["hot_flashes", "night_sweats"]);
  assert.deepEqual(cycleForCoach({ settings, days, date: "2026-10-12" }), { hormonal: false, flow: "none", symptoms: ["hot_flashes", "night_sweats"], lifeStage: "menopause", hrt: true });
});
