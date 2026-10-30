// Race times and race power from the athlete's thresholds: what Rekordy shows
// as the estimate for a race, what a race plan starts from and the race day's
// pace or power.
// - Running: race pace against threshold speed (about 104 % for 5 km, 100 %
//   for 10 km, 96 % for a half, 91 % for a marathon, 80–85 % for an ultra),
//   the same ratios as Riegel's exponent 1.06 from a one-hour effort.
// - Cycling: the power that can be held for a duration from FTP (about 120 %
//   for 5 minutes, 105 % for 20, 100 % for 60; Allen & Coggan), a race's
//   share of FTP (a gran fondo 65–75 %, an MTB marathon 70–80 %, a time trial
//   and a hill climb what the duration allows) and the speed that power gives
//   on a flat road or a 6 % climb without wind (air drag and rolling
//   resistance; Martin 1998).

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---- running -----------------------------------------------------------------
export const RACE_PACE = km => km <= 5 ? 104 : km <= 10 ? 100 : km <= 21.1 ? 96 : km <= 42.2 ? 91 : km <= 60 ? 85 : 80;
// Seconds for a race of `km` from the threshold pace (s/km), or null without one.
export const runRaceSeconds = (km, thresholdPace) => Number(thresholdPace) > 0 ? Math.round(km * Number(thresholdPace) / (RACE_PACE(km) / 100)) : null;
export const RUN_DISTANCES = [5, 10, 21.1, 42.2];
export function runEstimates(thresholdPace) {
  if (!(Number(thresholdPace) > 0)) return null;
  return { thresholdPace: Math.round(Number(thresholdPace)), races: RUN_DISTANCES.map(km => { const seconds = runRaceSeconds(km, thresholdPace); return { km, seconds, pace: Math.round(seconds / km) }; }) };
}
// A goal time against the estimate now: how bold it is for the weeks left.
// "easy" (slower than now), "real" (up to 1 % a month faster), "bold" (up to
// 2 % a month) or "hard" (more).
export function goalVerdict(goalSeconds, estimateSeconds, weeks) {
  if (!(goalSeconds > 0) || !(estimateSeconds > 0)) return null;
  const faster = (estimateSeconds - goalSeconds) / estimateSeconds, months = Math.max(1, weeks / 4.3);
  return faster <= 0 ? "easy" : faster <= .01 * months ? "real" : faster <= .02 * months ? "bold" : "hard";
}

// ---- cycling -----------------------------------------------------------------
// Share of FTP held for a duration in minutes (a power-duration curve fitted
// to 5, 20 and 60 minutes: 1.2, 1.05, 1.0).
export const durationShare = minutes => {
  const m = clamp(Number(minutes) || 60, 3, 600);
  return m <= 20 ? 1.05 + (1.2 - 1.05) * Math.log(20 / m) / Math.log(4) : m <= 60 ? 1 + .05 * Math.log(60 / m) / Math.log(3) : Math.pow(60 / m, .07);
};
export function rideEstimates(ftp, weight = null) {
  if (!(Number(ftp) > 0)) return null;
  const kg = Number(weight) > 30 ? Number(weight) : null;
  return { ftp: Math.round(Number(ftp)), efforts: [5, 20, 60].map(minutes => { const watts = Math.round(ftp * durationShare(minutes)); return { minutes, watts, wkg: kg ? Math.round(watts / kg * 10) / 10 : null }; }) };
}

// The races of the cycling plans: the share of FTP to hold (a range) and the
// course: flat road, terrain or a 6 % climb.
export const RIDE_RACES = {
  granfondo: { low: .65, high: .75, course: "road" },
  mtb: { low: .7, high: .8, course: "mtb" },
  tt: { course: "tt" },
  climb: { course: "climb" },
  // A triathlon's ride: lower the longer the race, the run still to come (Friel).
  "tri-short": { low: .8, high: .88, course: "tt" },
  "tri-half": { low: .72, high: .8, course: "tt" },
  "tri-full": { low: .65, high: .72, course: "tt" }
};
const COURSE = {
  road: { cda: .32, crr: .0045, grade: 0 },
  tt: { cda: .24, crr: .004, grade: 0 },
  // Terrain: more rolling resistance and the speed of singletrack.
  mtb: { cda: .4, crr: .016, grade: 0 },
  climb: { cda: .38, crr: .0045, grade: .06 }
};
// Speed in m/s for power on a course (rider and bike: kg + 9).
export function speedFor(watts, kg, course = "road") {
  const c = COURSE[course] || COURSE.road, m = (Number(kg) > 30 ? Number(kg) : 75) + 9, g = 9.81, rho = 1.2, eff = .97;
  const need = v => .5 * rho * c.cda * v ** 3 + m * g * v * (c.crr + c.grade);
  let lo = .5, hi = 25;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (need(mid) > watts * eff) hi = mid; else lo = mid; }
  return lo;
}
// The race's power (low–high W) and its time in minutes. Without FTP, 2.5 W/kg.
export function rideRace(kind, km, { ftp = null, weight = null } = {}) {
  const race = RIDE_RACES[kind];
  if (!race || !(Number(km) > 0)) return null;
  const kg = Number(weight) > 30 ? Number(weight) : 75, base = Number(ftp) > 0 ? Number(ftp) : 2.5 * kg;
  let minutes = 60, share = race.low ? (race.low + race.high) / 2 : 1;
  // A time trial and a climb: the power the duration allows, which sets the duration.
  for (let i = 0; i < 6; i++) {
    if (!race.low) share = durationShare(minutes);
    minutes = km * 1000 / speedFor(base * share, kg, race.course) / 60;
  }
  const low = race.low ? base * race.low : base * share * .97, high = race.low ? base * race.high : base * share * 1.02;
  return { kind, km, minutes: Math.round(minutes), low: Math.round(low), high: Math.round(high), share: Math.round(share * 100), estimated: !(Number(ftp) > 0) };
}
