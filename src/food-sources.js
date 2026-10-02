const OFF_BASE = "https://world.openfoodfacts.org";
import {foodPackageSize} from './food-portions.js';
import {searchReferenceFoods} from './food-reference.js';
import {searchNutridatabaze,nutridatabazeAttribution,NUTRIDATABAZE_URL} from './nutridatabaze.js';
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
  // *_value can be a serving value: mixing it with per-100g macros corrupts portions.
  const kcal = num(n["energy-kcal_100g"] ?? (num(n["energy_100g"]) != null ? Number(n["energy_100g"]) / 4.184 : null));
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
    nutrition_basis: /(?:ml|cl|\bl)\b/i.test(str(product?.quantity)+' '+str(product?.serving_size))?'ml':'g',
    image_url: str(product?.image_front_url),
    czech_market: Array.isArray(product?.countries_tags)&&product.countries_tags.includes('en:czech-republic'),
    ...nutrients,
    source,
    source_url: product?.code ? `${OFF_BASE}/product/${product.code}` : null,
    confidence: nutrients.calories_100g != null ? "database" : "low"
  };
}

export function cleanFoodSearch(products,query=''){
  const normalize=value=>str(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),seen=new Set(),q=normalize(query);
  return products.filter(p=>p.name&&p.calories_100g!=null&&Number.isFinite(Number(p.calories_100g))&&Number(p.calories_100g)>=0&&(Number(p.calories_100g)<=20||!['protein_100g','carbs_100g','fat_100g'].every(k=>p[k]!=null)||Math.abs(Number(p.calories_100g)-(Number(p.protein_100g)*4+Number(p.carbs_100g)*4+Number(p.fat_100g)*9))<=Math.max(35,Number(p.calories_100g)*.65))).sort((a,b)=>{const score=p=>{const pack=foodPackageSize(p.quantity);return (normalize(p.name)===q?100:normalize(p.name).startsWith(q+' ')?20:0)+['protein_100g','carbs_100g','fat_100g'].filter(k=>p[k]!=null).length+(pack?10+(pack.count===1?2:0):0)+(p.czech_market?5:0);};return score(b)-score(a);}).filter(p=>{const pack=foodPackageSize(p.quantity),key=normalize(p.name)+'|'+normalize(String(p.brand||'').split(',')[0])+'|'+(pack?pack.amount+' '+pack.unit+' x'+pack.count:normalize(p.quantity))+'|'+JSON.stringify([p.calories_100g,p.protein_100g,p.carbs_100g,p.fat_100g].map(v=>v==null?null:Math.round(Number(v)*100)/100));if(seen.has(key))return false;seen.add(key);return true;});
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
  // Official full-text service, with Czech-market results first. Legacy search is a fallback.
  const query=q.replace(/[^\p{L}\p{N}\s-]/gu,' ').trim();
  try {
    const endpoint=new URL('https://search.openfoodfacts.org/search');endpoint.searchParams.set('q','('+query+') AND countries_tags:"en:czech-republic"');endpoint.searchParams.set('langs','cs,en');endpoint.searchParams.set('page_size',String(Math.min(20,Math.max(1,Number(limit)||8))));
    let result=await fetch(endpoint,{headers:{'User-Agent':USER_AGENT,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(result.ok){let data=await result.json(),products=Array.isArray(data.hits)?cleanFoodSearch(data.hits.map(p=>({...publicProduct(p,p.code),czech_market:true})),q):null;
      // Invalid Czech hits must not suppress a useful global result. Keep Czech matches first.
      if(products&&products.length<Math.min(4,Number(limit)||8)){
        endpoint.searchParams.set('q',query);
        try{result=await fetch(endpoint,{headers:{'User-Agent':USER_AGENT,Accept:'application/json'},signal:AbortSignal.timeout(8000)});if(result.ok){data=await result.json();if(Array.isArray(data.hits))products=cleanFoodSearch([...products,...data.hits.map(p=>publicProduct(p,p.code))],q);}}catch{}
      }
      if(products?.length)return {status:'ok',source:'openfoodfacts',count:products.length,products};
    }
  }catch{}
  // Full-text search belongs to the legacy search endpoint; v2 ignores search_terms.
  const url = `https://cz.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${Math.min(20, Math.max(1, Number(limit) || 8))}&lc=cs&fields=code,product_name,product_name_cs,generic_name,brands,quantity,serving_size,image_front_url,nutriments`;
  let response;
  try {response=await fetch(url,{headers:{"User-Agent":USER_AGENT,Accept:"application/json"},signal:AbortSignal.timeout(10000)});}catch{}
  if(!response?.ok){const fallback=url.replace('https://cz.openfoodfacts.org','https://world.openfoodfacts.org')+'&cc=cz';response=await fetch(fallback,{headers:{"User-Agent":USER_AGENT,Accept:"application/json"},signal:AbortSignal.timeout(15000)});}
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

/*
 * NutriDatabaze.cz is the Czech reference layer, searched first from its export
 * in D1 (nutridatabaze.js). When it has no match, point to its public search
 * instead of scraping it. The ChatGPT/web layer can resolve the food and pass
 * the verified per-100g values back with source="nutridatabaze".
 */
export function nutridatabazeReference(name) {
  const q = str(name);
  return {
    source: "nutridatabaze",
    status: q ? "reference_required" : "not_found",
    query: q || null,
    // The search form is a POST: a query string would open an empty search.
    url: q ? `${NUTRIDATABAZE_URL}vyhledavani-potravin/podle-nazvu/` : null,
    note: "Use verified NutriDatabaze values per 100 g when available; respect its licence conditions."
  };
}

export async function resolveFood(input = {}, {db} = {}) {
  const label = productFromLabel(input);
  if (label) return { status: "ok", match: "package_label", product: label, candidates: [] };

  const barcode = normalizeBarcode(input.barcode);
  if (barcode) {
    const exact = await lookupOpenFoodFactsBarcode(barcode);
    if (exact.status === "ok") return { ...exact, match: "barcode" };
  }

  const name = str(input.name);
  if (name) {
    const basics=searchReferenceFoods(name,input.limit||12);
    // NutriDatabaze first, the OpenNutrition foods fill the rest of the list.
    const czech=await searchNutridatabaze(db,name,input.limit||12);
    if(czech.length&&!barcode)return {status:'ok',match:'generic_food',product:czech[0],candidates:[...czech,...basics].slice(0,Math.max(1,Math.min(20,Number(input.limit)||12)))};
    const plain=name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const reference=/^banan(?:y|u)?$/.test(plain)?['Banán · bez slupky',32,98,1.1,21.6,.3,2.3]:/^jablk[oa]$/.test(plain)?['Jablko · jedlý podíl',37,52,.4,10.5,.4,2.3]:null;
    if(reference){const [name,id,calories_100g,protein_100g,carbs_100g,fat_100g,fiber_100g]=reference,product={name,brand:'Běžná potravina',quantity:'',nutrition_basis:'g',calories_100g,protein_100g,carbs_100g,fat_100g,fiber_100g,salt_100g:0,source:'nutridatabaze',source_url:'https://www.nutridatabaze.cz/potraviny/?id='+id,confidence:'reference',attribution:nutridatabazeAttribution('11.26')};return{status:'ok',match:'generic_food',product,candidates:[product]};}
    if(/^nektarink[ayu]?$|^nektarinky$|^nectarines?$/.test(plain)){
      const product={name:'Nektarinka · čerstvá, bez pecky',brand:'Běžná potravina',quantity:'',nutrition_basis:'g',calories_100g:48,protein_100g:1.1,carbs_100g:9.3,fat_100g:.3,fiber_100g:1.7,salt_100g:0,source:'nutridatabaze',source_url:'https://www.nutridatabaze.cz/potraviny/?id=360',confidence:'reference',attribution:nutridatabazeAttribution('11.26')};
      return {status:'ok',match:'generic_food',product,candidates:[product]};
    }
    // Generic reference foods work without an external service or a country tag.
    if(basics.length&&!barcode)return {status:'ok',match:'generic_food',product:basics[0],candidates:basics};
    let off;try{off=await searchOpenFoodFacts(name,20);}catch(error){if(basics.length)return {status:'ok',match:'generic_food',product:basics[0],candidates:basics,providerUnavailable:true};throw error;}
    off.products=cleanFoodSearch(off.products||[],name).slice(0,input.limit||8);
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
