import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLoadTest, loadTestPrincipal, loadTestEmail, LOAD_TEST_AUDIENCE } from '../src/load-test.js';
import { parseTiming, summary } from '../scripts/load-test.mjs';

const post = body => new Request('https://staging.aurin.health/automation/load-test', { method: 'POST', body: JSON.stringify(body) });

test('the load test answers only on the test server and only to its own token', async () => {
  assert.equal((await handleLoadTest(post({ prepare: 1 }), { ENVIRONMENT: 'production' }, { kind: 'load-test' })).status, 404);
  assert.equal((await handleLoadTest(post({ prepare: 1 }), { ENVIRONMENT: 'staging' }, { kind: 'coach-eval' })).status, 401);
  assert.equal((await handleLoadTest(post({ prepare: 1 }), { ENVIRONMENT: 'staging' }, null)).status, 401);
  assert.equal(await loadTestPrincipal(post({}), { ENVIRONMENT: 'production' }, async () => ({})), null);
  let options = null;
  assert.deepEqual(await loadTestPrincipal(post({}), { ENVIRONMENT: 'staging' }, async (request, f, o) => { options = o; }), { kind: 'load-test' });
  assert.equal(options.audience, LOAD_TEST_AUDIENCE);
  assert.deepEqual([...options.workflows], ['aurinhealth/health-api/.github/workflows/load-test.yml@refs/heads/main']);
  assert.equal(await loadTestPrincipal(post({}), { ENVIRONMENT: 'staging' }, async () => { throw new Error('bad'); }), null);
});

test('load test accounts are sample accounts of the test domain', () => {
  assert.equal(loadTestEmail(7), 'sample+load07@test.aurin.health');
});

test('cleanup deletes only load test accounts, never the owner', async () => {
  const rows = [{ id: 1, email: 'sample+load01@test.aurin.health' }, { id: 2, email: 'sample+loadx@test.aurin.health' }, { id: 3, email: 'sample+load99@test.aurin.health' }];
  const db = { prepare: sql => ({ all: async () => ({ results: /LIKE 'sample\+load%@test\.aurin\.health'/.test(sql) ? rows : [] }) }) };
  const removed = [];
  const env = { ENVIRONMENT: 'staging', DB: db, OWNER_EMAIL: 'sample+load99@test.aurin.health' };
  // userDataEnvironment needs the user databases; the test replaces the whole deletion.
  const response = await handleLoadTest(post({ cleanup: true }), env, { kind: 'load-test' }, { remove: async (e, user) => removed.push(user.id), environment: async (e, user) => ({ USER_ID: user.id }) });
  assert.deepEqual(removed, [1]);
  assert.equal((await response.json()).deleted, 1);
});

test('Server-Timing and the summary', () => {
  assert.deepEqual(parseTiming('app;dur=812, db;dur=640;desc="23 queries, 1180 rows read"'), { appMs: 812, dbMs: 640, queries: 23, rows: 1180 });
  const lines = summary([{ phase: 'P', path: 'GET /a', status: 200, ms: 100, queries: 2, rows: 10, dbMs: 5 }, { phase: 'P', path: 'GET /a', status: 503, ms: 300 }]).join('\n');
  assert.match(lines, /\| GET \/a \| 2 \| 503×1 \| 300 \| 300 \| 300 \| 1 \| 5 \| 3 \|/);
});

test('prepare opens the accounts with health consent, no AI and a working session', async () => {
  const { createD1 } = await import('./helpers/d1.mjs');
  const { verifyDashboardSession } = await import('../src/dashboard-auth.js');
  const db = createD1();
  db.sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT, disabled INTEGER DEFAULT 0, session_epoch INTEGER DEFAULT 0); CREATE TABLE user_consents (user_id INTEGER, kind TEXT, version TEXT, granted_at TEXT, withdrawn_at TEXT, PRIMARY KEY (user_id, kind));");
  db.sqlite.exec("INSERT INTO users(email, role, session_epoch) VALUES ('sample+load02@test.aurin.health', 'user', 4)");
  const env = { ENVIRONMENT: 'staging', DB: db, SESSION_SECRET: 'x'.repeat(40) };
  const body = await (await handleLoadTest(post({ prepare: 3 }), env, { kind: 'load-test' })).json();
  assert.equal(body.status, 'ok');
  assert.equal(body.sessions.length, 3);
  assert.ok(body.upload.records.length > 0);
  const consents = db.sqlite.prepare("SELECT kind, withdrawn_at IS NULL AS given FROM user_consents ORDER BY user_id, kind").all().map(r => r.kind + ':' + r.given);
  assert.deepEqual(consents, ['ai:0', 'health:1', 'ai:0', 'health:1', 'ai:0', 'health:1']);
  // The account opened before gets a new epoch, so an older session of it ends.
  assert.equal(db.sqlite.prepare("SELECT session_epoch FROM users WHERE email='sample+load02@test.aurin.health'").get().session_epoch, 5);
  const session = await verifyDashboardSession(new Request('https://staging.aurin.health/', { headers: { Cookie: body.sessions[1] } }), env.SESSION_SECRET);
  assert.equal(session.uid, 1);
  assert.equal(session.epoch, 5);
});
