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
// user id or by the passkey's id.
const allowed = [/FROM users u JOIN connection_credentials c ON c\.user_id = u\.id/, /FROM connection_credentials WHERE encrypted NOT LIKE 'v2\.%'/, /FROM user_identities i JOIN users u ON u\.id = i\.user_id WHERE i\.provider = 'apple' AND i\.subject = \?/, /^"SELECT user_id FROM user_identities WHERE provider = 'apple' AND subject = \?"$/,
  /^"SELECT id, user_id, user_handle, public_key, alg, sign_count FROM user_passkeys WHERE id = \?"$/];

test("personal tables are known", () => {
  for (const name of ["health_datapoints", "food_logs", "dashboard_profile", "connection_credentials"]) assert.ok(personal.includes(name), name);
});

test("queries on personal tables filter by user_id", () => {
  const offenders = [];
  for (const file of readdirSync(new URL("../src/", import.meta.url)).filter(f => f.endsWith(".js") && f !== "dashboard-client.js")) {
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
