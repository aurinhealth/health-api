// Sample data for the Apple App Review account (app-review.js). A reviewer's
// test iPhone has no nights, heart rate or workouts from a watch, so Today,
// Sleep, Training and the coach would all be empty and the review would see
// little of the app (App Store guideline 2.1(a): the demo account has to show
// the app's features). The account gets six weeks of an invented athlete's
// Apple Health instead, through the same path the iPhone sends it
// (saveAppleHealth), so every screen reads it as it reads anyone's.
//
// Nothing here is a real person's data. The values are made up and repeat the
// same way every time (a seeded random per day), so a second write changes
// nothing. The sample grows by itself: the first request of each hour adds
// the hours that passed and, in the morning, last night. Only the review
// account, only while its fixed code works (reviewCode), never after Apple
// Health was switched off in the app, and the
// Review Notes tell App Review the data is a sample.
import { saveAppleHealth } from "./apple-health.js";
import { bumpCacheVersion } from "./api-cache.js";
import { localToday, localHour, zonedTime } from "./user-time.js";

export const SAMPLE_DAYS = 42;
// What the reviewer's Settings → Data sources shows as read from Apple Health.
const CATEGORIES = ["sleep", "heart", "hrv", "resting", "breathing", "steps", "energy", "workouts", "body"];
const ID = "review:";

// The same numbers for the same day, every time (mulberry32 seeded by the date).
function randomFor(text) {
  let seed = 2166136261;
  for (const c of text) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const pad = n => String(n).padStart(2, "0");
// A wall-clock time of the reviewer's zone ("2026-11-04", 22.75 h) as a UTC instant.
const at = (date, hours) => {
  const day = addDays(date, Math.floor(hours / 24)), rest = hours - Math.floor(hours / 24) * 24;
  const h = Math.floor(rest), m = Math.round((rest - h) * 60);
  return zonedTime(`${day}T${pad(h)}:${pad(Math.min(m, 59))}:00`);
};
const iso = ms => new Date(ms).toISOString().replace(".000Z", "Z");
const round = (v, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits;

// The week of a rider who also runs, swims and lifts, Monday first. The order
// of sports is Ride, Run, Swim, Gym like everywhere in Aurin.
const WEEK = {
  1: { activity: "traditionalStrengthTraining", name: "Gym", start: 18, minutes: 55, kcal: 330, avgHr: 112, maxHr: 158 },
  2: { activity: "running", name: "Easy run", start: 7, minutes: 45, kcal: 520, avgHr: 142, maxHr: 166, km: 8.2, cadence: 168 },
  3: { activity: "swimming", name: "Pool swim", start: 7, minutes: 40, kcal: 380, avgHr: 128, maxHr: 152, km: 2 },
  4: { activity: "indoorCycling", name: "Threshold intervals", start: 18, minutes: 60, kcal: 720, avgHr: 148, maxHr: 172, power: 215, cadence: 90 },
  6: { activity: "cycling", name: "Long ride", start: 9, minutes: 150, kcal: 1650, avgHr: 134, maxHr: 168, km: 62, power: 172, cadence: 84, elevation: 640 },
  0: { activity: "running", name: "Long run", start: 8.5, minutes: 75, kcal: 860, avgHr: 145, maxHr: 170, km: 13.4, cadence: 170 }
};

// One night's stages in ~90-minute cycles: more deep sleep early, more REM late.
function night(date, random, quality) {
  const bed = 22.6 + random() * 0.6, asleep = bed + 0.15 + random() * 0.15;
  const length = 7.1 + random() * 0.7 - (1 - quality) * 1.4;
  const stages = [];
  let t = asleep;
  const push = (type, minutes) => { const end = t + minutes / 60; stages.push({ type, start: iso(at(date, t)), end: iso(at(date, end)) }); t = end; };
  for (let cycle = 0; t < asleep + length - 0.3; cycle++) {
    push("LIGHT", 20 + random() * 10);
    push("DEEP", Math.max(8, (32 - cycle * 7) * (0.7 + quality * 0.4)));
    push("LIGHT", 12 + random() * 8);
    push("REM", 12 + cycle * 6 + random() * 6);
    if (cycle === 2 || random() > 0.85 - (1 - quality) * 0.3) push("AWAKE", 2 + random() * 4);
  }
  const up = t + 0.1 + random() * 0.15;
  return { type: "sleep", id: ID + "sleep:" + date, start: iso(at(date, bed)), end: iso(at(date, up)), inBed: true, stages, wake: up };
}

function workout(date, plan, random) {
  const start = at(date, plan.start + random() * 0.4), seconds = Math.round(plan.minutes * 60 * (0.95 + random() * 0.1));
  const heartRate = [];
  for (let s = 0; s <= seconds; s += 30) {
    const warm = Math.min(1, s / 600), wave = Math.sin(s / 240) * 6;
    heartRate.push([s, Math.round(95 + (plan.avgHr - 95) * warm + wave + (random() - 0.5) * 6)]);
  }
  const record = {
    type: "exercise", id: ID + "workout:" + date, activity: plan.activity, name: plan.name, sourceName: "Sample data",
    start: iso(start), end: iso(start + seconds * 1000), activeSeconds: seconds,
    kcal: round(plan.kcal * (0.92 + random() * 0.16)), avgHr: plan.avgHr + Math.round((random() - 0.5) * 4), maxHr: plan.maxHr, heartRate
  };
  if (plan.km) record.distanceMeters = Math.round(plan.km * 1000 * (0.97 + random() * 0.06));
  if (plan.power) record.avgPower = Math.round(plan.power * (0.96 + random() * 0.08));
  if (plan.cadence) record.avgCadence = plan.cadence;
  if (plan.elevation) record.elevationGain = plan.elevation;
  if (plan.activity === "running") record.steps = Math.round(seconds / 60 * plan.cadence);
  return record;
}

// The records of one day ("YYYY-MM-DD" in the reviewer's zone): last night,
// the morning's values, that day's workout and its steps and energy per hour,
// all up to `now` (nothing in the future).
export function sampleDay(date, now) {
  const random = randomFor(date);
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  // A rough patch every so often (a late night after a hard day), so the
  // readiness moves between green, yellow and red like a real one does.
  const rough = random() < 0.18;
  const quality = rough ? 0.35 + random() * 0.2 : 0.75 + random() * 0.25;
  const records = [];
  const sleep = night(addDays(date, -1), random, quality);
  const wake = sleep.wake - 24;
  delete sleep.wake;
  if (Date.parse(sleep.end) <= now) {
    records.push(sleep);
    const daily = (type, value, extra = {}) => records.push({ type, id: ID + type + ":" + date, date, value, ...extra });
    daily("daily-resting-heart-rate", Math.round(52 + (1 - quality) * 6 + (random() - 0.5) * 3));
    daily("daily-heart-rate-variability", round(58 - (1 - quality) * 16 + (random() - 0.5) * 8, 1), { metric: "sdnn" });
    daily("daily-respiratory-rate", round(14.1 + (random() - 0.5) * 0.6, 1));
    daily("daily-oxygen-saturation", round(96.5 + random() * 1.5, 1));
    daily("daily-wear-hours", 22);
    if (weekday === 1) {
      daily("daily-vo2-max", round(47.5 + (random() - 0.5) * 0.8, 1));
      const time = at(date, wake + 0.3);
      if (time <= now) records.push({ type: "weight", id: ID + "weight:" + date, time: iso(time), value: round(76.4 + (random() - 0.5) * 0.8, 1) });
    }
  }
  const plan = WEEK[weekday];
  const session = plan ? workout(date, plan, random) : null;
  const done = session && Date.parse(session.end) <= now;
  if (done) records.push(session);
  // Steps and active energy per hour of the day that has passed, a walk to
  // work and back, more during a run.
  const zones = { LIGHT: 0, MODERATE: 0, VIGOROUS: 0 };
  for (let hour = 0; hour < 24; hour++) {
    const start = at(date, hour), end = at(date, hour + 1);
    if (end > now) break;
    const awake = hour >= Math.floor(wake) && hour < 23;
    let steps = awake ? 200 + random() * 300 : 0, kcal = awake ? 18 + random() * 14 : 2;
    if (awake && (hour === 8 || hour === 17)) { steps += 1800 + random() * 900; kcal += 60; }
    if (done) {
      const overlap = Math.max(0, Math.min(end, Date.parse(session.end)) - Math.max(start, Date.parse(session.start))) / 3600000;
      kcal += session.kcal * overlap / (session.activeSeconds / 3600);
      if (session.steps) steps += session.steps * overlap / (session.activeSeconds / 3600);
    }
    if (steps >= 1) records.push({ type: "steps", id: ID + "steps:" + date + "T" + pad(hour), start: iso(start), end: iso(end), value: Math.round(steps) });
    records.push({ type: "active-energy-burned", id: ID + "energy:" + date + "T" + pad(hour), start: iso(start), end: iso(end), value: round(kcal, 1) });
  }
  if (done) {
    const minutes = session.activeSeconds / 60;
    zones.LIGHT = minutes * 0.2; zones.MODERATE = minutes * (plan.avgHr < 135 ? 0.65 : 0.5); zones.VIGOROUS = minutes * (plan.avgHr < 135 ? 0.1 : 0.27);
    for (const [zone, value] of Object.entries(zones)) records.push({ type: "time-in-heart-rate-zone", id: ID + "zone:" + date + ":" + zone, start: iso(at(date, 0)), zone, minutes: round(value, 1) });
  }
  return records;
}

// The days from `days` ago up to today, in the reviewer's zone.
export function sampleRecords(now, days) {
  const today = localToday(new Date(now));
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(...sampleDay(addDays(today, -i), now));
  return out;
}

// Once an hour per isolate is enough: the request after that reads one row.
// The app's first screens ask at the same moment: they wait for one write.
const written = new Map(), writing = new Map();

// Fills the review account's sample: everything the first time (or after it
// was deleted), then today and yesterday. env is the account's own (env.DB
// scoped to it); the caller checks it is the review account. The first fill
// is awaited, so the first screens already show it; the hourly top-up goes to
// `later` (ctx.waitUntil) and the request does not wait for it.
export async function ensureReviewSample(env, { now = Date.now(), later = null } = {}) {
  if (!env?.DB || env.USER_ID == null) return null;
  const hour = localToday(new Date(now)) + "T" + pad(localHour(new Date(now)));
  if (written.get(env.USER_ID) === hour) return null;
  const key = env.USER_ID + "@" + hour;
  if (writing.has(key)) return writing.get(key);
  // Apple Health switched off in the app (DELETE /app/api/health/apple): no
  // more sample, or the next hour would show it connected again.
  const status = await env.DB.prepare("SELECT status FROM sync_status WHERE user_id = ? AND sync_name = 'apple_health'").bind(env.USER_ID).first().catch(() => null);
  if (status?.status === "disconnected") { written.set(env.USER_ID, hour); return null; }
  const oldest = addDays(localToday(new Date(now)), -(SAMPLE_DAYS - 2));
  const full = !(await env.DB.prepare("SELECT 1 AS found FROM health_datapoints WHERE user_id = ? AND source_family = 'apple-health' AND data_type = 'sleep' AND external_id = ?")
    .bind(env.USER_ID, "apple:" + ID + "sleep:" + addDays(oldest, -1)).first());
  if (writing.has(key)) return writing.get(key);
  const job = write(env, now, full ? SAMPLE_DAYS : 2).then(result => { written.set(env.USER_ID, hour); return result; }).finally(() => writing.delete(key));
  writing.set(key, job);
  if (!full && later) { later(job.catch(error => console.error("Review sample failed", error.message))); return null; }
  return job;
}

async function write(env, now, days) {
  const result = await saveAppleHealth(env.DB, env.USER_ID, { records: sampleRecords(now, days), categories: CATEGORIES }, { now });
  if (result?.changed) await bumpCacheVersion(env.DB);
  return result;
}

export const forgetWritten = () => { written.clear(); writing.clear(); };
