import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';
import { withLang } from '../src/lang.js';
import { gapCheckin, postGapCheckin, gapChips } from '../src/coach-gap-checkin.js';
import { takeChipAnswer, questionChips } from '../src/coach-questions.js';
import { getAthleteState } from '../src/athlete-state.js';

// Wednesday 2026-11-11: last ride on Friday the 6th, the plan had Saturday, Monday and Tuesday.
const DATE = '2026-11-11';
const day = (date, planned = [], completed = []) => ({ date, daily: { training: { planned, completed } } });
const ride = { name: 'Endurance', type: 'Ride' };
const weekDays = [day('2026-11-05', [ride], [ride]), day('2026-11-06', [ride], [ride]), day('2026-11-07', [ride]), day('2026-11-08'),
  day('2026-11-09', [ride]), day('2026-11-10', [ride, { name: 'Nutrition' }]), day(DATE, [ride])];
const sleep = [{ date: '2026-11-11', durationMin: 420 }];
const wellness = ['2026-11-09', '2026-11-10', '2026-11-11'].map(id => ({ id, hrv: 40 }));

test('a gap in planned training after a sync asks once, with our statuses in a fixed order', () => withLang('en', () => {
  const q = gapCheckin({ date: DATE, weekDays, sleep, wellness, hrvLow: 50 });
  assert.equal(q.key, '2026-11-06');
  assert.equal(q.text, "I don't see a workout since Friday.\n\nHow are things?");
  assert.deepEqual(q.chips, ['All good', 'Rest', 'Sick', 'Injured']);
  assert.equal(q.note, 'Your recovery numbers have been below your usual range for 3 nights. Sleep, stress, heat, alcohol or hard training can do this.');
  // The data line never changes the chips, and never asks about illness.
  assert.deepEqual(gapCheckin({ date: DATE, weekDays, sleep, wellness, hrvLow: 30 }).chips, q.chips);
  assert.equal(gapCheckin({ date: DATE, weekDays, sleep, wellness, hrvLow: 30 }).note, undefined);
  assert.doesNotMatch(JSON.stringify(q), /ill|sick\?|getting/i);
}));

test('no question without a sync, a real gap, an active status or once asked', () => withLang('en', () => {
  assert.equal(gapCheckin({ date: DATE, weekDays, sleep: [], wellness: [] }), null, 'the watch did not sync after the last missed session');
  assert.equal(gapCheckin({ date: DATE, weekDays, sleep: [{ date: '2026-11-10' }] }), null, 'synced only before the last missed session');
  assert.equal(gapCheckin({ date: DATE, weekDays: weekDays.map(d => ['2026-11-09', '2026-11-10'].includes(d.date) ? day(d.date) : d), sleep }), null, 'one missed session is no gap');
  assert.equal(gapCheckin({ date: '2026-11-08', weekDays, sleep: [{ date: '2026-11-09' }] }), null, 'two days are no gap');
  assert.equal(gapCheckin({ date: DATE, weekDays, sleep, state: { status: 'sick' } }), null);
  assert.equal(gapCheckin({ date: DATE, weekDays, sleep, state: { gapAsked: '2026-11-06' } }), null);
  assert.equal(gapCheckin({ date: DATE, weekDays: weekDays.map(d => day(d.date, [ride])), sleep }), null, 'no workout at all: a new account');
  assert.equal(gapCheckin({ date: DATE, weekDays: [...weekDays.slice(0, -1), day(DATE, [ride], [ride])], sleep }), null, 'trained today');
}));

test('Czech: since a weekday, and a date before that', () => withLang('cs', () => {
  assert.equal(gapCheckin({ date: DATE, weekDays, sleep }).text, 'Od pátku nevidím žádný trénink.\n\nJak se máš?');
  assert.deepEqual(gapChips(), ['V pohodě', 'Odpočinek', 'Nemoc', 'Zranění']);
  const long = [day('2026-11-02', [ride], [ride]), ...weekDays.slice(2)];
  assert.match(gapCheckin({ date: DATE, weekDays: long, sleep }).text, /^Od 2\. 11\. nevidím/);
}));

test('posted as a new chat whose chip is a free reply, and the gap is marked asked', async () => {
  const db = scopedDb(createD1(), 1);
  const q = withLang('en', () => gapCheckin({ date: DATE, weekDays, sleep, wellness, hrvLow: 50 }));
  const posted = await postGapCheckin(db, q);
  assert.ok(posted.chatId && posted.messageId);
  assert.deepEqual(await questionChips(db, posted.chatId, posted.messageId), ['All good', 'Rest', 'Sick', 'Injured']);
  assert.equal(await takeChipAnswer(db, posted.chatId, { messageId: posted.messageId, chip: 'Sick' }, 'Sick'), true);
  assert.equal((await getAthleteState(db)).gapAsked, '2026-11-06');
  assert.equal(await postGapCheckin(db, null), null);
});
