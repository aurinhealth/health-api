import test from "node:test";
import assert from "node:assert/strict";
import { createD1 } from "./helpers/d1.mjs";
import { dueUserJobs, fanOutUserJobs } from "../src/entrypoint.js";

const at = (h, m) => new Date(Date.UTC(2026, 9, 15, h, m));

test("each minute names the jobs due then: syncing always, the rest on their minutes", () => {
  assert.deepEqual(dueUserJobs("* * * * *", at(10, 1)), ["sync"]);
  assert.ok(dueUserJobs("* * * * *", at(10, 5)).includes("wahoo-exports"));
  assert.ok(dueUserJobs("* * * * *", at(10, 20)).includes("ultrahuman"));
  assert.ok(dueUserJobs("* * * * *", at(10, 25)).includes("whoop"));
  assert.ok(dueUserJobs("* * * * *", at(9, 35)).includes("wahoo"));
  assert.ok(!dueUserJobs("* * * * *", at(10, 35)).includes("wahoo"));
  assert.deepEqual(dueUserJobs("5 1 * * *", at(1, 5)), ["sync"]);
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
