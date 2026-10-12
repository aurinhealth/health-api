import test from "node:test";
import assert from "node:assert/strict";
import { buildToday } from "../src/app-today.js";
import { readinessParts } from "../src/app-health.js";

const cycle = (days, extra = {}) => ({ settings: { enabled: true, ...extra }, days });
const ride = name => ({ planned: [{ id: "p1", type: "Ride", name, durationHours: 1, tss: 70, date: "2026-10-30" }], completed: [] });
const today = (profile, training = ride("Intervaly 5×4 min")) => buildToday({ date: "2026-10-30", hour: 7, daily: { training }, health: {}, fitness: {}, sleep: {}, fluids: {}, weight: {}, coaches: {}, profile });

test("Today eases a hard ride on a heavy cycle day and shows the morning question", () => {
  const days = [{ date: "2026-10-03", flow: 2 }, { date: "2026-10-04", flow: 2 }, { date: "2026-10-30", flow: 2, symptoms: ["cramps"] }];
  const t = today({ sex: "female", cycle: cycle(days) });
  const item = t.plan.find(i => i.kind === "workout");
  assert.equal(item.title, "Lehká jízda 45 min");
  assert.deepEqual(item.eased, { title: "Intervaly 5×4 min" });
  assert.equal(t.cycle.eased, true);
  assert.equal(t.cycle.cycleDay, 1);
  // Kept plan: the original stays.
  const kept = today({ sex: "female", cycle: cycle(days.map(d => d.date === "2026-10-30" ? { ...d, keepPlan: true } : d)) });
  assert.equal(kept.plan.find(i => i.kind === "workout").title, "Intervaly 5×4 min");
  assert.equal(kept.cycle.keptPlan, true);
  // An easy ride is left alone.
  assert.equal(today({ sex: "female", cycle: cycle(days) }, ride("Endurance Z2")).plan.find(i => i.kind === "workout").eased, undefined);
  // The question before anything is logged on the expected day.
  const asking = today({ sex: "female", cycle: cycle(days.slice(0, 2)) });
  assert.equal(asking.cycle.ask, true);
  assert.equal(asking.plan.find(i => i.kind === "workout").eased, undefined);
  // Off: nothing.
  assert.equal(today({ sex: "female" }).cycle, null);
});

test("the pill joins the day's plan, not on pause days", () => {
  const settings = { contraception: "pill", packStart: "2026-10-24" };
  const t = today({ sex: "female", cycle: cycle([], settings) });
  const pill = t.plan.find(i => i.kind === "pill");
  assert.equal(pill.title, "Prášek 7 z 21");
  assert.equal(pill.done, false);
  const taken = today({ sex: "female", cycle: cycle([{ date: "2026-10-30", pill: "21:04" }], settings) });
  assert.deepEqual([taken.plan.find(i => i.kind === "pill").done, taken.plan.find(i => i.kind === "pill").time], [true, "21:04"]);
  assert.equal(taken.cycle.hormonal, true);
  assert.equal(taken.cycle.ask, false);
  const pause = today({ sex: "female", cycle: cycle([], { contraception: "pill", packStart: "2026-10-05" }) });
  assert.equal(pause.plan.some(i => i.kind === "pill"), false);
});

test("a readiness part compared with the luteal normal says so", () => {
  const parts = readinessParts({ score: 74, components: { hrv: { score: 72 }, restingHR: { score: 70, cycle: 1 } } });
  assert.deepEqual(parts.find(p => p.key === "restingHR"), { key: "restingHR", points: 0, cycle: true });
  assert.equal(parts.find(p => p.key === "hrv").cycle, undefined);
});

test("the store keeps the app's log over Apple Health's and merges partial writes", async () => {
  const { createD1 } = await import("./helpers/d1.mjs");
  const { saveCycleSettings, getCycleSettings, saveCycleDay, importAppleCycle, listCycleDays, cycleInputs } = await import("../src/cycle-store.js");
  const db = createD1(); db.userId = 7;
  assert.equal(await cycleInputs(db, "2026-10-12"), null);
  const s = await saveCycleSettings(db, { enabled: true, cycleLength: 31, contraception: "bogus" });
  assert.deepEqual([s.enabled, s.cycleLength, s.contraception], [true, 31, "none"]);
  assert.equal((await saveCycleSettings(db, { lastPeriod: "2026-10-03" })).cycleLength, 31);
  assert.equal((await getCycleSettings(db)).lastPeriod, "2026-10-03");
  await importAppleCycle(db, [{ date: "2026-10-03", flow: 3 }, { date: "2026-10-04", flow: 1 }, { date: "2026-10-16", ovulationTest: true }]);
  await saveCycleDay(db, { date: "2026-10-04", flow: 2 });
  await saveCycleDay(db, { date: "2026-10-04", symptoms: ["cramps", "nope"] });
  await importAppleCycle(db, [{ date: "2026-10-04", flow: 3 }]);
  const days = await listCycleDays(db, "2026-10-01", "2026-10-31");
  assert.deepEqual(days.map(d => [d.date, d.flow, d.symptoms, d.ovulationTest]), [["2026-10-03", 3, [], false], ["2026-10-04", 2, ["cramps"], false], ["2026-10-16", 0, [], true]]);
  const kept = await saveCycleDay(db, { date: "2026-10-12", pill: "21:04", keepPlan: true });
  assert.deepEqual([kept.pill, kept.keepPlan], ["21:04", true]);
  assert.equal((await cycleInputs(db, "2026-10-12")).days.length, 4);
});
