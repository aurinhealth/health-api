import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

function deployClient(proposals, { intervals = true } = {}) {
  const calls = [], timers = [], listeners = {};
  const state = { proposals };
  const context = vm.createContext({
    state, INTERVALS_DELAY_MAX_MS: 15000, Date, Math, Number, Object, Boolean, String, Set,
    // An athlete with (or, with intervals: false, without) Intervals.icu connected.
    serviceConnected: id => id !== 'intervals' || intervals,
    esc: v => String(v ?? ''), toast() {}, renderWeekHub() {}, statusPausesTraining: () => false,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    showPendingAdd: () => 'pending', settlePendingAdd() {},
    scheduleProposal: async key => { calls.push('schedule ' + key); state.proposals[key].scheduled = true; return true; },
    jsonFetch: async (url, options) => { calls.push(url + ' ' + options.body); return { status: 'ok' }; },
    document: { querySelectorAll: () => [] }, window: { addEventListener: (type, fn) => { listeners[type] = fn; } }
  });
  vm.runInContext(slice('// ---- Approved proposals go to Intervals.icu by themselves', 'function installProposals(){'), context);
  return { context, state, calls, timers, listeners, run: code => vm.runInContext(code, context) };
}

test('rides and runs are saved in the app within 15 s; a gym proposal waits for its confirmation', async () => {
  const app = deployClient({
    '2026-10-06|ride': { workout: { id: 'w1', name: 'Sweet Spot' } },
    '2026-10-08|gym': { gym: 5, gymPreview: { draftId: 7, plan: { planName: 'Upper Body' } } },
    '2026-10-09|run': { workout: { id: 'w2' }, existing: 'planned:1' },
    '2026-10-10|ride': { error: 'Bez návrhu' }
  });
  app.run('queueProposalPush()');
  assert.equal(app.timers.at(-1).ms, 15000);
  const waiting = app.run('deployStepsHtml()');
  assert.match(waiting, /✓ Vygenerováno<\/b><small>2 z 3 · 1 se nepovedlo/);
  assert.match(waiting, /Ke schválení<\/b><small>1 gym · otevři návrh a potvrď/);
  assert.match(waiting, /Nasazuji<\/b><small>do plánu aplikace do 15 s · 1/);
  assert.equal(app.run("proposalWaiting(state.proposals['2026-10-08|gym'])"), false);
  // An alternative to an already planned session is never sent.
  assert.equal(app.run("proposalWaiting(state.proposals['2026-10-09|run'])"), false);
  await app.run('pushApprovedProposals(true)');
  assert.deepEqual(app.calls, ['schedule 2026-10-06|ride']);
  assert.match(app.run('deployStepsHtml()'), /✓ Nasazeno<\/b><small>1 v plánu aplikace/);
});

test('without Intervals.icu rides are still saved in the app plan', async () => {
  const app = deployClient({ '2026-10-06|ride': { workout: { id: 'w1', name: 'Sweet Spot' } } }, { intervals: false });
  app.run('queueProposalPush()');
  assert.equal(app.run("proposalWaiting(state.proposals['2026-10-06|ride'])"), true);
  await app.run('pushApprovedProposals(true)');
  assert.deepEqual(app.calls, ['schedule 2026-10-06|ride']);
  assert.match(app.run('deployStepsHtml()'), /✓ Nasazeno<\/b><small>1 v plánu aplikace/);
});

test('"Nezapisovat" keeps a proposal out; leaving the page sends the rest at once', async () => {
  const app = deployClient({ '2026-10-06|ride': { workout: { id: 'w1' } }, '2026-10-07|run': { workout: { id: 'w2' } } });
  app.run('queueProposalPush()');
  app.state.proposals['2026-10-07|run'].skip = true;
  app.run('queueProposalPush()');
  await app.listeners.pagehide();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(app.calls, ['schedule 2026-10-06|ride']);
  assert.match(app.run('deployStepsHtml()'), /✓ Nasazeno<\/b><small>1 v plánu aplikace · 1 nezapsáno/);
});

test('saving a workout asks no question; the click or the approval is the decision', () => {
  assert.doesNotMatch(source, /window\.confirm\('Přidat/);
  assert.match(source, /Do Intervals\.icu se zapíšou samy do 15 s/);
});

test('a rated session shows a tick instead of the Hodnocení button', () => {
  const state = { reflections: {}, ratedSessions: new Set() };
  const context = vm.createContext({ state, Number, String });
  vm.runInContext(slice('// A finished session already rated', '// Walks are everyday movement'), context);
  const rated = x => vm.runInContext('sessionRated(x)', Object.assign(context, { x }));
  const ride = { name: 'Sweet Spot', date: '2026-10-05', a: { name: 'Sweet Spot' }, daySessions: 2 };
  assert.equal(rated(ride), false);
  assert.equal(rated({ ...ride, a: { payload: { icu_rpe: 6 } } }), true);
  state.reflections['2026-10-05'] = [{ rpe: 7, notes: 'Gym: těžké nohy' }];
  assert.equal(rated(ride), false);
  state.reflections['2026-10-05'].push({ rpe: 6, notes: 'Sweet Spot: dobré' });
  assert.equal(rated(ride), true);
  // The only session of a day with a rating is that session.
  state.reflections['2026-10-04'] = [{ rpe: 5, notes: null }];
  assert.equal(rated({ name: 'Run', date: '2026-10-04', a: {}, daySessions: 1 }), true);
  state.ratedSessions.add('2026-10-03|Long ride');
  assert.equal(rated({ name: 'Long ride', date: '2026-10-03', a: {}, daySessions: 3 }), true);
  assert.match(source, /sessionRated\(x\)\?'<span class="today-rated">✓ ohodnoceno<\/span>'/);
});
