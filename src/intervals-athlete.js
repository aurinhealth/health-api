// The athlete's thresholds for turning % targets into watts (and later pace).
// FTP priority: the value the athlete set in the app, then the Intervals.icu
// sport settings, then the FTP of the latest synced ride. Zones follow the
// athlete's chosen models. Running uses threshold pace (s/km) the same way.
import { getTrainingProfile } from "./training-profile.js";
import { powerZones, hrZones, paceZones } from "./training-zones.js";
const n = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;

export async function athleteThresholds(env, fetchImpl = fetch) {
  const out = { ftp: null, indoorFtp: null, lthr: null, maxHr: null, runThresholdPace: null, runPaceSource: null, intervalsRunPace: null, runLthr: null, runMaxHr: null, source: null, intervalsFtp: null, latestRideFtp: null };
  if (env.INTERVALS_API_KEY) {
    try {
      const response = await fetchImpl("https://intervals.icu/api/v1/athlete/0", { headers: { Authorization: "Basic " + btoa("API_KEY:" + String(env.INTERVALS_API_KEY)), Accept: "application/json" } });
      if (response.ok) {
        const athlete = await response.json();
        const settings = Array.isArray(athlete?.sportSettings) ? athlete.sportSettings : [];
        const ride = settings.find(s => (s.types || []).includes("Ride")) || settings.find(s => (s.types || []).some(t => /ride/i.test(t)));
        const run = settings.find(s => (s.types || []).includes("Run"));
        if (ride) { out.ftp = n(ride.ftp); out.indoorFtp = n(ride.indoor_ftp); out.lthr = n(ride.lthr); out.maxHr = n(ride.max_hr); }
        if (run) {
          // Intervals.icu stores threshold pace as speed (m/s); accept s/km too.
          const v = n(run.threshold_pace);
          const pace = v == null ? null : v < 20 ? 1000 / v : v;
          if (pace && pace >= 150 && pace <= 600) { out.runThresholdPace = Math.round(pace); out.intervalsRunPace = out.runThresholdPace; out.runPaceSource = "intervals-settings"; }
          out.runLthr = n(run.lthr); out.runMaxHr = n(run.max_hr);
        }
        if (out.ftp) { out.source = "intervals-settings"; out.intervalsFtp = out.ftp; }
      }
    } catch (error) { console.error("Intervals athlete settings unavailable", error.message); }
  }
  if (!out.ftp && env.DB) {
    try {
      const row = await env.DB.prepare("SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND payload_json LIKE '%icu_ftp%' ORDER BY start_time DESC LIMIT 1").bind(env.USER_ID).first();
      const ftp = n(JSON.parse(row?.payload_json || "{}").icu_ftp);
      if (ftp) { out.ftp = ftp; out.latestRideFtp = ftp; out.source = "latest-ride"; }
    } catch {}
  }
  let profile = {};
  if (env.DB) { try { profile = await getTrainingProfile(env.DB); } catch (error) { console.error("Training profile unavailable", error.message); } }
  // A manual FTP replaces the Intervals values, including its indoor FTP.
  if (profile.ftp) { out.ftp = profile.ftp; out.indoorFtp = null; out.source = "manual"; }
  for (const key of ["lthr", "maxHr"]) if (profile[key]) out[key] = profile[key];
  out.restHr = profile.restHr || null;
  if (profile.runThresholdPace) { out.runThresholdPace = profile.runThresholdPace; out.runPaceSource = "manual"; }
  if (profile.runLthr) out.runLthr = profile.runLthr;
  out.paceZones = paceZones(profile, out.runThresholdPace);
  // Running LTHR only – the cycling LTHR is usually lower and would mislead.
  out.runHrZones = hrZones({ ...profile, hrZoneModel: ["frielLthr", "frielRun", "custom"].includes(profile.hrZoneModel || "frielLthr") ? "frielRun" : profile.hrZoneModel, lthr: out.runLthr, maxHr: out.runMaxHr || out.maxHr, restHr: out.restHr });
  out.profile = profile;
  out.powerZones = powerZones(profile, out.ftp);
  out.hrZones = hrZones({ ...profile, lthr: out.lthr, maxHr: out.maxHr, restHr: out.restHr });
  return out;
}
