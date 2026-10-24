// "Navrhnout opravu pro všechny": a user's correction of a catalogue food
// (values, serving) waits here until the owner approves it in the app
// (Nastavení → Návrhy oprav potravin). The user's own copy is already fixed
// (personal-foods.js); an approved correction enters the common catalogue as
// checked, so the next scan of the barcode shows it to everyone.
// "Hodnoty nesedí" (kind 'report'): a user who can't say the right values
// only says what is wrong; the food shows as reported to everyone until the
// owner fixes it (approve with the corrected values) or rejects the report.
import { L } from "./lang.js";
import { productFromLabel, normalizeBarcode } from "./food-sources.js";
import { foodKey } from "./personal-foods.js";
import { saveSharedFood } from "./shared-foods.js";

export const DAILY_SUGGESTIONS = 20;
const STATUSES = ["pending", "approved", "rejected"];
const KINDS = ["correction", "report"];
export const REPORT_REASONS = ["values", "name", "serving", "other_product"];
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
  if (!withReports.has(db)) {
    for (const column of ["kind TEXT NOT NULL DEFAULT 'correction'", "reason TEXT", "note TEXT", "ref TEXT"])
      await db.prepare("ALTER TABLE food_suggestions ADD COLUMN " + column).run().catch(() => { /* already there */ });
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_food_suggestions_ref ON food_suggestions(ref, status)").run();
    withReports.add(db);
  }
}
const withReports = new WeakSet();

// One food across the catalogues: its barcode, else the world catalogue key,
// else its name and brand.
export function foodRef(input) {
  const code = normalizeBarcode(input?.barcode);
  if (code) return "gtin:" + code.padStart(14, "0");
  if (input?.catalog_key) return String(input.catalog_key).slice(0, 120);
  const name = foodKey(input?.name);
  return name ? "name:" + name + "|" + foodKey(input?.brand) : null;
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
  await db.prepare("DELETE FROM food_suggestions WHERE user_id=? AND status='pending' AND kind='correction' AND COALESCE(barcode,name)=?").bind(db.userId, key).run();
  const result = await db.prepare("INSERT INTO food_suggestions(user_id,barcode,name,before_json,after_json,ref) VALUES(?,?,?,?,?,?)")
    .bind(db.userId, barcode, before.name || after.name, JSON.stringify(before), JSON.stringify(after), foodRef(before)).run();
  return { status: "ok", id: Number(result?.meta?.last_row_id) || null };
}

// "Hodnoty nesedí": what is wrong (REPORT_REASONS) and an optional note; one
// pending report per user and food, a newer one replaces it.
export async function saveFoodReport(db, body) {
  const product = label(body?.product), reason = String(body?.reason || "");
  if (!product || !product.name || !REPORT_REASONS.includes(reason)) throw fail(L("Hlášení není platné.", "The report isn't valid."));
  const ref = foodRef(product), note = String(body?.note || "").trim().slice(0, 300) || null;
  await ensure(db);
  const recent = await db.prepare("SELECT COUNT(*) AS n FROM food_suggestions WHERE user_id=? AND created_at>=datetime('now','-1 day')").bind(db.userId).first();
  if (Number(recent?.n || 0) >= DAILY_SUGGESTIONS) throw fail(L("Dnešní limit hlášení je vyčerpaný. Zkus to zítra.", "You've reached today's limit of reports. Try again tomorrow."), 429);
  await db.prepare("DELETE FROM food_suggestions WHERE user_id=? AND status='pending' AND kind='report' AND ref=?").bind(db.userId, ref).run();
  const json = JSON.stringify(product);
  const result = await db.prepare("INSERT INTO food_suggestions(user_id,barcode,name,before_json,after_json,kind,reason,note,ref) VALUES(?,?,?,?,?,'report',?,?,?)")
    .bind(db.userId, product.barcode || null, product.name, json, json, reason, note, ref).run();
  return { status: "ok", id: Number(result?.meta?.last_row_id) || null };
}

// The foods among products with a pending report, for the "Nahlášeno" label:
// ref → whether userId sent one of them. raw is the unscoped DB.
export async function reportedFoods(raw, products, userId) {
  const refs = [...new Set(products.map(foodRef).filter(Boolean))].slice(0, 60);
  if (!refs.length) return new Map();
  await ensure(raw);
  const rows = (await raw.prepare(`SELECT ref, MAX(user_id=?) AS mine FROM food_suggestions WHERE kind='report' AND status='pending' AND ref IN (${refs.map(() => "?").join(",")}) GROUP BY ref`)
    .bind(Number(userId) || 0, ...refs).all()).results || [];
  return new Map(rows.map(r => [r.ref, Number(r.mine) === 1]));
}

// Only catalogue foods carry the label: the user's own foods and recipes are theirs.
const OWN = ["personal", "manual", "recipe", "composed"];
export async function markReported(raw, products, userId) {
  const shared = products.filter(p => !OWN.includes(p?.source));
  const reported = await reportedFoods(raw, shared, userId).catch(error => { console.warn("food reports", error?.message); return new Map(); });
  return products.map(p => { const ref = !OWN.includes(p?.source) && foodRef(p); return ref && reported.has(ref) ? { ...p, reported: true, reported_by_me: reported.get(ref) } : p; });
}

// The owner's list: the suggestions of one status with what changes and how
// many suggestions the same user sent and had approved. raw is the unscoped DB.
export async function listFoodSuggestions(raw, { status = "pending", kind = "correction", limit = 100 } = {}) {
  await ensure(raw);
  const which = STATUSES.includes(status) ? status : "pending", sort = KINDS.includes(kind) ? kind : "correction";
  const rows = (await raw.prepare("SELECT s.id,s.user_id,s.barcode,s.name,s.before_json,s.after_json,s.status,s.created_at,s.decided_at,(SELECT COUNT(*) FROM food_suggestions o WHERE o.user_id=s.user_id) AS sent,(SELECT COUNT(*) FROM food_suggestions o WHERE o.user_id=s.user_id AND o.status='approved') AS approved,s.kind,s.reason,s.note,(SELECT COUNT(*) FROM food_suggestions o WHERE o.kind='report' AND o.status='pending' AND o.ref=s.ref) AS reports FROM food_suggestions s WHERE s.status=? AND s.kind=? ORDER BY s.created_at DESC, s.id DESC LIMIT ?")
    .bind(which, sort, Math.min(200, Math.max(1, Number(limit) || 100))).all()).results || [];
  const counts = (await raw.prepare("SELECT status, COUNT(*) AS n FROM food_suggestions WHERE kind=? GROUP BY status").bind(sort).all()).results || [];
  const pending = (await raw.prepare("SELECT kind, COUNT(*) AS n FROM food_suggestions WHERE status='pending' GROUP BY kind").all()).results || [];
  const suggestions = rows.map(r => {
    const before = JSON.parse(r.before_json), after = JSON.parse(r.after_json);
    return { id: r.id, userId: r.user_id, barcode: r.barcode, name: r.name, before, after, changes: suggestionChanges(before, after),
      status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, fromUser: { sent: Number(r.sent) || 0, approved: Number(r.approved) || 0 },
      kind: r.kind || "correction", ...(r.kind === "report" ? { reason: r.reason, note: r.note || null, reports: Number(r.reports) || 1 } : {}) };
  });
  return { suggestions, counts: Object.fromEntries(STATUSES.map(s => [s, Number(counts.find(c => c.status === s)?.n) || 0])),
    pending: Object.fromEntries(KINDS.map(k => [k, Number(pending.find(c => c.kind === k)?.n) || 0])) };
}

// Approve: the corrected food enters the common catalogue as checked. catalog
// is a DB that reaches shared_foods (the owner's env.DB).
// A report is approved with the values the owner corrected (after); that
// settles every pending report of the same food, a rejection only this one.
export async function decideFoodSuggestion(raw, catalog, { id, decision, after: corrected }) {
  if (!["approve", "reject"].includes(decision)) throw fail(L("Neplatné rozhodnutí.", "Invalid decision."));
  await ensure(raw);
  const row = await raw.prepare("SELECT id,user_id,after_json,status,kind,ref FROM food_suggestions WHERE id=?").bind(Number(id) || 0).first();
  if (!row) throw fail(L("Návrh nebyl nalezen.", "The suggestion wasn't found."), 404);
  if (row.status !== "pending") throw fail(L("O návrhu už je rozhodnuto.", "The suggestion has already been decided."), 409);
  let after = JSON.parse(row.after_json);
  if (decision === "approve" && row.kind === "report") {
    const fixed = label({ ...after, ...(corrected || {}) });
    if (!corrected || !fixed?.name || fixed.nutrition_basis === "portion" || ["calories_100g", "protein_100g", "carbs_100g", "fat_100g"].some(k => fixed[k] == null || fixed[k] < 0 || fixed[k] > (k === "calories_100g" ? 1000 : 100)))
      throw fail(L("Doplň platné nutriční hodnoty.", "Fill in valid nutrition values."));
    after = fixed;
  }
  // Who hears about it (push.js sendFoodApproved): the author of this one and
  // everyone whose pending report of the same food it settles. A rejection says nothing.
  let notify = null;
  if (decision === "approve") {
    const shared = await saveSharedFood(catalog, after, null, { verified: true });
    const reporters = row.ref ? (await raw.prepare("SELECT DISTINCT user_id FROM food_suggestions WHERE kind='report' AND status='pending' AND ref=? AND id<>?").bind(row.ref, row.id).all()).results || [] : [];
    const users = [{ userId: Number(row.user_id), kind: row.kind || "correction" }];
    for (const r of reporters) if (!users.some(u => u.userId === Number(r.user_id))) users.push({ userId: Number(r.user_id), kind: "report" });
    notify = { users: users.filter(u => u.userId > 0), product: shared || after };
  }
  const status = decision === "approve" ? "approved" : "rejected";
  await raw.prepare("UPDATE food_suggestions SET status=?, after_json=?, decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(status, JSON.stringify(after), row.id).run();
  if (decision === "approve" && row.ref) await raw.prepare("UPDATE food_suggestions SET status='approved', decided_at=CURRENT_TIMESTAMP WHERE kind='report' AND status='pending' AND ref=?").bind(row.ref).run();
  return { status: "ok", id: row.id, decision: status, notify };
}
