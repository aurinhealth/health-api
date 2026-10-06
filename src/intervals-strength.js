const BASE_URL = "https://intervals.icu/api/v1";

function auth(env) {
  if (!env.INTERVALS_API_KEY) throw new Error("INTERVALS_API_KEY is not configured");
  return "Basic " + btoa("API_KEY:" + env.INTERVALS_API_KEY);
}

const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

function strengthCalories(weightKg, minutes) {
  if (!minutes) return 0;
  return Math.round((5.0 * 3.5 * weightKg / 200) * minutes);
}

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
  // Calories need the athlete's weight; without one they are left out.
  const weightKg = n(options.weightKg, 0);
  const calories = weightKg > 0 ? strengthCalories(weightKg, durationMinutes) : null;
  const description = [
    plan.rationale ? `Proč tenhle trénink: ${plan.rationale}` : "",
    formatRows(plan.rows || []),
    calories ? `Odhad výdeje: ${calories} kcal · ${durationMinutes} min` : "",
    "Vygenerováno v Loadwise"
  ].filter(Boolean).join("\n\n");

  return {
    external_id: externalId,
    category: "WORKOUT",
    start_date_local: `${plan.date}T${startTime}:00`,
    type: "WeightTraining",
    name: `Strength — ${plan.planName || "Gym"}`,
    description,
    moving_time: Math.round(durationMinutes * 60),
    ...(calories ? { calories } : {})
  };
}

export async function writeStrengthPlanToIntervals(env, plan, options = {}) {
  const event = strengthPlanToIntervalsEvent(plan, options);
  const response = await fetch(`${BASE_URL}/athlete/0/events/bulk?upsert=true`, {
    method: "POST",
    headers: {
      Authorization: auth(env),
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify([event])
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(`Intervals.icu HTTP ${response.status}: ${JSON.stringify(data)}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || result.type !== "WeightTraining") {
    throw new Error(`Intervals.icu returned an unexpected strength event: ${JSON.stringify(result)}`);
  }
  // The local copy of the event, so the week shows the session now and not after the next sync.
  if (result.id != null && env.DB?.prepare) {
    const start = result.start_date_local || event.start_date_local;
    await env.DB.prepare("INSERT INTO health_datapoints(user_id,source_family,data_type,external_id,sample_time,start_time,end_time,payload_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,source_family,data_type,external_id) DO UPDATE SET sample_time=excluded.sample_time,start_time=excluded.start_time,end_time=excluded.end_time,payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP")
      .bind(env.USER_ID ?? env.DB.userId, "intervals", "planned-workout", "planned:" + result.id, start, start, result.end_date_local || null, JSON.stringify({ ...event, ...result })).run().catch(() => {});
  }
  return {
    status: "ok",
    externalId: event.external_id,
    eventId: result.id ?? null,
    startDateLocal: result.start_date_local || event.start_date_local,
    type: result.type,
    name: result.name || event.name,
    estimatedCalories: event.calories
  };
}
