// The athlete's thresholds for turning % targets into watts (and later pace).
// FTP priority: the value the athlete set in the app, then the Intervals.icu
// sport settings, then the FTP of the latest synced ride. Zones follow the
// athlete's chosen models. Running uses threshold pace (s/km) the same way,
// swimming its CSS (s/100 m).
import { getTrainingProfile } from "./training-profile.js";
import { powerZones, hrZones, paceZones, swimZones } from "./training-zones.js";
import { intervalsAuthorization } from "./intervals-auth.js";
import { loadProfiles, refreshSuggestions } from "./profile-suggestions.js";
import { intervalsReads } from "./intervals-reads.js";
const n = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;

// On a trainer most riders hold a few per cent less than outdoors. Without an
// indoor FTP of the athlete's own, indoor watts use 95 % of FTP.
export const INDOOR_FTP_FACTOR = .95;
export function rideFtpFor(t = {}, environment = "outdoor") {
  if (environment !== "indoor" || !t.ftp) return { ftp: t.ftp || null, estimated: false };
  if (t.indoorFtp) return { ftp: t.indoorFtp, estimated: false };
  return { ftp: Math.round(t.ftp * INDOOR_FTP_FACTOR), estimated: true };
}

// Zones from LTHR need a threshold test; a beginner usually knows only the max
// and resting heart rate. Without an LTHR the default model falls back to the
// heart-rate reserve (Karvonen), or to % of max without a resting rate.
function hrModelFor(model, lthr, maxHr, restHr) {
  if (!["frielLthr", "frielRun"].includes(model) || lthr) return model;
  return maxHr && restHr ? "karvonen" : maxHr ? "hrMax5" : model;
}

// The sport settings last read from Intervals.icu, kept for a week in the
// Worker cache (no D1 rows): when Intervals.icu is slow or down (a read gives
// up after 8 s, intervals-reads.js) the zones and FTP stay the athlete's
// instead of falling back to the last ride's FTP, and the job that asked is
// not reported as failed (the morning readiness push still goes out).
const LAST_SETTINGS_DAYS = 7;
const lastSettingsKey = env => "https://cache.internal/intervals-athlete/" + encodeURIComponent((env.ENVIRONMENT || "production") + ":" + (env.USER_DATA_SHARD || "legacy")) + "/" + encodeURIComponent(String(env.USER_ID ?? "")) + "/" + encodeURIComponent(String(env.INTERVALS_ATHLETE_ID || "0"));
async function rememberSettings(env, store, settings) {
  if (!store || env.USER_ID == null) return;
  try { await store.put(lastSettingsKey(env), new Response(JSON.stringify(settings), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + LAST_SETTINGS_DAYS * 86400 } })); } catch {}
}
async function lastSettings(env, store) {
  if (!store || env.USER_ID == null) return null;
  try { const hit = await store.match(lastSettingsKey(env)); const list = hit ? await hit.json() : null; return Array.isArray(list) ? list : null; } catch { return null; }
}

export async function athleteThresholds(env, fetchImpl = intervalsReads(env), { store = globalThis.caches?.default } = {}) {
  // Where each threshold came from, for Nastavení → Zóny (thresholdNotes).
  const sources = {};
  // The athlete's own values, read while Intervals.icu answers (a database trip less in a row).
  const ownValues = env.DB ? getTrainingProfile(env.DB).catch(error => { console.error("Training profile unavailable", error.message); return {}; }) : Promise.resolve({});
  const out = { ftp: null, indoorFtp: null, lthr: null, maxHr: null, runThresholdPace: null, runPaceSource: null, intervalsRunPace: null, runLthr: null, runMaxHr: null, swimCss: null, swimCssSource: null, source: null, intervalsFtp: null, latestRideFtp: null };
  if (env.INTERVALS_API_KEY) {
    let settings = null, problem = null, thrown = false;
    try {
      const response = await fetchImpl("https://intervals.icu/api/v1/athlete/0", { headers: { Authorization: intervalsAuthorization(env.INTERVALS_API_KEY), Accept: "application/json" } });
      if (response.ok) {
        const athlete = await response.json();
        settings = Array.isArray(athlete?.sportSettings) ? athlete.sportSettings : [];
        // Kept on the side; the answer does not wait for it.
        rememberSettings(env, store, settings);
      } else problem = "HTTP " + response.status;
    } catch (error) { problem = error.message; thrown = true; }
    if (!settings && problem) {
      settings = await lastSettings(env, store);
      // With the settings read before, nothing is missing: a note, not a failure.
      // A refused answer (an expired sign-in) is connection-health.js's to report.
      if (settings) console.warn("Intervals athlete settings unavailable, using the last ones read", problem);
      else if (thrown) console.error("Intervals athlete settings unavailable", problem);
    }
    if (settings) {
      const ride = settings.find(s => (s.types || []).includes("Ride")) || settings.find(s => (s.types || []).some(t => /ride/i.test(t)));
      const run = settings.find(s => (s.types || []).includes("Run"));
      const swim = settings.find(s => (s.types || []).includes("Swim"));
      // Intervals.icu stores swim threshold pace as speed (m/s) too.
      const swimSpeed = n(swim?.threshold_pace), css = swimSpeed ? (swimSpeed < 5 ? 100 / swimSpeed : swimSpeed) : null;
      if (css >= 60 && css <= 240) { out.swimCss = Math.round(css); out.swimCssSource = "intervals-settings"; }
      if (ride) { out.ftp = n(ride.ftp); out.indoorFtp = n(ride.indoor_ftp); out.lthr = n(ride.lthr); out.maxHr = n(ride.max_hr); if (out.lthr) sources.lthr = "intervals-settings"; if (out.maxHr) sources.maxHr = "intervals-settings"; }
      if (run) {
        // Intervals.icu stores threshold pace as speed (m/s); accept s/km too.
        const v = n(run.threshold_pace);
        const pace = v == null ? null : v < 20 ? 1000 / v : v;
        if (pace && pace >= 150 && pace <= 600) { out.runThresholdPace = Math.round(pace); out.intervalsRunPace = out.runThresholdPace; out.runPaceSource = "intervals-settings"; }
        out.runLthr = n(run.lthr); out.runMaxHr = n(run.max_hr);
        if (out.runLthr) sources.runLthr = "intervals-settings";
      }
      if (out.ftp) { out.source = "intervals-settings"; out.intervalsFtp = out.ftp; }
    }
  }
  if (!out.ftp && env.DB) {
    try {
      const row = await env.DB.prepare("SELECT payload_json FROM health_datapoints WHERE user_id=? AND source_family='intervals' AND data_type='activity' AND payload_json LIKE '%icu_ftp%' ORDER BY start_time DESC LIMIT 1").bind(env.USER_ID).first();
      const ftp = n(JSON.parse(row?.payload_json || "{}").icu_ftp);
      if (ftp) { out.ftp = ftp; out.latestRideFtp = ftp; out.source = "latest-ride"; }
    } catch {}
  }
  // The thresholds before the athlete's own values (preview.*): Nastavení →
  // Zóny works the zones out again while a value is typed or cleared.
  const preview = { ftp: out.ftp, lthr: out.lthr, maxHr: out.maxHr, runMaxHr: out.runMaxHr, restHr: null, runThresholdPace: out.runThresholdPace, runLthr: out.runLthr, swimCss: out.swimCss };
  const profile = await ownValues;
  // A manual FTP replaces the Intervals values, including its indoor FTP.
  if (profile.ftp) { out.ftp = profile.ftp; out.indoorFtp = null; out.source = "manual"; }
  for (const key of ["lthr", "maxHr"]) if (profile[key]) { out[key] = profile[key]; sources[key] = "manual"; }
  // Max and resting heart rate typed in Nastavení → Tep a aktivita beat
  // Intervals.icu; the values calibrated from the activities and the wellness
  // (refreshed once a day) only fill what nothing else has.
  let personal = null, own = null, suggested = null;
  if (env.DB) {
    if (!out.maxHr || !profile.restHr) { try { await refreshSuggestions(env, { fetchImpl }); } catch (error) { console.error("Profile suggestions not refreshed", error.message); } }
    try { ({ saved: own, suggested, effective: personal } = await loadProfiles(env.DB, env.USER_ID)); } catch (error) { console.error("Profile unavailable", error.message); }
  }
  if (!profile.maxHr && n(own?.hrmax)) { out.maxHr = n(own.hrmax); out.runMaxHr = null; sources.maxHr = "heart"; }
  if (!out.maxHr && n(personal?.hrmax)) { out.maxHr = n(personal.hrmax); sources.maxHr = suggested?.sources?.hrmax || null; }
  out.restHr = profile.restHr || n(personal?.rhr) || null;
  // Without the max and resting rate typed in the app: Intervals.icu, then the calibrated values.
  if (!preview.maxHr) preview.maxHr = n(suggested?.hrmax);
  preview.restHr = n(suggested?.rhr);
  if (profile.runThresholdPace) { out.runThresholdPace = profile.runThresholdPace; out.runPaceSource = "manual"; }
  if (profile.runLthr) { out.runLthr = profile.runLthr; sources.runLthr = "manual"; }
  out.paceZones = paceZones(profile, out.runThresholdPace);
  if (profile.swimCss) { out.swimCss = profile.swimCss; out.swimCssSource = "manual"; }
  out.swimZones = swimZones(out.swimCss, profile);
  // A pool chosen by hand, else the one of the last pool swim (training-history.js, in the suggestions row read above).
  out.poolLength = profile.poolLength || n(suggested?.trainingHistory?.poolLength) || null;
  out.poolLengthSource = profile.poolLength ? "manual" : out.poolLength ? "auto" : null;
  out.openWater = profile.openWater || "off";
  // Running LTHR only – the cycling LTHR is usually lower and would mislead.
  const runModel = ["frielLthr", "frielRun", "custom"].includes(profile.hrZoneModel || "frielLthr") ? "frielRun" : profile.hrZoneModel;
  out.runHrModel = hrModelFor(runModel, out.runLthr, out.runMaxHr || out.maxHr, out.restHr);
  // The athlete's own running zones, in bpm, named after the preset they came from.
  if (profile.runHrZoneModel === "custom" && profile.runHrZoneBounds) {
    out.runHrBase = runModel === "custom" ? "frielRun" : runModel;
    out.runHrModel = "custom";
  }
  out.runHrZones = out.runHrModel === "custom"
    ? hrZones({ hrZoneModel: "custom", hrZoneBounds: profile.runHrZoneBounds, hrZoneBase: profile.runHrZoneBase || out.runHrBase, maxHr: out.runMaxHr || out.maxHr })
    : hrZones({ ...profile, hrZoneModel: out.runHrModel, lthr: out.runLthr, maxHr: out.runMaxHr || out.maxHr, restHr: out.restHr });
  // The preset the running zones come from without the athlete's own (Reset).
  out.runHrAuto = hrModelFor(runModel, out.runLthr, out.runMaxHr || out.maxHr, out.restHr);
  out.profile = profile;
  out.sources = { ...sources, ftp: out.source, runThresholdPace: out.runPaceSource, swimCss: out.swimCssSource };
  out.powerZones = powerZones(profile, out.ftp);
  out.hrModel = hrModelFor(profile.hrZoneModel || "frielLthr", out.lthr, out.maxHr, out.restHr);
  out.hrZones = hrZones({ ...profile, hrZoneModel: out.hrModel, lthr: out.lthr, maxHr: out.maxHr, restHr: out.restHr });
  out.preview = preview;
  return out;
}
