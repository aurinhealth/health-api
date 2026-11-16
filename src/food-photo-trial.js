// Aurin without Pro (paywall on, subscription.js) lets AI read FOOD_PHOTO_TRIAL
// photos of food a month, 5 unless set (Petr, 16 Nov 2026), like Lose It!'s
// Snap It taster. A photo counts once it gave a result to log: a meal, a
// portion or a label (routes-food.js). The package front and the barcode read
// on the way to one are free while photos are left, and a photo AI could not
// read is not counted. Words and the web lookup stay Pro (they search the web,
// up to 70 times the cost). The AI consent is needed as for any AI. The month
// is the account's own (limitToday, user-time.js).
import { limitToday } from './user-time.js';

const n = value => { const v = Number(value); return value !== undefined && value !== null && value !== '' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 5; };
export const foodPhotoTrialLimit = env => n(env?.FOOD_PHOTO_TRIAL);
const tracked = env => Boolean(env?.DB && Number(env.USER_ID) > 0);
const ensure = db => db.prepare('CREATE TABLE IF NOT EXISTS food_photo_trial (user_id INTEGER NOT NULL, month TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(user_id, month))').run();

// { limit, used, left } this month; null without an account.
export async function foodPhotoTrial(env) {
  if (!tracked(env)) return null;
  const limit = foodPhotoTrialLimit(env), month = (await limitToday(env)).slice(0, 7);
  await ensure(env.DB);
  const row = await env.DB.prepare('SELECT used FROM food_photo_trial WHERE user_id = ? AND month = ?').bind(env.USER_ID, month).first();
  const used = Number(row?.used) || 0;
  return { limit, used, left: Math.max(0, limit - used) };
}

// One more photo read this month; the new count.
export async function countFoodPhoto(env) {
  if (!tracked(env)) return null;
  const month = (await limitToday(env)).slice(0, 7);
  await ensure(env.DB);
  await env.DB.prepare('INSERT INTO food_photo_trial (user_id, month, used) VALUES (?, ?, 1) ON CONFLICT(user_id, month) DO UPDATE SET used = used + 1').bind(env.USER_ID, month).run();
  return foodPhotoTrial(env);
}
