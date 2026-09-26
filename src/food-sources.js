const OFF_BASE = "https://world.openfoodfacts.org";
const USER_AGENT = "health-api-food/1.0 (health-api)";

const num = (v) => v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v)) ? Number(v) : null;
const str = (v) => v == null ? "" : String(v).trim();

export function normalizeBarcode(value) {
  const raw = str(value).replace(/\D/g, "");
  if (!raw) return null;
  if (raw.length <= 7) return raw.padStart(8, "0");
  if (raw.length >= 9 && raw.length <= 12) return raw.padStart(13, "0");
  return raw;
}

function extractNutrients(product) {
  const n = product?.nutriments || {};
  const kcal = num(n["energy-kcal_100g"] ?? n["energy-kcal_value"] ?? (num(n["energy_100g"]) != null ? Number(n["energy_100g"]) / 4.184 : null));
  return {
    calories_100g: kcal,
    protein_100g: num(n["proteins_100g"] ?? n["protein_100g"]),
    carbs_100g: num(n["carbohydrates_100g"] ?? n["carbohydrate_100g"]),
    fat_100g: num(n["fat_100g"]),
    fiber_100g: num(n["fiber_100g"]),
    salt_100g: num(n["salt_100g"])
  };
}

function publicProduct(product, barcode, source = "openfoodfacts") {
  const nutrients = extractNutrients(product);
  return {
    barcode: normalizeBarcode(barcode || product?.code),
    name: str(product?.product_name_cs || product?.product_name || product?.generic_name),
    brand: str(product?.brands),
    quantity: str(product?.quantity),
    serving_size: str(product?.serving_size),
    image_url: str(product?.image_front_url),
    ...nutrients,
    source,
    source_url: product?.code ? `${OFF_BASE}/product/${product.code}` : null,
    confidence: nutrients.calories_100g != null ? "high" : "low"
  };
}

export async function lookupOpenFoodFactsBarcode(barcode) {
  const code = normalizeBarcode(barcode);
  if (!code) return { status: "not_found", source: "openfoodfacts", reason: "invalid_barcode" };
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_cs,generic_name,brands,quantity,serving_size,image_front_url,nutriments`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (response.status===404) return {status:"not_found",source:"openfoodfacts",barcode:code};
  if (!response.ok) throw new Error(`Open Food Facts HTTP ${response.status}`);
  const data = await response.json();
  if (Number(data?.status) !== 1 || !data?.product) return { status: "not_found", source: "openfoodfacts", barcode: code };
  return { status: "ok", product: publicProduct(data.product, code) };
}

export async function searchOpenFoodFacts(name, limit = 8) {
  const q = str(name);
  if (!q) return { status: "ok", source: "openfoodfacts", products: [] };
  // Full-text search belongs to the legacy search endpoint; v2 ignores search_terms.
  const url = `https://cz.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${Math.min(20, Math.max(1, Number(limit) || 8))}&lc=cs&fields=code,product_name,product_name_cs,generic_name,brands,quantity,serving_size,image_front_url,nutriments`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" },signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Open Food Facts search HTTP ${response.status}`);
  const data = await response.json();
  return { status: "ok", source: "openfoodfacts", count: Number(data?.count || 0), products: (data?.products || []).map(p => publicProduct(p, p.code)).filter(p => p.name) };
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

/*
 * NutriDatabaze.cz is the Czech reference layer. Its public site is searchable,
 * but the downloadable export is license-gated. We therefore expose a deterministic
 * reference target instead of scraping around the access controls. The ChatGPT/web
 * layer can resolve the food and pass the verified per-100g values back with
 * source="nutridatabaze".
 */
export function nutridatabazeReference(name) {
  const q = str(name);
  return {
    source: "nutridatabaze",
    status: q ? "reference_required" : "not_found",
    query: q || null,
    url: q ? `https://www.nutridatabaze.cz/vyhledavani-potravin/podle-nazvu/?q=${encodeURIComponent(q)}` : null,
    note: "Use verified NutriDatabaze values per 100 g when available; respect its licence conditions."
  };
}

export async function resolveFood(input = {}) {
  const label = productFromLabel(input);
  if (label) return { status: "ok", match: "package_label", product: label, candidates: [] };

  const barcode = normalizeBarcode(input.barcode);
  if (barcode) {
    const exact = await lookupOpenFoodFactsBarcode(barcode);
    if (exact.status === "ok") return { ...exact, match: "barcode" };
  }

  const name = str(input.name);
  if (name) {
    const off = await searchOpenFoodFacts(name, input.limit || 8);
    if (off.products?.length) return { status: "ok", match: "name", product: off.products[0], candidates: off.products, reference: nutridatabazeReference(name) };
    return { status: "reference_required", match: "nutridatabaze", product: null, candidates: [], reference: nutridatabazeReference(name) };
  }

  return { status: "not_found", match: "none", product: null, candidates: [] };
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
