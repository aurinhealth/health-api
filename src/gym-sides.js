// One-sided exercises (Bulgarian split squat, one-arm row, an iso-lateral
// machine): their sets go left and right (L, P) so a weaker side shows. The
// plan gets them on its own; the app can switch an exercise back to both at once.
const ONE_SIDED = /bulhar|bulgarian|split squat|jednoru[čc]|jednono[žz]|jedn[ée]\s*(ruk|noh)|single[- ]?(arm|leg)|one[- ]?(arm|leg)|unilateral|iso[- ]?lateral|výpad|vypad|lunge|step[- ]?up|výstup|vystup|pistol|koncentrova|concentration|suitcase|copenhagen|kozákov|cossack/i;

export const oneSided = name => ONE_SIDED.test(String(name || ''));

const WORK = row => String(row?.[0] || 'WORK').toUpperCase() !== 'WARMUP';
const pad = (row, n) => Array.from({ length: n }, (_, i) => row?.[i] == null ? '' : row[i]);

// How each exercise was done last time: 'sides' or 'both'. The user's switch
// in the app wins over the guess by name next time too.
export function lastSideChoice(sets) {
  const latest = new Map();
  for (const s of sets || []) {
    if (!s.exercise) continue;
    const date = String(s.workout_date || s.date || '');
    const prev = latest.get(s.exercise);
    if (!prev || date > prev.date) latest.set(s.exercise, { date, sides: Boolean(s.side) });
    else if (date === prev.date && s.side) prev.sides = true;
  }
  return Object.fromEntries([...latest].map(([name, v]) => [name, v.sides ? 'sides' : 'both']));
}

// Plan rows (the sheet's columns, 13 = Strana): the work sets of an exercise
// done by sides (last time, else one-sided by its name) become an L and a P
// row each. weaker: exercise → 'L'|'P', the side that gets one set more
// (sideBalance) while it lags.
export function splitSides(rows, { columns = 14, weaker = {}, choice = {} } = {}) {
  const out = [];
  const extra = new Set();
  rows.forEach((row, i) => {
    const r = pad(row, columns), name = String(r[1] || '');
    const sides = choice[name] ? choice[name] === 'sides' : oneSided(name);
    if (!WORK(r) || !sides || String(r[13] || '').trim()) { out.push(r); return; }
    out.push([...r.slice(0, 13), 'L', ...r.slice(14)], [...r.slice(0, 13), 'P', ...r.slice(14)]);
    // After the exercise's last set: one more for the weaker side.
    const next = rows[i + 1];
    const side = weaker[name];
    if (side && !extra.has(name) && (!next || String(next[1] || '') !== name)) {
      extra.add(name);
      const n = String((Number(r[2]) || 0) + 1);
      out.push([...r.slice(0, 2), n, ...r.slice(3, 13), side, ...r.slice(14)]);
    }
  });
  return out;
}

// Left against right per exercise from history sets ({exercise, side,
// actualKg, actualReps, workout_date}), newest session first: the volume of
// each side in its last session with both, and the weaker side when it is
// more than 5 % behind.
export function sideBalance(sets) {
  const latest = new Map();
  for (const s of sets || []) {
    if (!s.side || !s.exercise) continue;
    const date = String(s.workout_date || s.date || '');
    const prev = latest.get(s.exercise);
    if (!prev || date > prev.date) latest.set(s.exercise, { date, L: 0, P: 0 });
    const cur = latest.get(s.exercise);
    if (cur.date !== date) continue;
    const kg = Number(s.actualKg ?? s.actual_kg) || 0, reps = Number(s.actualReps ?? s.actual_reps) || 0;
    cur[s.side] += (kg > 0 ? kg : 1) * reps;
  }
  const out = [];
  for (const [exercise, v] of latest) {
    if (!(v.L > 0 && v.P > 0)) continue;
    const strong = Math.max(v.L, v.P), gap = Math.round((1 - Math.min(v.L, v.P) / strong) * 100);
    out.push({ exercise, date: v.date, left: Math.round(v.L), right: Math.round(v.P), gap, weaker: gap > 5 ? (v.L < v.P ? 'L' : 'P') : null });
  }
  return out.sort((a, b) => b.gap - a.gap);
}
