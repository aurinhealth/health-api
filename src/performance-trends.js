// How the athlete's rides and runs have been going over the last six weeks,
// for the coach (coach-assistant.js): the volume and the average pace or
// power week by week, the aerobic efficiency (speed or power per heartbeat
// above rest, which rises as fitness grows), the best efforts and what the
// data say the threshold is now (threshold-check.js). Sessions come from
// loadThresholdSessions (threshold-check-state.js).
import { estimateRideFtp, estimateRunPace } from "./threshold-check.js";

const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const round = (v, d = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const paceText = secondsPerKm => {
  if (!(secondsPerKm > 0)) return null;
  const t = Math.round(secondsPerKm);
  return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0") + "/km";
};
const WEEKS = 6;

// Per heartbeat above rest: metres per minute (runs) or watts (rides).
const efficiency = (s, value, athlete) => (s.avgHr > 0 && athlete.restHr > 0 && s.avgHr - athlete.restHr >= 15 ? value / (s.avgHr - athlete.restHr) : null);
// The last three weeks against the three before, in %; null with too few sessions.
function change(points, today) {
  const mid = shift(today, -21);
  const recent = points.filter(p => p.date > mid).map(p => p.value), before = points.filter(p => p.date <= mid).map(p => p.value);
  if (recent.length < 2 || before.length < 2) return null;
  return round((mean(recent) / mean(before) - 1) * 100, 1);
}
const direction = pct => (pct == null ? null : pct > 2 ? "zlepšuje se" : pct < -2 ? "zhoršuje se" : "stabilní");

function weeks(list, today, summarize) {
  const out = [];
  for (let w = WEEKS - 1; w >= 0; w--) {
    const end = shift(today, -7 * w), start = shift(end, -6);
    const inWeek = list.filter(s => s.date >= start && s.date <= end);
    out.push({ weekEnding: end, sessions: inWeek.length, ...(inWeek.length ? summarize(inWeek) : {}) });
  }
  return out;
}

function runTrends(sessions, athlete, today, all) {
  const runs = sessions.filter(s => s.kind === "run" && s.distance > 1000 && s.minutes >= 10);
  if (runs.length < 2) return null;
  const pace = s => (s.minutes * 60) / (s.distance / 1000);
  const steady = runs.filter(s => s.minutes >= 20);
  const eff = steady.map(s => ({ date: s.date, value: efficiency(s, s.distance / s.minutes, athlete) })).filter(p => p.value != null);
  const effChange = change(eff, today);
  const best = (min, max = Infinity) => {
    const pick = runs.filter(s => s.distance >= min && s.distance < max).sort((a, b) => pace(a) - pace(b))[0];
    return pick ? { date: pick.date, km: round(pick.distance / 1000, 1), minutes: round(pick.minutes), pace: paceText(pace(pick)), avgHr: round(pick.avgHr) } : null;
  };
  const longest = [...runs].sort((a, b) => b.distance - a.distance)[0];
  // The threshold estimates look back 90 days, as the threshold check does.
  const estimate = estimateRunPace(all, athlete, today);
  return {
    weeks: weeks(runs, today, list => {
      const km = list.reduce((a, s) => a + s.distance, 0) / 1000, min = list.reduce((a, s) => a + s.minutes, 0);
      const hr = mean(list.map(s => s.avgHr).filter(v => v > 0));
      return { km: round(km, 1), averagePace: paceText((min * 60) / km), averageHr: round(hr) };
    }),
    // Faster at the same heart rate: + means fitter.
    efficiencyChangePercent: effChange, efficiencyTrend: direction(effChange),
    bestEfforts: { "5km+": best(5000, 10000), "10km+": best(10000, 21000), "21km+": best(21000), longest: longest ? { date: longest.date, km: round(longest.distance / 1000, 1), pace: paceText(pace(longest)) } : null },
    thresholdPaceFromData: estimate ? { pace: paceText(estimate.value), confidence: estimate.confidence } : null
  };
}

function rideTrends(sessions, athlete, today, all) {
  const rides = sessions.filter(s => s.kind === "ride" && s.minutes >= 10);
  if (rides.length < 2) return null;
  const powered = rides.filter(s => s.avgPower > 50 && s.minutes >= 20);
  const eff = powered.map(s => ({ date: s.date, value: efficiency(s, s.avgPower, athlete) })).filter(p => p.value != null);
  const effChange = change(eff, today);
  const best = (min, max) => {
    const pick = powered.filter(s => s.minutes >= min && s.minutes <= max).sort((a, b) => b.avgPower - a.avgPower)[0];
    return pick ? { date: pick.date, minutes: round(pick.minutes), averagePower: round(pick.avgPower), normalizedPower: round(pick.normPower), avgHr: round(pick.avgHr) } : null;
  };
  const eftp = rides.filter(s => s.rollingFtp > 0).sort((a, b) => a.date.localeCompare(b.date));
  const eftpNow = eftp.at(-1), eftpBefore = eftp.filter(s => s.date <= shift(today, -28)).at(-1);
  const estimate = estimateRideFtp(all, athlete, today);
  return {
    weeks: weeks(rides, today, list => {
      const hours = list.reduce((a, s) => a + s.minutes, 0) / 60, withPower = list.filter(s => s.avgPower > 50);
      return { hours: round(hours, 1), km: round(list.reduce((a, s) => a + (s.distance || 0), 0) / 1000), averagePower: round(mean(withPower.map(s => s.avgPower))), averageNormalizedPower: round(mean(withPower.map(s => s.normPower).filter(v => v > 0))) };
    }),
    // More power at the same heart rate: + means fitter.
    efficiencyChangePercent: effChange, efficiencyTrend: direction(effChange),
    // Whole-ride averages: the best ride of each length, not a power-curve peak.
    bestEfforts: { "20-40min": best(20, 40), "40-90min": best(40, 90), "90min+": best(90, 600) },
    eftp: eftpNow ? { now: round(eftpNow.rollingFtp), date: eftpNow.date, fourWeeksAgo: eftpBefore ? round(eftpBefore.rollingFtp) : null } : null,
    ftpFromData: estimate ? { ftp: estimate.value, confidence: estimate.confidence, basis: estimate.basis } : null
  };
}

/** {run, ride} trends for the last six weeks, each null without enough sessions; null when both are. */
export function performanceTrends(sessions = [], athlete = {}, today) {
  const recent = (sessions || []).filter(s => s.date > shift(today, -7 * WEEKS) && s.date <= today);
  const run = runTrends(recent, athlete, today, sessions || []), ride = rideTrends(recent, athlete, today, sessions || []);
  return run || ride ? { ...(run ? { run } : {}), ...(ride ? { ride } : {}) } : null;
}
