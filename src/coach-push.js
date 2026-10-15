// "Kouč se ozve sám": the coach's own push, at most one a local day, on until
// Settings → Oznámení → Kouč is turned off (Petr, 2026-10-14). It speaks up when
//   - the athlete flew to another time zone (3 hours or more),
//   - in the morning, the night shows signs of an oncoming illness, or several
//     signs say recovery lags before a hard session today or tomorrow; then the
//     push offers "Vyměnit" (an easy session in its place) and "Nechat",
//   - in the evening before a long or hard session.
// The phone answers the buttons through /app/api/coach/nudge (entrypoint.js).
import { L, plural } from './lang.js';
import { HARD_KINDS, MIN_MINUTES } from './week-ai.js';

export const COACH_PUSH = 'coach';
// The phone's notification category with "Vyměnit" and "Nechat" (PushRegistration.swift).
export const COACH_SWAP_CATEGORY = 'COACH_SWAP';
export const COACH_FROM_HOUR = 7;
export const COACH_TO_HOUR = 21;
export const EVENING_FROM_HOUR = 17;
const MORNING_TO_HOUR = 11;
const ZONE_HOURS = 3;
const EASY_MINUTES = 60;
// A long session: the night before it needs carbohydrates.
const LONG_MINUTES = { ride: 150, run: 90 };

const round5 = m => Math.round(m / 5) * 5;
const shift = (day, days) => new Date(Date.parse(day + 'T12:00:00Z') + days * 864e5).toISOString().slice(0, 10);
const KIND_NAME = () => ({ tempo: L('tempo', 'tempo'), sweet_spot: L('sweet spot', 'sweet spot'), threshold: L('práh', 'threshold'), vo2max: 'VO2max', long: L('dlouhý trénink', 'long session') });

// Nights in a row, up to `date`, shorter than six hours or 45 minutes under the
// two weeks before.
export function shortNights(sleep = [], date) {
  const nights = (Array.isArray(sleep) ? sleep : []).filter(s => s && s.nap !== true && Number(s.durationMin) > 0);
  const byDate = new Map(nights.map(s => [s.date, Number(s.durationMin)]));
  let count = 0;
  for (let d = date; byDate.has(d); d = shift(d, -1)) {
    const usual = nights.filter(s => s.date < d && s.date >= shift(d, -14)).map(s => Number(s.durationMin));
    const mean = usual.length ? usual.reduce((a, b) => a + b, 0) / usual.length : null;
    const minutes = byDate.get(d);
    if (!(minutes < 360 || (mean != null && minutes <= mean - 45))) break;
    count++;
  }
  return count;
}

// How many hours the athlete moved: the offset of the new zone minus the old one.
export function zoneShiftHours(fromOffsetMs, toOffsetMs) {
  return Math.round((toOffsetMs - fromOffsetMs) / 36e5);
}

// The message for this moment, or null:
// {kind, title, body, swap?: {eventId, date, sport, environment, minutes, kind, name}}.
// zone: {shift, changed} from the time-zone check; illness: illnessWarning;
// recovery: proactiveAdvice; upcoming: ride and run sessions [{eventId, date,
// sport, name, minutes, kind, environment}]; sleep: the nights.
export function coachNudge({ date, hour, zone = null, illness = null, recovery = null, upcoming = [], sleep = [], morning = false, evening = false }) {
  if (hour < COACH_FROM_HOUR || hour >= COACH_TO_HOUR) return null;
  if (zone && Math.abs(zone.shift) >= ZONE_HOURS && zone.changed >= shift(date, -1)) {
    const h = Math.abs(zone.shift);
    return {
      kind: 'zone',
      title: L(`Jsi o ${h} ${plural(h, 'hodinu', 'hodiny', 'hodin')} jinde`, `Your clock moved by ${h} ${plural(h, '', '', '', 'hour', 'hours')}`),
      body: L('První dva dny ber tréninky lehce a spánek posouvej o hodinu denně.', 'Take the first two days easy and shift your sleep by an hour a day.')
    };
  }
  if (morning && hour < MORNING_TO_HOUR && illness) {
    return { kind: 'illness', title: illness.headline, body: L('Na Dnes můžeš přepnout na Nemoc a zrušit tréninky do té doby.', 'On Today you can switch to Sick and cancel the sessions until then.') };
  }
  if (morning && hour < MORNING_TO_HOUR && recovery) {
    const hard = upcoming.find(u => (u.date === date || u.date === shift(date, 1)) && HARD_KINDS.has(u.kind) && MIN_MINUTES[u.sport]);
    if (hard) {
      const nights = shortNights(sleep, date), minutes = Math.max(MIN_MINUTES[hard.sport], round5(Math.min(EASY_MINUTES, hard.minutes || EASY_MINUTES)));
      const word = ['', '', L('Dvě', 'Two'), L('Tři', 'Three'), L('Čtyři', 'Four')][Math.min(nights, 4)] || '';
      const today = hard.date === date, what = KIND_NAME()[hard.kind] || hard.name || L('trénink', 'session');
      const easy = hard.sport === 'run' ? L(`lehký běh ${minutes} min`, `an easy ${minutes} min run`) : L(`lehkou jízdu ${minutes} min`, `an easy ${minutes} min ride`);
      return {
        kind: 'recovery',
        title: nights >= 2 ? L(`${word} krátké noci za sebou`, `${word} short nights in a row`) : L('Tělo se ještě nezotavilo', "Your body hasn't recovered yet"),
        body: L(`${today ? 'Dnešní' : 'Zítřejší'} ${what} vyměním za ${easy}?`, `Swap ${today ? "today's" : "tomorrow's"} ${what} for ${easy}?`),
        swap: { eventId: hard.eventId, date: hard.date, sport: hard.sport, environment: hard.environment || 'outdoor', minutes, kind: 'endurance', name: hard.name || null }
      };
    }
  }
  if (evening && hour >= EVENING_FROM_HOUR) {
    const tomorrow = shift(date, 1);
    const key = upcoming.find(u => u.date === tomorrow && (u.kind === 'long' || (u.minutes || 0) >= (LONG_MINUTES[u.sport] || Infinity)))
      || upcoming.find(u => u.date === tomorrow && HARD_KINDS.has(u.kind));
    if (key) {
      const long = !HARD_KINDS.has(key.kind);
      return {
        kind: 'key_session',
        title: L('Zítra ', 'Tomorrow: ') + (key.name || KIND_NAME()[key.kind] || L('klíčový trénink', 'a key session')),
        body: long ? L('Dnes jen klid a víc sacharidů k večeři.', 'Keep today easy and add carbohydrates to dinner.') : L('Dnes jen klid a do postele včas, ať zítřejší intervaly sednou.', 'Keep today easy and get to bed on time, so tomorrow\'s intervals go well.')
      };
    }
  }
  return null;
}
