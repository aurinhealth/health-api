// "Dnes se hodí lehčí den": the Today card when several of the night's values
// are outside the athlete's usual range. It speaks only of load and recovery,
// never of an illness (MDR, Today audit points 1, 12 and D2): the temperature
// in sleep (Apple Watch's wrist temperature or Google's skin temperature) or
// the breathing rate above the usual range must be one of them, with at least
// one more: HRV clearly under it or the resting heart rate clearly above it.
// A single value is not enough (athlete-state.js proactiveAdvice). The card
// offers an easy session of the same sport in place of today's hard one
// (coach-push.js easierSwap, /app/api/coach/nudge) or keeping the plan; the
// Sick status stays the athlete's own switch on Today.
import { L } from './lang.js';

const comma = (v, digits) => L(v.toFixed(digits).replace('.', ','), v.toFixed(digits));
const signed = (v, digits) => (v >= 0 ? '+' : '−') + comma(Math.abs(v), digits);
const vsUsual = () => L(' proti obvyklému', ' vs usual');

// The values outside the usual range in the readiness (recovery-model.js
// recoveryReadiness components), each as a row for the card.
export function nightOffValues(readiness) {
  const c = readiness?.components || {}, rows = [];
  let warm = false;
  if (c.wristTemp?.raised) { warm = true; rows.push({ id: 'temperature', label: L('Teplota zápěstí', 'Wrist temperature'), value: signed(c.wristTemp.deviation, 1) + ' °C' + vsUsual() }); }
  else if (c.skinTemp?.elevated) { warm = true; rows.push({ id: 'temperature', label: L('Teplota kůže', 'Skin temperature'), value: signed(c.skinTemp.deviation, 1) + ' °C' + vsUsual() }); }
  if (c.respiration?.elevated) { warm = true; rows.push({ id: 'respiration', label: L('Dech ve spánku', 'Breathing in sleep'), value: signed(c.respiration.value - c.respiration.baseline, 1) + ' /min' + vsUsual() }); }
  if (c.hrv?.z != null && c.hrv.z <= -1 && c.hrv.baseline > 0) rows.push({ id: 'hrv', label: 'HRV', value: signed((c.hrv.value / c.hrv.baseline - 1) * 100, 0) + ' %' + vsUsual() });
  if (c.restingHR?.z != null && c.restingHR.z >= 1) rows.push({ id: 'restingHR', label: L('Klidový tep', 'Resting heart rate'), value: signed(c.restingHR.value - c.restingHR.baseline, 0) + vsUsual() });
  return warm && rows.length >= 2 ? rows : [];
}

// The card for `date`, or null. offer: the swap of today's hard session
// (coach-push.js swapOffer) when there is one. Hidden once dismissed, or once
// the athlete swapped or kept today's session.
export function easierDayCard({ date, readiness, state = {}, offer = null }) {
  if ((state.status || 'active') !== 'active') return null;
  const id = date + ':easier';
  if ((state.dismissed || []).includes(id)) return null;
  if (state.nudge?.day === date && state.nudge.date === date && state.nudge.status && state.nudge.status !== 'pending') return null;
  const rows = nightOffValues(readiness);
  if (!rows.length) return null;
  return {
    id, kind: 'easier_day', headline: L('Dnes se hodí lehčí den', 'An easier day fits today'), reasons: [], rows,
    message: L('Několik nočních hodnot bylo mimo tvé obvyklé rozmezí. Může za tím být horko, alkohol, pozdní jídlo, stres nebo tvrdý trénink.',
      'Several night values were outside your usual range. Heat, alcohol, a late meal, stress or hard training can do this.'),
    ...(offer ? { date: offer.date, from: offer.from, to: offer.to } : {})
  };
}
