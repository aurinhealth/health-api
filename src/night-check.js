// "Dnes se hodí lehčí den": the Today card when several of the night's values
// are outside the athlete's usual range. It speaks only of load and recovery,
// never of an illness (MDR, Today audit points 1, 12 and D2): the temperature
// in sleep (Apple Watch's wrist temperature or Google's skin temperature) or
// the breathing rate above the usual range must be one of them, with at least
// one more: HRV clearly under it or the resting heart rate clearly above it.
// A single value is not enough (athlete-state.js proactiveAdvice). The card
// offers an easy session of the same sport in place of today's hard one
// (coach-push.js easierSwap, /app/api/coach/nudge) or keeping the plan; the
// Sick status stays the athlete's own switch on Today. The resting heart
// rate alone has its own card text (restingHRAbove).
import { L } from './lang.js';

const comma = (v, digits) => L(v.toFixed(digits).replace('.', ','), v.toFixed(digits));
const signed = (v, digits) => (v >= 0 ? '+' : '−') + comma(Math.abs(v), digits);
const vsUsual = () => L(' proti obvyklému', ' vs usual');
const hrvLow = c => c.hrv?.z != null && c.hrv.z <= -1 && c.hrv.baseline > 0;
const hrvRow = c => ({ id: 'hrv', label: 'HRV', value: signed((c.hrv.value / c.hrv.baseline - 1) * 100, 0) + ' %' + vsUsual() });
const restingRow = c => ({ id: 'restingHR', label: L('Klidový tep', 'Resting heart rate'), value: signed(c.restingHR.value - c.restingHR.baseline, 0) + L(' tepů/min', ' bpm') + vsUsual() });

// The values outside the usual range in the readiness (recovery-model.js
// recoveryReadiness components), each as a row for the card. The wrist
// temperature counts from +1 °C, the threshold of the morning verdict
// (day-verdict.js signs), so the card and the verdict read the night alike
// (audit 2026-11-06, 25.1); +0.5 °C only lowers the readiness a little.
export function nightOffValues(readiness) {
  const c = readiness?.components || {}, rows = [];
  let warm = false;
  if (c.wristTemp?.elevated) { warm = true; rows.push({ id: 'temperature', label: L('Teplota zápěstí', 'Wrist temperature'), value: signed(c.wristTemp.deviation, 1) + ' °C' + vsUsual() }); }
  else if (c.skinTemp?.elevated) { warm = true; rows.push({ id: 'temperature', label: L('Teplota kůže', 'Skin temperature'), value: signed(c.skinTemp.deviation, 1) + ' °C' + vsUsual() }); }
  if (c.respiration?.elevated) { warm = true; rows.push({ id: 'respiration', label: L('Dech ve spánku', 'Breathing in sleep'), value: signed(c.respiration.value - c.respiration.baseline, 1) + ' /min' + vsUsual() }); }
  if (hrvLow(c)) rows.push(hrvRow(c));
  if (c.restingHR?.z != null && c.restingHR.z >= 1) rows.push(restingRow(c));
  return warm && rows.length >= 2 ? rows : [];
}

// Today audit 14: the resting heart rate alone, as a load signal (not an
// illness): at least 2 usual spreads above its usual value two nights in a
// row, or one night with HRV under its usual range too. One night alone is
// not enough (Quer 2020: a fifth of people have a week with a swing of 10
// beats). Only against the source's own usual range (14 nights of its own):
// a range borrowed from another watch (restingHRMixed, provisional) would
// read a new watch's offset as a rise.
const ownRange = r => r && !(r.flags || []).includes('restingHRMixed') && !r.provisional;
export function restingHRAbove(readiness, yesterday = null) {
  const c = readiness?.components || {};
  if (!(c.restingHR?.z >= 2) || !ownRange(readiness)) return false;
  return (ownRange(yesterday) && yesterday.components?.restingHR?.z >= 2) || hrvLow(c);
}

// The card for `date`, or null. yesterday: the night before's readiness (for
// the resting heart rate). offer: the swap of today's hard session
// (coach-push.js swapOffer) when there is one. signal says which card it is. Hidden once dismissed, or once
// the athlete swapped or kept today's session, and on a day the verdict
// (day-verdict.js) calls hard: one verdict a morning (audit 2026-11-06, 25.1).
export function easierDayCard({ date, readiness, yesterday = null, state = {}, offer = null, verdict = null }) {
  if ((state.status || 'active') !== 'active' || verdict === 'hard') return null;
  const id = date + ':easier';
  if ((state.dismissed || []).includes(id)) return null;
  if (state.nudge?.day === date && state.nudge.date === date && state.nudge.status && state.nudge.status !== 'pending') return null;
  const night = nightOffValues(readiness), resting = !night.length && restingHRAbove(readiness, yesterday);
  if (!night.length && !resting) return null;
  return {
    id, kind: 'easier_day', signal: resting ? 'restingHR' : 'night', headline: L('Dnes se hodí lehčí den', 'An easier day fits today'), reasons: [],
    rows: resting ? [restingRow(readiness.components), ...(hrvLow(readiness.components) ? [hrvRow(readiness.components)] : [])] : night,
    message: resting
      ? L('Klidový tep je nad tvým obvyklým rozmezím. Může za tím být alkohol, horko, pozdní jídlo, stres nebo tvrdý trénink.',
        'Resting heart rate is above your usual range. Alcohol, heat, a late meal, stress or hard training can do this.')
      : L('Několik nočních hodnot bylo mimo tvé obvyklé rozmezí. Může za tím být horko, alkohol, pozdní jídlo, stres nebo tvrdý trénink.',
        'Several night values were outside your usual range. Heat, alcohol, a late meal, stress or hard training can do this.'),
    ...(offer ? { date: offer.date, from: offer.from, to: offer.to } : {})
  };
}
