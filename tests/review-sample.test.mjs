import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { withTimeZone } from "../src/user-time.js";
import { ensureReviewSample, sampleRecords, sampleDay, forgetWritten, SAMPLE_DAYS } from "../src/review-sample.js";
import { appleRow, disconnectAppleHealth } from "../src/apple-health.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, env: { DB: scopedDb(raw, 7), USER_ID: 7 } };
}
const count = (raw, type) => raw.sqlite.prepare("SELECT COUNT(*) AS n FROM health_datapoints WHERE user_id = 7 AND data_type = ?").get(type).n;
// Wednesday 2026-11-04, 10:30 in Los Angeles.
const NOW = Date.parse("2026-11-04T18:30:00Z");

test("every sample record is one the Apple Health upload accepts, and none lies in the future", () => {
  withTimeZone("America/Los_Angeles", () => {
    const records = sampleRecords(NOW, SAMPLE_DAYS);
    assert.ok(records.length > 1000 && records.length < 5000, "within one upload: " + records.length);
    for (const r of records) {
      const row = appleRow(r, NOW);
      assert.ok(row, "accepted: " + r.id);
      const time = row.end_time || row.start_time || (row.sample_time.includes("T") ? row.sample_time : row.sample_time + "T00:00:00Z");
      assert.ok(Date.parse(time) <= NOW, "not in the future: " + r.id);
    }
    assert.equal(new Set(records.map(r => r.id)).size, records.length, "ids are unique");
    assert.deepEqual(sampleDay("2026-10-20", NOW), sampleDay("2026-10-20", NOW), "the same day gives the same numbers");
    // Today so far: last night, the morning's values, the morning swim, hours up to 10:00.
    const today = sampleDay("2026-11-04", NOW);
    assert.ok(today.some(r => r.type === "sleep"));
    assert.ok(today.some(r => r.type === "daily-heart-rate-variability" && r.metric === "sdnn"));
    assert.deepEqual(today.filter(r => r.type === "exercise").map(r => r.activity), ["swimming"], "Wednesday's 7:00 swim is done by 10:30");
    assert.ok(!sampleDay("2026-11-05", Date.parse("2026-11-05T22:00:00Z")).some(r => r.type === "exercise"), "Thursday's 18:00 ride is still ahead at 14:00");
    assert.equal(today.filter(r => r.type === "active-energy-burned").length, 10);
  });
});

test("the review account gets six weeks once, then only what the hours add", async () => {
  forgetWritten();
  const { raw, env } = setup();
  await withTimeZone("America/Los_Angeles", async () => {
    const first = await ensureReviewSample(env, { now: NOW });
    assert.equal(first.status, "ok");
    assert.ok(first.changed > 1000);
    assert.equal(count(raw, "sleep"), SAMPLE_DAYS);
    assert.ok(count(raw, "exercise") >= 30);
    // The same hour: nothing read or written.
    assert.equal(await ensureReviewSample(env, { now: NOW + 60000 }), null);
    // An hour later: today and yesterday again, one more hour of steps and energy.
    const energy = count(raw, "active-energy-burned");
    const later = await ensureReviewSample(env, { now: NOW + 3600000 });
    assert.ok(later.saved < 200, "two days, not six weeks: " + later.saved);
    assert.equal(count(raw, "active-energy-burned"), energy + 1);
    assert.equal(count(raw, "sleep"), SAMPLE_DAYS);
    // The next morning: last night arrives, nothing older is written again.
    const tomorrow = await ensureReviewSample(env, { now: NOW + 86400000 });
    assert.ok(tomorrow.saved < 200);
    assert.equal(count(raw, "sleep"), SAMPLE_DAYS + 1);
  });
  const status = raw.sqlite.prepare("SELECT status, details_json FROM sync_status WHERE user_id = 7 AND sync_name = 'apple_health'").get();
  assert.equal(status.status, "ok");
  assert.ok(JSON.parse(status.details_json).categories.includes("sleep"));
});

test("a deleted and new review account is filled again in full", async () => {
  forgetWritten();
  const { raw, env } = setup();
  await withTimeZone("Europe/Prague", async () => {
    await ensureReviewSample(env, { now: NOW });
    raw.sqlite.exec("DELETE FROM health_datapoints");
    forgetWritten();
    await ensureReviewSample(env, { now: NOW });
  });
  assert.equal(count(raw, "sleep"), SAMPLE_DAYS);
});

test("no database or no user: nothing happens", async () => {
  assert.equal(await ensureReviewSample({}), null);
  assert.equal(await ensureReviewSample({ DB: {} }), null);
});

test("the app's first screens at once wait for one write", async () => {
  forgetWritten();
  const { raw, env } = setup();
  let batches = 0;
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = statements => { batches++; return batch(statements); };
  await withTimeZone("America/Los_Angeles", () => Promise.all([1, 2, 3].map(() => ensureReviewSample(env, { now: NOW }))));
  assert.equal(count(raw, "sleep"), SAMPLE_DAYS);
  assert.ok(batches < 15, "one upload's batches, not three: " + batches);
});

test("the hourly top-up runs after the response, the first fill before it", async () => {
  forgetWritten();
  const { raw, env } = setup();
  const later = [];
  await withTimeZone("America/Los_Angeles", async () => {
    const first = await ensureReviewSample(env, { now: NOW, later: job => later.push(job) });
    assert.equal(first.status, "ok", "the first fill is awaited");
    assert.equal(later.length, 0);
    const energy = count(raw, "active-energy-burned");
    assert.equal(await ensureReviewSample(env, { now: NOW + 3600000, later: job => later.push(job) }), null, "the request goes on");
    assert.equal(later.length, 1);
    await later[0];
    assert.equal(count(raw, "active-energy-burned"), energy + 1);
  });
});

test("Apple Health switched off in the app stays off: no more sample", async () => {
  forgetWritten();
  const { raw, env } = setup();
  await withTimeZone("America/Los_Angeles", async () => {
    await ensureReviewSample(env, { now: NOW });
    await disconnectAppleHealth(env.DB, 7);
    const energy = count(raw, "active-energy-burned");
    assert.equal(await ensureReviewSample(env, { now: NOW + 3600000 }), null);
    assert.equal(await ensureReviewSample(env, { now: NOW + 86400000 }), null);
    assert.equal(count(raw, "active-energy-burned"), energy);
  });
  assert.equal(raw.sqlite.prepare("SELECT status FROM sync_status WHERE user_id = 7 AND sync_name = 'apple_health'").get().status, "disconnected");
});
