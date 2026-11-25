// The load test on the test server (scripts/load-test.mjs, load-test.yml): made-up accounts
// sample+loadNN@test.aurin.health, each with the sample athlete (review-sample.js) and no AI
// consent, so the test spends no AI. Only the test server answers, and only to the workflow's
// own GitHub token (audience aurin-load-test, from main). prepare opens the accounts and gives
// back a session of LOAD_TEST_SESSION_SECONDS for each; cleanup deletes every one of them.
import { isStaging } from './staging.js';
import { verifyGitHubActionsToken } from './github-oidc.js';
import { sessionCookie, sessionSecret } from './dashboard-auth.js';
import { publicUser } from './tenancy.js';
import { userDataEnvironment } from './user-data-shards.js';
import { connectionEnvironment } from './connection-secrets.js';
import { deleteAccount } from './account-data.js';
import { sampleRecords } from './review-sample.js';
import { CONSENT_VERSION, AI_CONSENT_VERSION } from './consent.js';

export const LOAD_TEST_AUDIENCE = 'aurin-load-test';
export const LOAD_TEST_WORKFLOWS = new Set(['aurinhealth/health-api/.github/workflows/load-test.yml@refs/heads/main']);
export const LOAD_TEST_MAX_ACCOUNTS = 50;
export const LOAD_TEST_SESSION_SECONDS = 2 * 60 * 60;
// Accounts one cleanup call deletes; the script calls again while some remain.
export const LOAD_TEST_CLEANUP_BATCH = 5;
// Calls one after another; how many went through and the first refusal.
export async function probeCalls(call, n) {
  let ok = 0, error = null;
  for (let i = 0; i < n; i++) {
    try { await call(); ok++; } catch (e) { error ||= { at: i + 1, message: String(e?.message || e).slice(0, 200) }; }
  }
  return { ok, of: n, error };
}
export const loadTestEmail = n => `sample+load${String(n).padStart(2, '0')}@test.aurin.health`;
const LOAD_EMAIL = /^sample\+load\d{2}@test\.aurin\.health$/;

export async function loadTestPrincipal(request, env, verify = verifyGitHubActionsToken) {
  if (!isStaging(env)) return null;
  try { await verify(request, fetch, { audience: LOAD_TEST_AUDIENCE, workflows: LOAD_TEST_WORKFLOWS, environment: null }); return { kind: 'load-test' }; } catch { return null; }
}

export async function handleLoadTest(request, env, principal, { remove = deleteAccount, environment = async (env, user) => connectionEnvironment(await userDataEnvironment(env, user)) } = {}) {
  if (!isStaging(env)) return new Response('Not found', { status: 404 });
  if (principal?.kind !== 'load-test') return Response.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
  if (request.method !== 'POST') return Response.json({ status: 'error', message: 'Use POST.' }, { status: 405 });
  const body = await request.json().catch(() => ({})), headers = { 'Cache-Control': 'no-store' };
  if (body?.prepare) {
    const count = Math.max(1, Math.min(LOAD_TEST_MAX_ACCOUNTS, Math.round(Number(body.prepare)) || 1)), now = new Date().toISOString(), sessions = [];
    for (let n = 1; n <= count; n++) {
      const email = loadTestEmail(n);
      await env.DB.prepare("INSERT INTO users(email, name, role) VALUES(?, 'Load test', 'user') ON CONFLICT(email) DO NOTHING").bind(email).run();
      // A new epoch ends any session someone else opened on the address before (security review 2026-11-25).
      const row = await env.DB.prepare("UPDATE users SET session_epoch = session_epoch + 1 WHERE email=? AND role != 'admin' RETURNING id, session_epoch").bind(email).first();
      if (!row) continue;
      // Health consent as the app's first screen gives it; AI taken back, so no screen calls AI.
      await env.DB.batch(['health', 'ai'].map(kind => env.DB.prepare('INSERT INTO user_consents (user_id, kind, version, granted_at, withdrawn_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, kind) DO UPDATE SET withdrawn_at = excluded.withdrawn_at')
        .bind(row.id, kind, kind === 'ai' ? AI_CONSENT_VERSION : CONSENT_VERSION, now, kind === 'ai' ? now : null)));
      const cookie = await sessionCookie(row.id, Math.floor(Date.now() / 1000) + LOAD_TEST_SESSION_SECONDS, sessionSecret(env), Number(row.session_epoch) || 0);
      sessions.push(cookie.split(';')[0]);
    }
    // The upload each app open sends: the sample's last two days, as the phone sends its last days again.
    const upload = { records: sampleRecords(Date.now(), 2), categories: ['sleep', 'heart', 'hrv', 'resting', 'breathing', 'steps', 'energy', 'workouts', 'body'] };
    return Response.json({ status: 'ok', sessions, upload }, { headers });
  }
  // Cloudflare: "a single request has a maximum of 32 Worker invocations" through service
  // bindings. The cron sends each user's jobs through USER_JOBS one call per user, so this
  // measures where the calls stop: straight from one request, and two levels deep.
  if (body?.probe) {
    if (typeof env.USER_JOBS?.ping !== 'function') return Response.json({ status: 'error', message: 'No USER_JOBS binding.' }, { status: 500, headers });
    const direct = await probeCalls(() => env.USER_JOBS.ping(), 40);
    const nested = [];
    for (let i = 0; i < 3; i++) nested.push(await env.USER_JOBS.fan(30).catch(error => ({ ok: 0, error: String(error?.message || error).slice(0, 200) })));
    return Response.json({ status: 'ok', direct, nested }, { headers });
  }
  if (body?.cleanup) {
    const rows = (await env.DB.prepare("SELECT id, email, name, role FROM users WHERE email LIKE 'sample+load%@test.aurin.health'").all()).results || [];
    let deleted = 0, failed = 0;
    const accounts = rows.filter(r => LOAD_EMAIL.test(r.email) && !publicUser(r, env).isOwner);
    for (const row of accounts.slice(0, LOAD_TEST_CLEANUP_BATCH)) {
      const user = publicUser(row, env);
      try { await remove(await environment(env, user), user, { budgetMs: 5000 }); deleted++; }
      catch (error) { failed++; console.error('Load test account not deleted', row.id, error.message); }
    }
    return Response.json({ status: failed ? 'error' : 'ok', deleted, failed, remaining: accounts.length - deleted }, { headers });
  }
  return Response.json({ status: 'error', message: 'Use prepare or cleanup.' }, { status: 400, headers });
}
