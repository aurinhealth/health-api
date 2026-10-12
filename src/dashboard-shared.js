// Small helpers the dashboard API (entrypoint.js) and its route modules share:
// dates of the user's week, the profile, the cached Google Health month.
import { cached } from "./api-cache.js";
import { googleDashboard } from "./google-dashboard.js";
import { loadEffectiveProfile } from "./profile-suggestions.js";
import { dateFormat } from "./date-format.js";
import { dayStartUtc, timeZone } from "./user-time.js";

// A month of Google Health samples summed per day: thousands of rows that only a
// sync changes (every five minutes, or the Obnovit button, which drops the cache).
export const googleHealthFor = (env, ctx, date) => cached(env, ctx, "google-dashboard:" + date, () => googleDashboard(env.DB, date), { ttl: 120 });

// The dashboard profile (age, height, sex, …) with height and activity from
// Google Health and steps filling the gaps; null when there is nothing yet.
export async function dashboardProfile(env) {
  return loadEffectiveProfile(env.DB, env.USER_ID);
}

export const mondayOfDate=iso=>shiftDate(iso,-((new Date(iso+'T12:00:00Z').getUTCDay()+6)%7));

// Midnight of the user's day as a UTC timestamp in SQLite's format.
export const dayStartSql=date=>dayStartUtc(date).replace('T',' ');

export function userWeekStart() {
  const now = new Date();
  const parts = dateFormat("en-GB", {timeZone: timeZone(),year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(now);
  const y = Number(parts.find(x=>x.type==="year").value);
  const m = Number(parts.find(x=>x.type==="month").value);
  const d = Number(parts.find(x=>x.type==="day").value);
  const weekday = parts.find(x=>x.type==="weekday").value;
  const index = {Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6}[weekday] ?? 0;
  return shiftDate(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`, -index);
}

// Like Promise.all over items, with at most `limit` running at a time; keeps order.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

export function shiftDate(date, days) {
  const p = String(date).slice(0,10).split("-").map(Number);
  const d = new Date(Date.UTC(p[0],p[1]-1,p[2]+Number(days)));
  return d.toISOString().slice(0,10);
}
