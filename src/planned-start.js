// When a planned ride or run starts on the calendars it goes to (Intervals.icu,
// Wahoo, the app): the hour the athlete usually starts this sport, else late
// afternoon. (Week plan time windows are retired: availability is minutes only.)
import { localDateTime } from './user-time.js';

export const DEFAULT_START = '17:00';
const clock = minutes => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');

// The median start of the sport's activities in the last 60 days, to the half hour.
export function usualStart(starts = []) {
  const minutes = starts.map(s => { const m = String(localDateTime(s)).match(/T(\d{2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; })
    .filter(m => m != null && m >= 300 && m <= 1320).sort((a, b) => a - b);
  if (minutes.length < 3) return null;
  const mid = minutes[Math.floor(minutes.length / 2)];
  return clock(Math.min(1410, Math.round(mid / 30) * 30));
}

export async function plannedStart(db, date, sport = 'ride') {
  try {
    const since = new Date(Date.parse(date + 'T12:00:00Z') - 60 * 86400000).toISOString().slice(0, 10);
    const type = sport === 'run' ? '%"type":"%Run"%' : '%"type":"%Ride"%';
    const rows = await db.prepare("SELECT start_time FROM health_datapoints WHERE user_id=? AND data_type='activity' AND start_time>=? AND payload_json LIKE ? ORDER BY start_time DESC LIMIT 40").bind(db.userId, since, type).all();
    const usual = usualStart((rows.results || []).map(r => r.start_time));
    if (usual) return usual;
  } catch { /* no history */ }
  return DEFAULT_START;
}
