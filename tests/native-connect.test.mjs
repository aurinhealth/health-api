import test from "node:test";
import assert from "node:assert/strict";
import { connectTicket, readConnectTicket, handleNativeConnect } from "../src/native-connect.js";
import { connectReturn, connectReturnUrl } from "../src/connect-return.js";
import { isPublicPath } from "../src/dashboard-auth.js";
import { handleGoogleOAuth } from "../src/google-oauth.js";
import { handleIntervalsOAuth } from "../src/intervals-oauth.js";
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
  const ok = await start({ provider: "google", return: "https" });
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
  assert.equal(response.headers.get("Location"), "/oauth/intervals");
  assert.match(response.headers.get("Set-Cookie"), /aurin_connect_return=app; .*HttpOnly/);
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Secure/);
  // Used up: the same link never signs anyone in again.
  assert.equal((await handleNativeConnect(new Request(url), cenv, url, { user: { id: 3 }, signedIn: true })).headers.get("Location"), "https://aurin.health/auth/app/connected?event=expired");
  const google = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(await connectTicket(3, "google", env.SESSION_SECRET)));
  assert.equal((await handleNativeConnect(new Request(google), cenv, google, { user: { id: 3 }, signedIn: true })).headers.get("Location"), "/oauth/google?consent=1&hl=cs");
  // A ticket that can't be read: the sheet's own header says where it waits.
  const bad = new URL(origin + "/auth/app/connect?ticket=nope.nope");
  assert.equal((await handleNativeConnect(new Request(bad, { headers: { "X-Aurin-Return": "https" } }), cenv, bad, {})).headers.get("Location"), "https://aurin.health/auth/app/connected?event=expired");
  assert.equal((await handleNativeConnect(new Request(bad), cenv, bad, {})).headers.get("Location"), "loadwise://connected?event=expired");
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
  assert.equal(direct.headers.get("Location"), "/oauth/google?consent=1&hl=cs");
  assert.match(direct.headers.get("Set-Cookie"), /HttpOnly; Secure/);
});

// The app's browser sheet closes on https://<server>/auth/app/connected, which only the Aurin app
// can catch, when it asks for it (return: "https" once the server answers that page); otherwise, as a
// build from before 2026-11, it still gets loadwise://connected.
test("a connection returns to the app over https when it asks, otherwise to its old address", async () => {
  // Only the cookie the ticket set chooses; a link's ?return= does not.
  assert.equal(connectReturn(new Request(origin + "/oauth/intervals")), "app");
  assert.equal(connectReturn(new Request(origin + "/oauth/intervals?return=native")), "app");
  assert.equal(connectReturn(new Request(origin + "/oauth/intervals", { headers: { Cookie: "aurin_connect_return=native" } })), "native");
  assert.equal(connectReturnUrl("app", "intervals"), "https://aurin.health/auth/app/connected?event=intervals");
  assert.equal(connectReturnUrl("settings", "weird"), "https://aurin.health/auth/app/connected?event=unknown");
  assert.equal(connectReturnUrl("native", "intervals"), "loadwise://connected?event=intervals");
  assert.equal(connectReturnUrl("app", "whoop", { APP_ORIGIN: "https://staging.aurin.health" }), "https://staging.aurin.health/auth/app/connected?event=whoop");

  const cenv = connectEnv();
  const start = body => handleNativeConnect(new Request(origin + "/app/api/connect/start", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ provider: "intervals", ...body }) }), cenv, new URL(origin + "/app/api/connect/start"), { user: { id: 3 }, signedIn: true });
  const continued = async body => {
    const link = new URL((await (await start(body)).json()).url);
    const ticket = link.searchParams.get("ticket");
    const sheet = await handleNativeConnect(new Request(link, { headers: { "X-Aurin-Connect": ticket } }), cenv, link, { user: null, signedIn: false });
    assert.equal(sheet.headers.get("Location"), "/oauth/intervals");
    return sheet.headers.get("Set-Cookie").match(/aurin_connect_return=(\w+)/)[1];
  };
  assert.equal(await continued({ return: "https" }), "app");
  assert.equal(await continued({}), "native");

  // An older build: every way back from the provider ends at loadwise://, even a lost state.
  const old = { headers: { Cookie: "aurin_connect_return=native" } };
  const iv = { ...cenv, INTERVALS_CLIENT_ID: "id", INTERVALS_CLIENT_SECRET: "s", USER_ID: "3" };
  const begin = await handleIntervalsOAuth(new Request(origin + "/oauth/intervals", old), iv, "/oauth/intervals");
  const state = new URL(begin.headers.get("Location")).searchParams.get("state");
  const stateCookie = begin.headers.get("Set-Cookie").split(";")[0];
  const cb = (query, cookie) => handleIntervalsOAuth(new Request(origin + "/oauth/intervals/callback?" + query, { headers: { Cookie: cookie } }), iv, "/oauth/intervals/callback");
  assert.equal((await cb("state=" + state + "&error=access_denied", stateCookie)).headers.get("Location"), "loadwise://connected?event=intervals-cancelled");
  assert.equal((await cb("state=other&code=x", stateCookie)).headers.get("Location"), "loadwise://connected?event=intervals-failed");
  assert.equal((await cb("state=other&code=x", "aurin_connect_return=native")).headers.get("Location"), "loadwise://connected?event=intervals-failed");

  const at = (lang, method = "GET") => handleNativeConnect(new Request(origin + "/auth/app/connected?event=google", { method, headers: lang ? { "Accept-Language": lang } : {} }), cenv, new URL(origin + "/auth/app/connected?event=google"), {});
  const page = await at();
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.match(await page.text(), /<html lang="en">.*Continue in the app/s);
  assert.match(await (await at("cs-CZ")).text(), /Pokračuj v aplikaci/);
  const head = await at(null, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(isPublicPath("/auth/app/connected"), true);
});

test("the app's language, not the browser's, chooses Google's consent page", async () => {
  const cenv = connectEnv();
  const ticket = await connectTicket(3, "google", env.SESSION_SECRET);
  const url = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket) + "&hl=en");
  const sheet = await handleNativeConnect(new Request(url, { headers: { "X-Aurin-Connect": ticket, "Accept-Language": "cs-CZ" } }), cenv, url, { user: null, signedIn: false });
  assert.equal(sheet.headers.get("Location"), "/oauth/google?consent=1&hl=en");
  const google = new URL((await handleGoogleOAuth(new Request("https://aurin.health/oauth/google?consent=1&return=app&hl=en"), { GOOGLE_CLIENT_ID: "id" }, "/oauth/google")).headers.get("Location"));
  assert.equal(google.searchParams.get("hl"), "en");
});
