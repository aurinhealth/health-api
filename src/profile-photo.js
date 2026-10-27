// The profile photo: a small square JPEG the app makes (at most 600 px,
// ios-native/Aurin/Design/Avatar.swift) and keeps with the account, so a new
// install, a new iPhone or signing in again shows it. One per user, deleted
// and exported with the account (PERSONAL_TABLES in tenancy.js).
import { L } from './lang.js';

export const MAX_PHOTO_BYTES = 256 * 1024;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const missingTable = error => /no such table/i.test(String(error?.message || error));

async function ensurePhoto(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS profile_photos (user_id INTEGER PRIMARY KEY, jpeg TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
}

// {jpeg: "<base64>"}: a JPEG, nothing else. Throws with a message for the user.
export function parseProfilePhoto(body = {}) {
  const jpeg = typeof body?.jpeg === 'string' ? body.jpeg.trim() : '';
  if (!jpeg || !BASE64.test(jpeg)) throw new Error(L('Chybí fotka.', 'The photo is missing.'));
  if (jpeg.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) throw new Error(L('Fotka je moc velká.', 'The photo is too large.'));
  // Every JPEG starts with FF D8 FF ("/9j/" in base64).
  if (!jpeg.startsWith('/9j/')) throw new Error(L('Fotka musí být JPEG.', 'The photo must be a JPEG.'));
  return jpeg;
}

// {jpeg, updatedAt}, or nulls when there is none.
export async function profilePhoto(db) {
  try {
    const row = await db.prepare("SELECT jpeg, updated_at FROM profile_photos WHERE user_id=?").bind(db.userId).first();
    return { jpeg: row?.jpeg || null, updatedAt: row?.updated_at || null };
  } catch (error) {
    if (!missingTable(error)) console.error('Profile photo read failed', error.message);
    return { jpeg: null, updatedAt: null };
  }
}

export async function saveProfilePhoto(db, body) {
  const jpeg = parseProfilePhoto(body);
  await ensurePhoto(db);
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO profile_photos(user_id,jpeg,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET jpeg=excluded.jpeg,updated_at=excluded.updated_at").bind(db.userId, jpeg, now).run();
  return { status: 'ok', updatedAt: now };
}

export async function removeProfilePhoto(db) {
  try { await db.prepare("DELETE FROM profile_photos WHERE user_id=?").bind(db.userId).run(); }
  catch (error) { if (!missingTable(error)) throw error; }
  return { status: 'ok' };
}
