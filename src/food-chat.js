// "Měl jsem snickers a kafe s mlékem" in the assistant: the sentence becomes a
// draft of food entries. Saved foods are used first; only new foods are looked
// up on the web. Nothing is logged until the user confirms the draft.
import { L } from './lang.js';
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { lookupFoodWithAI } from "./food-ai.js";
import { searchFoodCatalog as searchPersonalFoods } from "./personal-foods.js";
import { foodParseInstructionsText } from './private/food-chat.js';
export { foodParseInstructionsText };

const MEALS = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];
const MAX_ITEMS = 8;
// At most this many items of one sentence are looked up on the web (A9);
// the rest stay without values, as a food the lookup did not find.
export const MAX_LOOKUPS = 3;

// A sentence about what was eaten or drunk, not a question or a training
// request: "Mám sníst banán před jízdou?" or "Měl jsem dnes jet intervaly"
// go to the coach. Only the past tense logs ("Měl jsem snickers a kafe").
// English: "I had/ate/drank …", "… for breakfast", "snack: …", "log …".
const FOOD_QUESTION = /^(?:mám|mam|můžu|muzu|mohu|smím|co|kolik|jak|je|jsou|stačí|staci|měl[a]? bych|mel[a]? bych|potřebuj\p{L}*|should|can|could|may|what|how|is|are|do|does|did|which)(?!\p{L})/u;
const FOOD_PAST = /(?<!\p{L})(?:měl[a]? jsem|mel[a]? jsem|snědl[a]?|jedl[a]? jsem|dal[a]? jsem si|vypil[a]?|(?:jsem|jsme) (?:si )?(?:měl[a]?|snědl[a]?|jedl[a]?|dal[a]?|vypil[a]?)|zapiš (?:si )?(?:jídlo|že)|i(?:'ve)? (?:just )?(?:had|ate|drank|eaten)|(?:had|ate|drank) (?:a|an|some|two|three|\d)|for (?:breakfast|lunch|dinner|(?:a )?snack)|(?:breakfast|lunch|dinner|snack)(?: was| were)?:|log (?:food|a meal|my (?:breakfast|lunch|dinner|snack)|that i))(?!\p{L})/u;
// "kolu" is the drink (Vypil jsem kolu), not the bike.
const NOT_FOOD = /trénin|workout|jízd\p{L}*|(?<!\p{L})kol(?:[aeo]m?|o)(?!\p{L})|interval|běh|běž|gym|posil|cvič|spán|spal|train|(?<!\p{L})(?:ride|run|session|sleep|slept)(?!\p{L})/u;
// A meal named without a verb: "Dneska k obědu kuře s rýží", "Lunch was chicken and rice".
const MEAL_SAID = /(?<!\p{L})(?:(?:k|ke|na) (?:snídani|snidani|obědu|obedu|oběd|obed|večeři|veceri|svačině|svačinu|svacine|svacinu)|(?:breakfast|lunch|dinner|snack) (?:was|were|today was))(?!\p{L})/u;
// …but not a wish or a plan ("K obědu bych si dal…", "Na večeři půjdu…").
const NOT_DONE = /(?<!\p{L})(?:bych|bys|by|budu|půjdu|pujdu|chci|chtěl|chtela|chtěla|plánuju|planuju|dám si|dam si|will|going to|want|would|plan)(?!\p{L})/u;
// When and around what it was eaten is not a training message: "Po jízdě jsem snědl banán".
const AROUND_TRAINING = /(?<!\p{L})(?:po|před|pred|během|behem|cestou z|after|before|during|on) (?:(?:the|my|dnešní|dnesni|ranní|ranni|\p{L}+é) )?(?:jízd\p{L}*|kole|kolem|běhu|behu|tréninku|treninku|posilovně|posilovne|intervalech|ride|run|training|workout|gym)(?!\p{L})/gu;
const ATE = /(?<!\p{L})(?:snědl[a]?|snedl[a]?|jedl[a]?|vypil[a]?|dal[a]? jsem si|ate|drank|eaten)(?!\p{L})/u;
export function isFoodLogMessage(message) {
  const t = String(message || "").toLowerCase().replace(/[’‘]/g, "'").trim();
  if (!t || t.includes("?") || FOOD_QUESTION.test(t)) return false;
  const said = FOOD_PAST.test(t) || (MEAL_SAID.test(t) && !NOT_DONE.test(t));
  // Only a real eating or drinking verb lets the training around it go ("Po jízdě jsem měl křeče" is not food).
  return said && !NOT_FOOD.test(ATE.test(t) ? t.replace(AROUND_TRAINING, " ") : t);
}

export const FOOD_PARSE_SCHEMA = {
  type: "json_schema",
  name: "food_sentence",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["day_offset", "items"],
    properties: {
      day_offset: { type: "integer", enum: [0, -1, -2] },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "brand", "grams", "basis", "meal", "portion"],
          properties: {
            name: { type: "string" },
            brand: { type: "string" },
            grams: { type: "number" },
            basis: { type: "string", enum: ["g", "ml"] },
            meal: { type: "string", enum: [...MEALS, ""] },
            portion: { type: "string" }
          }
        }
      }
    }
  }
};

export const foodParseInstructions = foodParseInstructionsText();

export async function parseFoodSentence(env, message) {
  const r = await callOpenAI(env, { feature: "food-sentence", instructions: foodParseInstructionsText(), input: L("Věta: ", "Sentence: ") + JSON.stringify(String(message).slice(0, 1000)), format: FOOD_PARSE_SCHEMA, maxOutputTokens: 1500, model: lightModel(env) });
  let parsed; try { parsed = JSON.parse(r.text); } catch { return { dayOffset: 0, items: [] }; }
  const items = (parsed.items || []).filter(x => String(x.name || "").trim() && Number(x.grams) > 0 && Number(x.grams) <= 5000).slice(0, MAX_ITEMS)
    .map(x => ({ name: String(x.name).trim().slice(0, 180), brand: String(x.brand || "").trim().slice(0, 120), grams: Math.round(Number(x.grams)), basis: x.basis === "ml" ? "ml" : "g", meal: MEALS.includes(x.meal) ? x.meal : "", portion: String(x.portion || "").slice(0, 60) }));
  return { dayOffset: [0, -1, -2].includes(parsed.day_offset) ? parsed.day_offset : 0, items };
}

// Energy and macros of an amount of a product with values per 100 g/ml.
export function itemTotals(product, grams) {
  const f = Number(grams) / 100, v = k => product?.[k] == null ? null : Math.round(Number(product[k]) * f * 10) / 10;
  return { kcal: v("calories_100g"), protein_g: v("protein_100g"), carbs_g: v("carbs_100g"), fat_g: v("fat_100g") };
}

const shift = (date, days) => new Date(Date.parse(date + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);

// The draft the assistant shows: each item with its product (saved or AI) or
// marked as not found. `today` is the Prague date.
export async function buildFoodDraft(env, message, today, { parse = parseFoodSentence, lookup = lookupFoodWithAI, saved = searchPersonalFoods } = {}) {
  const parsed = await parse(env, message);
  const items = [];
  let lookups = 0;
  for (const item of parsed.items) {
    const query = [item.brand, item.name].filter(Boolean).join(" ");
    let product = null;
    try { product = (await saved(env.DB, query, null))[0] || (await saved(env.DB, item.name, null))[0] || null; } catch { product = null; }
    if (product) product = { ...product, source: "personal" };
    else if (lookups < MAX_LOOKUPS) { lookups++; try { product = (await lookup(env, { name: query })).product; } catch (error) { console.error("Food lookup failed", error.message); } }
    const basis = product?.nutrition_basis === "ml" ? "ml" : product?.nutrition_basis === "portion" ? "portion" : item.basis;
    items.push({ ...item, basis, product, totals: product && basis !== "portion" ? itemTotals(product, item.grams) : null });
  }
  return { date: shift(today, parsed.dayOffset), items };
}

export function foodDraftSummary(draft) {
  if (!draft.items.length) return L("Ve zprávě jsem nenašel žádné jídlo k zápisu.", "I didn't find any food to log in the message.");
  const found = draft.items.filter(i => i.totals), missing = draft.items.filter(i => !i.totals);
  const kcal = Math.round(found.reduce((s, i) => s + (i.totals.kcal || 0), 0));
  return L("Připravil jsem zápis: ", "I've prepared an entry: ") + draft.items.map(i => i.name + " " + i.grams + " " + i.basis).join(", ") + (found.length ? L(` · celkem asi ${kcal} kcal.`, ` · about ${kcal} kcal.`) : ".")
    + (missing.length ? L(" U „", " I didn't find values for “") + missing.map(i => i.name).join(L("“, „", "”, “")) + L("“ jsem hodnoty nenašel; zadej je ve Výživě z etikety.", "”; enter them in Nutrition from the label.") : "")
    + L(" Zkontroluj množství a potvrď.", " Check the amounts and confirm.");
}
