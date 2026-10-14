import test from 'node:test';
import assert from 'node:assert/strict';
import { getAthleteState, updateAthleteState, memoryList, memoryCheck, memoryChanges } from '../src/athlete-state.js';
import { coachAnswerText } from '../src/coach-assistant.js';
import { COACH_ACTION_FORMAT } from '../src/coach-actions.js';
import { scopedDb } from '../src/tenancy.js';
import { createD1 } from './helpers/d1.mjs';

const date = '2026-10-14';

test('a pain is checked after two weeks, a taste is not', async () => {
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { memory: 'Nechci běhat, bolí mě koleno' }, { date });
  await updateAthleteState(db, { memory: 'Mám rád dlouhé jízdy o víkendu' }, { date });
  const state = await getAthleteState(db, { date });
  assert.deepEqual(memoryList(state).map(m => m.check), ['2026-10-28', null]);
  assert.equal(memoryCheck(state, '2026-10-27'), null);
  const due = memoryCheck(state, '2026-10-28');
  assert.equal(due.kind, 'memory_check');
  assert.equal(due.memory, 'Nechci běhat, bolí mě koleno');
  // "Still true" asks again in two weeks; "no longer" forgets it.
  const kept = await updateAthleteState(db, { keep: due.memory }, { date: '2026-10-28' });
  assert.equal(memoryCheck(kept, '2026-10-28'), null);
  assert.equal(memoryList(kept)[0].check, '2026-11-11');
  const gone = await updateAthleteState(db, { forget: due.memory }, { date: '2026-10-28' });
  assert.deepEqual(gone.memories, ['Mám rád dlouhé jízdy o víkendu']);
  assert.equal(gone.memoryMeta['Nechci běhat, bolí mě koleno'], undefined);
});

test('editing keeps the place in the list and an empty edit is refused', async () => {
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { memory: 'Kolo jen v úterý' }, { date });
  await updateAthleteState(db, { memory: 'Preferuju kolo před posilovnou' }, { date });
  const state = await updateAthleteState(db, { edit: { from: 'Kolo jen v úterý', to: 'Kolo jen o víkendu' } }, { date });
  assert.deepEqual(state.memories, ['Kolo jen o víkendu', 'Preferuju kolo před posilovnou']);
  await assert.rejects(updateAthleteState(db, { edit: { from: 'Kolo jen o víkendu', to: '  ' } }, { date }));
});

test('the answer may forget or rewrite only memories saved word for word', () => {
  const memories = ['Nechci běhat, bolí mě koleno', 'Kolo jen v úterý'];
  const changes = memoryChanges({
    forget: ['Nechci běhat, bolí mě koleno', 'Něco, co neexistuje'],
    update: [{ from: 'Kolo jen v úterý', to: 'Kolo jen o víkendu' }, { from: 'Kolo jen v úterý', to: 'Znovu' }, { from: 'Neznámé', to: 'X' }],
  }, memories);
  assert.deepEqual(changes, { forgotten: ['Nechci běhat, bolí mě koleno'], updated: [{ from: 'Kolo jen v úterý', to: 'Kolo jen o víkendu' }] });
  assert.deepEqual(memoryChanges({ forget: [], update: [{ from: 'Kolo jen v úterý', to: 'Kolo jen v úterý' }] }, memories), { forgotten: [], updated: [] });
  assert.deepEqual(memoryChanges(undefined, memories), { forgotten: [], updated: [] });
});

test('the reply format carries memory changes and the parser reads them', () => {
  assert.ok(COACH_ACTION_FORMAT.schema.required.includes('memory'));
  const reply = coachAnswerText(JSON.stringify({ answer: 'Super, běhy vracím.', visuals: [], actions: [], memory: { forget: ['Nechci běhat, bolí mě koleno'], update: [] } }), { actions: true });
  assert.deepEqual(reply.memory.forget, ['Nechci běhat, bolí mě koleno']);
  assert.deepEqual(coachAnswerText('plain', { actions: true }).memory, { forget: [], update: [] });
});
