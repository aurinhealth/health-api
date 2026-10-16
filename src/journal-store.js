// Deník (the habit journal): what is stored and what the day's data fills in.
// - journal_settings: one row per user: the pinned items in their order, the
//   athlete's own items, the days the Today card was put away, the findings
//   already announced and the last computed findings (for the coach);
// - journal_entries: one row per day and item: answer (0 ✕, 1 ✓), the amount,
//   the time and the follow-ups (Sauna: minutes, temperature). An item without
//   a row is unanswered, which is not ✕. The mood ("Jak se cítíš?") is the
//   item "mood" with the amount 1–5.
// Alcohol, caffeine, the last meal and an evening workout come from the
// drinks (Pití), the food diary and the activities; the athlete's own answer
// wins over them.
import { CATALOG, DEFAULT_PINNED, catalogItem, normalizeCustomItem } from "./journal-catalog.js";
import { drinkFromFoodEntry } from "./fluids.js";
import { activityFromRow, dedupeActivities } from "./coach-reflection.js";
import { localDateTime } from "./user-time.js";
import { L } from "./lang.js";

export const MOOD = "mood";
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const isTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ""));
const finite = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
const missingTable = error => /no such table/i.test(String(error?.message || error));

export async function ensureJournal(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS journal_settings (user_id INTEGER NOT NULL PRIMARY KEY, settings_json TEXT NOT NULL, findings_json TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS journal_entries (user_id INTEGER NOT NULL, date TEXT NOT NULL, item_key TEXT NOT NULL, answer INTEGER, amount REAL, time TEXT, extra_json TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, date, item_key))").run();
}

// ---- Settings ----

function normalizeSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const custom = (Array.isArray(s.custom) ? s.custom : []).filter(c => c && /^c_[a-z0-9]{6,16}$/.test(String(c.key)) && c.name).slice(0, 100);
  const known = new Set([...CATALOG.map(i => i.key), ...custom.map(c => c.key)]);
  const pinned = Array.isArray(s.pinned) ? [...new Set(s.pinned.filter(k => known.has(k)))] : [...DEFAULT_PINNED];
  return {
    pinned,
    custom,
    dismissed: (Array.isArray(s.dismissed) ? s.dismissed.filter(isDate) : []).slice(-14),
    announced: Array.isArray(s.announced) ? [...new Set(s.announced.map(String))].slice(-200) : [],
    discovery: s.discovery && typeof s.discovery === "object" && s.discovery.key ? s.discovery : null
  };
}

export async function getJournalSettings(db) {
  await ensureJournal(db);
  const row = await db.prepare("SELECT settings_json FROM journal_settings WHERE user_id=?").bind(db.userId).first();
  let raw = null;
  try { raw = JSON.parse(row?.settings_json || "null"); } catch { raw = null; }
  return normalizeSettings(raw);
}

export async function saveJournalSettings(db, settings) {
  await ensureJournal(db);
  const next = normalizeSettings(settings);
  await db.prepare("INSERT INTO journal_settings(user_id,settings_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET settings_json=excluded.settings_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId, JSON.stringify(next)).run();
  return next;
}

// The last findings computed for the impact screen: {date, metric, ranked}.
export async function getJournalFindings(db) {
  await ensureJournal(db);
  const row = await db.prepare("SELECT findings_json FROM journal_settings WHERE user_id=?").bind(db.userId).first();
  try { return JSON.parse(row?.findings_json || "null"); } catch { return null; }
}

export async function saveJournalFindings(db, findings) {
  await ensureJournal(db);
  const settings = await getJournalSettings(db);
  await db.prepare("INSERT INTO journal_settings(user_id,settings_json,findings_json) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET findings_json=excluded.findings_json,updated_at=CURRENT_TIMESTAMP").bind(db.userId, JSON.stringify(settings), JSON.stringify(findings)).run();
}

// Every item the athlete can answer: the catalogue and their own.
export function journalItems(settings) {
  return [...CATALOG, ...(settings?.custom || [])];
}
export function findItem(settings, key) {
  return catalogItem(key) || (settings?.custom || []).find(c => c.key === key) || null;
}
export function pinnedItems(settings) {
  return settings.pinned.map(k => findItem(settings, k)).filter(Boolean);
}

export async function setPinned(db, keys) {
  const settings = await getJournalSettings(db);
  return saveJournalSettings(db, { ...settings, pinned: Array.isArray(keys) ? keys.map(String) : settings.pinned });
}

// A new own item, pinned at the end. `remove` deletes one (its answers stay
// until the account's data is deleted, so a mistaken removal loses nothing).
export async function saveCustomItem(db, input) {
  const settings = await getJournalSettings(db);
  if (input?.remove) {
    const key = String(input.remove);
    return { settings: await saveJournalSettings(db, { ...settings, custom: settings.custom.filter(c => c.key !== key), pinned: settings.pinned.filter(k => k !== key) }), item: null };
  }
  if (settings.custom.length >= 100) throw new Error(L("Vlastních položek může být nejvýš 100.", "You can have at most 100 items of your own."));
  const key = "c_" + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
  const item = normalizeCustomItem(input, key);
  const next = await saveJournalSettings(db, { ...settings, custom: [...settings.custom, item], pinned: [...settings.pinned, key] });
  return { settings: next, item };
}

// ---- Answers ----

export async function listJournalEntries(db, from, to) {
  await ensureJournal(db);
  const rows = (await db.prepare("SELECT date,item_key,answer,amount,time,extra_json FROM journal_entries WHERE user_id=? AND date>=? AND date<=? ORDER BY date").bind(db.userId, from, to).all()).results || [];
  return rows.map(r => {
    let extra = null;
    try { extra = r.extra_json ? JSON.parse(r.extra_json) : null; } catch { extra = null; }
    return { date: r.date, key: r.item_key, answer: r.answer == null ? null : Number(r.answer), amount: finite(r.amount), time: r.time || null, extra };
  });
}

// Saves one answer: answer null clears the day's item (back to unanswered),
// 0 is ✕ and 1 is ✓. For "mood" the amount is 1–5.
export async function saveJournalEntry(db, settings, body) {
  const date = body?.date, key = String(body?.key || "");
  if (!isDate(date)) throw new Error(L("Chybí den.", "The day is missing."));
  const item = key === MOOD ? { key: MOOD, type: "scale" } : findItem(settings, key);
  if (!item) throw new Error(L("Neznámá položka deníku.", "Unknown journal item."));
  await ensureJournal(db);
  const clear = () => db.prepare("DELETE FROM journal_entries WHERE user_id=? AND date=? AND item_key=?").bind(db.userId, date, key).run();
  if (body.answer === null || body.answer === undefined && body.amount == null && body.time == null) { await clear(); return null; }
  let answer = body.answer === undefined ? 1 : Number(body.answer) ? 1 : 0;
  let amount = finite(body.amount);
  const time = isTime(body.time) ? body.time : null;
  if (amount != null && (amount < 0 || amount > 100000)) throw new Error(L("Neplatné množství.", "Invalid amount."));
  if (item.type === "scale") {
    if (answer && (amount == null || amount < 1 || amount > 5)) throw new Error(L("Vyber 1 až 5.", "Choose 1 to 5."));
    amount = answer ? Math.round(amount) : null;
  }
  if (item.type === "amount" && answer && amount === 0) answer = 0;
  if (item.type === "amount" && !answer) amount = 0;
  if (item.type === "yesno") amount = null;
  const follow = item.follow || [];
  const extra = answer && body.extra && typeof body.extra === "object"
    ? Object.fromEntries(follow.map(f => [f.key, finite(body.extra[f.key])]).filter(([, v]) => v != null && v >= 0 && v <= 1000))
    : {};
  await db.prepare("INSERT INTO journal_entries(user_id,date,item_key,answer,amount,time,extra_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,date,item_key) DO UPDATE SET answer=excluded.answer,amount=excluded.amount,time=excluded.time,extra_json=excluded.extra_json,updated_at=CURRENT_TIMESTAMP")
    .bind(db.userId, date, key, answer, amount, answer ? time : null, Object.keys(extra).length ? JSON.stringify(extra) : null).run();
  return { date, key, answer, amount, time: answer ? time : null, extra: Object.keys(extra).length ? extra : null };
}

// ---- What the day's data says ----

// Caffeine of a drink, an estimate in mg: espresso about 65 mg, filter coffee
// about 0.4 mg/ml, black tea 0.2 mg/ml, energy drinks 0.32 mg/ml, cola 0.1 mg/ml.
export function caffeineMg(kind, ml, name = "") {
  const v = Math.max(0, Number(ml) || 0), n = String(name || "").toLowerCase();
  const coffee = () => (v <= 80 ? 65 : Math.min(300, v * 0.4));
  if (kind === "coffee") return coffee();
  if (kind === "tea") return v * 0.2;
  if (/espresso|ristretto|lungo/.test(n)) return 65;
  if (/káv|kav|coffee|latte|cappucc|kafe|americano|flat white|frapp/.test(n)) return coffee();
  if (/matcha/.test(n)) return v * 0.3;
  if (/čaj|caj|\btea\b/.test(n) && !/bylin|herbal|rooibos|ovocn|fruit|heřmán|mát|mint/.test(n)) return v * 0.2;
  if (/energ|red bull|monster|\bburn\b|rockstar/.test(n)) return v * 0.32;
  if (/cola|kofola|pepsi/.test(n)) return v * 0.1;
  return 0;
}

// Drinks of alcohol in a logged drink: a beer of 500 ml, a glass of wine of
// 200 ml, a shot of 40 ml; at least one per drink.
export function alcoholDrinks(kind, ml, name = "") {
  const v = Math.max(0, Number(ml) || 0), n = String(name || "").toLowerCase();
  const per = kind === "beer" || /pivo|piva|beer|ležák|lezak|radler|cider/.test(n) ? 500
    : kind === "wine" || /vín|vin|wine|prosecco|šampaň|sekt|spritz/.test(n) ? 200
      : /vodka|rum\b|whisk|slivovic|gin\b|likér|liker|panák|tequila|rakij|borovič|fernet|becher/.test(n) ? 40 : 300;
  return Math.max(1, Math.round(v / per));
}

const clockOf = value => localDateTime(value).slice(11, 16);
const later = (a, b) => (!a ? b : !b ? a : (a.localeCompare(b) >= 0 ? a : b));

// The day's data from `from` to `to` per date: alcohol {amount, time},
// caffeine {amount, time}, late_caffeine {yes}, late_meal {time} (the last
// meal) and evening_training {time} (the last workout from 18:00, walks left
// out). A date without data has no key.
export async function autoDays(db, from, to) {
  const days = {};
  const at = (date, key) => ((days[date] ||= {})[key] ||= {});
  const drink = (date, time, kind, ml, name, alcohol) => {
    if (alcohol) { const a = at(date, "alcohol"); a.amount = (a.amount || 0) + alcoholDrinks(kind, ml, name); a.time = later(a.time, time); return; }
    const mg = caffeineMg(kind, ml, name);
    if (!(mg > 0)) return;
    const c = at(date, "caffeine"); c.amount = (c.amount || 0) + mg; c.time = later(c.time, time);
    if (time && time >= "14:00") at(date, "late_caffeine").yes = true;
  };
  const read = async (sql, ...args) => {
    try { return (await db.prepare(sql).bind(db.userId, ...args).all()).results || []; } catch (error) { if (missingTable(error)) return []; throw error; }
  };
  const [fluids, food, activities] = await Promise.all([
    read("SELECT date,consumed_at,ml,kind FROM fluid_log WHERE user_id=? AND date>=? AND date<=?", from, to),
    read("SELECT id,consumed_date,consumed_at,recipe_title,note FROM food_logs WHERE user_id=? AND consumed_date>=? AND consumed_date<=? AND (status IS NULL OR status='eaten')", from, to),
    read(`SELECT data_type,source_family,start_time,end_time,payload_json FROM health_datapoints
      WHERE user_id=? AND data_type IN ('activity','exercise') AND start_time>=? AND start_time<?
        AND (record_role IS NULL OR record_role!='duplicate')`, shift(from, -1), shift(to, 1) + "T23:59")
  ]);
  for (const f of fluids) drink(f.date, clockOf(f.consumed_at), f.kind, f.ml, "", f.kind === "beer" || f.kind === "wine");
  for (const row of food) {
    const time = row.consumed_at ? clockOf(row.consumed_at) : null;
    const d = drinkFromFoodEntry(row);
    if (d) { drink(row.consumed_date, time, "food", d.totalMl, d.name, d.alcohol); continue; }
    if (time) { const m = at(row.consumed_date, "late_meal"); m.time = later(m.time, time); }
  }
  for (const a of dedupeActivities(activities.map(activityFromRow))) {
    if (!a || a.date < from || a.date > to || a.kind === "walk") continue;
    const time = a.start.slice(11, 16);
    if (time >= "18:00") { const e = at(a.date, "evening_training"); e.time = later(e.time, time); }
  }
  for (const day of Object.values(days)) if (day.caffeine) day.caffeine.amount = Math.round(day.caffeine.amount / 5) * 5;
  return days;
}

// Days left out of every comparison because the athlete was ill: the journal's
// "Nemoc", a "nemocný" morning check-in the day or the morning after, and the
// current "Sick" status since it was set (there is no older status history).
export async function sickDays(db, from, to, athleteState = null) {
  const out = new Set();
  const rows = async (sql, ...args) => {
    try { return (await db.prepare(sql).bind(db.userId, ...args).all()).results || []; } catch (error) { if (missingTable(error)) return []; throw error; }
  };
  const [journal, checkins] = await Promise.all([
    rows("SELECT date FROM journal_entries WHERE user_id=? AND item_key='sick' AND answer=1 AND date>=? AND date<=?", from, to),
    rows("SELECT date FROM morning_checkins WHERE user_id=? AND feeling='sick' AND date>=? AND date<=?", from, shift(to, 1))
  ]);
  for (const r of journal) out.add(r.date);
  for (const r of checkins) { out.add(r.date); out.add(shift(r.date, -1)); }
  if (athleteState?.status === "sick") {
    const since = String(athleteState.changedAt || "").slice(0, 10);
    for (let d = isDate(since) && since > from ? since : from; d <= to; d = shift(d, 1)) out.add(d);
  }
  return out;
}
