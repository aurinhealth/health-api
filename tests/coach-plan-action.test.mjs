import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { validateCoachActions, actionSummary, coachPlanTemplates, COACH_ACTION_FORMAT } from '../src/coach-actions.js';
import { getTemplate, planDays, planPreview, planSummary } from '../src/training-plans.js';
import { eventPlan } from '../src/app-training.js';

const blank = { eventId: '', date: '', sport: '', minutes: 0, status: '', statusUntil: '', fromExercise: '', toExercise: '', workoutId: '', kind: '', activityId: '', otherActivityId: '', time: '', kcal: 0, gymFocus: '', insisted: false, planId: '', days: [], raceKm: 0 };
const plan = more => ({ ...blank, type: 'plan', reason: 'Půlmaraton v březnu.', ...more });
const context = { week: [], athleteState: { status: 'active' }, userMessage: 'Chci v březnu uběhnout půlmaraton pod 1:50.' };
const today = '2026-10-24';

test('the coach reply format has the plan action and its fields', () => {
  const item = COACH_ACTION_FORMAT.schema.properties.actions.items;
  assert.ok(item.properties.type.enum.includes('plan'));
  for (const key of ['planId', 'days', 'raceKm']) assert.ok(item.required.includes(key), key);
  assert.ok(coachPlanTemplates().some(t => t.id === 'run-half' && t.raceKm === 21.1 && t.daysPerWeek.length === 2));
});

// "Chci v březnu uběhnout půlmaraton": the plan ends on race day, 12 weeks from the Monday 11 weeks before.
test('a race plan from the chat starts the weeks before the race', () => {
  const [a] = validateCoachActions([plan({ planId: 'run-half', date: '2027-03-21', days: [1, 3, 5, 6] })], context, today, { userInitiated: true });
  assert.equal(a.type, 'plan');
  assert.equal(a.planId, 'run-half');
  assert.equal(a.raceDate, '2027-03-21');
  assert.equal(a.startDate, '2026-12-28');
  assert.equal(a.raceKm, 21.1);
  assert.deepEqual(a.days, [1, 3, 5, 6]);
  assert.equal(a.weeksCount, 12);
  assert.match(actionSummary(a), /Založit plán Půlmaraton \(závod ne 21\. 3\.\)/);
});

test('a plan card needs a known template, the athlete asking, and a race far enough', () => {
  const v = (a, opts = { userInitiated: true }, ctx = context) => validateCoachActions([plan(a)], ctx, today, opts);
  assert.deepEqual(v({ planId: 'nope', date: '2027-03-21' }), []);
  assert.deepEqual(v({ planId: 'run-half', date: '2027-03-21' }, {}), []);
  // Three weeks before a 12-week plan's race is under 60 % of it.
  assert.deepEqual(v({ planId: 'run-half', date: '2026-11-15' }), []);
  assert.deepEqual(v({ planId: 'run-half', date: '2027-03-21' }, { userInitiated: true }, { ...context, athleteState: { status: 'sick' } }), []);
  // Days outside the plan's range fall back to the week plan; one plan per answer.
  const twice = validateCoachActions([plan({ planId: 'run-half', date: '2027-03-21', days: [0] }), plan({ planId: 'run-10k', date: '2027-03-21' })], context, today, { userInitiated: true });
  assert.equal(twice.length, 1);
  assert.equal(twice[0].days, undefined);
});

test('a plan without a race starts on the day asked, or this or next week', () => {
  const [ftp] = validateCoachActions([plan({ planId: 'ride-ftp', date: '' })], context, today, { userInitiated: true });
  assert.equal(ftp.startDate, '2026-10-26');
  assert.equal(ftp.raceDate, undefined);
  const [later] = validateCoachActions([plan({ planId: 'ride-ftp', date: '2026-11-04' })], context, today, { userInitiated: true });
  assert.equal(later.startDate, '2026-11-02');
  assert.equal(later.firstDay, '2026-11-04');
  assert.equal(later.requestedStart, '2026-11-04');
  const [ultra] = validateCoachActions([plan({ planId: 'run-ultra', date: '2027-06-20', raceKm: 80 })], context, today, { userInitiated: true });
  assert.equal(ultra.raceKm, 80);
});

// The card's weeks, days and the running plan it would end (entrypoint.js coachPlanPreview).
test('the plan card shows the weeks, the days and the plan it ends', async () => {
  const source = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  const from = source.indexOf('async function coachPlanPreview('), to = source.indexOf('\n// A finished ride or run plan');
  const prefs = { days: [[], ['run'], [], ['run'], [], ['run'], ['run']], availability: [] };
  const running = { templateId: 'ride-base', startDate: '2026-09-28', raceDate: null };
  const ctx = vm.createContext({ getTemplate, planDays, planPreview, planSummary, localToday: () => today,
    sportDays: (days, sport) => days.map((d, i) => d.includes(sport) ? i : null).filter(i => i != null),
    planTimeOf: p => ({ availability: p.availability }),
    getWeekPlan: async () => prefs, currentCtl: async () => 45, syncedPlans: async () => ({ active: running, gym: null }) });
  vm.runInContext(source.slice(from, to), ctx);
  const [a] = validateCoachActions([plan({ planId: 'run-half', date: '2027-03-21' })], context, today, { userInitiated: true });
  const card = await ctx.coachPlanPreview({}, {}, a);
  assert.equal(card.weeks.length, 12);
  assert.ok(card.weeks.at(-1).race);
  assert.deepEqual([...card.days], [1, 3, 5, 6]);
  assert.equal(card.sessions, 4);
  assert.ok(card.minutes[0] > 0 && card.minutes[0] <= card.minutes[1]);
  assert.equal(card.replaces.name, 'Kolo: základ');
  assert.equal(card.replaces.week, 4);
});

test('without a main race in the profile, Training counts down to the plan\'s race', () => {
  const e = eventPlan({ name: 'Půlmaraton', date: '2027-03-21' }, today);
  assert.equal(e.name, 'Půlmaraton');
  assert.equal(e.daysLeft, 148);
  const source = readFileSync(new URL('../src/app-training.js', import.meta.url), 'utf8');
  assert.match(source, /athleteFocus\(profile, date\)\.event \|\| planRace/);
});
