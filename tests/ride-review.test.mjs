import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRideReview, plannedSteps, alignSteps, recoverySignals } from '../src/ride-review.js';
import { withLang } from '../src/lang.js';

// A real outdoor threshold ride (2026-10-07) and its plan.
const description = 'Nástup nad VO₂ a pak držet práh.\n\nWarmup\n- 15m 53-63% progresivně\n\n4x\n- 30s 150-600% max sprint naplno, vyšší převod\n- 4m30s 95-101%\n- 5m 47-57% lehce\n\n- 25m 60-70% aerobní dojezd\n\nCooldown\n- 10m 45-55% lehce';
const iv = (start, seconds, watts, hr, maxHr, maxWatts, elevation = 0) => ({ start, seconds, watts, hr, maxHr, maxWatts, elevation });
const intervals = [
  iv(0, 1054, 195, 149, 172, 445, 108), iv(1054, 30, 675, 162, 182, 974), iv(1084, 269, 268, 173, 183, 352), iv(1353, 300, 150, 145, 170, 243),
  iv(1653, 30, 589, 161, 183, 708), iv(1683, 339, 272, 170, 184, 459), iv(2022, 303, 162, 149, 166, 270),
  iv(2325, 30, 619, 157, 181, 893), iv(2355, 271, 265, 174, 182, 390), iv(2626, 321, 105, 136, 177, 244),
  iv(2947, 30, 625, 160, 181, 886), iv(2977, 300, 272, 174, 182, 549), iv(3277, 303, 147, 144, 169, 317),
  iv(3580, 1500, 177, 149, 173, 714), iv(5080, 80, 144, 141, 156, 281)
];
const activity = { id: 'activity:i194737568', type: 'Ride', name: 'Threshold s ostrým startem 4×5 · 90 min', start: '2026-10-07T16:43:03', durationHours: 4933 / 3600, tss: 141, calories: 983, payload: { icu_ftp: 260 } };
const detail = { activity: { icu_ftp: 260, icu_normalized_watts: 264, average_watts: 202, hr_load: 88, carbs_used: 256, total_elevation_gain: 452 }, intervals };
const plan = { tss: 87, durationHours: 1.5, description };
const wellness = [
  ['2026-09-30', 96.7, 55, 6.1], ['2026-10-01', 98.9, 55, 6], ['2026-10-02', 117.5, 53, 5.6], ['2026-10-03', 72.2, 54, 9],
  ['2026-10-04', 83.7, 46, 6.1], ['2026-10-05', 74.2, 47, 5.3], ['2026-10-06', 86.9, 54, 5.6], ['2026-10-07', 51.1, 56, 6]
].map(([id, hrv, restingHR, h]) => ({ id, hrv, restingHR, sleepSecs: h * 3600 }));
const review = lang => withLang(lang, () => buildRideReview({ activity, detail, plan, wellness, fitness: { tsb: -12 }, date: '2026-10-07' }));

test('planned steps get their roles', () => {
  const roles = plannedSteps(description).map(s => s.role);
  assert.deepEqual(roles, ['warmup', ...Array(4).fill(['sprint', 'work', 'rest']).flat(), 'endurance', 'cooldown']);
});

test('recorded intervals pair with the plan, missing cool-down included', () => {
  const { steps, quality } = alignSteps(plannedSteps(description), intervals, 260);
  assert.ok(quality > .9);
  assert.equal(steps.filter(s => s.role === 'work').map(s => s.actual.watts).join(), '268,272,265,272');
  assert.equal(steps.at(-1).actual.seconds, 80);
});

test('the ride review reads like a coach: blocks, targets, wins, fixes and recovery', () => {
  const r = review('cs'), text = JSON.stringify(r);
  assert.match(r.verdict, /lehce přepálená/);
  assert.match(r.target, /95–101 %, tedy zhruba 247–263 W při FTP 260 W/);
  assert.deepEqual(r.table.rows[0], ['1', '675 W (974)', '268 W · 4:29', '173 / 183']);
  assert.equal(r.table.rows.length, 4);
  assert.match(text, /rozptylem jen 7 W/);
  assert.match(text, /Rozjetí bylo moc ostré: průměr 195 W \(75 %\) místo 53–63 %, tep až 172/);
  assert.match(text, /108 m stoupání/);
  assert.match(text, /Pauzy mezi bloky: 1\. a 2\. vyšly na 150 a 162 W místo 122–148 W, 3\. a 4\. byly opravdu volné \(105, 147 W\)/);
  assert.match(text, /Chybí vyjetí: místo 10 min jen 80 s, celkově 82 z 90 min/);
  assert.match(text, /Aerobní dojezd: 25 min na 177 W sedí do pásma 60–70 %/);
  assert.match(text, /FTP nastavené o něco níž/);
  assert.match(text, /TSS 141 je nadsazené.*264 W při průměru 202 W.*tepu vychází na 88, plán byl 87/);
  assert.match(text, /HRV spadlo na 51 \(předchozí dny 72–118\)/);
  assert.match(text, /zítra dej volno nebo jen lehké vyjetí/);
  assert.match(text, /jízda jich spálila kolem 260 g/);
  assert.equal(r.chart.steps.length, 15);
  assert.equal(r.chart.steps[2].status, 'over');
});

test('the review is written in English when the app is in English', () => {
  const r = review('en'), text = JSON.stringify(r);
  assert.match(r.verdict, /slightly too hard/);
  assert.match(text, /The warm-up was too hard/);
  assert.match(text, /What went well/);
  assert.match(text, /Aerobic part: 25 min at 177 W/);
  assert.doesNotMatch(text, /[ěščřžýáíéůú]/i);
});

test('without a plan or intervals the review stays honest', () => {
  const r = withLang('cs', () => buildRideReview({ activity, detail: null, plan: null }));
  assert.equal(r.table, null);
  assert.match(r.actions.join(' '), /Bez spárovaného plánu/);
});

test('recovery signals compare the day with the athlete\'s own previous week', () => {
  const s = recoverySignals(wellness, '2026-10-07');
  assert.equal(s.hrv.drop, true);
  assert.equal(s.sleep.nights, 4);
});

test('the AI coach is scoped to the app\'s sports and keeps what it learns per athlete', async () => {
  const { coachInstructions } = await import('../src/coach-assistant.js');
  assert.match(coachInstructions, /^Jsi trenér v aplikaci Loadwise pro cyklistiku \(venku i na trenažeru\), běh a posilovnu/);
  assert.match(coachInstructions, /platí jen pro něj/);
  assert.match(coachInstructions, /completedRideReviews/);
  assert.doesNotMatch(coachInstructions, /WorldTour|UAE/);
});

test('the Today screen shows "how to start today" only in the morning, and draws the review', async () => {
  const fs = await import('node:fs'), vm = await import('node:vm');
  const source = fs.readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
  const fn = name => { const start = source.indexOf('function ' + name + '('); return source.slice(start, source.indexOf('\nfunction ', start + 1)); };
  const ctx = { esc: v => String(v), window: { innerWidth: 1200 } };
  vm.createContext(ctx);
  Object.assign(ctx, { uiText: cs => cs, fmt: (v, d = 0) => Math.round(Number(v) * 10 ** d) / 10 ** d, num: v => Number(v) || 0, hm: m => Math.floor(m / 60) + 'h ' + Math.round(m % 60) + 'm', primarySleepSessions: s => s || [], localToday: () => '2026-10-07', dateShift: (d, k) => new Date(Date.parse(d + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10),
    state: { sleep: { sessions: [{ date: '2026-10-07', durationMin: 334 }, { date: '2026-10-06', durationMin: 450 }] }, fitness: { wellness: [{ id: '2026-10-05', hrv: 80 }, { id: '2026-10-06', hrv: 82 }, { id: '2026-10-07', hrv: 51, ctl: 60, atl: 72 }] } } });
  vm.runInContext(['morningWindow', 'niceTicks', 'rideReviewCard', 'rideReviewChart', 'gymSetsChart', 'withRatings', 'ratingCard', 'rpeColor', 'rpeWord', 'ratingSignals', 'coachAdvice'].map(fn).join('\n') + '\n;this.m=morningWindow;this.card=rideReviewCard;this.withRatings=withRatings;this.ratingCard=ratingCard;', ctx);
  // The athlete's rating and the coach's answer follow the session's review card.
  const advisor = { title: 'Výživa', headline: 'Jídlo' }, ride = { headline: 'Threshold 4×5', sections: [] }, gym = { headline: 'Horní tělo', sets: [] };
  let list = ctx.withRatings([advisor, ride], [{ rpe: 8, notes: 'Křeč do lýtka', text: 'Zítra volno.', source: 'ai' }]);
  assert.equal(list[2].rating, true);
  assert.equal(list[2].name, 'Threshold 4×5');
  list = ctx.withRatings([ride, gym, advisor], [{ rpe: 6, notes: 'Horní tělo: těžké', text: 'Dobře.' }]);
  assert.deepEqual([list[2].name, list[2].note], ['Horní tělo', 'těžké']);
  // RPE as a 10-step scale, the day's sleep, HRV and form as tiles, the coach in points.
  const rated = ctx.ratingCard({ name: 'Threshold 4×5', rpe: 8, note: 'Křeč do lýtka', date: '2026-10-07', ai: true,
    text: 'RPE 8 je vysoké, ale sedí k sprintům; spal jsi jen 5 h 34 min. HRV 51 ms je pod průměrem. Zítra odpočívej. Pokud lýtko bolí, obrať se na odborníka.' });
  assert.equal((rated.match(/<i class="on"/g) || []).length, 8);
  assert.match(rated, /RPE 8<\/b> · těžké/);
  assert.match(rated, /<blockquote class="rating-note" data-no-i18n>Křeč do lýtka/);
  assert.match(rated, /Spánek<\/span><b class="ink" style="--c:#ff9a4d">5h 34m/);
  assert.match(rated, /HRV<\/span><b class="ink" style="--c:#ff6478">51 ms<\/b><small>průměr 81 ms/);
  assert.match(rated, /Forma<\/span><b[^>]*>−12<\/b><small>TSB · únava/);
  assert.match(rated, /<p class="advice-lead">RPE <b>8<\/b> je vysoké, ale sedí k sprintům<\/p>/);
  assert.match(rated, /😴<\/span><span>Spal jsi jen <b>5 h 34 min<\/b>/);
  assert.match(rated, /advice-call next"><span aria-hidden="true">📅<\/span><span>Zítra odpočívej/);
  assert.match(rated, /advice-call warn/);
  assert.match(rated, /data-add-recovery data-date="2026-10-07"/);
  const recovery = ctx.coachAdvice('Dobrá práce. Večer si dej 10 minut protažení lýtek a hamstringů. Zítra máš volný den.', true);
  assert.match(recovery, /advice-call recover"><span aria-hidden="true">🧘/);
  assert.match(ctx.coachAdvice('Dobrá práce. Sauna ti pomůže.', true), /♨️/);
  const at = (h, m = 0) => new Date(2026, 9, 7, h, m);
  // Without sleep data: 4:00–11:59.
  assert.deepEqual([3, 4, 9, 11, 12, 19].map(h => ctx.m(at(h))), [false, true, true, true, false, false]);
  // Nights tracked but last night not synced yet: wait for it.
  assert.equal(ctx.m(at(7), { tracked: true, today: false }), false);
  // Synced: from waking up until noon, at least 4 hours after a late wake-up.
  const woke = h => ({ tracked: true, today: true, wokeAt: at(h).toISOString() });
  assert.deepEqual([[5, 6], [7, 6], [11, 6], [12, 6], [19, 6]].map(([h, w]) => ctx.m(at(h), woke(w))), [false, true, true, false, false]);
  assert.deepEqual([[12, 10], [13, 10], [14, 10]].map(([h, w]) => ctx.m(at(h), woke(w))), [true, true, false]);
  assert.equal(ctx.m(at(8), { tracked: true, today: true, wokeAt: null }), true);
  const r = review('cs'), html = ctx.card({ title: 'Kolo · hodnocení jízdy', headline: 'Threshold', ...r });
  assert.match(html, /<svg/);
  assert.equal((html.match(/class="review-bar"/g) || []).length, 15);
  assert.match(html, /<td>268 W · 4:29<\/td>/);
  assert.match(html, /Co příště líp/);
});
