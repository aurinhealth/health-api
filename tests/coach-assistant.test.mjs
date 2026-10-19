import test from 'node:test';
import assert from 'node:assert/strict';
import {coachInstructions,coachContext,askCoach} from '../src/coach-assistant.js';

test('coach uses individual activity targets without claiming a pro-team job',()=>{
  assert.match(coachInstructions,/Počet aktivit vezmi z weeklyActivities/);
  assert.match(coachInstructions,/Nejsi zaměstnanec žádného profesionálního týmu/);
  const context=coachContext({date:'2026-09-28',daily:{training:{planned:[{name:'Z2'}]}},week:{days:[{date:'2026-09-28',daily:{training:{completed:[]}}}]},fitness:{wellness:[{id:'2026-09-28',ctl:50}]},health:{wellness:[]},gym:{history:[]}});
  assert.equal(context.rhythm,null);
  assert.equal(context.week[0].date,'2026-09-28');
});
test('assistant without API key returns explicit unavailable state',async()=>{
  assert.equal((await askCoach({},'Týdenní plán',{})).status,'unavailable');
});

// ---- English athletes, bilingual prompts, safety, compact context, streaming (A1, A3, A5–A8) ----
import { readFileSync } from 'node:fs';
import { assistantTask, isSimpleMessage, coachInstructionsFor, safetyNote, callOpenAI, TASK_TIMEOUTS, compactWellness } from '../src/coach-assistant.js';
import { reviewInstructionsText } from '../src/coach-review.js';
import { reflectionInstructionsText } from '../src/coach-reflection.js';
import { foodParseInstructionsText } from '../src/food-chat.js';
import { actionInstructions } from '../src/coach-actions.js';
import { withFocus, athleteFocus } from '../src/athlete-focus.js';
import { withLang } from '../src/lang.js';
import { createD1 } from './helpers/d1.mjs';
import { grantAiConsent } from './helpers/consent.mjs';
import { scopedDb } from '../src/tenancy.js';

const CZECH = /[ěščřžýůňťďĚŠČŘŽÝŮŇŤĎ]/;

test('an athlete writing in English is routed like one writing in Czech', () => {
  for (const m of ['Hi coach!', 'Thanks!', 'Good morning', 'What is sweet spot?']) assert.equal(assistantTask(m), 'simple', m);
  for (const m of ['Should I ride hard today?', 'I slept badly, should I still do intervals?', 'Why did you plan a rest day?', 'Can I add a run tomorrow?']) assert.equal(assistantTask(m), 'planning', m);
  // The iOS coach always opens on "today": no light model without the athlete's data.
  assert.equal(assistantTask('Should I ride hard today?', { view: 'today' }), 'planning');
  assert.equal(assistantTask('Thanks!', { view: 'food' }), 'planning');
  for (const m of ["What's my FTP?", 'How many calories do I have left today?', 'What is my heart rate zone 2?']) assert.equal(assistantTask(m), 'quick', m);
  for (const m of ['Make me a 12 week block', 'Plan my next 8 weeks', 'Prepare a plan until the race']) assert.equal(assistantTask(m), 'block', m);
  assert.equal(assistantTask('shorter', { sport: 'gym' }), 'adjustment');
  assert.equal(assistantTask('Swap the bench press for dumbbells'), 'adjustment');
  const chat = t => [{ role: 'user', content: t }, { role: 'assistant', content: 'x' }];
  assert.equal(assistantTask('And tomorrow?', null, chat('Should I ride hard today?')), 'planning');
  // Czech "i" (and also) is not the English "I".
  assert.equal(isSimpleMessage('Ahoj i tobě'), true);
  assert.equal(isSimpleMessage('I am tired'), false);
});

test('every AI prompt has its own English version, selected by the app language', () => {
  const prompts = () => [coachInstructionsFor(athleteFocus({ mainSport: 'running' }, '2026-10-05')), reviewInstructionsText(), reflectionInstructionsText(), foodParseInstructionsText(), actionInstructions(), safetyNote('assistant'), safetyNote('food-sentence'),
    withFocus(coachInstructionsFor(), athleteFocus({ mainSport: 'running', sportGoal: 'sub 3:30 marathon', eventName: 'Prague Marathon', eventDate: '2026-11-15' }, '2026-10-03'))];
  withLang('en', () => {
    for (const p of prompts()) { assert.doesNotMatch(p, CZECH, p.slice(0, 80)); assert.doesNotMatch(p, /česky/); }
    for (const p of prompts().slice(0, 4)) assert.match(p, /English/);
    assert.match(withFocus(coachInstructionsFor(), athleteFocus({ mainSport: 'running' }, '2026-10-03')), /^You are a professional coach for running and strength preparation\./);
    assert.match(prompts()[7], /Main race: “Prague Marathon” on 2026-11-15 \(in 43 days, 6 weeks\)/);
  });
  withLang('cs', () => { for (const p of prompts()) assert.match(p, CZECH); assert.match(coachInstructionsFor(), /Odpovídej v jazyce, ve kterém sportovec píše \(obvykle česky\)/); });
});

test('the priorities, hard-days and gym-legs rules follow the main sport; cycling keeps its text', () => {
  const ride = coachInstructionsFor(athleteFocus({ mainSport: 'cycling' }, '2026-10-05'));
  assert.equal(ride, coachInstructions);
  assert.match(ride, /silový trénink jako podpora cyklistiky/);
  assert.match(ride, /Nohy cyklisty omezuj jen před klíčovou jízdou/);
  const runFocus = athleteFocus({ mainSport: 'running' }, '2026-10-05'), run = withFocus(coachInstructionsFor(runFocus), runFocus);
  assert.doesNotMatch(run, /cyklist/i);
  assert.match(run, /dlouhý běh/);
  assert.match(run, /prevence zranění/);
  const strength = coachInstructionsFor(athleteFocus({ mainSport: 'strength' }, '2026-10-05'));
  assert.match(strength, /kardio jako podpora zdraví a regenerace/);
  assert.match(strength, /dvojitá progrese/);
  assert.match(coachInstructionsFor(athleteFocus({}, '2026-10-05')), /rovnováha vytrvalosti a síly/);
  assert.match(withLang('en', () => coachInstructionsFor(athleteFocus({ mainSport: 'running' }, '2026-10-05'))), /one long run a week/);
});

test('a safety note goes with every AI request; food features get the nutrition line', async () => {
  assert.match(safetyNote('assistant'), /BEZPEČNOST: .*1200 kcal.*lékaře.*respiration_elevated.*červená znamená jen volno/s);
  assert.match(safetyNote('food-sentence'), /1200 kcal/);
  assert.doesNotMatch(safetyNote('food-sentence'), /readiness/);
  assert.equal(safetyNote('barcode'), '');
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => { calls.push(init); return Response.json({ output: [{ content: [{ type: 'output_text', text: 'ok' }] }] }); };
  try {
    await withLang('en', () => callOpenAI({ OPENAI_API_KEY: 'sk' }, { feature: 'day-review', instructions: 'x', input: 'y', maxOutputTokens: 1500 }));
    const body = JSON.parse(calls[0].body);
    assert.match(body.instructions, /LANGUAGE: .*SAFETY: Never recommend eating below a reasonable floor/s);
    assert.match(body.instructions, /red allows only rest or easy recovery/);
    // The request cannot hang: a timeout sized by the task (A8b).
    assert.ok(calls[0].signal instanceof AbortSignal);
    await callOpenAI({ OPENAI_API_KEY: 'sk' }, { feature: 'assistant', instructions: 'x', input: 'y', maxOutputTokens: 25000, timeoutMs: TASK_TIMEOUTS.block });
    assert.ok(calls[1].signal instanceof AbortSignal);
    assert.deepEqual(TASK_TIMEOUTS, { simple: 60000, quick: 60000, adjustment: 120000, planning: 180000, block: 240000 });
  } finally { globalThis.fetch = original; }
});

test('the coach sees wellness as compact recovery rows, with the readiness flags', () => {
  const raw = { id: '2026-09-28', ctl: 50.26, atl: 60.1, hrv: 55.5, restingHR: 48, sleepSecs: 25200, respiration: 14.2, skinTempDeviation: 0.31, steps: 8000, spO2: 97.2, hrvSource: 'apple', provider_payload: { big: 'x' }, weight: 80 };
  const context = coachContext({ date: '2026-09-28', daily: {}, week: { days: [] }, fitness: { wellness: [raw, { id: '2026-09-29', ctl: 51 }] }, health: { wellness: [raw], sleep: [] }, gym: { history: [] } });
  const allowed = ['date', 'ctl', 'atl', 'tsb', 'hrv', 'restingHR', 'sleepMinutes', 'respiration', 'skinTempDeviation', 'steps', 'spO2'];
  for (const row of [...context.fitness, ...context.health]) for (const key of Object.keys(row)) assert.ok(allowed.includes(key), key);
  assert.deepEqual(context.health[0], { date: '2026-09-28', ctl: 50.3, atl: 60.1, tsb: -9.8, hrv: 55.5, restingHR: 48, sleepMinutes: 420, respiration: 14.2, skinTempDeviation: 0.31, steps: 8000, spO2: 97.2 });
  assert.equal(context.fitness.length, 1, 'a row after the date is the future');
  assert.ok(Array.isArray(context.cyclingCoachV2.readiness.flags));
  // Without wellness the whole health object no longer goes to the model.
  const bare = coachContext({ date: '2026-09-28', daily: {}, week: { days: [] }, fitness: {}, health: { stepsByHour: { a: 1 }, sleep: [] }, gym: { history: [] } });
  assert.equal(bare.health, null);
  assert.equal(compactWellness(null), null);
});

test('usage of a stream that fails after generation started is still recorded', async () => {
  const db = grantAiConsent(createD1(), 7), env = { DB: scopedDb(db, 7), USER_ID: 7, OPENAI_API_KEY: 'sk' };
  const events = [{ type: 'response.output_text.delta', delta: 'Ahoj' }, { type: 'response.failed', response: { model: 'gpt-6-sol', usage: { input_tokens: 1000, output_tokens: 50 }, error: { message: 'server overloaded' } } }];
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join(''), { status: 200 });
  try {
    await assert.rejects(callOpenAI(env, { feature: 'assistant', instructions: 'x', input: 'y', onText: () => {} }), /AI service broke off|AI odpověď přerušila/, 'OpenAI\'s own text stays in the log');
  } finally { globalThis.fetch = original; }
  const row = db.sqlite.prepare('SELECT feature, model, input_tokens, output_tokens FROM ai_usage').get();
  assert.deepEqual({ ...row }, { feature: 'assistant', model: 'gpt-6-sol', input_tokens: 1000, output_tokens: 50 });
});

test('after workout feedback without AI access the rule-based note is still written', () => {
  const entry = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(entry, /const reflect=validDate\(scheduledDate\),aiAllowed=Boolean\(env\.OPENAI_API_KEY\)&&\(await subscriptionStatus\(env\)\.catch\(\(\)=>\(\{aiAccess:false\}\)\)\)\.aiAccess;\s*const ruleEnv=\{\.\.\.env\};if\(!aiAllowed\)delete ruleEnv\.OPENAI_API_KEY;\s*if\(reflect\)ctx\.waitUntil\(createReflection\(ruleEnv,/);
});
