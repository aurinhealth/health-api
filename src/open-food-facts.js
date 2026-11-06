// Open Food Facts live, for the barcodes the world catalogue (world-foods.js)
// does not know yet: the catalogue is a copy refreshed every 14 days, so a
// product added to OFF since then is asked for once and kept in the data
// centre's cache (no D1 rows). Only the number goes to OFF, from our server.
// The other way, a food the owner approved for everyone (food-suggestions.js)
// is added to OFF when OFF has no values for its barcode yet, under the
// account in the Worker secrets OFF_USER_ID and OFF_PASSWORD; without them
// nothing is sent. The test server writes to OFF's test site.
import { toProduct } from "./world-foods.js";
import { validBarcode } from "./food-photo.js";

const FIELDS = "code,product_name,product_name_cs,product_name_en,lang,brands,quantity,serving_size,product_quantity_unit,nutriments";
const USER_AGENT = "Aurin/1.0 (support@aurin.health)";
const FOUND_FOR = 7 * 86400, MISSING_FOR = 86400, WAIT_MS = 2500;

const site = env => env?.ENVIRONMENT === "staging" ? "https://world.openfoodfacts.net" : "https://world.openfoodfacts.org";
// OFF's test site asks every request for the same public password.
const headers = env => ({ "User-Agent": USER_AGENT, ...(env?.ENVIRONMENT === "staging" ? { Authorization: "Basic " + btoa("off:off") } : {}) });
const clean = (v, max) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s ? s.slice(0, max) : null; };
const round = v => Math.round(Number(v) * 100) / 100;
const inRange = (v, max) => v != null && Number.isFinite(v) && v >= 0 && v <= max;
const number = v => v == null || v === "" ? null : Number(v);

// An OFF product (API v2) as a world catalogue record, or null without a name
// or plausible energy and macros per 100 g (the checks of the 14-day refresh).
export function offRecord(p) {
  const code = String(p?.code ?? "").replace(/\D/g, "");
  if (!code || code.length > 14) return null;
  const n = p.nutriments || {};
  const kcal = number(n["energy-kcal_100g"]) ?? (number(n.energy_100g) != null ? number(n.energy_100g) / 4.184 : null);
  const protein = number(n.proteins_100g), carbs = number(n.carbohydrates_100g), fat = number(n.fat_100g);
  if (!inRange(kcal, 950) || !inRange(protein, 100) || !inRange(carbs, 100) || !inRange(fat, 100) || protein + carbs + fat > 105) return null;
  const main = clean(p.product_name, 200), cs = clean(p.product_name_cs, 200) || (p.lang === "cs" ? main : null), en = clean(p.product_name_en, 200) || (p.lang === "en" ? main : null);
  const name = main || en || cs;
  if (!name) return null;
  const optional = x => inRange(number(x), 100) ? round(x) : null;
  return {
    k: "gtin:" + code.padStart(14, "0"), b: code, s: "off", n: name, ...(cs ? { cs } : {}), ...(en ? { en } : {}),
    br: clean(String(p.brands || "").split(",").map(b => b.trim()).filter(Boolean).join(", "), 120) || "",
    q: clean(p.quantity, 60) || "", ss: clean(p.serving_size, 60) || "", u: String(p.product_quantity_unit || "").toLowerCase() === "ml" ? "ml" : "g",
    e: round(kcal), p: round(protein), c: round(carbs), f: round(fat), su: optional(n.sugars_100g), fi: optional(n.fiber_100g), sa: optional(n.salt_100g)
  };
}

async function fetchOff(env, code, fetchImpl) {
  const r = await fetchImpl(`${site(env)}/api/v2/product/${code}?fields=${FIELDS}`, { headers: headers(env), signal: AbortSignal.timeout(WAIT_MS) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Open Food Facts ${r.status}`);
  const body = await r.json();
  return body?.status === 1 || body?.product ? body.product : null;
}

// The product for a scanned barcode, [] when OFF has none (or no usable
// values) or does not answer in time: the scan then goes on to the label photo.
export async function lookupOpenFoodFacts(env, barcode, { language, fetchImpl = fetch, store = globalThis.caches?.default } = {}) {
  const code = String(barcode || "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return [];
  const key = `https://open-food-facts.internal/${code}`;
  let record = await store?.match(key).then(r => r ? r.json() : undefined).catch(() => undefined);
  if (record === undefined) {
    try { record = offRecord(await fetchOff(env, code, fetchImpl)); }
    catch (error) { console.warn("Open Food Facts lookup", error?.message || error); return []; }
    await store?.put(key, new Response(JSON.stringify(record), { headers: { "Cache-Control": `max-age=${record ? FOUND_FOR : MISSING_FOR}` } })).catch(() => {});
  }
  return record ? [{ ...toProduct(record, language), source_name: "Open Food Facts" }] : [];
}

// An approved food with a valid barcode goes to OFF when OFF has no values for
// it yet: we fill gaps and never overwrite what other people entered.
// Returns sent, exists, skipped (no account, no barcode, no values) or failed.
export async function shareWithOpenFoodFacts(env, product, { fetchImpl = fetch } = {}) {
  const code = String(product?.barcode || "").replace(/\D/g, "");
  if (!env?.OFF_USER_ID || !env?.OFF_PASSWORD || !validBarcode(code) || !["g", "ml"].includes(product?.nutrition_basis)) return "skipped";
  if (["calories_100g", "protein_100g", "carbs_100g", "fat_100g"].some(k => product[k] == null || !Number.isFinite(Number(product[k])))) return "skipped";
  try {
    if (offRecord(await fetchOff(env, code, fetchImpl))) return "exists";
    const form = new URLSearchParams({
      code, user_id: env.OFF_USER_ID, password: env.OFF_PASSWORD, app_name: "Aurin",
      comment: "Label values checked in Aurin (aurin.health)", nutrition_data_per: "100g",
      product_name: String(product.name).slice(0, 180), ...(product.brand ? { brands: String(product.brand).slice(0, 120) } : {}),
      ...(product.quantity ? { quantity: String(product.quantity).slice(0, 60) } : {}), ...(product.serving_size ? { serving_size: String(product.serving_size).slice(0, 60) } : {}),
      "nutriment_energy-kcal": String(product.calories_100g), "nutriment_energy-kcal_unit": "kcal"
    });
    for (const [field, key] of [["proteins", "protein_100g"], ["carbohydrates", "carbs_100g"], ["fat", "fat_100g"], ["sugars", "sugars_100g"], ["fiber", "fiber_100g"], ["salt", "salt_100g"]])
      if (product[key] != null && Number.isFinite(Number(product[key]))) { form.set("nutriment_" + field, String(product[key])); form.set(`nutriment_${field}_unit`, "g"); }
    const r = await fetchImpl(`${site(env)}/cgi/product_jqm2.pl`, { method: "POST", headers: { ...headers(env), "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(10000) });
    const body = await r.json().catch(() => null);
    if (!r.ok || body?.status !== 1) throw new Error(`Open Food Facts ${r.status} ${String(body?.status_verbose || "").slice(0, 80)}`);
    return "sent";
  } catch (error) {
    console.warn("Open Food Facts share", error?.message || error);
    return "failed";
  }
}
