import test from 'node:test';
import assert from 'node:assert/strict';
import { nightSegments, nightStats, nightDetail } from '../src/night-detail.js';

const start = '2026-10-07T21:30:00Z', at = m => new Date(Date.parse(start) + m * 60000).toISOString();
const stage = (type, a, b) => ({ type, startTime: at(a), endTime: at(b) });
const stages = [stage('AWAKE', 0, 12), stage('LIGHT', 12, 40), stage('DEEP', 40, 90), stage('DEEP', 90, 100), stage('AWAKE', 100, 106), stage('REM', 106, 150), stage('AWAKE', 150, 160), stage('LIGHT', 160, 300), stage('AWAKE', 300, 305)];

test('the night is cut into stage blocks with wake-ups, heart-rate spikes and HRV', () => {
  const segments = nightSegments(stages, start);
  assert.deepEqual(segments.slice(0, 3), [{ type: 'AWAKE', s: 0, e: 12 }, { type: 'LIGHT', s: 12, e: 40 }, { type: 'DEEP', s: 40, e: 100 }]);
  const hr = [{ m: 0, avg: 60, min: 58, max: 62 }, { m: 5, avg: 58, min: 55, max: 60 }, { m: 10, avg: 52, min: 50, max: 54 }, { m: 15, avg: 62, min: 55, max: 84 }];
  const s = nightStats(segments, hr, [{ m: 0, ms: 40 }, { m: 5, ms: 60 }]);
  // Falling asleep after 12 min; the final wake-up is not a wake-up during the night.
  assert.equal(s.latencyMin, 12); assert.equal(s.wakeups, 2); assert.equal(s.wasoMin, 16);
  assert.equal(s.lowHr, 52); assert.equal(s.lowHrAt, 10); assert.equal(s.avgHr, 58);
  assert.deepEqual(s.spikes, [{ m: 15, max: 84 }]);
  assert.deepEqual([s.hrv, s.hrvLow, s.hrvHigh], [50, 40, 60]);
});

test('night detail reads only the signed-in user and compares with the previous nights', async () => {
  const sql = [];
  const night = (day, startTime, endTime, extra = {}) => ({ external_id: day, start_time: startTime, end_time: endTime, payload_json: JSON.stringify({ sleep: { interval: { startTime, endTime, startUtcOffset: '7200s' }, stages: extra.stages || [], ...extra } }) });
  const rows = [night('a', start, at(305), { stages }), night('b', '2026-10-06T20:30:00Z', '2026-10-07T04:30:00Z'), night('nap', '2026-10-06T12:00:00Z', '2026-10-06T12:40:00Z')];
  const db = { userId: 7, prepare(q) { sql.push(q); return { bind: (...args) => { assert.equal(args[0], 7); return { all: async () => ({ results: /data_type='sleep'/.test(q) ? rows : /heart-rate'/.test(q) ? [{ bucket: Date.parse(start) / 1000 + 600, avg: 51, min: 49, max: 55 }] : [{ sample_time: at(30), rmssd: 48 }] }) }; } }; } };
  const d = await nightDetail(db, { date: '2026-10-08' });
  assert.ok(sql.every(q => /user_id=\?/.test(q)));
  assert.equal(d.night.asleepMin, 272); assert.equal(d.night.inBedMin, 305);
  assert.equal(d.night.stats.lowHr, 51); assert.equal(d.night.stats.lowHrAt, 10); assert.equal(d.night.stats.hrv, 48);
  // 23:30 local bedtime against 22:30 the night before.
  assert.equal(d.night.bedClock, 23 * 60 + 30); assert.equal(d.history.length, 1); assert.equal(d.night.usual.bedClock, 22 * 60 + 30);
  assert.equal((await nightDetail(db, { date: '2026-10-05' })).night, null);
});

test('the morning card draws the night: stages, heart rate with spikes, tiles and recent nights', async () => {
  const fs = await import('node:fs'), vm = await import('node:vm');
  const source = fs.readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
  const fn = name => { const s = source.indexOf('function ' + name + '('); return source.slice(s, source.indexOf('\nfunction ', s + 1)); };
  const ctx = { esc: v => String(v), window: { innerWidth: 1200 }, uiText: cs => cs, num: v => Number(v) || 0, measured: v => v != null && Number.isFinite(Number(v)), hm: m => Math.floor(m / 60) + 'h ' + Math.round(m % 60) + 'm', dateLabel: d => d.slice(8) + '.' };
  vm.createContext(ctx);
  vm.runInContext(source.match(/const NIGHT_STAGES=.*\n/)[0] + ['nightWidth', 'nightClock', 'clockLabel', 'nightChart', 'nightTiles', 'nightHistory', 'nightNote', 'nightHtml'].map(fn).join('\n') + '\n;this.nightHtml=nightHtml;', ctx);
  const segments = nightSegments(stages, start), hr = [{ m: 0, avg: 60, min: 58, max: 62 }, { m: 5, avg: 58, min: 55, max: 60 }, { m: 10, avg: 52, min: 50, max: 54 }, { m: 15, avg: 62, min: 55, max: 84 }];
  const html = ctx.nightHtml({ night: { start, end: at(305), asleepMin: 268, inBedMin: 305, stages: { DEEP: 60, REM: 44, LIGHT: 164, AWAKE: 33 }, bedClock: 23 * 60 + 30, segments, hr, stats: nightStats(segments, hr, [{ m: 0, ms: 50 }]), usual: { asleepMin: 420, bedClock: 22 * 60 + 30, deep: 90, rem: 80 } },
    history: [{ date: '2026-10-07', asleepMin: 420, stages: { DEEP: 90, REM: 80, LIGHT: 250 } }, { date: '2026-10-06', asleepMin: 400, stages: {} }] });
  assert.match(html, /Průběh noci/); assert.match(html, /Hluboký/); assert.match(html, /<polyline/); assert.match(html, /Výkyv tepu/);
  assert.match(html, /Do postele/); assert.match(html, /60 min později/); assert.match(html, /2×/); assert.match(html, /Poslední noci/); assert.match(html, /Dnes/);
  assert.match(html, /tep vyskočil|Tep vyskočil/);
  assert.equal(ctx.nightHtml({ night: null }), '');
});
