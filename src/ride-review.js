// Detailed review of a completed ride against its planned workout, without AI.
// The planned steps (Intervals.icu workout text) are aligned with the intervals
// Intervals.icu found in the ride; each step is then judged against its target
// band, and the day's wellness (HRV, resting HR, sleep, form) is set beside the
// load. Texts follow the app language of the request (src/lang.js).
import { parseIntervalsDescription } from './planned-detail.js';
import { L as tr, isEnglish } from './lang.js';

const n = v => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const round = v => Math.round(v);
const TOL = 2; // % FTP either side of a band that still counts as in band

export function reviewText() {
  const en = isEnglish(), t = tr;
  const dec = (v, d = 1) => { const s = (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.0+$/, ''); return en ? s : s.replace('.', ','); };
  const clock = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const span = s => s < 90 ? Math.round(s) + ' s' : Math.abs(s - Math.round(s / 60) * 60) <= 5 ? Math.round(s / 60) + ' min' : clock(s) + ' min';
  const range = (a, b) => a === b ? String(a) : a + '–' + b;
  const list = items => items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + t(' a ', ' and ') + items.at(-1);
  const ord = i => en ? ['1st', '2nd', '3rd'][i] || (i + 1) + 'th' : (i + 1) + '.';
  return { en, t, dec, clock, span, range, list, ord };
}

// Planned steps, repeats expanded, each with its role in the session.
export function plannedSteps(description, { sport = 'ride' } = {}) {
  let blocks = [];
  try { blocks = parseIntervalsDescription(description || ''); } catch { blocks = []; }
  const steps = [];
  blocks.forEach((b, block) => {
    const one = (s, rep, of) => {
      const lo = n(s.powerLow ?? s.powerStart ?? s.power), hi = n(s.powerHigh ?? s.powerEnd) ?? lo;
      steps.push({ minutes: n(s.durationMinutes) || 0, lo: lo != null && hi != null ? Math.min(lo, hi) : lo, hi: lo != null && hi != null ? Math.max(lo, hi) : hi, note: s.note || null, cadence: s.cadence || null, block, rep, of });
    };
    if (Array.isArray(b.steps)) for (let r = 0; r < (n(b.repeats) || 1); r++) b.steps.forEach((s, i) => one({ ...s, _i: i }, r + 1, n(b.repeats) || 1));
    else one(b, 1, 1);
  });
  // Runs are % of threshold speed: easy running sits at 70–80 %, strides above 110 %.
  const [workFrom, sprintFrom] = sport === 'run' ? [85, 110] : [76, 120];
  const hard = s => s.lo != null && s.lo >= workFrom, sprint = s => s.lo != null && s.lo >= sprintFrom && s.minutes <= 1.01;
  const first = steps.findIndex(s => hard(s)), last = steps.findLastIndex(s => hard(s)), easyBelow = sport === 'run' ? 80 : 60;
  steps.forEach((s, i) => {
    if (s.lo == null) s.role = 'free';
    else if (sprint(s)) s.role = 'sprint';
    else if (hard(s)) s.role = 'work';
    else if (first < 0) s.role = i === 0 && steps.length > 2 && s.lo < easyBelow ? 'warmup' : i === steps.length - 1 && steps.length > 2 && s.lo < easyBelow ? 'cooldown' : 'endurance';
    else if (i < first) s.role = 'warmup';
    else if (s.of > 1 && steps.some(x => x.block === s.block && hard(x) && x.lo - s.lo >= 10)) s.role = 'rest';
    else if (i > last) s.role = i === steps.length - 1 && s.lo < easyBelow ? 'cooldown' : 'endurance';
    else s.role = s.lo < easyBelow ? 'rest' : 'endurance';
  });
  return steps;
}

// Planned steps paired with recorded intervals by duration and intensity,
// allowing a step to be missing or an interval to be extra.
export function alignSteps(steps, intervals, ftp) {
  const P = steps, A = intervals.filter(a => n(a.seconds) > 0), m = P.length, k = A.length;
  const pct = a => ftp && n(a.watts) != null ? a.watts / ftp * 100 : null;
  const match = (p, a) => {
    const dur = Math.min(1, Math.abs(Math.log(a.seconds / Math.max(10, p.minutes * 60))));
    const v = pct(a);
    let gap = 0;
    if (v != null && p.lo != null) gap = p.role === 'sprint' ? (v >= 110 ? 0 : 1.5) : Math.min(2, Math.max(0, p.lo - v, v - p.hi) / 15);
    return dur * 1.5 + gap;
  };
  const skipP = p => p.role === 'work' || p.role === 'sprint' ? 2 : 1.2, skipA = a => .6 + .4 * Math.min(1, a.seconds / 300);
  const D = Array.from({ length: m + 1 }, () => new Array(k + 1).fill(0)), W = Array.from({ length: m + 1 }, () => new Array(k + 1).fill(''));
  for (let i = 1; i <= m; i++) { D[i][0] = D[i - 1][0] + skipP(P[i - 1]); W[i][0] = 'p'; }
  for (let j = 1; j <= k; j++) { D[0][j] = D[0][j - 1] + skipA(A[j - 1]); W[0][j] = 'a'; }
  for (let i = 1; i <= m; i++) for (let j = 1; j <= k; j++) {
    const opts = [[D[i - 1][j - 1] + match(P[i - 1], A[j - 1]), 'm'], [D[i - 1][j] + skipP(P[i - 1]), 'p'], [D[i][j - 1] + skipA(A[j - 1]), 'a']].sort((x, y) => x[0] - y[0]);
    D[i][j] = opts[0][0]; W[i][j] = opts[0][1];
  }
  const out = P.map(p => ({ ...p, actual: null }));
  for (let i = m, j = k; i > 0 || j > 0;) {
    const w = W[i][j];
    if (w === 'm') { out[i - 1].actual = A[j - 1]; i--; j--; } else if (w === 'p') i--; else j--;
  }
  const found = out.filter(s => s.actual).length;
  return { steps: out, quality: m ? found / m : 0 };
}

export function status(step, ftp) {
  const a = step.actual;
  if (!a || !ftp || n(a.watts) == null || step.lo == null || step.role === 'sprint') return null;
  // Easy parts have no upward tolerance: anything above the band is too hard.
  const p = a.watts / ftp * 100, up = step.role === 'work' ? TOL : .5;
  return p < step.lo - TOL ? 'under' : p > step.hi + up ? 'over' : 'in';
}
const workKind = lo => lo >= 106 ? 'vo2' : lo >= 94 ? 'threshold' : lo >= 88 ? 'sweetspot' : 'tempo';

// The day's recovery picture from Intervals.icu wellness rows ({id, hrv, restingHR, sleepSecs}).
export function recoverySignals(wellness = [], date) {
  const rows = (Array.isArray(wellness) ? wellness : []).filter(r => r && String(r.id || '') <= date).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const today = rows.find(r => r.id === date) || null, before = rows.filter(r => r.id < date).slice(-7);
  const vals = (list, key) => list.map(r => n(r[key])).filter(v => v != null && v > 0);
  const median = v => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const out = {};
  const hrv = n(today?.hrv), hrvPrev = vals(before, 'hrv');
  if (hrv != null && hrvPrev.length >= 3) {
    const base = hrvPrev.reduce((a, b) => a + b, 0) / hrvPrev.length;
    out.hrv = { value: hrv, low: Math.min(...hrvPrev), high: Math.max(...hrvPrev), baseline: base, drop: hrv < base * .85 };
  }
  const rhr = n(today?.restingHR), rhrPrev = vals(before, 'restingHR');
  if (rhr != null && rhrPrev.length >= 3) { const usual = median(rhrPrev); out.rhr = { value: rhr, usual, high: rhr >= usual + 4 }; }
  const nights = [];
  for (const r of [...rows].reverse()) { const h = n(r.sleepSecs) != null ? r.sleepSecs / 3600 : null; if (h == null || h >= 6.5) break; nights.push(h); }
  if (nights.length >= 2) out.sleep = { nights: nights.length, min: Math.min(...nights), max: Math.max(...nights) };
  return out;
}

// The day's recovery beside the session, and what it means for tomorrow.
export function recoveryLines({ wellness = [], date, fitness = {}, hardDay = false, strong = false, sport = 'ride' }) {
  const L = reviewText(), { t } = L, rec = recoverySignals(wellness, date), parts = [], out = [];
  if (rec.hrv?.drop) parts.push(t('ranní HRV spadlo na ' + round(rec.hrv.value) + ' (předchozí dny ' + L.range(round(rec.hrv.low), round(rec.hrv.high)) + ')', 'morning HRV dropped to ' + round(rec.hrv.value) + ' (previous days ' + L.range(round(rec.hrv.low), round(rec.hrv.high)) + ')'));
  if (rec.rhr?.high) parts.push(t('klidový tep ' + round(rec.rhr.value) + ' místo obvyklých ' + round(rec.rhr.usual), 'resting HR ' + round(rec.rhr.value) + ' instead of the usual ' + round(rec.rhr.usual)));
  if (rec.sleep?.nights >= 3) parts.push(t('spánek ' + L.range(L.dec(rec.sleep.min), L.dec(rec.sleep.max)) + ' h ' + (['', '', 'druhou', 'třetí', 'čtvrtou', 'pátou'][rec.sleep.nights] || rec.sleep.nights + '.') + ' noc po sobě', L.range(L.dec(rec.sleep.min), L.dec(rec.sleep.max)) + ' h of sleep for the ' + (L.ord(rec.sleep.nights - 1)) + ' night running'));
  const tsb = n(fitness?.tsb);
  if (tsb != null && tsb <= -10) parts.push(t('forma je na ' + String(round(tsb)).replace('-', '−'), 'form is at ' + String(round(tsb)).replace('-', '−')));
  if (parts.length) out.push(parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + (parts.length > 1 ? ', ' + L.list(parts.slice(1)) : '') + '.');
  const flags = [rec.hrv?.drop, rec.rhr?.high, rec.sleep?.nights >= 3, tsb != null && tsb <= -20].filter(Boolean).length;
  const easy = sport === 'run' ? t('lehký výklus', 'an easy jog') : t('lehké vyjetí', 'an easy spin');
  if (flags >= 2) out.push(t((strong ? 'Dnes se to na výkonu neprojevilo, ale zítra' : 'Zítra') + ' dej volno nebo jen ' + easy + ' a prioritou udělej spánek.', (strong ? 'It didn\'t show in today\'s performance, but tomorrow' : 'Tomorrow') + ' take a rest day or only ' + easy + ', and make sleep the priority.'));
  else if (flags === 1 && hardDay) out.push(t('Zítra spíš lehčí den; kvalitu nech, až se regenerace srovná.', 'Keep tomorrow easier; save quality until recovery settles.'));
  else if (hardDay) out.push(t('Po náročné jednotce zítra lehčí den nebo volno podle plánu.', 'After a hard session, keep tomorrow easy or rest as planned.'));
  return out;
}

function sportOf(a) { return /ride|cycling|bike/i.test(String(a?.type || '')) ? 'ride' : 'other'; }

export function buildRideReview({ activity = {}, detail = null, plan = null, wellness = [], fitness = {}, date = null } = {}) {
  const L = reviewText(), { t } = L;
  const p = activity.payload || {}, d = detail?.activity || {};
  const ftp = n(d.icu_ftp ?? p.icu_ftp), minutes = n(activity.durationHours) != null ? activity.durationHours * 60 : n(d.moving_time) != null ? d.moving_time / 60 : null;
  const tss = n(activity.tss ?? d.icu_training_load), np = n(d.icu_normalized_watts ?? p.icu_weighted_avg_watts ?? p.icu_normalized_watts), avg = n(d.average_watts ?? p.icu_average_watts ?? p.average_watts);
  const hrLoad = n(d.hr_load ?? p.hr_load), carbs = n(d.carbs_used ?? p.carbs_used), elev = n(d.total_elevation_gain ?? p.total_elevation_gain);
  const planTss = n(plan?.tss), planMinutes = n(plan?.durationHours) != null ? plan.durationHours * 60 : null;
  const steps = plan?.description ? plannedSteps(plan.description) : [];
  const intervals = Array.isArray(detail?.intervals) ? detail.intervals : [];
  const aligned = steps.length && intervals.length && ftp ? alignSteps(steps, intervals, ftp) : { steps: [], quality: 0 };
  const usable = aligned.quality >= .6;
  const S = usable ? aligned.steps.map(s => ({ ...s, status: status(s, ftp) })) : [];
  const W = x => Math.round(x / 100 * ftp);
  const pctOf = w => Math.round(w / ftp * 100);
  const U = { v: w => round(w) + ' W', band: (lo, hi) => L.range(W(lo), W(hi)) + ' W' };

  const facts = [minutes ? round(minutes) + ' min' : null, tss != null ? round(tss) + ' TSS' : null, n(activity.calories) != null ? round(activity.calories) + ' kcal' : null].filter(Boolean);
  const work = S.filter(s => s.role === 'work' && s.actual), sprints = S.filter(s => s.role === 'sprint' && s.actual);
  const plannedWork = S.filter(s => s.role === 'work').length;
  const wins = [], fixes = [], load = [], later = [];

  // Main set: the work steps against their band, their spread and any fade.
  let verdict = null, table = null, target = null;
  if (work.length) {
    const counts = { in: 0, over: 0, under: 0 }; work.forEach(s => s.status && counts[s.status]++);
    const watts = work.map(s => s.actual.watts), spread = Math.max(...watts) - Math.min(...watts), fade = (watts.at(-1) - watts[0]) / watts[0] * 100;
    const lo = Math.min(...work.map(s => s.lo)), hi = Math.max(...work.map(s => s.hi)), kind = workKind(lo);
    const kindName = { vo2: t('VO₂max úseky', 'VO₂max reps'), threshold: t('Práh', 'Threshold'), sweetspot: t('Sweet spot', 'Sweet spot'), tempo: t('Tempo', 'Tempo') }[kind];
    const kindGen = { vo2: t('VO₂max úseků', 'the VO₂max reps'), threshold: t('prahu', 'the threshold work'), sweetspot: t('sweet spotu', 'the sweet spot work'), tempo: t('tempa', 'the tempo work') }[kind];
    const pcts = work.map(s => pctOf(s.actual.watts));
    target = t('Cíl ' + kindGen + ' byl ' + L.range(lo, hi) + ' %, tedy zhruba ' + L.range(W(lo), W(hi)) + ' W při FTP ' + ftp + ' W.', 'The target for ' + kindGen + ' was ' + L.range(lo, hi) + ' %, about ' + L.range(W(lo), W(hi)) + ' W at an FTP of ' + ftp + ' W.');
    const held = Math.abs(fade) <= 3, faded = fade <= -5;
    const missing = plannedWork - work.length;
    if (counts.in + counts.over === work.length && !faded) {
      wins.push(t(kindName + ': ' + (work.length > 1 ? (work.length === 4 ? 'všechny čtyři' : 'všech ' + work.length) + ' bloky vyšly na ' : 'blok vyšel na ') + L.range(Math.min(...pcts), Math.max(...pcts)) + ' % FTP' + (work.length > 1 ? ' s rozptylem jen ' + round(spread) + ' W' + (held ? ' a poslední byl stejně silný jako první' : '') : '') + '.',
        kindName + ': ' + (work.length > 1 ? 'all ' + work.length + ' blocks came out at ' : 'the block came out at ') + L.range(Math.min(...pcts), Math.max(...pcts)) + ' % of FTP' + (work.length > 1 ? ' with a spread of only ' + round(spread) + ' W' + (held ? ', and the last one was as strong as the first' : '') : '') + '.'));
    }
    if (faded) fixes.push(t('Výkon v blocích klesal: poslední byl o ' + round(-fade) + ' % slabší než první (' + round(watts[0]) + ' → ' + round(watts.at(-1)) + ' W). Příště začni první blok ve spodní části pásma.', 'Power faded across the blocks: the last was ' + round(-fade) + ' % below the first (' + round(watts[0]) + ' → ' + round(watts.at(-1)) + ' W). Next time start the first block at the bottom of the band.'));
    if (counts.under > work.length / 2) fixes.push(t('Bloky pod pásmem: ' + work.filter(s => s.status === 'under').map(s => U.v(s.actual.watts)).join(', ') + ' místo ' + L.range(W(lo), W(hi)) + ' W. Venku je jeď do kopce nebo proti větru; při únavě je lepší je zkrátit než jet pod cílem.', 'Blocks below the band: ' + work.filter(s => s.status === 'under').map(s => U.v(s.actual.watts)).join(', ') + ' instead of ' + L.range(W(lo), W(hi)) + ' W. Outdoors ride them uphill or into the wind; when tired, shorten them rather than ride under target.'));
    if (counts.over > work.length / 2 && work.every(s => s.minutes >= 4 && s.actual.watts / ftp * 100 > s.hi) && lo >= 88) {
      const top = work.reduce((a, b) => b.actual.watts > a.actual.watts ? b : a);
      later.push(t(kindName + ' mírně nad pásmem: pokud ti ' + round(top.actual.watts) + ' W na ' + L.span(top.actual.seconds) + ' přijde udržitelných, může být FTP nastavené o něco níž, než odpovídá. Z jednoho tréninku ho ale neměň.', kindName + ' slightly above the band: if ' + round(top.actual.watts) + ' W for ' + L.span(top.actual.seconds) + ' felt sustainable, your FTP may be set a little low. Don\'t change it from a single ride, though.'));
    }
    const over = counts.over > 0 && counts.over >= counts.in, under = counts.under > work.length / 2;
    const head = missing > 0 ? t('Zkrácený trénink: ' + work.length + ' z ' + plannedWork + ' bloků.', 'Shortened session: ' + work.length + ' of ' + plannedWork + ' blocks.')
      : under ? t('Hlavní část pod plánem.', 'Main set below plan.')
      : faded ? t('Hlavní část splněná, ale výkon ke konci klesal.', 'Main set done, but power dropped towards the end.')
      : over ? t('Povedený trénink, hlavní část splněná, spíš lehce přepálená.', 'A good session: main set done, if anything slightly too hard.')
      : t('Povedený trénink, hlavní část splněná podle plánu.', 'A good session: main set done as planned.');
    verdict = head;

    // One row per repetition of the main set.
    const mainBlock = work[0].block, reps = S.filter(s => s.block === mainBlock && s.of > 1);
    if (reps.length) {
      const roles = [...new Set(reps.map(s => s.role))].filter(r => r !== 'rest');
      const sprintStep = reps.find(s => s.role === 'sprint');
      const cols = [t('Blok', 'Block'), ...roles.map(r => r === 'sprint' ? t('Sprint', 'Sprint') + ' ' + L.span(sprintStep.minutes * 60) + ' (max)' : r === 'work' ? kindName : r), t('Tep prům. / max', 'HR avg / max')];
      const rows = [];
      for (let r = 1; r <= reps[0].of; r++) {
        const rep = reps.filter(s => s.rep === r), mainStep = rep.find(s => s.role === 'work') || rep[0];
        if (!rep.some(s => s.actual)) continue;
        rows.push([String(r), ...roles.map(role => { const s = rep.find(x => x.role === role); const a = s?.actual; if (!a) return '—'; return role === 'sprint' ? U.v(a.watts) + (n(a.maxWatts) ? ' (' + round(a.maxWatts) + ')' : '') : round(a.watts) + ' W · ' + L.clock(a.seconds); }), mainStep.actual?.hr ? mainStep.actual.hr + ' / ' + (mainStep.actual.maxHr ?? '—') : '—']);
      }
      if (rows.length) table = { columns: cols, rows };
    }
  } else if (S.length) {
    const easy = S.filter(s => s.actual && (s.role === 'endurance' || s.role === 'warmup' || s.role === 'cooldown'));
    const out = easy.filter(s => s.status === 'over');
    verdict = out.length ? t('Jízda svižnější, než měla být.', 'The ride was harder than planned.') : t('Jízda v plánovaném pásmu.', 'Ride within the planned range.');
  }

  // Sprints: strongest first, kept or fading.
  if (sprints.length >= 2) {
    const w = sprints.map(s => s.actual.watts), best = Math.max(...w), firstBest = w[0] === best, rest = w.filter((_, i) => i !== w.indexOf(best));
    if (Math.min(...w) >= best * .85) wins.push(t('Sprinty: ' + (firstBest ? 'první byl nejsilnější, další se držely na ' : 'nejsilnější ' + round(best) + ' W, ostatní na ') + L.range(round(Math.min(...rest)), round(Math.max(...rest))) + ' W, nástupy zůstaly silné.', 'Sprints: ' + (firstBest ? 'the first was the strongest, the rest held at ' : 'best ' + round(best) + ' W, the rest at ') + L.range(round(Math.min(...rest)), round(Math.max(...rest))) + ' W, so the kicks stayed strong.'));
    else fixes.push(t('Sprinty slábly: ' + w.map(v => round(v)).join(' → ') + ' W. Mezi nimi dej nohám opravdu volno, ať každý jde naplno.', 'Sprints faded: ' + w.map(v => round(v)).join(' → ') + ' W. Keep the recoveries truly easy so each one is full gas.'));
  }

  // Everything around the main set: warm-up, recoveries, aerobic parts, cool-down.
  const warm = S.find(s => s.role === 'warmup');
  if (warm?.actual && warm.status === 'over') {
    const why = elev != null && n(warm.actual.elevation) >= 60 ? t(' Zčásti za to může ' + round(warm.actual.elevation) + ' m stoupání, ale', ' Part of it was ' + round(warm.actual.elevation) + ' m of climbing, but') : '';
    fixes.push(t('Rozjetí bylo moc ostré: průměr ' + round(warm.actual.watts) + ' W (' + pctOf(warm.actual.watts) + ' %) místo ' + L.range(warm.lo, warm.hi) + ' %' + (warm.actual.maxHr ? ', tep až ' + warm.actual.maxHr : '') + '.' + why + (why ? ' do' : ' Do') + ' první práce jdeš zbytečně unavený.', 'The warm-up was too hard: ' + round(warm.actual.watts) + ' W on average (' + pctOf(warm.actual.watts) + ' %) instead of ' + L.range(warm.lo, warm.hi) + ' %' + (warm.actual.maxHr ? ', HR up to ' + warm.actual.maxHr : '') + '.' + why + (why ? ' you' : ' You') + ' went into the first effort more tired than needed.'));
  } else if (warm?.actual && warm.status === 'in' && work.length) wins.push(t('Rozjetí v pásmu: ' + round(warm.actual.watts) + ' W, do hlavní části čerstvý.', 'Warm-up in range: ' + round(warm.actual.watts) + ' W, fresh for the main set.'));

  const rests = S.filter(s => s.role === 'rest' && s.actual);
  if (rests.length) {
    const hot = rests.map((s, i) => ({ s, i })).filter(x => x.s.status === 'over'), easyOnes = rests.map((s, i) => ({ s, i })).filter(x => x.s.status !== 'over');
    const band = U.band(rests[0].lo, rests[0].hi);
    if (hot.length) fixes.push(t('Pauzy mezi bloky: ' + L.list(hot.map(x => L.ord(x.i))) + (hot.length > 1 ? ' vyšly' : ' vyšla') + ' na ' + hot.map(x => round(x.s.actual.watts)).join(' a ') + ' W místo ' + band + (easyOnes.length ? ', ' + L.list(easyOnes.map(x => L.ord(x.i))) + (easyOnes.length > 1 ? ' byly opravdu volné' : ' byla opravdu volná') + ' (' + easyOnes.map(x => round(x.s.actual.watts)).join(', ') + ' W)' : '') + '.',
      'Recoveries between blocks: the ' + L.list(hot.map(x => L.ord(x.i))) + ' came out at ' + hot.map(x => round(x.s.actual.watts)).join(' and ') + ' W instead of ' + band + (easyOnes.length ? '; the ' + L.list(easyOnes.map(x => L.ord(x.i))) + (easyOnes.length > 1 ? ' were' : ' was') + ' truly easy (' + easyOnes.map(x => round(x.s.actual.watts)).join(', ') + ' W)' : '') + '.'));
    else if (rests.length >= 2) wins.push(t('Pauzy opravdu volné (' + L.range(round(Math.min(...rests.map(s => s.actual.watts))), round(Math.max(...rests.map(s => s.actual.watts)))) + ' W), takže bloky měly kvalitu.', 'Recoveries truly easy (' + L.range(round(Math.min(...rests.map(s => s.actual.watts))), round(Math.max(...rests.map(s => s.actual.watts)))) + ' W), so the blocks kept their quality.'));
  }
  for (const s of S.filter(s => s.role === 'endurance' && s.actual && s.minutes >= 10)) {
    const own = s.note && (!L.en || !/[ěščřžýáíéůúňťď]/i.test(s.note)), name = own ? s.note.charAt(0).toUpperCase() + s.note.slice(1) : t('Aerobní část', 'Aerobic part');
    if (s.status === 'in') wins.push(t(name + ': ' + L.span(s.actual.seconds) + ' na ' + round(s.actual.watts) + ' W sedí do pásma ' + L.range(s.lo, s.hi) + ' %.', name + ': ' + L.span(s.actual.seconds) + ' at ' + round(s.actual.watts) + ' W, right in the ' + L.range(s.lo, s.hi) + ' % band.'));
    else if (s.status === 'over') fixes.push(t(name + ': ' + round(s.actual.watts) + ' W (' + pctOf(s.actual.watts) + ' %) nad pásmem ' + L.range(s.lo, s.hi) + ' %. Aerobní část má zůstat lehká.', name + ': ' + round(s.actual.watts) + ' W (' + pctOf(s.actual.watts) + ' %) above the ' + L.range(s.lo, s.hi) + ' % band. The aerobic part should stay easy.'));
  }
  const cool = S.find(s => s.role === 'cooldown');
  const short = minutes != null && planMinutes != null && minutes < planMinutes - 3 ? t(', celkově ' + round(minutes) + ' z ' + round(planMinutes) + ' min', ', ' + round(minutes) + ' of ' + round(planMinutes) + ' min overall') : '';
  if (cool && (!cool.actual || cool.actual.seconds < cool.minutes * 60 * .6)) {
    const got = cool.actual ? L.span(cool.actual.seconds) : null;
    fixes.push(t('Chybí vyjetí: místo ' + L.span(cool.minutes * 60) + (got ? ' jen ' + got : ' nic') + short + '.', 'Cool-down missing: ' + (got ? 'only ' + got : 'none') + ' instead of ' + L.span(cool.minutes * 60) + short + '.'));
  } else if (short) fixes.push(t('Kratší než plán' + short + '.', 'Shorter than planned' + short + '.'));

  fixes.push(...later);

  // Load: power TSS beside heart-rate load, and the plan.
  const vi = np && avg ? np / avg : null;
  if (tss != null) {
    if (vi != null && vi >= 1.15 && hrLoad != null && tss > hrLoad * 1.25)
      load.push(t('TSS ' + round(tss) + ' je nadsazené, protože krátké nástupy nafukují normalizovaný výkon (' + round(np) + ' W při průměru ' + round(avg) + ' W). Zátěž podle tepu vychází na ' + round(hrLoad) + (planTss ? ', plán byl ' + round(planTss) : '') + '.',
        'TSS ' + round(tss) + ' is inflated because short surges push up normalized power (' + round(np) + ' W against ' + round(avg) + ' W average). Heart-rate load comes out at ' + round(hrLoad) + (planTss ? ', the plan was ' + round(planTss) : '') + '.'));
    else if (planTss) load.push(t('Zátěž ' + round(tss) + ' TSS proti plánu ' + round(planTss) + ' (' + round(tss / planTss * 100) + ' %)' + (tss / planTss > 1.15 ? '; vyšší zátěž zohledni u dalších jednotek' : '') + '.', 'Load ' + round(tss) + ' TSS against ' + round(planTss) + ' planned (' + round(tss / planTss * 100) + ' %)' + (tss / planTss > 1.15 ? '; allow for the extra load in the next sessions' : '') + '.'));
  }
  const day = date || String(activity.start || '').slice(0, 10);
  const hardDay = (np && ftp && np / ftp >= .85) || (tss != null && tss >= 100);
  load.push(...recoveryLines({ wellness, date: day, fitness, hardDay, strong: work.length && work.every(s => s.status !== 'under') }));
  if (carbs != null && carbs >= 150) load.push(t('Dnes večer sacharidy neškrť ani při hubnutí: jízda jich spálila kolem ' + round(carbs / 10) * 10 + ' g.', 'Don\'t cut carbs tonight, even when losing weight: the ride burned about ' + round(carbs / 10) * 10 + ' g.'));

  // Plan vs reality per step, for the chart.
  const kindLabel = lo => ({ vo2: 'VO₂max', threshold: t('Práh', 'Threshold'), sweetspot: 'Sweet spot', tempo: 'Tempo' })[workKind(lo)];
  const label = s => ({ warmup: t('Rozjetí', 'Warm-up'), sprint: 'Sprint', work: kindLabel(s.lo || 0), rest: t('Pauza', 'Recovery'), cooldown: t('Vyjetí', 'Cool-down'), free: t('Volně', 'Free ride') })[s.role] || (s.note && (!L.en || !/[ěščřžýáíéůúňťď]/i.test(s.note)) ? s.note : t('Aerobní část', 'Aerobic part'));
  const tip = s => label(s) + ' · ' + (s.actual ? L.clock(s.actual.seconds) + ' · ' + U.v(s.actual.watts) + (s.actual.hr ? ' · ' + t('tep ', 'HR ') + s.actual.hr : '') : t('chybí', 'missing')) + (s.lo != null && s.role !== 'sprint' ? ' · ' + t('cíl ', 'target ') + U.band(s.lo, s.hi) : '');
  const chart = S.length && ftp ? { ftp, steps: S.map(s => ({ role: s.role, label: label(s), tip: tip(s), start: n(s.actual?.start), seconds: s.actual ? s.actual.seconds : s.minutes * 60, planned: s.minutes * 60, lo: s.lo != null ? W(s.lo) : null, hi: s.hi != null ? W(s.hi) : null, watts: s.actual ? round(s.actual.watts) : null, hr: s.actual?.hr ?? null, status: s.status, missing: !s.actual })) } : null;

  const sections = [
    wins.length ? { kind: 'good', label: t('Co se povedlo', 'What went well'), items: wins } : null,
    fixes.length ? { kind: 'fix', label: t('Co příště líp', 'Do better next time'), items: fixes } : null,
    load.length ? { kind: 'load', label: t('Zátěž a regenerace', 'Load and recovery'), items: load } : null
  ].filter(Boolean);
  const actions = [];
  if (facts.length) actions.push(t('Dokončeno: ', 'Completed: ') + facts.join(' · ') + '.');
  if (!plan) actions.push(t('Bez spárovaného plánu hodnotím jen průběh jízdy.', 'No matched plan, so only the ride itself is reviewed.'));
  else if (steps.length && !usable) actions.push(t('Intervaly v záznamu se nepodařilo spárovat s plánem, hodnotím celek.', 'The recorded intervals could not be matched to the plan, so the ride is reviewed as a whole.'));
  return { verdict, target, table, chart, sections, actions, sport: sportOf(activity) };
}
