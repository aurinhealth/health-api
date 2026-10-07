// The daily "Nutrition — date" notes the app used to write to Intervals.icu.
// Calories are no longer written there; this only removes the old notes.
import { intervalsAuthorization } from "./intervals-auth.js";

const BASE_URL = "https://intervals.icu/api/v1";
const auth = env => intervalsAuthorization(env.INTERVALS_API_KEY);
const addDays = (date, days) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function listNutritionNotes(env, oldest, newest) {
  const response = await fetch(
    `${BASE_URL}/athlete/0/events?oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}&category=NOTE`,
    { headers: { Authorization: auth(env), Accept: "application/json" } }
  );
  const text = await response.text();
  let events;
  try { events = JSON.parse(text); } catch { events = []; }
  if (!response.ok) throw new Error(`Intervals.icu HTTP ${response.status}: ${JSON.stringify(events)}`);
  return Array.isArray(events) ? events : [];
}

async function deleteEvent(env, id) {
  const response = await fetch(
    `${BASE_URL}/athlete/0/events/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: { Authorization: auth(env), Accept: "application/json" } }
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Intervals.icu delete HTTP ${response.status}: ${text}`);
  }
}

export async function deleteDailyNutritionNotes(env, options = {}) {
  const oldest = String(options.oldest);
  const newest = String(options.newest || oldest);
  const events = await listNutritionNotes(env, oldest, newest);
  const matches = events.filter(event =>
    /^Nutrition — \d{4}-\d{2}-\d{2}$/.test(String(event?.name || "")) ||
    String(event?.external_id || "").startsWith("health-nutrition-")
  );

  let deletedCount = 0;
  for (const event of matches) {
    if (!event?.id) continue;
    await deleteEvent(env, event.id);
    deletedCount++;
  }

  return { status: "ok", oldest, newest, deletedCount, matchedCount: matches.length };
}
