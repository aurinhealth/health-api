import { dateFormat } from "./date-format.js";
const TZ = "Europe/Prague";
const DEFAULT_LAT = 50.0;
const DEFAULT_LON = 15.3;

function localDate() {
  return dateFormat("en-CA", { timeZone: TZ }).format(new Date());
}

function seasonFor(date) {
  const m = Number(String(date).slice(5, 7));
  if ([12, 1, 2].includes(m)) return "winter";
  if ([3, 4, 5].includes(m)) return "spring";
  if ([6, 7, 8].includes(m)) return "summer";
  return "autumn";
}

function weekdayFor(date) {
  return new Date(`${date}T12:00:00+01:00`).getDay();
}

function minutesBetween(a, b) {
  if (!a || !b) return null;
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.round((y - x) / 60000);
}

function weatherSummary(code) {
  const c = Number(code);
  if ([0,1].includes(c)) return "clear";
  if ([2,3].includes(c)) return "cloudy";
  if ([45,48].includes(c)) return "fog";
  if ([51,53,55,56,57].includes(c)) return "drizzle";
  if ([61,63,65,66,67].includes(c)) return "rain";
  if ([71,73,75,77].includes(c)) return "snow";
  if ([80,81,82].includes(c)) return "showers";
  if ([85,86].includes(c)) return "snow_showers";
  if ([95,96,99].includes(c)) return "thunderstorm";
  return "unknown";
}

function adaptRide({ date, rideType, durationMinutes, startTime, weather, season }) {
  const weekday = weekdayFor(date);
  const evening = startTime ? Number(String(startTime).slice(0,2)) >= 15 : true;
  const daylightMinutes = weather?.sunset
    ? minutesBetween(`${date}T${startTime || "17:00"}:00`, weather.sunset)
    : null;
  const temp = Number(weather?.temperature_max_c);
  const wind = Number(weather?.wind_max_kmh);
  const precip = Number(weather?.precipitation_probability_max);
  const badWeather = precip >= 60 || ["rain","showers","snow","thunderstorm","fog"].includes(weather?.condition);
  const strongWind = wind >= 30;
  const cold = temp < 5;
  const shortWindow = Number(durationMinutes || 0) > 0 && Number(durationMinutes) <= 90;
  const darkSoon = daylightMinutes != null && daylightMinutes < Number(durationMinutes || 90);

  let mode = "outdoor";
  let reasons = [];

  if (badWeather || strongWind || cold && season === "winter") {
    mode = "indoor";
    reasons.push(badWeather ? "nepříznivé srážky" : strongWind ? "silný vítr" : "nízká teplota");
  } else if (darkSoon && evening) {
    mode = "indoor_or_short_outdoor";
    reasons.push("málo denního světla");
  }

  let recommendedDuration = Number(durationMinutes || 90);
  let intensity = rideType || "endurance";

  if (shortWindow || darkSoon || (weekday >= 1 && weekday <= 5 && season === "autumn")) {
    if (String(rideType).toLowerCase().includes("endurance")) {
      intensity = "structured_endurance_or_sweet_spot";
      recommendedDuration = Math.min(recommendedDuration, 90);
      reasons.push("omezený čas ve všední den → vyšší tréninková hustota");
    }
  }

  if (season === "winter" && weekday >= 1 && weekday <= 5) {
    recommendedDuration = Math.min(recommendedDuration, 90);
  }

  if (season === "summer" && !badWeather && !strongWind && weekday >= 6) {
    recommendedDuration = Math.max(recommendedDuration, 120);
  }

  return {
    mode,
    recommendedDurationMinutes: recommendedDuration,
    recommendedIntensity: intensity,
    reasons,
    daylightMinutesRemaining: daylightMinutes
  };
}

async function fetchWeather(date, lat, lon) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("timezone", TZ);
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_probability_max",
    "precipitation_sum",
    "wind_speed_10m_max",
    "sunrise",
    "sunset"
  ].join(","));

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}: ${JSON.stringify(data)}`);

  const d = data.daily || {};
  const code = d.weather_code?.[0];
  return {
    date,
    condition: weatherSummary(code),
    weatherCode: code ?? null,
    temperature_max_c: d.temperature_2m_max?.[0] ?? null,
    temperature_min_c: d.temperature_2m_min?.[0] ?? null,
    precipitation_probability_max: d.precipitation_probability_max?.[0] ?? null,
    precipitation_sum_mm: d.precipitation_sum?.[0] ?? null,
    wind_max_kmh: d.wind_speed_10m_max?.[0] ?? null,
    sunrise: d.sunrise?.[0] ?? null,
    sunset: d.sunset?.[0] ?? null
  };
}

export async function getCyclingContext(env, options = {}) {
  const date = options.date || localDate();
  const lat = Number(options.lat ?? env.CYCLING_LAT ?? DEFAULT_LAT);
  const lon = Number(options.lon ?? env.CYCLING_LON ?? DEFAULT_LON);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Invalid cycling location");

  const weather = await fetchWeather(date, lat, lon);
  const season = seasonFor(date);
  const rideType = String(options.rideType || "endurance");
  const durationMinutes = Number(options.durationMinutes || 90);
  const adaptation = adaptRide({
    date,
    rideType,
    durationMinutes,
    startTime: options.startTime || "17:00",
    weather,
    season
  });

  return {
    status: "ok",
    date,
    timezone: TZ,
    season,
    weekday: weekdayFor(date),
    location: { latitude: lat, longitude: lon },
    weather,
    planning: {
      originalRideType: rideType,
      originalDurationMinutes: durationMinutes,
      ...adaptation
    },
    policy: {
      considerSeason: true,
      considerWeather: true,
      considerWind: true,
      considerDaylight: true,
      considerWeekdayTime: true,
      principle: "V kratších podzimních/zimních všedních dnech preferuj kratší strukturovaný trénink; delší endurance přesouvej na dny s více světlem a lepšími podmínkami."
    }
  };
}
