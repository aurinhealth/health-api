// Intervals.icu allows an app signed in with OAuth 100 requests a day per
// athlete (at least 8000 in all). Without a cache the app asked for the same
// wellness log, curves and sport settings on almost every screen (about
// 170–200 requests a day for one athlete), so for
// an OAuth connection the reads go through intervalsReads: an answer is kept
// until Intervals.icu says that kind of data changed (its webhooks,
// intervals-webhook.js) or Aurin writes that kind there, and at most an hour.
// The wellness log is fetched once for the last 200 days and every range
// within it is cut from that one answer. A personal API key (5000 requests a
// day) reads as before.
import { INTERVALS_TOKEN_PREFIX } from "./intervals-auth.js";

const STATUS = "intervals_reads";
const TTL = 3600;
const WINDOW_DAYS = 200;
export const KINDS = ["wellness", "activities", "activity", "settings", "calendar"];

export const intervalsOAuth = env => String(env?.INTERVALS_API_KEY || "").startsWith(INTERVALS_TOKEN_PREFIX);

// What part of Intervals.icu a request reads or writes; null is not cached.
// A finished activity's own answers (laps, streams) change only when it is
// analysed again or edited, not when another activity comes.
export function intervalsKinds(url) {
  const path = url.pathname.replace(/^\/api\/v1/, "");
  if (/^\/athlete\/[^/]+\/wellness(\/|$)/.test(path)) return ["wellness"];
  if (/^\/athlete\/[^/]+\/(power-curves|pace-curves|activities)(\/|$)/.test(path)) return ["activities"];
  if (/^\/activity\/[^/]+/.test(path)) return ["activity"];
  if (/^\/athlete\/[^/]+\/events(\/|$)/.test(path)) return ["calendar"];
  if (/^\/athlete\/[^/]+(\/sport-settings(\/.*)?)?$/.test(path)) return ["settings"];
  return null;
}

async function generations(env) {
  try {
    const row = await env.DB.prepare("SELECT details_json FROM sync_status WHERE user_id=? AND sync_name=?").bind(env.USER_ID, STATUS).first();
    return JSON.parse(row?.details_json || "{}") || {};
  } catch { return {}; }
}

// Cached answers of these kinds are not used again.
export async function intervalsChanged(env, kinds = KINDS, now = Date.now()) {
  if (!env?.DB || !kinds.length) return;
  try {
    const next = { ...(await generations(env)) };
    for (const kind of kinds) next[kind] = now;
    await env.DB.prepare("INSERT INTO sync_status(user_id,sync_name,status,details_json,updated_at) VALUES(?,?,'ok',?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,sync_name) DO UPDATE SET details_json=excluded.details_json,updated_at=excluded.updated_at")
      .bind(env.USER_ID, STATUS, JSON.stringify(next)).run();
  } catch (error) { console.error("Intervals.icu read cache", error.message); }
}

async function tokenTag(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token)));
  return [...new Uint8Array(digest).slice(0, 6)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const isoDay = time => new Date(time).toISOString().slice(0, 10);

// A wellness range inside the last 200 days (and the next week) is read from
// one answer for the whole window.
function wellnessWindow(url, now) {
  if (!/^\/api\/v1\/athlete\/[^/]+\/wellness$/.test(url.pathname)) return null;
  const oldest = url.searchParams.get("oldest"), newest = url.searchParams.get("newest");
  if ([...url.searchParams.keys()].some(k => k !== "oldest" && k !== "newest")) return null;
  const from = isoDay(now - WINDOW_DAYS * 86400000), to = isoDay(now + 7 * 86400000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(oldest || "") || !/^\d{4}-\d{2}-\d{2}$/.test(newest || "") || oldest < from || newest > to) return null;
  const whole = new URL(url);
  whole.search = "?oldest=" + from + "&newest=" + to;
  return { whole, oldest, newest };
}

// A fetch for Intervals.icu requests made for env's user.
export function intervalsReads(env, ctx, { fetchImpl = fetch, store = globalThis.caches?.default, now = () => Date.now() } = {}) {
  if (!intervalsOAuth(env) || !env.DB || env.USER_ID == null) return fetchImpl;
  let gens = null, scope = null;
  // The token is part of the key: connecting again (maybe as another athlete) starts empty.
  const scoped = async () => scope ||= encodeURIComponent((env.ENVIRONMENT || "production") + ":" + (env.USER_DATA_SHARD || "legacy")) + "/" + env.USER_ID + "/" + (await tokenTag(env.INTERVALS_API_KEY));
  const generation = async kinds => { gens ||= await generations(env); return kinds.map(k => gens[k] || 0).join("-"); };

  async function cachedGet(url, init, kinds) {
    if (!store) return fetchImpl(url.href, init);
    const key = "https://cache.internal/intervals/" + (await scoped()) + "/" + (await generation(kinds)) + "/" + encodeURIComponent(url.href);
    const hit = await store.match(key).catch(() => null);
    if (hit) return hit;
    const response = await fetchImpl(url.href, init);
    if (!response.ok) return response;
    const body = await response.arrayBuffer();
    const headers = { "Content-Type": response.headers.get("Content-Type") || "application/json" };
    const put = store.put(key, new Response(body, { headers: { ...headers, "Cache-Control": "max-age=" + TTL } })).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
    return new Response(body, { status: response.status, headers });
  }

  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase(), kinds = url.hostname === "intervals.icu" ? intervalsKinds(url) : null;
    if (!kinds) return fetchImpl(input, init);
    if (method !== "GET") {
      const response = await fetchImpl(input, init);
      if (response.ok) { await intervalsChanged(env, kinds.includes("activity") ? [...kinds, "activities"] : kinds, now()); gens = null; }
      return response;
    }
    const window = wellnessWindow(url, now());
    if (!window) return cachedGet(url, init, kinds);
    const whole = await cachedGet(window.whole, init, kinds);
    if (!whole.ok) return whole;
    const rows = await whole.json().catch(() => null);
    if (!Array.isArray(rows)) return fetchImpl(input, init);
    return Response.json(rows.filter(row => String(row?.id) >= window.oldest && String(row?.id) <= window.newest));
  };
}
