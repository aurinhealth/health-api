import test from 'node:test';
import assert from 'node:assert/strict';
import { nightOffValues, easierDayCard } from '../src/night-check.js';
import { coachNudge, easierSwap, hardSession, swapOffer } from '../src/coach-push.js';
import { withLang } from '../src/lang.js';

const date = '2026-10-14';
const off = { components: {
  wristTemp: { deviation: 0.8, raised: true, elevated: false },
  respiration: { value: 17.4, baseline: 15.4, elevated: true },
  hrv: { value: 38, baseline: 50, z: -1.6 },
  restingHR: { value: 58, baseline: 51, z: 2.1 },
} };
// MDR (Today audit 1, 12, D2): the card speaks of load and recovery, never of an illness.
const ILLNESS = /nemoc|sick|ill|nachlaz|cold|infek|infect|horečk|fever|lékař|doctor|abnorm|normál|normal/i;

test('a raised temperature with another value shows the easier-day card with each value against the usual', () => {
  const card = easierDayCard({ date, readiness: off });
  assert.equal(card.kind, 'easier_day');
  assert.equal(card.id, date + ':easier');
  assert.deepEqual(card.rows.map(r => r.id), ['temperature', 'respiration', 'hrv', 'restingHR']);
  assert.deepEqual(card.rows.map(r => r.value), ['+0,8 °C proti obvyklému', '+2,0 /min proti obvyklému', '−24 % proti obvyklému', '+7 proti obvyklému']);
  assert.equal(withLang('en', () => easierDayCard({ date, readiness: off })).rows[0].value, '+0.8 °C vs usual');
  for (const lang of ['cs', 'en']) {
    const c = withLang(lang, () => easierDayCard({ date, readiness: off }));
    assert.doesNotMatch(c.headline + ' ' + c.message, ILLNESS, lang);
  }
  assert.equal(withLang('en', () => easierDayCard({ date, readiness: off })).headline, 'An easier day fits today');
  assert.equal('sessions' in card, false, 'no Sick sheet: nothing to cancel');
});

test('the card carries today\'s swap when one is offered', () => {
  const hard = hardSession([{ eventId: 'planned:7', date, sport: 'ride', kind: 'vo2max', name: 'VO2max 5×4', minutes: 75 }], [date]);
  const nudge = { ...easierSwap(hard), title: 'x', day: date, status: 'pending' };
  const state = { nudge };
  const card = withLang('en', () => easierDayCard({ date, readiness: off, state, offer: swapOffer(state, date) }));
  assert.equal(card.from, 'VO2max 5×4 · 75 min');
  assert.equal(card.to, 'Easy ride · 60 min');
  assert.equal(card.date, date);
  // Swapped or kept: the card has done its job today.
  assert.equal(easierDayCard({ date, readiness: off, state: { nudge: { ...nudge, status: 'kept' } } }), null);
  assert.equal(easierDayCard({ date, readiness: off, state: { nudge: { ...nudge, status: 'swapped' } } }), null);
  // Tomorrow's session kept or swapped from the push leaves today's card.
  const tomorrow = { ...nudge, date: '2026-10-15', status: 'kept' };
  assert.ok(easierDayCard({ date, readiness: off, state: { nudge: tomorrow } }));
});

test('no card without a temperature or breathing value, for one value, when not training or dismissed', () => {
  assert.deepEqual(nightOffValues({ components: { hrv: off.components.hrv, restingHR: off.components.restingHR } }), []);
  assert.deepEqual(nightOffValues({ components: { wristTemp: off.components.wristTemp } }), []);
  assert.equal(easierDayCard({ date, readiness: off, state: { status: 'sick' } }), null);
  assert.equal(easierDayCard({ date, readiness: off, state: { status: 'active', dismissed: [date + ':easier'] } }), null);
  assert.equal(easierDayCard({ date, readiness: null }), null);
});

test('the coach push says an easier day fits, never to switch to Sick', () => {
  const easier = withLang('en', () => easierDayCard({ date, readiness: off }));
  const m = withLang('en', () => coachNudge({ date, hour: 8, morning: true, easier }));
  assert.equal(m.kind, 'easier_day');
  assert.equal(m.title, 'An easier day fits today');
  assert.doesNotMatch(m.body, ILLNESS);
  // Today's button is promised only with a hard ride or run today to swap.
  assert.match(m.body, /Keep today's training easy\.$/);
  const upcoming = [{ eventId: 'planned:7', date, sport: 'ride', kind: 'vo2max', name: 'VO2max 5×4', minutes: 75 }];
  assert.match(withLang('en', () => coachNudge({ date, hour: 8, morning: true, easier, upcoming })).body, /On Today you can make today easier\.$/);
});
