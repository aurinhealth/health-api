import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/dashboard.js', import.meta.url), 'utf8');
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

function context(extra = {}) {
  const ctx = vm.createContext({ Math, Number, String, Date, state: {}, HUB_SPORTS: { ride: '🚴 Kolo', run: '🏃 Běh', gym: '🏋️ Gym' },
    dateShift: (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); },
    renderPlanner() {}, renderWeekHub() {}, ...extra });
  vm.runInContext(source.match(/function esc\(v\)\{.*\}/)[0] + ';' + source.match(/function num\(v,d=0\)\{.*\}/)[0] + ';' + source.match(/function fmt\(v,d=0\)\{.*\}/)[0] + ';' + source.match(/function dec\(v,d=1\)\{.*\}/)[0] + ';' + source.match(/function cz\(v,d=1\)\{.*\}/)[0] + ';' + source.match(/function hm\(min\)\{.*\}/)[0], ctx);
  vm.runInContext(slice('function intensityOf(', 'async function renderWeekHub('), ctx);
  return ctx;
}

test('moving a chip drops the proposal of its old day, so the chip really moves', () => {
  const changed = [];
  const ctx = context({ plannerChanged: () => changed.push(1) });
  vm.runInContext(slice('function chipTarget(', 'function weekTargetText('), ctx);
  vm.runInContext(slice('function plannerPlace(', 'async function saveWeekPlanner('), ctx);
  ctx.state.weekPlan = { start: '2026-10-05', prefs: { days: [['ride'], [], [], [], [], [], []] } };
  ctx.state.proposals = { '2026-10-05|ride': { workout: { name: 'Sweet spot' } }, '2026-10-07|gym': { gym: 4 } };
  ctx.plannerPlace('ride', 2, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.state.weekPlan.prefs.days.slice(0, 3))), [[], [], ['ride']]);
  assert.deepEqual(Object.keys(ctx.state.proposals), ['2026-10-07|gym']);
  // Dropped back on its own day: nothing to save.
  ctx.plannerPlace('ride', 2, 2);
  assert.equal(changed.length, 1);
});

test('day proposals wait 5 s after a change and show length, TSS, IF and focus', () => {
  const ctx = context();
  ctx.state.weekPlan = { dirty: false }; ctx.state.plannerQuietUntil = Date.now() + 3000;
  assert.equal(ctx.plannerQuiet(), true);
  ctx.state.plannerQuietUntil = Date.now() - 1;
  assert.equal(ctx.plannerQuiet(), false);
  ctx.state.weekPlan.dirty = true;
  assert.equal(ctx.plannerQuiet(), true);
  assert.equal(vm.runInContext('PLANNER_QUIET_MS', ctx), 5000);
  const html = ctx.chipSuggestion('2026-10-10', 'ride', { role: 'endurance', label: 'Vytrvalost' }, { minutes: 120, tss: 98, intensity: .7 }, '5|ride|0');
  assert.match(html, /⏱ 2h 0m ▾/);
  assert.match(html, /~98 TSS · IF 0,70 · Vytrvalost/);
  // The athlete's own length shows at once, the load follows the same IF.
  ctx.state.weekPlan.prefs = { sessions: { '5|ride|0': { minutes: 60 } } };
  const own = ctx.chipSuggestion('2026-10-10', 'ride', { role: 'endurance', label: 'Vytrvalost' }, { minutes: 120, tss: 98, intensity: .7 }, '5|ride|0');
  assert.match(own, /⏱ 1h 0m ▾/);
  assert.match(own, /~49 TSS/);
  assert.match(html, /data-chip-suggest/);
  assert.match(html, /data-minutes="120"/);
  // IF from load and length when the server gives none; gym has no IF.
  assert.equal(Math.round(ctx.intensityOf(100, 60) * 100) / 100, 1);
  assert.equal(ctx.ifText(30, 60, 'gym'), '');
});

test('planner bar: renamed generate button with its info, recommendations button, no hint texts', () => {
  assert.match(page, /✨ Vygenerovat tréninky<\/button><button type="button" class="info-tip" data-info="generateWeek"/);
  assert.match(page, /id="openRecommendations"[^>]*>📚 Doporučené tréninky/);
  assert.doesNotMatch(page, /Navrhnout tréninky|Přetáhni sport, nebo na něj ťukni|Trénink na den/);
  assert.doesNotMatch(source, /Ťukni na den, kam/);
  assert.match(source, /generateWeek:\['Vygenerovat tréninky'/);
  // The library lives in the dialog, with filters that can be hidden.
  const dialog = page.slice(page.indexOf('<dialog id="recommendDialog"'), page.indexOf('</dialog>', page.indexOf('<dialog id="recommendDialog"')));
  for (const id of ['dailyRecommendation', 'recommendFocus', 'toggleRecommendFilters', 'recommendFilters', 'workoutResults', 'generatedWorkout'])assert.match(dialog, new RegExp('id="' + id + '"'));
});

test('the daily recommendation appears only when today has no plan', () => {
  const ctx = context({ pragueToday: () => '2026-10-05', pragueMonday: () => '2026-10-05', isNutritionItem: () => false, activitySport: a => a.type === 'Ride' ? 'ride' : null, weekdayOf: d => (new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7 });
  vm.runInContext(slice('function todayHasPlan(', '// Any sport for a free day'), ctx);
  ctx.state.week = { days: [{ date: '2026-10-05', daily: { training: { planned: [] } } }] };
  ctx.state.weekPlan = { start: '2026-10-05', prefs: { days: [[], [], [], [], [], [], []] } };
  assert.equal(ctx.todayHasPlan(), false);
  ctx.state.weekPlan.prefs.days[0] = ['gym'];
  assert.equal(ctx.todayHasPlan(), true);
  ctx.state.weekPlan.prefs.days[0] = [];
  ctx.state.week.days[0].daily.training.planned = [{ type: 'Ride', name: 'Endurance' }];
  assert.equal(ctx.todayHasPlan(), true);
});

test('one day holds several sessions: a second ride, gym back on a cancelled day', () => {
  const restored = [];
  const ctx = context({ plannerChanged() {}, restoreCancelledGym: date => restored.push(date), toast() {} });
  vm.runInContext(slice('function chipTarget(', 'function weekTargetText('), ctx);
  vm.runInContext(slice('function plannerPlace(', 'async function saveWeekPlanner('), ctx);
  ctx.state.weekPlan = { start: '2026-10-05', prefs: { days: [['ride'], [], [], [], [], [], ['ride']] } };
  ctx.state.proposals = { '2026-10-11|ride|1': { workout: { name: 'Lehce' } } };
  ctx.plannerPlace('ride', 6, 0, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.state.weekPlan.prefs.days[6])), ['ride', 'ride']);
  // Chips keep their slot among the same sport, and a lone proposal gets a chip.
  ctx.state.weekPlan.prefs.days[6] = ['ride'];
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.planChips(6, '2026-10-11'))), [{ sport: 'ride', slot: 0, index: 0 }, { sport: 'ride', slot: 1, index: null }]);
  ctx.plannerPlace('gym', 6);
  assert.deepEqual(restored, ['2026-10-11']);
  ctx.state.weekPlan.prefs.days[2] = ['ride', 'ride', 'run', 'gym'];
  ctx.plannerPlace('run', 2);
  assert.equal(ctx.state.weekPlan.prefs.days[2].length, 4);
  assert.equal(ctx.proposalKey('2026-10-11', 'ride', 0), '2026-10-11|ride');
  assert.equal(ctx.proposalKey('2026-10-11', 'ride', '1'), '2026-10-11|ride|1');
});
