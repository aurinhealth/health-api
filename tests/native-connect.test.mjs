import test from "node:test";
import assert from "node:assert/strict";
import { connectTicket, readConnectTicket, handleNativeConnect } from "../src/native-connect.js";
import { connectReturn, connectReturnUrl } from "../src/connect-return.js";
import { isPublicPath } from "../src/dashboard-auth.js";
import { handleGoogleOAuth } from "../src/google-oauth.js";
import { createD1 } from "./helpers/d1.mjs";

function connectEnv() {
  const DB = createD1();
  DB.sqlite.exec("CREATE TABLE auth_challenges (challenge TEXT PRIMARY KEY, purpose TEXT NOT NULL, user_id INTEGER, user_handle TEXT, expires_at INTEGER NOT NULL); CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, role TEXT, disabled INTEGER DEFAULT 0, session_epoch INTEGER NOT NULL DEFAULT 0); INSERT INTO users (id, email, role) VALUES (3, 'petr@example.com', 'user');");
  return { ...env, DB, OWNER_EMAIL: "owner@example.com" };
}

const env = { SESSION_SECRET: "test-session-secret" };
const origin = "https://aurin.health";

test("a connect ticket names the user and provider and expires", async () => {
  const ticket = await connectTicket(7, "intervals", env.SESSION_SECRET);
  const read = await readConnectTicket(ticket, env.SESSION_SECRET);
  assert.deepEqual([read.uid, read.provider, typeof read.id], [7, "intervals", "string"]);
  assert.equal(await readConnectTicket(ticket, "another-secret"), null);
  assert.equal(await readConnectTicket(ticket, env.SESSION_SECRET, Date.now() + 121_000), null);
  assert.equal(await readConnectTicket(ticket.replace(/^./, "x"), env.SESSION_SECRET), null);
});

test("the app gets a ticket link only when signed in, from its own origin, for a known service", async () => {
  const start = (body, { signedIn = true, from = origin } = {}) => handleNativeConnect(
    new Request(origin + "/app/api/connect/start", { method: "POST", headers: { Origin: from, "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    env, new URL(origin + "/app/api/connect/start"), { user: signedIn ? { id: 3 } : null, signedIn });
  const ok = await start({ provider: "google" });
  assert.equal(ok.status, 200);
  const link = new URL((await ok.json()).url);
  assert.equal(link.pathname, "/auth/app/connect");
  const read = await readConnectTicket(link.searchParams.get("ticket"), env.SESSION_SECRET);
  assert.deepEqual([read.uid, read.provider], [3, "google"]);
  assert.equal((await start({ provider: "google" }, { signedIn: false })).status, 401);
  assert.equal((await start({ provider: "google" }, { from: "https://evil.example" })).status, 403);
  assert.equal((await start({ provider: "garmin" })).status, 400);
  // Strava is gone (Synchronizace sends to it no more); the optional Google scopes have their own ticket.
  assert.equal((await start({ provider: "strava" })).status, 400);
  assert.equal((await start({ provider: "google-extra" })).status, 200);
});

test("the ticket continues straight on in a browser already signed in as that user, once", async () => {
  const cenv = connectEnv();
  const ticket = await connectTicket(3, "intervals", env.SESSION_SECRET);
  const url = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket));
  const response = await handleNativeConnect(new Request(url), cenv, url, { user: { id: 3 }, signedIn: true });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/oauth/intervals?return=app");
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Secure/);
  // Used up: the same link never signs anyone in again.
  assert.equal((await handleNativeConnect(new Request(url), cenv, url, { user: { id: 3 }, signedIn: true })).headers.get("Location"), "https://aurin.health/auth/app/connected?event=expired");
  const google = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(await connectTicket(3, "google", env.SESSION_SECRET)));
  assert.equal((await handleNativeConnect(new Request(google), cenv, google, { user: { id: 3 }, signedIn: true })).headers.get("Location"), "/oauth/google?consent=1&return=app&hl=cs");
  const bad = new URL(origin + "/auth/app/connect?ticket=nope.nope");
  assert.equal((await handleNativeConnect(new Request(bad), cenv, bad, {})).headers.get("Location"), "https://aurin.health/auth/app/connected?event=expired");
  assert.equal(isPublicPath("/auth/app/connect"), true);
});

test("a ticket link opened anywhere but the app's own sheet only expires (pentest L4)", async () => {
  const cenv = connectEnv();
  const ticket = await connectTicket(3, "google", env.SESSION_SECRET);
  const url = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket));
  // Another user's browser, signed in or not, never signs in as the ticket's user.
  for (const session of [{ user: null, signedIn: false }, { user: { id: 9 }, signedIn: true }]) {
    const response = await handleNativeConnect(new Request(url), cenv, url, session);
    assert.equal(response.headers.get("Location"), "https://aurin.health/auth/app/connected?event=expired");
    assert.equal(response.headers.get("Set-Cookie"), null);
  }
  // No confirm form to post any more.
  const post = await handleNativeConnect(new Request(origin + "/auth/app/connect", { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body: "ticket=" + encodeURIComponent(ticket) }), cenv, new URL(origin + "/auth/app/connect"), { user: null, signedIn: false });
  assert.equal(post, null);
  // The refused tries did not use the ticket up: the app's sheet still gets through.
  const sheet = await handleNativeConnect(new Request(url, { headers: { "X-Aurin-Connect": ticket } }), cenv, url, { user: null, signedIn: false });
  assert.equal(sheet.status, 303);
});

test("the app's own sheet, which repeats the ticket in a header, skips the confirm page", async () => {
  const cenv = connectEnv();
  const ticket = await connectTicket(3, "google", env.SESSION_SECRET);
  const url = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket));
  const other = await connectTicket(3, "google", env.SESSION_SECRET);
  assert.equal((await handleNativeConnect(new Request(url, { headers: { "X-Aurin-Connect": other } }), cenv, url, { user: null, signedIn: false })).headers.get("Location"), "https://aurin.health/auth/app/connected?event=expired");
  const direct = await handleNativeConnect(new Request(url, { headers: { "X-Aurin-Connect": ticket } }), cenv, url, { user: null, signedIn: false });
  assert.equal(direct.status, 303);
  assert.equal(direct.headers.get("Location"), "/oauth/google?consent=1&return=app&hl=cs");
  assert.match(direct.headers.get("Set-Cookie"), /HttpOnly; Secure/);
});

// The app's browser sheet closes on https://aurin.health/auth/app/connected, which only the Aurin app
// can catch; a build from before 2026-11 (no X-Aurin-Api header) still gets loadwise://connected.
test("a connection returns to the app over https, an older build to its old address", async () => {
  assert.equal(connectReturn(new Request(origin + "/oauth/intervals?return=app")), "app");
  assert.equal(connectReturn(new Request(origin + "/oauth/intervals")), "app");
  assert.equal(connectReturn(new Request(origin + "/oauth/intervals?return=native")), "native");
  assert.equal(connectReturnUrl("app", "intervals"), "https://aurin.health/auth/app/connected?event=intervals");
  assert.equal(connectReturnUrl("settings", "weird"), "https://aurin.health/auth/app/connected?event=unknown");
  assert.equal(connectReturnUrl("native", "intervals"), "loadwise://connected?event=intervals");

  const cenv = connectEnv();
  const start = headers => handleNativeConnect(new Request(origin + "/app/api/connect/start", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify({ provider: "intervals" }) }), cenv, new URL(origin + "/app/api/connect/start"), { user: { id: 3 }, signedIn: true });
  const continued = async headers => {
    const link = new URL((await (await start(headers)).json()).url);
    const ticket = link.searchParams.get("ticket");
    return (await handleNativeConnect(new Request(link, { headers: { "X-Aurin-Connect": ticket } }), cenv, link, { user: null, signedIn: false })).headers.get("Location");
  };
  assert.equal(await continued({ "X-Aurin-Api": "1" }), "/oauth/intervals?return=app");
  assert.equal(await continued({ "X-Loadwise-Api": "1" }), "/oauth/intervals?return=native");

  const page = await handleNativeConnect(new Request(origin + "/auth/app/connected?event=google"), cenv, new URL(origin + "/auth/app/connected?event=google"), {});
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(isPublicPath("/auth/app/connected"), true);
});

test("the app's language, not the browser's, chooses Google's consent page", async () => {
  const cenv = connectEnv();
  const ticket = await connectTicket(3, "google", env.SESSION_SECRET);
  const url = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket) + "&hl=en");
  const sheet = await handleNativeConnect(new Request(url, { headers: { "X-Aurin-Connect": ticket, "Accept-Language": "cs-CZ" } }), cenv, url, { user: null, signedIn: false });
  assert.equal(sheet.headers.get("Location"), "/oauth/google?consent=1&return=app&hl=en");
  const google = new URL((await handleGoogleOAuth(new Request("https://aurin.health/oauth/google?consent=1&return=app&hl=en"), { GOOGLE_CLIENT_ID: "id" }, "/oauth/google")).headers.get("Location"));
  assert.equal(google.searchParams.get("hl"), "en");
});
