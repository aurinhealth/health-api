import test from "node:test";
import assert from "node:assert/strict";
import { connectTicket, readConnectTicket, handleNativeConnect } from "../src/native-connect.js";
import { connectReturn, connectReturnUrl } from "../src/connect-return.js";
import { isPublicPath } from "../src/dashboard-auth.js";

const env = { SESSION_SECRET: "test-session-secret" };
const origin = "https://petrfitnessdata.eu";

test("a connect ticket names the user and provider and expires", async () => {
  const ticket = await connectTicket(7, "intervals", env.SESSION_SECRET);
  assert.deepEqual(await readConnectTicket(ticket, env.SESSION_SECRET), { uid: 7, provider: "intervals" });
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
  assert.deepEqual(await readConnectTicket(link.searchParams.get("ticket"), env.SESSION_SECRET), { uid: 3, provider: "google" });
  assert.equal((await start({ provider: "google" }, { signedIn: false })).status, 401);
  assert.equal((await start({ provider: "google" }, { from: "https://evil.example" })).status, 403);
  assert.equal((await start({ provider: "strava" })).status, 400);
});

test("the ticket signs the browser in and continues to the provider, back to the app", async () => {
  const ticket = await connectTicket(3, "intervals", env.SESSION_SECRET);
  const url = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(ticket));
  const response = await handleNativeConnect(new Request(url), env, url, { user: null, signedIn: false });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/oauth/intervals?return=native");
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Secure/);
  const google = new URL(origin + "/auth/app/connect?ticket=" + encodeURIComponent(await connectTicket(3, "google", env.SESSION_SECRET)));
  assert.equal((await handleNativeConnect(new Request(google), env, google, {})).headers.get("Location"), "/oauth/google?consent=1&return=native");
  const bad = new URL(origin + "/auth/app/connect?ticket=nope.nope");
  assert.equal((await handleNativeConnect(new Request(bad), env, bad, {})).headers.get("Location"), "loadwise://connected?event=expired");
  assert.equal(isPublicPath("/auth/app/connect"), true);
});

test("a native connection returns to the app", () => {
  assert.equal(connectReturn(new Request(origin + "/oauth/intervals?return=native")), "native");
  assert.equal(connectReturnUrl("native", "intervals"), "loadwise://connected?event=intervals");
  assert.equal(connectReturnUrl("native", "weird"), "loadwise://connected?event=unknown");
  assert.equal(connectReturnUrl("settings", "google"), "/app?connected=google#settings-connections");
});
