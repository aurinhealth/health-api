import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { coachAllowance, checkCoachMessage, claimCoachMessage, recordCoachMessage, releaseCoachMessage, nearAt, lastWorkoutEnd } from "../src/coach-allowance.js";

// Sunday 2026-10-18; the week started on Monday 2026-10-12.
const TODAY = "2026-10-18";
const envOf = (extra = {}) => {
  const DB = createD1();
  DB.sqlite.exec("CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, data_type TEXT, source_family TEXT, start_time TEXT, end_time TEXT, payload_json TEXT, record_role TEXT)");
  return { DB, USER_ID: 7, ...extra };
};
const workout = (env, start, end) => env.DB.sqlite.prepare("INSERT INTO health_datapoints (user_id, data_type, source_family, start_time, end_time, payload_json) VALUES (7, 'exercise', 'apple-health', ?, ?, '{}')").run(start, end);
// One answered message: claimed before the coach, logged after.
async function send(env, chatId, { now = Date.now(), today = TODAY } = {}) {
  const claim = await claimCoachMessage(env, chatId, { today, now });
  return recordCoachMessage(env, chatId, claim, { today, now });
}

test("the app says how many are left from 75 % on: 7 of 30, 4 of the trial's 15", () => {
  assert.equal(nearAt(30), 7);
  assert.equal(nearAt(15), 4);
});

test("30 messages a week, the notice comes once when 7 are left, and Sunday resets on Monday", async () => {
  const env = envOf();
  let last;
  const notices = [];
  for (let i = 1; i <= 23; i++) { last = await send(env, i); if (last.notice) notices.push(last.left); }
  assert.deepEqual(notices, [7]);
  assert.equal(last.left, 7);
  assert.equal(last.near, true);
  assert.equal(last.resetsOn, "2026-10-19");
  assert.equal((await coachAllowance(env, "2026-10-19")).left, 30, "a new week starts with the whole allowance");
});

test("the trial's 15 crosses into the last quarter at 4 left", async () => {
  const env = envOf({ COACH_WEEKLY_MESSAGES: "15" });
  let last;
  for (let i = 1; i <= 10; i++) last = await send(env, i);
  assert.equal(last.left, 5);
  assert.equal(last.near, false);
  last = await send(env, 11);
  assert.equal(last.left, 4);
  assert.equal(last.near, true);
  assert.equal(last.notice, true);
});

test("used up: a conversation going on gets 2 more, a new one is refused", async () => {
  const env = envOf({ COACH_WEEKLY_MESSAGES: "3" });
  for (let i = 0; i < 3; i++) await send(env, 1);
  assert.equal((await coachAllowance(env, TODAY)).left, 0);
  assert.equal((await checkCoachMessage(env, 1, { today: TODAY })).kind, "extra");
  assert.equal((await send(env, 1)).more, true);
  assert.equal((await send(env, 1)).more, false, "after the 2 extra ones the app shows the used-up card");
  await assert.rejects(claimCoachMessage(env, 1, { today: TODAY }), error => error.status === 429 && error.coachAllowance.exhausted === true && /vyčerpané|used up/.test(error.message));
  await assert.rejects(claimCoachMessage(env, null, { today: TODAY }), error => error.status === 429);
  assert.equal((await coachAllowance(env, TODAY)).used, 3, "the extra messages are not counted");
});

test("a conversation left for half an hour gets no extra messages", async () => {
  const env = envOf({ COACH_WEEKLY_MESSAGES: "1" });
  await send(env, 1);
  await assert.rejects(claimCoachMessage(env, 1, { today: TODAY, now: Date.now() + 31 * 60000 }), error => error.status === 429);
});

test("a conversation started within 3 hours after a workout counts once for its first 5 messages", async () => {
  const env = envOf();
  const now = Date.now();
  workout(env, new Date(now - 3 * 3600000).toISOString(), new Date(now - 2 * 3600000).toISOString());
  for (let i = 0; i < 5; i++) assert.equal((await send(env, 1, { now: now + i * 3600000 })).used, 1, "messages 2 to 5 are free even when written later");
  assert.equal((await send(env, 1, { now })).used, 2, "the 6th counts as usual");
  assert.equal((await send(env, 2, { now })).used, 3, "another conversation only counts if it also starts after a workout");
});

test("the window runs from the latest workout, and a workout not yet synced counts nothing back", async () => {
  const env = envOf();
  const now = Date.now(), iso = h => new Date(now + h * 3600000).toISOString();
  workout(env, iso(-6), iso(-5));
  assert.equal(await lastWorkoutEnd(env, now), Date.parse(iso(-5)));
  await send(env, 1, { now });
  await send(env, 1, { now });
  assert.equal((await coachAllowance(env, TODAY)).used, 2, "5 hours after the workout the messages count");
  workout(env, iso(-2), iso(-1));
  await send(env, 1, { now });
  assert.equal((await coachAllowance(env, TODAY)).used, 3, "the workout synced later does not turn the running conversation into one");
  await send(env, 2, { now });
  await send(env, 2, { now });
  assert.equal((await coachAllowance(env, TODAY)).used, 4, "a new conversation an hour after the latest one is a workout conversation");
});

test("the owner has a paying account's allowance live, none on the test server", async () => {
  assert.equal((await coachAllowance(envOf({ USER_IS_OWNER: true }), TODAY)).limit, 30);
  const env = envOf({ USER_IS_OWNER: true, ENVIRONMENT: "staging" });
  assert.equal(await coachAllowance(env, TODAY), null);
  assert.equal(await claimCoachMessage(env, 1, { today: TODAY }), null);
  assert.equal(await recordCoachMessage(env, 1, null, { today: TODAY }), null);
});

test("messages sent at once take the last one only once, and a failed answer gives its message back", async () => {
  const env = envOf();
  for (let i = 1; i <= 29; i++) await send(env, i);
  // Before, 20 messages at once with 1 left all went (49 of 30).
  const claims = await Promise.allSettled(Array.from({ length: 20 }, () => claimCoachMessage(env, null, { today: TODAY })));
  assert.equal(claims.filter(c => c.status === "fulfilled").length, 1);
  assert.ok(claims.filter(c => c.status === "rejected").every(c => c.reason.status === 429 && c.reason.coachAllowance?.exhausted === true));
  assert.equal((await coachAllowance(env, TODAY)).used, 30);
  // That answer failed: the message is not counted and can be sent again.
  await releaseCoachMessage(env, claims.find(c => c.status === "fulfilled").value);
  assert.equal((await coachAllowance(env, TODAY)).used, 29);
  const last = await send(env, 30);
  assert.deepEqual([last.used, last.left, last.more], [30, 0, true]);
  // A recorded message stays counted.
  const claim = await claimCoachMessage(env, 30, { today: TODAY });
  await recordCoachMessage(env, 30, claim, { today: TODAY });
  await releaseCoachMessage(env, claim);
  assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM coach_messages WHERE kind = 'extra'").get().n, 1);
});

test("the coach route gives a message back when its answer fails", () => {
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /return answerMessage\(show,onProgress\)\.catch\(async error=>\{if\(!shown\)await releaseCoachMessage\(env,claim\)/);
});
