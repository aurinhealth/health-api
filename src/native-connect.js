// Connecting Google, Intervals.icu or Ultrahuman from the native app (ios-native/). The
// provider's consent page opens in a system browser sheet, which does not
// share the app's session cookie, so:
// 1. the app asks POST /app/api/connect/start for a short-lived signed ticket,
// 2. the sheet opens /auth/app/connect?ticket=…, which signs the browser in as
//    the same user and continues to /oauth/<provider>?return=native. Only the
//    app's own sheet gets through: it sends the ticket again in the
//    X-Aurin-Connect header (iOS 17.4+, the app's minimum), which a link opened
//    anywhere else cannot. A ticket link sent by another user would otherwise
//    sign the reader in as that user and put their health data in the sender's
//    account (pentest 2026-10-25, L4), so such a link only expires. A browser
//    already signed in as the ticket's user also continues. Each ticket works once,
// 3. the provider's callback ends at https://<server>/auth/app/connected?event=…,
//    which closes the sheet (connect-return.js). A build from before 2026-11
//    (no X-Aurin-Api header) gets loadwise://connected, which it waits for.
import { signText, userSessionCookie, sessionSecret, timingSafeEqualString } from "./dashboard-auth.js";
import { L, lang } from "./lang.js";
import { connectReturnUrl } from "./connect-return.js";
import { APP_CONNECTED_PATH } from "./app-origin.js";
import { appPage } from "./google-login.js";

const TICKET_SECONDS = 120;
// "google-extra": the optional Google scopes (writing weight and workouts).
const PROVIDERS = new Set(["google", "google-extra", "intervals", "ultrahuman", "whoop", "wahoo"]);

const b64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

// back: "app" (https return) or "native" (an older build's loadwise:// return).
export async function connectTicket(uid, provider, secret, now = Date.now(), back = "app") {
  const id = b64(crypto.getRandomValues(new Uint8Array(12)));
  const payload = b64(new TextEncoder().encode(JSON.stringify({ uid, p: provider, exp: Math.floor(now / 1000) + TICKET_SECONDS, id, ...(back === "native" ? { r: "native" } : {}) })));
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
  return { uid, provider: data.p, id: typeof data.id === "string" ? data.id : null, exp: Number(data.exp), back: data.r === "native" ? "native" : "app" };
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

const CONNECTED_PAGE = { cs: ["Pokračuj v aplikaci", "Vrať se do aplikace Aurin. Pokud se nic nestane, aktualizuj Aurin na nejnovější verzi."], en: ["Continue in the app", "Go back to the Aurin app. If nothing happens, update Aurin to the latest version."] };
const expired = (env, back = "app") => new Response(null, { status: 302, headers: { Location: connectReturnUrl(back, "expired", env), "Cache-Control": "no-store" } });

// The app's language rides along from /app/api/connect/start (hl=en|cs): the
// browser's own language can differ from the one chosen in Aurin.
const pageLang = (url, request) => ["en", "cs"].includes(url.searchParams.get("hl")) ? url.searchParams.get("hl")
  : /^en\b/i.test(request.headers.get("Accept-Language") || "") ? "en" : "cs";

async function continueToProvider(env, ticket, hl) {
  if (!(await useTicket(env.DB, ticket))) return expired(env, ticket.back);
  // Google's data policy: the app showed its own disclosure right before this (consent=1).
  const next = { google: "/oauth/google?consent=1&return=" + ticket.back, "google-extra": "/oauth/google?consent=1&extra=1&return=" + ticket.back, ultrahuman: "/oauth/ultrahuman?return=" + ticket.back, whoop: "/oauth/whoop?return=" + ticket.back, wahoo: "/oauth/wahoo?return=" + ticket.back }[ticket.provider] || "/oauth/intervals?return=" + ticket.back;
  // Google shows its consent page in the app's language (hl).
  const location = ticket.provider.startsWith("google") ? next + "&hl=" + hl : next;
  const headers = new Headers({ Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  headers.append("Set-Cookie", await userSessionCookie(env.DB, ticket.uid, sessionSecret(env)));
  return new Response(null, { status: 303, headers });
}

export async function handleNativeConnect(request, env, url, { user, signedIn }) {
  if (url.pathname === "/app/api/connect/start" && request.method === "POST") {
    if (!signedIn || !user) return Response.json({ message: L("Přihlas se do aplikace.", "Sign in to the app.") }, { status: 401 });
    if (request.headers.get("Origin") !== url.origin) return Response.json({ message: L("Neplatný původ požadavku.", "Invalid request origin.") }, { status: 403 });
    const { provider, return: back } = await request.json().catch(() => ({}));
    if (!PROVIDERS.has(provider)) return Response.json({ message: L("Neznámá služba.", "Unknown service.") }, { status: 400 });
    const ticket = await connectTicket(user.id, provider, sessionSecret(env), Date.now(), back === "https" ? "app" : "native");
    return Response.json({ status: "ok", url: url.origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket) + "&hl=" + lang() }, { headers: { "Cache-Control": "no-store" } });
  }
  if (url.pathname === "/auth/app/connect" && request.method === "GET") {
    const ticketText = url.searchParams.get("ticket");
    const ticket = await readConnectTicket(ticketText, sessionSecret(env));
    if (!ticket) return expired(env);
    const hl = pageLang(url, request);
    // Already signed in here as the ticket's user: nothing to confirm.
    if (signedIn && Number(user?.id) === ticket.uid) return continueToProvider(env, ticket, hl);
    // Opened by the app's own sheet (Auth.swift): nobody else's link can add this header.
    if (request.headers.get("X-Aurin-Connect") === ticketText) return continueToProvider(env, ticket, hl);
    return expired(env, ticket.back);
  }
  // Seen only when the app's browser sheet did not catch the address (it never carries a secret).
  if (url.pathname === APP_CONNECTED_PATH && (request.method === "GET" || request.method === "HEAD")) return appPage(request, CONNECTED_PAGE, 200);
  return null;
}
