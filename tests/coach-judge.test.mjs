import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeAnswer, judgeChecks, JUDGE_RULES } from '../src/coach-judge.js';
import { callClaude } from '../src/coach-checker.js';
import { runScenario, runScreenScenario, scenarioById, scenarioContext, handleCoachEval, JUDGE_CALIBRATION, runJudgeCalibration } from '../src/coach-eval.js';
import { coachChatInstructions } from '../src/coach-assistant.js';
import { withLang } from '../src/lang.js';

const date = '2026-10-16', now = '2026-10-16 07:40';
const verdicts = list => async (env, request) => ({ request, text: JSON.stringify({ rules: list }), model: 'claude-haiku-5-5', usd: 0.0012 });
const NUMBERS_FAIL = { rule: 'NUMBERS', verdict: 'fail', quote: '69 a spánek 5 h 31 min', why: '3 čísla, limit 1' };

test('the rule judge gives one verdict per rule, the rules go to the cached part', async () => {
  let sent = null;
  const ask = async (env, request) => { sent = request; return verdicts([NUMBERS_FAIL, { rule: 'FACTS', verdict: 'pass', quote: '', why: '' }, { rule: 'STYLE', verdict: 'fail', quote: 'x', why: 'y' }])(env, request); };
  const j = await judgeAnswer({}, { rules: 'Text: at most one number.', data: { sleep: 331 }, message: 'Today', answer: 'Připravenost 69 a spánek 5 h 31 min.' }, { ask });
  assert.deepEqual(j.rules.map(r => r.rule), JUDGE_RULES);
  assert.deepEqual(j.rules.map(r => r.verdict), ['fail', 'pass', 'na', 'na', 'na', 'na']);
  assert.equal(j.model, 'claude-haiku-5-5');assert.equal(j.usd, 0.0012);
  assert.equal(sent.instructions.length, 2);assert.equal(sent.instructions[1], 'Text: at most one number.');
  assert.ok(sent.input.includes('"sleep":331') && sent.input.includes('Připravenost 69'));
  await assert.rejects(judgeAnswer({}, { rules: '', data: {}, message: '', answer: '' }, { ask: async () => ({ text: 'nope' }) }));

  // A fail is a quality check with the quote, na is no check, a broken judge is one failed check.
  const checks = judgeChecks(j);
  assert.deepEqual(checks.map(c => [c.name, c.ok, c.severity]), [['pravidlo: počet čísel', false, 'quality'], ['pravidlo: fakta podle dat', true, 'quality']]);
  assert.ok(checks[0].detail.includes('3 čísla, limit 1'));
  assert.deepEqual(judgeChecks({ error: 'timeout', rules: [] }).map(c => [c.ok, c.detail]), [[false, 'rozhodčí selhal: timeout']]);
});

test('Claude gets the cached rules and its cost counts cache writes and reads', async () => {
  const real = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (url, init) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }],
    usage: { input_tokens: 1000, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0, output_tokens: 500 } })); };
  try {
    const r = await callClaude({ ANTHROPIC_API_KEY: 'k' }, { instructions: ['judge', 'rules'], input: 'x', effort: 'medium' });
    assert.deepEqual(body.system, [{ type: 'text', text: 'judge' }, { type: 'text', text: 'rules', cache_control: { type: 'ephemeral' } }]);
    assert.equal(body.output_config.effort, 'medium');
    // (1000 × 0.10 + 20000 × 0.125 + 500 × 0.50) / 1e6
    assert.equal(r.usd, 0.00285);
    await callClaude({ ANTHROPIC_API_KEY: 'k' }, { instructions: 'checker', input: 'x' });
    assert.equal(body.system, 'checker');assert.equal(body.output_config.effort, 'low');
  } finally { globalThis.fetch = real; }
});

test('the eval runs the judge on Today texts and chat answers as quality checks', async () => {
  let seen = null;
  const rate = async (env, input) => { seen = input; return { rules: [NUMBERS_FAIL], model: 'claude-haiku-5-5', ms: 900, usd: 0.001 }; };
  const today = async () => ({ text: JSON.stringify({ text: 'Připravenost 69 a spánek 5 h 31 min z potřebných 7 h 24 min.', advice: 'Už netrénuj a jdi spát.' }), model: 'gpt-6-luna' });
  const screen = await runScreenScenario({}, scenarioById('S67'), { ask: today, rate });
  // The judge reads the screen's own instructions (the Today one-number rule) and the screen's data.
  assert.ok(seen.rules.includes('nejvýš jedním číslem'));assert.equal(seen.data.readiness, 69);
  assert.ok(seen.answer.startsWith('Připravenost 69') && seen.answer.endsWith('jdi spát.'));
  const check = screen.checks.find(c => c.name === 'pravidlo: počet čísel');
  assert.equal(check.ok, false);assert.equal(screen.passed, true);assert.equal(screen.judge.usd, 0.001);

  const ask = async () => ({ status: 'ok', answer: 'Dnes bych dal lehkou jízdu.', actions: [], visuals: [], model: 'm' });
  const chat = await runScenario({}, scenarioById('S02'), { ask, check: async () => ({ flags: [] }), rate, date, now });
  // The chat's own instructions, word for word, as askCoach sends them.
  assert.equal(seen.rules, coachChatInstructions(scenarioContext(scenarioById('S02'), date, now).focus, true));
  assert.equal(seen.message, scenarioById('S02').message);
  assert.equal(chat.checks.find(c => c.name === 'pravidlo: počet čísel').ok, false);assert.equal(chat.passed, true);
  // Without Anthropic's key (and no test judge) it does not run; a hidden answer is not judged.
  assert.ok(!(await runScreenScenario({}, scenarioById('S67'), { ask: today })).judge);
  seen = null;
  await runScenario({}, scenarioById('S07'), { ask, check: async () => ({ flags: [] }), rate, date, now });
  assert.equal(seen, null);
});

test('the judge calibration knows which rule each Today text breaks', async () => {
  assert.deepEqual(JUDGE_CALIBRATION.map(c => c.id), Array.from({ length: 11 }, (_, i) => 'J' + String(i + 1).padStart(2, '0')));
  const j01 = JUDGE_CALIBRATION.find(c => c.id === 'J01'), j03 = JUDGE_CALIBRATION.find(c => c.id === 'J03');
  const fails = list => async () => ({ rules: list, model: 'claude-haiku-5-5', ms: 1, usd: 0.0005 });
  assert.equal((await runJudgeCalibration({}, j01, { rate: fails([NUMBERS_FAIL]) })).correct, true);
  assert.equal((await runJudgeCalibration({}, j01, { rate: fails([]) })).correct, false);
  assert.equal((await runJudgeCalibration({}, j03, { rate: fails([]) })).correct, true);
  assert.equal((await runJudgeCalibration({}, j03, { rate: fails([NUMBERS_FAIL]) })).correct, false);
  // The English one reads the English instructions.
  let rules = null;
  await withLang('en', () => runJudgeCalibration({}, JUDGE_CALIBRATION.find(c => c.id === 'J02'), { rate: async (env, input) => { rules = input.rules; return { rules: [] }; } }));
  assert.ok(rules.includes('at most one number'));

  // The list names the items; an unknown one is a 404.
  const post = body => handleCoachEval(new Request('https://staging.aurin.health/automation/coach-eval', { method: 'POST', body: JSON.stringify(body) }), { ENVIRONMENT: 'staging' }, { kind: 'coach-eval' });
  assert.deepEqual((await (await post({})).json()).judgeCalibration, JUDGE_CALIBRATION.map(c => c.id));
  assert.equal((await post({ judgeCalibrate: 'J99' })).status, 404);
});
