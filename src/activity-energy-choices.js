// The user's choice for an activity whose device calories looked implausible
// (activity-energy-check.js): count the estimate ("estimate") or keep what the
// watch said ("device"). The energy budget (index.js energyForDate) and the
// active energy of the day follow it. No row: the automatic choice.
const ID = /^[A-Za-z0-9:._-]{1,120}$/;
export const ENERGY_CHOICES = ["estimate", "device"];

async function ensureTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS activity_energy_choices (user_id INTEGER NOT NULL, activity_id TEXT NOT NULL, date TEXT NOT NULL, choice TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, activity_id))").run();
}

// Map of activity id → "estimate" | "device" for these activities.
export async function energyChoices(db, userId, activityIds) {
  const ids = [...new Set((activityIds || []).map(String).filter(id => ID.test(id)))];
  if (!db || !ids.length) return new Map();
  try {
    const rows = (await db.prepare(`SELECT activity_id, choice FROM activity_energy_choices WHERE user_id = ? AND activity_id IN (${ids.map(() => "?").join(",")})`).bind(userId, ...ids).all()).results || [];
    return new Map(rows.filter(r => ENERGY_CHOICES.includes(r.choice)).map(r => [String(r.activity_id), r.choice]));
  } catch (error) {
    if (!/no such table/i.test(error.message)) console.error("Energy choices read failed", error.message);
    return new Map();
  }
}

// { activityId, date, choice }: choice null or "" goes back to the automatic one.
export async function setEnergyChoice(db, userId, body = {}) {
  const activityId = String(body.activityId || ""), date = String(body.date || ""), choice = body.choice == null ? "" : String(body.choice);
  if (!ID.test(activityId)) return { status: "error", code: 400, message: "activityId" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: "error", code: 400, message: "date" };
  if (choice && !ENERGY_CHOICES.includes(choice)) return { status: "error", code: 400, message: "choice" };
  await ensureTable(db);
  if (!choice) {
    await db.prepare("DELETE FROM activity_energy_choices WHERE user_id = ? AND activity_id = ?").bind(userId, activityId).run();
    return { status: "ok", activityId, choice: null };
  }
  await db.prepare("INSERT INTO activity_energy_choices (user_id, activity_id, date, choice, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, activity_id) DO UPDATE SET choice = excluded.choice, date = excluded.date, updated_at = excluded.updated_at")
    .bind(userId, activityId, date, choice, new Date().toISOString()).run();
  return { status: "ok", activityId, choice };
}

// The calories an activity counts with: the device's, or the estimate
// (`auto`: what the automatic check would plan with).
export function applyEnergyChoice(activity, choice) {
  const check = activity?.energyCheck;
  if (!check || check.status !== "review" || !ENERGY_CHOICES.includes(choice)) return activity;
  const auto = Number(activity.caloriesForPlanning ?? check.estimated);
  const device = Number(check.reported ?? activity.reportedCalories ?? activity.calories);
  activity.autoCaloriesForPlanning = auto;
  activity.energyChoice = choice;
  activity.caloriesForPlanning = choice === "device" && device > 0 ? device : auto;
  return activity;
}
