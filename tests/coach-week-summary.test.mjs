import test from 'node:test';
import assert from 'node:assert/strict';
import { withLang } from '../src/lang.js';
import { weekSummary, summaryWeek } from '../src/coach-week-summary.js';

const START = '2026-11-09', SUNDAY = '2026-11-15';
const day = (date, planned = [], completed = []) => ({ date, daily: { training: { planned, completed } } });
const plan = (n, type, name = type) => ({ id: 'planned:' + n, type, name, durationHours: 1 });
const did = (type, hours, km) => ({ type, durationHours: hours, ...(km ? { payload: { distance: km * 1000 } } : {}) });
const days = [
  // The week before: 2 of 2.
  day('2026-11-03', [plan(1, 'Ride')], [did('Ride', 2, 60)]), day('2026-11-05', [plan(2, 'Run')], [did('Run', 1, 10)]),
  // This week: 4 of 5 planned, Thursday's tempo run missed, a walk does not count.
  day('2026-11-09', [plan(3, 'Ride')], [did('Ride', 1.25, 40)]), day('2026-11-10', [plan(4, 'Run', 'Tempo run')], [did('Run', 0.75, 9.6)]),
  day('2026-11-11', [plan(5, 'WeightTraining', 'Upper body')], [did('WeightTraining', 0.75)]), day('2026-11-12', [plan(6, 'Run', 'Tempo run'), { id: 'planned:7', category: 'NOTE', type: 'Run', name: 'Note' }], [did('Walk', 1)]),
  day('2026-11-14', [plan(8, 'Ride', 'Long ride')], [did('Ride', 2.5, 56)]), day('2026-11-15', [], [did('Run', 1, 10)])
];
const sleep = [...Array.from({ length: 28 }, (_, i) => ({ date: new Date(Date.parse('2026-10-12T12:00:00Z') + i * 864e5).toISOString().slice(0, 10), durationMin: 445 })),
  ...Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.parse(START + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10), durationMin: 425 })), { date: '2026-11-10', durationMin: 30, nap: true }];

test('the week in numbers, against the week before, by sport in the app order', () => withLang('en', () => {
  const s = weekSummary({ start: START, today: SUNDAY, days, sleep, load: { state: 'ready', level: 'above', text: 'This week was a little harder than your last four.', ratio: 1.12 } });
  assert.equal(s.end, SUNDAY);
  assert.deepEqual(s.workouts, { done: 5, planned: 5, was: { done: 2, planned: 2 } });
  assert.equal(s.headline, 'Good week: 4 of 5 planned workouts done.', 'Sunday\'s extra run does not make up the missed tempo run');
  assert.deepEqual(s.minutes, { total: 375, was: 180 });
  assert.deepEqual(s.sports.map(x => [x.sport, x.done, x.planned, x.km ?? null]), [['ride', 2, 2, 96], ['run', 2, 2, 19.6], ['gym', 1, 1, null]]);
  assert.deepEqual(s.missed, [{ date: '2026-11-12', sport: 'run', name: 'Tempo run' }]);
  // Words only: the ratio never leaves the server.
  assert.deepEqual(s.load, { state: 'ready', level: 'above', text: 'This week was a little harder than your last four.' });
  assert.equal(s.sleep.text, 'Sleep averaged 7 h 5 min, about 20 min under your usual.');
  assert.equal(s.from, 'From your workouts and sleep this week');
}));

test('headlines from the share done, Czech, and a week still going', () => {
  const short = days.filter(d => !['2026-11-14', '2026-11-15'].includes(d.date)).concat(day('2026-11-14', [plan(8, 'Ride')]), day('2026-11-13', [plan(9, 'Swim')]));
  assert.equal(withLang('en', () => weekSummary({ start: START, today: SUNDAY, days: short }).headline), 'A lighter week than planned: 3 of 6 done.');
  assert.equal(withLang('cs', () => weekSummary({ start: START, today: SUNDAY, days }).headline), 'Dobrý týden, hotovo 4 z 5 plánovaných tréninků.');
  assert.equal(withLang('en', () => weekSummary({ start: START, today: SUNDAY, days: days.filter(d => d.date !== '2026-11-12') }).headline), 'Every planned workout done.');
  assert.equal(withLang('cs', () => weekSummary({ start: START, today: SUNDAY, days, sleep }).sleep.text), 'Spal jsi v průměru 7 h 5 min, asi o 20 min méně než obvykle.');
  const wed = withLang('en', () => weekSummary({ start: START, today: '2026-11-11', days }));
  assert.deepEqual([wed.workouts.done, wed.workouts.planned, wed.missed.length], [3, 3, 0]);
  assert.equal(withLang('en', () => weekSummary({ start: START, today: SUNDAY, days: [] })).headline, 'No workouts this week.');
  assert.equal(weekSummary({ start: START, today: SUNDAY, days: [] }).sleep, null);
});

test('Sunday sums up its own week, other days the week before', () => {
  assert.equal(summaryWeek(SUNDAY, START), START);
  assert.equal(summaryWeek('2026-11-16', '2026-11-16'), START);
});

test('the Sunday message: from Sunday 18:00 to Monday, in words, without activity names', async () => {
  const { summaryDue, summaryText, postWeekSummary } = await import('../src/coach-week-summary.js');
  assert.deepEqual([summaryDue(SUNDAY, 17), summaryDue(SUNDAY, 18), summaryDue('2026-11-16', 9), summaryDue('2026-11-17', 20)], [false, true, true, false]);
  const s = withLang('en', () => weekSummary({ start: START, today: SUNDAY, days, sleep, load: { state: 'ready', level: 'above', text: 'This week was a little harder than your last four.' } }));
  assert.equal(withLang('en', () => summaryText(s)), 'Good week: 4 of 5 planned workouts done.\n\nMissed: the run on Thursday. Sleep averaged 7 h 5 min, about 20 min under your usual. This week was a little harder than your last four.');
  assert.equal(withLang('cs', () => summaryText(weekSummary({ start: START, today: SUNDAY, days }))), 'Dobrý týden, hotovo 4 z 5 plánovaných tréninků.\n\nVynechané: běh ve čtvrtek.');
  assert.doesNotMatch(withLang('en', () => summaryText(s)), /Tempo run/, 'names from other services stay out of the text the model reads');
  assert.equal(await postWeekSummary({}, s, { posted: { week: { key: START } } }), null, 'once a week');
});
