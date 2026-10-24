import test from 'node:test';
import assert from 'node:assert/strict';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb, PERSONAL_TABLES } from '../src/tenancy.js';
import { getWeekPlan, saveWeekPlan, addWeekSport } from '../src/week-planner.js';
import { trainingBudget } from '../src/training-availability.js';
import { saveCalendarFree, clearCalendarFree, calendarFree, calendarMinutes, sanitizeCalendarDays } from '../src/calendar-free.js';

const today = '2026-10-13';

test('the calendar caps a day by its free time, never lengthens it and keeps short gaps as no time', () => {
  assert.equal(calendarMinutes(90, 45), 45);
  assert.equal(calendarMinutes(60, 300), 60);
  assert.equal(calendarMinutes(75, 15), 0);
  assert.equal(calendarMinutes(0, 200), 0);
  assert.equal(calendarMinutes(null, 50), 50);
  assert.equal(calendarMinutes(null, 600), null);
  assert.equal(calendarMinutes(90, null), 90);
});

test('only dates from yesterday to two weeks ahead with minutes are kept', () => {
  const days = sanitizeCalendarDays([{ date: '2026-10-14', minutes: 44.6 }, { date: '2026-10-01', minutes: 30 }, { date: '2026-11-30', minutes: 30 }, { date: 'x', minutes: 1 }, { date: '2026-10-13', minutes: 0 }], today);
  assert.deepEqual(days, [{ date: '2026-10-13', minutes: 0 }, { date: '2026-10-14', minutes: 45 }]);
  assert.throws(() => sanitizeCalendarDays([{ date: '2026-10-14', minutes: 2000 }], today));
  assert.throws(() => sanitizeCalendarDays(null, today));
});

test("a week's plan follows the calendar, saves the athlete's own time and forgets the calendar when it is turned off", async () => {
  assert.ok(PERSONAL_TABLES.calendar_free);
  const raw = createD1(), a = scopedDb(raw, 1), b = scopedDb(raw, 2);
  await saveWeekPlan(a, { availability: [{ minutes: 60 }, { minutes: 90 }, { minutes: 45 }, { minutes: 75 }, { minutes: 0 }, { minutes: 150 }, { minutes: 60 }], days: [['gym'], ['ride'], ['run'], ['ride'], [], ['ride'], ['run']] });
  await saveWeekPlan(b, { availability: [{ minutes: 60 }, { minutes: 90 }] });
  await saveCalendarFree(a, [{ date: '2026-10-13', minutes: 45 }, { date: '2026-10-15', minutes: 10 }, { date: '2026-10-17', minutes: 600 }], today);

  const week = await getWeekPlan(a, '2026-10-12');
  assert.deepEqual(week.availability.map(d => d.minutes), [60, 45, 45, 0, 0, 150, 60]);
  assert.deepEqual([week.availability[1].ownMinutes, week.availability[1].calendarMinutes], [90, 45]);
  assert.equal(trainingBudget(week, '2026-10-13', 120), 45);
  // The usual week, the next week and another athlete stay as they were.
  assert.equal((await getWeekPlan(a)).availability[1].minutes, 90);
  assert.equal((await getWeekPlan(a, '2026-10-19')).availability[1].minutes, 90);
  assert.equal((await getWeekPlan(b, '2026-10-12')).availability[1].minutes, 90);

  // Saving the week as it was read keeps the athlete's own 1 h 30 on Tuesday.
  await saveWeekPlan(a, { ...week, weeklyActivities: 5 }, '2026-10-12');
  await addWeekSport(a, '2026-10-15', 'gym');
  await clearCalendarFree(a);
  assert.deepEqual((await getWeekPlan(a, '2026-10-12')).availability.map(d => d.minutes), [60, 90, 45, 75, 0, 150, 60]);
  assert.deepEqual(await calendarFree(a, '2026-10-12', '2026-10-18'), {});
});

test('a new reading replaces the days it sends and drops days older than a week', async () => {
  const db = scopedDb(createD1(), 3);
  await saveCalendarFree(db, [{ date: '2026-10-13', minutes: 30 }, { date: '2026-10-14', minutes: 40 }], today);
  await saveCalendarFree(db, [{ date: '2026-10-14', minutes: 120 }], '2026-10-14');
  assert.deepEqual(await calendarFree(db, '2026-10-01', '2026-10-31'), { '2026-10-13': 30, '2026-10-14': 120 });
  await saveCalendarFree(db, [{ date: '2026-10-25', minutes: 60 }], '2026-10-24');
  assert.deepEqual(await calendarFree(db, '2026-10-01', '2026-10-31'), { '2026-10-25': 60 });
});
