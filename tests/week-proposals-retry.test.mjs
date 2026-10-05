import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('const TRANSIENT_ERROR='), source.indexOf('async function scheduleProposal('));

function setup(answers) {
  const calls = [], el = () => ({ textContent: '', innerHTML: '', disabled: false });
  const nodes = { proposeWeek: el(), plannerStatus: el() };
  const ctx = vm.createContext({ state: {}, statusCoachingRevision: 0, Set, Promise, JSON, String, Number,
    setTimeout: fn => fn(), $: id => nodes[id] || null, renderWeekHub() {}, proposalKey: (d, s, n) => d + '|' + s + (n ? '|' + n : ''),
    jsonFetch: async (path, o) => { calls.push([path, JSON.parse(o.body).date]); const a = answers.shift(); if (a instanceof Error) throw a; return a; } });
  vm.runInContext(code, ctx);
  return { ctx, calls, nodes };
}

test('a busy server is tried once more, then the chip offers a retry', async () => {
  const { ctx, calls, nodes } = setup([new Error('Invalid response'), { status: 'ok', workout: { name: 'Endurance' } }, new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long.'), new Error('Invalid response')]);
  const done = await vm.runInContext(`generateWeekProposals([{date:'2026-10-10',sport:'ride',minutes:90},{date:'2026-10-09',sport:'gym',minutes:30}])`, ctx);
  assert.equal(calls.length, 4);
  assert.equal(done.ok, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(done.failed.map(x => x.date))), ['2026-10-09']);
  assert.equal(ctx.state.proposals['2026-10-10|ride'].workout.name, 'Endurance');
  assert.equal(ctx.state.proposals['2026-10-09|gym'].error, 'Server byl přetížený, návrh se nepřipravil.');
  assert.equal(ctx.state.proposals['2026-10-09|gym'].item.date, '2026-10-09');
  assert.equal(ctx.state.proposalsBusy, false);
  assert.match(nodes.plannerStatus.innerHTML, /připraveno 1 · nepovedlo se 1/);
});

test('a real refusal is not repeated', async () => {
  const { ctx, calls } = setup([new Error('V tento den nemáš dost času na tento trénink.')]);
  const done = await vm.runInContext(`generateWeekProposals([{date:'2026-10-10',sport:'ride',minutes:90}])`, ctx);
  assert.equal(calls.length, 1);
  assert.equal(ctx.state.proposals['2026-10-10|ride'].error, 'V tento den nemáš dost času na tento trénink.');
  assert.equal(done.failed.length, 1);
});
