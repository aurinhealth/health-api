import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withTimeZone } from "../src/user-time.js";
import { checkActivityLog, applyActivityLog } from "../src/coach-manual-workout.js";
import { storeLocalEvent, completeLocalWorkout } from "../src/local-workouts.js";
import { undoActivityChange } from "../src/activity-chat-edits.js";
import { validateCoachActions, actionSummary } from "../src/coach-actions.js";
import { UNDO_KINDS } from "../src/coach-chat-confirm.js";

const DAY = "2026-11-28";
const prague = fn => withTimeZone("Europe/Prague", fn);
const meta = { chatId: 7, messageId: 70, draftId: 12, proposal: "p" };
const blank = { foodId: "", meal: "", amount: 0, drink: "", otherType: "", sport: "", time: "", minutes: 0 };
const card = (a, context = {}) => checkActivityLog({ ...blank, ...a }, { date: DAY, now: DAY + " 20:00", ...context }, "Jel jsi hodinu na trenažeru.", DAY)[0];

function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  return { raw, env: { DB: scopedDb(raw, 1), USER_ID: 1 } };
}
// What POST /app/api/workouts/manual does for a done workout, without the sends.
const post = env => async body => {
  const saved = await storeLocalEvent(env.DB, { external_id: "manual:" + body.requestId, category: "WORKOUT", name: body.name, type: body.type || "VirtualRide", start_date_local: body.date + "T" + body.time + ":00", moving_time: body.minutes * 60 });
  await completeLocalWorkout(env.DB, saved.id, { minutes: body.minutes });
  return { status: "ok", eventId: "planned:" + saved.id, type: "VirtualRide", activityKey: "manual:" + saved.id, sends: [] };
};

test("a ride the watch missed gets a card; not later today, not older than 7 days, not twice", () => {
  const a = card({ sport: "ride", date: DAY, time: "17:00", minutes: 60 });
  assert.deepEqual([a.activityName, a.date, a.time, a.minutes], ["Jízda", DAY, "17:00", 60]);
  assert.match(actionSummary(a), /^Zapsat trénink: Jízda 60 min \(28\. 11\., 17:00\)$/);
  assert.equal(card({ sport: "ride", date: DAY, time: "19:30", minutes: 60 }), undefined, "ends after now");
  assert.equal(card({ sport: "ride", date: "2026-11-20", time: "17:00", minutes: 60 }), undefined);
  assert.equal(card({ sport: "ride", date: DAY, time: "17:00", minutes: 2 }), undefined);
  assert.equal(card({ otherType: "Yoga", date: DAY, time: "07:00", minutes: 30 }).otherType, "Yoga");
  assert.equal(card({ otherType: "NotASport", date: DAY, time: "07:00", minutes: 30 }), undefined);
  const watch = { today: { training: { completed: [{ id: "x", start: "17:10", end: "18:05" }] } } };
  assert.equal(card({ sport: "ride", date: DAY, time: "17:00", minutes: 60 }, watch), undefined, "the watch has it");
  assert.ok(card({ sport: "ride", date: DAY, time: "06:00", minutes: 60 }, watch));
});

test("only from the athlete's own message, in an app that shows it", () => {
  const action = { ...blank, type: "activity_log", sport: "run", date: DAY, time: "07:00", minutes: 40, reason: "Běžel jsi 40 minut." };
  const context = { date: DAY, now: DAY + " 20:00" };
  assert.equal(validateCoachActions([action], context, DAY, { userInitiated: true }).length, 1);
  assert.equal(validateCoachActions([action], context, DAY).length, 0);
  assert.equal(validateCoachActions([action], { ...context, activityLog: false }, DAY, { userInitiated: true }).length, 0);
});

test("the logged workout goes with Vrátit, once, and tells the app its Apple Health key", async () => {
  const { raw, env } = setup();
  const a = card({ sport: "ride", date: DAY, time: "17:00", minutes: 60 });
  const done = await prague(() => applyActivityLog(env, a, meta, post(env)));
  assert.equal(done.start, "2026-11-28T16:00:00.000Z");
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM health_datapoints WHERE external_id=?").get(done.id).n, 1);
  const back = await undoActivityChange(env, done.undo);
  assert.deepEqual([back.kind, back.activityKey], ["manual", done.activityKey]);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM health_datapoints WHERE external_id=?").get(done.id).n, 0);
  await assert.rejects(undoActivityChange(env, done.undo));
  assert.ok(UNDO_KINDS.includes("manual"));
});

test("a watch record already in that time is not logged again", async () => {
  const { raw, env } = setup();
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json) VALUES(1,'apple-health','exercise','w1','2026-11-28T16:05:00Z','2026-11-28T17:00:00Z','{}')").run();
  const a = card({ sport: "ride", date: DAY, time: "17:00", minutes: 60 });
  await assert.rejects(prague(() => applyActivityLog(env, a, meta, post(env))), /hodinek/);
  assert.equal(raw.sqlite.prepare("SELECT COUNT(*) AS n FROM health_datapoints WHERE source_family='local'").get().n, 0);
});
