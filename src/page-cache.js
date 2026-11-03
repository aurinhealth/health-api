// The public site pages (overview, privacy, terms, support, health data) are the same for every
// visitor until the Worker changes: they read no cookie, no database and no query (?lang= is sent on
// to /cs/… before this, app-origin.js). So each page is built once per Worker version and kept:
// in this isolate's memory, and in the data centre's edge cache (Cache API, no extra cost), so a
// fresh isolate in the same data centre does not build the 270 kB overview again.
//
// The key carries the Worker version (CF_VERSION_METADATA): a deploy, a new variable or a changed
// secret makes a new version, so nobody gets an old page after a release. Without the binding
// (tests, local development) every request builds the page as before.
//
// Browsers still get the page's own Cache-Control (private, max-age=0, must-revalidate), so they
// ask again on every visit and see a release at once; only the copy kept at the edge is public.
import { SERVER_HOSTS, SITE_ORIGIN } from "./app-origin.js";

export const CACHED_PAGES = new Set(["/", "/privacy", "/cs/privacy", "/terms", "/cs/terms", "/support", "/health-data"]);
// How long the edge keeps a copy; a new version uses a new key, so this only bounds stale storage.
const EDGE_SECONDS = 86400;
const BROWSER_HEADER = "x-aurin-browser-cache-control";
// This isolate's copies: at most CACHED_PAGES × the two hosts below, for the current version only.
const kept = new Map();

function pageKey(url, env) {
  const version = env?.CF_VERSION_METADATA?.id;
  if (!version || !CACHED_PAGES.has(url.pathname)) return null;
  // Only the hosts the site is served on, so a stray Host header cannot fill the memory.
  let appHost = null;
  try { appHost = new URL(env.APP_ORIGIN || SITE_ORIGIN).hostname; } catch {}
  if (!SERVER_HOSTS.has(url.hostname) && url.hostname !== appHost) return null;
  return `https://${url.hostname}${url.pathname}?aurin-page=${encodeURIComponent(version)}`;
}

function answer({ status, headers, body }, source) {
  const out = new Headers(headers);
  out.set("X-Page-Cache", source);
  return new Response(body, { status, headers: out });
}

// render() builds the page as staticRoute does; only a 200 is kept.
export async function cachedPage(url, env, ctx, render, { cache = globalThis.caches?.default } = {}) {
  const key = pageKey(url, env);
  if (!key) return render();
  const own = kept.get(key);
  if (own) return answer(own, "memory");
  const edge = cache ? await cache.match(key).catch(() => null) : null;
  if (edge?.status === 200) {
    const headers = new Headers(edge.headers);
    headers.set("cache-control", headers.get(BROWSER_HEADER) || "private, max-age=0, must-revalidate");
    headers.delete(BROWSER_HEADER);
    for (const name of ["age", "cf-cache-status", "expires", "last-modified", "etag", "content-length"]) headers.delete(name);
    const stored = { status: 200, headers: [...headers], body: await edge.text() };
    keep(key, stored);
    return answer(stored, "edge");
  }
  const page = await render();
  if (page.status !== 200 || page.headers.has("set-cookie")) return page;
  const stored = { status: 200, headers: [...page.headers], body: await page.text() };
  keep(key, stored);
  if (cache) {
    const forEdge = new Headers(stored.headers);
    forEdge.set(BROWSER_HEADER, forEdge.get("cache-control") || "");
    forEdge.set("cache-control", `public, max-age=${EDGE_SECONDS}`);
    const put = cache.put(key, new Response(stored.body, { status: 200, headers: forEdge })).catch(() => {});
    if (ctx?.waitUntil) ctx.waitUntil(put); else await put;
  }
  return answer(stored, "miss");
}

function keep(key, stored) {
  // A new version in the same isolate never happens in production, but keep the map to one version.
  const version = key.slice(key.indexOf("?"));
  for (const old of kept.keys()) if (!old.endsWith(version)) kept.delete(old);
  kept.set(key, stored);
}

export function forgetKeptPages() { kept.clear(); }
