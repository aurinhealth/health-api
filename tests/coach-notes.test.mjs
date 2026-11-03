import test from 'node:test';
import assert from 'node:assert/strict';
import { getAthleteState, updateAthleteState, memoryList, pastMemoryList, memoryCheck, memorySaves, usedMemories, MEMORY_KEEP } from '../src/athlete-state.js';
import { appendChatTurn, chatContext, deleteChat, ensureAssistantChats, CONTEXT_MESSAGES } from '../src/assistant-chats.js';
import { queueDayNote, usersWithNotesDue, runCoachNotes, writeDayNote, recentNotes, forgetNote, nightChanges, earlierToday, summarizeChatStart, chatSummary, coachNoteDays, ensureCoachNotes } from '../src/coach-notes.js';
import { scopedDb } from '../src/tenancy.js';
import { withTimeZone } from '../src/user-time.js';
import { createD1 } from './helpers/d1.mjs';

const date = '2026-11-03';

test('the coach saves memories with their group, marked New for a week', async () => {
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { saves: [{ text: 'Prague Half Marathon on 4 Apr, under 1:45', group: 'goals' }, { text: 'Left knee sore after long runs', group: 'health' }] }, { date });
  await updateAthleteState(db, { memory: 'Gym twice a week, mornings only', group: 'training' }, { date });
  const state = await getAthleteState(db, { date });
  assert.deepEqual(memoryList(state, date).map(m => [m.group, m.badge]), [['goals', 'new'], ['health', 'new'], ['training', null]]);
  assert.deepEqual(memoryList(state, '2026-11-10').map(m => m.badge), [null, null, null]);
  // A memory from before the groups: a pain is Health, a taste Training.
  const old = { memories: ['Bolí mě koleno', 'Mám rád dlouhé jízdy'], memoryMeta: {} };
  assert.deepEqual(memoryList(old, date).map(m => m.group), ['health', 'training']);
});

test('a pain that passed goes to Past, deleting erases, and the edit sheet moves a group', async () => {
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { saves: [{ text: 'Left knee sore after long runs', group: 'health' }, { text: 'Rides outdoors', group: 'training' }] }, { date });
  let state = await updateAthleteState(db, { forget: 'Left knee sore after long runs', toPast: true }, { date: '2026-11-20' });
  assert.deepEqual(state.memories, ['Rides outdoors']);
  assert.deepEqual(pastMemoryList(state), [{ text: 'Left knee sore after long runs', group: 'health', since: date, ended: '2026-11-20' }]);
  // Only health goes to Past; a taste forgotten with toPast is simply gone.
  state = await updateAthleteState(db, { forget: 'Rides outdoors', toPast: true }, { date });
  assert.equal(pastMemoryList(state).length, 1);
  // Saving it again takes it out of Past.
  state = await updateAthleteState(db, { memory: 'Left knee sore after long runs', group: 'health' }, { date });
  assert.equal(pastMemoryList(state).length, 0);
  state = await updateAthleteState(db, { forget: 'Left knee sore after long runs', toPast: true }, { date });
  state = await updateAthleteState(db, { forgetPast: 'Left knee sore after long runs' }, { date });
  assert.equal(pastMemoryList(state).length, 0);
  state = await updateAthleteState(db, { memory: 'Works 8 to 17', group: 'training' }, { date });
  state = await updateAthleteState(db, { regroup: { text: 'Works 8 to 17', group: 'life' } }, { date });
  assert.equal(memoryList(state, date)[0].group, 'life');
  state = await updateAthleteState(db, { edit: { from: 'Works 8 to 17', to: 'Works 9 to 18', group: 'life', by: 'coach' } }, { date });
  assert.deepEqual(memoryList(state, date).map(m => [m.text, m.group, m.badge]), [['Works 9 to 18', 'life', 'updated']]);
});

test('"Use memory" off: no memories used, no check, the list kept', async () => {
  const db = scopedDb(createD1(), 1);
  await updateAthleteState(db, { memory: 'Bolí mě koleno' }, { date });
  let state = await updateAthleteState(db, { memoryOff: true }, { date });
  assert.deepEqual(usedMemories(state), []);
  assert.equal(memoryCheck(state, '2026-12-01'), null);
  assert.deepEqual(state.memories, ['Bolí mě koleno']);
  state = await updateAthleteState(db, { memoryOff: false }, { date });
  assert.deepEqual(usedMemories(state), ['Bolí mě koleno']);
});

test('the answer saves at most three new memories in a known group', () => {
  const saves = memorySaves({ save: [{ text: ' A ', group: 'goals' }, { text: 'Known', group: 'life' }, { text: 'B', group: 'x' }, { text: 'A', group: 'life' }, { text: 'C', group: 'life' }, { text: 'D', group: 'life' }, { text: '', group: 'life' }] }, ['Known']);
  assert.deepEqual(saves, [{ text: 'A', group: 'goals' }, { text: 'B', group: 'training' }, { text: 'C', group: 'life' }]);
  assert.deepEqual(memorySaves(undefined, []), []);
  assert.equal(MEMORY_KEEP, 50);
});

test('the coach reads the last 60 messages of a chat and knows when there are more', async () => {
  const db = scopedDb(createD1(), 1);
  let chat = null;
  for (let i = 1; i <= 35; i++) chat = await appendChatTurn(db, chat, 'Q' + i, 'A' + i);
  const ctx = await chatContext(db, chat, { withIds: true });
  assert.equal(CONTEXT_MESSAGES, 60);
  assert.equal(ctx.turns.length, 60);
  assert.equal(ctx.turns[0].content, 'Q6');
  assert.equal(ctx.more, true);
  assert.equal((await chatContext(db, chat)).length, 60);
  const short = await appendChatTurn(db, null, 'Ahoj', 'Ahoj.');
  assert.deepEqual(await chatContext(db, short, { withIds: true }).then(c => c.more), false);
});

test('a long chat gets its older part summarised once ten messages fell out of view', async () => {
  const db = scopedDb(createD1(), 1), env = { DB: db };
  let chat = null;
  for (let i = 1; i <= 36; i++) chat = await appendChatTurn(db, chat, 'Q' + i, 'A' + i);
  const ctx = await chatContext(db, chat, { withIds: true });
  const asked = [];
  const ask = async (_, p) => { asked.push(p); return { text: JSON.stringify({ summary: 'They planned the half marathon block.' }) }; };
  const done = await summarizeChatStart(env, chat, ctx.firstId, { ask });
  assert.equal(done.text, 'They planned the half marathon block.');
  assert.match(asked[0].input, /Q1/);
  assert.doesNotMatch(asked[0].input, /"Q7"/);
  assert.deepEqual(await chatSummary(db, chat), { text: 'They planned the half marathon block.', throughId: ctx.firstId - 1 });
  // Nothing new out of view: no second call.
  assert.equal(await summarizeChatStart(env, chat, ctx.firstId, { ask }), null);
  assert.equal(asked.length, 1);
});

test('a day with chats is queued once and its note written after midnight', async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  const env = { DB: db, OPENAI_API_KEY: 'test', USER_IS_OWNER: true, USER_ID: 1 };
  await raw.prepare("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, role TEXT, disabled INTEGER DEFAULT 0)").run();
  await raw.prepare("CREATE TABLE user_consents (user_id INTEGER, kind TEXT, version TEXT, granted_at TEXT, withdrawn_at TEXT, PRIMARY KEY (user_id, kind))").run();
  await raw.prepare("INSERT INTO users (id, email, role) VALUES (1, 'a@example.com', 'user')").run();
  await raw.prepare("INSERT INTO user_consents (user_id, kind, version, granted_at) VALUES (1, 'health', '1', '2026-10-01')").run();
  await updateAthleteState(db, { memory: 'Bolí mě koleno', group: 'health' }, { date: '2026-11-01' });
  await updateAthleteState(db, { memory: 'Kolo jen v úterý', group: 'training' }, { date: '2026-11-01' });
  await updateAthleteState(db, { memory: 'Kolo pouze v úterý', group: 'training' }, { date: '2026-11-01' });
  await withTimeZone('Europe/Prague', async () => {
    const chat = await appendChatTurn(db, null, 'Koleno už nebolí. Kolo jen o víkendu. V dubnu běžím půlmaraton.', 'Super.');
    await raw.prepare("UPDATE assistant_messages SET created_at='2026-11-02 18:00:00'").run();
    await raw.prepare("UPDATE assistant_chats SET created_at='2026-11-02 18:00:00', updated_at='2026-11-02 18:00:00'").run();
    await queueDayNote(db, '2026-11-02');
    await queueDayNote(db, '2026-11-02');
    assert.equal((await raw.prepare('SELECT COUNT(*) AS n FROM coach_note_queue').first()).n, 1);
    // Due half an hour after the user's midnight: 23:30 UTC in Prague's winter.
    assert.deepEqual(await usersWithNotesDue(raw, env, Date.parse('2026-11-02T23:00:00Z')), []);
    assert.deepEqual((await usersWithNotesDue(raw, env, Date.parse('2026-11-02T23:31:00Z'))).map(u => u.id), [1]);
    const asked = [];
    const ask = async (_, p) => { asked.push(p); return { text: JSON.stringify({ note: 'Agreed to ride only at the weekend; half marathon in April.', memory: {
      save: [{ text: 'Half marathon in April', group: 'goals' }, { text: 'Kolo jen v úterý', group: 'training' }],
      update: [{ from: 'Kolo jen v úterý', to: 'Kolo jen o víkendu', group: 'training' }, { from: 'Neznámé', to: 'X', group: 'life' }],
      past: ['Bolí mě koleno'], forget: ['Kolo pouze v úterý', 'Neznámé'] } }) }; };
    const r = await runCoachNotes(env, { now: Date.parse('2026-11-03T05:00:00Z'), ask });
    assert.equal(r.days, 1);
    assert.match(asked[0].input, /Koleno už nebolí/);
    assert.equal(asked[0].feature, 'coach-notes');
    assert.deepEqual(await recentNotes(db, { today: '2026-11-03' }), [{ day: '2026-11-02', note: 'Agreed to ride only at the weekend; half marathon in April.' }]);
    const state = await getAthleteState(db, { date });
    assert.deepEqual(memoryList(state, date).map(m => [m.text, m.group, m.badge]), [['Kolo jen o víkendu', 'training', 'updated'], ['Half marathon in April', 'goals', 'new']]);
    assert.deepEqual(pastMemoryList(state).map(p => p.text), ['Bolí mě koleno']);
    assert.equal((await raw.prepare('SELECT COUNT(*) AS n FROM coach_note_queue').first()).n, 0);
    // Deleting the chat forgets the day's note and writes it again from what remains.
    await deleteChat(db, chat);
    assert.deepEqual(await recentNotes(db, { today: '2026-11-03' }), []);
    assert.equal((await raw.prepare("SELECT day FROM coach_note_queue").first()).day, '2026-11-02');
  });
});

test('with memory off the night writes no note, asks no AI and changes no memory', async () => {
  const raw = createD1(), db = scopedDb(raw, 1), env = { DB: db };
  await updateAthleteState(db, { memory: 'Bolí mě koleno', memoryOff: true }, { date });
  await withTimeZone('Europe/Prague', async () => {
    await appendChatTurn(db, null, 'Koleno už nebolí.', 'Super.');
    await raw.prepare("UPDATE assistant_messages SET created_at='2026-11-03 10:00:00'").run();
    await raw.prepare("UPDATE assistant_chats SET updated_at='2026-11-03 10:00:00'").run();
    const r = await writeDayNote(env, '2026-11-03', { ask: async () => { throw new Error('asked'); } });
    assert.equal(r.status, 'off');
    assert.deepEqual(await recentNotes(db, { today: '2026-11-04' }), []);
    assert.deepEqual((await getAthleteState(db, { date })).memories, ['Bolí mě koleno']);
  });
});

test('a day without a word from the athlete gets no note and no AI call', async () => {
  const db = scopedDb(createD1(), 1);
  await ensureCoachNotes(db);
  await ensureAssistantChats(db);
  const r = await writeDayNote({ DB: db }, '2026-11-02', { ask: async () => { throw new Error('asked'); } });
  assert.equal(r.status, 'empty');
});

test('the night may change only memories named word for word, three of each kind', () => {
  const known = ['A', 'B', 'C', 'D', 'E'];
  const c = nightChanges({ save: [{ text: 'A', group: 'goals' }, { text: 'N', group: 'zzz' }], update: [{ from: 'A', to: 'A2', group: 'life' }, { from: 'A', to: 'A3', group: 'life' }, { from: 'Z', to: 'Z2', group: 'life' }], past: ['A', 'B'], forget: ['B', 'C', 'D', 'E', 'Q'] }, known);
  assert.deepEqual(c.update, [{ from: 'A', to: 'A2', group: 'life' }]);
  assert.deepEqual(c.past, ['B']);
  assert.deepEqual(c.forget, ['C', 'D', 'E']);
  assert.deepEqual(c.save, [{ text: 'N', group: 'training' }]);
  assert.deepEqual(nightChanges(undefined, known), { save: [], update: [], past: [], forget: [] });
});

test('the coach reads notes of the set days before today and the end of another chat today', async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  await ensureCoachNotes(db);
  for (const day of ['2026-10-15', '2026-10-20', '2026-11-01', '2026-11-03']) await raw.prepare('INSERT INTO coach_notes (user_id, day, text) VALUES (1, ?, ?)').bind(day, 'note ' + day).run();
  assert.deepEqual((await recentNotes(db, { today: '2026-11-03', days: 14 })).map(n => n.day), ['2026-11-01', '2026-10-20']);
  assert.deepEqual((await recentNotes(db, { today: '2026-11-03', days: 30 })).map(n => n.day), ['2026-11-01', '2026-10-20', '2026-10-15']);
  await forgetNote(db, '2026-11-01');
  assert.deepEqual((await recentNotes(db, { today: '2026-11-03', days: 14 })).map(n => n.day), ['2026-10-20']);
  assert.equal(coachNoteDays({}), 14);
  assert.equal(coachNoteDays({ COACH_NOTE_DAYS: '30' }), 30);
  assert.equal(coachNoteDays({ COACH_NOTE_DAYS: '90' }), 14);
  await withTimeZone('Europe/Prague', async () => {
    const first = await appendChatTurn(db, null, 'Swap Thursday for a ride?', 'Done, Thursday is a ride.');
    const second = await appendChatTurn(db, null, 'And Sunday?', 'Long run.');
    const today = (await raw.prepare('SELECT substr(updated_at,1,10) AS d FROM assistant_chats WHERE id=?').bind(first).first()).d;
    assert.deepEqual(await earlierToday(db, second, { today }), [{ role: 'user', content: 'Swap Thursday for a ride?' }, { role: 'assistant', content: 'Done, Thursday is a ride.' }]);
  });
});

test('the night skips users without consent: no health consent is never picked, no AI consent drops the day unasked', async () => {
  const raw = createD1(), db = scopedDb(raw, 2);
  const env = { DB: db, OPENAI_API_KEY: 'test', USER_ID: 2 };
  await raw.prepare("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, role TEXT, disabled INTEGER DEFAULT 0)").run();
  await raw.prepare("CREATE TABLE user_consents (user_id INTEGER, kind TEXT, version TEXT, granted_at TEXT, withdrawn_at TEXT, PRIMARY KEY (user_id, kind))").run();
  await raw.prepare("INSERT INTO users (id, email, role) VALUES (2, 'b@example.com', 'user'), (3, 'c@example.com', 'user')").run();
  await raw.prepare("INSERT INTO user_consents (user_id, kind, version, granted_at) VALUES (2, 'health', '1', '2026-10-01')").run();
  await withTimeZone('Europe/Prague', async () => {
    await queueDayNote(db, '2026-11-02');
    await queueDayNote(scopedDb(raw, 3), '2026-11-02');
    // User 3 never gave health consent.
    assert.deepEqual((await usersWithNotesDue(raw, env, Date.parse('2026-11-03T05:00:00Z'))).map(u => u.id), [2]);
    // User 2 has no AI consent: the day goes from the queue and the AI is never asked.
    const r = await runCoachNotes(env, { now: Date.parse('2026-11-03T05:00:00Z'), ask: async () => { throw new Error('asked'); } });
    assert.equal(r.days, 0);
    assert.equal((await raw.prepare('SELECT COUNT(*) AS n FROM coach_note_queue WHERE user_id=2').first()).n, 0);
  });
});
