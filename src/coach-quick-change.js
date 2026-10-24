import { L } from './lang.js';
import { validDay } from './training-availability.js';
import { isHardSession, isHardKind } from './session-intensity.js';
import { hardDayConflict, holdBackToday } from './coach-actions.js';
import { trainingStatus } from './training-status.js';
import { trimGymPlan } from './gym-trim.js';
import { EASIER, HARDER, MIN_MINUTES, MAX_MINUTES, kindOfSystem } from './week-ai.js';
import { shiftDate } from './dashboard-shared.js';

// "Kratší · Delší · Lehčí · Těžší · Jiný den" under the coach's workout card
// (návrh 11, 2026-10-24): the card changes by rules, without the AI and
// without counting as a message. The coach's context of the moment is kept
// with the draft, so a change later checks the same days and the same morning.

export const QUICK_CHIPS = ['shorter', 'longer', 'easier', 'harder', 'day', 'undo'];
const DAYS_AHEAD = 7;
const RANK = { recovery: 0, endurance: 1, long: 1, tempo: 2, sweet_spot: 3, threshold: 4, vo2max: 5 };
const round5 = m => Math.round(m / 5) * 5;
const isWeekend = date => [0, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay());
const KIND_NAME = () => L({ recovery: 'regenerace', endurance: 'vytrvalost', long: 'dlouhý trénink', tempo: 'tempo', sweet_spot: 'sweet spot', threshold: 'práh', vo2max: 'VO2max' },
  { recovery: 'recovery', endurance: 'endurance', long: 'long session', tempo: 'tempo', sweet_spot: 'sweet spot', threshold: 'threshold', vo2max: 'VO2max' });
const WEEKDAY = () => L(['neděle', 'pondělí', 'úterý', 'středy', 'čtvrtka', 'pátku', 'soboty'], ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

// What a later change needs from the coach's context: each day's free time,
// the hard days, the rides and runs already planned, a red or ill morning.
export function quickSnapshot(context, today) {
  const days = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => shiftDate(today, i));
  const week = (context?.week?.days || []).filter(d => validDay(d.date));
  const budget = Object.fromEntries(days.map(d => [d, context?.availabilityByDate?.[d]?.minutes ?? null]));
  const hard = [...new Set(week.flatMap(d => [...(d.planned || []), ...(d.completed || [])].some(isHardSession) ? [d.date] : []))];
  const planned = week.filter(d => d.date >= today).flatMap(d => (d.planned || []).map(a => ({ date: d.date, sport: eventSportOf(a) })).filter(p => p.sport));
  return { today, days, budget, hard, planned, red: holdBackToday(context), paused: trainingStatus(context?.athleteState).paused };
}
const eventSportOf = a => { const t = String(a?.type || ''); return /run/i.test(t) ? 'run' : /ride|cycl|bike/i.test(t) ? 'ride' : ''; };

// The kind of the card's ride or run: the one asked for, else the workout's system.
export const kindOf = a => a.kind && RANK[a.kind] != null ? a.kind : kindOfSystem(a.preview?.workout?.primary_system, 'endurance');

const shorterMinutes = a => Math.max(MIN_MINUTES[a.sport] || 20, round5(a.minutes * 0.75));
function longerMinutes(a, quick) {
  const budget = quick?.budget?.[a.date];
  return Math.min(MAX_MINUTES[a.sport] || 300, round5(a.minutes * 1.25), budget > 0 ? budget : Infinity);
}
// A hard ride or run on a day: never on a red or ill morning, never next to another hard day.
const hardFits = (date, quick) => !(date === quick.today && quick.red) && !hardDayConflict(date, (quick.hard || []).filter(d => d !== date));

// Which choices the card offers, and the days "Jiný den" lists (a day it
// doesn't fit is there, but greyed).
export function quickOptions(a, quick) {
  if (a?.type !== 'workout' || !quick || quick.paused) return null;
  const gym = a.sport === 'gym', kind = gym ? null : kindOf(a);
  const hard = !gym && isHardKind(kind);
  const days = (quick.days || []).filter(d => d !== a.date && d >= quick.today).slice(0, 6).map(date => ({ date, fits: dayFits(a, date, quick, hard) }));
  return {
    shorter: shorterMinutes(a) < a.minutes,
    longer: !a.trim && longerMinutes(a, quick) > a.minutes,
    easier: gym ? true : EASIER[kind] !== kind,
    harder: !(gym ? quick.red && a.date === quick.today : HARDER[kind] === kind || !hardFits(a.date, quick)),
    day: !a.trim && days.some(d => d.fits),
    days
  };
}
function dayFits(a, date, quick, hard) {
  const budget = quick.budget?.[date];
  if (budget != null && budget < a.minutes) return false;
  if (a.sport !== 'gym' && (quick.planned || []).some(p => p.date === date && p.sport === a.sport)) return false;
  if (a.sport === 'gym' && date === quick.today && quick.red) return false;
  return !hard || hardFits(date, quick);
}

// The gym loads one step lighter (−10 %) or heavier (+5 %), on 2.5 kg plates.
export function scaleGymRows(rows, step) {
  if (!step) return rows;
  const factor = step < 0 ? 0.9 ** -step : 1.05 ** step;
  return rows.map(r => {
    const kg = Number(r?.[3]);
    if (r?.[0] !== 'WORK' || !(kg > 0)) return r;
    const next = Math.max(kg < 20 ? 1 : 2.5, Math.round(kg * factor / (kg < 20 ? 1 : 2.5)) * (kg < 20 ? 1 : 2.5));
    const out = r.slice(); out[3] = typeof r[3] === 'string' ? String(next) : next; return out;
  });
}

// The card's action after one choice, before its preview is built again.
// Throws when the choice doesn't apply; `change` is the line on the card.
export function quickChange(a, chip, quick, { date } = {}) {
  const options = quickOptions(a, quick);
  if (!options) throw new Error(L('Tenhle návrh se upravit nedá.', 'This proposal can\'t be changed.'));
  const out = { ...a }, kinds = KIND_NAME();
  if (chip === 'shorter' || chip === 'longer') {
    if (!options[chip]) throw new Error(chip === 'shorter' ? L('Kratší už to být nemůže.', 'It can\'t be any shorter.') : L('Delší trénink se do dne nevejde.', 'A longer session doesn\'t fit the day.'));
    out.minutes = chip === 'shorter' ? shorterMinutes(a) : longerMinutes(a, quick);
    if (a.trim) {
      const trimmed = trimGymPlan(a.trim.source, out.minutes);
      out.trim = trimmed ? { ...a.trim, values: trimmed.values, removed: trimmed.removed } : { ...a.trim, values: a.trim.source, removed: [] };
      if (a.loadStep) out.trim.values = scaleTrimValues(out.trim.values, a.loadStep);
    }
    const diff = Math.abs(out.minutes - a.minutes);
    return { action: out, change: chip === 'shorter' ? L('Kratší o ' + diff + ' min', diff + ' min shorter') : L('Delší o ' + diff + ' min', diff + ' min longer') };
  }
  if (chip === 'easier' || chip === 'harder') {
    if (!options[chip]) throw new Error(chip === 'easier' ? L('Lehčí to už být nemůže.', 'It can\'t be any easier.') : L('Těžší trénink dnes kouč nepřipraví.', 'The coach won\'t prepare a harder session for this day.'));
    if (a.sport === 'gym') {
      out.loadStep = Math.max(-3, Math.min(3, (a.loadStep || 0) + (chip === 'easier' ? -1 : 1)));
      if (out.loadStep === (a.loadStep || 0)) throw new Error(L('Víc už to upravit nejde.', 'It can\'t be changed any further.'));
      if (a.trim) out.trim = { ...a.trim, values: scaleTrimValues(a.trim.values, out.loadStep - (a.loadStep || 0)) };
      return { action: out, change: chip === 'easier' ? L('Lehčí váhy', 'Lighter weights') : L('Těžší váhy', 'Heavier weights') };
    }
    const from = kindOf(a), to = (chip === 'easier' ? EASIER : HARDER)[from];
    out.kind = a.sport === 'run' && to === 'sweet_spot' ? (chip === 'harder' ? 'threshold' : 'tempo') : to;
    delete out.workoutId; delete out.workoutName;
    // The athlete's own call, like asking again in the chat (Petr 2026-10-19).
    if (chip === 'harder') out.insisted = true;
    return { action: out, change: (chip === 'easier' ? L('Lehčí: ', 'Easier: ') : L('Těžší: ', 'Harder: ')) + kinds[out.kind] + L(' místo ', ' instead of ') + kinds[from] };
  }
  if (chip === 'day') {
    const day = options.days.find(d => d.date === date);
    if (!day?.fits) throw new Error(L('Na tenhle den se trénink nevejde.', 'The session doesn\'t fit that day.'));
    out.date = date;
    return { action: out, change: L('Přesunuto z ', 'Moved from ') + WEEKDAY()[new Date(a.date + 'T12:00:00Z').getUTCDay()] };
  }
  throw new Error(L('Neznámá úprava.', 'Unknown change.'));
}
const scaleTrimValues = (values, step) => {
  const header = values.findIndex(r => r?.[0] === 'Typ' && r?.[1] === 'Cvik');
  return header < 0 ? values : [...values.slice(0, header + 1), ...scaleGymRows(values.slice(header + 1), step)];
};

// The rebuilt preview went the way the choice asked (the generator may hold a
// hard session back): a ride or run of the asked kind, or at least a step that way.
export function previewFollows(chip, before, after) {
  if (!['easier', 'harder'].includes(chip) || after.sport === 'gym') return true;
  const was = RANK[kindOf(before)], now = RANK[kindOfSystem(after.preview?.workout?.primary_system, after.kind)];
  return chip === 'easier' ? now < was : now > was;
}

// The same choice a third time in a month, on a weekday or at the weekend:
// the coach remembers it. `history` is the earlier changes [{chip, weekend, draftId}].
const MEMORY = () => ({
  shorter: [L('Ve všední dny chce kratší tréninky.', 'Wants shorter sessions on weekdays.'), L('O víkendu chce kratší tréninky.', 'Wants shorter sessions at the weekend.')],
  longer: [L('Ve všední dny chce delší tréninky.', 'Wants longer sessions on weekdays.'), L('O víkendu chce delší tréninky.', 'Wants longer sessions at the weekend.')],
  easier: [L('Ve všední dny chce lehčí tréninky.', 'Wants easier sessions on weekdays.'), L('O víkendu chce lehčí tréninky.', 'Wants easier sessions at the weekend.')],
  harder: [L('Ve všední dny chce těžší tréninky.', 'Wants harder sessions on weekdays.'), L('O víkendu chce těžší tréninky.', 'Wants harder sessions at the weekend.')]
});
export const QUICK_MEMORY_TIMES = 3;
export function quickMemory(chip, date, history, memories = []) {
  const texts = MEMORY()[chip];
  if (!texts) return null;
  const weekend = isWeekend(date), text = texts[weekend ? 1 : 0];
  if (memories.includes(text)) return null;
  const drafts = new Set(history.filter(h => h.chip === chip && h.weekend === weekend).map(h => h.draftId));
  return drafts.size >= QUICK_MEMORY_TIMES ? text : null;
}
export const quickEntry = (chip, date, draftId) => ({ chip, weekend: isWeekend(date), draftId });
