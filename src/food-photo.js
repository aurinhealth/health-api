// Nutrition values read from a photo by AI vision: a package label (per
// 100 g/ml), a screenshot or note with the totals of one portion, or a plain
// photo of a meal (an estimate). The result is a draft for the food editor;
// the user checks it before saving. Without AI the client falls back to OCR.
import { L } from './lang.js';
import { callOpenAI, lightModel } from "./coach-assistant.js";
import { nutritionConsistency } from "./food-label.js";
import * as prompts from './private/food-photo.js';
const { foodPhotoInstructionsText, barcodeInstructions } = prompts;
export { foodPhotoInstructionsText };

const nullableNumber = { type: ["number", "null"] };
const MAX_IMAGE_CHARS = 7_000_000;

export const FOOD_PHOTO_SCHEMA = {
  type: "json_schema",
  name: "food_photo",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "name", "basis", "serving_size", "calories", "protein_g", "carbs_g", "fat_g", "sugar_g", "fiber_g", "salt_g", "confidence", "note"],
    properties: {
      kind: { type: "string", enum: ["label", "portion_summary", "meal_photo", "unreadable"] },
      name: { type: "string" },
      basis: { type: "string", enum: ["100g", "100ml", "portion"] },
      serving_size: { type: "string" },
      calories: nullableNumber, protein_g: nullableNumber, carbs_g: nullableNumber, fat_g: nullableNumber, sugar_g: nullableNumber, fiber_g: nullableNumber, salt_g: nullableNumber,
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      note: { type: "string" }
    }
  }
};

export const foodPhotoInstructions = foodPhotoInstructionsText();

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
const KEYS = [["calories", "calories_100g"], ["protein_g", "protein_100g"], ["carbs_g", "carbs_100g"], ["fat_g", "fat_100g"], ["sugar_g", "sugars_100g"], ["fiber_g", "fiber_100g"], ["salt_g", "salt_100g"]];
const decimal = v => String(v).replace(".", L(",", "."));

// The model's answer as values for the food editor (field names as the label
// parser uses), plus the same values as text the user can correct.
export function photoResultFromAnswer(answer, mode = "label") {
  let r = answer;
  if (typeof r === "string") { try { r = JSON.parse(r.slice(r.indexOf("{"), r.lastIndexOf("}") + 1)); } catch { return null; } }
  if (!r || r.kind === "unreadable") return null;
  const values = {};
  for (const [from, to] of KEYS) { const v = num(r[from]); if (v != null && v >= 0) values[to] = v; }
  if (values.calories_100g == null && ["protein_100g", "carbs_100g", "fat_100g"].every(k => values[k] == null)) return null;
  const portion = mode === "portion" || r.basis === "portion" || r.kind === "meal_photo";
  // Per 100 g nothing can exceed 100 g, and energy stays below pure fat.
  if (!portion && (values.calories_100g > 950 || ["protein_100g", "carbs_100g", "fat_100g", "sugars_100g", "fiber_100g", "salt_100g"].some(k => values[k] > 100))) return null;
  // One plate or one portion: no meal on a photo reaches 5000 kcal or 500 g of a nutrient.
  if (portion && (values.calories_100g > 5000 || ["protein_100g", "carbs_100g", "fat_100g", "sugars_100g", "fiber_100g"].some(k => values[k] > 500) || values.salt_100g > 50)) return null;
  const basis = portion ? "portion" : r.basis === "100ml" ? "100ml" : "100g";
  const name = String(r.name || "").trim().slice(0, 120);
  const unit = basis === "100ml" ? "ml" : "g";
  const lines = [name, portion ? "" : "na 100 " + unit,
    values.calories_100g != null ? "Energie " + decimal(values.calories_100g) + " kcal" : "",
    values.fat_100g != null ? "Tuky " + decimal(values.fat_100g) + " g" : "",
    values.carbs_100g != null ? "Sacharidy " + decimal(values.carbs_100g) + " g" : "",
    values.protein_100g != null ? L("Bílkoviny ", "Protein ") + decimal(values.protein_100g) + " g" : "",
    values.sugars_100g != null ? L("z toho cukry ", "of which sugars ") + decimal(values.sugars_100g) + " g" : "",
    values.fiber_100g != null ? L("Vláknina ", "Fibre ") + decimal(values.fiber_100g) + " g" : "",
    values.salt_100g != null ? L("Sůl ", "Salt ") + decimal(values.salt_100g) + " g" : ""].filter(Boolean);
  const confidence = ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low";
  return {
    kind: ["label", "portion_summary", "meal_photo"].includes(r.kind) ? r.kind : "label",
    name, basis, values, text: lines.join("\n"),
    servingSize: String(r.serving_size || "").trim().slice(0, 60),
    confidence: r.kind === "meal_photo" && confidence === "high" ? "medium" : confidence,
    note: String(r.note || "").trim().slice(0, 300),
    warning: nutritionConsistency(values)
  };
}

export function validFoodImage(image) {
  const value = String(image || "");
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) && value.length <= MAX_IMAGE_CHARS;
}

export async function readFoodPhotoWithAI(env, { image, mode = "label", language = env.INTERFACE_LANGUAGE || "cs" } = {}) {
  if (!validFoodImage(image)) throw new Error(L("Fotografie musí být JPG, PNG nebo WebP do 5 MB.", "The photo must be a JPG, PNG or WebP up to 5 MB."));
  const kind = mode === "portion" ? "portion" : "label";
  const r = await callOpenAI(env, { feature: "food-photo",
    instructions: foodPhotoInstructionsText() + L("\nJazyk rozhraní: ", "\nInterface language: ") + (String(language).toLowerCase().split(/[-_]/)[0] || "cs") + ".",
    input: [{ role: "user", content: [
      { type: "input_text", text: L("Požadovaný režim: ", "Requested mode: ") + kind + "." },
      { type: "input_image", image_url: image, detail: "high" }
    ] }],
    format: FOOD_PHOTO_SCHEMA, maxOutputTokens: 1500,
    model: env.OPENAI_VISION_MODEL || lightModel(env)
  });
  return { result: photoResultFromAnswer(r.text, kind), model: r.model };
}

// ---- The number under a barcode, when the camera cannot decode the bars ----
// AI reads the printed digits in any orientation; the check digit decides.
export const BARCODE_PHOTO_SCHEMA = {
  type: "json_schema",
  name: "barcode_photo",
  strict: true,
  schema: { type: "object", additionalProperties: false, required: ["found", "digits"], properties: { found: { type: "boolean" }, digits: { type: "string" } } }
};

// GS1 check digit for EAN-8, UPC-A (12) and EAN-13.
export function validBarcode(value) {
  const code = String(value || "").replace(/\D/g, "");
  if (![8, 12, 13].includes(code.length)) return false;
  const digits = [...code].map(Number), check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === check;
}

export async function readBarcodeWithAI(env, { image } = {}) {
  if (!validFoodImage(image)) throw new Error(L("Fotografie musí být JPG, PNG nebo WebP do 5 MB.", "The photo must be a JPG, PNG or WebP up to 5 MB."));
  const r = await callOpenAI(env, { feature: "barcode",
    instructions: barcodeInstructions(),
    input: [{ role: "user", content: [{ type: "input_image", image_url: image, detail: "high" }] }],
    format: BARCODE_PHOTO_SCHEMA, maxOutputTokens: 300, model: env.OPENAI_VISION_MODEL || lightModel(env)
  });
  let answer = null; try { answer = JSON.parse(r.text); } catch { answer = null; }
  const code = String(answer?.digits || "").replace(/\D/g, "");
  return { barcode: answer?.found && validBarcode(code) ? code : null, model: r.model };
}

// ---- The name and the brand on the front of a package ----
// After a label without a name (a scanned code nobody knows), so the food is
// saved under the code with what the package calls it.
export const PACKAGE_FRONT_SCHEMA = {
  type: "json_schema",
  name: "package_front",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["found", "name", "brand"],
    properties: { found: { type: "boolean" }, name: { type: "string" }, brand: { type: "string" } }
  }
};

export function packageFrontFromAnswer(answer) {
  let r = answer;
  if (typeof r === "string") { try { r = JSON.parse(r.slice(r.indexOf("{"), r.lastIndexOf("}") + 1)); } catch { return null; } }
  const name = String(r?.name || "").trim().slice(0, 120);
  if (!r?.found || !name) return null;
  return { name, brand: String(r.brand || "").trim().slice(0, 80) || null };
}

export async function readPackageFrontWithAI(env, { image } = {}) {
  if (!validFoodImage(image)) throw new Error(L("Fotografie musí být JPG, PNG nebo WebP do 5 MB.", "The photo must be a JPG, PNG or WebP up to 5 MB."));
  // Until aurin-prompts carries the text, the front is simply not read.
  if (typeof prompts.packageFrontInstructions !== "function") return { front: null, model: null };
  const r = await callOpenAI(env, { feature: "food-photo",
    instructions: prompts.packageFrontInstructions(),
    input: [{ role: "user", content: [{ type: "input_image", image_url: image, detail: "high" }] }],
    format: PACKAGE_FRONT_SCHEMA, maxOutputTokens: 300,
    model: env.OPENAI_VISION_MODEL || lightModel(env)
  });
  return { front: packageFrontFromAnswer(r.text), model: r.model };
}
