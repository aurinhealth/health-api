// The app's own settings kept with the account (Nastavení: look, units,
// language, rest timer, reminders, "+" menu…): the iPhone sends them when the
// user leaves the app, and a fresh install takes them back after signing in,
// so deleting the app, a new iPhone or a new app keeps them. The server only
// stores them: one opaque property list per user, made and read by the app
// (ios-native/Loadwise/App/SettingsBackup.swift).
import { L } from './lang.js';

export const MAX_SETTINGS_BYTES = 64 * 1024;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const missingTable = error => /no such table/i.test(String(error?.message || error));

async function ensureSettings(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS app_settings (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
}

// {data: "<base64>"}. Throws with a message for the user.
export function parseAppSettings(body = {}) {
  const data = typeof body?.data === 'string' ? body.data.trim() : '';
  if (!data || !BASE64.test(data)) throw new Error(L('Chybí nastavení aplikace.', 'The app settings are missing.'));
  if (data.length > Math.ceil(MAX_SETTINGS_BYTES / 3) * 4) throw new Error(L('Nastavení aplikace je moc velké.', 'The app settings are too large.'));
  return data;
}

// {data, updatedAt}, or nulls before the first save.
export async function appSettings(db) {
  try {
    const row = await db.prepare("SELECT data, updated_at FROM app_settings WHERE user_id=?").bind(db.userId).first();
    return { data: row?.data || null, updatedAt: row?.updated_at || null };
  } catch (error) {
    if (!missingTable(error)) console.error('App settings read failed', error.message);
    return { data: null, updatedAt: null };
  }
}

export async function saveAppSettings(db, body) {
  const data = parseAppSettings(body);
  await ensureSettings(db);
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO app_settings(user_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at").bind(db.userId, data, now).run();
  return { status: 'ok', updatedAt: now };
}
