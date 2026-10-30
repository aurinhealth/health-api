// Zdroje dat → Health data → a type → Reads from: the types the user switched
// off for a service the server reads (Google Health, Ultrahuman, WHOOP). Apple
// Health's are its switches on the iPhone; workouts (Google, Intervals.icu,
// Wahoo) are the Tréninky switch (sync-destinations.js pullActivities).
// Off stops reading new data of that type; what Aurin has stays.
// Stored in sync_status 'read_off' as { google: ['heart', …], ultrahuman: […], whoop: […] }.

const NAME = 'read_off';

// The app's types (HealthCategory in AppleHealth.swift) by the data types each service writes.
const TYPES = {
  sleep: ['sleep', 'daily-sleep-temperature-derivations', 'daily-skin-temperature-deviation'],
  heart: ['heart-rate', 'time-in-heart-rate-zone', 'daily-heart-rate-zones'],
  hrv: ['heart-rate-variability', 'daily-heart-rate-variability'],
  resting: ['daily-resting-heart-rate'],
  breathing: ['daily-respiratory-rate', 'respiratory-rate-sleep-summary', 'oxygen-saturation', 'daily-oxygen-saturation'],
  steps: ['steps', 'distance', 'floors'],
  energy: ['active-energy-burned', 'total-calories', 'active-minutes', 'active-zone-minutes'],
  body: ['weight', 'body-fat'],
  // Google Health's food and drinks come in one import (google-food.js).
  food: ['food']
};
const TYPE_OF = Object.fromEntries(Object.entries(TYPES).flatMap(([type, list]) => list.map(t => [t, type])));

// What each service can give, in the app's types (what the switches are shown for).
export const READ_TYPES = {
  google: ['sleep', 'heart', 'hrv', 'resting', 'breathing', 'steps', 'energy', 'body', 'food'],
  ultrahuman: ['sleep', 'hrv', 'resting'],
  whoop: ['sleep', 'hrv', 'resting', 'breathing']
};

export const readTypeOf = dataType => TYPE_OF[dataType] || null;

// false when the user switched the app type of this data type off for the service.
export const readAllowed = (off, provider, dataType) => !(off?.[provider] || []).includes(TYPE_OF[dataType]);

export async function readReadOff(db, userId) {
  const out = { google: [], ultrahuman: [], whoop: [] };
  try {
    const row = await db.prepare('SELECT details_json FROM sync_status WHERE user_id = ? AND sync_name = ?').bind(userId, NAME).first();
    const saved = JSON.parse(row?.details_json || '{}') || {};
    for (const provider of Object.keys(out)) if (Array.isArray(saved[provider])) out[provider] = saved[provider].filter(t => READ_TYPES[provider].includes(t));
  } catch (error) {
    if (!/no such table/i.test(error.message)) console.error('Read switches read failed', error.message);
  }
  return out;
}

// { provider, type, on }: one switch.
export async function saveReadOff(db, userId, input = {}) {
  const { provider, type, on } = input || {};
  if (!READ_TYPES[provider]?.includes(type) || typeof on !== 'boolean') return { status: 'error', code: 400, message: 'Unknown source or type.' };
  const current = await readReadOff(db, userId);
  const list = new Set(current[provider]);
  if (on) list.delete(type); else list.add(type);
  const next = { ...current, [provider]: READ_TYPES[provider].filter(t => list.has(t)) };
  await db.prepare("CREATE TABLE IF NOT EXISTS sync_status (user_id INTEGER NOT NULL,sync_name TEXT NOT NULL,status TEXT,started_at TEXT,finished_at TEXT,details_json TEXT,updated_at TEXT,PRIMARY KEY(user_id,sync_name))").run();
  await db.prepare("INSERT INTO sync_status(user_id,sync_name,status,finished_at,details_json,updated_at) VALUES(?,?,'ok',datetime('now'),?,datetime('now')) ON CONFLICT(user_id,sync_name) DO UPDATE SET details_json=excluded.details_json,updated_at=excluded.updated_at")
    .bind(userId, NAME, JSON.stringify(next)).run();
  return { status: 'ok', off: next };
}
