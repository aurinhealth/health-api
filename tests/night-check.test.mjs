import test from 'node:test';
import assert from 'node:assert/strict';
import { nightOffValues, easierDayCard, restingHRAbove } from '../src/night-check.js';
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
  assert.deepEqual(card.rows.map(r => r.value), ['+0,8 °C proti obvyklému', '+2,0 /min proti obvyklému', '−24 % proti obvyklému', '+7 tepů/min proti obvyklému']);
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

test('the resting heart rate alone: two nights above, or one with HRV under its range, against its own range', () => {
  const rhr = z => ({ value: 60, baseline: 51, z, days: 30 });
  const high = { components: { restingHR: rhr(2.3) } }, before = { components: { restingHR: rhr(2.1) } };
  assert.equal(restingHRAbove(high, null), false, 'one night is not enough');
  assert.equal(restingHRAbove(high, before), true);
  assert.equal(restingHRAbove(high, { components: { restingHR: rhr(1.5) } }), false);
  assert.equal(restingHRAbove({ components: { restingHR: rhr(2.3), hrv: { value: 38, baseline: 50, z: -1.4 } } }, null), true);
  assert.equal(restingHRAbove({ components: { restingHR: rhr(1.9) } }, before), false);
  // A range borrowed from another watch: no signal.
  assert.equal(restingHRAbove({ ...high, flags: ['restingHRMixed'] }, before), false);
  assert.equal(restingHRAbove({ ...high, provisional: true }, before), false);
  assert.equal(restingHRAbove(high, { ...before, flags: ['restingHRMixed'] }), false);
  for (const lang of ['cs', 'en']) {
    const card = withLang(lang, () => easierDayCard({ date, readiness: high, yesterday: before }));
    assert.equal(card.signal, 'restingHR');
    assert.deepEqual(card.rows.map(r => r.id), ['restingHR']);
    assert.doesNotMatch(card.headline + ' ' + card.message, ILLNESS, lang);
    const push = withLang(lang, () => coachNudge({ date, hour: 8, morning: true, easier: card }));
    assert.doesNotMatch(push.body, ILLNESS, lang);
  }
  const en = withLang('en', () => easierDayCard({ date, readiness: high, yesterday: before }));
  assert.equal(en.rows[0].value, '+9 bpm vs usual');
  assert.equal(en.message, 'Resting heart rate is above your usual range. Alcohol, heat, a late meal, stress or hard training can do this.');
  assert.match(withLang('en', () => coachNudge({ date, hour: 8, morning: true, easier: en })).body, /^Resting heart rate is above your usual range\. /);
  // Dismissed or with today's swap like the night card.
  assert.equal(easierDayCard({ date, readiness: high, yesterday: before, state: { dismissed: [date + ':easier'] } }), null);
  const hard = hardSession([{ eventId: 'planned:7', date, sport: 'run', kind: 'threshold', name: 'Tempo', minutes: 50 }], [date]);
  const state = { nudge: { ...easierSwap(hard), title: 'x', day: date, status: 'pending' } };
  assert.equal(easierDayCard({ date, readiness: high, yesterday: before, state, offer: swapOffer(state, date) }).date, date);
  // With the warmer night the night card wins.
  assert.equal(easierDayCard({ date, readiness: off, yesterday: before }).signal, 'night');
});

test('through the real readiness: a steady rise for two nights fires, a new watch with a higher offset does not', async () => {
  const { readinessFor } = await import('../src/readiness.js');
  const day = o => new Date(Date.parse(date + 'T12:00:00Z') + o * 86400000).toISOString().slice(0, 10);
  const nights = Array.from({ length: 40 }, (_, i) => ({ date: day(i - 39), startTime: day(i - 40) + 'T22:00:00Z', endTime: day(i - 39) + 'T06:00:00Z', durationMin: 450, timeInBedMin: 470 }));
  const rows = rise => Array.from({ length: 40 }, (_, i) => { const o = i - 39; return { id: day(o), hrv: 55 + (i % 3), hrvSource: 'google-wearables', restingHR: (o >= -1 ? 50 + rise : 49 + (i % 3)), restingHRSource: 'google-wearables' }; });
  const on = (google, d) => readinessFor({ date: d, google, intervals: [], sessions: nights, profile: { age: 38 } });
  const up = rows(8);
  assert.equal(restingHRAbove(on(up, date), on(up, day(-1))), true);
  assert.equal(restingHRAbove(on(rows(1), date), on(rows(1), day(-1))), false);
  // 38 nights on one watch, then two on a new one reading 6 higher: the range is borrowed.
  const moved = up.map((r, i) => i >= 38 ? { ...r, restingHR: 56, restingHRSource: 'apple-health', hrvSource: 'apple-health' } : r);
  assert.equal(restingHRAbove(on(moved, date), on(moved, day(-1))), false);
});
