// Food and drinks other apps (Yazio, MyFitnessPal, Fitbit…) logged in Google
// Health: the nutrition-log and hydration-log of the last few days go into
// the same diary as Apple Health's (apple-food.js, source 'google-health'),
// shown with the app's name and deleted from Aurin only. What Aurin wrote to
// Google itself (food-google-sync.js) is left out, so nothing counts twice.
import { saveAppleFood, GOOGLE_FOOD_SOURCE } from "./apple-food.js";
import { hasGoogleScope, HEALTH_PERMISSIONS } from "./google-scopes.js";
import { localToday, localDateTime } from "./user-time.js";

const BASE = "https://health.googleapis.com/v4/users/me/dataTypes/";
const DAYS = 3;
const MAX_PAGES = 10;

// Package names of apps Google Health names only by package.
const APPS = [[/yazio/i, "Yazio"], [/myfitnesspal|mfp/i, "MyFitnessPal"], [/lifesum/i, "Lifesum"], [/fitbit/i, "Fitbit"],
  [/samsung/i, "Samsung Health"], [/cronometer/i, "Cronometer"], [/fatsecret/i, "FatSecret"], [/kalorick|kaloricketabulky/i, "Kalorické tabulky"]];
export function googleAppName(source) {
  const app = source?.application || {};
  const label = [app.packageName, app.appName, app.displayName].filter(Boolean).join(" ");
  for (const [re, name] of APPS) if (re.test(label)) return name;
  return "Google Health";
}

// "2026-10-13T06:30:00Z" with startUtcOffset "7200s" → day and clock where it was eaten.
export function googleLocal(interval) {
  const start = String(interval?.startTime || "");
  const t = new Date(start).getTime();
  if (!Number.isFinite(t)) return null;
  const offset = /^(-?\d+)(?:\.\d+)?s$/.exec(String(interval?.startUtcOffset || ""));
  const local = offset ? new Date(t + Number(offset[1]) * 1000).toISOString().slice(0, 16) : localDateTime(start);
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

// users/x/dataTypes/nutrition-log/dataPoints/abc → "g:abc".
const pointId = name => { const id = String(name || "").split("/").pop(); return id ? "g:" + id : null; };
const grams = v => { const n = Number(v?.grams ?? v); return Number.isFinite(n) ? n : null; };

export function googleMeal(point) {
  const log = point?.nutritionLog, when = googleLocal(log?.interval), id = pointId(point?.name);
  if (!log || !when || !id) return null;
  const nutrient = re => grams((log.nutrients || []).find(n => re.test(String(n?.nutrient || "")))?.quantity);
  const sodium = nutrient(/^SODIUM$/i);
  return {
    id, date: when.date, time: when.time, app: googleAppName(point.dataSource), mealType: log.mealType,
    name: log.foodDisplayName || log.food?.displayName || "",
    kcal: Number(log.energy?.kcal ?? 0), protein: nutrient(/^PROTEIN$/i), carbs: grams(log.totalCarbohydrate), fat: grams(log.totalFat),
    fiber: nutrient(/FIBER/i), sugar: nutrient(/SUGAR/i), salt: sodium == null ? null : sodium * 2.5
  };
}

export function googleDrink(point) {
  const log = point?.hydrationLog, when = googleLocal(log?.interval), id = pointId(point?.name);
  if (!log || !when || !id) return null;
  return { id, date: when.date, time: when.time, ml: Number(log.amountConsumed?.milliliters), app: googleAppName(point.dataSource) };
}

// Points of one type that start on or after the day before `from`, newest first as Google lists them.
async function listSince(type, token, from, fetcher) {
  const cutoff = new Date(from + "T00:00:00Z").getTime() - 86400000, out = [];
  let pageToken = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ pageSize: "500" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetcher(BASE + type + "/dataPoints?" + params, { headers: { Authorization: "Bearer " + token, Accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(type + " HTTP " + response.status); error.status = response.status; throw error; }
    const points = data.dataPoints || [];
    const key = type === "hydration-log" ? "hydrationLog" : "nutritionLog";
    const times = points.map(p => new Date(p?.[key]?.interval?.startTime || "").getTime()).filter(Number.isFinite);
    out.push(...points.filter(p => !(new Date(p?.[key]?.interval?.startTime || "").getTime() < cutoff)));
    pageToken = data.nextPageToken || null;
    if (!pageToken || (times.length && Math.max(...times) < cutoff)) break;
  }
  return out;
}

export async function importGoogleFood(env, { token, fetcher = fetch, days = DAYS } = {}) {
  if (!hasGoogleScope(env, HEALTH_PERMISSIONS.nutritionRead)) return { status: "skipped" };
  const db = env.DB, userId = env.USER_ID, to = localToday();
  const from = new Date(Date.parse(to + "T00:00:00Z") - (days - 1) * 86400000).toISOString().slice(0, 10);
  const accessToken = typeof token === "function" ? await token(env) : token;
  // Hydration came later to Google Health; a refused list leaves drinks as they are.
  const [nutrition, hydration] = await Promise.all([
    listSince("nutrition-log", accessToken, from, fetcher),
    listSince("hydration-log", accessToken, from, fetcher).catch(error => (error.status === 403 || error.status === 404 ? null : Promise.reject(error)))
  ]);
  // Aurin's own entries in Google: by the name Google gave them, and by Aurin's client id.
  const ours = new Set(((await db.prepare("SELECT remote_name FROM food_google_exports WHERE user_id=? AND remote_name IS NOT NULL").bind(userId).all().catch(() => ({ results: [] }))).results || []).map(r => r.remote_name));
  const client = String(env.GOOGLE_CLIENT_ID || "").trim();
  const foreign = p => !ours.has(p?.name) && !(client && p?.dataSource?.application?.googleWebClientId === client);
  const meals = nutrition.filter(foreign).map(googleMeal).filter(Boolean);
  const drinks = hydration ? hydration.filter(foreign).map(googleDrink).filter(Boolean) : undefined;
  const result = await saveAppleFood(db, userId, { from, to, meals, ...(drinks ? { drinks } : {}) }, { source: GOOGLE_FOOD_SOURCE });
  return { status: "ok", ...result };
}
