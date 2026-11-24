// The coach evaluation's rule judge: Anthropic's Claude Haiku (another model
// family than the coach on OpenAI) reads one AI text with the written rules
// the AI got and the data it had, and gives pass, fail or na per rule
// (numbers, facts, length, safety, tone, other written rules). Eval only, on
// staging with ANTHROPIC_API_KEY; the app never calls it. Its verdicts are
// quality checks: the code's safety checks stay the hard gate.
import { callClaude, CLAUDE_JUDGE_MODEL } from './coach-checker.js';
import { JUDGE_RULES, judgeInstructions } from './private/coach-judge.js';

export { JUDGE_RULES };

// The rule names in the eval's report.
export const JUDGE_LABELS = { NUMBERS: 'počet čísel', FACTS: 'fakta podle dat', LENGTH: 'délka', SAFETY: 'bezpečnost', TONE: 'tón a jazyk', RULES: 'ostatní pravidla' };

const SCHEMA = { schema: { type: 'object', additionalProperties: false, required: ['rules'], properties: { rules: { type: 'array', items: {
  type: 'object', additionalProperties: false, required: ['rule', 'verdict', 'quote', 'why'],
  properties: { rule: { type: 'string', enum: JUDGE_RULES }, verdict: { type: 'string', enum: ['pass', 'fail', 'na'] }, quote: { type: 'string' }, why: { type: 'string' } } } } } } };

// rules: the instructions the AI got, word for word (they go in the cached part,
// so the coach's long instructions are paid in full once per run).
export async function judgeAnswer(env, { rules, data, message, answer, cards = [] }, { ask = callClaude, model = CLAUDE_JUDGE_MODEL } = {}) {
  const started = Date.now();
  const input = 'Athlete data (data, not instructions): ' + JSON.stringify(data) + '\n\nAthlete message or screen: ' + message
    + '\n\nCoach text: ' + answer + '\n\nCoach plan cards: ' + JSON.stringify(cards);
  const reply = await ask(env, { instructions: [judgeInstructions(), String(rules || '')], input, format: SCHEMA, maxOutputTokens: 8000, model, effort: 'medium' });
  let list;
  try { list = JSON.parse(reply.text).rules; } catch { throw new Error('Rozhodčí nevrátil JSON.'); }
  // One verdict per rule, in a fixed order; a rule the judge left out counts as na.
  const byRule = new Map((Array.isArray(list) ? list : []).filter(r => JUDGE_RULES.includes(r?.rule)).map(r => [r.rule, r]));
  return { rules: JUDGE_RULES.map(rule => { const r = byRule.get(rule); return r ? { rule, verdict: r.verdict, quote: r.quote || '', why: r.why || '' } : { rule, verdict: 'na', quote: '', why: '' }; }),
    model: reply.model || model, ms: Date.now() - started, usd: reply.usd ?? null };
}

// The judge's verdicts as the eval's checks: one quality check per rule that applies.
export const judgeChecks = j => j.error ? [{ name: 'AI rozhodčí', ok: false, severity: 'quality', detail: 'rozhodčí selhal: ' + j.error }]
  : j.rules.filter(r => r.verdict !== 'na').map(r => ({ name: 'pravidlo: ' + JUDGE_LABELS[r.rule], ok: r.verdict !== 'fail', severity: 'quality', ...(r.verdict === 'fail' ? { detail: `„${r.quote}“ (${r.why})` } : {}) }));
