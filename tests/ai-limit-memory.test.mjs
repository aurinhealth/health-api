import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, signInEmailUser, signInGoogleUser } from "../src/tenancy.js";
import { signInAppleUser } from "../src/apple-login.js";
import { deleteAccount } from "../src/account-data.js";
import { limitEmail, limitKeys, forgetOn, inheritAiLimits, forgetExpiredAiLimits } from "../src/ai-limit-memory.js";
import { aiSpentToday, aiSpentThisMonth, ensureAiUsage } from "../src/ai-usage.js";
import { coachAllowance, claimCoachMessage, recordCoachMessage } from "../src/coach-allowance.js";
import { localToday } from "../src/user-time.js";
import { mondayOfDate } from "../src/dashboard-shared.js";

const SERVER = { SESSION_SECRET: "test-session-secret", OWNER_EMAIL: "owner@example.com", OPEN_SIGNUP: "true", COACH_WEEKLY_MESSAGES: "30" };
const fetchImpl = async () => new Response("", { status: 200 });

function database() {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)");
  db.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  db.sqlite.exec(readFileSync(new URL("../migrations/0011_account_deletions.sql", import.meta.url), "utf8"));
  db.sqlite.exec(readFileSync(new URL("../migrations/0021_session_epoch.sql", import.meta.url), "utf8"));
  db.sqlite.exec(readFileSync(new URL("../migrations/0026_account_deletion_retries.sql", import.meta.url), "utf8"));
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS signup_waitlist (email TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, data_type TEXT, source_family TEXT, start_time TEXT, end_time TEXT, payload_json TEXT, record_role TEXT)");
  return db;
}
const envOf = (db, id) => ({ ...SERVER, DB: scopedDb(db, id), USER_ID: id });
const limits = async env => ({ coach: (await coachAllowance(env)).used, today: await aiSpentToday(env), month: await aiSpentThisMonth(env) });

// An account that used 12 coach messages this week and some AI today and this month.
async function usedAccount(db, id, email) {
  db.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(id, email);
  const env = envOf(db, id);
  for (let chat = 1; chat <= 12; chat++) await recordCoachMessage(env, chat, await claimCoachMessage(env, chat));
  await ensureAiUsage(db);
  const today = localToday(), first = today.slice(0, 7) + "-01";
  const add = db.sqlite.prepare("INSERT INTO ai_usage (user_id, day, feature, model, cost_usd) VALUES (?, ?, ?, 'gpt-6-sol', ?)");
  add.run(id, today, "food-photo", 0.3);
  add.run(id, today, "assistant", 0.5);
  if (first !== today) add.run(id, first, "week-plan", 1.25);
  return env;
}

test("the e-mail as a person: lowercase, no +tag, Gmail without dots", () => {
  assert.equal(limitEmail(" Petr.Bouma+aurin@Gmail.com "), "petrbouma@gmail.com");
  assert.equal(limitEmail("p.e.t.r@googlemail.com"), "petr@gmail.com");
  assert.equal(limitEmail("jan.novak+x@seznam.cz"), "jan.novak@seznam.cz", "dots only matter at Gmail");
  assert.equal(limitEmail("nobody"), null);
  assert.equal(limitEmail("+tag@example.com"), null);
});

test("keys are keyed hashes, the same for every spelling of one address, and none without the secret", async () => {
  const [a] = await limitKeys(SERVER, { email: "a.b+1@gmail.com" });
  const [b] = await limitKeys(SERVER, { email: "AB@googlemail.com" });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual((await limitKeys({ SESSION_SECRET: "other" }, { email: "ab@gmail.com" }))[0], a);
  assert.deepEqual(await limitKeys({}, { email: "ab@gmail.com" }), []);
  assert.equal((await limitKeys(SERVER, { email: "ab@gmail.com", appleSub: "001.abc", googleSub: "123" })).length, 3);
});

test("a record lasts until both its week and its month are over", () => {
  assert.equal(forgetOn("2026-10-22"), "2026-11-01");
  assert.equal(forgetOn("2026-10-30"), "2026-11-02", "the week of 26 October ends after the month");
  assert.equal(forgetOn("2026-12-31"), "2027-01-04");
});

test("deleting the account and signing up again with an alias keeps this week's messages and the month's AI", async () => {
  const db = database();
  const env = await usedAccount(db, 3, "Petr.Bouma@gmail.com");
  const before = await limits(env);
  assert.equal(before.coach, 12);

  await deleteAccount(env, { id: 3, email: "Petr.Bouma@gmail.com", isOwner: false }, { fetchImpl });
  const stored = db.sqlite.prepare("SELECT * FROM ai_limit_memory").all();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].coach_used, 12);
  assert.doesNotMatch(JSON.stringify(stored), /petr|bouma|gmail/i, "only a keyed hash of the address is kept");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = 3").get().n, 0, "the account's own rows are gone");

  const user = await signInEmailUser(db, SERVER, "petrbouma+new@googlemail.com");
  assert.equal(user.created, true);
  const again = envOf(db, user.id);
  assert.deepEqual(await limits(again), before);
  assert.equal((await coachAllowance(again)).left, 18);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_limit_memory").get().n, 1, "the record stays until its week and month are over");

  // Deleting the new account too still carries everything over.
  await deleteAccount(again, { id: user.id, email: "petrbouma+new@googlemail.com", isOwner: false }, { fetchImpl });
  const third = await signInEmailUser(db, SERVER, "petrbouma@gmail.com");
  assert.deepEqual(await limits(envOf(db, third.id)), before);
});

test("the weekly limit counts the carried-over messages when a message is claimed", async () => {
  const db = database();
  const env = await usedAccount(db, 3, "x@example.com");
  await deleteAccount(env, { id: 3, email: "x@example.com", isOwner: false }, { fetchImpl });
  const user = await signInEmailUser(db, { ...SERVER, COACH_WEEKLY_MESSAGES: "13" }, "x@example.com");
  const again = { ...envOf(db, user.id), COACH_WEEKLY_MESSAGES: "13" };
  await recordCoachMessage(again, 1, await claimCoachMessage(again, 1));
  await assert.rejects(claimCoachMessage(again, 2), error => error.status === 429);
});

test("the same Apple ID or Google account inherits under another e-mail; another person does not", async () => {
  const db = database();
  const env = await usedAccount(db, 3, "relay1@privaterelay.appleid.com");
  db.sqlite.exec("CREATE TABLE IF NOT EXISTS user_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id INTEGER NOT NULL, email TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_login_at TEXT, PRIMARY KEY (provider, subject))");
  db.sqlite.prepare("INSERT INTO user_identities (provider, subject, user_id, email) VALUES ('apple', '001.sub', 3, 'relay1@privaterelay.appleid.com')").run();
  db.sqlite.prepare("UPDATE users SET google_sub = 'g-77' WHERE id = 3").run();
  const before = await limits(env);
  await deleteAccount(env, { id: 3, email: "relay1@privaterelay.appleid.com", isOwner: false }, { fetchImpl });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM ai_limit_memory").get().n, 3);

  const stranger = await signInEmailUser(db, SERVER, "someone@example.com");
  assert.deepEqual(await limits(envOf(db, stranger.id)), { coach: 0, today: 0, month: 0 });

  const apple = await signInAppleUser(db, SERVER, { sub: "001.sub", email: "other-relay@privaterelay.appleid.com" });
  assert.deepEqual(await limits(envOf(db, apple.id)), before);

  // A second new account by the same person's Google account starts from the same numbers.
  const google = await signInGoogleUser(db, SERVER, { sub: "g-77", email: "new@example.com", name: "N" });
  assert.deepEqual(await limits(envOf(db, google.id)), before);
});

test("nothing is kept for an account that used no AI, and old records are forgotten", async () => {
  const db = database();
  db.sqlite.prepare("INSERT INTO users (id, email) VALUES (5, 'quiet@example.com')").run();
  await deleteAccount(envOf(db, 5), { id: 5, email: "quiet@example.com", isOwner: false }, { fetchImpl });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'ai_limit_memory'").get().n, 0);

  const env = await usedAccount(db, 6, "old@example.com");
  await deleteAccount(env, { id: 6, email: "old@example.com", isOwner: false }, { fetchImpl });
  const until = db.sqlite.prepare("SELECT forget_on FROM ai_limit_memory").get().forget_on;
  assert.equal(await inheritAiLimits(db, SERVER, 99, { email: "old@example.com" }, { today: until }), null, "an expired record is not taken over");
  assert.equal(await forgetExpiredAiLimits(db, { today: until }), 1);
});

test("a carried-over month does not count against today's guard on a later day", async () => {
  const db = database();
  await ensureAiUsage(db);
  db.sqlite.prepare("INSERT INTO users (id, email) VALUES (8, 'n@example.com')").run();
  const today = localToday(), week = mondayOfDate(today);
  db.sqlite.exec(`CREATE TABLE ai_limit_memory (key TEXT PRIMARY KEY, week TEXT, coach_used INTEGER NOT NULL DEFAULT 0, day TEXT, day_usd REAL NOT NULL DEFAULT 0, month TEXT, month_usd REAL NOT NULL DEFAULT 0, forget_on TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  const [key] = await limitKeys(SERVER, { email: "n@example.com" });
  // Deleted on an earlier day of this month (or the month before, on the 1st).
  db.sqlite.prepare("INSERT INTO ai_limit_memory (key, week, coach_used, day, day_usd, month, month_usd, forget_on) VALUES (?, ?, 4, '1999-01-01', 0.7, ?, 2, '2999-01-01')").run(key, week, today.slice(0, 7));
  await inheritAiLimits(db, SERVER, 8, { email: "n@example.com" });
  const env = envOf(db, 8);
  assert.equal(await aiSpentThisMonth(env), 2);
  assert.equal(await aiSpentToday(env), 0);
  assert.equal((await coachAllowance(env)).used, 4);
});
