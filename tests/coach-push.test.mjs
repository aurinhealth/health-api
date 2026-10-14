import test from 'node:test';
import assert from 'node:assert/strict';
import { coachNudge, shortNights, zoneShiftHours } from '../src/coach-push.js';
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
  assert.deepEqual(nudge.swap, { eventId: 'planned:7', date: '2026-10-16', sport: 'ride', environment: 'outdoor', minutes: 60, kind: 'endurance', name: 'Práh 4×8' });
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
