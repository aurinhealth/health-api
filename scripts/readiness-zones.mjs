// How often the readiness is green, yellow or red on the test server's
// accounts, or once on the live server with the owner's yes (Petr
// 2026-11-06, audit O5 to finding 5.4). Read only:
// every statement that is not a SELECT is skipped, and the job prints counts
// per account under a number, never an id, an e-mail or a health value.
// Each day is the readiness Today shows (readiness.js readinessFor) from the
// account's stored Google/Apple days, nights, profile and morning locks;
// Intervals.icu wellness is not read here.
// CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: the GitHub environment staging,
// or production with READINESS_TARGET=production.
import { appendFileSync } from 'node:fs';
import { userEnv } from '../src/tenancy.js';
import { withTimeZone, localToday, validTimeZone } from '../src/user-time.js';
import { googleDashboard } from '../src/google-dashboard.js';
import { loadEffectiveProfile } from '../src/profile-suggestions.js';
import { readinessLocks } from '../src/readiness-lock.js';
import { readinessFor } from '../src/readiness.js';
import { sleepSettings } from '../src/energy-profile.js';
import legacyHealthApi from '../src/index.js';

const DAYS = Number(process.env.READINESS_DAYS) > 0 ? Math.min(Number(process.env.READINESS_DAYS), 90) : 60;
const shift = (day, days) => new Date(Date.parse(day + 'T12:00:00Z') + days * 864e5).toISOString().slice(0, 10);

// A D1 binding over the Cloudflare API that only reads.
export function readOnlyD1(query) {
  const reads = sql => /^\s*(SELECT|WITH)\b/i.test(sql);
  const statement = (sql, params = []) => ({
    sql, params,
    bind: (...values) => statement(sql, values),
    async all() { return reads(sql) ? { results: await query(sql, params), success: true } : { results: [], success: true }; },
    async first(column) { const row = (await this.all()).results[0] ?? null; return column && row ? row[column] ?? null : row; },
    async raw() { return (await this.all()).results.map(r => Object.values(r)); },
    async run() { return { success: true, results: reads(sql) ? await query(sql, params) : [], meta: { changes: 0 } }; }
  });
  return { prepare: sql => statement(sql), batch: list => Promise.all(list.map(s => s.all())), exec: async () => ({ count: 0 }) };
}

// What makes a day yellow (audit finding 5.4). The run of 2026-11-06 showed
// that no HRV rule changes much: a 3- or 7-morning average adds yellow days,
// a ±0.5 SD band under the normal takes 60 % to 58 %, and even an HRV that
// never costs anything leaves 58 %. So each day is scored again from its
// parts (HRV 50 %, resting heart rate 25 %, sleep 25 %, recovery-model.js)
// with one part changed:
// - band: a part under its normal (component score under 70) gets 10 points
//   back up to 70, half an SD for HRV and resting heart rate (smallest
//   worthwhile change, Plews 2012) and 5 % of the sleep need for sleep;
// - free: a part under its normal costs nothing (a bound, not a candidate);
// - debt: the week's sleep debt in the night's need capped at this many
//   minutes (today up to 60, sleepNeedFor). The run of 2026-11-06 18:39 found
//   sleep the main cause (69 of 123 yellow days); the critic asked for the
//   need with the debt capped at 30 and without it before any band on sleep.
const band = s => (s < 70 ? Math.min(70, s + 10) : s), free = s => Math.max(70, s);
export const RULES = {
  now: {}, hrvBand: { hrv: band }, hrvRhrBand: { hrv: band, restingHR: band }, allBand: { hrv: band, restingHR: band, sleep: band },
  hrvFree: { hrv: free }, rhrFree: { restingHR: free }, sleepFree: { sleep: free }, allFree: { hrv: free, restingHR: free, sleep: free },
  debt30: { debt: 30 }, debt0: { debt: 0 }, debt30HrvRhrBand: { debt: 30, hrv: band, restingHR: band }, debt0HrvRhrBand: { debt: 0, hrv: band, restingHR: band }
};

// The sleep part again with the debt in the need capped at `cap` minutes, as
// sleepNeedFor and recoveryReadiness count it (`goal` the athlete's own sleep goal).
export function sleepScoreWithDebt(sleep, need, cap, goal) {
  if (!sleep || !need) return sleep?.score;
  const raw = need.base + need.hrv + Math.min(need.debt, cap);
  const minutes = goal != null ? Math.max(360, Math.min(600, raw) - need.naps) : Math.max(420, Math.min(540, raw) - need.naps);
  const performance = Math.min(105, sleep.minutes / minutes * 100);
  return Math.round(Math.max(0, Math.min(100, 70 + 2 * (performance - 90))));
}
const WEIGHTS = { hrv: 0.5, restingHR: 0.25, sleep: 0.25 };

// The score of a readiness (readinessFor's) again with its parts changed by
// `rule`: the weighted parts, less the breathing and temperature points, the
// short night's cap at 66 (readiness.js withoutNight). Null without a score.
export function rescore(r, rule = {}, goal = null) {
  if (r?.score == null) return null;
  const c = { ...(r.components || {}) }, used = Object.keys(WEIGHTS).filter(k => c[k]);
  const sum = used.reduce((t, k) => t + WEIGHTS[k], 0);
  if (rule.debt != null && c.sleep) c.sleep = { ...c.sleep, score: sleepScoreWithDebt(c.sleep, r.need, rule.debt, goal) };
  let score = used.reduce((t, k) => t + WEIGHTS[k] * (rule[k] ? rule[k](c[k].score) : c[k].score), 0) / sum;
  const skin = c.skinTemp?.elevated ? 10 : 0;
  score -= (c.respiration?.elevated ? 10 : 0) + skin + Math.abs(c.wristTemp?.points || 0);
  score = Math.round(Math.max(0, Math.min(100, score)));
  return (r.flags || []).includes('short_night') ? Math.min(score, 66) : score;
}
const zoneOf = score => (score == null ? null : score >= 67 ? 'green' : score >= 34 ? 'yellow' : 'red');

// Why today's rule made a day yellow: the short night's cap, the breathing or
// temperature points, or else the part furthest under its normal (weighted).
export function yellowCause(r) {
  const c = r.components || {};
  if ((r.flags || []).includes('short_night') && rescore({ ...r, flags: [] }) >= 67) return 'shortNight';
  if (rescore({ ...r, flags: [], components: { ...c, respiration: null, skinTemp: null, wristTemp: null } }) >= 67) return 'breathingOrTemp';
  let worst = 'none', most = 0;
  for (const k of Object.keys(WEIGHTS)) if (c[k] && WEIGHTS[k] * (70 - c[k].score) > most) { most = WEIGHTS[k] * (70 - c[k].score); worst = k; }
  return worst;
}

const ZONES = () => ({ days: 0, green: 0, yellow: 0, red: 0, none: 0, dropGreen: 0 });
const CAUSES = () => ({ hrv: 0, restingHR: 0, sleep: 0, shortNight: 0, breathingOrTemp: 0, none: 0, noSleep: 0, near: 0, mismatch: 0 });

// The zone counts of one account's days under each rule (RULES), days without
// a number counted as none; `dropGreen`: days with the morning's HRV over 1.5
// SD under its normal that a rule shows green while today's rule did not.
// `causes` counts today's yellow days by yellowCause, with `noSleep` (no
// night scored), `near` (64–66, three points from green) and `mismatch` (the
// rescored day differs from readinessFor's, a check on rescore).
export async function accountZones(env, days = DAYS) {
  const today = localToday(), from = shift(today, -days);
  const health = await googleDashboard(env.DB, today);
  const sleep = await legacyHealthApi.fetch(new Request(`https://internal/health/sleep?start=${shift(from, -1)}&end=${shift(today, 1)}`), env).then(r => r.json()).catch(() => ({}));
  const profile = await loadEffectiveProfile(env.DB, env.USER_ID).catch(() => null);
  const locks = await readinessLocks(env.DB, from).catch(() => ({}));
  const out = Object.fromEntries(Object.keys(RULES).map(k => [k, ZONES()]));
  out.causes = CAUSES();
  const goal = sleepSettings(profile || {}).goal;
  for (let d = from; d < today; d = shift(d, 1)) {
    const r = readinessFor({ date: d, google: health.wellness || [], sessions: sleep.sessions || [], profile: { ...(profile || {}), readinessLocks: locks } });
    if (r.zone && (rescore(r) !== r.score || rescore(r, { debt: 60 }, goal) !== r.score)) out.causes.mismatch++;
    for (const [name, rule] of Object.entries(RULES)) {
      const zone = name === 'now' ? r.zone : zoneOf(rescore(r, rule, goal)), c = out[name];
      c.days++;
      if (!zone) { c.none++; continue; }
      c[zone]++;
      if (zone === 'green' && r.zone !== 'green' && r.components?.hrv?.z <= -1.5) c.dropGreen++;
    }
    if (r.zone !== 'yellow') continue;
    out.causes[yellowCause(r)]++;
    if (!r.components?.sleep) out.causes.noSleep++;
    if (r.score >= 64) out.causes.near++;
  }
  return out;
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  if (!/^[a-f0-9]{32}$/i.test(accountId || '') || !token) throw new Error('Cloudflare credentials are missing');
  const api = async (path, body) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database${path}`, body ? { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) } : { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Cloudflare API: HTTP ' + response.status);
    return data.result;
  };
  const all = await api('?per_page=100');
  // The test server's run never reads with a token that sees the live databases.
  const live = process.env.READINESS_TARGET === 'production', prefix = live ? 'health-data' : 'health-data-staging';
  if (!live && all.some(d => d.name === 'health-data' || d.name?.startsWith('health-data-users-'))) throw new Error('This token sees the live databases; run it only in the GitHub environment staging');
  const byName = Object.fromEntries(all.map(d => [d.name, d.uuid]));
  const binding = id => {
    const db = readOnlyD1(async (sql, params) => (await api('/' + id + '/query', { sql, params }))[0].results || []);
    return db;
  };
  const core = byName[prefix];
  if (!core) throw new Error('The central database is missing');
  const coreDb = binding(core), shards = {};
  const users = await coreDb.prepare(`SELECT u.id, r.shard_key, s.binding_name, z.time_zone FROM users u
    JOIN user_consents k ON k.user_id=u.id AND k.kind='health' AND k.withdrawn_at IS NULL
    LEFT JOIN user_data_routes r ON r.user_id=u.id LEFT JOIN user_data_shards s ON s.shard_key=r.shard_key
    LEFT JOIN user_time_zone z ON z.user_id=u.id
    WHERE u.disabled=0 GROUP BY u.id ORDER BY u.id`).all().then(r => r.results);
  // Why an account has no row: no data database, an error, or no day with a number.
  const rows = [], skipped = { noDatabase: 0, noNumber: 0, failed: 0 }, errors = new Set();
  for (const user of users) {
    const name = /^USER_DATA_(\d{3})$/.exec(user.binding_name || '')?.[1];
    const id = name ? byName[prefix + '-users-' + name] : user.shard_key === 'legacy' || !user.shard_key ? core : null;
    if (!id) { skipped.noDatabase++; continue; }
    shards[id] ||= binding(id);
    const env = userEnv({ DB: coreDb, USER_DATA_DB: shards[id] }, { id: user.id, email: '', role: 'user' });
    const zones = await withTimeZone(validTimeZone(user.time_zone), () => accountZones(env)).catch(error => ({ error: error.message }));
    if (zones.error) { skipped.failed++; errors.add(zones.error.slice(0, 160)); continue; }
    if (zones.now.days === zones.now.none) { skipped.noNumber++; continue; }
    rows.push(zones);
  }
  const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '–';
  const sum = name => rows.reduce((t, r) => { for (const k of Object.keys(t)) t[k] += r[name][k]; return t; }, ZONES());
  const total = sum('now');
  const line = (label, r) => { const scored = r.green + r.yellow + r.red; return `| ${label} | ${scored} | ${r.green} | ${r.yellow} (${pct(r.yellow, scored)}) | ${r.red} |`; };
  // Each rule on the same days: all accounts, and the yellow share per account.
  const rule = name => { const t = sum(name), scored = t.green + t.yellow + t.red;
    const each = rows.map(r => pct(r[name].yellow, r[name].green + r[name].yellow + r[name].red)).join(', ');
    return `| ${name} | ${t.green} (${pct(t.green, scored)}) | ${t.yellow} (${pct(t.yellow, scored)}) | ${t.red} (${pct(t.red, scored)}) | ${each} | ${t.dropGreen} |`; };
  const causes = rows.reduce((t, r) => { for (const k of Object.keys(t)) t[k] += r.causes[k]; return t; }, CAUSES());
  const text = [`## Readiness zones on the ${live ? 'live' : 'test'} server, last ${DAYS} days`, '',
    `${users.length} accounts with health consent; ${rows.length} with a readiness. Left out: ${skipped.noNumber} without any day with a number, ${skipped.noDatabase} without a data database, ${skipped.failed} failed${errors.size ? ' (' + [...errors].join('; ') + ')' : ''}. Days without a number are left out. The morning check-in is not counted.`, '',
    '| Account | Days with a number | Green | Yellow | Red |', '|---|---|---|---|---|',
    ...rows.map((r, i) => line(String(i + 1), r.now)), line('**All**', total), '',
    '### Why the yellow days are yellow (finding 5.4)', '',
    `Of ${total.yellow} yellow days: ${causes.hrv} mostly HRV, ${causes.restingHR} mostly resting heart rate, ${causes.sleep} mostly sleep, ${causes.shortNight} a short night's cap, ${causes.breathingOrTemp} breathing or temperature points, ${causes.none} no part under its normal. ${causes.noSleep} without a scored night; ${causes.near} at 64–66 (three points from green). Rescore check: ${causes.mismatch} days differ.`, '',
    '### Rules on the same days', '',
    'band = a part under its normal gets 10 points back up to normal (0.5 SD for HRV and resting heart rate, 5 % of the sleep need); free = a part under its normal costs nothing (a bound); debtN = the sleep debt of the week in the need of the night capped at N minutes (today 60). Last column: days with the morning\'s HRV over 1.5 SD under normal that the rule shows green while today\'s rule did not.', '',
    '| Rule | Green | Yellow | Red | Yellow per account | Big HRV drop shown green |', '|---|---|---|---|---|---|',
    ...Object.keys(RULES).map(rule), ''].join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error.message); process.exitCode = 1; });
