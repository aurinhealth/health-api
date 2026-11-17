import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealth } from '../src/app-health.js';
import { withLang } from '../src/lang.js';
import { assistantStreamResponse } from '../src/assistant-stream.js';
import { bodySteps, reviewStep, todayStep, notesStep, writingStep, checkStep, stepList } from '../src/coach-steps.js';

const DATE = '2026-10-08';
const day = offset => new Date(Date.parse(DATE + 'T12:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
const wellness = Array.from({ length: 40 }, (_, i) => ({ id: day(i - 39), hrv: i === 39 ? 66 : 56 + (i % 5), restingHR: 50 + (i % 3) }));
const sessions = Array.from({ length: 20 }, (_, i) => {
  const date = day(i - 19);
  return { date, startTime: day(i - 20) + 'T21:48:00Z', endTime: date + 'T05:02:00Z', durationMin: 432, timeInBedMin: 450, stages: { DEEP: 80, REM: 90, LIGHT: 250, AWAKE: 12 } };
});
const profile = { age: 38 };

test('sleep and HRV steps carry the numbers Health shows for the same day', () => withLang('en', () => {
  const steps = bodySteps({ date: DATE, inputs: { health: { wellness, sleep: sessions }, fitness: { wellness: [] }, profile } });
  const health = buildHealth({ date: DATE, health: { wellness }, fitness: { wellness: [] }, sleep: { sessions }, profile });
  assert.deepEqual(steps.map(s => s.id), ['sleep', 'hrv']);
  assert.match(steps[0].text, /^Last night you slept 7 h 12\./);
  const hrv = steps[1];
  assert.equal(hrv.view, 'hrv');
  assert.equal(hrv.text, `This morning your HRV was ${health.hrv.value} ms, above your usual range of ${health.hrv.low} to ${health.hrv.high} ms.`);
}));

test('no data, no body steps; Czech texts without the model', () => withLang('cs', () => {
  assert.deepEqual(bodySteps({ date: DATE, inputs: {} }), []);
  assert.equal(todayStep([]).text, 'Na dnešek nemáš nic naplánováno.');
  assert.equal(writingStep().title, 'Píšu odpověď');
}));

test('review, today, notes and writing steps from the loaded data', () => withLang('en', () => {
  assert.equal(reviewStep([]), null);
  const ride = reviewStep([{ name: 'Easy ride', type: 'Ride', durationHours: 1.25, tss: 62 }], 'done');
  assert.deepEqual(ride, { id: 'review', icon: 'bicycle', title: 'Reviewing your last ride', text: 'Easy ride 75 min, 62 TSS.', status: 'done' });
  assert.equal(reviewStep([{ name: 'Tempo', type: 'Run', durationHours: 0.5 }]).title, 'Reviewing your last run');
  assert.equal(todayStep([{ name: 'VO2max 5×4 min', durationHours: 1.25 }]).text, 'Planned for today: VO2max 5×4 min, 75 min.');
  assert.equal(notesStep([], []), null);
  assert.equal(notesStep([{ text: 'Legs heavy after Sunday' }], ['Rides outdoors', 'Gym twice a week']).text, '1 note, 2 things I remember about you. Newest: „Legs heavy after Sunday“');
  assert.equal(checkStep('done').status, 'done');
}));

test('a step id keeps its place and its latest state', () => {
  const steps = stepList();
  steps.add(writingStep());
  steps.add(checkStep());
  steps.add(writingStep('done'));
  steps.add(null);
  assert.deepEqual(steps.list.map(s => [s.id, s.status]), [['writing', 'done'], ['check', 'running']]);
});

test('the stream sends each step as its own event', async () => {
  const response = assistantStreamResponse(async (answer, progress, chat, step) => { step(writingStep()); answer('Hi'); step(writingStep('done')); return { answer: 'Hi' }; });
  const events = (await response.text()).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(e => e.type), ['start', 'step', 'answer', 'step', 'done']);
  assert.equal(events[3].step.status, 'done');
});
