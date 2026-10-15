// The athlete's own say on the plans: a thumbs up or down for an exercise
// (the gym generator leaves out the disliked ones and prefers the liked ones
// a little) and, for any sport, how well a generated workout fitted.
import { L } from './lang.js';
import { normalizeExerciseName } from './strength-normalization.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SPORTS = new Set(['ride', 'run', 'strength', 'swim', 'walk', 'other']);
export const WORKOUT_RATINGS = ['good', 'ok', 'bad'];
const MAX_ITEMS = 30;
const missingTable = error => /no such table/i.test(String(error?.message || error));

async function ensurePreferences(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS exercise_preferences (user_id INTEGER NOT NULL, exercise TEXT NOT NULL, liked INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, exercise))").run();
}

async function ensureRatings(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS workout_ratings (user_id INTEGER NOT NULL, workout_date TEXT NOT NULL, session_id TEXT NOT NULL, sport TEXT NOT NULL, rating TEXT NOT NULL, note TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, workout_date, session_id))").run();
}

// {exercise, liked} or {items: [{exercise, liked}]}; liked true, false or
// null (no opinion any more). Throws with a message for the athlete.
export function parseExerciseFeedback(body = {}) {
  const list = Array.isArray(body?.items) ? body.items : [body];
  if (!list.length || list.length > MAX_ITEMS) throw new Error(L('Chybí cviky k hodnocení.', 'The exercises to rate are missing.'));
  const out = new Map();
  for (const item of list) {
    const exercise = normalizeExerciseName(String(item?.exercise ?? '').slice(0, 120));
    if (!exercise) throw new Error(L('Chybí název cviku.', 'The exercise name is missing.'));
    if (item?.liked !== true && item?.liked !== false && item?.liked != null) throw new Error(L('Hodnocení cviku je palec nahoru, nebo dolů.', 'An exercise is rated thumbs up or down.'));
    out.set(exercise, item.liked ?? null);
  }
  return [...out].map(([exercise, liked]) => ({ exercise, liked }));
}

export async function saveExerciseFeedback(db, body) {
  const items = parseExerciseFeedback(body);
  await ensurePreferences(db);
  const now = new Date().toISOString();
  for (const { exercise, liked } of items) {
    if (liked == null) await db.prepare("DELETE FROM exercise_preferences WHERE user_id=? AND exercise=?").bind(db.userId, exercise).run();
    else await db.prepare("INSERT INTO exercise_preferences(user_id,exercise,liked,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,exercise) DO UPDATE SET liked=excluded.liked,updated_at=excluded.updated_at").bind(db.userId, exercise, liked ? 1 : 0, now).run();
  }
  return { status: 'ok', items };
}

// The liked and disliked exercises; empty before the first rating.
export async function exercisePreferences(db) {
  try {
    const rows = (await db.prepare("SELECT exercise, liked FROM exercise_preferences WHERE user_id=?").bind(db.userId).all()).results || [];
    return { liked: rows.filter(r => Number(r.liked) === 1).map(r => String(r.exercise)), disliked: rows.filter(r => Number(r.liked) === 0).map(r => String(r.exercise)) };
  } catch (error) {
    if (!missingTable(error)) console.error('Exercise preferences read failed', error.message);
    return { liked: [], disliked: [] };
  }
}

// The candidates without the disliked ones, unless nothing else is left
// (the muscle still gets its exercise).
export function withoutDisliked(pool, disliked, nameOf = x => x) {
  const skip = disliked instanceof Set ? disliked : new Set((disliked || []).map(normalizeExerciseName));
  if (!skip.size) return pool;
  const kept = pool.filter(item => !skip.has(normalizeExerciseName(nameOf(item))));
  return kept.length ? kept : pool;
}

// {date, sessionId, sport, rating: good|ok|bad, text}: how well the generated
// workout fitted. Throws with a message for the athlete.
export function parseWorkoutRating(body = {}) {
  const date = String(body?.date || ''), rating = String(body?.rating || '');
  if (!DAY.test(date)) throw new Error(L('Neplatné datum.', 'Invalid date.'));
  if (!WORKOUT_RATINGS.includes(rating)) throw new Error(L('Vyber, jak ti trénink sedl.', 'Choose how the workout felt.'));
  const raw = String(body?.sport || 'other').toLowerCase(), sport = raw === 'gym' ? 'strength' : SPORTS.has(raw) ? raw : 'other';
  // The app's session id ("gym:<date>", an activity id, or a name for a session without one).
  const sessionId = String(body?.sessionId || '').replace(/[^A-Za-z0-9:._-]+/g, '_').slice(0, 120);
  const text = typeof body?.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 1000) : null;
  return { date, sessionId: sessionId || sport + ':' + date, sport, rating, text };
}

// One rating per session: rating it again replaces it.
export async function saveWorkoutRating(db, body) {
  const r = parseWorkoutRating(body);
  await ensureRatings(db);
  await db.prepare("INSERT INTO workout_ratings(user_id,workout_date,session_id,sport,rating,note,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,workout_date,session_id) DO UPDATE SET sport=excluded.sport,rating=excluded.rating,note=excluded.note,updated_at=excluded.updated_at")
    .bind(db.userId, r.date, r.sessionId, r.sport, r.rating, r.text, new Date().toISOString()).run();
  return { status: 'ok', ...r };
}

export async function workoutRatings(db, date) {
  if (!DAY.test(String(date || ''))) return [];
  try {
    const rows = (await db.prepare("SELECT workout_date, session_id, sport, rating, note FROM workout_ratings WHERE user_id=? AND workout_date=?").bind(db.userId, date).all()).results || [];
    return rows.map(r => ({ date: r.workout_date, sessionId: r.session_id, sport: r.sport, rating: r.rating, text: r.note || null }));
  } catch (error) {
    if (!missingTable(error)) console.error('Workout ratings read failed', error.message);
    return [];
  }
}

// The last ratings of a sport ("Sedělo ti sestavení?"), newest first, for the
// AI that builds or changes the next session of it.
export async function recentWorkoutRatings(db, { sport = null, since = null, limit = 6 } = {}) {
  try {
    const rows = (await db.prepare("SELECT workout_date, sport, rating, note FROM workout_ratings WHERE user_id=? AND (? IS NULL OR sport=?) AND (? IS NULL OR workout_date>=?) ORDER BY workout_date DESC LIMIT ?").bind(db.userId, sport, sport, since, since, limit).all()).results || [];
    return rows.map(r => ({ date: r.workout_date, sport: r.sport, rating: r.rating, text: r.note || null }));
  } catch (error) {
    if (!missingTable(error)) console.error('Workout ratings read failed', error.message);
    return [];
  }
}
