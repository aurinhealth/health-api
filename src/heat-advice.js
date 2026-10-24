// Horko: one line at a ride or run outdoors when today's forecast says 25 °C
// or more (Dnes → Aktivita dne, Plán dne and the planned workout's detail).
// The temperature at the session's time when it has one (between the
// forecast's hours 8, 11, 14, 17 and 20), else the day's high. From 30 °C it
// also says to cut an effort short. Rules, no AI.
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

// { temp, short, text } for a ride or run outdoors, or null.
// weather: today's { max, hours } (app-today.js todayWeather), time: "17:30" or null.
export function heatAdvice({ sport, weather, time = null, indoor = false }) {
  if (!["ride", "run"].includes(sport) || indoor || !weather) return null;
  const minute = minutesOf(time);
  const at = minute != null ? tempAt(weather.hours, minute) : null;
  const temp = Math.round(at ?? num(weather.max) ?? NaN);
  if (!Number.isFinite(temp) || temp < HOT) return null;
  const very = temp >= VERY_HOT, run = sport === "run";
  const shown = isImperial() ? Math.round(temp * 9 / 5 + 32) + " °F" : temp + " °C";
  const slower = isImperial() ? L("o 15–30 s/mi", "15–30 s/mi") : L("o 10–20 s/km", "10–20 s/km");
  const when = minute != null ? null : coolerTime(weather.hours);
  const head = minute != null
    ? L(`V ${time.slice(0, 5)} kolem ${shown}.`, `Around ${shown} at ${time.slice(0, 5)}.`)
    : L(`Horko až ${shown}.`, `Heat up to ${shown}.`);
  const body = run
    ? L(`Běž podle tepu, tempo nech ${slower} pomalejší a vezmi pití`, `Go by heart rate, keep your pace ${slower} slower and take a drink`)
    : L("Jeď podle tepu, intervaly dej o 5 % slabší a pij 0,5–1 l za hodinu", "Ride by heart rate, do the intervals 5 % easier and drink 0.5–1 l an hour");
  const go = when ? (run ? L(`, vyraž ${when}`, `, go ${when}`) : L(`, vyjeď ${when}`, `, go ${when}`)) : "";
  const cut = very ? " " + L("Když tep v intervalu vyletí, zkrať ho.", "If your heart rate shoots up in an interval, cut it short.") : "";
  const short = L(`Horko ${shown} · `, `Heat ${shown} · `) + (run
    ? L(`tempo ${slower} pomaleji, víc pít`, `pace ${slower} slower, drink more`)
    : L("intervaly o 5 % slabší, víc pít", "intervals 5 % easier, drink more"));
  return { temp, short, text: head + " " + body + go + "." + cut };
}
