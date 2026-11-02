// Pausing health data (Settings → Privacy and data): the user takes back the
// consent to health data (GDPR art. 7(3), art. 9) without deleting the account.
// Aurin stops reading, syncing and sending health data (the request gate in
// entrypoint.js, and the background jobs, which run only for consenting users;
// tenancy.js usersWithProviders) and deletes what it keeps (art. 17). The
// account, sign-in, Pro, the connections (paused, not revoked) and the settings
// stay. Turning it back on is a new consent (consent.js), after which the app
// and the services bring the history in again.
import { L } from './lang.js';
import { PERSONAL_TABLES } from './tenancy.js';
import { purgeUserData } from './account-data.js';
import { CONSENT_VERSION } from './consent.js';

// What is not health data and stays: the account and sign-in, Pro and the AI
// allowance (pausing does not start the limits over), the connections and their
// settings, the app's settings, and what the user made that says nothing about
// their body (own foods and recipes, own workouts, liked exercises).
export const KEPT_TABLES = new Set([
  'user_consents', 'user_identities', 'user_passkeys', 'user_language', 'user_time_zone',
  'connection_credentials', 'connection_accounts', 'subscriptions', 'push_tokens', 'profile_photos',
  'app_settings', 'user_setup', 'ai_usage', 'coach_messages', 'coach_carryover',
  'recipe_contributions', 'food_contributions', 'food_reports', 'food_suggestions', 'support_reports',
  'api_cache_versions', 'sync_preferences', 'week_plan_preferences', 'journal_settings',
  'exercise_preferences', 'pinned_exercises', 'exercise_videos', 'personal_recipes', 'personal_foods',
  'saved_workouts', 'workout_shares',
  // Cleaned below instead: the profile keeps its settings, sync_status the
  // switches of what is read (source-reading.js) and the Apple Health connection.
  'dashboard_profile', 'sync_status'
]);
export const PAUSE_DELETE_ORDER = Object.keys(PERSONAL_TABLES).filter(table => !KEPT_TABLES.has(table));

// A sync that was running when the data was deleted may still write a little;
// the last pass after this long removes it (finishHealthPauses).
export const LAST_PASS_MINUTES = 15;
const REQUEST_BUDGET_MS = 15 * 1000;
const CRON_BUDGET_MS = 15 * 1000;
const sqlTime = date => date.toISOString().slice(0, 19).replace('T', ' ');
const missingTable = error => /no such table|no such column/i.test(String(error?.message || error));
const errorText = error => String(error?.message ?? error ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);

// Central database (consents and the pause entry live there).
const central = env => env.RAW_DB || env.DB;

export async function healthPaused(db, userId) {
  try {
    return Boolean(await db.prepare("SELECT 1 AS paused FROM user_consents WHERE user_id = ? AND kind = 'health' AND withdrawn_at IS NOT NULL").bind(Number(userId)).first());
  } catch (error) {
    if (missingTable(error)) return false;
    throw error;
  }
}

// The settings-like parts that hold health data, cleaned in place.
async function cleanSettings(db, userId) {
  const id = Number(userId);
  const steps = [
    // Row 2 is worked out from the data (profile-suggestions.js).
    db.prepare('DELETE FROM dashboard_profile WHERE user_id = ? AND id = 2').bind(id),
    // Body measurements in the profile (row 1, energy-profile.js); the rest of
    // it is settings (goals, meals, diet, sleep goal).
    db.prepare("UPDATE dashboard_profile SET profile_json = json_remove(profile_json, '$.height', '$.hrmax', '$.rhr', '$.targetWeight') WHERE user_id = ? AND id = 1 AND json_valid(profile_json)").bind(id),
    db.prepare("DELETE FROM sync_status WHERE user_id = ? AND sync_name NOT IN ('read_off', 'apple_health')").bind(id),
    // The journal's own consents (sensitive items for the coach, sexual activity
    // from Apple Health; journal-store.js) go with the health consent.
    db.prepare("UPDATE journal_settings SET findings_json = NULL, settings_json = json_set(settings_json, '$.shareSensitive', json('false'), '$.sensitiveAt', NULL, '$.appleSex', json('false'), '$.appleSexAt', NULL) WHERE user_id = ? AND json_valid(settings_json)").bind(id),
    // So does sending health data to Intervals.icu (sync-destinations.js): off until turned on again.
    db.prepare("UPDATE sync_preferences SET health_json = '[]' WHERE user_id = ? AND destination = 'intervals'").bind(id)
  ];
  for (const step of steps) await step.run().catch(error => { if (!missingTable(error)) throw error; });
}

async function deleteHealthData(db, userId, { deadline, chunkRows, maxChunks }) {
  await cleanSettings(db, userId);
  return purgeUserData(db, userId, { deadline, chunkRows, maxChunks, tables: PAUSE_DELETE_ORDER });
}

// Only one deletion of an account runs at a time, and never while health data
// is being turned on again: whoever deletes (the pause, the cron, the resume)
// holds busy_until on the pause entry. A deletion takes at most its 15 s budget,
// so the lease outlasts it; a crashed holder frees it when it runs out.
const LEASE_SECONDS = 60;
const later = (now, seconds) => sqlTime(new Date(now.getTime() + seconds * 1000));
async function claim(db, userId, now) {
  const result = await db.prepare('UPDATE health_pauses SET busy_until = ? WHERE user_id = ? AND (busy_until IS NULL OR busy_until <= ?)').bind(later(now, LEASE_SECONDS), Number(userId), sqlTime(now)).run();
  return (result?.meta?.changes || 0) > 0;
}
// Freed for the cron: the rest at once (an unfinished deletion), or the last
// pass later (a finished one).
function release(db, userId, retryAfter) {
  return db.prepare('UPDATE health_pauses SET busy_until = NULL, retry_after = ? WHERE user_id = ?').bind(retryAfter, Number(userId)).run();
}
const dropEntry = (db, userId) => db.prepare('DELETE FROM health_pauses WHERE user_id = ?').bind(Number(userId)).run();

// Withdraws the health consent (and the AI consent, which rests on it), notes the
// pause and deletes the health data. What the request has no time for goes on in
// the next cron minute; the last pass follows LAST_PASS_MINUTES later.
export async function pauseHealthData(env, user, { budgetMs = REQUEST_BUDGET_MS, chunkRows, now = new Date() } = {}) {
  if (!user?.id || Number(user.id) !== Number(env.USER_ID)) throw new Error(L('Účet se nepodařilo ověřit.', "The account couldn't be verified."));
  if (user.isOwner) throw new Error(L('Účet správce nemůže zdravotní data pozastavit: na nich běží aplikace.', "The admin account can't pause health data: the app runs on it."));
  const db = central(env), at = now.toISOString();
  const withdraw = kind => db.prepare('INSERT INTO user_consents (user_id, kind, version, granted_at, withdrawn_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, kind) DO UPDATE SET withdrawn_at = excluded.withdrawn_at').bind(env.USER_ID, kind, CONSENT_VERSION, at, at);
  await db.batch([
    withdraw('health'),
    withdraw('ai'),
    db.prepare('INSERT INTO health_pauses (user_id, retry_after, busy_until) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET requested_at = CURRENT_TIMESTAMP, retry_after = excluded.retry_after, busy_until = excluded.busy_until, attempts = 0, last_error = NULL').bind(env.USER_ID, sqlTime(now), later(now, LEASE_SECONDS))
  ]);
  let purge = { done: false, deleted: {} };
  try {
    purge = await deleteHealthData(env.DB, env.USER_ID, { deadline: Date.now() + budgetMs, chunkRows });
  } catch (error) {
    console.error('Health data deletion continues in the cron', error.message);
  }
  await release(db, env.USER_ID, purge.done ? later(now, LAST_PASS_MINUTES * 60) : sqlTime(now));
  return { status: 'ok', deleted: purge.deleted, pending: !purge.done };
}

// Turning paused health data back on (the consent route): holds the entry, runs
// the rest of the deletion and the last pass, so nothing deleted later takes newly
// imported data with it. {blocked: message} while a deletion still runs; then
// the route saves the consent and calls resumeDone, or resumeFailed when the
// consent was not saved (the entry and its last pass stay).
export async function resumeHealth(env, { budgetMs = REQUEST_BUDGET_MS, now = new Date() } = {}) {
  const db = central(env);
  const busy = { blocked: L('Zdravotní data se ještě mažou. Zkus to za minutu.', 'Your health data is still being deleted. Try again in a minute.') };
  let entry;
  try { entry = await db.prepare('SELECT user_id FROM health_pauses WHERE user_id = ?').bind(env.USER_ID).first(); }
  catch (error) { if (missingTable(error)) return { held: false }; throw error; }
  if (!entry) return { held: false };
  if (!(await claim(db, env.USER_ID, now))) return busy;
  const purge = await deleteHealthData(env.DB, env.USER_ID, { deadline: Date.now() + budgetMs }).catch(error => { console.error('Health data deletion before resuming failed', error.message); return { done: false }; });
  if (!purge.done) { await release(db, env.USER_ID, sqlTime(now)); return busy; }
  return { held: true };
}
export const resumeDone = env => dropEntry(central(env), env.USER_ID);
export const resumeFailed = (env, now = new Date()) => release(central(env), env.USER_ID, sqlTime(now));

// Every minute: the rest of the deletion of paused accounts and their last
// pass. One account per run, its chunks within one budget, so with the account
// deletions and the rest of the cron the run stays well under D1's 1000 queries
// per invocation (each table costs a query besides its chunks). An entry whose
// consent was given again is dropped (the resume ran the pass). A failing one
// waits longer each time.
const RETRY_MINUTES = attempts => Math.min(5 * 2 ** Math.max(0, attempts - 1), 6 * 60);
const CRON_CHUNKS = 100;
export async function finishHealthPauses(db, { databaseForUser = null, budgetMs = CRON_BUDGET_MS, chunkRows, maxChunks = CRON_CHUNKS, now = () => new Date() } = {}) {
  const at = now();
  let next;
  try { next = await db.prepare('SELECT user_id, attempts FROM health_pauses WHERE retry_after <= ? AND (busy_until IS NULL OR busy_until <= ?) ORDER BY retry_after, user_id LIMIT 1').bind(sqlTime(at), sqlTime(at)).first(); }
  catch (error) { if (missingTable(error)) return null; throw error; }
  if (!next) return null;
  const userId = Number(next.user_id);
  if (!(await claim(db, userId, at))) return null;
  try {
    if (!(await healthPaused(db, userId))) {
      await dropEntry(db, userId);
      return [{ userId, done: true, skipped: 'consent given again' }];
    }
    const data = databaseForUser ? await databaseForUser(userId) : db;
    const purge = await deleteHealthData(data, userId, { deadline: Date.now() + budgetMs, chunkRows, maxChunks });
    if (purge.done) await dropEntry(db, userId);
    else await release(db, userId, sqlTime(at));
    return [{ userId, done: purge.done }];
  } catch (error) {
    const attempts = Number(next.attempts || 0) + 1;
    console.error('Health data deletion failed', userId, `attempt ${attempts}`, errorText(error));
    await db.prepare('UPDATE health_pauses SET attempts = ?, last_error = ?, retry_after = ?, busy_until = NULL WHERE user_id = ?').bind(attempts, errorText(error), sqlTime(new Date(at.getTime() + RETRY_MINUTES(attempts) * 60000)), userId).run();
    return [{ userId, done: false, failed: errorText(error) }];
  }
}

// While paused, the app reaches only what is not health data: the account,
// sign-in, consent, Pro, the export, the app's settings and the push token.
// Disconnecting a service works (its keys go), connecting one is refused.
// Everything else answers health_paused.
const OPEN_WHILE_PAUSED = [
  /^\/app\/api\/me(\/apple)?$/, /^\/app\/api\/consent$/, /^\/app\/api\/account\//, /^\/app\/api\/passkeys(\/|$)/,
  /^\/app\/api\/subscription(\/|$)/, /^\/app\/api\/app-settings$/, /^\/app\/api\/profile\/photo$/,
  /^\/app\/api\/push\/token$/, /^\/app\/api\/support\/report$/, /^\/app\/api\/health-pause$/
];
const CONNECTING = /^\/(oauth\/(google|intervals|ultrahuman|whoop|wahoo)|auth\/app\/connect)(\/|$)/;
export function pausedRefusal(method, pathname) {
  if (!pathname.startsWith('/app/api/') && !CONNECTING.test(pathname)) return null;
  if (OPEN_WHILE_PAUSED.some(open => open.test(pathname))) return null;
  if (pathname === '/app/api/connections' && method === 'DELETE') return null;
  return Response.json({ status: 'health_paused', message: L('Zdravotní data máš pozastavená. Zapni je v aplikaci.', 'Your health data is paused. Turn it back on in the app.') }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
