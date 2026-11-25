import test from 'node:test';
import assert from 'node:assert/strict';
import { wilson, scoreLines } from '../scripts/coach-eval-score.mjs';
import { COACH_EVAL_SCENARIOS, isHoldout, handleCoachEval } from '../src/coach-eval.js';

test('the Wilson interval matches known values', () => {
  const [lo, hi] = wilson(8, 10);
  assert.equal(lo.toFixed(3), '0.490');
  assert.equal(hi.toFixed(3), '0.943');
  assert.deepEqual(wilson(0, 0), null);
  assert.equal(wilson(10, 10)[1], 1);
});

test('every fifth situation by number is held out, about a fifth of them', () => {
  assert.ok(isHoldout('S05') && isHoldout('S100') && isHoldout('D15') && isHoldout('K10'));
  assert.ok(!isHoldout('S01') && !isHoldout('L05') && !isHoldout('P05') && !isHoldout('P05.1'));
  const share = COACH_EVAL_SCENARIOS.filter(s => isHoldout(s.id)).length / COACH_EVAL_SCENARIOS.length;
  assert.ok(share > 0.15 && share < 0.25, String(share));
});

test('the scenario list marks held-out situations', async () => {
  const request = new Request('https://staging.aurin.health/automation/coach-eval', { method: 'POST', body: '{}' });
  const list = await (await handleCoachEval(request, { ENVIRONMENT: 'staging' }, { kind: 'coach-eval' })).json();
  assert.equal(list.scenarios.find(s => s.id === 'S10').holdout, true);
  assert.equal(list.scenarios.find(s => s.id === 'S11').holdout, undefined);
});

test('the score shows both sets and warns when the tuning set is clearly better', () => {
  const ok = id => ({ id, status: 'ok', passed: true, checks: [{ ok: true }] });
  const bad = id => ({ id, status: 'ok', passed: true, checks: [{ ok: false, severity: 'quality' }] });
  const results = [...Array.from({ length: 40 }, (_, i) => ok('T' + i)), ...Array.from({ length: 10 }, (_, i) => bad('H' + i))];
  const lines = scoreLines(results, new Set(results.slice(40).map(r => r.id))).join('\n');
  assert.match(lines, /Ladicí sada[\s\S]*všechny kontroly prošly: 40\/40/);
  assert.match(lines, /Kontrolní sada \(held-out\)[\s\S]*všechny kontroly prošly: 0\/10/);
  assert.match(lines, /přizpůsobil testům/);
  assert.doesNotMatch(scoreLines(results.slice(0, 40), new Set()).join('\n'), /Kontrolní|přizpůsobil/);
});
