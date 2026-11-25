// The coach's message in race week (redesign concept 09 page 8, AI-5 and
// AI-7, 2026-11-16): a server template with numbers from the rules, never the
// model's. A running race for now (the concept's example; a ride or swim race
// follows the same way later).
// - Fuel and drinks (sports-nutritionist, concept review 2026-11-16): the day
//   before carb-rich, about 6 to 8 g per kg, only for a race of 90 minutes or
//   more (no two-day loading); breakfast about 100 g of carbohydrate two hours
//   before the start; during the race the app's own carbsPerHour table
//   (workout-explanation.js, capped by experience); drink to thirst. All
//   labelled estimates.
// - Pacing (running-coach, concept page 8): the race pace from the threshold
//   pace (race-estimate.js), the first quarter 5 s/km slower, the last quarter
//   5 s/km faster: "Start easy, finish strong." No pacing without a threshold
//   pace: a guess would be a promise.
// No line says "You used these gels": the food log is not matched yet (AI-5).
import { L, paceText } from './lang.js';
import { carbsPerHour } from './workout-explanation.js';
import { runRaceSeconds } from './race-estimate.js';

export const RACE_WEEK_DAYS = 6;
const LOADING_MINUTES = 90;
const SPLIT_SECONDS = 5;
const GEL_EVERY = 30;

const systemOf = km => km <= 10 ? 'threshold' : km <= 21.1 ? 'tempo' : 'endurance';
const hm = m => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`; };

function fuel({ minutes, km, weightKg, experience }) {
  const perHour = carbsPerHour(minutes, systemOf(km), 'run', experience) || 0;
  const rows = [];
  if (minutes >= LOADING_MINUTES) {
    const kg = Number(weightKg) > 0 ? Number(weightKg) : null;
    rows.push({ when: 'day_before', title: L('Den před: jídla bohatá na sacharidy, která znáš', 'Day before: carb-rich, familiar meals'),
      text: kg ? L(`asi ${Math.round(kg * 6 / 10) * 10} až ${Math.round(kg * 8 / 10) * 10} g sacharidů (6 až 8 g na kg), dřívější večeře, málo vlákniny`, `about ${Math.round(kg * 6 / 10) * 10} to ${Math.round(kg * 8 / 10) * 10} g of carbs (6 to 8 g per kg), early dinner, little fibre`)
        : L('asi 6 až 8 g sacharidů na kg, dřívější večeře, málo vlákniny', 'about 6 to 8 g of carbs per kg, early dinner, little fibre') });
  }
  rows.push({ when: 'breakfast', title: L('Snídaně, kterou znáš', 'A breakfast you know'), text: L('asi 100 g sacharidů, dvě hodiny před startem', 'about 100 g of carbs, two hours before the start') });
  if (perHour > 0) {
    const gels = []; for (let t = GEL_EVERY; t < minutes - 10; t += GEL_EVERY) gels.push(t);
    rows.push({ when: 'race', title: gels.length ? L(`Gel v ${gels.join(', ')} min`, `Gel at ${gels.join(', ')} min`) : L('Sacharidy během závodu', 'Carbs during the race'), text: L(`asi ${perHour} g sacharidů za hodinu`, `about ${perHour} g of carbs per hour`), perHour, gelsAt: gels });
  }
  rows.push({ when: 'drink', title: L('Voda, pij podle žízně', 'Water, drink to thirst'), text: L('pár doušků na občerstvovačkách', 'a few sips at the stations') });
  return { rows, note: L('Jsou to odhady, ne lékařská rada. V den závodu nic nového.', 'Estimates, not medical advice. Nothing new on race day.'),
    from: L('Z tvé váhy, délky závodu a odhadu času', 'From your weight, the race length and your estimated time') };
}

function pacing(km, seconds) {
  const avg = Math.round(seconds / km), first = Math.max(1, Math.round(km / 4)), last = first;
  if (km < 3 || first + last >= km) return null;
  const mid = Math.floor(km) - last;
  return {
    targetSeconds: seconds, averagePace: avg, line: L('Začni lehce, dokonči silně.', 'Start easy, finish strong.'),
    segments: [
      { fromKm: 1, toKm: first, pace: avg + SPLIT_SECONDS, cue: L('Začni klidně, šetři nohy', 'Start calm, save your legs') },
      { fromKm: first + 1, toKm: mid, pace: avg, cue: L('Najdi si svůj rytmus', 'Settle into your rhythm') },
      { fromKm: mid + 1, toKm: km, pace: avg - SPLIT_SECONDS, cue: L('Cítíš se silný? Přidej', 'Feeling strong? Pick up the pace') }
    ].map(s => ({ ...s, paceText: paceText(s.pace) })),
    from: L('Z tvého prahového tempa. Odhad, ne slib.', 'From your threshold pace. An estimate, not a promise.')
  };
}

// The race week message, or null outside a running race's last six days.
// focus: athleteFocus() (its event), thresholdPace in s/km.
export function raceWeek({ focus, thresholdPace = null, weightKg = null, experience = null }) {
  const e = focus?.event;
  if (!e || e.sport !== 'run' || !(Number(e.km) > 0) || e.daysLeft == null || e.daysLeft < 0 || e.daysLeft > RACE_WEEK_DAYS) return null;
  const km = Number(e.km), seconds = runRaceSeconds(km, thresholdPace);
  // Without a threshold pace the fuel plan still needs a length: 6:40/km, as the plans' race day (training-plans.js raceMinutes).
  const minutes = seconds ? seconds / 60 : km * 400 / 60;
  const n = e.daysLeft;
  const headline = n === 0 ? L('Dnes je závod. Práce je hotová.', 'Race day. The work is done.')
    : L(`Do závodu ${n === 1 ? 'zbývá 1 den' : n < 5 ? `zbývají ${n} dny` : `zbývá ${n} dní`}. Práce je hotová.`, `${n} ${n === 1 ? 'day' : 'days'} to go. The work is done.`);
  return {
    race: { name: e.name || null, date: e.date || null, km, daysLeft: n, ...(seconds ? { estimate: hm(seconds / 60) } : {}) },
    text: headline + '\n\n' + L('Trocha závodního tempa udrží nohy svěží.', 'A little race pace keeps the legs sharp.'),
    chips: [L('Jídlo a pití', 'Fuel and drinks'), ...(seconds ? [L('Plán tempa', 'Pacing plan')] : [])],
    fuel: fuel({ minutes, km, weightKg, experience }),
    ...(seconds ? { pacing: pacing(km, seconds) } : {})
  };
}
