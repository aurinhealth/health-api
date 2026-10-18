// Rekordy: the exercises the athlete pinned to the top of the gym records, at
// most five, in the order they were pinned. Only a view preference; the
// generator's thumbs live in exercise-feedback.js.
import { L } from './lang.js';
import { normalizeExerciseName } from './strength-normalization.js';

export const MAX_PINNED = 5;
const missingTable = error => /no such table/i.test(String(error?.message || error));

async function ensurePinned(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS pinned_exercises (user_id INTEGER NOT NULL, exercise TEXT NOT NULL, position INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, exercise))").run();
}

// {pinned: ["Dřep", …]}: the whole list. Throws with a message for the athlete.
export function parsePinned(body = {}) {
  if (!Array.isArray(body?.pinned)) throw new Error(L('Chybí seznam připnutých cviků.', 'The list of pinned exercises is missing.'));
  const names = [...new Set(body.pinned.map(name => normalizeExerciseName(String(name ?? '').slice(0, 120))).filter(Boolean))];
  if (names.length > MAX_PINNED) throw new Error(L(`Připnout jde nejvíc ${MAX_PINNED} cviků.`, `You can pin at most ${MAX_PINNED} exercises.`));
  return names;
}

export async function pinnedExercises(db) {
  try {
    const rows = (await db.prepare("SELECT exercise FROM pinned_exercises WHERE user_id=? ORDER BY position").bind(db.userId).all()).results || [];
    return rows.map(r => String(r.exercise));
  } catch (error) {
    if (!missingTable(error)) console.error('Pinned exercises read failed', error.message);
    return [];
  }
}

export async function savePinnedExercises(db, body) {
  const names = parsePinned(body);
  await ensurePinned(db);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM pinned_exercises WHERE user_id=?").bind(db.userId),
    ...names.map((exercise, position) => db.prepare("INSERT INTO pinned_exercises(user_id,exercise,position,updated_at) VALUES(?,?,?,?)").bind(db.userId, exercise, position, now))
  ]);
  return { status: 'ok', pinned: names };
}
