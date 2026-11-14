import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCoachActions, actionSummary, chatV1On, replaceAsked } from '../src/coach-actions.js';
import { quickOptions } from '../src/coach-quick-change.js';
import { extendGymPlan, focusChanges, planStarted } from '../src/coach-gym-adjustment.js';
import { planValues } from '../src/gym-plan-store.js';
import { estimateStrengthTiming } from '../src/strength-timing.js';
import { EXERCISES, FOCUS_GROUPS } from '../src/strength-generator.js';

// Chat v1 (Petr 2026-11-14): the day's gym plan lengthened or given another
// focus from the chat, only where the server has CHAT_V1 on.
const date = '2026-11-14';
const sets = (name, kg, reps) => [1, 2, 3].map(n => ['WORK', name, String(n), String(kg), reps, '', '', '', 'FALSE', '[Pauza 120 s]', '', 'FALSE', '', '', '']);
const full = planValues({ date, planName: 'Celé tělo', timing: { requestedMinutes: 45, estimatedMinutes: 40 }, rows: [...sets('Pivot leg press', 150, '8-12'), ...sets('DB bench press', 26, '8-12'), ...sets('Lat pulldown', 55, '8-12'), ...sets('Seated leg curl', 40, '10-12')] });
const upper = planValues({ date, planName: 'Horní polovina', rows: [...sets('DB bench press', 26, '8-12'), ...sets('Lat pulldown', 55, '8-12'), ...sets('DB shoulder press', 18, '8-12')] });
const LEGS = ['quads', 'hamstrings', 'hips', 'calves'];
const legWork = values => values.slice(7).some(r => r[0] === 'WORK' && LEGS.some(g => FOCUS_GROUPS[g].exercises.includes(r[1])));
const minutesOf = values => estimateStrengthTiming(values.slice(7).filter(r => r?.[1]), EXERCISES, 90).estimatedMinutes;
const base = { week: [], athleteState: 'active' };
const gymAction = (extra = {}) => ({ type: 'workout', eventId: '', date, sport: 'gym', minutes: 90, status: '', statusUntil: '', reason: 'Posilovna podle zadání', fromExercise: '', toExercise: '', workoutId: '', kind: '', activityId: '', otherActivityId: '', time: '', kcal: 0, gymFocus: '', gymMuscles: [], ...extra });

test('the switch is on only where the server says so', () => {
  assert.equal(chatV1On({ CHAT_V1: 'true' }), true);
  assert.equal(chatV1On({}), false);
  assert.equal(chatV1On({ CHAT_V1: 'false' }), false);
  const staging = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.equal((staging.match(/"CHAT_V1": "true"/g) || []).length, 1, 'staging only');
  assert.ok(staging.indexOf('"CHAT_V1"') > staging.indexOf('"ENVIRONMENT": "staging"'));
});

test('a longer session adds exercises for the halves the plan trains, the rest stays row for row', () => {
  const longer = extendGymPlan({ values: full, history: [] }, 90);
  assert.ok(longer.added.length >= 2 && longer.added.length <= 4, longer.added.join(', '));
  assert.ok(longer.estimatedMinutes <= 90 && longer.estimatedMinutes > minutesOf(full));
  const kept = longer.values.slice(7).filter(r => !longer.added.includes(r[1]));
  assert.deepEqual(kept, full.slice(7), 'nothing already in the plan changes');
  // Groups the plan did not train come first: no second chest press or leg curl.
  for (const name of longer.added) assert.ok(!['chest', 'hamstrings', 'lats', 'quads'].includes(EXERCISES[name].muscle) || false, name);
  assert.equal(longer.values.find(r => r[0] === 'Časový limit (min)')?.[1], 90);
});

test('an upper-body day stays without legs and a plan that fills the time gets nothing', () => {
  const longer = extendGymPlan({ values: upper, history: [] }, 80);
  assert.ok(longer?.added.length);
  assert.equal(legWork(longer.values), false);
  assert.equal(extendGymPlan({ values: full, history: [] }, minutesOf(full) + 3), null);
});

test('exercises on a sore part or a broken machine are not added', () => {
  const plain = extendGymPlan({ values: full, history: [] }, 90).added;
  assert.ok(plain.includes('Hip thrust') && plain.some(n => /cable/i.test(n)), plain.join(', '));
  const longer = extendGymPlan({ values: full, history: [] }, 90, ['Bolí mě kyčel'], ['cables']);
  assert.ok(!longer.added.some(n => /hip thrust|glute bridge|abduction|adduction|cable/i.test(n)), longer.added.join(', '));
});

test('another focus is a change only when the plan does not have it yet', () => {
  assert.equal(focusChanges(full, { focus: 'upper' }), true);
  assert.equal(focusChanges(full, { focus: 'lower' }), true);
  assert.equal(focusChanges(upper, { focus: 'upper' }), false);
  assert.equal(focusChanges(full, { muscles: ['chest'] }), false);
  assert.equal(focusChanges(full, { muscles: ['biceps', 'chest'] }), true);
  assert.equal(focusChanges(full, {}), false);
  // A core-only plan changes with either half.
  const core = planValues({ date, planName: 'Břicho', rows: [...sets('Crunches', '', '15'), ...sets('Plank', '', '60')] });
  assert.equal(focusChanges(core, { focus: 'lower' }), true);
  assert.equal(focusChanges(core, { focus: 'upper' }), true);
});

test('a new plan only when the athlete asks for another focus instead, never for a length or an extra', () => {
  for (const m of ['Dneska chci místo celého těla jen horní polovinu.', 'Radši dneska nohy.', 'Změň to na horní polovinu', 'Only upper body today instead', 'Dnes bych dal spíš horní polovinu', 'Udělej z toho leg day', 'Místo nohou dneska záda, mám hodinu']) assert.equal(replaceAsked(m), true, m);
  for (const m of ['Prodluž mi to na 90 min a přidej něco na nohy', 'Prodluž mi to na 90 min, přidej ramena', 'Zkrať to na 30 min', 'Mám jen 50 min', 'Mám jen hodinu', 'Přidej tam jen biceps', 'Posuň mi dnešní posilovnu na večer', 'Make it longer, only upper body']) assert.equal(replaceAsked(m), false, m);
  const ctx = { ...base, gymPlan: { values: full }, chatV1: true };
  const [longer] = validateCoachActions([gymAction({ gymFocus: 'lower' })], { ...ctx, userMessage: 'Prodluž mi to na 90 min a přidej něco na nohy' }, date, { userInitiated: true });
  assert.ok(longer.trim?.added?.length && !longer.replace, 'lengthened, not replaced');
  const [shorter] = validateCoachActions([gymAction({ minutes: 30, gymFocus: 'upper' })], { ...ctx, userMessage: 'Zkrať to na 30 min' }, date, { userInitiated: true });
  assert.ok(shorter.trim && !shorter.replace && !shorter.trim.added);
});

test("the plan's own length or less is never a lengthening", () => {
  // Limit 45, estimate 40: 45 or 50 min re-proposed is no card for more exercises.
  assert.equal(extendGymPlan({ values: full, history: [] }, 45), null);
  const ctx = { ...base, gymPlan: { values: full }, chatV1: true, userMessage: 'Posuň mi dnešní posilovnu na večer' };
  assert.deepEqual(validateCoachActions([gymAction({ minutes: 45 })], ctx, date, { userInitiated: true }), []);
});

test('a lengthened card is not shortened by a chip and a replacing card stays on its day', () => {
  const quick = { today: date, budget: {}, planned: [], days: [] };
  const [kept] = validateCoachActions([gymAction()], { ...base, gymPlan: { values: full }, chatV1: true, userMessage: 'Prodluž mi posilovnu na 90 minut.' }, date, { userInitiated: true });
  assert.equal(quickOptions(kept, quick)?.shorter ?? false, false);
  const [replace] = validateCoachActions([gymAction({ minutes: 60, gymFocus: 'upper' })], { ...base, gymPlan: { values: full }, chatV1: true, userMessage: 'Dneska místo celého těla jen horní polovinu.' }, date, { userInitiated: true });
  assert.equal(quickOptions(replace, { ...quick, days: [{ date: '2026-11-15', fits: true }] })?.day ?? false, false);
});

test('with Chat v1 a longer session lengthens the plan; without it no card', () => {
  const ctx = { ...base, gymPlan: { values: full }, userMessage: 'Mám dneska víc času, prodluž mi posilovnu na 90 minut.' };
  assert.deepEqual(validateCoachActions([gymAction()], ctx, date, { userInitiated: true }), []);
  const [kept] = validateCoachActions([gymAction()], { ...ctx, chatV1: true }, date, { userInitiated: true });
  assert.ok(kept.trim?.added?.length);
  assert.deepEqual(kept.trim.source, full);
  assert.deepEqual(kept.trim.removed, []);
  assert.match(actionSummary(kept), /prodloužený na 90 min/);
});

test('with Chat v1 another focus replaces a plan not started; a started one keeps it', () => {
  const ctx = { ...base, gymPlan: { values: full }, userMessage: 'Dneska chci místo celého těla jen horní polovinu.', chatV1: true };
  const [kept] = validateCoachActions([gymAction({ minutes: 60, gymFocus: 'upper' })], ctx, date, { userInitiated: true });
  assert.equal(kept.gymFocus, 'upper');
  assert.deepEqual(kept.replace.source, full);
  assert.ok(!kept.trim);
  assert.match(actionSummary(kept), /místo dosavadního plánu/);
  const started = full.map(r => r.slice()), i = started.findIndex(r => r[1] === 'Pivot leg press');
  started[i][5] = '150'; started[i][6] = '10'; started[i][8] = 'TRUE';
  assert.equal(planStarted(started), true);
  assert.deepEqual(validateCoachActions([gymAction({ minutes: 60, gymFocus: 'upper' })], { ...ctx, gymPlan: { values: started } }, date, { userInitiated: true }), []);
  // Without Chat v1 the same card only shortens, as before.
  const [old] = validateCoachActions([gymAction({ minutes: 30, gymFocus: 'upper' })], { ...ctx, chatV1: false }, date, { userInitiated: true });
  assert.ok(old.trim && !old.replace);
});

test('the gym confirm replaces only the plan the card was made against, at its time', () => {
  const src = readFileSync(new URL('../src/routes-gym.js', import.meta.url), 'utf8');
  assert.match(src, /!current\.stored\|\|current\.cancelled\|\|JSON\.stringify\(current\.values\)!==JSON\.stringify\(body\.replaceSource\)\|\|planStarted\(current\.values\)/);
  assert.match(src, /readGymPlan\(env\.DB,plan\.date,\{includeCancelled:true\}\)/);
  assert.match(src, /if\(!await replaceStrengthPlanInDb\(env\.DB,plan,body\.replaceSource\)\)throw/);
  assert.match(src, /'health-strength-'\+plan\.date/);
  const entry = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(entry, /a\.replace\?\{replaceSource:a\.replace\.source\}:\{\}/);
});

test('the replacement is one conditional write: a plan changed meanwhile stays', async () => {
  const { replaceStrengthPlanInDb } = await import('../src/gym-plan-store.js');
  const stored = { json: JSON.stringify(full) };
  const db = { userId: 1, prepare: sql => ({ bind: (...args) => ({ run: async () => {
    if (/^UPDATE gym_plans/.test(sql)) { const ok = args[3] === stored.json; if (ok) stored.json = args[0]; return { meta: { changes: ok ? 1 : 0 } }; }
    return { meta: {} };
  }, all: async () => ({ results: [] }), first: async () => null }) }) };
  const plan = { date, planName: 'Horní polovina', rows: sets('DB bench press', 26, '8-12') };
  const logged = full.map(r => r.slice()); logged[8][8] = 'TRUE';
  assert.equal(await replaceStrengthPlanInDb(db, plan, logged), false);
  assert.equal(stored.json, JSON.stringify(full));
  assert.equal(await replaceStrengthPlanInDb(db, plan, full), true);
  assert.match(stored.json, /Horní polovina/);
});

test('lighter or heavier weights of the plan, done sets kept, only with Chat v1', async () => {
  const { gymLoadAsked } = await import('../src/coach-actions.js');
  const { scalePlanLoads } = await import('../src/coach-quick-change.js');
  assert.deepEqual(['Dneska to dej lehčí', 'Dej mi těžší váhy', 'Zkrať to a dej lehčí', 'Make it heavier', 'Je to těžké?', 'Uber váhy', 'Víc váhy, cítím se silný', 'lighter weights please', 'Ubrat váhu'].map(gymLoadAsked), [-1, 1, 0, 1, 0, -1, 1, -1, -1]);
  // Not about the session's weights (review of #1091).
  assert.deepEqual(['Mám dneska těžší den', 'Včera byl těžší trénink, jak dnes?', 'Lehčí den by se hodil', 'Dej mi těžší trénink zítra', 'I had a harder day', 'Měl jsem těžkou noc', 'Dej mi po tréninku lehčí jídlo'].map(gymLoadAsked), [0, 0, 0, 0, 0, 0, 0]);
  const done = full.map(r => r.slice()), i = done.findIndex(r => r[1] === 'Pivot leg press');
  done[i][5] = '150'; done[i][6] = '10'; done[i][8] = 'TRUE';
  const ticked = done.findIndex((r, j) => j > i && r[1] === 'Pivot leg press'); done[ticked][8] = 'Yes';
  const lighter = scalePlanLoads(done, -1);
  assert.equal(lighter[i][3], '150', 'a done set keeps its load');
  assert.equal(lighter[ticked][3], '150', 'a set ticked Yes keeps its load');
  assert.equal(lighter.find(r => r[1] === 'DB bench press' && r[0] === 'WORK')[3], '22.5');
  const ctx = { ...base, gymPlan: { values: full }, userMessage: 'Dneska to v posilovně dej lehčí, cviky nech.' };
  assert.equal(validateCoachActions([gymAction({ minutes: 45 })], ctx, date, { userInitiated: true }).some(a => a.loadStep), false);
  const [kept] = validateCoachActions([gymAction({ minutes: 45 })], { ...ctx, chatV1: true }, date, { userInitiated: true });
  assert.equal(kept.loadStep, -1);
  assert.deepEqual(kept.trim.source, full);
  assert.match(actionSummary(kept), /lehčími vahami/);
  assert.equal(validateCoachActions([gymAction({ minutes: 45 })], { ...ctx, chatV1: true, userMessage: 'Mám dneska těžší den, co posilovna?' }, date, { userInitiated: true }).some(a => a.loadStep), false);
});

test('the weight chips always scale the unscaled plan and never logged sets', async () => {
  const { quickChange } = await import('../src/coach-quick-change.js');
  const logged = full.map(r => r.slice()), i = logged.findIndex(r => r[1] === 'Pivot leg press');
  logged[i][5] = '150'; logged[i][6] = '10'; logged[i][8] = 'TRUE';
  const [card] = validateCoachActions([gymAction({ minutes: 45 })], { ...base, chatV1: true, gymPlan: { values: logged }, userMessage: 'Dej mi dneska lehčí váhy.' }, date, { userInitiated: true });
  const quick = { today: date, budget: {}, planned: [], days: [] }, bench = v => v.find(r => r[1] === 'DB bench press' && r[0] === 'WORK')[3];
  const harder = quickChange(card, 'harder', quick).action;
  assert.equal(harder.loadStep, 0);
  assert.deepEqual(harder.trim.values, logged, 'lighter then heavier is the plan again');
  assert.equal(harder.workoutName, 'Dnešní plán');
  const heavier = quickChange(harder, 'harder', quick).action;
  assert.equal(bench(heavier.trim.values), '27.5');
  assert.match(heavier.workoutName, /těžšími/);
  const easier = quickChange(quickChange(heavier, 'easier', quick).action, 'easier', quick).action;
  assert.equal(bench(easier.trim.values), '22.5');
  for (const a of [harder, heavier, easier]) assert.equal(a.trim.values[i][3], '150', 'the logged set keeps its load');
});

test('persona run 77: "swap upper for lower" replaces the plan, a card at another length without asking is no lengthening, todayGym says how long the plan takes', async () => {
  assert.equal(replaceAsked("Swap today's upper body for lower body."), true);
  assert.equal(replaceAsked('Vyměň dnešní horní polovinu za nohy.'), true);
  const ctx = { ...base, chatV1: true, gymPlan: { values: full } };
  const [swap] = validateCoachActions([gymAction({ minutes: 60, gymFocus: 'lower' })], { ...ctx, userMessage: "Swap today's upper body for lower body." }, date, { userInitiated: true });
  assert.ok(swap.replace, 'a plan of the other focus in its place');
  assert.equal(swap.trim, undefined);
  // A longer card the athlete did not ask for is not lengthened.
  assert.deepEqual(validateCoachActions([gymAction({ minutes: 60 })], { ...ctx, userMessage: 'Co dneska v posilovně?' }, date, { userInitiated: true }).filter(a => a.trim?.added), []);
  assert.ok(validateCoachActions([gymAction({ minutes: 60 })], { ...ctx, userMessage: 'Dneska mám víc času, klidně hodinu.' }, date, { userInitiated: true }).some(a => a.trim?.added?.length));
  const { todayGymContext } = await import('../src/coach-gym-adjustment.js');
  assert.equal(todayGymContext({ values: full }, date).estimatedMinutes, minutesOf(full));
});
