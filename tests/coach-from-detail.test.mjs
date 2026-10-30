import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantAppContext, selectedSubject, selectedAssistantContext } from '../src/assistant-app-context.js';
import { COACH_MOMENT_KEYS } from '../src/coach-assistant.js';
import { replyPush, failedReplyPush, pushOpening, plainText, shortBody, COACH_ACTION_CATEGORY, COACH_REPLY_CATEGORY } from '../src/coach-push-reply.js';
import { appendChatTurn, readChat, startChatWithCoach, lastAnswerId, chatContext } from '../src/assistant-chats.js';
import { createD1 } from './helpers/d1.mjs';
import { scopedDb } from '../src/tenancy.js';

const today = '2026-10-24';

test('a detail screen names what the athlete asks about, never its numbers', () => {
  const c = assistantAppContext({ view: 'training', date: today, sport: 'ride', subject: { kind: 'activity', id: 'i123456', title: 'Kolo · tempo', tss: 999 } }, today);
  assert.deepEqual(c.subject, { kind: 'activity', id: 'i123456', title: 'Kolo · tempo', metric: null });
  const m = assistantAppContext({ view: 'health', subject: { kind: 'metric', metric: 'hrv', title: 'HRV' } }, today);
  assert.deepEqual(m.subject, { kind: 'metric', id: null, title: 'HRV', metric: 'hrv' });
  // Unknown kinds, odd ids and control characters are left out.
  assert.equal(assistantAppContext({ subject: { kind: 'secret' } }, today).subject, undefined);
  const odd = assistantAppContext({ subject: { kind: 'planned', id: 'x y"; drop', title: 'A\u0000B' } }, today).subject;
  assert.equal(odd.id, null);assert.equal(odd.title, 'A B');
  // Without a subject the context stays as before.
  assert.equal('subject' in assistantAppContext({ view: 'today' }, today), false);
});

test('the open activity and the open planned session come from the stored day', () => {
  const day = {
    completed: [{ id: 'i1', name: 'Walk', type: 'Walk', durationHours: 0.8 }, { id: 'i2', name: 'Kolo · tempo', type: 'Ride', durationHours: 1.2, tss: 74, payload: { icu_average_watts: 198 } }],
    planned: [{ id: 'planned:55', name: 'VO2max 5×4', type: 'Ride', durationHours: 1.25 }]
  };
  const a = selectedSubject({ kind: 'activity', id: 'i2' }, day);
  assert.equal(a.selectedActivity.name, 'Kolo · tempo');assert.equal(a.selectedActivity.averagePower, 198);
  assert.equal(selectedSubject({ kind: 'planned', id: 'planned:55' }, day).selectedSession.name, 'VO2max 5×4');
  assert.equal(selectedSubject({ kind: 'planned', id: '55' }, day).selectedSession.name, 'VO2max 5×4');
  assert.deepEqual(selectedSubject({ kind: 'activity', id: 'nope' }, day), {});
  assert.deepEqual(selectedSubject({ kind: 'metric', metric: 'hrv' }, day), {});
  assert.ok(COACH_MOMENT_KEYS.includes('selectedActivity') && COACH_MOMENT_KEYS.includes('selectedSession'));
});

test('the selected context carries the open activity', async () => {
  const c = assistantAppContext({ view: 'training', date: today, sport: 'ride', subject: { kind: 'activity', id: 'i2', title: 'Kolo' } }, today);
  const inputs = { date: today, week: { days: [{ date: today, daily: { training: { completed: [{ id: 'i2', name: 'Kolo', type: 'Ride' }], planned: [] } } }] } };
  const r = await selectedAssistantContext(c, inputs, { loadGym: async () => null, loadWeek: async () => null, loadPrefs: async () => ({ days: [], availability: [] }) });
  assert.equal(r.selectedActivity.name, 'Kolo');assert.equal(r.appContext.subject.id, 'i2');
});

test('the coach answers a notification with a notification', () => {
  const one = replyPush({ answer: '**Dobře**, zítra místo prahu 40 min sweet spot 3 × 8.\n\n[Návrhy: výměna]', actions: [{ type: 'replace', draftId: 41 }] }, 7);
  assert.equal(one.category, COACH_ACTION_CATEGORY);
  assert.equal(one.alert.body, 'Dobře, zítra místo prahu 40 min sweet spot 3 × 8.');
  assert.deepEqual(one.data, { coach: { kind: 'reply', chatId: 7, draftId: 41 } });
  const two = replyPush({ answer: 'Dvě změny.', actions: [{ draftId: 1 }, { draftId: 2 }] }, 7);
  assert.equal(two.category, COACH_REPLY_CATEGORY);assert.match(two.alert.body, /v aplikaci/);assert.equal(two.data.coach.draftId, undefined);
  assert.equal(replyPush({ answer: 'Jen text.', actions: [] }, 7).category, COACH_REPLY_CATEGORY);
  const hidden = replyPush({ answer: 'Dobře, zítra místo prahu 40 min sweet spot.', actions: [{ type: 'replace', draftId: 41 }] }, 7, { hide: true });
  assert.deepEqual(hidden.alert, { title: 'Kouč', body: 'Kouč odpověděl.' });
  assert.equal(hidden.category, COACH_ACTION_CATEGORY);
  assert.deepEqual(hidden.data, { coach: { kind: 'reply', chatId: 7, draftId: 41 }, private: { title: 'Kouč', body: 'Dobře, zítra místo prahu 40 min sweet spot.' } });
  assert.equal(failedReplyPush(null, 7).category, null);
  assert.ok(shortBody('slovo '.repeat(300)).length <= 600);
  assert.equal(plainText('# Nadpis\n- jedna\n- dvě'), 'Nadpis\n· jedna\n· dvě');
  assert.equal(pushOpening('Tři krátké noci za sebou', 'Zítřejší práh vyměním?'), '**Tři krátké noci za sebou**\n\nZítřejší práh vyměním?');
});

test('a chat answered from a push starts with the push and keeps message ids', async () => {
  const raw = createD1(), db = scopedDb(raw, 1), other = scopedDb(raw, 2);
  const id = await startChatWithCoach(db, 'Tři krátké noci za sebou', pushOpening('Tři krátké noci za sebou', 'Zítřejší práh vyměním?'));
  assert.equal(await appendChatTurn(db, id, 'Mám jen 40 minut', 'Dám ti sweet spot.'), id);
  const chat = await readChat(db, id);
  assert.equal(chat.title, 'Tři krátké noci za sebou');
  assert.deepEqual(chat.messages.map(m => m.role), ['assistant', 'user', 'assistant']);
  assert.ok(chat.messages.every(m => Number.isInteger(m.id)));
  assert.equal(await lastAnswerId(db, id), chat.messages[2].id);
  assert.equal(await lastAnswerId(other, id), null);
  assert.deepEqual((await chatContext(db, id)).map(t => t.role), ['assistant', 'user', 'assistant']);
});
