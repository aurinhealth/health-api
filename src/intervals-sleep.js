// Nights from the Intervals.icu wellness log (sleepSecs, sleepScore) for
// athletes whose sleep reaches Intervals from Apple Health (IntervalsWellnessSync,
// Intervals Companion, Health Sync), Garmin or another app. Google Health
// nights stay first; Intervals only fills the nights Google does not have.
// The wellness sync to Intervals reads Google nights only, so nothing loops.

export function mergeIntervalsSleep(sessions = [], wellness = [], { start = "", end = "9999-12-31" } = {}) {
  const known = new Set(sessions.map(s => s.date || String(s.endTime || "").slice(0, 10)));
  const extra = (Array.isArray(wellness) ? wellness : [])
    .filter(w => /^\d{4}-\d{2}-\d{2}$/.test(String(w?.id)) && Number(w.sleepSecs) > 0 && w.id >= start && w.id < end && !known.has(w.id))
    .map(w => ({
      id: "intervals-sleep:" + w.id, date: w.id, startTime: null, endTime: null, timeInBedMin: null,
      durationMin: Math.round(Number(w.sleepSecs) / 60), type: "intervals", source: "intervals",
      score: Number(w.sleepScore) > 0 ? Number(w.sleepScore) : null, stages: {}, minutesToFallAsleep: null, minutesAfterWakeup: null
    }));
  return [...sessions, ...extra].sort((a, b) => String(b.date || b.endTime || "").localeCompare(String(a.date || a.endTime || "")));
}

export async function intervalsWellness(env, oldest, newest, fetchImpl = fetch) {
  if (!env.INTERVALS_API_KEY) return [];
  try {
    const response = await fetchImpl(`https://intervals.icu/api/v1/athlete/0/wellness?oldest=${oldest}&newest=${newest}`, { headers: { Authorization: "Basic " + btoa("API_KEY:" + String(env.INTERVALS_API_KEY)), Accept: "application/json" } });
    return response.ok ? await response.json() : [];
  } catch { return []; }
}

// A /health/sleep answer with the missing nights filled from Intervals.
export async function withIntervalsSleep(env, data, start, end, fetchImpl = fetch) {
  const sessions = data?.sessions || [];
  if (!env.INTERVALS_API_KEY || !start || !end) return data;
  const wellness = await intervalsWellness(env, start, end, fetchImpl);
  const merged = mergeIntervalsSleep(sessions, wellness, { start, end });
  return merged.length === sessions.length ? data : { ...data, sessions: merged, sources: [...(sessions.length ? ["google"] : []), "intervals"] };
}
