import { L } from './lang.js';
import { availabilityOn, parseTimeWindow } from './training-availability.js';
import { planWeekRoles, weekTargets, weekLoadsBefore, weeklyRunCap, capRunVolume, committedRunMinutes, isRunActivity, hrvWeekTrendDown, hrvSourceRows } from './week-planner.js';
import { timeZone } from "./user-time.js";
import { weatherKitConfigured, weatherKitWeek, weatherKitHours } from "./weatherkit.js";

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
  const message = enough ? L('Odhad ', 'Estimate: ')+count+L(' aktivit týdně z ', ' activities a week from ')+activities+L(' dokončených aktivit za ', ' completed activities in ')+days+L(' dní.', ' days.')
    : (activities ? L('Historie je zatím krátká (', 'The history is still short (')+activities+L(' aktivit, ', ' activities, ')+days+L(' dní).', ' days).') : L('Zatím tu není historie dokončených aktivit.', 'There\'s no history of completed activities yet.'))+L(' Pro odhad potřebujeme alespoň 2 týdny a 4 aktivity. Do té doby navrhneme nejvýše 3 aktivity týdně podle dostupného času. Počet můžeš nastavit ručně.', ' An estimate needs at least 2 weeks and 4 activities. Until then we\'ll suggest at most 3 activities a week based on your available time. You can set the number by hand.');
  return { status: enough ? 'ready' : activities ? 'short' : 'empty', activities, days, count, message };
}
export function environmentFor(date, sport, weather = null) {
  if (sport === 'gym') return { environment: 'indoor', reason: '' };
  const month = Number(date.slice(5, 7));
  const winter = [11, 12, 1, 2].includes(month);
  const poor = weather && (Number(weather.max) < (sport === 'ride' ? 8 : 0) || Number(weather.wind) >= (sport === 'ride' ? 35 : 50) || Number(weather.rain) >= 3 || Number(weather.rainProb) >= 70 || Number(weather.code) >= 95);
  const indoor = poor || (sport === 'ride' && winter);
  return { environment: indoor ? 'indoor' : 'outdoor', reason: poor ? L('Předpověď nepřeje venkovnímu tréninku.', 'The forecast isn\'t good for training outdoors.') : indoor ? L('V zimním období preferuji indoor kolo.', 'In winter I prefer indoor riding.') : weather ? L('Podle dostupné předpovědi.', 'Based on the available forecast.') : L('Předpověď není dostupná; volba vychází z ročního období.', 'No forecast is available; the choice is based on the season.') };
}
// The reason for one day's place in the weather's detail: what decided it,
// with its number ("High of 6°, too cold outside.", "Dry, high of 14°.").
export function weatherReason(date, sport, weather) {
  const e = environmentFor(date, sport, weather);
  if (!weather) return e.reason;
  const n = v => Number.isFinite(Number(v)) && v !== null ? Math.round(Number(v)) : null;
  const max = n(weather.max), wind = n(weather.wind), chance = n(weather.rainProb), rain = Number(weather.rain);
  const mm = Number.isFinite(rain) ? String(Math.round(rain * 10) / 10) : null;
  if (Number(weather.code) >= 95) return L('Hlásí bouřky.', 'Storms are forecast.');
  if (max != null && max < (sport === 'ride' ? 8 : 0)) return L('Nejvýš ' + max + '°, venku je zima.', 'High of ' + max + '°, too cold outside.');
  if (wind != null && wind >= (sport === 'ride' ? 35 : 50)) return L('Vítr až ' + wind + ' km/h.', 'Wind up to ' + wind + ' km/h.');
  if (mm != null && rain >= 3) return L('Naprší ' + mm.replace('.', ',') + ' mm.', mm + ' mm of rain.');
  if (chance != null && chance >= 70) return L('Déšť na ' + chance + ' %.', chance + ' % chance of rain.');
  if (e.environment === 'indoor') return e.reason;
  if (max == null) return e.reason;
  return chance != null && chance >= 30 ? L('Nejvýš ' + max + '°, déšť na ' + chance + ' %.', 'High of ' + max + '°, ' + chance + ' % chance of rain.') : L('Sucho, nejvýš ' + max + '°.', 'Dry, high of ' + max + '°.');
}
// Weather is fetched on the server as well as in the calendar. Client data is
// never the authority for training or health constraints. With the WeatherKit
// key (env) it comes from Apple Weather (weatherkit.js), else from Open-Meteo.
export async function weekWeather(location, start, env = null) {
  if (!location) return {};
  const end = shift(start, 6);
  try {
    if (weatherKitConfigured(env)) return await weatherKitWeek(env, location, start);
    const query = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max', timezone: timeZone(), start_date: start, end_date: end });
    const r = await fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return {};
    const { daily: d } = await r.json();
    return Object.fromEntries((d?.time || []).map((date, i) => [date, { code: d.weather_code?.[i], max: d.temperature_2m_max?.[i], min: d.temperature_2m_min?.[i], wind: d.wind_speed_10m_max?.[i], rain: d.precipitation_sum?.[i], rainProb: d.precipitation_probability_max?.[i] }]));
  } catch { return {}; }
}
// A few hours of one day (8, 11, 14, 17 and 20 h) for the weather card on Today.
export const DAY_HOURS = [8, 11, 14, 17, 20];
export function pickHours(hourly, date) {
  const out = [];
  for (const h of DAY_HOURS) {
    const i = (hourly?.time || []).indexOf(date + 'T' + String(h).padStart(2, '0') + ':00');
    const t = Number(hourly?.temperature_2m?.[i]);
    if (i >= 0 && Number.isFinite(t)) out.push({ hour: h, temp: Math.round(t), code: Number.isFinite(Number(hourly.weather_code?.[i])) ? Number(hourly.weather_code[i]) : null });
  }
  return out;
}
export async function dayHours(location, date, env = null) {
  if (!location) return [];
  if (weatherKitConfigured(env)) return pickHours(await weatherKitHours(env, location, date), date);
  const query = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, hourly: 'temperature_2m,weather_code', timezone: timeZone(), start_date: date, end_date: date });
  const r = await fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('no forecast');
  return pickHours((await r.json()).hourly, date);
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
// Without fitness data: the open chips at 30 min of running or 60 of riding.
export function estimatedTargets(roles, start, today, loads = []) {
  return { status: 'estimated', items: roles.flatMap((d, i) => d.items.filter(x => shift(start, i) >= today && !loads[i]?.sports?.includes(x.sport)).map(x => ({ ...x, date: shift(start, i), minutes: x.sport === 'run' ? 30 : 60, tss: 25 }))) };
}
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
    const env = own.environment ? { environment: own.environment, reason: L('Zvoleno ručně.', 'Chosen by hand.') } : auto;
    const open = openCounts.get(x.date);openCounts.set(x.date,open-1);
    let minutes;
    if (own.minutes) minutes = own.minutes;
    else {
      minutes = Math.min(x.minutes, remaining.get(x.date) / open);
      if (env.environment === 'indoor') minutes = Math.min(minutes, indoorMinutes(x.sport, x.minutes));
      minutes = Math.floor(minutes / 5) * 5;
      const minimum = x.sport === 'run' ? 20 : 30;
      if (minutes < minimum) { skipped.push({ ...x, reason: L('Na tento trénink nezbývá dost času.', 'There isn\'t enough time left for this workout.') }); continue; }
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
// A training plan (training-plans.js) comes in as `plan`: { roles } for
// planWeekRoles, { load } for weekTargets and apply(targets) for its sessions.
// strain: the athlete's state (week-check.js strainOf, level 0–2): strained
// allows one quality day and holds the load, tired allows none.
export function weekProposal({ prefs, start, today, week = {}, fitness = {}, state = {}, weather = {}, focus = null, history = null, plan = null, health = null, strain = null }) {
  const proposedPrefs = proposeEmptyDays({ prefs, start, today, week, focus, history });
  const warnings = [], existing = (week.days || []).filter(d => d.date >= start && d.date <= shift(start, 6));
  const historyEstimate=activityHistoryEstimate(history||week.days||[],today<start?today:start);
  if(prefs.weeklyActivities==null&&historyEstimate.status!=='ready')warnings.push({text:historyEstimate.message});
  for (const d of existing.filter(d => d.date >= today)) {
    const sessions = sessionsOn(d), minutes = sessions.reduce((n, a) => n + (Number(a.durationHours) || 0) * 60, 0), available = availabilityOn(prefs, d.date);
    if (available.minutes != null && minutes > available.minutes) warnings.push({ date: d.date, text: L('Plán má ', 'The plan has ') + Math.round(minutes) + L(' min, dostupných je ', ' min, you have ') + available.minutes + L(' min.', ' min available.') });
    for (const a of d.daily?.training?.planned || []) if (sportOf(a) === 'ride' && environmentFor(d.date, 'ride', weather[d.date]).environment === 'indoor' && !/virtual|indoor/i.test(a.type + ' ' + a.name)) warnings.push({ date: d.date, text: L('Zvaž indoor variantu: ', 'Consider an indoor version: ') + a.name + '.', eventId: a.id });
  }
  if (state.status && state.status !== 'active') return { prefs: proposedPrefs, items: [], warnings: [...warnings, { text: L('Stav ', 'Status ') + state.status + L(' pozastavuje návrhy tréninků.', ' pauses workout proposals.') }], mode: 'review' };
  const wellness = (fitness.wellness || []).filter(w => w.id <= today).at(-1), ctl = Number(wellness?.ctl) || null;
  const loads = existing.map(d => ({ date: d.date, done: Number(d.daily?.training?.actualTss) || (d.daily?.training?.completed || []).reduce((n, a) => n + (Number(a.tss) || 0), 0), planned: (d.daily?.training?.planned || []).reduce((n, a) => n + (Number(a.tss) || 0), 0), sports: sessionsOn(d).map(sportOf) }));
  const level = strain?.level || 0;
  const roles = planWeekRoles(proposedPrefs.days, { readiness: Number(wellness?.tsb) < -20 || level >= 2 ? 'red' : level >= 1 ? 'yellow' : 'green', ...(plan?.roles || {}) });
  const withPlan = t => plan?.apply ? plan.apply(t) : t;
  // Running this week so far (done, and planned still ahead or today) counts against the weekly running cap.
  const runOf = list => (list || []).filter(isRunActivity).reduce((m, a) => m + (Number(a.durationHours) || 0) * 60, 0);
  const runCommitted = existing.reduce((n, d) => n + committedRunMinutes(d.date, today, runOf(d.daily?.training?.planned), runOf(d.daily?.training?.completed)), 0);
  let targets = capRunVolume(withPlan(weekTargets({ plan: plan?.load || null, strained: level >= 1, roles, ctl, days: loads, today, weekStart: start, weekLoads: weekLoadsBefore(fitness.wellness || [], start), hrvDown: hrvWeekTrendDown(hrvSourceRows(fitness.wellness, health?.wellness, start), start), rampRate: [...(fitness.wellness || [])].reverse().find(r => Number.isFinite(Number(r.rampRate)))?.rampRate ?? null, lastWeekLoad: (fitness.wellness || []).filter(w => w.id >= shift(start, -7) && w.id < start).reduce((n, w) => n + (Number(w.ctlLoad) || 0), 0) })), history ? weeklyRunCap(history, start) : null, runCommitted);
  // Without fitness data the estimate keeps the same running cap: a beginner's
  // runs share the floor (60 min a week) or what the recent weeks allow.
  if (!ctl) targets = capRunVolume(withPlan(estimatedTargets(roles, start, today, loads)), weeklyRunCap(history || [], start), runCommitted);
  targets = capWeekTargets(targets, proposedPrefs, existing, weather);
  return { prefs: proposedPrefs, items: targets.items, targets, warnings, mode: existing.some(d => sessionsOn(d).length) ? 'review_and_fill' : 'fill', missingAvailability: !proposedPrefs.days.some(d => d.length) && !prefs.availability.some(d => d.minutes > 0) };
}
