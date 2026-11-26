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
const ride = { id: 'planned:1', name: 'Endurance', type: 'Ride' };
const weekDays = [day('2026-11-05', [ride], [ride]), day('2026-11-06', [ride], [ride]), day('2026-11-07', [ride]), day('2026-11-08'),
  day('2026-11-09', [ride]), day('2026-11-10', [ride, { id: 'planned:2', name: 'Fuel', category: 'NUTRITION' }]), day(DATE, [ride])];
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
  assert.match(gapCheckin({ date: DATE, weekDays, sleep, wellness: wellness.slice(0, 2).concat({ id: '2026-11-08', hrv: 41 }), hrvLow: 50 }).note, /for 3 nights/, 'this morning not synced yet');
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
  const note = { id: 'planned:9', name: 'Holiday', category: 'NOTE' }, holiday = weekDays.map(d => d.date > '2026-11-06' ? day(d.date, [note]) : d);
  assert.equal(gapCheckin({ date: DATE, weekDays: holiday, sleep }), null, 'notes and holidays are no planned training');
  const walked = weekDays.map(d => d.date === '2026-11-09' ? day(d.date, [ride], [{ type: 'Walk' }]) : d);
  assert.equal(gapCheckin({ date: DATE, weekDays: walked, sleep }).key, '2026-11-06', 'a walk hides no gap');
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

// ---- Welcome back: one question, one flow (Petr 2026-11-26) ----
import { welcomeBack, welcomeAnswer, easierWeek } from '../src/coach-gap-checkin.js';
import { effectiveAthleteState } from '../src/athlete-state.js';

test('Welcome back asks the gap question with our statuses, one line on each and Not now', () => withLang('en', () => {
  const q = welcomeBack({ date: DATE, weekDays, sleep, wellness: [], state: {} });
  assert.equal(q.text, "I don't see a workout since Friday. How are things now?");
  assert.deepEqual(q.answers.map(a => a.id), ['elsewhere', 'break', 'sick', 'injured'], 'fixed order, none preselected');
  assert.equal(q.later, 'Not now');
  assert.match(q.outcomes, /your plan stays/);
  assert.equal(welcomeBack({ date: DATE, weekDays, sleep, wellness: [], state: { gapAsked: q.key } }), null, 'once per gap');
  assert.equal(welcomeBack({ date: DATE, weekDays, sleep, wellness: [], state: { status: 'sick' } }), null, 'never while Sick');
}));

test('Welcome back answers: elsewhere keeps the plan, a break of 14 days gives the easier week, Sick sets the status', () => withLang('en', () => {
  const q = { key: '2026-11-01', days: 18 };
  assert.deepEqual(welcomeAnswer(q, 'elsewhere').patch, { gapAsked: q.key, elsewhere: q.key });
  const pause = welcomeAnswer(q, 'break');
  assert.equal(pause.easierWeek, true);
  assert.match(pause.coach, /Two easy sessions first/);
  assert.equal(welcomeAnswer({ ...q, days: 30 }, 'break').coach.startsWith('No catching up. Three'), true);
  assert.equal(welcomeAnswer({ ...q, days: 5 }, 'break').easierWeek, false, '3 to 6 days change nothing');
  assert.match(welcomeAnswer({ ...q, days: 9 }, 'break').coach, /Today stays easy/);
  assert.deepEqual(welcomeAnswer(q, 'sick').patch, { gapAsked: q.key, status: 'sick' });
  assert.deepEqual(welcomeAnswer(q, 'later').patch, { gapAsked: q.key }, 'Not now: never asked again for this gap');
  assert.equal(welcomeAnswer(q, 'nonsense'), null);
}));

test('Rest with an end date ends: Welcome back without the question', () => withLang('en', () => {
  const state = effectiveAthleteState({ status: 'on_break', statusUntil: DATE }, DATE);
  const q = welcomeBack({ date: DATE, weekDays, sleep, wellness: [], state });
  assert.equal(q.ended, true);
  assert.deepEqual(q.answers, []);
}));

test('the easier week: first sessions of each sport easy and capped, the gym stays', () => withLang('en', () => {
  const plan = [
    day('2026-12-02', [{ id: 'planned:1', name: 'Tempo run', type: 'Run', durationHours: 50 / 60 }]),
    day('2026-12-03', [{ id: 'planned:2', name: 'Strength', type: 'WeightTraining', durationHours: 0.75 }]),
    day('2026-12-05', [{ id: 'planned:3', name: 'Easy run', type: 'Run', durationHours: 40 / 60 }]),
    day('2026-12-06', [{ id: 'planned:4', name: 'Long run', type: 'Run', durationHours: 100 / 60 }])
  ];
  const w = easierWeek({ date: '2026-12-02', weekDays: plan, since: '2026-11-14' });
  assert.deepEqual(w.rows.map(r => [r.name, r.minutes]), [['Easy run', 45], ['Strength', 45], ['Easy run', 40], ['Long run', 100]]);
  assert.deepEqual(w.rows[0].was, { name: 'Tempo run', minutes: 50 });
  const long = easierWeek({ date: '2026-12-02', weekDays: plan, since: '2026-11-01' });
  assert.deepEqual(long.rows.map(r => [r.name, r.minutes]), [['Easy run', 30], ['Strength', 45], ['Easy run', 40], ['Easy run', 45]], '28+ days: 3 sessions, the first 30 min');
}));
