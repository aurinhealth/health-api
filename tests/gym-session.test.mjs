import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { cleanGymRows, rowsFromModel, planForModel } from '../src/gym-adjust.js';

const source = readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
function client(today = '2026-10-06') {
  const context = vm.createContext({uiText:cs=>cs, esc: v => String(v ?? ''), fmt: v => String(v), num: v => Number(v) || 0, cz: v => String(v), localToday: () => today, MUSCLE_LABELS: { chest: 'Hrudník' }, $: () => null });
  vm.runInContext(between('function gymRowWork(', 'function renumberGymRows('), context);
  const at = source.indexOf('function gymFailureValue(');
  vm.runInContext(source.slice(at, source.indexOf('\n', at)), context);
  vm.runInContext(between('// Body figure of a gym session', '// The day\'s exercises in a few lines'), context);
  vm.runInContext(between('// ---- One gym session as one view', '// Missing muscles of exercises'), context);
  return code => vm.runInContext(code, context);
}
const row = (type, name, n, kg, reps, akg = '', areps = '', done = 'FALSE') => [type, name, String(n), kg, reps, akg, areps, '', done, '', '', 'FALSE', ''];

test('a done session lists warm-ups and work sets with what was lifted, and its records', () => {
  const run = client();
  const rows = [row('WARMUP', 'Bench', 1, '20', '8', '20', '8', 'TRUE'), row('WORK', 'Bench', 1, '40', '8-10', '45', '8', 'TRUE'), row('WORK', 'Bench', 2, '40', '8-10', '42,5', '10', 'TRUE'), row('WORK', 'Row', 1, '50', '10', '', '', 'FALSE')];
  const history = [{ exercise: 'Bench', workout_date: '2026-09-29', actual_kg: 42.5, actual_reps: 8 }, { exercise: 'Bench', workout_date: '2026-10-06', actual_kg: 45, actual_reps: 8 }, { exercise: 'Row', workout_date: '2026-09-29', actual_kg: 50, actual_reps: 10 }];
  const records = run('gymDayRecords(' + JSON.stringify(rows) + ',' + JSON.stringify(history) + ',"2026-10-06")');
  assert.deepEqual(JSON.parse(JSON.stringify(records)), { Bench: { kind: 'weight', kg: 45, reps: 8, before: 42.5 } });
  const html = run('gymSessionHtml({rows:' + JSON.stringify(rows) + ',muscles:{},mode:"done",date:"2026-10-06",editable:true,records:' + JSON.stringify(records) + '})');
  assert.match(html, /gs-tag" title="Rozcvička">R</);
  assert.equal((html.match(/data-gs-col="5"/g) || []).length, 4);
  assert.match(html, /🏆 Osobní rekord · nejtěžší váha 45 kg × 8 <small>dosud 42,5 kg/);
  assert.match(html, /<span>Odcvičeno<\/span><b>2 \/ 3 sérií/);
  assert.match(html, /<span>Rozcvička<\/span><b>1 série/);
  assert.match(html, /gs-prs"><b>🏆 Nový osobní rekord<\/b><ul><li><span>Bench<\/span><strong>45 kg × 8<\/strong><small>dosud max 42,5 kg/);
  assert.match(html, /data-gs="video" data-name="Row"/);
  assert.doesNotMatch(html, /data-gs="swap"/);
  assert.doesNotMatch(html, /data-gs-ai/);
});

test('a first try of an exercise is not a record, and a better estimated 1RM is', () => {
  const run = client();
  const rows = [row('WORK', 'Curl', 1, '12', '10', '12', '12', 'TRUE'), row('WORK', 'Press', 1, '30', '8', '30', '10', 'TRUE')];
  const history = [{ exercise: 'Press', workout_date: '2026-09-01', actual_kg: 30, actual_reps: 8 }];
  const records = JSON.parse(JSON.stringify(run('gymDayRecords(' + JSON.stringify(rows) + ',' + JSON.stringify(history) + ',"2026-10-06")')));
  assert.equal(records.Curl, undefined);
  assert.equal(records.Press.kind, 'e1rm');
});

test('a planned session or proposal can be edited: planned kg and reps, swap, sets and the AI coach', () => {
  const run = client();
  const rows = [row('WARMUP', 'Bench', 1, '20', '8'), row('WORK', 'Bench', 1, '40', '8-10'), row('WORK', 'Bench', 2, '40', '8-10')];
  const html = run('gymSessionHtml({rows:' + JSON.stringify(rows) + ',muscles:{Bench:{chest:1}},mode:"draft",date:"2026-10-09",editable:true,uid:1})');
  assert.equal((html.match(/data-gs-col="3"/g) || []).length, 3);
  assert.doesNotMatch(html, /data-gs-col="5"/);
  assert.match(html, /data-gs="swap"/);
  assert.match(html, /data-gs="remove-set"/);
  assert.match(html, /data-gs-ai/);
  assert.match(html, /<small>Hrudník<\/small>/);
  const readOnly = run('gymSessionHtml({rows:' + JSON.stringify(rows) + ',muscles:{},mode:"draft",date:"2026-10-09",editable:false})');
  assert.doesNotMatch(readOnly, /<input|data-gs="remove"|data-gs-ai/);
  assert.match(readOnly, /40 kg × 8-10/);
});

test('the AI answer becomes plan rows only from the catalog, keeping each exercise\'s notes', () => {
  const original = [row('WARMUP', 'Bench', 1, '20', '8'), ['WORK', 'Bench', '1', '40', '8-10', '', '', '', 'FALSE', 'Hrudník [Pauza 90 s]', '', 'TRUE', 'A']];
  assert.deepEqual(planForModel(original), [{ name: 'Bench', sets: [{ type: 'WARMUP', kg: 20, reps: '8' }, { type: 'WORK', kg: 40, reps: '8-10' }] }]);
  const rows = rowsFromModel([
    { name: 'Bench', sets: [{ type: 'WORK', kg: 41.2, reps: '8' }, { type: 'WORK', kg: 41, reps: '8' }] },
    { name: 'DB curl', sets: [{ type: 'WORK', kg: null, reps: '10' }] },
    { name: 'Invented press', sets: [{ type: 'WORK', kg: 10, reps: '10' }] },
    { name: 'Bench', sets: [{ type: 'WORK', kg: 99, reps: '1' }] }
  ], original, new Map([['DB curl', { note: 'Biceps' }]]));
  assert.deepEqual(rows.map(r => [r[1], r[2], r[3], r[9], r[11], r[12]]), [['Bench', '1', '41', 'Hrudník [Pauza 90 s]', 'FALSE', 'A'], ['Bench', '2', '41', 'Hrudník [Pauza 90 s]', 'TRUE', 'A'], ['DB curl', '1', '', 'Biceps', 'FALSE', '']]);
});

test('a confirmed proposal keeps only planning columns of known exercises', () => {
  const rows = cleanGymRows([row('WORK', 'Bench', 1, '40.3', '8', '45', '8', 'TRUE'), row('WORK', 'Mystery', 1, '1', '1'), ['STRETCH', 'Bench']], new Set(['Bench']));
  assert.deepEqual(rows, [['WORK', 'Bench', '1', '40,5', '8', '', '', '', 'FALSE', '', '', 'FALSE', '']]);
  assert.throws(() => cleanGymRows([row('WORK', 'Mystery', 1, '1', '1')], new Set(['Bench'])), /aspoň jeden cvik/);
});

test('"Vygenerovat tréninky" prepares the week without the chat and gym waits for "Potvrdit trénink"', () => {
  const generate = between('async function showAdaptiveWeekProposal(){', 'function renderAssistantWeekProposal(');
  assert.match(generate, /review:false/);
  assert.doesNotMatch(generate, /openFloatingAssistant|appendCoachTurn/);
  assert.match(source, /✓ Potvrdit trénink/);
  const server = readFileSync(new URL('../src/entrypoint.js', import.meta.url), 'utf8');
  assert.match(server, /if\(body\.review===false\)return Response\.json/);
  assert.match(server, /if\(Array\.isArray\(body\.rows\)\)plan\.rows=cleanGymRows/);
});
