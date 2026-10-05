import { availabilityOn, parseTimeWindow } from './training-availability.js';
import { planWeekRoles, weekTargets } from './week-planner.js';

const shift = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const sportOf = a => /ride|bike|cycl/i.test(a.type || '') ? 'ride' : /run/i.test(a.type || '') ? 'run' : /weight|strength|gym/i.test(a.type || '') ? 'gym' : null;
export const sessionsOn = d => [...(d?.daily?.training?.completed || []), ...(d?.daily?.training?.planned || [])].filter(a => sportOf(a));
export function activityHistoryEstimate(history = [], reference) {
  const recent = history.filter(d => d.date < reference && d.date >= shift(reference, -21));
  const activities = recent.reduce((n,d)=>n+(d.daily?.training?.completed||[]).filter(sportOf).length,0);
  const dates = recent.filter(d=>(d.daily?.training?.completed||[]).some(sportOf)).map(d=>d.date).sort();
  const days = dates.length ? Math.min(21,Math.max(1,(Date.parse(reference+'T12:00:00Z')-Date.parse(dates[0]+'T12:00:00Z'))/86400000)) : 0;
  const enough = days >= 14 && activities >= 4;
  const count = enough ? Math.min(14,Math.max(1,Math.round(activities/(days/7)))) : 3;
  const message = enough ? 'Odhad '+count+' aktivit týdně z '+activities+' dokončených aktivit za '+days+' dní.'
    : (activities ? 'Historie je zatím krátká ('+activities+' aktivit, '+days+' dní).' : 'Zatím tu není historie dokončených aktivit.')+' Pro odhad potřebujeme alespoň 2 týdny a 4 aktivity. Do té doby navrhneme nejvýše 3 aktivity týdně podle dostupného času. Počet můžeš nastavit ručně.';
  return { status: enough ? 'ready' : activities ? 'short' : 'empty', activities, days, count, message };
}
export function environmentFor(date, sport, weather = null) {
  if (sport === 'gym') return { environment: 'indoor', reason: '' };
  const month = Number(date.slice(5, 7));
  const winter = [11, 12, 1, 2].includes(month);
  const poor = weather && (Number(weather.max) < (sport === 'ride' ? 8 : 0) || Number(weather.wind) >= (sport === 'ride' ? 35 : 50) || Number(weather.rain) >= 3 || Number(weather.rainProb) >= 70 || Number(weather.code) >= 95);
  const indoor = poor || (sport === 'ride' && winter);
  return { environment: indoor ? 'indoor' : 'outdoor', reason: poor ? 'Předpověď nepřeje venkovnímu tréninku.' : indoor ? 'V zimním období preferuji indoor kolo.' : weather ? 'Podle dostupné předpovědi.' : 'Předpověď není dostupná; volba vychází z ročního období.' };
}
// Weather is fetched on the server as well as in the calendar. Client data is
// never the authority for training or health constraints.
export async function weekWeather(location, start) {
  const end = shift(start, 6);
  try {
    const query = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, daily: 'weather_code,temperature_2m_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max', timezone: 'Europe/Prague', start_date: start, end_date: end });
    const r = await fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return {};
    const { daily: d } = await r.json();
    return Object.fromEntries((d?.time || []).map((date, i) => [date, { code: d.weather_code?.[i], max: d.temperature_2m_max?.[i], wind: d.wind_speed_10m_max?.[i], rain: d.precipitation_sum?.[i], rainProb: d.precipitation_probability_max?.[i] }]));
  } catch { return {}; }
}
// Indoor is shorter and so easier: no one should sit three hours on a
// trainer. Rides take 70 % of the outdoor length (at most 90 min), treadmill
// runs 80 % (at most 60 min); the intensity of the role stays.
export const INDOOR_LIMITS = { ride: { share: .7, max: 90, min: 30 }, run: { share: .8, max: 60, min: 20 } };
export function indoorMinutes(sport, minutes) {
  const rule = INDOOR_LIMITS[sport];
  return rule ? Math.max(rule.min, Math.min(rule.max, Math.round(minutes * rule.share / 5) * 5)) : minutes;
}
const weekdayOf = date => (new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7;
export function capWeekTargets(targets, prefs, days = [], weather = {}) {
  const remaining = new Map();
  for (const x of targets.items || []) {
    if (remaining.has(x.date)) continue;
    const available = availabilityOn(prefs, x.date), used = sessionsOn(days.find(d => d.date === x.date)).reduce((n, a) => n + (Number(a.durationHours) || 0) * 60, 0);
    remaining.set(x.date, available.minutes == null ? Infinity : Math.max(0, available.minutes - used));
  }
  const items = [], skipped = [], openCounts=new Map();
  for(const x of targets.items||[])openCounts.set(x.date,(openCounts.get(x.date)||0)+1);
  for (const x of targets.items || []) {
    const available = availabilityOn(prefs, x.date), own = prefs?.sessions?.[weekdayOf(x.date) + '|' + x.sport + '|' + (x.slot || 0)] || {};
    const auto = environmentFor(x.date, x.sport, weather[x.date]);
    const env = own.environment ? { environment: own.environment, reason: 'Zvoleno ručně.' } : auto;
    const open = openCounts.get(x.date);openCounts.set(x.date,open-1);
    let minutes;
    if (own.minutes) minutes = own.minutes;
    else {
      minutes = Math.min(x.minutes, remaining.get(x.date) / open);
      if (env.environment === 'indoor') minutes = Math.min(minutes, indoorMinutes(x.sport, x.minutes));
      minutes = Math.floor(minutes / 5) * 5;
      const minimum = x.sport === 'run' ? 20 : 30;
      if (minutes < minimum) { skipped.push({ ...x, reason: 'Na tento trénink nezbývá dost času.' }); continue; }
    }
    remaining.set(x.date, remaining.get(x.date) - minutes);
    items.push({ ...x, minutes, tss: Math.round(x.tss * minutes / x.minutes), ...env, autoEnvironment: auto.environment, chosenMinutes: Boolean(own.minutes), chosenEnvironment: Boolean(own.environment), window: available.window, startTime: parseTimeWindow(available.window)?.start || null });
  }
  return { ...targets, items, skipped };
}
export function proposeEmptyDays({ prefs, start, today, week = {}, focus = null, history: suppliedHistory = null }) {
  const days = prefs.days.map(d => [...d]);
  if (days.some(d => d.length)) return { ...prefs, days };
  const reference = today < start ? today : start;
  const history = (suppliedHistory || week.days || []).filter(d => d.date < reference && d.date >= shift(reference, -21));
  const frequency = { ride: 0, run: 0, gym: 0 };
  for (const d of history) for (const a of d.daily?.training?.completed || []) if(sportOf(a))frequency[sportOf(a)]++;
  const count = prefs.weeklyActivities ?? activityHistoryEstimate(history,reference).count;
  const existing = (week.days || []).filter(d => d.date >= start && d.date <= shift(start, 6)).reduce((n, d) => n + sessionsOn(d).length, 0);
  const primary = focus?.sport === 'running' ? 'run' : focus?.sport === 'strength' ? 'gym' : 'ride';
  const sports = Object.keys(frequency).filter(s=>frequency[s]>0).sort((a, b) => frequency[b] - frequency[a]);
  if (!sports.length) sports.push(primary,...(primary === 'gym' ? ['ride'] : ['gym']));
  const selected={ride:0,run:0,gym:0};
  const candidates = [0, 1, 2, 3, 4, 5, 6].filter(i => shift(start, i) >= today && prefs.availability[i].minutes >= 20 && !sessionsOn((week.days || []).find(d => d.date === shift(start, i))).length);
  let placed = 0;
  while (placed < Math.max(0, count - existing) && candidates.length) {
    candidates.sort((a, b) => {
      const score = i => (days.some((d, j) => d.length && Math.abs(i - j) === 1) ? -1000 : 0) + (prefs.availability[i].minutes || 0);
      return score(b) - score(a) || a - b;
    });
    const i = candidates.shift(), choices = prefs.availability[i].preferredSports.length ? prefs.availability[i].preferredSports : sports;
    const sport = [...choices].sort((a,b)=>(selected[a]+1)/(frequency[a]||1)-(selected[b]+1)/(frequency[b]||1))[0] || primary;
    if (prefs.availability[i].minutes < (sport === 'run' ? 20 : 30)) continue;
    days[i] = [sport]; selected[sport]++; placed++;
  }
  return { ...prefs, days };
}
export function weekProposal({ prefs, start, today, week = {}, fitness = {}, state = {}, weather = {}, focus = null, history = null }) {
  const proposedPrefs = proposeEmptyDays({ prefs, start, today, week, focus, history });
  const warnings = [], existing = (week.days || []).filter(d => d.date >= start && d.date <= shift(start, 6));
  const historyEstimate=activityHistoryEstimate(history||week.days||[],today<start?today:start);
  if(prefs.weeklyActivities==null&&historyEstimate.status!=='ready')warnings.push({text:historyEstimate.message});
  for (const d of existing.filter(d => d.date >= today)) {
    const sessions = sessionsOn(d), minutes = sessions.reduce((n, a) => n + (Number(a.durationHours) || 0) * 60, 0), available = availabilityOn(prefs, d.date);
    if (available.minutes != null && minutes > available.minutes) warnings.push({ date: d.date, text: 'Plán má ' + Math.round(minutes) + ' min, dostupných je ' + available.minutes + ' min.' });
    for (const a of d.daily?.training?.planned || []) if (sportOf(a) === 'ride' && environmentFor(d.date, 'ride', weather[d.date]).environment === 'indoor' && !/virtual|indoor/i.test(a.type + ' ' + a.name)) warnings.push({ date: d.date, text: 'Zvaž indoor variantu: ' + a.name + '.', eventId: a.id });
  }
  if (state.status && state.status !== 'active') return { prefs: proposedPrefs, items: [], warnings: [...warnings, { text: 'Stav ' + state.status + ' pozastavuje návrhy tréninků.' }], mode: 'review' };
  const wellness = (fitness.wellness || []).filter(w => w.id <= today).at(-1), ctl = Number(wellness?.ctl) || null;
  const loads = existing.map(d => ({ date: d.date, done: Number(d.daily?.training?.actualTss) || (d.daily?.training?.completed || []).reduce((n, a) => n + (Number(a.tss) || 0), 0), planned: (d.daily?.training?.planned || []).reduce((n, a) => n + (Number(a.tss) || 0), 0), sports: sessionsOn(d).map(sportOf) }));
  const roles = planWeekRoles(proposedPrefs.days, { readiness: Number(wellness?.tsb) < -20 ? 'red' : 'green' });
  let targets = weekTargets({ roles, ctl, days: loads, today, weekStart: start, lastWeekLoad: (fitness.wellness || []).filter(w => w.id >= shift(start, -7) && w.id < start).reduce((n, w) => n + (Number(w.ctlLoad) || 0), 0) });
  if (!ctl) targets = { status: 'estimated', items: roles.flatMap((d, i) => d.items.filter(x => shift(start, i) >= today && !loads[i]?.sports.includes(x.sport)).map(x => ({ ...x, date: shift(start, i), minutes: x.sport === 'run' ? 30 : 60, tss: 25 }))) };
  targets = capWeekTargets(targets, proposedPrefs, existing, weather);
  return { prefs: proposedPrefs, items: targets.items, targets, warnings, mode: existing.some(d => sessionsOn(d).length) ? 'review_and_fill' : 'fill', missingAvailability: !proposedPrefs.days.some(d => d.length) && !prefs.availability.some(d => d.minutes > 0) };
}
