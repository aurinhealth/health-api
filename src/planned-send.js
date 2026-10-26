import { L } from './lang.js';
import { localWorkout, syncIntervalsWorkout } from './local-workouts.js';
import { syncWahooWorkout, readWahooTokens } from './wahoo.js';
import { athleteThresholds } from './intervals-athlete.js';
import { eventIdOf } from './planned-events.js';
// "Send to" on a planned ride or run: where the plan went (Intervals.icu and
// Wahoo, as connected) and a send by hand when it did not arrive. Only the
// app's own plans (local_workouts) are sent; a plan that came from the
// Intervals.icu calendar is there already and never goes to Wahoo. Apple Watch
// and the .zwo file are the iPhone's own (WorkoutKit, the share sheet).

const RIDE_OR_RUN = /^(Virtual)?(Ride|Run)$|^(Gravel|MountainBike)Ride$/i;
const iso = v => { const t = Date.parse(String(v || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v || '')) ? '' : 'Z')); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

// One export row as the app shows it: sent (with when), sending, failed or not sent.
function stateOf(row, revision) {
  if (!row) return { status: 'notSent' };
  if (row.status === 'synced' && row.remote_id) return row.revision === revision ? { status: 'sent', at: iso(row.updated_at) } : { status: 'sending' };
  if (row.status === 'pending' || row.status === 'running') return { status: 'sending' };
  if (row.status === 'error' || row.status === 'failed') return { status: 'failed' };
  return { status: 'notSent' };
}

function connected(env) {
  return { intervals: Boolean(env.INTERVALS_API_KEY), wahoo: Boolean(readWahooTokens(env)) };
}

export async function plannedDestinations(env, eventId) {
  const id = eventIdOf(eventId);
  if (!id) throw new Error(L('Neplatný plánovaný trénink.', 'Invalid planned workout.'));
  const db = env.DB, userId = env.USER_ID ?? db.userId, on = connected(env);
  const row = /^local-/.test(id) ? await localWorkout(db, id).catch(() => null) : null;
  if (!row || row.status === 'deleted') {
    // From the Intervals.icu calendar: it is there, nothing to send.
    return { status: 'ok', own: false, destinations: on.intervals ? [{ id: 'intervals', status: 'origin' }] : [] };
  }
  let event = {};
  try { event = JSON.parse(row.event_json || '{}'); } catch { event = {}; }
  const exports = (await db.prepare('SELECT provider,remote_id,status,revision,updated_at FROM workout_exports WHERE user_id=? AND local_id=?').bind(userId, row.id).all()).results || [];
  const of = provider => exports.find(e => e.provider === provider);
  const destinations = [];
  if (on.wahoo && RIDE_OR_RUN.test(String(event.type || ''))) destinations.push({ id: 'wahoo', ...stateOf(of('wahoo'), row.revision) });
  if (on.intervals) destinations.push({ id: 'intervals', ...stateOf(of('intervals'), row.revision) });
  return { status: 'ok', own: true, destinations };
}

// The user's "Send again": the retry count starts over (an export given up
// after EXPORT_ATTEMPTS goes out again) and the plan is sent now, also when the
// destination had it already or Plánované tréninky is off for it.
export async function sendPlanned(env, { eventId, destination } = {}, fetchImpl = fetch) {
  const id = eventIdOf(eventId);
  if (!id || !['wahoo', 'intervals'].includes(destination)) throw new Error(L('Neplatný plánovaný trénink.', 'Invalid planned workout.'));
  const db = env.DB, userId = env.USER_ID ?? db.userId;
  const row = /^local-/.test(id) ? await localWorkout(db, id) : null;
  if (!row || row.status !== 'scheduled') throw new Error(L('Tenhle trénink se odeslat nedá.', 'This workout can\'t be sent.'));
  if (!connected(env)[destination]) throw new Error(destination === 'wahoo' ? L('Nejprve připoj Wahoo.', 'Connect Wahoo first.') : L('Nejprve připoj Intervals.icu.', 'Connect Intervals.icu first.'));
  await db.prepare("UPDATE workout_exports SET attempts=0 WHERE user_id=? AND local_id=? AND provider=? AND status!='running'").bind(userId, row.id, destination).run();
  const result = destination === 'wahoo'
    ? await syncWahooWorkout(env, row.id, { fetchImpl, force: true, thresholds: () => athleteThresholds(env, fetchImpl).catch(() => null) })
    : await syncIntervalsWorkout(env, row.id, fetchImpl, { force: true });
  const shown = await plannedDestinations(env, row.id);
  // 'pending': another send of the same plan is on its way right now.
  const sent = result.status === 'synced' || result.status === 'pending';
  return {
    ...shown,
    sent,
    ...(sent ? {} : { message: result.status === 'off'
      ? L('Trénink, který už proběhl, se neposílá.', 'A workout that\'s already past isn\'t sent.')
      : result.status === 'skipped' ? L('Tenhle trénink se odeslat nedá.', 'This workout can\'t be sent.')
      : destination === 'wahoo' ? L('Do Wahoo se to nepovedlo odeslat. Zkus to za chvíli.', 'Couldn\'t send it to Wahoo. Try again in a moment.') : L('Do Intervals.icu se to nepovedlo odeslat. Zkus to za chvíli.', 'Couldn\'t send it to Intervals.icu. Try again in a moment.') })
  };
}
