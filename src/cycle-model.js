// The menstrual cycle from what the athlete logged (and Apple Health's
// menstrual flow): the day of the cycle, its phase, the next period as a
// range, the pill pack and the calendar month. Pure: GET /app/api/cycle and
// the readiness on Today load the inputs (cycle-store.js).
//
// - A period starts on a bleeding day with no bleeding in the 7 days before.
//   The date the athlete gave at setup (settings.lastPeriod) counts as a start
//   when no logged bleeding is near it.
// - The cycle length is the mean of the last (up to 6) gaps between starts of
//   18–50 days once there are 2 of them; before that the length the athlete
//   gave, else 28. The next period is expected after that length, shown as a
//   range of ± half the spread of the gaps (1–7 days; ± 1 day before the
//   athlete has 2 cycles on record).
// - Ovulation is expected 14 days before the next period (the luteal phase is
//   the stable one, about 14 days; Lenton 1984), or the day after a positive
//   ovulation test. Phases: menstrual (the bleeding days, else the period
//   length), follicular, ovulation (the day before to the day after), luteal.
// - Hormonal contraception (pill, patch, ring, hormonal IUD, implant,
//   injection) suppresses or masks ovulation, so there are no phases, no
//   ovulation and no forecast: only what was logged. A copper IUD leaves the
//   natural cycle.
// - Fáze života (lifeStage): in perimenopause the cycles get irregular (gaps
//   of 18–90 days count, and a 60-day gap marks late perimenopause; STRAW+10,
//   Harlow 2012), ovulation is unreliable, so there are no phases: the next
//   period is the range from the shortest to the longest recent gap and the
//   morning question stays away. In menopause (12 months without a period)
//   there is no cycle at all: only the logged symptoms. Hot flashes, night
//   sweats, poor sleep and joint pain join the symptoms; hrt notes hormone
//   therapy for the coach.

export const CONTRACEPTION = ["none", "pill", "patch", "ring", "hormonal_iud", "copper_iud", "implant", "injection"];
export const HORMONAL = new Set(["pill", "patch", "ring", "hormonal_iud", "implant", "injection"]);
export const PILL_PACKS = { "21+7": 21, "24+4": 24, "28": 28 };
export const SYMPTOMS = ["cramps", "fatigue", "headache", "bloating", "mood", "appetite", "hot_flashes", "night_sweats", "poor_sleep", "joint_pain"];
export const LIFE_STAGES = ["regular", "perimenopause", "menopause"];
export const DEFAULT_LENGTH = 28;
export const DEFAULT_PERIOD = 5;
export const LUTEAL_DAYS = 14;

const DAY = 86400000;
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);
const between = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Settings with every field valid; anything else falls back to the default.
export function normalizeCycleSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const len = Math.round(Number(s.cycleLength)), per = Math.round(Number(s.periodLength));
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.pillReminderTime || "")) ? s.pillReminderTime : "21:00";
  return {
    enabled: s.enabled === true,
    lastPeriod: isDate(s.lastPeriod) ? s.lastPeriod : null,
    cycleLength: Number.isFinite(len) && len >= 21 && len <= 40 ? len : null,
    periodLength: Number.isFinite(per) && per >= 2 && per <= 10 ? per : null,
    contraception: CONTRACEPTION.includes(s.contraception) ? s.contraception : "none",
    lifeStage: LIFE_STAGES.includes(s.lifeStage) ? s.lifeStage : "regular",
    hrt: s.hrt === true,
    adaptTraining: s.adaptTraining !== false,
    pillPack: Object.hasOwn(PILL_PACKS, s.pillPack) ? s.pillPack : "21+7",
    packStart: isDate(s.packStart) ? s.packStart : null,
    pillReminder: s.pillReminder === true,
    pillReminderTime: time,
    pillReminderInPause: s.pillReminderInPause === true,
    // The AI coach sees today's cycle (cycleForCoach) only when the athlete
    // turns this on: cycle data is special-category health data (GDPR art. 9).
    shareWithCoach: s.shareWithCoach === true,
    shareWithCoachAt: s.shareWithCoach === true && typeof s.shareWithCoachAt === "string" ? s.shareWithCoachAt : null,
  };
}

// One logged day, cleaned: flow 0–3 (0 none, 1 light, 2 medium, 3 heavy),
// symptoms from SYMPTOMS, pill "taken", its time "HH:MM" or null, noPeriod
// (the athlete answered "not yet" that morning).
export function normalizeCycleDay(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const flow = Math.round(Number(d.flow));
  const symptoms = Array.isArray(d.symptoms) ? [...new Set(d.symptoms.filter(x => SYMPTOMS.includes(x)))] : [];
  const pill = d.pill === true || d.pill === "taken" ? "taken" : /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.pill || "")) ? d.pill : null;
  return { date: isDate(d.date) ? d.date : null, flow: Number.isFinite(flow) ? clamp(flow, 0, 3) : 0, symptoms, pill, noPeriod: d.noPeriod === true, ovulationTest: d.ovulationTest === true };
}

// Period starts (oldest first) from the bleeding days and the setup date.
export function periodStarts(days, settings) {
  const bleeding = [...new Set((days || []).filter(d => d && isDate(d.date) && Number(d.flow) > 0).map(d => d.date))].sort();
  const starts = [];
  let prev = null;
  for (const d of bleeding) {
    if (!prev || between(prev, d) > 7) starts.push(d);
    prev = d;
  }
  const lp = settings && settings.lastPeriod;
  if (isDate(lp) && !bleeding.some(d => Math.abs(between(lp, d)) <= 7)) { starts.push(lp); starts.sort(); }
  return starts;
}

// The cycle length and how sure it is: the mean of the last 6 gaps between
// starts of 18–50 days once there are 2, else the athlete's own number, else
// 28. `spread` is half the range of those gaps (the forecast's ±), 1 day
// before there are 2.
export function cycleLength(starts, settings) {
  const peri = settings && settings.lifeStage === "perimenopause";
  const gaps = [];
  for (let i = 1; i < (starts || []).length; i++) {
    const g = between(starts[i - 1], starts[i]);
    if (g >= 18 && g <= (peri ? 90 : 50)) gaps.push(g);
  }
  const recent = gaps.slice(-6);
  if (recent.length >= 2) {
    const mean = Math.round(recent.reduce((s, g) => s + g, 0) / recent.length);
    const shortest = Math.min(...recent), longest = Math.max(...recent);
    return { length: mean, spread: clamp(Math.round((longest - shortest) / 2), 1, peri ? 30 : 7), learned: true, cycles: recent.length, shortest, longest };
  }
  return { length: (settings && settings.cycleLength) || DEFAULT_LENGTH, spread: 1, learned: false, cycles: recent.length };
}

// Where `date` is in the cycle. Null when the cycle is off or nothing is
// known; with hormonal contraception only the days since the last bleeding
// (and the pill pack).
export function cycleState(input) {
  const settings = normalizeCycleSettings(input && input.settings);
  const date = input && input.date;
  if (!settings.enabled || !isDate(date)) return null;
  const days = (input.days || []).map(normalizeCycleDay).filter(d => d.date && d.date <= date);
  const byDate = new Map(days.map(d => [d.date, d]));
  const today = byDate.get(date) || null;
  const starts = periodStarts(days, settings).filter(d => d <= date);
  const hormonal = HORMONAL.has(settings.contraception);
  const lastStart = starts.at(-1) || null;
  const lastBleed = [...days].reverse().find(d => d.flow > 0)?.date || (lastStart && settings.lastPeriod === lastStart ? lastStart : null);
  const out = { date, contraception: settings.contraception, hormonal, lifeStage: settings.lifeStage, hrt: settings.hrt, adaptTraining: settings.adaptTraining, today, pill: pillState(settings, date, today) };
  if (hormonal || settings.lifeStage === "menopause") return { ...out, daysSinceBleeding: lastBleed ? between(lastBleed, date) : null };
  if (!lastStart) return { ...out, cycleDay: null, phase: null, next: null };
  const { length, spread, learned, cycles, shortest, longest } = cycleLength(starts, settings);
  // Perimenopause: no phases, the next period from the shortest to the longest gap.
  if (settings.lifeStage === "perimenopause") {
    const from = shift(lastStart, learned ? shortest : Math.max(21, length - 7)), to = shift(lastStart, learned ? longest : length + 14);
    return { ...out, cycleDay: between(lastStart, date) + 1, phase: null, length, learned, cycles, range: learned ? { shortest, longest } : null,
      lastStart, next: { start: shift(lastStart, length), from, to, late: date > to }, daysToNext: Math.max(0, between(date, from)) };
  }
  const cycleDay = between(lastStart, date) + 1;
  const periodLen = settings.periodLength || DEFAULT_PERIOD;
  // The last positive ovulation test in this cycle moves ovulation to the day
  // after it; otherwise 14 days before the expected next period.
  const test = days.filter(d => d.ovulationTest && d.date >= lastStart).map(d => d.date).at(-1);
  const ovulationDay = test ? between(lastStart, test) + 2 : Math.max(periodLen + 2, length - LUTEAL_DAYS);
  const bleedingRun = today && today.flow > 0;
  const phase = (cycleDay <= periodLen || bleedingRun) && cycleDay <= 10 ? "menstrual"
    : cycleDay < ovulationDay - 1 ? "follicular"
    : cycleDay <= ovulationDay + 1 ? "ovulation" : "luteal";
  const expected = shift(lastStart, length);
  const next = { start: expected, from: shift(expected, -spread), to: shift(expected, spread), late: date > shift(expected, spread) };
  return { ...out, cycleDay, phase, length, learned, cycles, periodLength: periodLen, ovulation: shift(lastStart, ovulationDay - 1), ovulationTested: !!test, lastStart, next, daysToNext: Math.max(0, between(date, expected)) };
}

// The pill pack on `date`: which pill (1 of 21) or a pause day, from the day
// the pack started. Null unless the contraception is the pill.
export function pillState(settings, date, today) {
  if (!settings || settings.contraception !== "pill" || !isDate(settings.packStart) || !isDate(date) || date < settings.packStart) return null;
  const active = PILL_PACKS[settings.pillPack] || 21, total = 28;
  const index = between(settings.packStart, date) % total;
  const pause = index >= active;
  return { pack: settings.pillPack, number: pause ? null : index + 1, of: active, pause, pauseDay: pause ? index - active + 1 : null, taken: today ? today.pill : null };
}

// Ask "Has your period started?" in the morning: a natural cycle, the forecast
// range reached (from its first day to 10 days after its last), no bleeding
// logged since the range opened and no "not yet" today.
export function askPeriodToday(state) {
  if (!state || state.hormonal || !state.next || (state.lifeStage && state.lifeStage !== "regular")) return false;
  const { date, next, today } = state;
  if (date < next.from || date > shift(next.to, 10)) return false;
  if (today && (today.flow > 0 || today.noPeriod)) return false;
  return state.lastStart < next.from;
}

// How the cycle bears on today's training: on a bleeding day with heavy flow,
// cramps or fatigue, hard sessions become easy ones. Nothing with the
// adjustment turned off. Returns the reason the coach states, or null.
export function cycleTrainingCaution(state) {
  if (!state || !state.adaptTraining || !state.today) return null;
  const t = state.today;
  if (!(t.flow > 0)) return null;
  const reasons = [];
  if (t.flow >= 3) reasons.push("heavy");
  for (const s of ["cramps", "fatigue"]) if (t.symptoms.includes(s)) reasons.push(s);
  return reasons.length ? { reasons, cycleDay: state.cycleDay ?? null } : null;
}

// What the AI coach may know about today's cycle, with shareWithCoach on:
// today only, no dates or history. Null otherwise.
export function cycleForCoach(input) {
  const settings = normalizeCycleSettings(input && input.settings);
  if (!settings.enabled || !settings.shareWithCoach) return null;
  const state = cycleState(input);
  if (!state) return null;
  const t = state.today;
  const out = { hormonal: state.hormonal, flow: ["none", "light", "medium", "heavy"][t ? t.flow : 0], symptoms: t ? t.symptoms : [] };
  if (state.lifeStage !== "regular") Object.assign(out, { lifeStage: state.lifeStage, hrt: state.hrt });
  if (state.hormonal) {
    if (state.pill && state.pill.pause) out.pillPause = true;
    return out;
  }
  if (state.cycleDay) Object.assign(out, { cycleDay: state.cycleDay, phase: state.phase, cycleLength: state.length, daysToNextPeriod: state.daysToNext });
  const caution = cycleTrainingCaution(state);
  if (caution) out.easeToday = true;
  return out;
}

// The rows the readiness reads, marked with the phase each day was in (only
// for a natural cycle), so the luteal rise of resting heart rate and wrist
// temperature is compared with the athlete's own luteal days
// (recovery-model.js lutealOffset).
export function markCyclePhases(rows, input) {
  const settings = normalizeCycleSettings(input && input.settings);
  if (!settings.enabled || HORMONAL.has(settings.contraception) || settings.lifeStage !== "regular") return rows;
  return (rows || []).map(r => {
    if (!r || !isDate(r.id)) return r;
    const st = cycleState({ ...input, date: r.id });
    return st && st.phase ? { ...r, cyclePhase: st.phase } : r;
  });
}

// The calendar month "YYYY-MM": every day with what was logged, the forecast
// (natural cycle only) and the pill (planned or taken).
export function cycleMonth(input, month) {
  const settings = normalizeCycleSettings(input && input.settings);
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) return [];
  const first = month + "-01", count = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const byDate = new Map((input.days || []).map(normalizeCycleDay).filter(d => d.date).map(d => [d.date, d]));
  const state = input.today ? cycleState({ ...input, date: input.today }) : null;
  const out = [];
  for (let i = 0; i < count; i++) {
    const date = shift(first, i), d = byDate.get(date);
    const pill = pillState(settings, date, d || null);
    const row = { date, flow: d ? d.flow : 0, symptoms: d ? d.symptoms : [] };
    if (pill) row.pill = pill.pause ? "pause" : d && d.pill ? "taken" : "planned";
    if (state && !state.hormonal && state.phase !== null && state.next && date > state.date) {
      if (date >= state.next.from && date <= state.next.to) row.forecast = true;
    }
    if (state && !state.hormonal && state.ovulation && date === state.ovulation) row.ovulation = true;
    if (d && d.ovulationTest) row.ovulation = true;
    out.push(row);
  }
  return out;
}
