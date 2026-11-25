// The coach's message in race week (redesign concept 09 page 8, AI-5 and
// AI-7, 2026-11-16): a server template with numbers from the rules, never the
// model's. A running, cycling or open-water swimming race ("the same way for a
// ride or a swim", page 8); a triathlon has its own plan.
// - Fuel and drinks (sports-nutritionist 2026-11-25; Burke 2011 IOC consensus,
//   Thomas 2016 ACSM, Jeukendrup 2014, Hew-Butler 2015): from a 90 minute race
//   carb-rich meals the day before at 8 g per kg; a marathon, and a ride or swim
//   of 4 h or more, 10 g per kg on each of the two days before. Breakfast: run
//   1 g per kg up to 10 km, 1.5 g longer, two hours before; ride 2 g per kg two
//   to three hours before; swim 1 g per kg, 1.5 g from 90 min. During: a run or
//   ride of an hour or more the app's carbsPerHour table (workout-explanation.js,
//   capped by experience); a ride's food timed for a 15 % slower day (running out
//   costs more than a spare gel); a swim only from 90 min, 30 g every 30 min
//   where the race has feeds. Drink to thirst. Then a meal with carbs and
//   protein. All labelled estimates.
// - Pacing, only from the athlete's own threshold (a guess would be a promise):
//   run (running-coach): race pace from the threshold pace (race-estimate.js),
//   the first quarter 1.5 % slower, the last 1.5 % faster. Ride (cycling-coach
//   2026-11-25): rideRace's gran fondo power from the FTP, the first quarter at
//   65 %, the middle 65–75 %, the last quarter up to 75 % (70 % over five
//   hours), long climbs under 80 % FTP. Swim (swimming-coach 2026-11-25): the
//   open-water pace from the CSS, the first 100 m 2 % faster up to 3 km, the
//   last quarter 1.5 % faster, one line under 1000 m.
// - Taper lines by sport for days 6–3 and 2–1, a warm-up line on race day
//   (Bosquet 2007, Mujika & Padilla 2003).
// No line says "You used these gels": the food log is not matched yet (AI-5).
import { L, paceText } from './lang.js';
import { carbsPerHour } from './workout-explanation.js';
import { runRaceSeconds, rideRace } from './race-estimate.js';
import { openWaterPace } from './training-plans.js';

export const RACE_WEEK_DAYS = 6;
export const RACE_WEEK_SPORTS = ['run', 'ride', 'swim'];
const LOADING_MINUTES = 90;
const LONG_LOADING_MINUTES = 240;
// Under an hour no carbohydrate during the race (Burke 2011: a little or a mouth rinse).
const FUEL_MINUTES = 60;
const GEL_GRAMS = 25;
// The first and last quarter 1.5 % of the pace slower and faster (running-coach 2026-11-25: 4 s at 4:00/km, 5 s at 5:00, 6 s at 7:00).
const SPLIT_SHARE = 0.015;
// A ride's food for a day this much slower than the flat-road estimate (climbing, wind, stops).
const RIDE_SLOWER = 1.15;
const RIDE_CLIMB_SHARE = 0.8;
const RIDE_LONG_MINUTES = 300;
// A swim: feeds every 30 min from 90 min, 30 g each; over 8 h a personal plan.
const SWIM_FEED_MINUTES = 90, SWIM_FEED_EVERY = 30, SWIM_FEED_GRAMS = 30, SWIM_CREW_MINUTES = 480;
const SWIM_FAST_START = 0.02, SWIM_FAST_START_METERS = 3000;

const systemOf = km => km <= 10 ? 'threshold' : km <= 21.1 ? 'tempo' : 'endurance';
const hm = minutes => { const m = Math.round(minutes), h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ` ${r} min` : ''}` : `${r} min`; };
const tens = g => Math.round(g / 10) * 10;
const round5 = n => Math.round(n / 5) * 5;
const swimPace = s => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function loading(kg, minutes, twoDays) {
  if (minutes < LOADING_MINUTES) return null;
  const perKg = twoDays ? 10 : 8, grams = kg ? L(`asi ${tens(kg * perKg)} g sacharidů (${perKg} g na kg)`, `about ${tens(kg * perKg)} g of carbs (${perKg} g per kg)`) : L(`asi ${perKg} g sacharidů na kg`, `about ${perKg} g of carbs per kg`);
  return { when: 'day_before', title: twoDays ? L('Dva dny před: jídla bohatá na sacharidy, která znáš', 'Two days before: carb-rich, familiar meals') : L('Den před: jídla bohatá na sacharidy, která znáš', 'Day before: carb-rich, familiar meals'),
    text: grams + (twoDays ? L(' každý den, dřívější večeře, málo vlákniny', ' each day, early dinner, little fibre') : L(', dřívější večeře, málo vlákniny', ', early dinner, little fibre')) };
}
const breakfastRow = (grams, ride) => ({ when: 'breakfast', title: L('Snídaně, kterou znáš', 'A breakfast you know'),
  text: ride ? L(`asi ${grams} g sacharidů, dvě až tři hodiny před startem`, `about ${grams} g of carbs, two to three hours before the start`) : L(`asi ${grams} g sacharidů, dvě hodiny před startem`, `about ${grams} g of carbs, two hours before the start`) });
const afterRow = () => ({ when: 'after', title: L('Po závodě', 'After the race'), text: L('jídlo se sacharidy a bílkovinami', 'a meal with carbs and protein') });
const NOTE = () => L('Jsou to odhady, ne lékařská rada. V den závodu nic nového.', 'Estimates, not medical advice. Nothing new on race day.');

function runFuel({ minutes, km, kg, experience }) {
  const perHour = minutes >= FUEL_MINUTES ? carbsPerHour(minutes, systemOf(km), 'run', experience) || 0 : 0;
  const rows = [loading(kg, minutes, km >= 42), breakfastRow(kg ? tens(kg * (km <= 10 ? 1 : 1.5)) : km <= 10 ? 70 : 100)].filter(Boolean);
  let gels = [];
  if (perHour > 0) {
    // A gel holds about 25 g: one every 1500 / perHour minutes, rounded to 5.
    const every = Math.max(15, round5(GEL_GRAMS * 60 / perHour));
    for (let t = every; t < minutes - 10; t += every) gels.push(t);
    rows.push({ when: 'race', title: gels.length ? L(`Gel v ${gels.join(', ')} min`, `Gel at ${gels.join(', ')} min`) : L('Sacharidy během závodu', 'Carbs during the race'), text: L(`asi ${perHour} g sacharidů za hodinu`, `about ${perHour} g of carbs per hour`), perHour, gelsAt: gels });
  }
  rows.push({ when: 'drink', title: L('Voda, pij podle žízně', 'Water, drink to thirst'), text: gels.length ? L('ke každému gelu 150 ml vody, jinak podle žízně', '150 ml of water with each gel, otherwise drink to thirst') : L('pár doušků na občerstvovačkách', 'a few sips at the stations') }, afterRow());
  return { rows, note: NOTE(), from: L('Z tvé váhy, délky závodu a odhadu času', 'From your weight, the race length and your estimated time') };
}

function rideFuel({ minutes, kg, experience }) {
  const long = minutes * RIDE_SLOWER, perHour = long >= FUEL_MINUTES ? carbsPerHour(long, 'endurance', 'ride', experience) || 0 : 0;
  const rows = [loading(kg, minutes, minutes >= LONG_LOADING_MINUTES), breakfastRow(kg ? tens(kg * 2) : 140, true)].filter(Boolean);
  if (perHour > 0) {
    const every = Math.max(15, round5(GEL_GRAMS * 60 / perHour));
    rows.push({ when: 'race', title: L(`Každých ${every} min gel nebo půl tyčinky`, `A gel or half a bar every ${every} min`),
      text: L(`asi ${perHour} g sacharidů za hodinu, začni do 30 minut`, `about ${perHour} g of carbs an hour, start within the first 30 min`) + (perHour > 60 ? L(', gely nebo nápoj s glukózou i fruktózou', ', gels or drinks with glucose and fructose') : ''), perHour, every });
  }
  rows.push({ when: 'drink', title: L('Pij podle žízně', 'Drink to thirst'), text: L('asi 500 až 750 ml za hodinu, v horku víc', 'about 500 to 750 ml an hour, more in the heat') + (minutes >= 120 ? L(', v horku nápoj se solí', ', a drink with salt in the heat') : '') }, afterRow());
  return { rows, note: NOTE() + ' ' + L('Víc stoupání znamená víc času: jez dál podle plánu.', 'More climbing means more time: keep eating on schedule.'),
    from: L('Z tvé váhy, délky závodu a odhadu času', 'From your weight, the race length and your estimated time') };
}

function swimFuel({ minutes, kg }) {
  const rows = [loading(kg, minutes, minutes >= LONG_LOADING_MINUTES), breakfastRow(kg ? tens(kg * (minutes < SWIM_FEED_MINUTES ? 1 : 1.5)) : minutes < SWIM_FEED_MINUTES ? 70 : 100)].filter(Boolean);
  if (minutes >= SWIM_FEED_MINUTES) {
    rows.push({ when: 'start', title: L('Gel 15 min před startem', 'A gel 15 min before the start'), text: L('jen takový, který znáš', 'only one you have tried') });
    rows.push({ when: 'race', title: L(`Každých ${SWIM_FEED_EVERY} min ${SWIM_FEED_GRAMS} g sacharidů`, `${SWIM_FEED_GRAMS} g of carbs every ${SWIM_FEED_EVERY} min`),
      text: L('gel s pár doušky vody nebo asi 400 ml sportovního nápoje, kde to pravidla závodu dovolí', 'a gel with a few sips of water or about 400 ml of sports drink, where the race allows feeds') + (minutes >= SWIM_CREW_MINUTES ? L('; nad 8 hodin potřebuješ vlastní plán krmení a doprovod', '; over 8 hours you need your own feeding plan and a support crew') : ''), perHour: SWIM_FEED_GRAMS * 60 / SWIM_FEED_EVERY, every: SWIM_FEED_EVERY });
  }
  rows.push({ when: 'drink', title: L('Pij podle žízně', 'Drink to thirst'), text: L('před startem a po doplavání', 'before the start and after the finish') }, afterRow());
  return { rows, note: NOTE() + ' ' + L('V den závodu si ověř, jestli jsou povolené neopreny a jak studená je voda. Žádný nový neopren, brýle ani čepice.', 'Check on the day whether wetsuits are allowed and how cold the water is. No new wetsuit, goggles or cap.'),
    from: L('Z tvé váhy, délky závodu a odhadu času', 'From your weight, the race length and your estimated time') };
}

function runPacing(km, seconds) {
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

function ridePacing(km, ride, ftp) {
  const first = Math.max(1, Math.round(km / 4)), mid = Math.floor(km) - first;
  if (first * 2 >= km) return null;
  // Over five hours the last quarter stays at 70 % (cycling-coach 2026-11-25).
  const top = ride.minutes > RIDE_LONG_MINUTES ? Math.round(ftp * 0.7) : ride.high, climb = Math.round(ftp * RIDE_CLIMB_SHARE);
  return {
    targetMinutes: ride.minutes, low: ride.low, high: top, climbWatts: climb, line: L('Začni lehce, dokonči silně.', 'Start easy, finish strong.'),
    segments: [
      { fromKm: 1, toKm: first, watts: ride.low, wattsText: `${ride.low} W`, cue: L('Začni klidně, nech skupinu usadit', 'Start calm, let the group settle') },
      { fromKm: first + 1, toKm: mid, watts: ride.low, wattsTo: top, wattsText: `${ride.low}–${top} W`, cue: L('Najdi si svůj rytmus', 'Settle into your rhythm') },
      { fromKm: mid + 1, toKm: km, watts: top, wattsText: L(`do ${top} W`, `up to ${top} W`), cue: L(`Cítíš se silný? Přidej na ${top} W`, `Feeling strong? Lift to ${top} W`) }
    ],
    climb: L(`Dlouhé stoupání pod ${climb} W, krátké prudké rampy nevadí.`, `On long climbs stay under ${climb} W, brief steep ramps are fine.`),
    from: L('Z tvého FTP. V horku nebo ve výšce jeď podle pocitu. Odhad, ne slib.', 'From your FTP. In heat or at altitude ride by feel. An estimate, not a promise.')
  };
}

function swimPacing(meters, pace) {
  const sight = L('Zvedni oči každých 8 až 10 temp, častěji u bójí, ve vlnách a v davu.', 'Lift your eyes every 8 to 10 strokes, more often near buoys, in chop and in a crowd.');
  const from = L('Z tvého CSS. Odhad, ne slib.', 'From your CSS. An estimate, not a promise.');
  const seg = (fromM, toM, p, cue) => ({ fromM, toM, pace: Math.round(p), paceText: swimPace(p) + ' /100 m', cue });
  if (meters < 1000) return { averagePace: Math.round(pace), line: L('Najdi volnou vodu a drž svoje tempo.', 'Find clear water, then hold your stroke.'), segments: [seg(0, meters, pace, L('Najdi volnou vodu a drž svoje tempo', 'Find clear water, then hold your stroke'))], sight, from };
  const last = Math.round(meters * 0.75 / 50) * 50, fast = meters <= SWIM_FAST_START_METERS;
  return {
    averagePace: Math.round(pace), line: L('Začni lehce, dokonči silně.', 'Start easy, finish strong.'),
    segments: [
      seg(0, 100, fast ? pace * (1 - SWIM_FAST_START) : pace, fast ? L('Rychlý start, najdi volnou vodu', 'Fast start, find clear water') : L('Začni pod kontrolou, najdi volnou vodu', 'Start controlled, find clear water')),
      seg(100, last, pace, L('Usaď se ve svém tempu', 'Settle into your stroke')),
      seg(last, meters, pace * (1 - SPLIT_SHARE), L('Cítíš se silný? Přidej', 'Feeling strong? Lift the pace'))
    ], sight, from
  };
}

const TAPER = () => ({
  run: [L('Trocha závodního tempa udrží nohy svěží.', 'A little race pace keeps the legs sharp.'), L('Lehké běhání a pár krátkých rovinek udrží nohy svěží.', 'Easy running and a few short strides keep the legs fresh.'), L('Rozcvič se lehce, s pár krátkými rovinkami.', 'Warm up easily, with a few short strides.')],
  ride: [L('Krátké lehké jízdy s pár krátkými ostřejšími úseky udrží nohy svěží.', 'Keep rides short and easy, with a few short harder efforts to keep the legs sharp.'), L('Lehké točení a pár krátkých otvíráků udrží nohy svěží.', 'Easy spinning and a few short openers keep the legs fresh.'), L('Rozjeď se lehce, se dvěma krátkými otvíráky.', 'Warm up easily, with two short openers.')],
  swim: [L('Pár krátkých sérií v závodním tempu tě udrží ostrého.', 'A few short sets at race pace keep you sharp.'), L('Lehké plavání s pár uvolněnými rychlými pětadvacítkami tě udrží uvolněného.', 'Easy swimming with a few relaxed fast 25s keeps you loose.'), L('Rozplav se lehce, pokud to pořadatel dovolí.', 'Warm up easily if the organiser allows it.')]
});

// The race week message, or null outside a run, ride or swim race's last six days.
// focus: athleteFocus() (its event); thresholdPace in s/km, ftp in W, swimCss in s/100 m.
export function raceWeek({ focus, thresholdPace = null, ftp = null, swimCss = null, weightKg = null, experience = null }) {
  const e = focus?.event;
  if (!e || !RACE_WEEK_SPORTS.includes(e.sport) || !(Number(e.km) > 0) || e.daysLeft == null || e.daysLeft < 0 || e.daysLeft > RACE_WEEK_DAYS) return null;
  const km = Number(e.km), kg = Number(weightKg) > 0 ? Number(weightKg) : null, n = e.daysLeft;
  let minutes, estimate = null, fuel, pacing = null;
  if (e.sport === 'run') {
    const seconds = runRaceSeconds(km, thresholdPace);
    // Without a threshold pace the fuel plan still needs a length: 6:40/km, as the plans' race day (training-plans.js raceMinutes).
    minutes = seconds ? seconds / 60 : km * 400 / 60;
    if (seconds) { estimate = seconds / 60; pacing = runPacing(km, seconds); }
    fuel = runFuel({ minutes, km, kg, experience });
  } else if (e.sport === 'ride') {
    // No course is known: a road gran fondo; without an FTP rideRace's 2.5 W/kg times the food, never the pacing.
    const ride = rideRace('granfondo', km, { ftp, weight: kg });
    minutes = ride.minutes;
    if (!ride.estimated) { estimate = minutes; pacing = ridePacing(km, ride, Number(ftp)); }
    fuel = rideFuel({ minutes, kg, experience });
  } else {
    const meters = Math.round(km * 1000), css = Number(swimCss) >= 60 && Number(swimCss) <= 240 ? Number(swimCss) : null, pace = openWaterPace(meters, css);
    minutes = meters / 100 * pace / 60;
    if (css) { estimate = minutes; pacing = swimPacing(meters, pace); }
    fuel = swimFuel({ minutes, kg });
  }
  const headline = n === 0 ? L('Dnes je závod. Práce je hotová.', 'Race day. The work is done.')
    : L(`Do závodu ${n === 1 ? 'zbývá 1 den' : n < 5 ? `zbývají ${n} dny` : `zbývá ${n} dní`}. Práce je hotová.`, `${n} ${n === 1 ? 'day' : 'days'} to go. The work is done.`);
  // The last two days only easy work: race pace belongs to days 6 to 3 (Bosquet 2007).
  const taper = TAPER()[e.sport][n === 0 ? 2 : n <= 2 ? 1 : 0];
  return {
    race: { name: e.name || null, date: e.date || null, sport: e.sport, km, daysLeft: n, ...(estimate ? { estimate: hm(estimate) } : {}) },
    text: headline + '\n\n' + taper,
    chips: [L('Jídlo a pití', 'Fuel and drinks'), ...(pacing ? [L('Plán tempa', 'Pacing plan')] : [])],
    fuel,
    ...(pacing ? { pacing } : {})
  };
}

// The race week's first message as a new chat (state.posted.race = the race's
// day): the text only, the card's numbers come from GET /app/api/coach/race-week.
export async function postRaceWeek(db, week) {
  if (!week?.race?.date) return null;
  // Loaded here: the coach's context (coach-assistant.js) imports raceWeek, and these import it back.
  const [{ ensureAssistantChats }, { updateAthleteState }] = await Promise.all([import('./assistant-chats.js'), import('./athlete-state.js')]);
  await ensureAssistantChats(db);
  const chat = await db.prepare('INSERT INTO assistant_chats(user_id,title) VALUES(?,?) RETURNING id').bind(db.userId, L('Závodní týden', 'Race week')).first();
  const message = await db.prepare("INSERT INTO assistant_messages(chat_id,user_id,role,content) VALUES(?,?,'assistant',?) RETURNING id").bind(chat.id, db.userId, week.text).first();
  await updateAthleteState(db, { posted: { kind: 'race', key: week.race.date, chatId: chat.id, messageId: message.id } });
  return { chatId: chat.id, messageId: message.id, text: week.text, date: week.race.date };
}
