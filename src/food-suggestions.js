// "Navrhnout opravu pro všechny": a user's correction of a catalogue food
// (values, serving) waits here until the owner approves it in the app
// (Nastavení → Návrhy oprav potravin). The user's own copy is already fixed
// (personal-foods.js); an approved correction enters the common catalogue as
// checked, so the next scan of the barcode shows it to everyone.
import { L } from "./lang.js";
import { productFromLabel } from "./food-sources.js";
import { saveSharedFood } from "./shared-foods.js";

export const DAILY_SUGGESTIONS = 20;
const STATUSES = ["pending", "approved", "rejected"];
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS food_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    barcode TEXT,
    name TEXT NOT NULL,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TEXT
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_food_suggestions_status ON food_suggestions(status, created_at DESC)").run();
}

// The label values compared before and after: what the owner sees change.
export const SUGGESTION_FIELDS = ["name", "brand", "serving_size", "serving_name", "quantity", "calories_100g", "protein_100g", "carbs_100g", "sugars_100g", "fat_100g", "fiber_100g", "salt_100g"];
function label(input) {
  const p = productFromLabel(input || {});
  if (!p) return null;
  return Object.fromEntries(["barcode", "nutrition_basis", "catalog_key", ...SUGGESTION_FIELDS].map(k => [k, p[k] ?? null]));
}
export function suggestionChanges(before, after) {
  return SUGGESTION_FIELDS.filter(k => String(before?.[k] ?? "") !== String(after?.[k] ?? ""));
}

// Stores one pending suggestion per user and food; a newer one replaces it.
export async function saveFoodSuggestion(db, body) {
  const before = label(body?.before), after = label(body?.after);
  if (!before || !after || !after.name || after.name.length > 180) throw fail(L("Oprava potraviny není platná.", "The food correction isn't valid."));
  if (after.nutrition_basis === "portion" || after.nutrition_basis !== before.nutrition_basis) throw fail(L("Oprava potraviny není platná.", "The food correction isn't valid."));
  if (["calories_100g", "protein_100g", "carbs_100g", "fat_100g"].some(k => after[k] == null || after[k] < 0 || after[k] > (k === "calories_100g" ? 1000 : 100))) throw fail(L("Doplň platné nutriční hodnoty.", "Fill in valid nutrition values."));
  if (!suggestionChanges(before, after).length) return { status: "unchanged" };
  await ensure(db);
  const barcode = after.barcode || before.barcode || null;
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM food_suggestions WHERE user_id=? AND created_at>=datetime('now','-1 day')").bind(db.userId).first();
  if (Number(recent?.n || 0) >= DAILY_SUGGESTIONS) throw fail(L("Dnešní limit návrhů je vyčerpaný. Zkus to zítra.", "You've reached today's limit of suggestions. Try again tomorrow."), 429);
  const key = barcode || before.name;
  await db.prepare("DELETE FROM food_suggestions WHERE user_id=? AND status='pending' AND COALESCE(barcode,name)=?").bind(db.userId, key).run();
  const result = await db.prepare("INSERT INTO food_suggestions(user_id,barcode,name,before_json,after_json) VALUES(?,?,?,?,?)")
    .bind(db.userId, barcode, before.name || after.name, JSON.stringify(before), JSON.stringify(after)).run();
  return { status: "ok", id: Number(result?.meta?.last_row_id) || null };
}

// The owner's list: the suggestions of one status with what changes and how
// many suggestions the same user sent and had approved. raw is the unscoped DB.
export async function listFoodSuggestions(raw, { status = "pending", limit = 100 } = {}) {
  await ensure(raw);
  const which = STATUSES.includes(status) ? status : "pending";
  const rows = (await raw.prepare("SELECT s.id,s.user_id,s.barcode,s.name,s.before_json,s.after_json,s.status,s.created_at,s.decided_at,(SELECT COUNT(*) FROM food_suggestions o WHERE o.user_id=s.user_id) AS sent,(SELECT COUNT(*) FROM food_suggestions o WHERE o.user_id=s.user_id AND o.status='approved') AS approved FROM food_suggestions s WHERE s.status=? ORDER BY s.created_at DESC, s.id DESC LIMIT ?")
    .bind(which, Math.min(200, Math.max(1, Number(limit) || 100))).all()).results || [];
  const counts = (await raw.prepare("SELECT status, COUNT(*) AS n FROM food_suggestions GROUP BY status").all()).results || [];
  const suggestions = rows.map(r => {
    const before = JSON.parse(r.before_json), after = JSON.parse(r.after_json);
    return { id: r.id, userId: r.user_id, barcode: r.barcode, name: r.name, before, after, changes: suggestionChanges(before, after),
      status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, fromUser: { sent: Number(r.sent) || 0, approved: Number(r.approved) || 0 } };
  });
  return { suggestions, counts: Object.fromEntries(STATUSES.map(s => [s, Number(counts.find(c => c.status === s)?.n) || 0])) };
}

// Approve: the corrected food enters the common catalogue as checked. catalog
// is a DB that reaches shared_foods (the owner's env.DB).
export async function decideFoodSuggestion(raw, catalog, { id, decision }) {
  if (!["approve", "reject"].includes(decision)) throw fail(L("Neplatné rozhodnutí.", "Invalid decision."));
  await ensure(raw);
  const row = await raw.prepare("SELECT id,after_json,status FROM food_suggestions WHERE id=?").bind(Number(id) || 0).first();
  if (!row) throw fail(L("Návrh nebyl nalezen.", "The suggestion wasn't found."), 404);
  if (row.status !== "pending") throw fail(L("O návrhu už je rozhodnuto.", "The suggestion has already been decided."), 409);
  if (decision === "approve") await saveSharedFood(catalog, JSON.parse(row.after_json), null, { verified: true });
  const status = decision === "approve" ? "approved" : "rejected";
  await raw.prepare("UPDATE food_suggestions SET status=?, decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(status, row.id).run();
  return { status: "ok", id: row.id, decision: status };
}
