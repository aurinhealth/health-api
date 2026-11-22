import test from "node:test";
import assert from "node:assert/strict";
import { connectReturnUrl, connectedTo } from "../src/connect-return.js";

const env = { APP_ORIGIN: "https://aurin.health" };
const back = event => new Response(null, { status: 302, headers: { Location: connectReturnUrl(event, env) } });

test("only a callback that stored the keys counts as connected", () => {
  assert.equal(connectedTo(back("google"), "google"), true);
  assert.equal(connectedTo(back("intervals"), "intervals"), true);
  for (const event of ["google-cancelled", "intervals-cancelled", "intervals-failed", "whoop-failed"]) {
    assert.equal(connectedTo(back(event), event.split("-")[0]), false, event);
  }
  assert.equal(connectedTo(back("expired"), "google"), false);
  assert.equal(connectedTo(back("google"), "intervals"), false);
  assert.equal(connectedTo(new Response("Invalid state", { status: 400 }), "google"), false);
  assert.equal(connectedTo(null, "google"), false);
});
