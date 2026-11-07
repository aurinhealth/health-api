// Dočasný chat (ghost chat, Petr 2026-11-07): the coach reads what he knows,
// keeps nothing of the chat, and the chat goes when the athlete leaves it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendChatTurn, appendChatTurnIds, openChatForAnswer, listChats, searchChats, readChat, deleteChat, dropIdleGhostChats, ensureAssistantChats } from '../src/assistant-chats.js';
import { writeDayNote, earlierToday, ensureCoachNotes, ensureNoteQueue } from '../src/coach-notes.js';
import { ensureCoachInboxTable, recentCoachProposals } from '../src/coach-inbox.js';
import { scopedDb } from '../src/tenancy.js';
import { withTimeZone } from '../src/user-time.js';
import { createD1 } from './helpers/d1.mjs';

const proposal = (db, chatId, ghost, status = 'draft') => db.prepare('INSERT INTO coach_inbox(user_id,channel,message,draft_json,status) VALUES(?,?,?,?,?)')
  .bind(db.userId, 'cycling', 'Můžu dnes intervaly?', JSON.stringify({ kind: 'coach_action', action: { type: 'workout', sport: 'ride', date: '2026-11-08', title: 'Z2' }, chatId, ...(ghost ? { ghost: true } : {}) }), status).run();

test('a ghost chat is kept for its answers but never listed, and a gone one is never made again', async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  const normal = await appendChatTurn(db, null, 'Jak mám jet zítra?', 'Lehce.');
  const ghost = await appendChatTurn(db, null, 'Kdybych dnes pil pivo?', 'Spánek bude horší.', { ghost: true });
  assert.ok(ghost > 0 && ghost !== normal);
  assert.equal(await appendChatTurn(db, ghost, 'A víno?', 'Podobně.', { ghost: true }), ghost);
  assert.equal((await readChat(db, ghost)).messages.length, 4);
  assert.deepEqual((await listChats(db)).map(c => c.id), [normal]);
  assert.deepEqual(await searchChats(db, 'pivo'), []);
  // A normal chat never turns into a ghost one, and a ghost one left while the answer was written stays gone.
  assert.deepEqual(await appendChatTurnIds(db, normal, 'X', 'Y', { ghost: true }), { chatId: null, messageId: null });
  await deleteChat(db, ghost);
  assert.deepEqual(await appendChatTurnIds(db, ghost, 'A pivo?', 'Odpověď.', { ghost: true }), { chatId: null, messageId: null });
  assert.equal(await openChatForAnswer(db, ghost, 'A pivo?', { ghost: true }), null);
  assert.equal((await raw.prepare('SELECT COUNT(*) AS n FROM assistant_chats').first()).n, 1);
  assert.equal((await raw.prepare('SELECT COUNT(*) AS n FROM assistant_messages').first()).n, 2);
  const opened = await openChatForAnswer(db, null, 'Nový dočasný', { ghost: true });
  assert.equal((await raw.prepare('SELECT ghost FROM assistant_chats WHERE id=?').bind(opened.id).first()).ghost, 1);
});

test('leaving a ghost chat takes its open proposals and the question of confirmed ones, and rewrites no note', async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  await ensureCoachInboxTable(db);
  const ghost = await appendChatTurn(db, null, 'Můžu dnes intervaly?', 'Ano.', { ghost: true });
  const normal = await appendChatTurn(db, null, 'A zítra?', 'Lehce.');
  await proposal(db, ghost, true);
  await proposal(db, ghost, true, 'rejected');
  await proposal(db, ghost, true, 'confirmed');
  await proposal(db, normal, false);
  // The coach's later answers never read the ghost chat's proposals.
  assert.equal((await recentCoachProposals({ DB: db, USER_ID: 1 })).length, 1);
  await deleteChat(db, ghost);
  const rows = (await raw.prepare('SELECT status, message FROM coach_inbox ORDER BY id').all()).results;
  assert.deepEqual(rows.map(r => [r.status, r.message]), [['confirmed', ''], ['draft', 'Můžu dnes intervaly?']]);
  await ensureNoteQueue(db);
  assert.equal((await raw.prepare('SELECT COUNT(*) AS n FROM coach_note_queue').first()).n, 0);
});

test('the night reads no ghost chat and removes the ones left open', async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  await ensureCoachNotes(db);
  await withTimeZone('Europe/Prague', async () => {
    const ghost = await appendChatTurn(db, null, 'Tajná otázka', 'Odpověď.', { ghost: true });
    await raw.prepare("UPDATE assistant_messages SET created_at='2026-11-03 10:00:00'").run();
    await raw.prepare("UPDATE assistant_chats SET created_at='2026-11-03 10:00:00', updated_at='2026-11-03 10:00:00'").run();
    assert.equal((await writeDayNote({ DB: db }, '2026-11-03', { ask: async () => { throw new Error('asked'); } })).status, 'empty');
    const normal = await appendChatTurn(db, null, 'Otázka', 'Odpověď.');
    await raw.prepare("UPDATE assistant_chats SET updated_at='2026-11-03 11:00:00' WHERE id=?").bind(ghost).run();
    assert.deepEqual(await earlierToday(db, normal, { today: '2026-11-03' }), []);
    // Still open half an hour ago: kept; idle longer: gone with its messages.
    assert.equal(await dropIdleGhostChats(db, Date.parse('2026-11-03T11:10:00Z')), 0);
    assert.equal(await dropIdleGhostChats(db, Date.parse('2026-11-03T11:31:00Z')), 1);
    assert.equal(await readChat(db, ghost), null);
    assert.ok(await readChat(db, normal));
  });
});

test('an old chats table gets the ghost column', async () => {
  const raw = createD1(), db = scopedDb(raw, 1);
  await raw.prepare('CREATE TABLE assistant_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  await ensureAssistantChats(db);
  assert.ok((await raw.prepare('PRAGMA table_info(assistant_chats)').all()).results.some(c => c.name === 'ghost'));
});

test('the coach route keeps nothing of a ghost chat: no memory, setting, summary or proposal of a gone chat', () => {
  const entry = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  const start = entry.indexOf("url.pathname==='/app/api/assistant'&&request.method==='POST'");
  const route = entry.slice(start, entry.indexOf("if(body.stream)return assistantStreamResponse(", start));
  // The chat decides: a ghost chat's id makes the message a ghost one.
  assert.match(route, /const ghost=body\.ghost===true\|\|Boolean\(body\.chatId&&.*ownedChat\(env\.DB,body\.chatId\).*\?\.ghost\);/);
  assert.match(route, /const noSport=ghost\?null:sportExclusion\(message\)/);
  assert.match(route, /const memory=noSport\|\|ghost\|\|/);
  assert.match(route, /keeps=remembers&&!ghost/);
  assert.match(route, /const saves=keeps&&!noSport\?memorySaves\(/);
  assert.match(route, /const changes=keeps\?memoryChanges\(/);
  assert.match(route, /chat\.firstId&&!ghost\)ctx\.waitUntil\(summarizeChatStart/);
  assert.match(route, /for\(const action of ghost&&!chatId\?\[\]:actions\)/);
  assert.match(route, /\.\.\.\(ghost\?\{ghost:true\}:\{\}\)\};/);
  assert.match(route, /\.\.\.\(ghost\?\{ghostChat:true\}:\{\}\)/);
  assert.match(route, /appendChatTurnIds\(env\.DB,answerChat,saved,answer,\{ghost\}\)/);
  assert.match(entry, /openChatForAnswer\(env\.DB,body\.chatId,saved,\{ghost\}\)/);
  // A ghost card's quick changes teach the coach nothing.
  assert.match(entry, /if\(chip!=='undo'&&chip!=='day'&&!draft\.ghost\)\{/);
});
