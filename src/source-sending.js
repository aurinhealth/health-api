// Zdroje dat → Health data: the number by each type counts the sources that
// really send it. A source counts when its switch is on (the app knows) and it
// sent data of the type in the last DAYS days (here, for the services the
// server reads; Apple Health's apps and devices are asked on the iPhone).
// Kept in sync_status 'read_sending' and worked out again at most once an hour,
// so opening the page reads one row; the work is one LIMIT 1 seek on
// idx_health_datapoints_user_day per service and type (about 20 rows).

import { TYPES, READ_TYPES } from './source-reading.js';

const NAME = 'read_sending';
export const SENDING_DAYS = 7;
const FRESH_MS = 60 * 60 * 1000;

// Where each service's rows are (source_family) and which of its data types are workouts.
const FAMILIES = {
  google: ['google-wearables', 'google-sources', 'all-sources'],
  ultrahuman: ['ultrahuman'],
  whoop: ['whoop'],
  intervals: ['intervals'],
  wahoo: ['wahoo']
};
const WORKOUTS = { google: ['exercise'], intervals: ['activity'], wahoo: ['activity'] };

// [provider, app type, data types] for every pair asked.
export function sendingChecks() {
  const out = [];
  for (const [provider, types] of Object.entries(READ_TYPES)) {
    // Google's food comes in through the food diary, not health_datapoints (googleFoodSent).
    for (const type of types) if (!(provider === 'google' && type === 'food')) out.push([provider, type, TYPES[type]]);
  }
  for (const [provider, list] of Object.entries(WORKOUTS)) out.push([provider, 'workouts', list]);
  return out;
}

const dayAgo = (now, days) => new Date(now - days * 86400000).toISOString().slice(0, 10);
const marks = list => list.map(() => '?').join(',');

// Google Health's food and drinks: the last recent sync that found any (index.js
// syncGoogleRecent keeps its result in sync_status 'google_recent').
async function googleFoodSent(db, userId) {
  const row = await db.prepare("SELECT details_json, updated_at FROM sync_status WHERE user_id = ? AND sync_name = 'google_recent'").bind(userId).first();
  const food = (JSON.parse(row?.details_json || '{}')?.results || []).find(r => r?.type === 'food');
  return food?.status === 'ok' && Number(food.saved) > 0 ? String(row.updated_at || '') : null;
}

export async function computeSending(db, userId, { now = Date.now(), before = {} } = {}) {
  const since = dayAgo(now, SENDING_DAYS);
  const checks = sendingChecks();
  const results = await db.batch(checks.map(([provider, , dataTypes]) => {
    const families = FAMILIES[provider];
    return db.prepare(`SELECT 1 AS found FROM health_datapoints WHERE user_id = ? AND source_family IN (${marks(families)}) AND data_type IN (${marks(dataTypes)}) AND COALESCE(sample_time,end_time,start_time) >= ? LIMIT 1`)
      .bind(userId, ...families, ...dataTypes, since);
  }));
  const out = Object.fromEntries(Object.keys(FAMILIES).map(p => [p, []]));
  checks.forEach(([provider, type], i) => { if (results[i]?.results?.length) out[provider].push(type); });
  // Food found by a sync stays counted for DAYS days after it.
  const foodAt = (await googleFoodSent(db, userId).catch(() => null)) || before.googleFoodAt || null;
  if (foodAt && foodAt.slice(0, 10) >= since) out.google.push('food');
  return { at: new Date(now).toISOString(), ...out, googleFoodAt: foodAt };
}

// { days, sending: { google: ['sleep', …], ultrahuman: […], whoop: […], intervals: ['workouts'], wahoo: […] } }
export async function readSending(db, userId, { now = Date.now() } = {}) {
  let saved = {};
  try {
    const row = await db.prepare('SELECT details_json FROM sync_status WHERE user_id = ? AND sync_name = ?').bind(userId, NAME).first();
    saved = JSON.parse(row?.details_json || '{}') || {};
  } catch (error) {
    if (!/no such table/i.test(error.message)) throw error;
  }
  if (!(Date.parse(saved.at) > now - FRESH_MS)) {
    try {
      saved = await computeSending(db, userId, { now, before: saved });
    } catch (error) {
      // No health rows yet (a new account): nothing is sending.
      if (!/no such table/i.test(error.message)) throw error;
      return { status: 'ok', days: SENDING_DAYS, sending: Object.fromEntries(Object.keys(FAMILIES).map(p => [p, []])) };
    }
    await db.prepare("CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))").run();
    await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,'ok',datetime('now'),?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET finished_at=excluded.finished_at,details_json=excluded.details_json,updated_at=excluded.updated_at")
      .bind(userId, NAME, JSON.stringify(saved)).run();
  }
  const sending = Object.fromEntries(Object.keys(FAMILIES).map(p => [p, Array.isArray(saved[p]) ? saved[p] : []]));
  return { status: 'ok', days: SENDING_DAYS, sending };
}
