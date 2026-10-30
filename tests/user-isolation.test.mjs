import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// Every query on a personal table filters by the signed-in user. The scoped
// database (tenancy.js) only checks that user_id is mentioned; this test
// checks that SELECT, UPDATE and DELETE actually filter on it.
const tenancy = readFileSync(new URL("../src/tenancy.js", import.meta.url), "utf8");
const personal = Object.keys(Object.fromEntries([...tenancy.match(/PERSONAL_TABLES = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s{2}([a-z_]+):/gm)].map(m => [m[1], 1])));
const table = new RegExp(`\\b(${personal.join("|")})\\b`, "i");

// Intentionally cross-user: listing users with connections for cron jobs,
// the cron job that re-encrypts everyone's connection keys with CONNECTION_KEY,
// and signing in with Apple or a passkey, which finds the account by Apple's
// user id or by the passkey's id. A phone's push token moves to the account
// that registers it (push.js), leaving every other account. A shared workout
// link is read by its id by whoever opens it (workout-templates.js); it holds
// only the workout and the sender's first name. A webhook finds its user by the
// account at the service it names, and reads that id from the keys of
// connections saved before connection_accounts (connection-secrets.js).
const allowed = [/FROM workout_shares WHERE id=\?"$/, /^"DELETE FROM push_tokens WHERE token=\? AND user_id<>\?"$/,/FROM users u JOIN connection_credentials c ON c\.user_id = u\.id/, /FROM connection_credentials WHERE encrypted NOT LIKE 'v2\.%'/, /FROM user_identities i JOIN users u ON u\.id = i\.user_id WHERE i\.provider = 'apple' AND i\.subject = \?/, /^"SELECT user_id FROM user_identities WHERE provider = 'apple' AND subject = \?"$/,
  /^"SELECT id, user_id, user_handle, public_key, alg, sign_count FROM user_passkeys WHERE id = \?"$/,
  /FROM connection_accounts a JOIN users u ON u\.id = a\.user_id WHERE a\.provider = \? AND a\.external_id = \? ORDER BY u\.id"$/,
  /^'SELECT c\.user_id,c\.encrypted FROM connection_credentials c WHERE c\.provider=\? AND NOT EXISTS \(SELECT 1 FROM connection_accounts a WHERE a\.user_id=c\.user_id AND a\.provider=\?\)'$/,
  // The cron run finds who has a phone to notify, as it finds who connected a service (tenancy.js).
  /FROM users u WHERE u\.disabled = 0 AND EXISTS \(SELECT 1 FROM push_tokens t WHERE t\.user_id = u\.id\) ORDER BY u\.id"$/,
  // The owner's morning report sums AI cost over all accounts (ops-report.js).
  /^"SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_usage'"$/, /FROM ai_usage a LEFT JOIN users u ON u\.id = a\.user_id/,
  // ... and counts accounts, subscriptions and AI against what Pro brings in (accountStats).
  /FROM ai_usage WHERE day >= \? AND day <= \? AND model NOT IN \('pending', 'carried-over'\) GROUP BY user_id/, /FROM ai_usage a JOIN users u ON u\.id = a\.user_id WHERE a\.day >= \?/,
  /FROM subscriptions WHERE plan = 'ai'/,
  // The owner lists and decides every user's food corrections (food-suggestions.js);
  // the route refuses anyone else.
  /FROM food_suggestions s WHERE s\.status=\?/, /^"SELECT status, COUNT\(\*\) AS n FROM food_suggestions WHERE kind=\? GROUP BY status"$/,
  /^"SELECT kind, COUNT\(\*\) AS n FROM food_suggestions WHERE status='pending' GROUP BY kind"$/,
  /^"SELECT id,user_id,after_json,status,kind,ref FROM food_suggestions WHERE id=\?"$/,
  // The owner's approval: who reported the same food, for the push (push.js sendFoodApproved).
  /^"SELECT DISTINCT user_id FROM food_suggestions WHERE kind='report' AND status='pending' AND ref=\? AND id<>\?"$/, /^"UPDATE food_suggestions SET status=\?, after_json=\?, decided_at=CURRENT_TIMESTAMP WHERE id=\? AND status='pending'"$/,
  // Fixing a reported food settles every user's report of it.
  /^"UPDATE food_suggestions SET status='approved', decided_at=CURRENT_TIMESTAMP WHERE kind='report' AND status='pending' AND ref=\?"$/];

test("personal tables are known", () => {
  for (const name of ["health_datapoints", "food_logs", "dashboard_profile", "connection_credentials"]) assert.ok(personal.includes(name), name);
});

test("queries on personal tables filter by user_id", () => {
  const offenders = [];
  for (const file of readdirSync(new URL("../src/", import.meta.url)).filter(f => f.endsWith(".js"))) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    for (const m of source.matchAll(/`[^`]*`|"[^"\n]*"|'[^'\n]*'/g)) {
      const sql = m[0];
      if (!/\b(SELECT|UPDATE|DELETE)\b/i.test(sql) || !table.test(sql)) continue;
      // An upsert's DO UPDATE clause belongs to its INSERT.
      if (/^\W*INSERT\b/i.test(sql.slice(1)) || /ON CONFLICT/i.test(sql)) continue;
      if (/user_id\s*(=|IN)\s*\?/i.test(sql) || allowed.some(a => a.test(sql))) continue;
      offenders.push(`${file}:${source.slice(0, m.index).split("\n").length}: ${sql.replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, []);
});
