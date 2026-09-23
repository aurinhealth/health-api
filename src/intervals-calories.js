const BASE_URL = "https://intervals.icu/api/v1";

function auth(env) {
  if (!env.INTERVALS_API_KEY) throw new Error("INTERVALS_API_KEY is not configured");
  return "Basic " + btoa("API_KEY:" + env.INTERVALS_API_KEY);
}

const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

function strengthCalories(weightKg, minutes) {
  if (!minutes) return 0;
  return Math.round((5.0 * 3.5 * weightKg / 200) * minutes);
}

function cyclingCalories(event, weightKg, ftp = 260) {
  const seconds = n(event?.moving_time);
  if (!seconds) return 0;
  const hours = seconds / 3600;
  const intensity = n(event?.icu_intensity);
  const watts = n(event?.icu_weighted_average_watts ?? event?.weighted_average_watts);
  const estimatedWatts = watts > 0 ? watts : intensity > 0 ? ftp * intensity : null;
  if (!estimatedWatts) return 0;
  // Mechanical work / ~23% gross efficiency. Reported as an estimate.
  return Math.round((estimatedWatts * seconds / 0.23) / 4184);
}

export function estimateEventCalories(event, options = {}) {
  const weightKg = n(options.weightKg, 88);
  if (String(event?.type || "").toLowerCase() === "weighttraining") {
    return strengthCalories(weightKg, n(event.moving_time) / 60);
  }
  if (String(event?.type || "").toLowerCase() === "ride" || /cycling|bike|gravel|mtb/i.test(String(event?.type || ""))) {
    return cyclingCalories(event, weightKg, n(options.ftp, 260));
  }
  return 0;
}

function withCalories(description, calories) {
  const marker = "Estimated calories:";
  const base = String(description || "").replace(/^Estimated calories:\s*\d+\s*kcal\s*\n?/i, "").trim();
  return `${marker} ${calories} kcal\n\n${base}`.trim();
}

export async function syncPlannedEventCalories(env, options = {}) {
  const oldest = String(options.oldest || new Date().toISOString().slice(0, 10));
  const newest = String(options.newest || oldest);
  const weightKg = n(options.weightKg, 88);
  const ftp = n(options.ftp, 260);

  const response = await fetch(
    `${BASE_URL}/athlete/0/events?oldest=${encodeURIComponent(oldest)}&newest=${encodeURIComponent(newest)}&category=WORKOUT`,
    { headers: { Authorization: auth(env), Accept: "application/json" } }
  );
  const text = await response.text();
  let events;
  try { events = JSON.parse(text); } catch { events = []; }
  if (!response.ok) throw new Error(`Intervals.icu HTTP ${response.status}: ${JSON.stringify(events)}`);

  const updated = [];
  for (const event of Array.isArray(events) ? events : []) {
    const calories = estimateEventCalories(event, { weightKg, ftp });
    if (!calories) continue;
    const description = withCalories(event.description, calories);
    if (description === String(event.description || "").trim()) continue;

    const update = {
      ...event,
      description
    };
    const put = await fetch(`${BASE_URL}/athlete/0/events/${encodeURIComponent(event.id)}`, {
      method: "PUT",
      headers: {
        Authorization: auth(env),
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(update)
    });
    const putText = await put.text();
    if (!put.ok) throw new Error(`Intervals.icu HTTP ${put.status}: ${putText}`);
    updated.push({ id: event.id, date: event.start_date_local, name: event.name, calories });
  }

  return { status: "ok", oldest, newest, updatedCount: updated.length, updated };
}
