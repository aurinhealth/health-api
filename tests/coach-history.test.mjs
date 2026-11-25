// The coach's 30-day, 90-day and yearly averages (src/coach-history.js):
// "A za poslední rok?" gets the real numbers and how far back the data reach.
import test from "node:test";
import assert from "node:assert/strict";
import { asksHistory, historyFacts } from "../src/coach-history.js";
import { historyStep } from "../src/coach-steps.js";
import { coachAnswerText } from "../src/coach-assistant.js";
import { withLang } from "../src/lang.js";

const DATE = "2026-11-25";
const day = offset => new Date(Date.parse(DATE + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);

test("asks about a longer stretch in Czech and English, not about today", () => {
  for (const m of ["A za poslední rok?", "A za poslednich 30 dni?", "Jaký je můj průměrná délka spánku", "Jak se mi vyvíjí HRV za 3 měsíce?", "my sleep over the last year", "average resting HR", "Jak jsem spal minulý měsíc?", "HRV za posledních 90 dní"])
    assert.equal(asksHistory(m), true, m);
  for (const m of ["Co mám dnes trénovat?", "Jak jsem spal?", "Should I ride today?", "Naplánuj mi další 3 dny", "Make me a 4 weeks plan", "Plán na měsíc do závodu", "how was my last week", "Jak se mi dařilo minulý týden?"])
    assert.equal(asksHistory(m), false, m);
});

test("averages per period with the nights and days they cover, and where the data start", () => {
  // Sleep only for the last 180 nights: 7 h before the last 30 nights, 6 h in them; a nap never counts.
  const sessions = Array.from({ length: 180 }, (_, i) => ({ date: day(-i), durationMin: i < 30 ? 360 : 420 }))
    .concat([{ date: day(0), durationMin: 30, nap: true }]);
  const wellness = Array.from({ length: 365 }, (_, i) => ({ id: day(-i), hrv: i < 90 ? 60 : 40, restingHR: 50, steps: 8000 }));
  const fitness = Array.from({ length: 365 }, (_, i) => ({ id: day(i - 364), ctl: 20 + i * 0.1, ctlLoad: i % 7 === 0 ? 70 : 0 }));
  const facts = historyFacts({ date: DATE, sessions, wellness, fitness, weights: { [day(-200)]: 82, [day(-10)]: 79 } });
  const [m1, m3, y] = facts.periods;
  assert.deepEqual([m1.days, m3.days, y.days], [30, 90, 365]);
  assert.deepEqual(m1.sleep, { averageMinutes: 360, nights: 30, shortestMinutes: 360, longestMinutes: 360 });
  assert.equal(m3.sleep.averageMinutes, 400);
  assert.equal(m3.sleep.nights, 90);
  // A year asked, 180 nights there: the coach says so.
  assert.equal(y.sleep.nights, 180);
  assert.equal(facts.dataSince.sleep, day(-179));
  assert.equal(y.sleep.onlyFrom, day(-179));
  assert.equal(m3.sleep.onlyFrom, undefined);
  assert.equal(m3.hrv.averageMs, 60);
  assert.equal(y.hrv.averageMs, Math.round((90 * 60 + 275 * 40) / 365));
  assert.equal(y.steps.averagePerDay, 8000);
  assert.deepEqual(m1.weight, { averageKg: 79, firstKg: 79, lastKg: 79, days: 1 });
  assert.deepEqual([y.weight.firstKg, y.weight.lastKg], [82, 79]);
  assert.equal(y.training.ctlEnd, 56.4);
  assert.ok(y.training.averageWeeklyLoadTss >= 69 && y.training.averageWeeklyLoadTss <= 71);
});

test("nothing recorded gives no history", () => {
  assert.equal(historyFacts({ date: DATE }), null);
  assert.equal(historyFacts({ date: "bad", sessions: [{ date: DATE, durationMin: 400 }] }), null);
});

test("the step says which stretch the coach reads", () => withLang("en", () => {
  const facts = historyFacts({ date: DATE, sessions: [{ date: day(-1), durationMin: 400 }, { date: day(-200), durationMin: 400 }] });
  const s = historyStep(facts);
  assert.equal(s.title, "Looking back over the last 12 months");
  assert.equal(s.text, "Sleep from 2 nights.");
  assert.equal(historyStep(null), null);
}));

test("no em dash in the coach's answer", () => {
  assert.equal(coachAnswerText("Za rok to nespočítám — mám jen 30 nocí.").answer, "Za rok to nespočítám, mám jen 30 nocí.");
});
