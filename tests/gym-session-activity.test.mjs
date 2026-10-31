import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { matchActivities } from "../src/index.js";
import { withTimeZone } from "../src/user-time.js";
import { pairSessions } from "../src/activity-match.js";
import { gymSessionSpan, gymActivityPayload, syncGymActivity, removeGymActivity } from "../src/gym-session-activity.js";

const prague = fn => withTimeZone("Europe/Prague", fn);
const at = iso => Date.parse(iso);
// A 74-minute upper body session in Prague (UTC+1), sets logged live; the
// Fitbit caught 14 minutes at its start and, earlier, a walk it took for lifting.
const DATE = "2026-10-31";
const SET_TIMES = ["2026-10-31 10:07:39", "2026-10-31 10:40:43", "2026-10-31 11:21:00"];
const early = { start: at("2026-10-31T09:26:32.800Z"), end: at("2026-10-31T09:39:30.800Z"), kcal: 59 };
const start = { start: at("2026-10-31T10:06:41.400Z"), end: at("2026-10-31T10:20:27.400Z"), kcal: 24 };

test("the session runs from the first set to the last, widened by the watch piece at its start", () => {
  const span = prague(() => gymSessionSpan(DATE, SET_TIMES, [early, start]));
  assert.equal(new Date(span.start).toISOString(), "2026-10-31T10:06:41.400Z");
  assert.equal(new Date(span.end).toISOString(), "2026-10-31T11:21:00.000Z");
  assert.deepEqual(span.pieces, [start]);
});

test("sets typed in afterwards, or on another day, make no session", () => {
  assert.equal(prague(() => gymSessionSpan(DATE, ["2026-10-31 18:00:01", "2026-10-31 18:00:09", "2026-10-31 18:00:15"])), null);
  assert.equal(prague(() => gymSessionSpan("2026-10-30", SET_TIMES)), null);
  assert.equal(prague(() => gymSessionSpan(DATE, ["2026-10-31 10:07:39"])), null);
});

test("calories: the lifting estimate from the weight, else the watch pieces, and a number set by hand stays", () => {
  const span = { start: at("2026-10-31T10:06:41Z"), end: at("2026-10-31T11:21:00Z"), pieces: [start] };
  const payload = prague(() => gymActivityPayload({ date: DATE, name: "Upper Body", span, weightKg: 87 }));
  assert.equal(payload.moving_time, 4459);
  assert.equal(payload.calories, Math.round(2.5 * 87 * 4459 / 3600));
  assert.equal(payload.start_date_local, "2026-10-31T11:06:00");
  assert.equal(payload.name, "Upper Body");
  assert.equal(payload.aurinGym, DATE);
  assert.equal(prague(() => gymActivityPayload({ date: DATE, span, weightKg: null })).calories, 24);
  const edited = prague(() => gymActivityPayload({ date: DATE, span, weightKg: 87, kept: { calories: 400, aurinKcal: 400 } }));
  assert.equal(edited.calories, 400);
  assert.equal(edited.aurinKcal, 400);
});

test("the watch's whole record of the session wins over the estimate; its pieces go inside it", () => {
  const gym = { source_family: "local", data_type: "activity", external_id: "aurin-gym:" + DATE, start_time: "2026-10-31T11:06:41",
    payload_json: JSON.stringify({ type: "WeightTraining", start_date_local: "2026-10-31T11:06:41", moving_time: 4459, elapsed_time: 4459, aurinGym: DATE }) };
  const watch = (id, s, e) => ({ source_family: "google-wearables", data_type: "exercise", external_id: id, start_time: s, end_time: e,
    payload_json: JSON.stringify({ exercise: { exerciseType: "STRENGTH_TRAINING" } }) });
  const piece = watch("piece", "2026-10-31T10:06:41.400Z", "2026-10-31T10:20:27.400Z");
  const whole = watch("whole", "2026-10-31T10:05:00Z", "2026-10-31T11:22:00Z");
  prague(() => {
    const [inside] = pairSessions([gym, piece]);
    assert.equal(inside.keep, gym); assert.equal(inside.drop, piece); assert.equal(inside.inside, true);
    const [same] = pairSessions([gym, whole]);
    assert.equal(same.keep, whole); assert.equal(same.drop, gym);
  });
});

function setup() {
  const raw = createD1();
  raw.sqlite.exec(readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8"));
  const env = { DB: scopedDb(raw, 1), USER_ID: 1, CONNECTED_PROVIDERS: [] };
  for (const [i, t] of SET_TIMES.entries()) raw.sqlite.prepare("INSERT INTO strength_sets(user_id,workout_date,plan_row,type,exercise,set_no,completed,source,source_key,created_at) VALUES(1,?,?,'WORK','Low row',?,1,'manual',?,?)").run(DATE, 8 + i, i + 1, "k" + i, t);
  const insert = (id, s, e, kcal) => raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,start_time,end_time,payload_json,record_role) VALUES(1,'google-wearables','exercise',?,?,?,?,'primary')")
    .run(id, s, e, JSON.stringify({ exercise: { exerciseType: "STRENGTH_TRAINING", displayName: "Strength training", activeDuration: "826s", metricsSummary: { caloriesKcal: kcal } } }));
  raw.sqlite.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,sample_time,value_numeric,payload_json) VALUES(1,'intervals','weight','2026-10-24T12:00:00+02:00',87,'{}')").run();
  const row = id => raw.sqlite.prepare("SELECT * FROM health_datapoints WHERE external_id=?").get(id);
  return { env, insert, row };
}

test("a save of the day's gym writes its activity once and the watch piece becomes its part", async () => {
  const { env, insert, row } = setup();
  insert("exercise:start", "2026-10-31T10:06:41.400Z", "2026-10-31T10:20:27.400Z", 24);
  assert.equal(await prague(() => syncGymActivity(env, DATE, { name: "Upper Body" })), true);
  const gym = row("aurin-gym:" + DATE);
  assert.equal(gym.start_time, "2026-10-31T11:06:00");
  assert.equal(gym.end_time, "2026-10-31T12:21:00");
  assert.equal(JSON.parse(gym.payload_json).calories, 269);
  // Nothing changed: nothing written again.
  assert.equal(await prague(() => syncGymActivity(env, DATE, { name: "Upper Body" })), false);
  await prague(() => matchActivities(env, { days: null }));
  assert.equal(row("exercise:start").record_role, "duplicate");
  assert.equal(row("exercise:start").matched_activity_id, "local:aurin-gym:" + DATE);
  await removeGymActivity(env, DATE);
  assert.equal(row("aurin-gym:" + DATE), undefined);
});
