// Moje poznámka: the athlete's own note on an exercise ("sedadlo 4, úzký
// úchop"), shown each time the exercise comes (Režim tréninku, its Další card
// in the rest, the exercise detail). One note per exercise; empty removes it.
import { L } from './lang.js';

export const MAX_NOTE = 300;
const missingTable = error => /no such table/i.test(String(error?.message || error));

async function ensureNotes(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS exercise_notes (user_id INTEGER NOT NULL, exercise TEXT NOT NULL, note TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, exercise))").run();
}

// {exercise, note}: the name as the plan has it, the note trimmed to one paragraph.
export function parseExerciseNote(body = {}) {
  const exercise = String(body?.exercise ?? '').trim().slice(0, 120);
  if (!exercise) throw new Error(L('Chybí název cviku.', 'The exercise name is missing.'));
  const note = String(body?.note ?? '').replace(/\s+/g, ' ').trim();
  if (note.length > MAX_NOTE) throw new Error(L(`Poznámka může mít nejvíc ${MAX_NOTE} znaků.`, `A note can have at most ${MAX_NOTE} characters.`));
  return { exercise, note };
}

// {"Leg press": "sedadlo 4"}: every note of the athlete.
export async function exerciseNotes(db) {
  try {
    const rows = (await db.prepare("SELECT exercise, note FROM exercise_notes WHERE user_id=?").bind(db.userId).all()).results || [];
    return Object.fromEntries(rows.map(r => [String(r.exercise), String(r.note)]));
  } catch (error) {
    if (!missingTable(error)) console.error('Exercise notes read failed', error.message);
    return {};
  }
}

export async function saveExerciseNote(db, body) {
  const { exercise, note } = parseExerciseNote(body);
  await ensureNotes(db);
  if (note) {
    await db.prepare("INSERT INTO exercise_notes(user_id,exercise,note,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,exercise) DO UPDATE SET note=excluded.note, updated_at=excluded.updated_at")
      .bind(db.userId, exercise, note, new Date().toISOString()).run();
  } else {
    await db.prepare("DELETE FROM exercise_notes WHERE user_id=? AND exercise=?").bind(db.userId, exercise).run();
  }
  return { status: 'ok', exercise, note };
}
