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
    all: async () => /FROM coach_inbox/.test(sql) ? { results: inbox.filter(r => r.id !== a[1] && r.confirmed_at > a[2]) } : { results: [] } }), run: async () => ({ meta: {} }) }) };
  return { env: { DB: db, USER_ID: 1 }, db, inbox };
};

test('the gym plan goes back only while it is as the change left it, once', async () => {
  const { env, db } = memoryDb(), before = [['a'], ['before']], after = [['a'], ['after']];
  db.plans.set('2026-11-14', JSON.stringify(after));
  const token = await rememberChange(env, { kind: 'gym_plan', date: '2026-11-14', before, after, chatId: 7, draftId: 40, proposal: 'Přidat Cable curl 3× 10-12 (14. 11.)' });
  assert.deepEqual(await lastUndoInChat(db, 7, '2026-11-14 00:00:00'), { token, tokens: [token], proposal: 'Přidat Cable curl 3× 10-12 (14. 11.)' });
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
  assert.match(src, /async function gymUndo\(env,draft,before,after,draftId,extra=\{\}\)\{\n\s*if\(!chatV1On\(env\)\)return \{\};/);
  assert.match(src, /result=\{status:'ok',date:a\.date,values,\.\.\.await gymUndo\(env,draft,latest\.values,values,row\.id\)\}/);
  assert.match(src, /preview,\.\.\.await gymUndo\(env,draft,a\.trim\.source,a\.trim\.values,row\.id\)\}/);
  const undo = src.indexOf('const undoAsked=!ghost&&!body.pushReply&&chatV1On(env)&&chatUndo(message)'), reads = src.indexOf("onProgress(L('Kouč čte tvoje data…'");
  assert.ok(undo > 0 && undo < reads);
  assert.match(src, /if\(undoneInChat\)coachCtx\.undoneInChat=undoneInChat;/);
});

test('after a later change of the chat was undone, the text does not go one change further back', async () => {
  const { env, db, inbox } = memoryDb();
  await rememberChange(env, { kind: 'gym_plan', date: '2026-11-14', before: [['a']], after: [['b']], chatId: 7, draftId: 40, proposal: 'A' });
  inbox.push({ id: 41, confirmed_at: '2026-11-14 10:05:00', draft_json: JSON.stringify({ kind: 'coach_action', action: { type: 'gym_add', toExercise: 'Cable curl' }, chatId: 7, messageId: 3 }) });
  assert.equal((await lastUndoInChat(db, 7, '2026-11-14 00:00:00')).stale, true);
  inbox[0] = { id: 41, confirmed_at: '2026-11-14 10:05:00', draft_json: JSON.stringify({ kind: 'coach_action', action: { type: 'status', status: 'active' }, chatId: 7, messageId: 3 }) };
  assert.equal((await lastUndoInChat(db, 7, '2026-11-14 00:00:00')).stale, undefined);
  // A card proposed later but confirmed before this change is no later change.
  inbox[0] = { id: 41, confirmed_at: '2026-11-14 09:55:00', draft_json: JSON.stringify({ kind: 'coach_action', action: { type: 'gym_add', toExercise: 'Cable curl' }, chatId: 7, messageId: 3 }) };
  assert.equal((await lastUndoInChat(db, 7, '2026-11-14 00:00:00')).stale, undefined);
});

test('a failed answer after an undo in the text still says what was done, with real cards only', () => {
  const src = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(src, /catch\(error=>\{if\(!madeInChat\.some\(c=>c\.done\)\)throw error;return madeOnly\(\);\}\)/);
  assert.match(src, /if\(answer\.status!=='ok'&&madeInChat\.some\(c=>c\.done\)\)answer=madeOnly\(\);/);
  assert.match(src, /confirmedInChat:madeInChat\.filter\(c=>c\.done&&c\.action\)/);
  assert.match(src, /\.then\(undo=>\(\{undo\}\),error=>\{console\.error\('Gym undo not kept'/);
});

// The app's own planned ride, run or swim (local-workouts.js), as the coach's cards left it.
const plannedDb = () => {
  const undo = [], local = new Map(), links = [];
  const db = { userId: 1, local, links, batch: async list => Promise.all(list.map(q => q.run())), prepare: sql => ({ bind: (...a) => ({
    run: async () => {
      if (/^INSERT INTO activity_undo/.test(sql)) { undo.push({ token: a[1], change_json: a[2], created_at: '2026-11-14 10:00:00' }); return { meta: { changes: 1 } }; }
      if (/^DELETE FROM activity_undo/.test(sql)) { const i = undo.findIndex(u => u.token === a[1]); if (i >= 0) undo.splice(i, 1); return { meta: { changes: 1 } }; }
      if (/^UPDATE activity_undo SET change_json = \? WHERE user_id = \? AND token = \? AND change_json = \?/.test(sql)) { const u = undo.find(x => x.token === a[2] && x.change_json === a[3]); if (u) u.change_json = a[0]; return { meta: { changes: u ? 1 : 0 } }; }
      if (/^UPDATE local_workouts SET status='deleted'/.test(sql)) { local.get(a[1]).status = 'deleted'; return { meta: { changes: 1 } }; }
      if (/^UPDATE local_workouts SET status='scheduled'.*AND status='deleted'/.test(sql)) { const r = local.get(a[1]); const ok = r?.status === 'deleted'; if (ok) r.status = 'scheduled'; return { meta: { changes: ok ? 1 : 0 } }; }
      if (/^INSERT INTO local_workouts/.test(sql)) { const r = local.get(a[1]); r.event_json = a[3]; r.status = 'scheduled'; return { meta: { changes: 1 } }; }
      if (/^INSERT OR IGNORE INTO workout_schedule_links/.test(sql)) { links.push(a); return { meta: { changes: 1 } }; }
      return { meta: {} };
    },
    first: async () => {
      if (/FROM activity_undo WHERE user_id = \? AND token = \?/.test(sql)) return undo.find(u => u.token === a[1]) || null;
      if (/FROM local_workouts WHERE user_id=\? AND id=\?/.test(sql)) return local.get(a[1]) || null;
      if (/FROM health_datapoints/.test(sql) && /planned-workout/.test(sql)) { const r = local.get(String(a[1]).replace(/^planned:/, '')); return r && r.status !== 'deleted' ? { id: 1, payload_json: r.event_json, start_time: JSON.parse(r.event_json).start_date_local } : null; }
      if (/FROM activity_undo WHERE user_id=\? AND created_at>=\? AND change_json LIKE/.test(sql)) { const like = a[2].slice(1, -1); return [...undo].reverse().find(u => u.created_at >= a[1] && u.change_json.includes(like)) || null; }
      return null;
    },
    all: async () => /FROM activity_undo/.test(sql) ? { results: [...undo].reverse().filter(u => u.change_json.includes(a[2].slice(1, -1))) } : { results: [] } }), run: async () => ({ meta: {} }) }) };
  const add = (id, start) => local.set(id, { id, event_key: 'k:' + id, status: 'scheduled', revision: 1, event_json: JSON.stringify({ id, name: 'Endurance', type: 'Ride', start_date_local: start }) });
  return { env: { DB: db, USER_ID: 1 }, db, add };
};

test('a ride the coach added, moved or took off the plan goes back, only while it is as the change left it', async () => {
  const { env, db, add } = plannedDb(), start = '2099-01-10T17:00:00';
  add('local-new', start); add('local-old', start); add('local-moved', '2099-01-12T07:30:00');
  db.local.get('local-old').status = 'deleted';
  const link = { sport: 'ride', workout_id: 'w1', family: null, scheduled_date: '2099-01-10', environment: 'outdoor', intervals_external_id: 'pfd-library:w1:2099-01-10:outdoor' };
  const moved = await rememberChange(env, { kind: 'planned', op: 'move', id: 'local-moved', from: '2099-01-11T07:30:00', to: '2099-01-12T07:30:00', chatId: 7, messageId: 2, draftId: 49, proposal: 'Přesunout běh' });
  const added = await rememberChange(env, { kind: 'planned', op: 'add', id: 'local-new', start, chatId: 7, messageId: 3, draftId: 50, proposal: 'Jízda 120 min' });
  const gone = await rememberChange(env, { kind: 'planned', op: 'delete', id: 'local-old', start, link, chatId: 7, messageId: 3, draftId: 51, proposal: 'Volno místo Endurance' });
  // Both cards of one answer go back together, the older move stays.
  const last = await lastUndoInChat(db, 7, '2026-11-14 00:00:00');
  assert.deepEqual(new Set(last.tokens), new Set([added, gone]));
  assert.match(last.proposal, /Jízda 120 min/);
  assert.equal((await undoActivityChange(env, added)).op, 'add');
  assert.equal(db.local.get('local-new').status, 'deleted');
  assert.equal((await undoActivityChange(env, gone)).op, 'delete');
  assert.equal(db.local.get('local-old').status, 'scheduled');
  assert.equal(db.links[0][2], 'w1');
  await assert.rejects(undoActivityChange(env, added), /už vrátit nejde/, 'once');
  assert.equal((await lastUndoInChat(db, 7, '2026-11-14 00:00:00')).stale, true, 'the text does not go one change further back');
  // Moved by hand since: no undo.
  db.local.get('local-moved').event_json = JSON.stringify({ id: 'local-moved', type: 'Run', start_date_local: '2099-01-13T07:30:00' });
  await assert.rejects(undoActivityChange(env, moved), /od té změny upravil/);
  db.local.get('local-moved').event_json = JSON.stringify({ id: 'local-moved', type: 'Run', start_date_local: '2099-01-12T07:30:00' });
  assert.equal((await undoActivityChange(env, moved)).op, 'move');
  assert.equal(JSON.parse(db.local.get('local-moved').event_json).start_date_local, '2099-01-11T07:30:00');
  // A day already gone.
  const old = await rememberChange(env, { kind: 'planned', op: 'add', id: 'local-new', start: '2020-01-01T10:00:00', chatId: 7, messageId: 4 });
  await assert.rejects(undoActivityChange(env, old), /den už je pryč/);
});

test('the ride and run cards keep an undo only with Chat v1, for the app\'s own plan and not a gym day or a joined pair', () => {
  const src = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(src, /async function plannedUndo\(env,draft,change,draftId\)\{\n\s*if\(!chatV1On\(env\)/);
  assert.match(src, /const own=id\.startsWith\('local-'\)&&!isStrengthEvent\(payload\)&&!payload\.after&&!payload\.next;/);
  assert.match(src, /for\(const token of last\.tokens\|\|\[last\.token\]\)await undoActivityChange/);
});

test('a plan of another focus goes back with its calendar event, only with Chat v1', async () => {
  const src = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(src, /const oldEvent=a\.replace&&chatV1On\(env\)\?/);
  assert.match(src, /if\(a\.replace&&oldEvent\)Object\.assign\(result,await gymUndo\(env,draft,a\.replace\.source,\(await readGymPlan\(env\.DB,a\.date\)\)\.values,row\.id,\{event:JSON\.parse\(oldEvent\.event_json\)\}\)\)/);
  const { env, db } = memoryDb(), before = [['a'], ['full body']], after = [['a'], ['upper']];
  db.plans.set('2026-11-14', JSON.stringify(after));
  const token = await rememberChange(env, { kind: 'gym_plan', date: '2026-11-14', before, after, event: { name: 'Celé tělo', type: 'WeightTraining', start_date_local: '2026-11-14T17:00:00' }, chatId: 7, draftId: 60, proposal: 'Horní polovina místo dosavadního plánu' });
  // The event can't be stored in this test database: the plan goes forward again and the token stays.
  await assert.rejects(undoActivityChange(env, token), /zkus to znovu/);
  assert.equal(db.plans.get('2026-11-14'), JSON.stringify(after));
  assert.ok(db.undo.some(u => u.token === token));
});
