// Connecting Google, Intervals.icu or Ultrahuman from the native app (ios-native/). The
// provider's consent page opens in a system browser sheet, which does not
// share the app's session cookie, so:
// 1. the app asks POST /app/api/connect/start for a short-lived signed ticket,
// 2. the sheet opens /auth/app/connect?ticket=…, which signs the browser in as
//    the same user and continues to /oauth/<provider>?return=native. A browser
//    signed in as someone else, or not at all, first sees whose account it is
//    and confirms with a POST: a ticket link sent by another user could
//    otherwise sign the reader in as that user and put their Google data in
//    the sender's account. The app's own sheet sends the ticket again in the
//    X-Aurin-Connect header, which a link opened anywhere else cannot, so it
//    skips that page. Each ticket works once,
// 3. the provider's callback ends at loadwise://connected?event=…, which
//    closes the sheet (connect-return.js).
import { signText, userSessionCookie, sessionSecret, timingSafeEqualString } from "./dashboard-auth.js";
import { findUser } from "./tenancy.js";

const TICKET_SECONDS = 120;
// "google-extra": the optional Google scopes (writing weight and workouts).
const PROVIDERS = new Set(["google", "google-extra", "intervals", "strava", "ultrahuman", "whoop"]);

const b64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

export async function connectTicket(uid, provider, secret, now = Date.now()) {
  const id = b64(crypto.getRandomValues(new Uint8Array(12)));
  const payload = b64(new TextEncoder().encode(JSON.stringify({ uid, p: provider, exp: Math.floor(now / 1000) + TICKET_SECONDS, id })));
  return payload + "." + await signText("app-connect." + payload, secret);
}

export async function readConnectTicket(ticket, secret, now = Date.now()) {
  const [payload, signature] = String(ticket || "").split(".");
  if (!payload || !signature || !secret) return null;
  if (!timingSafeEqualString(signature, await signText("app-connect." + payload, secret))) return null;
  let data;
  try { data = JSON.parse(new TextDecoder().decode(unb64(payload))); } catch { return null; }
  const uid = Number(data?.uid);
  if (!Number.isInteger(uid) || uid <= 0 || !PROVIDERS.has(data?.p) || !(Number(data?.exp) > Math.floor(now / 1000))) return null;
  return { uid, provider: data.p, id: typeof data.id === "string" ? data.id : null, exp: Number(data.exp) };
}

// Marks the ticket used (auth_challenges, purpose app-connect); false when it was used before.
async function useTicket(db, ticket) {
  if (!db || !ticket.id) return false;
  const now = Math.floor(Date.now() / 1000);
  const [, used] = await db.batch([
    db.prepare("DELETE FROM auth_challenges WHERE purpose = 'app-connect' AND expires_at <= ?").bind(now),
    db.prepare("INSERT INTO auth_challenges(challenge, purpose, user_id, expires_at) VALUES (?, 'app-connect', ?, ?) ON CONFLICT(challenge) DO NOTHING").bind(ticket.id, ticket.uid, ticket.exp)
  ]);
  return Number(used?.meta?.changes) > 0;
}

// The confirm button's POST: Origin is this site, or Safari sent "null" but
// Sec-Fetch-Site (which no page can set) says the form was on this site.
export function postedFromHere(request, url) {
  const origin = request.headers.get("Origin");
  if (origin === url.origin) return true;
  return (origin === null || origin === "null") && request.headers.get("Sec-Fetch-Site") === "same-origin";
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const expired = () => new Response(null, { status: 302, headers: { Location: "loadwise://connected?event=expired", "Cache-Control": "no-store" } });

function confirmPage(request, ticketText, ticket, email) {
  const en = /^en\b/i.test(request.headers.get("Accept-Language") || "");
  const service = ticket.provider.startsWith("google") ? "Google Health" : ticket.provider === "strava" ? "Strava" : ticket.provider === "ultrahuman" ? "Ultrahuman" : ticket.provider === "whoop" ? "WHOOP" : "Intervals.icu";
  const t = en
    ? { title: "Connect " + service, body: "Connect " + service + " to the Aurin account", note: "If this isn't your account, close this page.", go: "Continue", lang: "en" }
    : { title: "Připojit " + service, body: "Připojit " + service + " k účtu Aurin", note: "Pokud to není tvůj účet, zavři tuto stránku.", go: "Pokračovat", lang: "cs" };
  const html = `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(t.title)}</title>
<style>body{font:17px -apple-system,system-ui,sans-serif;margin:0;padding:32px 20px;background:#fff;color:#111}@media(prefers-color-scheme:dark){body{background:#000;color:#eee}}main{max-width:420px;margin:auto}b{word-break:break-all}p.n{opacity:.7;font-size:15px}button{width:100%;padding:14px;border:0;border-radius:12px;background:#0a84ff;color:#fff;font:600 17px -apple-system,system-ui,sans-serif;margin-top:16px}</style></head>
<body><main><p>${escapeHtml(t.body)}</p><p><b>${escapeHtml(email)}</b></p><p class="n">${escapeHtml(t.note)}</p>
<form method="post" action="/auth/app/connect"><input type="hidden" name="ticket" value="${escapeHtml(ticketText)}"><button type="submit">${escapeHtml(t.go)}</button></form></main></body></html>`;
  // same-origin, not no-referrer: with no-referrer the browser posts the form with "Origin: null".
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "same-origin" } });
}

async function continueToProvider(env, ticket) {
  if (!(await useTicket(env.DB, ticket))) return expired();
  // Google's data policy: the app showed its own disclosure right before this (consent=1).
  const next = { google: "/oauth/google?consent=1&return=native", "google-extra": "/oauth/google?consent=1&extra=1&return=native", strava: "/oauth/strava?return=native", ultrahuman: "/oauth/ultrahuman?return=native", whoop: "/oauth/whoop?return=native" }[ticket.provider] || "/oauth/intervals?return=native";
  const headers = new Headers({ Location: next, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", await userSessionCookie(env.DB, ticket.uid, sessionSecret(env)));
  return new Response(null, { status: 303, headers });
}

export async function handleNativeConnect(request, env, url, { user, signedIn }) {
  if (url.pathname === "/app/api/connect/start" && request.method === "POST") {
    if (!signedIn || !user) return Response.json({ message: "Přihlas se do aplikace." }, { status: 401 });
    if (request.headers.get("Origin") !== url.origin) return Response.json({ message: "Neplatný původ požadavku." }, { status: 403 });
    const { provider } = await request.json().catch(() => ({}));
    if (!PROVIDERS.has(provider)) return Response.json({ message: "Neznámá služba." }, { status: 400 });
    const ticket = await connectTicket(user.id, provider, sessionSecret(env));
    return Response.json({ status: "ok", url: url.origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (url.pathname === "/auth/app/connect" && request.method === "GET") {
    const ticketText = url.searchParams.get("ticket");
    const ticket = await readConnectTicket(ticketText, sessionSecret(env));
    if (!ticket) return expired();
    // Already signed in here as the ticket's user: nothing to confirm.
    if (signedIn && Number(user?.id) === ticket.uid) return continueToProvider(env, ticket);
    // Opened by the app's own sheet (Auth.swift): nobody else's link can add this header.
    if (request.headers.get("X-Aurin-Connect") === ticketText) return continueToProvider(env, ticket);
    const owner = await findUser(env.DB, ticket.uid, env).catch(() => null);
    if (!owner) return expired();
    return confirmPage(request, ticketText, ticket, owner.email);
  }
  if (url.pathname === "/auth/app/connect" && request.method === "POST") {
    // Only the confirm button on this site's own page, never a form posted from elsewhere.
    if (!postedFromHere(request, url)) return Response.json({ message: "Neplatný původ požadavku." }, { status: 403 });
    const form = await request.formData().catch(() => null);
    const ticket = await readConnectTicket(form?.get("ticket"), sessionSecret(env));
    if (!ticket) return expired();
    return continueToProvider(env, ticket);
  }
  return null;
}
