import test from 'node:test';
import assert from 'node:assert/strict';
import { coachNudge, shortNights, zoneShiftHours, swapOffer } from '../src/coach-push.js';
import { withLang } from '../src/lang.js';

const date = '2026-10-15';
const night = (d, min) => ({ date: d, durationMin: min });
const usual = Array.from({ length: 12 }, (_, i) => night('2026-10-' + String(i + 1).padStart(2, '0'), 480));
const hard = { eventId: 'planned:7', date: '2026-10-16', sport: 'ride', name: 'Práh 4×8', minutes: 90, kind: 'threshold', environment: 'outdoor' };

test('three short nights before a hard session offer an easy ride in its place', () => withLang('cs', () => {
  const sleep = [...usual, night('2026-10-13', 330), night('2026-10-14', 340), night('2026-10-15', 320)];
  assert.equal(shortNights(sleep, date), 3);
  const nudge = coachNudge({ date, hour: 7, morning: true, recovery: { id: 'x' }, upcoming: [hard], sleep });
  assert.equal(nudge.title, 'Tři krátké noci za sebou');
  assert.equal(nudge.body, 'Zítřejší práh vyměním za lehkou jízdu 60 min?');
  assert.deepEqual(nudge.swap, { eventId: 'planned:7', date: '2026-10-16', sport: 'ride', environment: 'outdoor', minutes: 60, kind: 'endurance', name: 'Práh 4×8', what: 'práh', fromMinutes: 90 });
}));

test('no push without a hard session, at night, or for one weak sign', () => {
  assert.equal(coachNudge({ date, hour: 7, morning: true, recovery: { id: 'x' }, upcoming: [{ ...hard, kind: 'endurance' }] }), null);
  assert.equal(coachNudge({ date, hour: 6, morning: true, recovery: { id: 'x' }, upcoming: [hard] }), null);
  assert.equal(coachNudge({ date, hour: 7, morning: true, recovery: null, upcoming: [hard] }), null);
});

test('the evening before a long session asks for carbohydrates', () => withLang('cs', () => {
  const long = { eventId: 'planned:8', date: '2026-10-16', sport: 'run', name: 'Dlouhý běh 21 km', minutes: 120, kind: 'long' };
  const nudge = coachNudge({ date, hour: 18, evening: true, upcoming: [long] });
  assert.equal(nudge.title, 'Zítra Dlouhý běh 21 km');
  assert.equal(nudge.body, 'Dnes jen klid a víc sacharidů k večeři.');
  assert.equal(nudge.swap, undefined);
  assert.equal(coachNudge({ date, hour: 16, evening: true, upcoming: [long] }), null);
}));

test('a new time zone 6 hours away comes first, in English too', () => withLang('en', () => {
  assert.equal(zoneShiftHours(2 * 36e5, -4 * 36e5), -6);
  const nudge = coachNudge({ date, hour: 9, zone: { shift: -6, changed: date }, morning: true, recovery: { id: 'x' }, upcoming: [hard] });
  assert.equal(nudge.kind, 'zone');
  assert.equal(nudge.title, 'Your clock moved by 6 hours');
  assert.equal(coachNudge({ date, hour: 9, zone: { shift: 1, changed: date } }), null);
}));

test("the swap the push offered waits on Today until it is answered", () => {
  const nudge = { eventId: "e1", date: "2026-10-15", sport: "ride", minutes: 45, name: "VO2max 5×4", fromMinutes: 75, title: "Dvě krátké noci za sebou", day: "2026-10-15", status: "pending" };
  assert.deepEqual(swapOffer({ nudge }, "2026-10-15"), { kind: "swap", id: "2026-10-15:swap", headline: "Dvě krátké noci za sebou", date: "2026-10-15", from: "VO2max 5×4 · 75 min", to: "Lehká jízda · 45 min" });
  assert.equal(swapOffer({ nudge: { ...nudge, status: "kept" } }, "2026-10-15"), null);
  assert.equal(swapOffer({ nudge }, "2026-10-16"), null);
});

test('the morning coach push stays silent on a hard day and only offers a swap (audit 25.1)', () => withLang('cs', () => {
  const today = { ...hard, date };
  assert.equal(coachNudge({ date, hour: 8, morning: true, recovery: { id: 'x' }, upcoming: [today], verdict: 'hard' }), null);
  assert.equal(coachNudge({ date, hour: 8, morning: true, recovery: { id: 'x' }, upcoming: [today], verdict: 'steady' }).body, 'Dnešní práh vyměním za lehkou jízdu 60 min?');
}));

test('the evening push knows swims and key gym days, and today\'s session still to do (audit 25.3, 25.4)', () => withLang('cs', () => {
  const tomorrow = '2026-10-16';
  const swim = { eventId: 'planned:10', date: tomorrow, sport: 'swim', name: 'Dlouhé plavání', minutes: 70, kind: 'endurance' };
  assert.equal(coachNudge({ date, hour: 18, evening: true, upcoming: [swim] }).body, 'Dnes jen klid a víc sacharidů k večeři.');
  const css = { eventId: 'planned:11', date: tomorrow, sport: 'swim', name: 'CSS 10×100', minutes: 45, kind: 'threshold' };
  assert.equal(coachNudge({ date, hour: 18, evening: true, upcoming: [css] }).body, 'Dnes jen klid a do postele včas, ať zítřejší intervaly sednou.');
  const legs = { eventId: 'planned:12', date: tomorrow, sport: 'gym', name: 'Dolní polovina těla', minutes: 60, kind: 'gym' };
  const g = coachNudge({ date, hour: 18, evening: true, upcoming: [legs] });
  assert.equal(g.title, 'Zítra Dolní polovina těla');
  assert.equal(g.body, 'Dnes jen klid a do postele včas, ať máš na zítřejší posilovnu síly.');
  assert.equal(withLang('en', () => coachNudge({ date, hour: 18, evening: true, upcoming: [{ ...legs, name: 'Full body' }] })).title, 'Tomorrow: Full body');
  // An upper-body day is not a key day.
  assert.equal(coachNudge({ date, hour: 18, evening: true, upcoming: [{ ...legs, name: 'Horní polovina těla' }] }), null);
  // A session still to do today: no "Dnes jen klid".
  const run = { eventId: 'planned:13', date, sport: 'run', name: 'Tempo 50 min', minutes: 50, kind: 'tempo' };
  const long = { eventId: 'planned:8', date: tomorrow, sport: 'ride', name: 'Dlouhá jízda', minutes: 180, kind: 'long' };
  assert.equal(coachNudge({ date, hour: 17, evening: true, upcoming: [run, long] }).body, 'Po dnešním tréninku víc sacharidů k večeři.');
  assert.equal(coachNudge({ date, hour: 17, evening: true, upcoming: [run, css] }).body, 'Dnešní trénink v klidu a do postele včas, ať zítřejší intervaly sednou.');
  assert.equal(coachNudge({ date, hour: 19, evening: true, upcoming: [{ ...run, done: true }, long] }).body, 'Dnes jen klid a víc sacharidů k večeři.');
  // A gym day is never swapped (the generator makes rides, runs and swims).
  assert.equal(coachNudge({ date, hour: 8, morning: true, recovery: { id: 'x' }, upcoming: [{ ...legs, date, kind: 'gym' }] }), null);
}));
