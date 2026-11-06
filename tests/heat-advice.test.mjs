import test from "node:test";
import assert from "node:assert/strict";
import { heatAdvice, tempAt, indoorText } from "../src/heat-advice.js";
import { buildToday } from "../src/app-today.js";
import { withLang, withUnits } from "../src/lang.js";
import { buildFood } from "../src/app-food.js";
import { localToday } from "../src/user-time.js";

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

// Audit 21.1: a long ride that starts in the cool morning still gets the heat of its whole length.
const warming = { max: 31, hours: [{ hour: 8, temp: 22 }, { hour: 11, temp: 27 }, { hour: 14, temp: 30 }, { hour: 17, temp: 31 }, { hour: 20, temp: 27 }] };

test("a 4 h ride from 09:00 is judged up to 13:00, a steady one without interval clauses", () => {
  const ride = heatAdvice({ sport: "ride", weather: warming, time: "09:00", minutes: 240, intervals: false });
  assert.equal(ride.temp, 29);
  assert.equal(ride.text, "Mezi 09:00 a 13:00 až 29 °C. Jeď podle tepu a pij 0,5–1 l za hodinu.");
  assert.equal(ride.short, "Horko 29 °C · podle tepu, víc pít");
  // From 10:00 it reaches 30 °C at 14:00; still no interval to cut short.
  const later = heatAdvice({ sport: "ride", weather: warming, time: "10:00", minutes: 240, intervals: false });
  assert.equal(later.text, "Mezi 10:00 a 14:00 až 30 °C. Jeď podle tepu a pij 0,5–1 l za hodinu.");
  // With intervals the clauses stay.
  assert.ok(heatAdvice({ sport: "ride", weather: warming, time: "10:00", minutes: 240 }).text.endsWith("Když tep v intervalu vyletí, zkrať ho."));
  // An hour in the morning stays cool: nothing.
  assert.equal(heatAdvice({ sport: "ride", weather: warming, time: "08:00", minutes: 60 }), null);
});

test("the Pití card's line, in imperial units without litres", () => {
  assert.equal(heatAdvice({ sport: "ride", weather: warming, time: "10:00", minutes: 240 }).drink, "Na jízdě až 30 °C. Pij na ní 0,5–1 l za hodinu; v horku můžeš potřebovat víc, než ukazuje cíl.");
  withLang("en", () => withUnits("imperial", () => {
    const ride = heatAdvice({ sport: "ride", weather: warming, time: "10:00", minutes: 240, intervals: false });
    assert.equal(ride.text, "Up to 86 °F between 10:00 and 14:00. Ride by heart rate and drink 17–34 fl oz an hour.");
    assert.equal(ride.drink, "Up to 86 °F on your ride. Drink 17–34 fl oz an hour on it; in the heat you may need more than this goal.");
    assert.equal(heatAdvice({ sport: "run", weather: warming }).drink, "Up to 88 °F on your run. Take a drink along; in the heat you may need more than this goal.");
  }));
});

test("Pití: today's food screen carries the heat line of a ride still ahead outdoors", () => {
  const today = localToday();
  const daily = d => ({ training: { planned: [{ id: "planned:1", name: d, type: "Ride", start: today + "T10:00:00", durationHours: 4, tss: 200 }], completed: [] } });
  const food = buildFood({ date: today, hour: 8, daily: daily("Kolo · dlouhá vytrvalost"), forecast: warming });
  assert.equal(food.water.heat, "Na jízdě až 30 °C. Pij na ní 0,5–1 l za hodinu; v horku můžeš potřebovat víc, než ukazuje cíl.");
  assert.equal(buildFood({ date: today, hour: 8, daily: daily("Zwift · vytrvalost"), forecast: warming }).water.heat, undefined);
  assert.equal(buildFood({ date: today, hour: 8, daily: daily("Kolo · dlouhá vytrvalost"), forecast: null }).water.heat, undefined);
});
