// Horko: one line at a ride or run outdoors when today's forecast says 25 °C
// or more (Dnes → Aktivita dne, Plán dne, the planned workout's detail and the
// Pití card). The hottest point of the session when it has a time and a length
// (the forecast's hours 8, 11, 14, 17 and 20, read between them), the
// temperature at its start with only a time, else the day's high. From 30 °C
// a session with intervals also hears to cut one short. Rules, no AI.
import { L, isImperial } from "./lang.js";

export const HOT = 25, VERY_HOT = 30;
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const minutesOf = time => { const m = String(time || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// The forecast's temperature at a minute of the day, read between its hours.
export function tempAt(hours = [], minute) {
  const list = (Array.isArray(hours) ? hours : []).filter(h => num(h?.hour) != null && num(h?.temp) != null).sort((a, b) => a.hour - b.hour);
  if (!list.length || minute == null) return null;
  const at = minute / 60;
  if (at <= list[0].hour) return list[0].temp;
  if (at >= list.at(-1).hour) return list.at(-1).temp;
  const i = list.findIndex(h => h.hour >= at), a = list[i - 1], b = list[i];
  return a.temp + (b.temp - a.temp) * (at - a.hour) / (b.hour - a.hour);
}

// A trainer, a treadmill or Zwift stays out of the sun.
export const indoorText = text => /virtual|indoor|trainer|treadmill|zwift|trenaž|pás|uvnitř/i.test(String(text || ""));

// The cooler part of the day to go: the morning before 10, or the evening after 19.
function coolerTime(hours = []) {
  const at = h => num((Array.isArray(hours) ? hours : []).find(x => x?.hour === h)?.temp);
  if (at(8) != null && at(8) < HOT) return L("nejlíp před 10:00", "best before 10:00");
  if (at(20) != null && at(20) < HOT) return L("nejlíp po 19:00", "best after 19:00");
  return null;
}

// The hottest point between a start and its end, every 15 minutes.
function hottest(hours, start, minutes) {
  let top = null;
  for (let m = start; m < start + minutes + 15; m += 15) {
    const t = tempAt(hours, Math.min(m, start + minutes));
    if (t != null && (top == null || t > top)) top = t;
  }
  return top;
}
const clock = minute => String(Math.floor(minute / 60) % 24).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
// 0.5–1 l an hour, 17–34 fl oz for an imperial user.
const drinkPerHour = () => isImperial() ? "17–34 fl oz" : L("0,5–1 l", "0.5–1 l");

// { temp, short, text, drink } for a ride or run outdoors, or null; drink is
// the Pití card's line. weather: today's { max, hours } (app-today.js
// todayWeather), time: "17:30" or null, minutes: the session's length,
// intervals: false for a steady session (no interval clauses).
export function heatAdvice({ sport, weather, time = null, minutes = null, intervals = true, indoor = false }) {
  if (!["ride", "run"].includes(sport) || indoor || !weather) return null;
  const minute = minutesOf(time), length = num(minutes) > 0 ? Math.min(Math.round(num(minutes)), 12 * 60) : null;
  const span = minute != null && length != null;
  const at = span ? hottest(weather.hours, minute, length) : minute != null ? tempAt(weather.hours, minute) : null;
  const temp = Math.round(at ?? num(weather.max) ?? NaN);
  if (!Number.isFinite(temp) || temp < HOT) return null;
  const very = temp >= VERY_HOT, run = sport === "run";
  const shown = isImperial() ? Math.round(temp * 9 / 5 + 32) + " °F" : temp + " °C";
  const slower = isImperial() ? L("o 15–30 s/mi", "15–30 s/mi") : L("o 10–20 s/km", "10–20 s/km");
  const when = minute != null ? null : coolerTime(weather.hours);
  const start = minute != null ? time.slice(0, 5) : null, end = span ? clock(minute + length) : null;
  const head = span
    ? L(`Mezi ${start} a ${end} až ${shown}.`, `Up to ${shown} between ${start} and ${end}.`)
    : minute != null
      ? L(`V ${start} kolem ${shown}.`, `Around ${shown} at ${start}.`)
      : L(`Horko až ${shown}.`, `Heat up to ${shown}.`);
  const perHour = drinkPerHour();
  const body = run
    ? L(`Běž podle tepu, tempo nech ${slower} pomalejší a vezmi pití`, `Go by heart rate, keep your pace ${slower} slower and take a drink`)
    : intervals
      ? L(`Jeď podle tepu, intervaly dej o 5 % slabší a pij ${perHour} za hodinu`, `Ride by heart rate, do the intervals 5 % easier and drink ${perHour} an hour`)
      : L(`Jeď podle tepu a pij ${perHour} za hodinu`, `Ride by heart rate and drink ${perHour} an hour`);
  const go = when ? (run ? L(`, vyraž ${when}`, `, go ${when}`) : L(`, vyjeď ${when}`, `, go ${when}`)) : "";
  const cut = very && intervals ? " " + L("Když tep v intervalu vyletí, zkrať ho.", "If your heart rate shoots up in an interval, cut it short.") : "";
  const short = L(`Horko ${shown} · `, `Heat ${shown} · `) + (run
    ? L(`tempo ${slower} pomaleji, víc pít`, `pace ${slower} slower, drink more`)
    : intervals ? L("intervaly o 5 % slabší, víc pít", "intervals 5 % easier, drink more") : L("podle tepu, víc pít", "by heart rate, drink more"));
  // Pití: no extra on the goal (sweat differs too much between people), only the hint.
  const drink = run
    ? L(`Na běhu až ${shown}. Vezmi si pití; v horku můžeš potřebovat víc, než ukazuje cíl.`, `Up to ${shown} on your run. Take a drink along; in the heat you may need more than this goal.`)
    : L(`Na jízdě až ${shown}. Pij na ní ${perHour} za hodinu; v horku můžeš potřebovat víc, než ukazuje cíl.`, `Up to ${shown} on your ride. Drink ${perHour} an hour on it; in the heat you may need more than this goal.`);
  return { temp, short, text: head + " " + body + go + "." + cut, drink };
}
