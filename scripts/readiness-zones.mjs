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

// Candidate HRV rules for audit finding 5.4 (yellow from one morning's HRV),
// measured on the same days as today's rule:
// - days: the HRV of the day is the average of the last `days` mornings of
//   the same source (ln values; Plews 2012, Javaloyes 2019, Garmin's 7-day
//   HRV status);
// - band: within ±`band` SD of the normal counts as the normal, further out
//   only the part beyond it (smallest worthwhile change 0.5 SD, Plews 2012);
// - low: the rule only softens a morning under the normal; a morning over it
//   counts as today (a symmetric average or band also takes points from good
//   mornings);
// - noDrop: an HRV under the normal never costs anything, the most any HRV
//   rule could take away from the yellow days (a bound, not a candidate).
export const HRV_RULES = {
  now: {}, avg3: { days: 3 }, avg7: { days: 7 }, band: { band: 0.5 }, avg7band: { days: 7, band: 0.5 },
  avg3low: { days: 3, low: true }, avg7low: { days: 7, low: true }, bandlow: { band: 0.5, low: true },
  avg3bandlow: { days: 3, band: 0.5, low: true }, noDrop: { noDrop: true }
};

// The z of the HRV under a rule: `z` today's against the baseline, `logs` the
// ln HRV of the same source on the days before (newest first).
export function ruleZ(rule, z, mean, sd, logs) {
  if (rule.noDrop) return Math.max(0, z);
  if (rule.low && z >= 0) return z;
  let out = z;
  if (rule.days > 1) {
    const window = [mean + z * sd, ...logs.slice(0, rule.days - 1)];
    out = (window.reduce((s, v) => s + v, 0) / window.length - mean) / sd;
    if (rule.low) out = Math.max(z, out);
  }
  if (rule.band) out = Math.sign(out) * Math.max(0, Math.abs(out) - rule.band);
  return out;
}

const ZONES = () => ({ days: 0, green: 0, yellow: 0, red: 0, none: 0, yellowHrvLow: 0, yellowSleepShort: 0, dropGreen: 0 });

// The zone counts of one account's days under each rule (HRV_RULES), days
// without a number counted as none. `dropGreen`: days whose own HRV was more
// than 1.5 SD under the normal that a rule shows green while today's rule did not.
export async function accountZones(env, days = DAYS) {
  const today = localToday(), from = shift(today, -days);
  const health = await googleDashboard(env.DB, today);
  const sleep = await legacyHealthApi.fetch(new Request(`https://internal/health/sleep?start=${shift(from, -1)}&end=${shift(today, 1)}`), env).then(r => r.json()).catch(() => ({}));
  const profile = await loadEffectiveProfile(env.DB, env.USER_ID).catch(() => null);
  const locks = await readinessLocks(env.DB, from).catch(() => ({}));
  const google = health.wellness || [], sessions = sleep.sessions || [];
  const out = Object.fromEntries(Object.keys(HRV_RULES).map(k => [k, ZONES()]));
  // The HRV each morning showed (the locked one when there is a lock), by day.
  const shown = new Map();
  for (const r of google) if (Number(r?.hrv) > 0) shown.set(r.id, { log: Math.log(Number(r.hrv)), source: r.hrvSource || null });
  for (let d = from; d < today; d = shift(d, 1)) {
    const input = { date: d, google, sessions, profile: { ...(profile || {}), readinessLocks: locks } };
    const base = readinessFor(input), hrv = base.components?.hrv;
    const row = base.rows.find(r => r.id === d);
    if (row && Number(row.hrv) > 0) shown.set(d, { log: Math.log(Number(row.hrv)), source: row.hrvSource || null });
    let mean = null, sd = null, logs = [];
    if (hrv) {
      mean = Math.log(hrv.baseline); sd = Math.log(hrv.high) - mean;
      for (let back = 1; back < 7; back++) { const s = shown.get(shift(d, -back)); if (s && s.source === (row?.hrvSource || null)) logs.push(s.log); }
    }
    for (const [name, rule] of Object.entries(HRV_RULES)) {
      let r = base;
      const z = hrv ? ruleZ(rule, hrv.z, mean, sd, logs) : null;
      if (hrv && Math.abs(z - hrv.z) > 1e-9) {
        const value = Math.exp(mean + z * sd);
        const lock = locks[d]?.row && Number(locks[d].row.hrv) > 0 ? { ...locks, [d]: { ...locks[d], row: { ...locks[d].row, hrv: value } } } : locks;
        r = readinessFor({ ...input, google: google.map(w => w.id === d ? { ...w, hrv: value } : w), profile: { ...input.profile, readinessLocks: lock } });
      }
      const c = out[name];
      c.days++;
      if (!r.zone) { c.none++; continue; }
      c[r.zone]++;
      if (r.zone === 'yellow' && hrv && hrv.z < 0) c.yellowHrvLow++;
      if (r.zone === 'yellow' && r.components?.sleep?.performance < 90) c.yellowSleepShort++;
      if (r.zone === 'green' && base.zone !== 'green' && hrv && hrv.z <= -1.5) c.dropGreen++;
    }
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
  const line = (label, r) => { const scored = r.green + r.yellow + r.red; return `| ${label} | ${scored} | ${r.green} | ${r.yellow} (${pct(r.yellow, scored)}) | ${r.red} | ${r.yellowHrvLow} |`; };
  // Each candidate rule on the same days: all accounts, and the yellow share per account.
  const rule = name => { const t = sum(name), scored = t.green + t.yellow + t.red;
    const each = rows.map(r => pct(r[name].yellow, r[name].green + r[name].yellow + r[name].red)).join(', ');
    return `| ${name} | ${t.green} (${pct(t.green, scored)}) | ${t.yellow} (${pct(t.yellow, scored)}) | ${t.red} (${pct(t.red, scored)}) | ${each} | ${t.dropGreen} |`; };
  const text = [`## Readiness zones on the ${live ? 'live' : 'test'} server, last ${DAYS} days`, '',
    `${users.length} accounts with health consent; ${rows.length} with a readiness. Left out: ${skipped.noNumber} without any day with a number, ${skipped.noDatabase} without a data database, ${skipped.failed} failed${errors.size ? ' (' + [...errors].join('; ') + ')' : ''}. Days without a number are left out.`, '',
    '| Account | Days with a number | Green | Yellow | Red | Yellow with HRV under normal |', '|---|---|---|---|---|---|',
    ...rows.map((r, i) => line(String(i + 1), r.now)), line('**All**', total), '',
    '### HRV rules on the same days (finding 5.4)', '',
    'now = today\'s rule (one morning); avgN = average of the last N mornings; band = ±0.5 SD counts as normal. Last column: days with the morning\'s HRV over 1.5 SD under normal that the rule shows green while today\'s rule did not.', '',
    '| Rule | Green | Yellow | Red | Yellow per account | Big HRV drop shown green |', '|---|---|---|---|---|---|',
    ...Object.keys(HRV_RULES).map(rule), ''].join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error.message); process.exitCode = 1; });
