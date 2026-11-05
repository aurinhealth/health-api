// "Kouč se ozve sám": the coach's own push, at most one a local day, on until
// Settings → Oznámení → Kouč is turned off (Petr, 2026-10-14). It speaks up when
//   - the athlete flew to another time zone (3 hours or more),
//   - in the morning, several night values are outside the usual range (an
//     easier day fits), or several signs say recovery lags before a hard session today or tomorrow; then the
//     push offers "Vyměnit" (an easy session in its place) and "Nechat",
//   - in the evening before a long or hard session.
// The phone answers the buttons through /app/api/coach/nudge (entrypoint.js).
import { L, plural } from './lang.js';
import { MIN_MINUTES } from './week-ai.js';
import { HARD_KINDS } from './session-intensity.js';

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

// The first hard ride or run of `days` among the upcoming sessions.
export function hardSession(upcoming = [], days = []) {
  return (upcoming || []).find(u => days.includes(u.date) && HARD_KINDS.has(u.kind) && MIN_MINUTES[u.sport]) || null;
}

// An easy session of the same sport in place of the hard one (/app/api/coach/nudge "swap").
export function easierSwap(hard) {
  const minutes = Math.max(MIN_MINUTES[hard.sport], round5(Math.min(EASY_MINUTES, hard.minutes || EASY_MINUTES)));
  const what = KIND_NAME()[hard.kind] || hard.name || L('trénink', 'session');
  return { eventId: hard.eventId, date: hard.date, sport: hard.sport, environment: hard.environment || 'outdoor', minutes, kind: 'endurance', name: hard.name || null, what, fromMinutes: hard.minutes || null };
}

// The message for this moment, or null:
// {kind, title, body, swap?: {eventId, date, sport, environment, minutes, kind, name}}.
// zone: {shift, changed} from the time-zone check; easier: night-check.js easierDayCard;
// recovery: proactiveAdvice; upcoming: ride and run sessions [{eventId, date,
// sport, name, minutes, kind, environment}]; sleep: the nights.
export function coachNudge({ date, hour, zone = null, easier = null, recovery = null, upcoming = [], sleep = [], morning = false, evening = false }) {
  if (hour < COACH_FROM_HOUR || hour >= COACH_TO_HOUR) return null;
  if (zone && Math.abs(zone.shift) >= ZONE_HOURS && zone.changed >= shift(date, -1)) {
    const h = Math.abs(zone.shift);
    return {
      kind: 'zone',
      title: L(`Jsi o ${h} ${plural(h, 'hodinu', 'hodiny', 'hodin')} jinde`, `Your clock moved by ${h} ${plural(h, '', '', '', 'hour', 'hours')}`),
      body: L('První dva dny ber tréninky lehce a spánek posouvej o hodinu denně.', 'Take the first two days easy and shift your sleep by an hour a day.')
    };
  }
  if (morning && hour < MORNING_TO_HOUR && easier) {
    // Load and recovery only, never an illness (Today audit 1, 12, D2): Today's card offers the easier day.
    return { kind: 'easier_day', title: easier.headline, body: L('Několik nočních hodnot bylo mimo tvé obvyklé rozmezí. Na Dnes můžeš dnešek ulehčit.', 'Several night values were outside your usual range. On Today you can make today easier.') };
  }
  if (morning && hour < MORNING_TO_HOUR && recovery) {
    const hard = hardSession(upcoming, [date, shift(date, 1)]);
    if (hard) {
      const nights = shortNights(sleep, date), swap = easierSwap(hard);
      const word = ['', '', L('Dvě', 'Two'), L('Tři', 'Three'), L('Čtyři', 'Four')][Math.min(nights, 4)] || '';
      const today = hard.date === date;
      const easy = hard.sport === 'run' ? L(`lehký běh ${swap.minutes} min`, `an easy ${swap.minutes} min run`) : L(`lehkou jízdu ${swap.minutes} min`, `an easy ${swap.minutes} min ride`);
      return {
        kind: 'recovery',
        title: nights >= 2 ? L(`${word} krátké noci za sebou`, `${word} short nights in a row`) : L('Tělo se ještě nezotavilo', "Your body hasn't recovered yet"),
        body: L(`${today ? 'Dnešní' : 'Zítřejší'} ${swap.what} vyměním za ${easy}?`, `Swap ${today ? "today's" : "tomorrow's"} ${swap.what} for ${easy}?`),
        swap
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

// The swap the morning push offered, as a card on Today until it is answered:
// "VO2max · 75 min → Lehká jízda · 45 min" with Vyměnit and Nechat.
export function swapOffer(state = {}, date) {
  const n = state?.nudge;
  if (!n || n.status !== 'pending' || n.day !== date || !n.date || n.date < date) return null;
  const easy = n.sport === 'run' ? L('Lehký běh', 'Easy run') : L('Lehká jízda', 'Easy ride');
  const from = (n.name || n.what || L('Trénink', 'Session')) + (n.fromMinutes ? ' · ' + n.fromMinutes + ' min' : '');
  return { kind: 'swap', id: date + ':swap', headline: n.title || L('Tělo se ještě nezotavilo', "Your body hasn't recovered yet"), date: n.day, from, to: easy + ' · ' + n.minutes + ' min' };
}
