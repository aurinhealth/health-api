// Connecting Google or Intervals.icu from the native app (ios-native/). The
// provider's consent page opens in a system browser sheet, which does not
// share the app's session cookie, so:
// 1. the app asks POST /app/api/connect/start for a short-lived signed ticket,
// 2. the sheet opens /auth/app/connect?ticket=…, which signs the browser in as
//    the same user and continues to /oauth/<provider>?return=native,
// 3. the provider's callback ends at loadwise://connected?event=…, which
//    closes the sheet (connect-return.js).
import { signText, sessionCookie, sessionSecret, SESSION_SECONDS, timingSafeEqualString } from "./dashboard-auth.js";

const TICKET_SECONDS = 120;
const PROVIDERS = new Set(["google", "intervals"]);

const b64 = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));

export async function connectTicket(uid, provider, secret, now = Date.now()) {
  const payload = b64(new TextEncoder().encode(JSON.stringify({ uid, p: provider, exp: Math.floor(now / 1000) + TICKET_SECONDS })));
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
  return { uid, provider: data.p };
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
    const ticket = await readConnectTicket(url.searchParams.get("ticket"), sessionSecret(env));
    if (!ticket) return new Response(null, { status: 302, headers: { Location: "loadwise://connected?event=expired", "Cache-Control": "no-store" } });
    // Google's data policy: the app showed its own disclosure right before this (consent=1).
    const next = ticket.provider === "google" ? "/oauth/google?consent=1&return=native" : "/oauth/intervals?return=native";
    const headers = new Headers({ Location: next, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    headers.append("Set-Cookie", await sessionCookie(ticket.uid, Math.floor(Date.now() / 1000) + SESSION_SECONDS, sessionSecret(env)));
    return new Response(null, { status: 302, headers });
  }
  return null;
}
