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

// The zone counts of one account's days, newest day first left out when it has no number yet.
export async function accountZones(env, days = DAYS) {
  const today = localToday(), from = shift(today, -days);
  const health = await googleDashboard(env.DB, today);
  const sleep = await legacyHealthApi.fetch(new Request(`https://internal/health/sleep?start=${shift(from, -1)}&end=${shift(today, 1)}`), env).then(r => r.json()).catch(() => ({}));
  const profile = await loadEffectiveProfile(env.DB, env.USER_ID).catch(() => null);
  const locks = await readinessLocks(env.DB, from).catch(() => ({}));
  const out = { days: 0, green: 0, yellow: 0, red: 0, none: 0, yellowHrvLow: 0 };
  for (let d = from; d < today; d = shift(d, 1)) {
    const r = readinessFor({ date: d, google: health.wellness || [], sessions: sleep.sessions || [], profile: { ...(profile || {}), readinessLocks: locks } });
    out.days++;
    if (!r.zone) { out.none++; continue; }
    out[r.zone]++;
    const hrv = r.components?.hrv;
    if (r.zone === 'yellow' && hrv?.value != null && hrv?.baseline != null && hrv.value < hrv.baseline) out.yellowHrvLow++;
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
    if (zones.days === zones.none) { skipped.noNumber++; continue; }
    rows.push(zones);
  }
  const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '–';
  const total = rows.reduce((t, r) => { for (const k of Object.keys(t)) t[k] += r[k]; return t; }, { days: 0, green: 0, yellow: 0, red: 0, none: 0, yellowHrvLow: 0 });
  const line = (label, r) => { const scored = r.green + r.yellow + r.red; return `| ${label} | ${scored} | ${r.green} | ${r.yellow} (${pct(r.yellow, scored)}) | ${r.red} | ${r.yellowHrvLow} |`; };
  const text = [`## Readiness zones on the ${live ? 'live' : 'test'} server, last ${DAYS} days`, '',
    `${users.length} accounts with health consent; ${rows.length} with a readiness. Left out: ${skipped.noNumber} without any day with a number, ${skipped.noDatabase} without a data database, ${skipped.failed} failed${errors.size ? ' (' + [...errors].join('; ') + ')' : ''}. Days without a number are left out.`, '',
    '| Account | Days with a number | Green | Yellow | Red | Yellow with HRV under normal |', '|---|---|---|---|---|---|',
    ...rows.map((r, i) => line(String(i + 1), r)), line('**All**', total), ''].join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(error.message); process.exitCode = 1; });
