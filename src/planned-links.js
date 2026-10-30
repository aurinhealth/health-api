import { L } from './lang.js';
import { localWorkout } from './local-workouts.js';
// Two planned sessions of one day done one right after the other: a brick
// (the run straight off the bike), or any pair the athlete joins ("Hned po").
// The second carries `after` (the first's local id), the first `next`. Joined,
// the second starts when the first ends (+5 min to change), and the iPhone
// sends steady legs to the Apple Watch as one multisport workout. Only the
// app's own sessions link; Intervals.icu never sees the fields.
// Reads: the two rows by key; writes: the two events and their projections.

export const CHANGE_MINUTES = 5;
const ENDURANCE = /^(Virtual)?(Ride|Run)$|^(OpenWater)?Swim$/;
const dateOf = e => String(e?.start_date_local || '').slice(0, 10);
const clockOf = e => String(e?.start_date_local || '').slice(11, 16);
const localId = v => { const id = String(v || '').replace(/^planned:/, ''); return /^local-[a-f0-9]{1,64}$/.test(id) ? id : null; };

// The second leg's start: the first's start, its length and the change; none
// when the first has no time of day (midnight is Intervals.icu's "any time").
export function followingTime(first) {
  const clock = clockOf(first);
  if (!clock || clock === '00:00') return null;
  const [h, m] = clock.split(':').map(Number);
  const minutes = Math.min(23 * 60 + 59, h * 60 + m + Math.round((Number(first.moving_time) || 0) / 60) + CHANGE_MINUTES);
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}

async function read(db, id) {
  const row = id ? await localWorkout(db, id) : null;
  if (!row || row.status !== 'scheduled') return null;
  try { return { id: row.id, event: JSON.parse(row.event_json) }; } catch { return null; }
}

// The link fields only: no new revision, so nothing is exported again.
async function setFields(db, item, fields) {
  const event = { ...item.event };
  for (const [k, v] of Object.entries(fields)) { if (v == null) delete event[k]; else event[k] = v; }
  item.event = event;
  await db.batch([
    db.prepare('UPDATE local_workouts SET event_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=?').bind(JSON.stringify(event), db.userId, item.id),
    db.prepare("UPDATE health_datapoints SET payload_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND source_family='local' AND data_type='planned-workout' AND external_id=?").bind(JSON.stringify(event), db.userId, 'planned:' + item.id)
  ]);
}

// Clears the partner's side of a link this event had.
export async function unlinkPartners(db, item) {
  const before = item.event.after ? await read(db, item.event.after) : null;
  if (before && before.event.next === item.id) await setFields(db, before, { next: null });
  const after = item.event.next ? await read(db, item.event.next) : null;
  if (after && after.event.after === item.id) await setFields(db, after, { after: null });
  return { before, after };
}

// after: the session this one follows, or null to do it separately.
// move(id, date, time) sets the second leg's time (planned-events.js).
export async function linkPlanned(env, { eventId, after }, move) {
  const db = env.DB, id = localId(eventId);
  if (!id) throw new Error(L('Spojit jde jen tréninky naplánované v Aurinu.', 'Only workouts planned in Aurin can be joined.'));
  const second = await read(db, id);
  if (!second) throw new Error(L('Trénink nebyl nalezen.', 'The workout wasn\'t found.'));
  if (after == null) {
    const before = second.event.after ? await read(db, second.event.after) : null;
    if (before && before.event.next === id) await setFields(db, before, { next: null });
    if (second.event.after) await setFields(db, second, { after: null });
    return { status: 'ok', eventId: 'planned:' + id, after: null };
  }
  const firstId = localId(after);
  const first = firstId && firstId !== id ? await read(db, firstId) : null;
  if (!first) throw new Error(L('Trénink nebyl nalezen.', 'The workout wasn\'t found.'));
  if (dateOf(first.event) !== dateOf(second.event)) throw new Error(L('Hned po sobě jdou jen tréninky ze stejného dne.', 'Only workouts on the same day can follow each other.'));
  if (!ENDURANCE.test(String(first.event.type || '')) || !ENDURANCE.test(String(second.event.type || ''))) throw new Error(L('Hned po sobě jde kolo, běh a plavání.', 'Rides, runs and swims can follow each other.'));
  // Each session belongs to one pair: the old partners go free first.
  if (second.event.after && second.event.after !== first.id) { const old = await read(db, second.event.after); if (old && old.event.next === id) await setFields(db, old, { next: null }); }
  if (first.event.next && first.event.next !== id) { const old = await read(db, first.event.next); if (old && old.event.after === first.id) await setFields(db, old, { after: null }); }
  // The other way round before: swapped.
  await setFields(db, first, { next: id, ...(first.event.after === id ? { after: null } : {}) });
  await setFields(db, second, { after: first.id, ...(second.event.next === first.id ? { next: null } : {}) });
  const time = followingTime(first.event);
  if (move && clockOf(second.event) !== (time || '00:00')) await move(id, dateOf(first.event), time);
  return { status: 'ok', eventId: 'planned:' + id, after: 'planned:' + first.id, time };
}

// After a move: the first leg takes the second with it (same day, right
// after); the second moved on its own is done separately.
export async function followMove(env, id, previous, moved, move) {
  const db = env.DB, item = await read(db, id);
  if (!item) return null;
  if (previous?.after) {
    const before = await read(db, previous.after);
    if (before && before.event.next === id) await setFields(db, before, { next: null });
    await setFields(db, item, { after: null });
    return { unlinked: true };
  }
  if (previous?.next) {
    const second = await read(db, previous.next);
    if (!second || second.event.after !== id) { await setFields(db, item, { next: null }); return null; }
    await move(second.id, dateOf(moved), followingTime(moved));
    return { followed: 'planned:' + second.id };
  }
  return null;
}
