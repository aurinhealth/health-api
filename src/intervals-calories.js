// Calorie estimates are not written to Intervals.icu: the energy picture lives
// in the app. This removes the lines the app used to append to planned
// workouts ("Estimated calories: … kcal", strength "Odhad výdeje: … kcal"),
// from the given day on; nothing else in the description changes.
import { pragueToday } from "./prague-date.js";
import { intervalsAuthorization } from "./intervals-auth.js";
const BASE_URL = "https://intervals.icu/api/v1";

function auth(env) {
  if (!env.INTERVALS_API_KEY) throw new Error("INTERVALS_API_KEY is not configured");
  return intervalsAuthorization(env.INTERVALS_API_KEY);
}

const CALORIE_LINE = /\n*(?:Estimated calories:\s*\d+\s*kcal|Odhad výdeje:\s*\d+\s*kcal(?:\s*·\s*\d+\s*min)?)[ \t]*(?=\n|$)/gi;
export function withoutCalories(description) {
  return String(description || "").replace(CALORIE_LINE, "").trim();
}

export async function removePlannedEventCalories(env, options = {}) {
  const oldest = String(options.oldest || pragueToday());
  const newest = String(options.newest || oldest);
  const response = await fetch(
    `${BASE_URL}/athlete/0/events?oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}&category=WORKOUT`,
    { headers: { Authorization: auth(env), Accept: "application/json" } }
  );
  const text = await response.text();
  let events;
  try { events = JSON.parse(text); } catch { events = []; }
  if (!response.ok) throw new Error(`Intervals.icu HTTP ${response.status}: ${JSON.stringify(events)}`);

  const cleaned = [];
  for (const event of Array.isArray(events) ? events : []) {
    const before = String(event.description || "").trim(), description = withoutCalories(before);
    if (description === before) continue;
    const put = await fetch(`${BASE_URL}/athlete/0/events/${encodeURIComponent(event.id)}`, {
      method: "PUT",
      headers: { Authorization: auth(env), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...event, description })
    });
    if (!put.ok) throw new Error(`Intervals.icu HTTP ${put.status}: ${await put.text()}`);
    cleaned.push({ id: event.id, date: event.start_date_local, name: event.name });
  }
  return { status: "ok", oldest, newest, cleanedCount: cleaned.length, cleaned };
}
