// Aurin without Pro (paywall on, subscription.js) lets AI read FOOD_PHOTO_TRIAL
// photos of food a month, 5 unless set (Petr, 16 Nov 2026), like Lose It!'s
// Snap It taster: a photo of a meal, a portion or a label (routes-food.js);
// one AI could not read is given back. The package front and the barcode read
// from a photo need Pro. Words and the web lookup stay Pro (they search the web,
// up to 70 times the cost). The AI consent is needed as for any AI. The month
// is the account's own (limitToday, user-time.js).
import { limitToday } from './user-time.js';

const n = value => { const v = Number(value); return value !== undefined && value !== null && value !== '' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 5; };
export const foodPhotoTrialLimit = env => n(env?.FOOD_PHOTO_TRIAL);
const tracked = env => Boolean(env?.DB && Number(env.USER_ID) > 0);
const ensure = db => db.prepare('CREATE TABLE IF NOT EXISTS food_photo_trial (user_id INTEGER NOT NULL, month TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(user_id, month))').run();
const monthOf = async env => (await limitToday(env)).slice(0, 7);
// The requests holding a photo of the month (claimFoodPhoto), so the AI call
// they make passes although that was the last one.
const held = new WeakSet();
export const holdsFoodPhoto = env => held.has(env);

// { limit, used, left } this month; null without an account.
export async function foodPhotoTrial(env) {
  if (!tracked(env)) return null;
  const limit = foodPhotoTrialLimit(env), month = await monthOf(env);
  await ensure(env.DB);
  const row = await env.DB.prepare('SELECT used FROM food_photo_trial WHERE user_id = ? AND month = ?').bind(env.USER_ID, month).first();
  const used = Number(row?.used) || 0;
  return { limit, used, left: Math.max(0, limit - used) };
}

// Takes one of the month's photos before AI reads it, in one write, so
// photos sent at once cannot go over; false when none is left.
export async function claimFoodPhoto(env) {
  const limit = foodPhotoTrialLimit(env);
  if (!tracked(env) || limit <= 0) return false;
  await ensure(env.DB);
  const r = await env.DB.prepare('INSERT INTO food_photo_trial (user_id, month, used) VALUES (?, ?, 1) ON CONFLICT(user_id, month) DO UPDATE SET used = used + 1 WHERE used < ?').bind(env.USER_ID, await monthOf(env), limit).run();
  if (!r?.meta?.changes) return false;
  held.add(env);
  return true;
}

// A photo AI could not read (or a failed call) gives its photo back.
export async function returnFoodPhoto(env) {
  if (!held.has(env)) return;
  held.delete(env);
  await env.DB.prepare('UPDATE food_photo_trial SET used = used - 1 WHERE user_id = ? AND month = ? AND used > 0').bind(env.USER_ID, await monthOf(env)).run();
}
