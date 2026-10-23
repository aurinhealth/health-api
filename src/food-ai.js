// Nutrition values looked up by AI on the web for a food the user names
// (and, after a scan, its barcode). The result is a proposal: the user checks
// it in the food editor, and the confirmed values are saved as their own food
// with the barcode, so the next scan finds it without AI.
import { L } from './lang.js';
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { normalizeBarcode } from "./food-sources.js";
import { macroEnergy, nutritionConsistency } from "./food-label.js";
import { foodLookupInstructionsText, foodLookupOrderText, foodEstimateInstructionsText } from './private/food-ai.js';
export { foodLookupInstructionsText, foodLookupOrderText, foodEstimateInstructionsText };

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const nullableNumber = { type: ["number", "null"] };

export const FOOD_LOOKUP_SCHEMA = {
  type: "json_schema",
  name: "food_nutrition",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["found", "name", "brand", "nutrition_basis", "calories", "protein_g", "carbs_g", "fat_g", "sugar_g", "fiber_g", "salt_g", "serving_size", "package_size", "confidence", "note"],
    properties: {
      found: { type: "boolean" },
      name: { type: "string" },
      brand: { type: "string" },
      nutrition_basis: { type: "string", enum: ["g", "ml"] },
      calories: nullableNumber, protein_g: nullableNumber, carbs_g: nullableNumber, fat_g: nullableNumber, sugar_g: nullableNumber, fiber_g: nullableNumber, salt_g: nullableNumber,
      serving_size: { type: "string" },
      package_size: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      note: { type: "string" }
    }
  }
};

export const foodLookupInstructions = foodLookupInstructionsText();

// A serving the editor can use: its weight in g or ml ("1 burger (240 g)" →
// "240 g"). "1 kus" alone became a 1 g serving in the app, so it is dropped.
export function servingWeight(value) {
  const m = String(value || "").replace(/(\d),(\d)/g, "$1.$2").match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
  if (!m) return "";
  const unit = m[2].toLowerCase(), n = Number(m[1]) * (unit === "kg" || unit === "l" ? 1000 : 1);
  return n >= 2 && n <= 5000 ? String(Math.round(n * 10) / 10) + " " + (unit === "kg" || unit === "g" ? "g" : "ml") : "";
}

// The model's JSON answer as a product for the food editor, or null.
export function productFromLookup(answer, { barcode = null, citations = [] } = {}) {
  let r = answer;
  if (typeof r === "string") { try { r = JSON.parse(r.slice(r.indexOf("{"), r.lastIndexOf("}") + 1)); } catch { return null; } }
  if (!r || r.found === false) return null;
  const values = { calories_100g: num(r.calories), protein_100g: num(r.protein_g), carbs_100g: num(r.carbs_g), fat_100g: num(r.fat_g), sugars_100g: num(r.sugar_g), fiber_100g: num(r.fiber_g), salt_100g: num(r.salt_g) };
  if (["calories_100g", "protein_100g", "carbs_100g", "fat_100g"].some(k => values[k] == null || values[k] < 0)) return null;
  if (["protein_100g", "carbs_100g", "fat_100g"].some(k => values[k] > 100)) return null;
  // The numbers have to be possible: no more than 100 g of nutrients in 100 g,
  // and no less energy than the macronutrients alone carry. Energy above the
  // macros stays possible (alcohol), so it only lowers the confidence.
  if (values.protein_100g + values.carbs_100g + values.fat_100g + (values.fiber_100g || 0) > 105) return null;
  const macros = macroEnergy(values);
  // kJ given as kcal: the energy in kcal matches the macros once divided by
  // 4.184. Below 40 kcal a drink with alcohol (beer) looks the same, so it stays.
  const kcalFromKj = values.calories_100g / 4.184;
  if (kcalFromKj >= 40 && nutritionConsistency(values) && Math.abs(kcalFromKj - macros) <= Math.max(15, macros * .15)) values.calories_100g = Math.round(kcalFromKj);
  if (values.calories_100g > 1000) return null;
  if (macros > values.calories_100g * 1.3 + 25) return null;
  const warning = nutritionConsistency(values, L(" Ověř hodnoty na obalu.", " Check the values on the package."));
  const sources = [...new Map(citations.filter(c => /^https?:\/\//i.test(String(c.url))).map(c => [c.url, c])).values()].slice(0, 5);
  return {
    name: String(r.name || "").trim().slice(0, 180), brand: String(r.brand || "").trim().slice(0, 120),
    barcode: normalizeBarcode(barcode), nutrition_basis: r.nutrition_basis === "ml" ? "ml" : "g", ...values,
    serving_size: servingWeight(r.serving_size), quantity: String(r.package_size || "").slice(0, 100),
    source: "ai", confidence: !warning && ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low",
    note: String(r.note || "").slice(0, 300), sources, ...(warning ? { warning } : {})
  };
}

export function foodLookupLanguages(language='cs'){
  const code=String(language).toLowerCase().split(/[-_]/)[0];
  const valid=/^[a-z]{2,3}$/.test(code)?code:'cs';
  return [...new Set([valid,'en','any'])];
}
export async function lookupFoodWithAI(env, { name = "", barcode = "", language=env.INTERFACE_LANGUAGE||'cs' } = {}) {
  const product = String(name || "").trim().slice(0, 180), code = normalizeBarcode(barcode);
  if (!product && !code) throw new Error(L("Napiš název potraviny nebo načti čárový kód.", "Write the food name or scan the barcode."));
  const r = await callOpenAI(env, { feature: "food-lookup",
    instructions: foodLookupInstructionsText() + foodLookupOrderText(foodLookupLanguages(language)),
    input: L("Potravina: ", "Food: ") + JSON.stringify({ name: product || null, barcode: code || null }),
    tools: [{ type: "web_search" }], format: FOOD_LOOKUP_SCHEMA,
    maxOutputTokens: 2000, model: lightModel(env)
  });
  const found = productFromLookup(r.text, { barcode: code, citations: r.citations });
  return { product: found && found.confidence !== 'low' && found.sources.length ? found : null, model: r.model };
}


export async function estimateFoodWithAI(env, { name = "", language = env.INTERFACE_LANGUAGE || 'cs' } = {}) {
  const food = String(name || "").trim().slice(0, 180);
  if (food.length < 2) return { product: null, model: null };
  const r = await callOpenAI(env, { feature: "food-lookup",
    instructions: foodEstimateInstructionsText() + foodLookupOrderText(foodLookupLanguages(language)),
    input: L("Jídlo: ", "Food: ") + JSON.stringify({ name: food }),
    tools: [{ type: "web_search" }], format: FOOD_LOOKUP_SCHEMA,
    maxOutputTokens: 2000, model: lightModel(env)
  });
  const found = productFromLookup(r.text, { citations: r.citations });
  return { product: found ? { ...found, name: found.name || food, source: "ai-estimate", confidence: found.confidence === "high" ? "medium" : found.confidence } : null, model: r.model };
}
