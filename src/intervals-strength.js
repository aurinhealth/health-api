

function formatKg(value) {
  if (value == null || value === "") return "vlastní váha";
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return String(value);
  return (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)).replace(".", ",") + " kg";
}

// Consecutive rows of one exercise and type: the exercise's warm-up or its work sets.
function groups(rows, type) {
  const out = [];
  for (const row of rows.filter(r => r?.[0] === type && r?.[1])) {
    const last = out[out.length - 1];
    if (last && last.exercise === row[1]) last.rows.push(row); else out.push({ exercise: row[1], rows: [row] });
  }
  return out;
}

// Markdown for the Intervals.icu event: paragraphs and lists separated by
// blank lines (single line breaks run together there), one line per exercise.
function formatRows(rows) {
  const sections = [];
  const warmup = groups(rows, "WARMUP");
  if (warmup.length) sections.push("Rozcvička:", warmup.map(g => `- ${g.exercise}: ${g.rows.map(r => `${formatKg(r[3])} × ${r[4] || "?"}`).join(", ")}`).join("\n"));
  const work = groups(rows, "WORK");
  if (work.length) sections.push("Pracovní série:", work.map((g, i) => {
    const loads = [...new Set(g.rows.map(r => formatKg(r[3])))];
    const reps = [...new Set(g.rows.map(r => r[4] || "?"))];
    const sets = loads.length === 1 && reps.length === 1 ? `${g.rows.length} × ${reps[0]} @ ${loads[0]}` : g.rows.map(r => `${r[4] || "?"} @ ${formatKg(r[3])}`).join(", ");
    const superset = g.rows[0][12], failure = g.rows.some(r => r[11] === 'TRUE'), rest = String(g.rows[0][9] || '').match(/\[Pauza (\d+) s\]/)?.[1];
    return `${i + 1}. ${g.exercise}: ${sets}${superset ? ' · supersérie ' + superset : ''}${failure ? ' · poslední série do technického selhání' : ''}${rest ? ' · pauza ' + rest + ' s' : ''}`;
  }).join("\n"));
  return sections.join("\n\n");
}

export function strengthPlanToIntervalsEvent(plan, options = {}) {
  if (!plan?.date) throw new Error("Strength plan date is required");
  const startTime = String(options.startTime || "00:00").slice(0, 5);
  const externalId = String(options.externalId || `health-strength-${plan.date}`);
  const durationMinutes = Number(options.durationMinutes || 60);
  const description = [
    plan.rationale ? `Proč tenhle trénink: ${plan.rationale}` : "",
    formatRows(plan.rows || []),
    "Vygenerováno v Loadwise"
  ].filter(Boolean).join("\n\n");

  return {
    external_id: externalId,
    category: "WORKOUT",
    start_date_local: `${plan.date}T${startTime}:00`,
    type: "WeightTraining",
    name: `Strength — ${plan.planName || "Gym"}`,
    description,
    // No calorie estimate: the app keeps the energy picture, Intervals.icu the training.
    moving_time: Math.round(durationMinutes * 60)
  };
}

export async function writeStrengthPlanToIntervals(env,plan,options={}) {
  const {storeLocalEvent,syncLocalWorkout}=await import('./local-workouts.js');
  const event=strengthPlanToIntervalsEvent(plan,options),local=await storeLocalEvent(env.DB,event);
  const result=await syncLocalWorkout(env,local.id);
  return {...result,externalId:local.event.external_id,eventId:local.id,startDateLocal:event.start_date_local,type:event.type,name:event.name};
}
