import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedCoachAnswer, coachCheckOn, SAFE_REPLY, COACH_CHECK_TIMEOUT_MS } from '../src/coach-checker.js';

const first = { status: 'ok', answer: 'Tvoje tělo bojuje s virem, dnes volno.', actions: [{ type: 'rest' }], visuals: ['sleep'], memory: { save: ['x'], forget: [], update: [] }, ms: 5000, model: 'gpt-6-sol' };
const flag = { cat: 'MDR', quote: 'bojuje s virem', why: 'diagnóza' };
const fixed = { status: 'ok', answer: 'HRV je pod tvým normálem, dnes volno.', actions: [{ type: 'rest' }], ms: 4000, model: 'gpt-6-sol' };
// A checker that answers in turn from the list.
const checker = (...replies) => { const calls = []; return { calls, check: async (env, request, options) => { calls.push({ request, options }); const r = replies.shift(); if (r instanceof Error) throw r; return { flags: r }; } }; };

test('the live check is on only with COACH_CHECK=true', () => {
  assert.equal(coachCheckOn({ COACH_CHECK: 'true' }), true);
  assert.equal(coachCheckOn({}), false);assert.equal(coachCheckOn({ COACH_CHECK: '1' }), false);
});

test('a clean answer passes as it is, with the 12 s limit', async () => {
  const c = checker([]);
  const r = await checkedCoachAnswer({}, first, { context: { a: 1 }, message: 'm', rewrite: () => assert.fail('no rewrite'), check: c.check });
  assert.equal(r.check.status, 'passed');assert.equal(r.answer, first);
  assert.equal(c.calls[0].options.timeoutMs, COACH_CHECK_TIMEOUT_MS);assert.deepEqual(c.calls[0].request.actions, first.actions);
});

test('a checker error or timeout lets the answer through as skipped', async () => {
  const c = checker(new Error('timeout'));
  const r = await checkedCoachAnswer({}, first, { context: {}, message: 'm', rewrite: () => assert.fail('no rewrite'), check: c.check });
  assert.equal(r.check.status, 'skipped');assert.equal(r.answer, first);
});

test('a finding goes back to the coach once; a clean rewrite is shown', async () => {
  const c = checker([flag], []);let note = null;const phases = [];
  const r = await checkedCoachAnswer({}, first, { context: {}, message: 'm', rewrite: async n => { note = n; return fixed; }, check: c.check, onPhase: (p, s) => phases.push(s ? p + ':' + s : p) });
  assert.deepEqual(phases, ['check', 'rewrite', 'done:rewritten']);
  assert.equal(r.check.status, 'rewritten');assert.equal(r.answer.answer, fixed.answer);assert.equal(r.answer.ms, 9000);
  assert.ok(note.includes('bojuje s virem'));
  assert.equal(c.calls[1].request.answer, fixed.answer);
});

test('a rewrite that fails again, errors or goes unchecked becomes the safe reply without cards', async () => {
  for (const [rewrite, second] of [[async () => fixed, [flag]], [async () => { throw new Error('limit'); }, []], [async () => ({ status: 'unavailable' }), []], [async () => fixed, new Error('timeout')]]) {
    const r = await checkedCoachAnswer({}, first, { context: {}, message: 'm', rewrite, check: checker([flag], second).check });
    assert.equal(r.check.status, 'fallback');assert.equal(r.answer.answer, SAFE_REPLY());
    assert.deepEqual(r.answer.actions, []);assert.deepEqual(r.answer.memory.save, []);assert.equal(r.answer.status, 'ok');
  }
});

test('the 12 s limit holds for the whole check, a cut-off first answer is not offered to continue', async () => {
  const slow = async () => new Promise(() => {});
  const r = await checkedCoachAnswer({}, first, { context: {}, message: 'm', rewrite: () => assert.fail('no rewrite'), check: slow, timeoutMs: 20 });
  assert.equal(r.check.status, 'skipped');
  const fallback = await checkedCoachAnswer({}, { ...first, incomplete: true }, { context: {}, message: 'm', rewrite: async () => { throw new Error('x'); }, check: checker([flag]).check });
  assert.equal(fallback.answer.incomplete, false);
});

test('the check is part of the chat: the daily AI limit leaves it out like the coach', async () => {
  const { readFileSync } = await import('node:fs');
  const usage = readFileSync(new URL('../src/ai-usage.js', import.meta.url), 'utf8'), entry = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(usage, /feature === COACH_CHAT_FEATURE \|\| feature === COACH_CHECK_FEATURE \? null/);
  assert.match(usage, /NOT IN \(\?, \?, \?\)[^\n]*COACH_CHAT_FEATURE, COACH_CHECK_FEATURE, CARRIED_MONTH_FEATURE/);
  // A photo message is not checked (the checker does not see the photo).
  assert.match(entry, /checking=coachCheckOn\(env\)&&!image/);
});
