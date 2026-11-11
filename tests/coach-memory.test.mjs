import test from 'node:test';
import assert from 'node:assert/strict';
import { getAthleteState, updateAthleteState, memoryList, memoryCheck, memoryChanges, healthMemorySince, statusCheck, heartSince } from '../src/athlete-state.js';
import { checkDays, heartSymptom } from '../src/pain-words.js';
import { readFileSync } from 'node:fs';
import { coachAnswerText } from '../src/coach-assistant.js';
import { COACH_ACTION_FORMAT } from '../src/coach-actions.js';
import { scopedDb } from '../src/tenancy.js';
import { createD1 } from './helpers/d1.mjs';

const date = '2026-10-14';

test('a pain is checked after a week, a taste is not (audit 2026-11-07, point 6)', async () => {
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { memory: 'Nechci běhat, bolí mě koleno' }, { date });
  await updateAthleteState(db, { memory: 'Mám rád dlouhé jízdy o víkendu' }, { date });
  const state = await getAthleteState(db, { date });
  assert.deepEqual(memoryList(state).map(m => m.check), ['2026-10-21', null]);
  assert.equal(memoryCheck(state, '2026-10-20'), null);
  const due = memoryCheck(state, '2026-10-21');
  assert.equal(due.kind, 'memory_check');
  assert.equal(due.memory, 'Nechci běhat, bolí mě koleno');
  // "Still true" asks again in two weeks; "no longer" forgets it.
  const kept = await updateAthleteState(db, { keep: due.memory }, { date: '2026-10-21' });
  assert.equal(memoryCheck(kept, '2026-10-21'), null);
  assert.equal(memoryList(kept)[0].check, '2026-11-04');
  const gone = await updateAthleteState(db, { forget: due.memory }, { date: '2026-10-21' });
  assert.deepEqual(gone.memories, ['Mám rád dlouhé jízdy o víkendu']);
  assert.equal(gone.memoryMeta['Nechci běhat, bolí mě koleno'], undefined);
});

test('an illness is checked after 3 days, a pain after 7, a pregnancy after 90; "still true" waits two weeks at least', async () => {
  assert.deepEqual(['Jsem nachlazený', 'Bolí mě rameno', 'Jsem těhotná', 'I have the flu', 'Mám rád kolo'].map(checkDays), [3, 7, 90, 3, null]);
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { memory: 'Jsem těhotná' }, { date });
  await updateAthleteState(db, { memory: 'Mám chřipku' }, { date });
  const state = await getAthleteState(db, { date });
  assert.deepEqual(memoryList(state).map(m => m.check), ['2027-01-12', '2026-10-17']);
  const kept = await updateAthleteState(db, { keep: 'Mám chřipku' }, { date: '2026-10-17' });
  assert.equal(memoryList(kept)[1].check, '2026-10-31');
});

test('Nemoc or Zranění without an end day: "Je ti už líp?" after 3 or 7 days, every 3 or 7 days until answered (point 3)', () => {
  const sick = { status: 'sick', statusUntil: null, changedAt: date + 'T08:00:00.000Z', dismissed: [] };
  assert.equal(statusCheck(sick, '2026-10-16'), null);
  const due = statusCheck(sick, '2026-10-17');
  assert.equal(due.kind, 'status_check'); assert.equal(due.headline, 'Je ti už líp?'); assert.deepEqual(due.reasons, ['Nemoc máš zapnutou 3 dny.']);
  // "Ještě ne" dismisses this round only; the next comes three days later.
  assert.equal(statusCheck({ ...sick, dismissed: [due.id] }, '2026-10-19'), null);
  assert.ok(statusCheck({ ...sick, dismissed: [due.id] }, '2026-10-20'));
  assert.equal(statusCheck({ ...sick, statusUntil: '2026-10-30' }, '2026-10-20'), null);
  assert.equal(statusCheck({ ...sick, status: 'injured' }, '2026-10-20'), null);
  assert.equal(statusCheck({ ...sick, status: 'injured' }, '2026-10-21').headline, 'Jak je na tom zranění?');
  assert.equal(statusCheck({ ...sick, status: 'on_break' }, '2026-10-30'), null);
  assert.equal(statusCheck({ ...sick, status: 'active' }, '2026-10-30'), null);
  const src = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(src, /askIfBetter=!ghost&&!!statusCheck\(athleteState,date\)&&!conversation\.length&&!otherToday\.length/);
});

test('the coach gets the day a pain was told or last confirmed, and the check comes first on Today (audit 4.6)', async () => {
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { memory: 'Bolí mě koleno' }, { date });
  await updateAthleteState(db, { memory: 'Mám rád dlouhé jízdy o víkendu' }, { date });
  assert.deepEqual(healthMemorySince(await getAthleteState(db, { date })), [{ text: 'Bolí mě koleno', since: date }]);
  const kept = await updateAthleteState(db, { keep: 'Bolí mě koleno' }, { date: '2026-10-28' });
  assert.deepEqual(healthMemorySince(kept), [{ text: 'Bolí mě koleno', since: '2026-10-28' }]);
  assert.deepEqual(healthMemorySince({ ...kept, memoryOff: true }), []);
  const src = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(src, /const advice=\(swap&&state\.nudge\.date!==date\?swap:null\)\|\|statusCheck\(state,date\)\|\|memoryCheck\(state,date,\{trainedOn\}\)\|\|easier/);
  assert.match(src, /healthMemorySince:healthSince/);
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
  assert.deepEqual(coachAnswerText('plain', { actions: true }).memory, { save: [], forget: [], update: [] });
});

// Petr 2026-11-11: chest symptoms under load are asked about the next day and
// after the first training since, not in a week like other pains.
test('chest symptoms: asked the next day, after the next training, again in two days when still there', async () => {
  for (const t of ['Píchání na hrudi a zatmění před očima při zátěži', 'Tlak na hrudi při stoupání', 'Chest pain on intervals', 'Nearly blacked out on the climb']) assert.equal(checkDays(t), 1, t);
  for (const t of ['Tlak v hrudi při stoupání', 'Sevřelo se mi na hrudi', 'Pálení na hrudi při zátěži', 'Závrať při intervalu', 'Zatočila se mi hlava', 'Dizzy during intervals', 'Buší mi srdce', 'Splašený tep při zátěži',
    'Racing heartbeat', 'Skipped heartbeats at rest', 'My heart skips beats', 'Srdce mi občas v klidu vynechává', 'I passed out after the sprint', 'Vision went dim', 'Nečekaná dušnost při běhu']) assert.ok(heartSymptom(t), t);
  for (const t of ['Chci víc hrudníku', 'Bench press na hrudník', 'Tlaky na hrudník 3x týdně', 'Chest exercises twice a week', 'Tlačím na hrudník 80 kg', 'Cviky na hrudník a stabilizaci', 'Chest day: tighten core',
    'Chest workouts painless', 'Chest press hurts my shoulder', 'Chci posílit hrudník, bolí mě rameno', 'Bolest hrudní páteře', 'My chest strap hurts', 'Vynechal jsem trénink', 'Lapal jsem po dechu']) assert.equal(heartSymptom(t), false, t);
  const db = scopedDb(createD1(), 1), chest = 'Píchání na hrudi a zatmění při sweet spotu';
  await updateAthleteState(db, { memory: chest }, { date });
  const state = await getAthleteState(db, { date });
  assert.equal(memoryList(state)[0].group, 'health');
  assert.equal(heartSince(state), date);
  assert.equal(memoryCheck(state, date, { trainedOn: date }), null);
  const next = memoryCheck(state, '2026-10-15');
  assert.equal(next.headline, 'Trvají ty potíže pořád?');
  const trained = memoryCheck(state, '2026-10-15', { trainedOn: '2026-10-15' });
  assert.equal(trained.headline, 'Objevilo se to i na tréninku?');
  assert.equal(trained.memory, chest);
  const kept = await updateAthleteState(db, { keep: chest }, { date: '2026-10-15' });
  assert.equal(memoryList(kept)[0].check, '2026-10-17');
  assert.equal(memoryCheck(kept, '2026-10-16', { trainedOn: '2026-10-15' }), null);
  assert.equal(memoryCheck(kept, '2026-10-16', { trainedOn: '2026-10-16' }).headline, 'Objevilo se to i na tréninku?');
  assert.equal(heartSince({ ...kept, memoryOff: true }), null);
  // A heart memory saved before checkDays knew it (no check day): Still true still settles the after-training card.
  const oldDb = scopedDb(createD1(), 2), blackout = 'Zatmělo se mi před očima';
  const before = await updateAthleteState(oldDb, { memory: blackout }, { date });
  delete before.memoryMeta[blackout].check;
  await oldDb.prepare('UPDATE athlete_state SET state_json=? WHERE user_id=?').bind(JSON.stringify(before), oldDb.userId).run();
  assert.equal(memoryList(await getAthleteState(oldDb, { date }))[0].check, null);
  const settled = await updateAthleteState(oldDb, { keep: blackout }, { date: '2026-10-20' });
  assert.equal(settled.memoryMeta[blackout].keptAt, '2026-10-20');
  assert.equal(memoryCheck(settled, '2026-10-21', { trainedOn: '2026-10-20' }), null);
});
