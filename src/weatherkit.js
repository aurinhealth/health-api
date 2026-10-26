// Apple Weather (WeatherKit REST API) for the forecast of the week plan's place.
// Secrets: WEATHERKIT_KEY_ID and WEATHERKIT_KEY_P8 (the .p8 of a key with
// WeatherKit, developer.apple.com → Keys) and APPLE_TEAM_ID; WEATHERKIT_SERVICE_ID
// may name another identifier than the app's bundle ID. Without the key the
// forecast comes from Open-Meteo (adaptive-week.js), which suits only tests and
// local runs: its free tier is for non-commercial use.
//
// The answers keep the shape of Open-Meteo's: a WMO weather code, °C, km/h, mm
// and a probability in %, so environmentFor and the app read both alike.
import { pkcs8FromP8 } from "./push.js";
import { localDate, localDateTime, timeZone } from "./user-time.js";

const API = "https://weatherkit.apple.com/api/v1/weather/en/";
const JWT_TTL_S = 30 * 60;
let cachedJwt = null;

export const weatherKitConfigured = env => Boolean(env?.WEATHERKIT_KEY_ID && env.WEATHERKIT_KEY_P8 && env.APPLE_TEAM_ID);

const base64url = bytes => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const textBytes = value => new TextEncoder().encode(value);

// The developer token: ES256 with the WeatherKit key, valid for an hour, reused for half of it.
export async function weatherKitJwt(env, now = Date.now()) {
  const team = String(env.APPLE_TEAM_ID).trim(), kid = String(env.WEATHERKIT_KEY_ID).trim();
  const service = String(env.WEATHERKIT_SERVICE_ID || "health.aurin.app").trim();
  const id = kid + "|" + team + "|" + service + "|" + env.WEATHERKIT_KEY_P8, iat = Math.floor(now / 1000);
  if (cachedJwt && cachedJwt.id === id && iat - cachedJwt.iat >= 0 && iat - cachedJwt.iat < JWT_TTL_S) return cachedJwt.token;
  const key = await crypto.subtle.importKey("pkcs8", pkcs8FromP8(env.WEATHERKIT_KEY_P8), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = base64url(textBytes(JSON.stringify({ alg: "ES256", kid, id: team + "." + service })));
  const claims = base64url(textBytes(JSON.stringify({ iss: team, iat, exp: iat + 2 * JWT_TTL_S, sub: service })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textBytes(header + "." + claims)));
  const token = header + "." + claims + "." + base64url(signature);
  cachedJwt = { id, iat, token };
  return token;
}

// Apple's condition codes as the nearest WMO code (WeatherText in the app, environmentFor).
const WMO = {
  Clear: 0, Hot: 0, Frigid: 0, MostlyClear: 1, PartlyCloudy: 2, Breezy: 2, Windy: 2,
  MostlyCloudy: 3, Cloudy: 3, Fog: 45, Foggy: 45, Haze: 45, Smoke: 45, Smoky: 45, Dust: 45, BlowingDust: 45,
  Drizzle: 51, FreezingDrizzle: 56, Rain: 61, MixedRainfall: 61, HeavyRain: 65, FreezingRain: 66, Sleet: 66,
  Flurries: 71, Snow: 73, HeavySnow: 75, BlowingSnow: 75, Blizzard: 75,
  SunShowers: 80, ScatteredShowers: 80, Showers: 80, SunFlurries: 85, SnowShowers: 85, ScatteredSnowShowers: 85,
  MixedRainAndSnow: 85, MixedRainAndSleet: 85, MixedSnowAndSleet: 85, WintryMix: 85,
  IsolatedThunderstorms: 95, ScatteredThunderstorms: 95, Thunderstorm: 95, Thunderstorms: 95, StrongStorms: 95,
  SevereThunderstorm: 99, Hail: 96, TropicalStorm: 99, Hurricane: 99, Tornado: 99
};
export const wmoCode = condition => WMO[condition] ?? null;

const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
const shift = (date, n) => new Date(Date.parse(date + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

async function weather(env, location, params, fetchImpl) {
  const query = new URLSearchParams({ timezone: timeZone(), ...params });
  const url = API + Number(location.latitude) + "/" + Number(location.longitude) + "?" + query;
  const r = await fetchImpl(url, { headers: { Authorization: "Bearer " + await weatherKitJwt(env) }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) {
    console.error("WeatherKit HTTP " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));
    throw new Error("no forecast");
  }
  return r.json();
}

// The days start..end (the user's dates) as weekWeather returns them: {date: {code, max, min, wind, rain, rainProb, source}}.
export function dailyFromWeatherKit(data, start, end) {
  const out = {};
  for (const d of data?.forecastDaily?.days || []) {
    // forecastStart is the user's midnight in UTC; the day is that of its local noon.
    const date = localDate(new Date(Date.parse(d.forecastStart) + 12 * 3600000));
    if (!date || date < start || date > end) continue;
    const chance = num(d.precipitationChance);
    out[date] = {
      code: wmoCode(d.conditionCode), max: num(d.temperatureMax), min: num(d.temperatureMin),
      wind: num(d.windSpeedMax ?? d.daytimeForecast?.windSpeed), rain: num(d.precipitationAmount),
      rainProb: chance == null ? null : Math.round(chance * 100), source: "apple"
    };
  }
  return out;
}

// The hours as Open-Meteo's hourly arrays (local "YYYY-MM-DDTHH:00"), for pickHours.
export function hourlyFromWeatherKit(data) {
  const hours = data?.forecastHourly?.hours || [];
  return {
    time: hours.map(h => localDateTime(h.forecastStart)),
    temperature_2m: hours.map(h => num(h.temperature)),
    weather_code: hours.map(h => wmoCode(h.conditionCode))
  };
}

const bound = date => date + "T00:00:00Z";

export async function weatherKitWeek(env, location, start, fetchImpl = fetch) {
  const end = shift(start, 6);
  const data = await weather(env, location, { dataSets: "forecastDaily", dailyStart: bound(shift(start, -1)), dailyEnd: bound(shift(end, 2)) }, fetchImpl);
  return dailyFromWeatherKit(data, start, end);
}

export async function weatherKitHours(env, location, date, fetchImpl = fetch) {
  const data = await weather(env, location, { dataSets: "forecastHourly", hourlyStart: bound(shift(date, -1)), hourlyEnd: bound(shift(date, 2)) }, fetchImpl);
  return hourlyFromWeatherKit(data);
}
