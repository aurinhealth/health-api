// "Možná na tebe něco leze": the Today card when the night shows signs that
// often come before an illness. A raised temperature in sleep (Apple Watch's
// wrist temperature or Google's skin temperature) or a raised breathing rate
// must be one of them, with at least one more: HRV clearly under the normal or
// the resting heart rate clearly above it. A single bad number is no sign
// (athlete-state.js proactiveAdvice), and the athlete decides: the card only
// offers to switch to Nemoc and to cancel the sessions until then.
import { L } from './lang.js';

const comma = (v, digits) => L(v.toFixed(digits).replace('.', ','), v.toFixed(digits));
const signed = (v, digits) => (v >= 0 ? '+' : '−') + comma(Math.abs(v), digits);

// The signs in the readiness (recovery-model.js recoveryReadiness components),
// each as a row for the card: what and how far from the athlete's normal.
export function illnessSigns(readiness) {
  const c = readiness?.components || {}, rows = [];
  let warm = false;
  if (c.wristTemp?.raised) { warm = true; rows.push({ id: 'temperature', label: L('Teplota zápěstí', 'Wrist temperature'), value: signed(c.wristTemp.deviation, 1) + ' °C' }); }
  else if (c.skinTemp?.elevated) { warm = true; rows.push({ id: 'temperature', label: L('Teplota kůže', 'Skin temperature'), value: signed(c.skinTemp.deviation, 1) + ' °C' }); }
  if (c.respiration?.elevated) { warm = true; rows.push({ id: 'respiration', label: L('Dech ve spánku', 'Breathing in sleep'), value: signed(c.respiration.value - c.respiration.baseline, 1) + L(' /min', ' /min') }); }
  if (c.hrv?.z != null && c.hrv.z <= -1 && c.hrv.baseline > 0) rows.push({ id: 'hrv', label: 'HRV', value: signed((c.hrv.value / c.hrv.baseline - 1) * 100, 0) + ' %' });
  if (c.restingHR?.z != null && c.restingHR.z >= 1) rows.push({ id: 'restingHR', label: L('Klidový tep', 'Resting heart rate'), value: signed(c.restingHR.value - c.restingHR.baseline, 0) });
  return warm && rows.length >= 2 ? rows : [];
}

// The card for `date`, or null. `week` gives the planned sessions the athlete
// may cancel (with an eventId, from today on); dismissing it hides it for the day.
export function illnessWarning({ date, readiness, state = {}, week = {} }) {
  if ((state.status || 'active') !== 'active') return null;
  const id = date + ':illness';
  if ((state.dismissed || []).includes(id)) return null;
  const rows = illnessSigns(readiness);
  if (!rows.length) return null;
  const sessions = (week.days || []).filter(d => d.date >= date)
    .flatMap(d => (d.daily?.training?.planned || []).filter(a => a?.id && !/nutrition/i.test(a.name || '')).map(a => ({ eventId: String(a.id), date: d.date, name: a.name || L('Trénink', 'Workout') })));
  return { id, kind: 'illness', headline: L('Možná na tebe něco leze', 'Something may be coming on'), reasons: [], rows, sessions, message: null };
}
