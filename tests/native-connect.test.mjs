import test from "node:test";
import assert from "node:assert/strict";
import { connectTicket, readConnectTicket, handleNativeConnect } from "../src/native-connect.js";
import { connectReturn, connectReturnUrl } from "../src/connect-return.js";
import { isPublicPath } from "../src/dashboard-auth.js";
import { createD1 } from "./helpers/d1.mjs";

function connectEnv() {
  const DB = createD1();
  DB.sqlite.exec("CREATE TABLE auth_challenges (challenge TEXT PRIMARY KEY, purpose TEXT NOT NULL, user_id INTEGER, user_handle TEXT, expires_at INTEGER NOT NULL); CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, role TEXT, disabled INTEGER DEFAULT 0, session_epoch INTEGER NOT NULL DEFAULT 0); INSERT INTO users (id, email, role) VALUES (3, 'petr@example.com', 'user');");
  return { ...env, DB, OWNER_EMAIL: "owner@example.com" };
}

const env = { SESSION_SECRET: "test-session-secret" };
const origin = "https://petrfitnessdata.eu";

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
  // Strava (Synchronizace) and the optional Google scopes have their own tickets.
  assert.equal((await start({ provider: "strava" })).status, 200);
  assert.equal((await start({ provider: "google-extra" })).status, 200);
});

test("the ticket continues straight on in a browser already signed in as that user, once", async () => {
  const cenv = connectEnv();
  const ticket = await connectTicket(3, "intervals", env.SESSION_SECRET);
  const url = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket));
  const response = await handleNativeConnect(new Request(url), cenv, url, { user: { id: 3 }, signedIn: true });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/oauth/intervals?return=native");
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Secure/);
  // Used up: the same link never signs anyone in again.
  assert.equal((await handleNativeConnect(new Request(url), cenv, url, { user: { id: 3 }, signedIn: true })).headers.get("Location"), "loadwise://connected?event=expired");
  const google = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(await connectTicket(3, "google", env.SESSION_SECRET)));
  assert.equal((await handleNativeConnect(new Request(google), cenv, google, { user: { id: 3 }, signedIn: true })).headers.get("Location"), "/oauth/google?consent=1&return=native");
  const bad = new URL(origin + "/auth/app/connect?ticket=nope.nope");
  assert.equal((await handleNativeConnect(new Request(bad), cenv, bad, {})).headers.get("Location"), "loadwise://connected?event=expired");
  assert.equal(isPublicPath("/auth/app/connect"), true);
});

test("another browser sees whose account it is and signs in only after confirming on this site", async () => {
  const cenv = connectEnv();
  const ticket = await connectTicket(3, "google", env.SESSION_SECRET);
  const url = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket));
  for (const session of [{ user: null, signedIn: false }, { user: { id: 9 }, signedIn: true }]) {
    const page = await handleNativeConnect(new Request(url), cenv, url, session);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("Set-Cookie"), null);
    const html = await page.text();
    assert.match(html, /petr@example\.com/);
    assert.match(html, /method="post" action="\/auth\/app\/connect"/);
  }
  const post = from => handleNativeConnect(new Request(origin + "/auth/app/connect", { method: "POST", headers: { Origin: from, "Content-Type": "application/x-www-form-urlencoded" }, body: "ticket=" + encodeURIComponent(ticket) }), cenv, new URL(origin + "/auth/app/connect"), { user: null, signedIn: false });
  // A form posted from another site cannot skip the page.
  assert.equal((await post("https://evil.example")).status, 403);
  const confirmed = await post(origin);
  assert.equal(confirmed.status, 303);
  assert.equal(confirmed.headers.get("Location"), "/oauth/google?consent=1&return=native");
  assert.match(confirmed.headers.get("Set-Cookie"), /HttpOnly; Secure/);
  assert.equal((await post(origin)).headers.get("Location"), "loadwise://connected?event=expired");
});

test("a native connection returns to the app", () => {
  assert.equal(connectReturn(new Request(origin + "/oauth/intervals?return=native")), "native");
  assert.equal(connectReturnUrl("native", "intervals"), "loadwise://connected?event=intervals");
  assert.equal(connectReturnUrl("native", "weird"), "loadwise://connected?event=unknown");
  assert.equal(connectReturnUrl("settings", "google"), "/app?connected=google#settings-connections");
});
