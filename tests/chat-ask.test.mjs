import test from 'node:test';
import assert from 'node:assert/strict';
import { askedSession } from '../src/chat-ask.js';
import { assistantTask } from '../src/coach-assistant.js';

// Revize doporučování tréninků 2026-10-16, nález 9 and 16.
test('the day, length and kind a chat message asks for', () => {
  const today = '2026-10-17'; // Saturday
  assert.deepEqual(askedSession('45 min intervalů zítra', today), { date: '2026-10-18', minutes: 45, kind: null });
  assert.deepEqual(askedSession('Jen 30 min na trenažéru, co nejvíc', today), { date: null, minutes: 30, kind: null });
  assert.deepEqual(askedSession('V úterý chci sweet spot na hodinu', today), { date: '2026-10-20', minutes: 60, kind: 'sweet_spot' });
  assert.deepEqual(askedSession('Dneska 1,5 h vytrvalost', today), { date: today, minutes: 90, kind: 'endurance' });
  assert.deepEqual(askedSession('V sobotu dlouhou jízdu 3 h', today), { date: today, minutes: 180, kind: 'long' });
  assert.equal(askedSession('pozítří VO2max', today).date, '2026-10-19');
});

test('a question how to train the rest of the week goes to the full model', () => {
  for (const m of ['Jak mám jezdit zbytek týdne?', 'Jak mám jezdit zbytek týdne, když mám TSB −30?', 'Jak mám rozvrhnout tréninky do konce týdne?', 'How should I ride the rest of the week?'])
    assert.equal(assistantTask(m, { view: 'today' }), 'planning', m);
  for (const m of ['Kolik mám tento týden tréninků?', 'Co mám zítra za trénink?', 'Jaké mám FTP?'])
    assert.equal(assistantTask(m, { view: 'today' }), 'quick', m);
});
