import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chatUndo, lastUndoInChat } from '../src/coach-chat-confirm.js';
import { undoActivityChange, rememberChange } from '../src/activity-chat-edits.js';

// Chat v1 (Petr 2026-11-14): "Vrátit" a change of today's gym plan, by the
// card's button or by the words in the chat.
test('only a plain undo in the text counts', () => {
  for (const m of ['Vrať to zpátky.', 'Vrať to', 'vrat to prosim zpet', 'Vrať tu poslední změnu', 'Radši to vrať, jak to bylo', 'Undo that', 'Undo the last change please', 'Dej to zpátky', 'Put it back', 'Vrať to zpátky, děkuju', 'Vrať to, jak to bylo původně']) assert.equal(chatUndo(m), true, m);
  for (const m of ['Vrátíš to?', 'Vrať to a dej tam dřep', 'Vrať mi peníze za Pro', 'Zruš dnešní trénink', 'Potvrzuju', 'Vrať se k plánu na zítra', '', 'Ne', 'Vrátit ne', 'No undo', 'Dej to', 'Dej tam dřep zpátky']) assert.equal(chatUndo(m), false, m);
});

const memoryDb = () => {
  const undo = [], plans = new Map(), inbox = [];
  const db = { userId: 1, undo, plans, prepare: sql => ({ bind: (...a) => ({
    run: async () => {
      if (/^INSERT INTO activity_undo/.test(sql)) { undo.push({ token: a[1], change_json: a[2], created_at: '2026-11-14 10:00:00' }); return { meta: { changes: 1 } }; }
      if (/^UPDATE gym_plans/.test(sql)) { const ok = plans.get(a[2]) === a[3]; if (ok) plans.set(a[2], a[0]); return { meta: { changes: ok ? 1 : 0 } }; }
      if (/^DELETE FROM activity_undo/.test(sql)) { const i = undo.findIndex(u => u.token === a[1]); if (i >= 0) undo.splice(i, 1); return { meta: { changes: 1 } }; }
      return { meta: {} };
    },
    first: async () => {
      if (/FROM activity_undo WHERE user_id = \? AND token = \?/.test(sql)) return undo.find(u => u.token === a[1]) || null;
      if (/FROM gym_plan_cancellations/.test(sql)) return db.cancelled ? { c: 1 } : null;
      if (/FROM activity_undo WHERE user_id=\? AND created_at>=\? AND change_json LIKE/.test(sql)) { const like = a[2].slice(1, -1); return [...undo].reverse().find(u => u.created_at >= a[1] && u.change_json.includes(like)) || null; }
      return null;
    },
    all: async () => /FROM coach_inbox/.test(sql) ? { results: inbox.filter(r => r.id > a[1]) } : { results: [] } }), run: async () => ({ meta: {} }) }) };
  return { env: { DB: db, USER_ID: 1 }, db, inbox };
};

test('the gym plan goes back only while it is as the change left it, once', async () => {
  const { env, db } = memoryDb(), before = [['a'], ['before']], after = [['a'], ['after']];
  db.plans.set('2026-11-14', JSON.stringify(after));
  const token = await rememberChange(env, { kind: 'gym_plan', date: '2026-11-14', before, after, chatId: 7, draftId: 40, proposal: 'Přidat Cable curl 3× 10-12 (14. 11.)' });
  assert.deepEqual(await lastUndoInChat(db, 7, '2026-11-14 00:00:00'), { token, proposal: 'Přidat Cable curl 3× 10-12 (14. 11.)' });
  assert.equal(await lastUndoInChat(db, 8, '2026-11-14 00:00:00'), null, 'another chat');
  assert.equal(await lastUndoInChat(db, 7, '2026-11-15 00:00:00'), null, 'not from an earlier day');
  // A set logged since: no undo.
  db.plans.set('2026-11-14', JSON.stringify([['a'], ['logged']]));
  await assert.rejects(undoActivityChange(env, token), /od té změny upravil/);
  db.plans.set('2026-11-14', JSON.stringify(after));
  db.cancelled = true;
  await assert.rejects(undoActivityChange(env, token), /zrušený/);
  db.cancelled = false;
  assert.equal((await undoActivityChange(env, token)).kind, 'gym_plan');
  assert.equal(db.plans.get('2026-11-14'), JSON.stringify(before));
  await assert.rejects(undoActivityChange(env, token), /už vrátit nejde/);
});

test('the confirm keeps the undo only with Chat v1, and the chat undoes before the coach reads the plan', () => {
  const src = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(src, /async function gymUndo\(env,draft,before,after,draftId\)\{\n\s*if\(!chatV1On\(env\)\)return \{\};/);
  assert.match(src, /result=\{status:'ok',date:a\.date,values,\.\.\.await gymUndo\(env,draft,latest\.values,values,row\.id\)\}/);
  assert.match(src, /preview,\.\.\.await gymUndo\(env,draft,a\.trim\.source,a\.trim\.values,row\.id\)\}/);
  const undo = src.indexOf('const undoAsked=!ghost&&!body.pushReply&&chatV1On(env)&&chatUndo(message)'), reads = src.indexOf("onProgress(L('Kouč čte tvoje data…'");
  assert.ok(undo > 0 && undo < reads);
  assert.match(src, /if\(undoneInChat\)coachCtx\.undoneInChat=undoneInChat;/);
});

test('after a later change of the chat was undone, the text does not go one change further back', async () => {
  const { env, db, inbox } = memoryDb();
  await rememberChange(env, { kind: 'gym_plan', date: '2026-11-14', before: [['a']], after: [['b']], chatId: 7, draftId: 40, proposal: 'A' });
  inbox.push({ id: 41, draft_json: JSON.stringify({ kind: 'coach_action', action: { type: 'gym_add', toExercise: 'Cable curl' }, chatId: 7, messageId: 3 }) });
  assert.equal((await lastUndoInChat(db, 7, '2026-11-14 00:00:00')).stale, true);
  inbox[0] = { id: 41, draft_json: JSON.stringify({ kind: 'coach_action', action: { type: 'status', status: 'active' }, chatId: 7, messageId: 3 }) };
  assert.equal((await lastUndoInChat(db, 7, '2026-11-14 00:00:00')).stale, undefined);
});

test('a failed answer after an undo in the text still says what was done, with real cards only', () => {
  const src = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(src, /catch\(error=>\{if\(!madeInChat\.some\(c=>c\.done\)\)throw error;return madeOnly\(\);\}\)/);
  assert.match(src, /if\(answer\.status!=='ok'&&madeInChat\.some\(c=>c\.done\)\)answer=madeOnly\(\);/);
  assert.match(src, /confirmedInChat:madeInChat\.filter\(c=>c\.done&&c\.action\)/);
  assert.match(src, /\.then\(undo=>\(\{undo\}\),error=>\{console\.error\('Gym undo not kept'/);
});
