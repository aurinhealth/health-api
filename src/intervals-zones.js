// Zones from Loadwise to Intervals.icu: after the athlete saves their training
// zones (Nastavení → Tréninkové zóny) the thresholds and zone bounds go to the
// Ride and Run sport settings, so the calendar, the watch and the coach count
// with the same numbers. With the OAuth connection this needs the
// SETTINGS:WRITE scope (intervals-oauth.js); older connections only granted
// SETTINGS:READ and have to be connected again.
import { intervalsAuthorization } from "./intervals-auth.js";
import { POWER_ZONE_MODELS, PACE_ZONE_MODELS } from "./training-zones.js";

// Intervals.icu shows "Z1" itself: send "Regenerace", not "Z1 Regenerace".
const bare = name => String(name || "").replace(/^(Z\d+[a-c+]?|SS|[EMTIR])\s+/, "").trim() || String(name || "");
const OPEN = 999;

function powerBounds(profile) {
  if (profile.powerZoneModel === "custom" && Array.isArray(profile.powerZoneBounds)) return profile.powerZoneBounds;
  return (POWER_ZONE_MODELS[profile.powerZoneModel] || POWER_ZONE_MODELS.coggan7).bounds;
}

function paceBounds(profile) {
  if (profile.paceZoneModel === "custom" && Array.isArray(profile.paceZoneBounds)) return profile.paceZoneBounds;
  return (PACE_ZONE_MODELS[profile.paceZoneModel] || PACE_ZONE_MODELS.friel).bounds;
}

// Heart-rate zones as Intervals.icu stores them: the top bpm of each zone, the
// last one the max heart rate. Null when a zone has no bpm (no LTHR or max).
function hrBounds(zones, maxHr) {
  if (!Array.isArray(zones) || !zones.length) return null;
  const tops = zones.map((z, i) => (i === zones.length - 1 ? z.bpmHigh ?? maxHr : z.bpmHigh));
  return tops.every(v => Number(v) > 0) && tops.every((v, i) => i === 0 || v > tops[i - 1]) ? tops.map(Math.round) : null;
}

// The two sport settings to write, from athleteThresholds() (intervals-athlete.js).
// Thresholds go only when the athlete set them in Loadwise: the others came
// from Intervals.icu in the first place.
export function intervalsSportSettings(t) {
  const profile = t.profile || {};
  const ride = {
    power_zones: [...powerBounds(profile), OPEN],
    power_zone_names: (t.powerZones || []).map(z => bare(z.name))
  };
  if (profile.ftp) ride.ftp = profile.ftp;
  if (profile.lthr) ride.lthr = profile.lthr;
  if (profile.maxHr) ride.max_hr = profile.maxHr;
  const rideHr = hrBounds(t.hrZones, t.maxHr);
  if (rideHr) { ride.hr_zones = rideHr; ride.hr_zone_names = t.hrZones.map(z => bare(z.name)); }

  const run = {
    pace_zones: [...paceBounds(profile), OPEN],
    pace_zone_names: (t.paceZones || []).map(z => bare(z.name)),
    pace_units: "MINS_KM"
  };
  // Intervals.icu keeps threshold pace as speed in m/s.
  if (profile.runThresholdPace) run.threshold_pace = Math.round(1000 / profile.runThresholdPace * 1000) / 1000;
  if (profile.runLthr) run.lthr = profile.runLthr;
  const runHr = hrBounds(t.runHrZones, t.runMaxHr || t.maxHr);
  if (runHr) { run.hr_zones = runHr; run.hr_zone_names = t.runHrZones.map(z => bare(z.name)); }
  return { Ride: ride, Run: run };
}

// Writes both sport settings. Returns { status: "ok" | "needs-permission" |
// "not-connected" | "error", updated: ["Ride", "Run"], message }.
export async function writeIntervalsZones(env, thresholds, fetchImpl = fetch) {
  if (!env.INTERVALS_API_KEY) return { status: "not-connected", updated: [] };
  const headers = { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json" };
  const denied = r => r.status === 401 || r.status === 403;
  try {
    const athlete = await fetchImpl("https://intervals.icu/api/v1/athlete/0", { headers });
    if (denied(athlete)) return { status: "needs-permission", updated: [] };
    if (!athlete.ok) return { status: "error", updated: [], message: "Intervals.icu HTTP " + athlete.status };
    const data = await athlete.json();
    const athleteId = data?.id || "0";
    const settings = Array.isArray(data?.sportSettings) ? data.sportSettings : [];
    const wanted = intervalsSportSettings(thresholds), updated = [];
    for (const [type, body] of Object.entries(wanted)) {
      const target = settings.find(s => (s.types || []).includes(type));
      if (!target?.id) continue;
      const url = `https://intervals.icu/api/v1/athlete/${encodeURIComponent(athleteId)}/sport-settings/${encodeURIComponent(target.id)}?recalcHrZones=false`;
      const response = await fetchImpl(url, { method: "PUT", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (denied(response)) return { status: "needs-permission", updated };
      if (!response.ok) return { status: "error", updated, message: "Intervals.icu HTTP " + response.status };
      updated.push(type);
    }
    return { status: "ok", updated };
  } catch (error) {
    return { status: "error", updated: [], message: error.message };
  }
}
