// Usage statistics (privacy policy "Usage statistics", Petr 2026-11-13): how
// many accounts used a part of the app each day, and how many come back after
// 1, 7 and 30 days per sign-up week. Only counts are kept: per account just the
// last counted day and which names it was already counted for that day (so one
// account adds one per name and day), overwritten daily and deleted with the
// account. Never health values, texts, devices or IP addresses.
//
// Two parts, because Czech law (§ 89(3) of Act 127/2005, ePrivacy art. 5(3))
// lets the app send something only for the statistics with consent:
// - Server counts (SERVER_NAMES): from requests the app sends anyway for the
//   service. On unless the user turns "Share usage data" off (consent kind
//   'usage' withdrawn = objection under art. 21 GDPR, legitimate interest).
// - App steps (APP_NAMES): setup steps and the subscription screen, sent by
//   the app only with the opt-in consent 'usage_events' given.

// The index is the bit in usage_users.day_mask: only add at the end, never reorder.
export const SERVER_NAMES = ['active', 'today', 'training', 'food', 'health', 'coach', 'week_plan', 'gym_generate', 'workouts_generate'];
// Neutral names only: nothing that tells about someone's body or health
// (no cycle, journal, health pause, metric or sleep pages).
export const APP_NAMES = [
  'onboarding.consent', 'onboarding.sources', 'onboarding.about', 'onboarding.sport', 'onboarding.goal',
  'onboarding.time', 'onboarding.notifications', 'onboarding.done',
  'paywall.shown', 'paywall.offer', 'paywall.trial', 'purchase.start', 'purchase.cancel'
];
const NAMES = [...SERVER_NAMES, ...APP_NAMES];
const BIT = new Map(NAMES.map((name, index) => [name, 2 ** index]));
export const MAX_EVENTS = 30;
// Counts and returns are kept this long (privacy policy).
export const KEEP_DAYS = 180;
// Counting starts with the builds that have the switch (X-Aurin-Api 2, APIClient.apiLevel):
// older apps show no notice and no switch (privacy review 2026-11-13).
export const USAGE_MIN_API = 2;

const ROUTES = new Map([
  ['GET /app/api/today', 'today'], ['GET /app/api/training', 'training'], ['GET /app/api/food-today', 'food'],
  ['GET /app/api/health', 'health'], ['POST /app/api/assistant', 'coach'], ['GET /app/api/week-plan', 'week_plan'],
  ['POST /app/api/gym/generate', 'gym_generate'], ['POST /app/api/workouts/generate', 'workouts_generate']
]);

const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);

// What this isolate already counted today, so most requests write nothing.
const seen = new Map();
function alreadySeen(userId, day, bit) {
  const key = `${userId}|${day}`;
  return ((seen.get(key) || 0) & bit) !== 0;
}
function remember(userId, day, bit) {
  if (seen.size > 5000) seen.clear();
  const key = `${userId}|${day}`;
  seen.set(key, (seen.get(key) || 0) | bit);
}
export function forgetSeen() { seen.clear(); }

// Counts one name for one account and day, once. The account's objection
// (consent 'usage' withdrawn) is checked in the same statement.
async function count(db, userId, name, day) {
  const bit = BIT.get(name);
  if (!bit || alreadySeen(userId, day, bit)) return false;
  const row = await db.prepare(`INSERT INTO usage_users (user_id, last_day, day_mask)
    SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM user_consents WHERE user_id = ?1 AND kind = 'usage' AND withdrawn_at IS NOT NULL)
    ON CONFLICT(user_id) DO UPDATE SET day_mask = CASE WHEN last_day = excluded.last_day THEN day_mask | excluded.day_mask ELSE excluded.day_mask END, last_day = excluded.last_day
    WHERE last_day <> excluded.last_day OR (day_mask & excluded.day_mask) = 0
    RETURNING user_id`).bind(userId, day, bit).first();
  remember(userId, day, bit);
  if (!row) return false;
  const statements = [db.prepare('INSERT INTO usage_counts (day, name, users) VALUES (?, ?, 1) ON CONFLICT(day, name) DO UPDATE SET users = users + 1').bind(day, name)];
  // The first count of the day is a return: on the sign-up day and 1, 7 and 30 days after, per sign-up week (Monday).
  if (name === 'active') statements.push(db.prepare(`INSERT INTO usage_retention (cohort_week, day_n, users)
    SELECT date(created_at, 'weekday 0', '-6 days'), CAST(julianday(?2) - julianday(date(created_at)) AS INTEGER), 1 FROM users
    WHERE id = ?1 AND CAST(julianday(?2) - julianday(date(created_at)) AS INTEGER) IN (0, 1, 7, 30)
    ON CONFLICT(cohort_week, day_n) DO UPDATE SET users = users + 1`).bind(userId, day));
  await db.batch(statements);
  return true;
}

// The owner and the App Review account are not counted.
const counted = user => Boolean(user?.id) && !user.isOwner && !user.isReview;

// Every signed-in request from an app with the switch: the day's activity and
// the part of the app it loads. Starts after the route's own queries (a
// timer, inside waitUntil) and never breaks the request.
export function noteRequest(db, ctx, user, method, pathname, apiLevel, now = new Date()) {
  if (!db || !counted(user) || !(Number(apiLevel) >= USAGE_MIN_API)) return;
  const day = utcDay(now);
  const names = ['active'];
  const route = ROUTES.get(`${method} ${pathname}`);
  if (route) names.push(route);
  if (names.every(name => alreadySeen(user.id, day, BIT.get(name)))) return;
  const work = new Promise(resolve => setTimeout(resolve, 0))
    .then(async () => { for (const name of names) await count(db, user.id, name, day); })
    .catch(error => { if (!/no such table/i.test(String(error?.message))) console.error('Usage count failed', error.message); });
  ctx?.waitUntil ? ctx.waitUntil(work) : work;
  return work;
}

// POST /app/api/usage {events:[...]}: the app's steps, only with the opt-in
// consent. Always the same answer, whatever was counted.
export async function recordAppEvents(db, user, body, now = new Date()) {
  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!counted(user) || !events.length) return;
  const given = await db.prepare("SELECT 1 AS ok FROM user_consents WHERE user_id = ? AND kind = 'usage_events' AND withdrawn_at IS NULL AND NOT EXISTS (SELECT 1 FROM user_consents WHERE user_id = ? AND kind = 'usage' AND withdrawn_at IS NOT NULL)").bind(user.id, user.id).first();
  if (!given) return;
  const day = utcDay(now);
  for (const name of new Set(events.filter(name => typeof name === 'string' && APP_NAMES.includes(name)))) await count(db, user.id, name, day);
}

// Turning "Share usage data" off forgets the account's day as well.
export function forgetUsageUser(db, userId) {
  return db.prepare('DELETE FROM usage_users WHERE user_id = ?').bind(userId);
}

// Nastavení → Správa (owner only): the counts of the last days and returns per sign-up week.
export async function usageReport(db, { days = 30, now = new Date() } = {}) {
  const span = Math.min(Math.max(Number(days) || 30, 1), KEEP_DAYS);
  const from = utcDay(new Date(now.getTime() - (span - 1) * 86400000));
  const [counts, retention, choices] = await Promise.all([
    db.prepare('SELECT day, name, users FROM usage_counts WHERE day >= ? ORDER BY day, name').bind(from).all(),
    db.prepare("SELECT cohort_week AS cohort, SUM(CASE WHEN day_n = 0 THEN users END) AS size, SUM(CASE WHEN day_n = 1 THEN users END) AS d1, SUM(CASE WHEN day_n = 7 THEN users END) AS d7, SUM(CASE WHEN day_n = 30 THEN users END) AS d30 FROM usage_retention GROUP BY cohort_week ORDER BY cohort_week DESC LIMIT 26").all(),
    db.prepare("SELECT SUM(CASE WHEN kind = 'usage' AND withdrawn_at IS NOT NULL THEN 1 ELSE 0 END) AS off, SUM(CASE WHEN kind = 'usage_events' AND withdrawn_at IS NULL THEN 1 ELSE 0 END) AS steps FROM user_consents WHERE kind IN ('usage', 'usage_events')").first()
  ]);
  return {
    from,
    counts: counts.results || [],
    retention: (retention.results || []).map(row => ({ cohort: row.cohort, size: row.size || 0, d1: row.d1 || 0, d7: row.d7 || 0, d30: row.d30 || 0 })),
    sharingOff: choices?.off || 0,
    appStepsOn: choices?.steps || 0
  };
}

// Daily cleanup (02:x8 UTC).
export async function forgetOldUsage(db, now = new Date()) {
  const before = utcDay(new Date(now.getTime() - KEEP_DAYS * 86400000));
  await db.batch([
    db.prepare('DELETE FROM usage_counts WHERE day < ?').bind(before),
    db.prepare('DELETE FROM usage_retention WHERE cohort_week < ?').bind(before)
  ]);
}
