import { L } from './lang.js';
import { parseStrengthPlan } from './strength-history.js';
import { EXERCISES } from './strength-generator.js';
import { estimateStrengthTiming } from './strength-timing.js';

// "Uprav dnešní cvičení, mám jen 30 min" (Revize 2026-10-16, nález 23): the
// day's stored gym plan shortened, not a new plan. The plan's order stays (the
// big lifts come first): exercises not started go from the end, then their
// sets down to two, until the estimate fits. Logged sets are never touched.
// Returns the shortened values, or null when nothing can or needs to change.
export function trimGymPlan(values, minutes) {
  if (!Array.isArray(values) || !(minutes > 0)) return null;
  let parsed; try { parsed = parseStrengthPlan(values); } catch { return null; }
  const header = values.findIndex(r => r?.[0] === 'Typ' && r?.[1] === 'Cvik');
  if (header < 0 || !parsed.rows.length) return null;
  const head = values.slice(0, header + 1), rows = values.slice(header + 1).filter(r => r?.[1]);
  const logged = name => parsed.rows.some(r => r.exercise === name && (r.completed || r.actualKg != null || r.actualReps != null || r.rpe != null));
  const fits = list => estimateStrengthTiming(list, EXERCISES, minutes).estimatedMinutes <= minutes;
  if (fits(rows)) return null;
  let kept = rows.slice();
  const names = () => [...new Set(kept.filter(r => r[0] === 'WORK').map(r => r[1]))];
  // Whole exercises from the end, keeping at least two.
  for (const name of names().reverse()) {
    if (fits(kept) || names().length <= 2) break;
    if (!logged(name)) kept = kept.filter(r => r[1] !== name);
  }
  // Then one work set at a time from the last exercises, down to two sets each.
  for (let changed = true; changed && !fits(kept);) {
    changed = false;
    for (const name of names().reverse()) {
      const work = kept.filter(r => r[0] === 'WORK' && r[1] === name);
      if (work.length > 2 && !logged(name)) { kept = kept.filter(r => r !== work.at(-1)); changed = true; break; }
    }
  }
  if (kept.length === rows.length) return null;
  const timing = estimateStrengthTiming(kept, EXERCISES, minutes);
  const out = head.map(r => r.slice());
  const timingRow = out.findIndex(r => r?.[0] === 'Časový limit (min)');
  if (timingRow >= 0) out[timingRow] = ['Časový limit (min)', minutes, 'Odhad (min)', timing.estimatedMinutes];
  return { values: [...out, ...kept.map(r => r.slice())], estimatedMinutes: timing.estimatedMinutes,
    removed: [...new Set(rows.map(r => r[1]))].filter(name => !kept.some(r => r[1] === name)),
    name: L('Dnešní plán zkrácený na ' + minutes + ' min', 'Today\'s plan shortened to ' + minutes + ' min') };
}
