import { L } from './lang.js';
// Include both sides of unilateral work, equipment setup, rests and gym delays.
// Rests are counted between sets of an exercise; moving to the next exercise
// is a changeover (setting up the station) instead of a full rest.
export function estimateStrengthTiming(rows, catalog, requestedMinutes = 60) {
  let workSeconds = 0, warmupSeconds = 0, restSeconds = 0;
  const exercises = [...new Set(rows.map(r => r[1]))], groups = new Map();
  rows.forEach((r, i) => {
    const def = catalog[r[1]] || {}, warm = r[0] === 'WARMUP';
    const reps = Math.max(...(String(r[4]).match(/\d+/g) || ['12']).map(Number));
    const seconds = Math.max(25, reps * 3.5) * (def.unilateral ? 2 : 1) + 10;
    if (warm) warmupSeconds += seconds; else workSeconds += seconds;
    const last = rows[i + 1]?.[1] !== r[1];
    const rest = warm ? 45 : Number(String(r[9] || '').match(/\[Pauza (\d+) s\]/)?.[1]) || 90;
    if (r[12] && !warm) { const key = r[12] + ':' + r[2]; groups.set(key, Math.max(groups.get(key) || 0, rest)); }
    else if (!last) restSeconds += rest;
  });
  // A superset rests once per round, after both exercises.
  restSeconds += [...groups.values()].reduce((a, b) => a + b, 0);
  const setupSeconds = 240 + exercises.length * 90;
  const bufferSeconds = Math.max(180, Math.round(requestedMinutes * 60 * .05));
  const totalSeconds = Math.round(workSeconds + warmupSeconds + restSeconds + setupSeconds + bufferSeconds);
  return { requestedMinutes, estimatedMinutes: Math.ceil(totalSeconds / 60), totalSeconds, workSeconds: Math.round(workSeconds), warmupSeconds: Math.round(warmupSeconds), restSeconds, setupSeconds, bufferSeconds };
}

export function configureStrengthCoaching(rows, catalog, { factor = 1, muscleLoad = new Map(), protectedLegs = false, recoveryScore = null, firstSession = false } = {}) {
  for (const r of rows) {
    const def = catalog[r[1]] || {}, warm = r[0] === 'WARMUP';
    r[11] = 'FALSE'; r[12] = '';
    const rest = warm ? 60 : def.fatigue >= 1.2 ? 150 : def.warmup ? 120 : 75;
    r[9] = String(r[9] || '').replace(/\s*\[Pauza \d+ s\]/g, '').replace(/; (?:poslední série do technického selhání, jen při čistém provedení|last set to technical failure, only with clean technique)/g, '') + ' [Pauza ' + rest + ' s]';
  }
  const names = [...new Set(rows.filter(r => r[0] === 'WORK').map(r => r[1]))];
  const station = name => /^Cable |^Single-arm cable |^Low-to-high cable /.test(name) ? 'cable' : /^DB |^Hammer curl/.test(name) ? 'dumbbells' : '';
  const accessories = names.filter(name => !catalog[name]?.warmup && catalog[name]?.fatigue <= .6 && station(name));
  const overlap = [['chest','triceps'],['chest','shoulders'],['chest','side_delts'],['back','biceps'],['back','rear_delts'],['shoulders','triceps']];
  const compatible = (a,b) => a !== b && !overlap.some(pair => pair.includes(a) && pair.includes(b));
  const used = new Set(); let group = 0;
  for (const name of accessories) {
    if (used.has(name)) continue;
    const other = accessories.find(n => n !== name && !used.has(n) && station(n) === station(name) && compatible(catalog[n].muscle,catalog[name].muscle));
    if (!other || group >= 6) continue;
    const id = 'ABCDEF'[group++]; used.add(name); used.add(other);
    for (const r of rows) if (r[0] === 'WORK' && [name, other].includes(r[1])) r[12] = id;
  }
  // Only one last isolation set reaches technical failure on well-recovered
  // days, and never in a first session, whose loads are still a guess.
  if (!firstSession && factor >= .97 && (recoveryScore == null || recoveryScore >= 70)) {
    const name = names.find(n => catalog[n]?.fatigue <= .5 && !catalog[n]?.warmup && (muscleLoad.get(catalog[n]?.muscle) || 0) < 2.5 && !/sportovní zátěž|load from other sports/.test(rows.find(r => r[1] === n)?.[9] || '') && !(protectedLegs && ['quads','hamstrings','glutes','calves'].includes(catalog[n]?.muscle)));
    const last = name && rows.filter(r => r[0] === 'WORK' && r[1] === name).at(-1);
    if (last) { last[11] = 'TRUE'; last[9] += L('; poslední série do technického selhání, jen při čistém provedení', '; last set to technical failure, only with clean technique'); }
  }
  return rows;
}
