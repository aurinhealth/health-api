// Review of a completed run against its planned workout, without AI. Run
// targets are % of threshold speed (the "% Pace" of Intervals.icu), so the
// same step pairing as for rides works on speed instead of power; texts talk
// in pace per km and heart rate.
import { plannedSteps, alignSteps, status, reviewText, recoveryLines } from './ride-review.js';

const n = v => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const round = v => Math.round(v);

export function buildRunReview({ activity = {}, detail = null, plan = null, wellness = [], fitness = {}, date = null, thresholdPace = null } = {}) {
  const L = reviewText(), { t } = L;
  const p = activity.payload || {}, d = detail?.activity || {};
  const pace = n(thresholdPace), ref = pace ? 1000 / pace : null; // threshold speed, m/s
  const minutes = n(activity.durationHours) != null ? activity.durationHours * 60 : n(d.moving_time) != null ? d.moving_time / 60 : null;
  const tss = n(activity.tss ?? d.icu_training_load), planTss = n(plan?.tss), planMinutes = n(plan?.durationHours) != null ? plan.durationHours * 60 : null;
  const steps = plan?.description ? plannedSteps(plan.description, { sport: 'run' }) : [];
  const intervals = (Array.isArray(detail?.intervals) ? detail.intervals : []).map(a => ({ ...a, watts: n(a.speed) }));
  const aligned = steps.length && intervals.length && ref ? alignSteps(steps, intervals, ref) : { steps: [], quality: 0 };
  const usable = aligned.quality >= .6;
  const S = usable ? aligned.steps.map(s => ({ ...s, status: status(s, ref) })) : [];
  const paceOf = speed => { const sec = round(1000 / speed); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };
  const at = pct => ref * pct / 100;
  const band = (lo, hi) => paceOf(at(lo)) === paceOf(at(hi)) ? paceOf(at(lo)) + '/km' : paceOf(at(lo)) + '–' + paceOf(at(hi)) + '/km';
  const v = speed => paceOf(speed) + '/km';
  const facts = [minutes ? round(minutes) + ' min' : null, n(d.distance ?? p.distance) ? L.dec((d.distance ?? p.distance) / 1000) + ' km' : null, tss != null ? round(tss) + ' TSS' : null].filter(Boolean);
  const work = S.filter(s => s.role === 'work' && s.actual), plannedWork = S.filter(s => s.role === 'work').length;
  const wins = [], fixes = [], load = [];
  let verdict = null, table = null, target = null;

  if (work.length) {
    const counts = { in: 0, over: 0, under: 0 }; work.forEach(s => s.status && counts[s.status]++);
    const secs = work.map(s => 1000 / s.actual.watts), spread = Math.max(...secs) - Math.min(...secs), fade = secs.at(-1) - secs[0];
    const lo = Math.min(...work.map(s => s.lo)), hi = Math.max(...work.map(s => s.hi));
    target = t('Cíl úseků byl ' + L.range(lo, hi) + ' % prahové rychlosti, tedy zhruba ' + band(lo, hi) + ' při prahu ' + paceOf(ref) + '/km.', 'The target for the reps was ' + L.range(lo, hi) + ' % of threshold speed, about ' + band(lo, hi) + ' at a threshold of ' + paceOf(ref) + '/km.');
    if (counts.in + counts.over === work.length && fade < 5)
      wins.push(t('Úseky: ' + (work.length > 1 ? 'všech ' + work.length + ' v rozmezí ' : 'tempo ') + paceOf(1000 / Math.max(...secs)) + (work.length > 1 ? '–' + paceOf(1000 / Math.min(...secs)) : '') + '/km' + (work.length > 1 ? ', rozptyl jen ' + round(spread) + ' s/km' : '') + '.', 'Reps: ' + (work.length > 1 ? 'all ' + work.length + ' between ' : 'pace ') + paceOf(1000 / Math.max(...secs)) + (work.length > 1 ? '–' + paceOf(1000 / Math.min(...secs)) : '') + '/km' + (work.length > 1 ? ', a spread of only ' + round(spread) + ' s/km' : '') + '.'));
    if (fade >= 8) fixes.push(t('Tempo v úsecích klesalo: poslední o ' + round(fade) + ' s/km pomalejší než první. Začni první úsek ve spodní části pásma.', 'Pace faded across the reps: the last was ' + round(fade) + ' s/km slower than the first. Start the first rep at the slow end of the band.'));
    if (counts.under > work.length / 2) fixes.push(t('Úseky pomalejší než plán: ' + work.filter(s => s.status === 'under').map(s => v(s.actual.watts)).join(', ') + ' místo ' + band(lo, hi) + '. Pokud tep už byl vysoko, je tempo na dnešek moc; jinak se drž cíle od začátku.', 'Reps slower than planned: ' + work.filter(s => s.status === 'under').map(s => v(s.actual.watts)).join(', ') + ' instead of ' + band(lo, hi) + '. If HR was already high, the pace was too much for today; otherwise hold the target from the start.'));
    if (counts.over > work.length / 2) fixes.push(t('Úseky rychlejší než pásmo ' + band(lo, hi) + '. U prahu a tempa víc nepřináší víc; drž se horní hranice pásma.', 'Reps faster than the ' + band(lo, hi) + ' band. At threshold and tempo, faster is not better; stay at the top of the band.'));
    const hrs = work.map(s => s.actual.hr).filter(Boolean);
    if (hrs.length >= 3 && hrs.at(-1) - hrs[0] >= 8 && fade < 5) load.push(t('Tep v úsecích stoupal z ' + hrs[0] + ' na ' + hrs.at(-1) + ' při stejném tempu: únava nebo teplo, příště pij a nezrychluj.', 'Heart rate in the reps rose from ' + hrs[0] + ' to ' + hrs.at(-1) + ' at the same pace: fatigue or heat; drink and don\'t speed up next time.'));
    verdict = plannedWork > work.length ? t('Zkrácený trénink: ' + work.length + ' z ' + plannedWork + ' úseků.', 'Shortened session: ' + work.length + ' of ' + plannedWork + ' reps.')
      : counts.under > work.length / 2 ? t('Úseky pomalejší než plán.', 'Reps slower than planned.')
      : counts.over > work.length / 2 ? t('Splněno, úseky spíš rychlejší, než měly být.', 'Done, if anything the reps were too fast.')
      : fade >= 8 ? t('Úseky splněné, ale tempo ke konci klesalo.', 'Reps done, but the pace dropped towards the end.')
      : t('Povedený trénink, úseky v plánovaném tempu.', 'A good session: reps at the planned pace.');
    const reps = S.filter(s => s.block === work[0].block && s.role === 'work');
    if (reps.length > 1) table = { columns: [t('Úsek', 'Rep'), t('Tempo · čas', 'Pace · time'), t('Tep prům. / max', 'HR avg / max')], rows: reps.filter(s => s.actual).map((s, i) => [String(i + 1), v(s.actual.watts) + ' · ' + L.clock(s.actual.seconds), s.actual.hr ? s.actual.hr + ' / ' + (s.actual.maxHr ?? '—') : '—']) };
  } else if (S.length) {
    const out = S.filter(s => s.actual && s.status === 'over' && s.role !== 'sprint');
    verdict = out.length ? t('Běh rychlejší, než měl být.', 'The run was faster than planned.') : t('Běh v plánovaném tempu.', 'Run at the planned pace.');
    for (const s of out.filter(s => s.minutes >= 10)) fixes.push(t('Klidná část v ' + v(s.actual.watts) + ' místo ' + band(s.lo, s.hi) + '. Lehký běh má zůstat lehký, i když se cítíš dobře.', 'Easy part at ' + v(s.actual.watts) + ' instead of ' + band(s.lo, s.hi) + '. Easy runs should stay easy, even when you feel good.'));
  }
  const warm = S.find(s => s.role === 'warmup');
  if (warm?.actual && warm.status === 'over' && work.length) fixes.push(t('Rozklus moc rychlý: ' + v(warm.actual.watts) + ' místo ' + band(warm.lo, warm.hi) + (warm.actual.maxHr ? ', tep až ' + warm.actual.maxHr : '') + '.', 'Warm-up too fast: ' + v(warm.actual.watts) + ' instead of ' + band(warm.lo, warm.hi) + (warm.actual.maxHr ? ', HR up to ' + warm.actual.maxHr : '') + '.'));
  const hot = S.filter(s => s.role === 'rest' && s.actual && s.actual.watts / ref * 100 > s.hi + 5);
  if (hot.length) fixes.push(t('Klus mezi úseky rychlejší než plán (' + hot.map(s => v(s.actual.watts)).join(', ') + ' místo ' + band(hot[0].lo, hot[0].hi) + '). Pauza má opravdu uklidnit tep.', 'Recovery jogs faster than planned (' + hot.map(s => v(s.actual.watts)).join(', ') + ' instead of ' + band(hot[0].lo, hot[0].hi) + '). The recovery should really bring HR down.'));
  const cool = S.find(s => s.role === 'cooldown');
  if (cool && (!cool.actual || cool.actual.seconds < cool.minutes * 60 * .6)) fixes.push(t('Chybí výklus: místo ' + L.span(cool.minutes * 60) + (cool.actual ? ' jen ' + L.span(cool.actual.seconds) : ' nic') + '.', 'Cool-down missing: ' + (cool.actual ? 'only ' + L.span(cool.actual.seconds) : 'none') + ' instead of ' + L.span(cool.minutes * 60) + '.'));
  else if (minutes != null && planMinutes != null && minutes < planMinutes - 3) fixes.push(t('Kratší než plán: ' + round(minutes) + ' z ' + round(planMinutes) + ' min.', 'Shorter than planned: ' + round(minutes) + ' of ' + round(planMinutes) + ' min.'));
  if (tss != null && planTss) load.push(t('Zátěž ' + round(tss) + ' TSS proti plánu ' + round(planTss) + ' (' + round(tss / planTss * 100) + ' %).', 'Load ' + round(tss) + ' TSS against ' + round(planTss) + ' planned (' + round(tss / planTss * 100) + ' %).'));
  load.push(...recoveryLines({ wellness, date: date || String(activity.start || '').slice(0, 10), fitness, hardDay: tss != null && tss >= 80 || work.length > 0, strong: work.length && work.every(s => s.status !== 'under'), sport: 'run' }));

  const label = s => ({ warmup: t('Rozklus', 'Warm-up'), sprint: t('Rovinka', 'Stride'), work: t('Úsek', 'Rep'), rest: t('Klus', 'Jog'), cooldown: t('Výklus', 'Cool-down') })[s.role] || t('Klidný běh', 'Easy running');
  const chart = S.length ? { ftp: 100, unit: '%', refLabel: t('práh ', 'threshold ') + paceOf(ref) + '/km', steps: S.map(s => ({ role: s.role, label: label(s), tip: label(s) + ' · ' + (s.actual ? L.clock(s.actual.seconds) + ' · ' + v(s.actual.watts) + (s.actual.hr ? ' · ' + t('tep ', 'HR ') + s.actual.hr : '') : t('chybí', 'missing')) + (s.lo != null ? ' · ' + t('cíl ', 'target ') + band(s.lo, s.hi) : ''), start: n(s.actual?.start), seconds: s.actual ? s.actual.seconds : s.minutes * 60, lo: s.lo, hi: s.hi, watts: s.actual ? round(s.actual.watts / ref * 100) : null, status: s.role === 'sprint' ? null : s.status, missing: !s.actual })) } : null;
  const sections = [
    wins.length ? { kind: 'good', label: t('Co se povedlo', 'What went well'), items: wins } : null,
    fixes.length ? { kind: 'fix', label: t('Co příště líp', 'Do better next time'), items: fixes } : null,
    load.length ? { kind: 'load', label: t('Zátěž a regenerace', 'Load and recovery'), items: load } : null
  ].filter(Boolean);
  const actions = facts.length ? [t('Dokončeno: ', 'Completed: ') + facts.join(' · ') + '.'] : [];
  if (!plan) actions.push(t('Bez spárovaného plánu hodnotím jen průběh běhu.', 'No matched plan, so only the run itself is reviewed.'));
  else if (!ref) actions.push(t('Chybí prahové tempo v Intervals.icu, úseky proto neporovnávám s cílem.', 'No threshold pace in Intervals.icu, so the reps are not compared with their target.'));
  return { verdict, target, table, chart, sections, actions };
}
