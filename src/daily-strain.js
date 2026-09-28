// This is an activity-energy proxy, not the proprietary WHOOP or Bevel score.
export function dailyStrain(day, history = []) {
  const active = day?.activeCalories;
  if (active == null || !Number.isFinite(Number(active)) || Number(active) < 0) return null;
  const previous = history.filter(row => row.id < day.id && row.id >= shift(day.id, -30))
    .map(row => Number(row.activeCalories)).filter(value => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const baseline = previous.length >= 7 ? previous[Math.floor(previous.length / 2)] : null;
  if (!baseline) return {score: null, activeCalories: Math.round(Number(active)), baseline: null};
  const score = Math.min(21, 21 * (1 - Math.exp(-Number(active) / (baseline * 1.2))));
  return {score: Math.round(score * 10) / 10, activeCalories: Math.round(Number(active)), baseline: Math.round(baseline)};
}

function shift(date, days) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
