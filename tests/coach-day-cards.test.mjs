import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { checkFeeling, checkEffort, applyFeeling, applyEffort } from "../src/coach-day-cards.js";
import { getCheckin, saveCheckin } from "../src/morning-checkin.js";
import { ensureReflectionTable, listReflections } from "../src/coach-reflection.js";
import { undoActivityChange } from "../src/activity-chat-edits.js";
import { validateCoachActions, actionSummary } from "../src/coach-actions.js";
import { UNDO_KINDS } from "../src/coach-chat-confirm.js";

const DAY = "2026-11-28", YESTERDAY = "2026-11-27";
const meta = { chatId: 7, messageId: 70, draftId: 12, proposal: "p" };
const ride = { id: "apple-health:r1", name: "Sweet spot 3×15", type: "Ride", start: "17:30", end: "18:45" };
const context = { date: DAY, now: DAY + " 20:00", today: { feeling: "normal", training: { completed: [] } }, week: [{ date: YESTERDAY, completed: [ride] }, { date: "2026-11-25", completed: [{ id: "old", name: "Běh" }] }] };

function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  return { raw, env: { DB: scopedDb(raw, 1), USER_ID: 1 } };
}

test("the morning answer only when it changes; the effort of a done activity of today or yesterday", () => {
  const a = checkFeeling({ feeling: "tired" }, context, "Píšeš, že jsi unavený.", DAY)[0];
  assert.deepEqual([a.feeling, a.from, a.date], ["tired", "normal", DAY]);
  assert.equal(actionSummary(a), "Ranní odpověď: Unavený místo Normální");
  assert.equal(checkFeeling({ feeling: "normal" }, context, "r", DAY).length, 0, "the same answer");
  assert.equal(checkFeeling({ feeling: "sick" }, context, "r", DAY).length, 0, "never sick");
  const e = checkEffort({ activityId: ride.id, rpe: 8 }, context, "Řekl jsi 8 z 10.", DAY)[0];
  assert.deepEqual([e.activityName, e.date, e.time, e.rpe], ["Sweet spot 3×15", YESTERDAY, "17:30", 8]);
  assert.equal(actionSummary(e), "Pocit z tréninku: Sweet spot 3×15 (27. 11., 17:30) 8 z 10");
  assert.equal(checkEffort({ activityId: ride.id, rpe: 11 }, context, "r", DAY).length, 0);
  assert.equal(checkEffort({ activityId: "old", rpe: 5 }, context, "r", DAY).length, 0, "older than yesterday");
  assert.equal(checkEffort({ activityId: "nope", rpe: 5 }, context, "r", DAY).length, 0);
});

test("only from the athlete's own message, in an app that shows them", () => {
  const action = { type: "feeling", feeling: "tired", activityId: "", rpe: 0, reason: "Píšeš, že jsi unavený." };
  assert.equal(validateCoachActions([action], context, DAY, { userInitiated: true }).length, 1);
  assert.equal(validateCoachActions([action], context, DAY).length, 0);
  assert.equal(validateCoachActions([action], { ...context, dayCards: false }, DAY, { userInitiated: true }).length, 0);
});

test("the answer goes back with Vrátit, once, and not after Today changed it again", async () => {
  const { env } = setup();
  await saveCheckin(env.DB, DAY, "normal");
  const done = await applyFeeling(env, { feeling: "tired", date: DAY }, meta);
  assert.equal(await getCheckin(env.DB, DAY), "tired");
  const back = await undoActivityChange(env, done.undo);
  assert.deepEqual([back.kind, back.feeling], ["feeling", "normal"]);
  assert.equal(await getCheckin(env.DB, DAY), "normal");
  await assert.rejects(undoActivityChange(env, done.undo));
  const again = await applyFeeling(env, { feeling: "fresh", date: DAY }, meta);
  await saveCheckin(env.DB, DAY, "tired");
  await assert.rejects(undoActivityChange(env, again.undo), /upravila/);
  assert.equal(await getCheckin(env.DB, DAY), "tired");
  const none = await applyFeeling(env, { feeling: "tired", date: YESTERDAY }, meta);
  await undoActivityChange(env, none.undo);
  assert.equal(await getCheckin(env.DB, YESTERDAY), null, "no answer before: none after");
  assert.ok(UNDO_KINDS.includes("feeling") && UNDO_KINDS.includes("effort"));
});

test("the effort is the day's note with its RPE, and Vrátit takes it away", async () => {
  const { env } = setup();
  const record = async ({ date, workoutId, rpe }) => {
    await ensureReflectionTable(env.DB);
    await env.DB.prepare("INSERT INTO coach_reflections(user_id,date,workout_id,rpe,notes,signals_json,text,source) VALUES(?,?,?,?,?,?,?,?)").bind(1, date, workoutId, rpe, null, "{}", "Poznámka.", "rules").run();
  };
  const a = checkEffort({ activityId: ride.id, rpe: 8 }, context, "Řekl jsi 8 z 10.", DAY)[0];
  const done = await applyEffort(env, a, meta, record);
  assert.deepEqual((await listReflections(env.DB, { date: YESTERDAY })).map(r => [r.workoutId, r.rpe]), [[ride.id, 8]]);
  const back = await undoActivityChange(env, done.undo);
  assert.equal(back.kind, "effort");
  assert.equal((await listReflections(env.DB, { date: YESTERDAY })).length, 0);
  await assert.rejects(undoActivityChange(env, done.undo));
});
