// What a chat message asks for: the day, the length and the kind of a ride or
// run ("45 min intervalů zítra", "jen 30 min na trenažéru", "v sobotu dlouhou
// jízdu"). The library offer for the coach is searched for this, not for
// today's recommendation (Revize doporučování tréninků 2026-10-16, nález 9).
// Each part is null when the message does not say it.
import { buildCyclingCoachV2 } from './cycling-coach-v2.js';
import { FOCUS_OF } from './week-ai.js';

const shift = (date, days) => new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const WEEKDAYS = [/neděl|sunday/i, /pondělí|pondeli|monday/i, /úterý|utery|tuesday/i, /střed|stred|wednesday/i, /čtvrt|ctvrt|thursday/i, /pátek|pátk|patek|patk|friday/i, /sobot|saturday/i];
const KINDS = [
  ['vo2max', /vo2|vo₂/i],
  ['threshold', /(?<!\p{L})pr[aá]h|threshold|ftp interval/iu],
  ['sweet_spot', /sweet\s*spot/i],
  ['tempo', /(?<!\p{L})tempo/iu],
  ['long', /dlouh\p{L}* (?:jízd|jizd|vyjížďk|vyjizdk|běh|beh)|long (?:ride|run)/iu],
  ['recovery', /regenera|recovery|vyjet(?!\p{L})|hodně lehce|very easy/iu],
  ['endurance', /vytrval|(?<!\p{L})z2(?!\p{L})|endurance|lehk\p{L}* (?:jízd|jizd|běh|beh)|easy (?:ride|run)/iu]
];

export function askedSession(message, today) {
  const m = String(message || '');
  let date = null;
  if (/pozítří|pozitri|day after tomorrow/i.test(m)) date = shift(today, 2);
  else if (/zítra|zitra|tomorrow/i.test(m)) date = shift(today, 1);
  else if (/(?<!\p{L})(?:dnes|dneska|today|tonight)(?!\p{L})/iu.test(m)) date = today;
  else {
    const dow = new Date(today + 'T12:00:00Z').getUTCDay(), hit = WEEKDAYS.findIndex(re => re.test(m));
    if (hit >= 0) date = shift(today, (hit - dow + 7) % 7);
  }
  const hours = m.match(/(\d+(?:[.,]\d)?)\s*(?:h(?!\p{L})|hod\p{L}*|hours?)/iu), mins = m.match(/(\d{2,3})\s*(?:min\p{L}*|')/iu);
  let minutes = mins ? Number(mins[1]) : hours ? Math.round(Number(hours[1].replace(',', '.')) * 60) : /(?<!\p{L})(?:hodinu|hodinku|an hour)(?!\p{L})/iu.test(m) ? 60 : /půl\s*hodin|pul\s*hodin|half an hour/i.test(m) ? 30 : null;
  if (minutes != null && (minutes < 15 || minutes > 480)) minutes = null;
  const kind = KINDS.find(([, re]) => re.test(m))?.[0] || null;
  return { date, minutes, kind };
}

// The library search for the chat: the asked day, length and kind through the
// coach's check for that day (the card goes the same way), else today's
// recommendation. `inputs` are the coach inputs (loadCoachInputs), `today` the
// coach already built for today.
export function chatLibraryQuery({ message, date, inputs = {}, sport = 'ride', todayCoach = null, availabilityMinutes = null }) {
  const asked = askedSession(message, date), day = asked.date && asked.date >= date ? asked.date : date;
  const coach = inputs.week && (day !== date || asked.minutes || asked.kind)
    ? buildCyclingCoachV2({ ...inputs, date: day, daily: inputs.week.days?.find(d => d.date === day)?.daily || inputs.daily, availabilityMinutes: asked.minutes || null, goal: asked.kind ? { focus: FOCUS_OF[asked.kind], asked: true } : null, sport })
    : todayCoach;
  const rec = coach?.recommendation?.session || {}, system = rec.kind === 'long_endurance' ? 'endurance' : rec.kind === 'vo2' ? 'vo2max' : rec.kind;
  return {
    date: day,
    query: { sport, system, durationMinutes: asked.minutes || rec.durationMinutes || availabilityMinutes || 90, durationTolerance: asked.minutes ? 10 : 20, limit: 8 },
    filters: { readiness: coach?.readiness?.status, hardBikeDaysRolling7d: coach?.load?.hardBikeDaysRolling7d, phase: coach?.constraints?.phase }
  };
}
