import test from "node:test";
import assert from "node:assert/strict";
import { heatAdvice, tempAt, indoorText } from "../src/heat-advice.js";
import { buildToday } from "../src/app-today.js";
import { withLang, withUnits } from "../src/lang.js";

const hot = { max: 31, hours: [{ hour: 8, temp: 19 }, { hour: 11, temp: 25 }, { hour: 14, temp: 29 }, { hour: 17, temp: 31 }, { hour: 20, temp: 26 }] };

test("the temperature at a time is read between the forecast's hours", () => {
  assert.equal(tempAt(hot.hours, 17 * 60), 31);
  assert.equal(tempAt(hot.hours, 18 * 60 + 30), 28.5);
  assert.equal(tempAt(hot.hours, 6 * 60), 19);
  assert.equal(tempAt([], 600), null);
});

test("a run outdoors on a hot day: by heart rate, slower, in the cool morning", () => {
  const run = heatAdvice({ sport: "run", weather: hot });
  assert.equal(run.temp, 31);
  assert.equal(run.text, "Horko až 31 °C. Běž podle tepu, tempo nech o 10–20 s/km pomalejší a vezmi pití, vyraž nejlíp před 10:00. Když tep v intervalu vyletí, zkrať ho.");
  assert.equal(run.short, "Horko 31 °C · tempo o 10–20 s/km pomaleji, víc pít");
});

test("a planned ride gets the temperature at its own time", () => {
  const ride = heatAdvice({ sport: "ride", weather: hot, time: "17:30" });
  assert.equal(ride.text, "V 17:30 kolem 30 °C. Jeď podle tepu, intervaly dej o 5 % slabší a pij 0,5–1 l za hodinu. Když tep v intervalu vyletí, zkrať ho.");
  assert.equal(ride.short, "Horko 30 °C · intervaly o 5 % slabší, víc pít");
  // The morning is cool enough: nothing.
  assert.equal(heatAdvice({ sport: "ride", weather: hot, time: "08:00" }), null);
});

test("nothing indoors, for other sports or below 25 °C", () => {
  assert.equal(heatAdvice({ sport: "ride", weather: hot, indoor: true }), null);
  assert.equal(heatAdvice({ sport: "strength", weather: hot }), null);
  assert.equal(heatAdvice({ sport: "run", weather: { max: 24 } }), null);
  assert.equal(heatAdvice({ sport: "run", weather: null }), null);
  assert.ok(indoorText("Kolo · Zwift") && indoorText("Běh na pásu") && !indoorText("Kolo · tempo"));
  // 25–29 °C: the advice without cutting efforts short.
  assert.ok(!heatAdvice({ sport: "run", weather: { max: 27 } }).text.includes("zkrať"));
});

test("English and imperial units", () => withLang("en", () => withUnits("imperial", () => {
  const run = heatAdvice({ sport: "run", weather: hot });
  assert.equal(run.text, "Heat up to 88 °F. Go by heart rate, keep your pace 15–30 s/mi slower and take a drink, go best before 10:00. If your heart rate shoots up in an interval, cut it short.");
})));

test("Plán dne: a ride still ahead outdoors carries the short line", () => {
  const day = buildToday({ date: "2026-07-12", hour: 9, forecast: hot, daily: { training: { planned: [
    { id: "planned:1", name: "Kolo · 4 × 8 min sweet spot", type: "Ride", start: "2026-07-12T17:30:00", durationHours: 1.1, tss: 82 },
    { id: "planned:2", name: "Zwift · tempo", type: "VirtualRide", start: "2026-07-12T19:00:00", durationHours: 1, tss: 60 }
  ], completed: [] } } });
  const items = day.plan.filter(i => i.kind === "workout");
  assert.equal(items.find(i => i.title.startsWith("Kolo")).heat, "Horko 30 °C · intervaly o 5 % slabší, víc pít");
  assert.equal(items.find(i => i.title.startsWith("Zwift")).heat, undefined);
});
