// The coach's message in race week (redesign concept 09 page 8, AI-5 and
// AI-7, 2026-11-16): a server template with numbers from the rules, never the
// model's. A running race for now (the concept's example; a ride or swim race
// follows the same way later).
// - Fuel and drinks (sports-nutritionist 2026-11-25; Burke 2011 IOC consensus,
//   Thomas 2016 ACSM, Hew-Butler 2015): from a 90 minute race carb-rich meals the
//   day before at 8 g per kg, a marathon 10 g per kg on each of the two days
//   before; breakfast two hours before 1 g per kg up to 10 km, 1.5 g per kg
//   longer; during a race of an hour or more the app's carbsPerHour table
//   (workout-explanation.js, capped by experience) as a 25 g gel every
//   1500 / perHour minutes with 150 ml of water; otherwise drink to thirst.
//   All labelled estimates.
// - Pacing (running-coach, concept page 8): the race pace from the threshold
//   pace (race-estimate.js), the first quarter 1.5 % of the pace slower, the
//   last quarter 1.5 % faster: "Start easy, finish strong." No pacing without a threshold
//   pace: a guess would be a promise.
// No line says "You used these gels": the food log is not matched yet (AI-5).
import { L, paceText } from './lang.js';
import { carbsPerHour } from './workout-explanation.js';
import { runRaceSeconds } from './race-estimate.js';

export const RACE_WEEK_DAYS = 6;
const LOADING_MINUTES = 90;
// Under an hour no carbohydrate during the race (Burke 2011: a little or a mouth rinse).
const FUEL_MINUTES = 60;
const GEL_GRAMS = 25;
// The first and last quarter 1.5 % of the pace slower and faster (running-coach 2026-11-25: 4 s at 4:00/km, 5 s at 5:00, 6 s at 7:00).
const SPLIT_SHARE = 0.015;

const systemOf = km => km <= 10 ? 'threshold' : km <= 21.1 ? 'tempo' : 'endurance';
const hm = m => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`; };

const tens = g => Math.round(g / 10) * 10;
function fuel({ minutes, km, weightKg, experience }) {
  const kg = Number(weightKg) > 0 ? Number(weightKg) : null, marathon = km >= 42;
  const perHour = minutes >= FUEL_MINUTES ? carbsPerHour(minutes, systemOf(km), 'run', experience) || 0 : 0;
  const rows = [];
  if (minutes >= LOADING_MINUTES) {
    const perKg = marathon ? 10 : 8, grams = kg ? L(`asi ${tens(kg * perKg)} g sacharidů (${perKg} g na kg)`, `about ${tens(kg * perKg)} g of carbs (${perKg} g per kg)`) : L(`asi ${perKg} g sacharidů na kg`, `about ${perKg} g of carbs per kg`);
    rows.push({ when: 'day_before', title: marathon ? L('Dva dny před: jídla bohatá na sacharidy, která znáš', 'Two days before: carb-rich, familiar meals') : L('Den před: jídla bohatá na sacharidy, která znáš', 'Day before: carb-rich, familiar meals'),
      text: grams + (marathon ? L(' každý den, dřívější večeře, málo vlákniny', ' each day, early dinner, little fibre') : L(', dřívější večeře, málo vlákniny', ', early dinner, little fibre')) });
  }
  const breakfast = kg ? tens(kg * (km <= 10 ? 1 : 1.5)) : km <= 10 ? 70 : 100;
  rows.push({ when: 'breakfast', title: L('Snídaně, kterou znáš', 'A breakfast you know'), text: L(`asi ${breakfast} g sacharidů, dvě hodiny před startem`, `about ${breakfast} g of carbs, two hours before the start`) });
  let gels = [];
  if (perHour > 0) {
    // A gel holds about 25 g: one every 1500 / perHour minutes, rounded to 5.
    const every = Math.max(15, Math.round(GEL_GRAMS * 60 / perHour / 5) * 5);
    for (let t = every; t < minutes - 10; t += every) gels.push(t);
    rows.push({ when: 'race', title: gels.length ? L(`Gel v ${gels.join(', ')} min`, `Gel at ${gels.join(', ')} min`) : L('Sacharidy během závodu', 'Carbs during the race'), text: L(`asi ${perHour} g sacharidů za hodinu`, `about ${perHour} g of carbs per hour`), perHour, gelsAt: gels });
  }
  rows.push({ when: 'drink', title: L('Voda, pij podle žízně', 'Water, drink to thirst'), text: gels.length ? L('ke každému gelu 150 ml vody, jinak podle žízně', '150 ml of water with each gel, otherwise drink to thirst') : L('pár doušků na občerstvovačkách', 'a few sips at the stations') });
  return { rows, note: L('Jsou to odhady, ne lékařská rada. V den závodu nic nového.', 'Estimates, not medical advice. Nothing new on race day.'),
    from: L('Z tvé váhy, délky závodu a odhadu času', 'From your weight, the race length and your estimated time') };
}

function pacing(km, seconds) {
  const avg = Math.round(seconds / km), split = Math.round(avg * SPLIT_SHARE), first = Math.max(1, Math.round(km / 4)), last = first;
  if (km < 3 || first + last >= km) return null;
  const mid = Math.floor(km) - last;
  return {
    targetSeconds: seconds, averagePace: avg, line: L('Začni lehce, dokonči silně.', 'Start easy, finish strong.'),
    segments: [
      { fromKm: 1, toKm: first, pace: avg + split, cue: L('Začni klidně, šetři nohy', 'Start calm, save your legs') },
      { fromKm: first + 1, toKm: mid, pace: avg, cue: L('Najdi si svůj rytmus', 'Settle into your rhythm') },
      { fromKm: mid + 1, toKm: km, pace: avg - split, cue: L('Cítíš se silný? Přidej', 'Feeling strong? Pick up the pace') }
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
    // The last two days only easy running: race pace belongs to days 6 to 3 (Bosquet 2007).
    text: headline + '\n\n' + (n <= 2 ? L('Lehké běhání a pár krátkých rovinek udrží nohy svěží.', 'Easy running and a few short strides keep the legs fresh.') : L('Trocha závodního tempa udrží nohy svěží.', 'A little race pace keeps the legs sharp.')),
    chips: [L('Jídlo a pití', 'Fuel and drinks'), ...(seconds ? [L('Plán tempa', 'Pacing plan')] : [])],
    fuel: fuel({ minutes, km, weightKg, experience }),
    ...(seconds ? { pacing: pacing(km, seconds) } : {})
  };
}
