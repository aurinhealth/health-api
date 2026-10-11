// Pairings the user made by hand in the app: a planned session and the
// activity that fulfilled it, when the automatic pairing (index.js
// matchPlannedWorkouts) missed it or picked the wrong one. activity_id ''
// keeps a plan unpaired.
const ID = /^[A-Za-z0-9:._-]{1,120}$/;

async function ensureTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS manual_activity_pairs (user_id INTEGER NOT NULL, planned_id TEXT NOT NULL, activity_id TEXT NOT NULL, date TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, planned_id))").run();
}

// Map of planned id → activity id ('' = no activity) for these plans.
export async function manualPairs(db, userId, plannedIds) {
  const ids = [...new Set((plannedIds || []).map(String).filter(id => ID.test(id)))];
  if (!db || !ids.length) return new Map();
  try {
    const rows = (await db.prepare(`SELECT planned_id, activity_id FROM manual_activity_pairs WHERE user_id = ? AND planned_id IN (${ids.map(() => "?").join(",")})`).bind(userId, ...ids).all()).results || [];
    return new Map(rows.map(r => [String(r.planned_id), String(r.activity_id || "")]));
  } catch (error) {
    if (!/no such table/i.test(error.message)) console.error("Manual pairs read failed", error.message);
    return new Map();
  }
}

// { plannedId, activityId, date }: activityId null or '' unpairs the plan,
// reset: true goes back to the automatic pairing.
export async function setManualPair(db, userId, body = {}) {
  const plannedId = String(body.plannedId || ""), activityId = body.activityId == null ? "" : String(body.activityId), date = String(body.date || "");
  if (!ID.test(plannedId) || !/^planned:/.test(plannedId)) return { status: "error", code: 400, message: "plannedId" };
  if (activityId && !ID.test(activityId)) return { status: "error", code: 400, message: "activityId" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: "error", code: 400, message: "date" };
  await ensureTable(db);
  if (body.reset) {
    await db.prepare("DELETE FROM manual_activity_pairs WHERE user_id = ? AND planned_id = ?").bind(userId, plannedId).run();
    return { status: "ok", plannedId, activityId: null, reset: true };
  }
  // One activity fulfils one plan: an earlier hand pairing of it goes.
  if (activityId) await db.prepare("DELETE FROM manual_activity_pairs WHERE user_id = ? AND activity_id = ? AND planned_id != ?").bind(userId, activityId, plannedId).run();
  await db.prepare("INSERT INTO manual_activity_pairs (user_id, planned_id, activity_id, date, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, planned_id) DO UPDATE SET activity_id = excluded.activity_id, date = excluded.date, updated_at = excluded.updated_at")
    .bind(userId, plannedId, activityId, date, new Date().toISOString()).run();
  return { status: "ok", plannedId, activityId: activityId || null };
}
