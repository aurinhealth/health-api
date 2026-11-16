// Training → plan overview (redesign S2, 2026-11-16): the active plan week by
// week, the done weeks full and the coming ones as an outline, with the race
// day last. A light read for the overview and the phase screens: no week
// targets, race estimates or plan results (those stay in GET /app/api/plans
// and /app/api/plans/week). Pure: the route loads the plan and the done days.
import { planWeek, planCompletion, templateSummary, planSports, phaseLabel, getTemplate, mondayOf } from "./training-plans.js";

const DAY = 86400000;
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * DAY).toISOString().slice(0, 10);

// plan: an active plan (training-plans.js); doneDates: the days with a session
// of the plan's sports from its start to today; days: the week plan's days of
// the plan's sport (sportDays), for how many sessions a week count.
export function planOverview(plan, { today, doneDates = [], days = [] } = {}) {
  const template = plan && getTemplate(plan.templateId);
  if (!template) return null;
  const picked = template.choose ? planSports(plan) : null;
  const summary = templateSummary(template, picked);
  const completion = planCompletion(plan, { days, doneDates, today });
  const done = new Set(doneDates), thisMonday = mondayOf(today);
  const weeks = template.weeks.map((_, i) => {
    const monday = shift(plan.startDate, i * 7), pw = planWeek(plan, monday);
    const spec = pw?.spec || template.weeks[i];
    const status = monday < thisMonday ? "done" : monday === thisMonday ? "current" : "future";
    const phase = spec.phase;
    return {
      week: i + 1,
      monday,
      phase,
      phaseLabel: spec.gym ? spec.gym.name : phaseLabel(phase, template.sport),
      keys: summary.weeks[i]?.keys || [],
      status,
      // Share of the planned sessions done, for a finished week only.
      ...(status === "done" && completion[i + 1] != null ? { completion: completion[i + 1] } : {}),
      // Days with a session of the plan's sports this week so far.
      ...(status !== "future" ? { doneDays: [...done].filter(d => d >= monday && d < shift(monday, 7) && d <= today).length } : {}),
      // A taper or race week's volume against the usual one, from the plan's
      // own week load (M-TRI-1: "About 60% of your usual volume this week").
      ...(["taper", "race"].includes(phase) && spec.load > 0 ? { volumePercent: Math.round(spec.load * 100) } : {}),
      ...(spec.light ? { light: true } : {}),
      ...(spec.returning ? { returning: true } : {}),
      ...(pw?.pulled ? { pulled: true } : {})
    };
  });
  return {
    id: plan.id ?? null,
    templateId: template.id,
    sport: template.sport,
    name: template.name,
    startDate: plan.startDate,
    endDate: shift(plan.startDate, template.weeks.length * 7 - 1),
    week: Math.max(0, Math.min(template.weeks.length, Math.floor((Date.parse(thisMonday + "T12:00:00Z") - Date.parse(plan.startDate + "T12:00:00Z")) / (7 * DAY)) + 1)),
    weeksCount: template.weeks.length,
    paused: Boolean(plan.pauseFrom),
    // The "Race day" row: only a race plan with its date.
    raceDay: template.race && plan.raceDate ? { date: plan.raceDate, km: plan.raceKm ?? template.race.km ?? null } : null,
    weeks
  };
}
