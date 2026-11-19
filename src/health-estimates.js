// Aurin's own VO2max and Aurin age for the Health tab and the VO2max detail,
// from the rows the daily job keeps (own-vo2max-store.js). Pure: the routes
// load the rows. Only Aurin's estimate is shown, never a watch's VO2max (Petr
// 2026-11-16, T-SCI-1).

// FRIEND registry, treadmill tests with measured VO2max, sex-specific
// percentiles by age group (Kaminsky LA, Arena R, Myers J. Reference standards
// for cardiorespiratory fitness measured with cardiopulmonary exercise
// testing. Mayo Clin Proc 2015;90:1515–1523, doi:10.1016/j.mayocp.2015.07.026,
// table of measured treadmill VO2max; PMC4919021). ml/kg/min, the 10th, 25th,
// 50th, 75th and 90th percentile. Only for comparison on screen ("Compared
// with men aged 30 to 39 in lab tests"); Aurin age keeps its HUNT norm
// (own-vo2max.js NORMS). No group under 20 or over 79: no comparison then.
export const FRIEND_2015 = {
  male: [
    [20, 29, 32.1, 40.1, 48.0, 55.2, 61.8],
    [30, 39, 30.2, 35.9, 42.4, 49.2, 56.5],
    [40, 49, 26.8, 31.9, 37.8, 45.0, 52.1],
    [50, 59, 22.8, 27.1, 32.6, 39.7, 45.6],
    [60, 69, 19.8, 23.7, 28.2, 34.5, 40.3],
    [70, 79, 17.1, 20.4, 24.4, 30.4, 36.6]
  ],
  female: [
    [20, 29, 23.9, 30.5, 37.6, 44.7, 51.3],
    [30, 39, 20.9, 25.3, 30.2, 36.1, 41.4],
    [40, 49, 18.8, 22.1, 26.7, 32.4, 38.4],
    [50, 59, 17.3, 19.9, 23.4, 27.6, 32.0],
    [60, 69, 14.6, 17.2, 20.0, 23.8, 27.0],
    [70, 79, 13.6, 15.6, 18.3, 20.8, 23.1]
  ]
};

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round1 = v => (v == null ? null : Math.round(v * 10) / 10);
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Full years on `date` from the profile's birth date, else its age.
export function profileAge(profile, date) {
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(String(profile?.birthDate || "")) ? profile.birthDate : null;
  if (birth) return Number(date.slice(0, 4)) - Number(birth.slice(0, 4)) - (date.slice(5) < birth.slice(5) ? 1 : 0);
  return num(profile?.age);
}

// The user's FRIEND group and its percentiles, or null (sex not set, age outside 20–79).
export function friendBands(age, sex) {
  const a = num(age), table = FRIEND_2015[sex];
  if (!table || a == null) return null;
  const row = table.find(r => a >= r[0] && a <= r[1]);
  if (!row) return null;
  const [ageFrom, ageTo, p10, p25, p50, p75, p90] = row;
  return { registry: "FRIEND", year: 2015, test: "treadmill", sex, ageFrom, ageTo, p10, p25, p50, p75, p90 };
}

// The change between the newest value and the average of the 7 days `days`
// before it (as weight's change on Health), or null without a row there.
function changeOver(rows, key, days) {
  const last = rows.at(-1);
  if (!last || num(last[key]) == null) return null;
  const to = shift(last.date, -days), from = shift(to, -7);
  const then = mean(rows.filter(r => r.date > from && r.date <= to && num(r[key]) != null).map(r => num(r[key])));
  return then == null ? null : round1(num(last[key]) - then);
}

// Where the estimate's data came from: the sources of the workouts and resting
// heart rate it used (stored from 2026-11-16 on; older rows have none).
const sourcesOf = row => (Array.isArray(row?.details?.sources) ? row.details.sources : []);

// rows: fitness_estimates rows oldest first, { date, vo2max, compositeAge, fitnessAge, details }.
export function vo2maxView({ rows = [], age = null, sex = null }) {
  const list = rows.filter(r => num(r.vo2max) > 0);
  const last = list.at(-1);
  if (!last) return null;
  return {
    value: round1(num(last.vo2max)),
    date: last.date,
    // Change over 3 months (90 days).
    change3m: changeOver(list, "vo2max", 90),
    sources: sourcesOf(last),
    compared: friendBands(age, sex),
    series: list.map(r => ({ date: r.date, value: round1(num(r.vo2max)) }))
  };
}

// The user's norm for fitness age and Aurin age: FRIEND unless they chose HUNT.
export const fitnessNormOf = profile => (profile?.fitnessNorm === "hunt" ? "hunt" : "friend");

// The rows with fitness age and Aurin age in the user's norm. A row stores both
// (details.ages, from 2026-11-16); an older row only HUNT's in its columns, so
// for FRIEND it has no age (its VO2max stays).
export function withNorm(rows, norm) {
  return rows.map(r => {
    const a = r.details?.ages?.[norm];
    if (a) return { ...r, fitnessAge: a.fitnessAge, compositeAge: a.compositeAge, details: { ...r.details, composite: a.compositeAge == null ? null : { ...(r.details.composite || {}), parts: a.parts, gains: a.gains } } };
    return r.details?.ages || norm === "hunt" ? r : { ...r, fitnessAge: null, compositeAge: null };
  });
}

export function aurinAgeView({ rows = [], age = null, norm = "friend" }) {
  const list = rows.filter(r => num(r.compositeAge) != null);
  const last = list.at(-1);
  if (!last) return null;
  const c = last.details?.composite || {};
  return {
    value: round1(num(last.compositeAge)),
    age: num(age),
    // "friend" (the default) or "hunt": the norm the ages compare VO2max with.
    norm,
    date: last.date,
    fitnessAge: round1(num(last.fitnessAge)),
    // Years each factor adds (+) or takes off (−), and what each habit could take off.
    parts: c.parts || {},
    gains: c.gains || {},
    change90: changeOver(list, "compositeAge", 90),
    series: list.map(r => ({ date: r.date, value: round1(num(r.compositeAge)) }))
  };
}

// VO2max or Aurin age for a chart of 30 days to a year (GET
// /app/api/health/series?metric=vo2max|aurinAge): daily points, weekly
// averages (Monday) from 91 days on, as the other Health charts. No band: the
// comparison is the FRIEND group, the same for every point.
export function estimateSeries({ rows = [], key, days, date }) {
  const from = shift(date, -days + 1);
  const list = rows.filter(r => r.date >= from && r.date <= date && num(r[key]) != null);
  if (days < 91) return list.map(r => ({ date: r.date, value: round1(num(r[key])) }));
  const weeks = new Map();
  for (const r of list) { const d = new Date(Date.parse(r.date + "T12:00:00Z")), w = shift(r.date, -((d.getUTCDay() + 6) % 7)); (weeks.get(w) || weeks.set(w, []).get(w)).push(num(r[key])); }
  return [...weeks].map(([w, vs]) => ({ date: w, value: round1(mean(vs)) }));
}
