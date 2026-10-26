import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { dueUserJobs, fanOutUserJobs, runUserJobsInvocation } from "../src/entrypoint.js";

const at = (h, m) => new Date(Date.UTC(2026, 9, 15, h, m));

test("each minute names the jobs due then: syncing always, the rest on their minutes", () => {
  assert.deepEqual(dueUserJobs("* * * * *", at(10, 1)), ["sync"]);
  assert.ok(dueUserJobs("* * * * *", at(10, 5)).includes("wahoo-exports"));
  assert.ok(dueUserJobs("* * * * *", at(10, 20)).includes("ultrahuman"));
  assert.ok(dueUserJobs("* * * * *", at(10, 25)).includes("whoop"));
  assert.ok(dueUserJobs("* * * * *", at(9, 35)).includes("wahoo"));
  // Every hour at :35; off the three-hour mark it reads Wahoo only on a day with a ride planned (wahooRideExpected).
  assert.ok(dueUserJobs("* * * * *", at(10, 35)).includes("wahoo"));
  assert.ok(!dueUserJobs("* * * * *", at(10, 36)).includes("wahoo"));
  assert.deepEqual(dueUserJobs("5 1 * * *", at(1, 5)), ["sync"]);
  assert.ok(dueUserJobs("* * * * *", at(10, 5)).includes("coach-push"));
  assert.ok(!dueUserJobs("* * * * *", at(10, 6)).includes("coach-push"));
  // The morning push before the coach's, which waits for it.
  const names = dueUserJobs("* * * * *", at(10, 5));
  assert.ok(names.indexOf("morning-push") >= 0 && names.indexOf("morning-push") < names.indexOf("coach-push"));
  assert.ok(!dueUserJobs("* * * * *", at(10, 6)).includes("morning-push"));
});

test("the coach's push goes to everyone with a phone to notify, whatever they connected, once each", async () => {
  const db = database(1);
  db.sqlite.exec("CREATE TABLE push_tokens (user_id INTEGER, token TEXT)");
  // 1: Google (and a phone); 2: Apple Health only; 3: WHOOP; 4: Ultrahuman, consent withdrawn;
  // 5: blocked; 6: no phone and nothing connected.
  for (const [id, provider, consent, disabled, token] of [[2, null, true, 0, true], [3, "whoop", true, 0, true], [4, "ultrahuman", false, 0, true], [5, null, true, 1, true], [6, null, true, 0, false]]) {
    db.sqlite.prepare("INSERT INTO users (id, email, name, role, disabled) VALUES (?, ?, ?, 'user', ?)").run(id, "u" + id + "@example.com", "U" + id, disabled);
    if (provider) db.sqlite.prepare("INSERT INTO connection_credentials VALUES (?, ?)").run(id, provider);
    if (consent) db.sqlite.prepare("INSERT INTO user_consents VALUES (?, 'health', NULL)").run(id);
    if (token) db.sqlite.prepare("INSERT INTO push_tokens VALUES (?, ?)").run(id, "t" + id);
  }
  db.sqlite.prepare("INSERT INTO user_consents VALUES (4, 'health', '2026-10-01')").run();
  db.sqlite.prepare("INSERT INTO push_tokens VALUES (1, 't1')").run();
  const apns = { APNS_KEY_P8: "k", APNS_KEY_ID: "id", APPLE_TEAM_ID: "team" };
  const fanOut = async (env, time) => {
    const sent = [];
    await fanOutUserJobs({ DB: db, OWNER_EMAIL: "owner@example.com", USER_JOBS: { run: async message => { sent.push(message); return { ok: true }; } }, ...env }, {}, { cron: "* * * * *", scheduledTime: time.getTime() });
    return sent;
  };
  const sent = await fanOut(apns, at(17, 5));
  assert.deepEqual(sent.map(m => m.user.id), [1, 2, 3], "each once, the Google user too");
  assert.ok(sent.every(m => m.names.includes("coach-push") && m.names.includes("morning-push")));
  // Off the push minutes, or without APNs, only the users with a service.
  assert.deepEqual((await fanOut(apns, at(17, 6))).map(m => m.user.id), [1]);
  assert.deepEqual((await fanOut({}, at(17, 5))).map(m => m.user.id), [1]);
});

function database(count) {
  const db = createD1();
  db.sqlite.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, role TEXT, disabled INTEGER DEFAULT 0); CREATE TABLE connection_credentials (user_id INTEGER, provider TEXT); CREATE TABLE user_consents (user_id INTEGER, kind TEXT, withdrawn_at TEXT);");
  for (let id = 1; id <= count; id++) {
    db.sqlite.prepare("INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, 'user')").run(id, "u" + id + "@example.com", "U" + id);
    db.sqlite.prepare("INSERT INTO connection_credentials VALUES (?, 'google')").run(id);
    db.sqlite.prepare("INSERT INTO user_consents VALUES (?, 'health', NULL)").run(id);
  }
  return db;
}

test("every user's jobs go to an invocation of their own, ten at a time", async () => {
  const sent = [];
  let running = 0, most = 0;
  const USER_JOBS = { run: async message => { running++; most = Math.max(most, running); await new Promise(r => setTimeout(r, 2)); sent.push(message); running--; } };
  const result = await fanOutUserJobs({ DB: database(25), OWNER_EMAIL: "owner@example.com", USER_JOBS }, {}, { cron: "* * * * *", scheduledTime: at(10, 5).getTime() });
  assert.equal(result.users, 25);
  assert.deepEqual(sent.map(m => m.user.id).sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.ok(sent.every(m => m.names.includes("sync") && m.names.includes("google-food") && m.cron === "* * * * *"));
  assert.ok(most <= 10);
});

test("a broken binding before any user went through falls back to running the jobs here", async () => {
  const USER_JOBS = { run: async () => { throw new Error("binding missing"); } };
  const errors = [], original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const result = await fanOutUserJobs({ DB: database(2), OWNER_EMAIL: "owner@example.com", USER_JOBS }, {}, { cron: "* * * * *", scheduledTime: at(10, 1).getTime() }, { concurrency: 1 });
    assert.equal(result.users, 2);
  } finally { console.error = original; }
  assert.equal(errors.filter(e => /User jobs invocation failed/.test(e)).length, 1);
});

// The cron run's environment; scoping a user to run their jobs here copies it,
// which `here` counts.
function cronEnv(count, USER_JOBS) {
  let copies = 0;
  const env = { DB: database(count), OWNER_EMAIL: "owner@example.com", ...(USER_JOBS ? { USER_JOBS } : {}), get COPIED() { copies++; return undefined; } };
  return { env, here: () => copies };
}
async function quietly(work) {
  const errors = [], original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try { return { result: await work(), errors }; } finally { console.error = original; }
}
const minuteRun = { cron: "* * * * *", scheduledTime: at(10, 1).getTime() };

test("one user's jobs failing in their invocation leave every other user on the binding, none run here", async () => {
  const healthy = cronEnv(40, { run: async () => ({ ok: true }) });
  await fanOutUserJobs(healthy.env, {}, minuteRun);
  for (const fail of [async () => ({ ok: false, error: "User data unavailable" }), async () => { throw new Error("Exceeded CPU limit"); }]) {
    const sent = [];
    const run = cronEnv(40, { run: async message => {
      sent.push(message.user.id);
      if (message.user.id === 3) return fail();
      await new Promise(r => setTimeout(r, 2));
      return { ok: true };
    } });
    const { result, errors } = await quietly(() => fanOutUserJobs(run.env, {}, minuteRun));
    assert.equal(result.users, 40);
    assert.deepEqual(sent.sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i + 1));
    assert.equal(run.here(), healthy.here());
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^User jobs (invocation )?failed 3 /);
  }
});

test("without the binding, or when no call of the first batch goes through, every user runs here", async () => {
  const healthy = cronEnv(12, { run: async () => ({ ok: true }) });
  await fanOutUserJobs(healthy.env, {}, minuteRun);
  const missing = cronEnv(12);
  await quietly(() => fanOutUserJobs(missing.env, {}, minuteRun));
  assert.ok(missing.here() >= healthy.here() + 12, `${missing.here()} vs ${healthy.here()}`);
  let calls = 0;
  const broken = cronEnv(12, { run: async () => { calls++; throw new Error("Service binding unavailable"); } });
  const { errors } = await quietly(() => fanOutUserJobs(broken.env, {}, minuteRun));
  assert.equal(calls, 10);
  assert.equal(errors.filter(e => /User jobs invocation failed/.test(e)).length, 10);
  assert.equal(broken.here(), missing.here());
});

test("an invocation answers a failure of the user's own setup instead of rejecting", async () => {
  const unavailable = () => { throw new Error("User data unavailable"); };
  const DB = { prepare: unavailable, batch: async () => unavailable(), exec: async () => unavailable() };
  const { result, errors } = await quietly(() => runUserJobsInvocation({ DB, OWNER_EMAIL: "owner@example.com" }, {}, { user: { id: 7 }, names: ["sync"], ...minuteRun }));
  assert.deepEqual(result, { ok: false, error: "User data unavailable" });
  assert.match(errors.join("\n"), /User jobs failed 7 User data unavailable/);
});
