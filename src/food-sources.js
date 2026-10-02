// Food values come only from what the user enters: a package label, a saved
// personal food (personal-foods.js) or a cookbook recipe. No external food database.
const num = (v) => v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v)) ? Number(v) : null;
const str = (v) => v == null ? "" : String(v).trim();

export function normalizeBarcode(value) {
  const raw = str(value).replace(/\D/g, "");
  if (!raw) return null;
  if (raw.length <= 7) return raw.padStart(8, "0");
  if (raw.length >= 9 && raw.length <= 12) return raw.padStart(13, "0");
  return raw;
}

export function productFromLabel(input = {}) {
  const calories = num(input.calories_100g ?? input.calories);
  const protein = num(input.protein_100g ?? input.protein_g);
  const carbs = num(input.carbs_100g ?? input.carbs_g);
  const fat = num(input.fat_100g ?? input.fat_g);
  if ([calories, protein, carbs, fat].every(v => v == null)) return null;
  return {
    barcode: normalizeBarcode(input.barcode),
    name: str(input.name),
    brand: str(input.brand),
    serving_size: str(input.serving_size ?? input.servingSize),
    nutrition_basis: ['g','ml','portion'].includes(input.nutrition_basis)?input.nutrition_basis:'g',
    calories_100g: calories,
    protein_100g: protein,
    carbs_100g: carbs,
    fat_100g: fat,
    fiber_100g: num(input.fiber_100g ?? input.fiber_g),
    salt_100g: num(input.salt_100g ?? input.salt_g),
    source: "package_label",
    source_url: null,
    confidence: "highest",
    label_verified: true
  };
}

export function calculateAmount(product, grams) {
  const g = num(grams);
  if (!product || g == null || g <= 0) return null;
  const factor = g / 100;
  return {
    grams: g,
    calories: product.calories_100g == null ? null : product.calories_100g * factor,
    protein_g: product.protein_100g == null ? null : product.protein_100g * factor,
    carbs_g: product.carbs_100g == null ? null : product.carbs_100g * factor,
    fat_g: product.fat_100g == null ? null : product.fat_100g * factor,
    fiber_g: product.fiber_100g == null ? null : product.fiber_100g * factor,
    salt_g: product.salt_100g == null ? null : product.salt_100g * factor
  };
}
