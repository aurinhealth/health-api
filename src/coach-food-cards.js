// Food and drink cards of the coach chat (gaps 1 and 2 of the coach audit,
// Petr 2026-11-28): "Smaž tu kávu ze snídaně", "To nebyl oběd, ale večeře",
// "Byla to jen půlka pizzy" and "Vypil jsem 2 sklenice vody" become a card the
// athlete confirms, with Vrátit after it, like the app's own edits
// (food-entry-management.js, fluids.js). Only the athlete's own entries:
// another app's food changes in that app.
import { L } from './lang.js';
import { MEALS, entryTime, mealOf } from './app-food.js';
import { localToday, localNow } from './user-time.js';

// "Byla to jen půlka pizzy", "Ten oběd jsem měl k večeři": a change of a food already logged.
const CORRECTION = /(?<!\p{L})(?:jen|jenom|only)\s+(?:půl|pul|půlk\p{L}*|pulk\p{L}*|polovin\p{L}*|half|třetin\p{L}*|tretin\p{L}*|čtvrt\p{L}*|ctvrt\p{L}*)|(?<!\p{L})(?:ten|ta|to|tu|toho|tamten|that)\s+(?:\p{L}+\s+){0,2}(?:jsem\s+)?(?:měl[a]?|mel[a]?|snědl[a]?|snedl[a]?|jedl[a]?|had|ate)\s+(?:jsem\s+)?(?:k|ke|na|for|as)\s|(?<!\p{L})(?:nebyl[aoy]?|wasn't|was not)\s+(?:[\p{L},]+\s+){0,2}(?:ale|but)\s/u;
// "Smaž tu kávu ze snídaně", "Přesuň ten jogurt do svačiny".
const EDIT = /(?<!\p{L})(?:smaž|smaz|vymaž|vymaz|odstraň|odstran|přesuň|presun|delete|remove|move)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:z|ze|do|from|to|k|ke)\s+(?:snídan|snidan|oběd|obed|večeř|vecer|svačin|svacin|jídl|jidl|breakfast|lunch|dinner|snack|food)/u;
// Only water ("Vypil jsem 2 sklenice vody"): the drink card logs it to Pití.
const WATER = /(?<!\p{L})(?:vod[auyě]|vodou|water)(?!\p{L})/u, JOINED = /[,+;]|(?<!\p{L})(?:a|and|s|se|with|plus)(?!\p{L})/u;
// "Smaž to poslední pití", "Smaž tu vodu": a drink logged in Pití.
const DRINK_DELETE = /(?<!\p{L})(?:smaž|smaz|vymaž|vymaz|odstraň|odstran|delete|remove)\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:pití|piti|vod[auyě]|vodu|drink|water)(?!\p{L})/u;
const WATER_DRUNK = /(?<!\p{L})(?:vypil[a]?|pil[a]? jsem|drank|had)(?!\p{L})/u;
export function foodCardMessage(message) {
  const t = String(message || '').toLowerCase().replace(/[’‘]/g, "'");
  return CORRECTION.test(t) || EDIT.test(t) || DRINK_DELETE.test(t) || WATER.test(t) && WATER_DRUNK.test(t) && !JOINED.test(t);
}

export const FOOD_CARD_TYPES = ['food_delete', 'food_move', 'food_portion', 'fluid_add', 'fluid_delete'];
export const MEAL_IDS = MEALS.map(m => m.type);
export const DRINKS = ['water', 'coffee', 'tea', 'juice', 'milk', 'sport', 'soda', 'beer', 'wine', 'other'];
const DRINK_NAMES = () => L({ water: 'Voda', coffee: 'Káva', tea: 'Čaj', juice: 'Džus', milk: 'Mléko', sport: 'Sportovní nápoj', soda: 'Limonáda', beer: 'Pivo', wine: 'Víno', other: 'Pití' },
  { water: 'Water', coffee: 'Coffee', tea: 'Tea', juice: 'Juice', milk: 'Milk', sport: 'Sports drink', soda: 'Soda', beer: 'Beer', wine: 'Wine', other: 'Drink' });
// apple-food.js OTHER_APP_SOURCES (imported late: food modules import the coach's).
const OTHER_APP_SOURCES = ['apple-health', 'google-health'];
const mealName = id => MEALS.find(m => m.type === id)?.label || '';
const num = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const round1 = v => Math.round(v * 10) / 10;
const noteOf = e => { try { const n = JSON.parse(e?.note || '{}'); return n && typeof n === 'object' && !Array.isArray(n) ? n : {}; } catch { return {}; } };
// Food names are what the athlete typed or a photo read: data, never instructions.
const clean = v => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
// The amount as the entry was logged (food-entry-management.js loggedAmount) and its unit.
function amountOf(note) {
  for (const key of ['enteredQuantity', 'amount', 'amount_g']) { const v = num(note[key]); if (v != null && v > 0) return { amount: round1(v), unit: key === 'amount_g' ? 'g' : String(note.enteredUnit || note.unit || 'g') }; }
  return null;
}
const unitText = (unit, amount) => unit === 'portion' ? L('porce', amount === 1 ? 'serving' : 'servings') : unit === 'piece' ? L('ks', amount === 1 ? 'pc' : 'pcs') : unit;
export const amountText = (amount, unit) => String(amount).replace('.', L(',', '.')) + ' ' + unitText(unit, amount);

// The day's foods the coach may change, with the ids its cards name: today's
// and yesterday's, at most 40, each with its meal, kcal and logged amount.
export function foodsForCoach(days = []) {
  const out = [];
  for (const { date, entries } of days) {
    const list = (Array.isArray(entries) ? entries : []).filter(e => e && e.id != null && !['planned', 'cancelled'].includes(e.status));
    const parsed = list.map(e => ({ e, note: noteOf(e), time: entryTime(e.consumed_at) }));
    const slots = parsed.some(x => x.note.mealType === 'snack_late') ? MEAL_IDS : undefined;
    for (const { e, note, time } of parsed) {
      if (out.length >= 40) return out;
      const amount = amountOf(note), other = OTHER_APP_SOURCES.includes(e.source) || note.from_app != null;
      out.push({ id: String(e.id), date, meal: mealOf(note, time, slots), time, name: clean(e.recipe_title || note.product) || L('Jídlo', 'Food'), kcal: Math.round(num(e.kcal) || 0),
        ...(amount ? { amount: amount.amount, unit: amount.unit } : {}), ...(other ? { otherApp: true } : {}) });
    }
  }
  return out;
}

// Today's drinks logged in Pití the coach may delete (fluid_delete), the
// latest 10: the athlete's own only, not another app's or the food diary's.
export function drinksForCoach(entries) {
  const own = (Array.isArray(entries) ? entries : []).filter(e => Number.isInteger(Number(e?.id)) && !e.app && DRINKS.includes(e.kind));
  return own.length ? { entries: own.slice(-10).map(e => ({ id: String(e.id), time: String(e.consumedAt || '').slice(11, 16), ml: Math.round(Number(e.ml) || 0), drink: e.kind })) } : {};
}

// The card from the coach's proposal, or none: only foods it was shown, the
// athlete's own, a real change; a drink of 10 to 3,000 ml for today.
export function checkFoodCard(a, foods = [], reason, today, drinks = []) {
  if (a.type === 'fluid_delete') {
    const drink = drinks.find(d => d.id === String(a.foodId || ''));
    return drink ? [{ type: 'fluid_delete', foodId: drink.id, date: today, ml: drink.ml, drink: drink.drink, foodName: DRINK_NAMES()[drink.drink], ...(drink.time ? { time: drink.time } : {}), reason }] : [];
  }
  if (a.type === 'fluid_add') {
    const ml = Math.round(Number(a.amount)), drink = DRINKS.includes(a.drink) ? a.drink : 'water';
    if (!(ml >= 10 && ml <= 3000)) return [];
    return [{ type: 'fluid_add', date: today, ml, drink, foodName: DRINK_NAMES()[drink], reason }];
  }
  const food = foods.find(f => f.id === String(a.foodId || ''));
  if (!food || food.otherApp) return [];
  const base = { type: a.type, foodId: food.id, date: food.date, foodName: food.name, meal: food.meal, fromMealName: mealName(food.meal), ...(food.time ? { time: food.time } : {}), fromKcal: food.kcal, reason };
  if (a.type === 'food_delete') return [base];
  if (a.type === 'food_move') {
    if (!MEAL_IDS.includes(a.meal) || a.meal === food.meal) return [];
    return [{ ...base, toMeal: a.meal, toMealName: mealName(a.meal) }];
  }
  if (a.type === 'food_portion') {
    const amount = round1(Number(a.amount));
    if (!food.amount || !(amount > 0) || amount > 5000 || amount === food.amount) return [];
    return [{ ...base, fromAmount: amountText(food.amount, food.unit), toAmount: amountText(amount, food.unit), amount, kcal: Math.round(food.kcal * amount / food.amount) }];
  }
  return [];
}

const ROW = 'consumed_date,consumed_at,kcal,protein_g,carbs_g,fat_g,fiber_g,note';
const rowOf = (db, id) => db.prepare('SELECT * FROM food_logs WHERE id=? AND user_id=?').bind(Number(id), db.userId).first();
const pick = row => Object.fromEntries(ROW.split(',').map(k => [k, row[k] ?? null]));

// A confirmed card: the change, with the undo it can be taken back by
// (activity-chat-edits.js rememberChange, kind food or fluid) and the food id
// the Google export takes. A food changed since the card is not touched.
export async function applyFoodCard(env, a, meta = {}) {
  const [{ rememberChange }, { updateFoodEntry, deleteFoodEntry }, { addFluid }] = await Promise.all([import('./activity-chat-edits.js'), import('./food-entry-management.js'), import('./fluids.js')]);
  if (a.type === 'fluid_add') {
    const entry = await addFluid(env.DB, { date: localToday(), ml: a.ml, kind: a.drink, at: localNow().replace(' ', 'T') });
    const undo = await rememberChange(env, { kind: 'fluid', id: entry.id, ml: entry.ml, ...meta });
    return { status: 'ok', entry, undo };
  }
  if (a.type === 'fluid_delete') {
    const row = await env.DB.prepare('SELECT id,date,consumed_at,ml,kind FROM fluid_log WHERE user_id=? AND id=? AND source IS NULL').bind(env.DB.userId, Number(a.foodId)).first();
    if (!row) throw new Error(L('Pití už v Pití není.', 'The drink is no longer logged.'));
    if (Number(row.ml) !== a.ml) throw new Error(L('Pití se mezitím změnilo. Požádej o nový návrh.', 'The drink has changed in the meantime. Ask for a new proposal.'));
    await env.DB.prepare('DELETE FROM fluid_log WHERE user_id=? AND id=? AND source IS NULL').bind(env.DB.userId, Number(row.id)).run();
    const undo = await rememberChange(env, { kind: 'fluid', op: 'delete', row, ...meta });
    return { status: 'ok', deleted: true, undo };
  }
  const before = await rowOf(env.DB, a.foodId);
  if (!before) throw new Error(L('Jídlo už v deníku není.', 'The meal is no longer in the log.'));
  if (Math.round(Number(before.kcal) || 0) !== a.fromKcal) throw new Error(L('Jídlo se mezitím změnilo. Požádej o nový návrh.', 'The meal has changed in the meantime. Ask for a new proposal.'));
  if (a.type === 'food_delete') {
    await deleteFoodEntry(env.DB, before.id);
    const undo = await rememberChange(env, { kind: 'food', op: 'delete', row: before, ...meta });
    return { status: 'ok', id: before.id, date: before.consumed_date, deleted: true, undo };
  }
  await updateFoodEntry(env.DB, before.id, a.type === 'food_move' ? { mealType: a.toMeal } : { quantity: a.amount });
  const after = await rowOf(env.DB, before.id);
  const undo = await rememberChange(env, { kind: 'food', op: 'update', id: before.id, before: pick(before), after: pick(after), ...meta });
  return { status: 'ok', id: before.id, date: after.consumed_date, kcal: Math.round(Number(after.kcal) || 0), undo };
}

// Vrátit of a food card: the deleted food comes back with its id, a changed
// one only while it is still as the card left it; the drink only while it is
// still as logged. Returns the food id for the Google export.
export async function undoFoodChange(env, change, changed) {
  const db = env.DB;
  if (change.kind === 'fluid' && change.op === 'delete') {
    const row = change.row || {};
    if (await db.prepare('SELECT id FROM fluid_log WHERE user_id=? AND id=?').bind(db.userId, Number(row.id)).first()) throw changed(L('Pití už v Pití je.', 'The drink is logged already.'));
    await db.prepare('INSERT INTO fluid_log (id,user_id,date,consumed_at,ml,kind) VALUES (?,?,?,?,?,?)').bind(Number(row.id), db.userId, row.date, row.consumed_at, Number(row.ml), row.kind).run();
    return {};
  }
  if (change.kind === 'fluid') {
    const gone = await db.prepare('DELETE FROM fluid_log WHERE user_id=? AND id=? AND ml=? AND source IS NULL').bind(db.userId, Number(change.id), Number(change.ml)).run();
    if (gone.meta?.changes !== 1) throw changed(L('Pití se od té změny upravilo, vrátit ho už nejde.', 'The drink has changed since, it can no longer be undone.'));
    return {};
  }
  if (change.op === 'delete') {
    const row = change.row || {}, keys = Object.keys(row).filter(k => /^[a-z_]+$/.test(k));
    if (await rowOf(db, row.id)) throw changed(L('Jídlo už v deníku je.', 'The meal is in the log already.'));
    await db.prepare('INSERT INTO food_logs (' + keys.join(',') + ') VALUES (' + keys.map(() => '?').join(',') + ')').bind(...keys.map(k => k === 'user_id' ? db.userId : row[k])).run();
    return { foodId: row.id };
  }
  const keys = ROW.split(','), b = change.before, a = change.after;
  const back = await db.prepare('UPDATE food_logs SET consumed_date=?,consumed_at=?,kcal=?,protein_g=?,carbs_g=?,fat_g=?,fiber_g=?,note=? WHERE id=? AND user_id=? AND consumed_date IS ? AND consumed_at IS ? AND kcal IS ? AND protein_g IS ? AND carbs_g IS ? AND fat_g IS ? AND fiber_g IS ? AND note IS ?')
    .bind(...keys.map(k => b[k]), Number(change.id), db.userId, ...keys.map(k => a[k])).run();
  if (back.meta?.changes !== 1) throw changed(L('Jídlo se od té změny upravilo, vrátit ho už nejde.', 'The meal has changed since, it can no longer be undone.'));
  return { foodId: change.id };
}

// One line per card for the chat's memory of what it proposed (coach-actions.js actionSummary).
export function foodSummary(a) {
  if (a.type === 'fluid_add') return L('Zapsat pití: ', 'Log a drink: ') + a.foodName + ' ' + a.ml + ' ml';
  if (a.type === 'fluid_delete') return L('Smazat z pití: ', 'Delete from drinks: ') + a.foodName + ' ' + a.ml + ' ml' + (a.time ? ' (' + a.time + ')' : '');
  if (a.type === 'food_delete') return L('Smazat z jídla: ', 'Delete from food: ') + a.foodName + ' (' + a.fromMealName + ', ' + a.fromKcal + ' kcal)';
  if (a.type === 'food_move') return L('Přesunout ', 'Move ') + a.foodName + ': ' + a.fromMealName + ' → ' + a.toMealName;
  if (a.type === 'food_portion') return L('Upravit porci ', 'Change the portion of ') + a.foodName + ': ' + a.fromAmount + ' → ' + a.toAmount + ', ' + a.fromKcal + ' → ' + a.kcal + ' kcal';
  return '';
}
