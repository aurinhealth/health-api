import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { readReadOff, saveReadOff, readAllowed, READ_TYPES } from "../src/source-reading.js";
import { googleTypeAllowed } from "../src/google-scopes.js";
import { connectionStatus } from "../src/connections.js";

const schema = readFileSync(new URL("../staging/schema.sql", import.meta.url), "utf8");
function setup() {
  const raw = createD1();
  raw.sqlite.exec(schema);
  return { raw, db: scopedDb(raw, 1) };
}

test("a Reads from switch turned off is saved and stops that type only", async () => {
  const { db } = setup();
  assert.deepEqual(await readReadOff(db, 1), { google: [], ultrahuman: [], whoop: [] });
  assert.equal((await saveReadOff(db, 1, { provider: "google", type: "heart", on: false })).status, "ok");
  await saveReadOff(db, 1, { provider: "whoop", type: "sleep", on: false });
  const off = await readReadOff(db, 1);
  assert.deepEqual(off, { google: ["heart"], ultrahuman: [], whoop: ["sleep"] });
  assert.equal(readAllowed(off, "google", "heart-rate"), false);
  assert.equal(readAllowed(off, "google", "time-in-heart-rate-zone"), false);
  assert.equal(readAllowed(off, "google", "steps"), true);
  assert.equal(readAllowed(off, "google", "exercise"), true, "workouts are the Tréninky switch");
  assert.equal(readAllowed(off, "whoop", "sleep"), false);
  assert.equal(readAllowed(off, "ultrahuman", "sleep"), true);
  assert.equal(googleTypeAllowed({ READ_OFF: off }, "heart-rate"), false);
  assert.equal(googleTypeAllowed({ READ_OFF: off }, "steps"), true);
  assert.equal(googleTypeAllowed({}, "heart-rate"), true, "nothing loaded reads everything");
  // On again.
  await saveReadOff(db, 1, { provider: "google", type: "heart", on: true });
  assert.deepEqual((await readReadOff(db, 1)).google, []);
});

test("an unknown source or type is refused", async () => {
  const { db } = setup();
  assert.equal((await saveReadOff(db, 1, { provider: "apple", type: "heart", on: false })).code, 400);
  assert.equal((await saveReadOff(db, 1, { provider: "ultrahuman", type: "steps", on: false })).code, 400);
  assert.equal((await saveReadOff(db, 1, { provider: "google", type: "heart", on: "no" })).code, 400);
  assert.ok(!READ_TYPES.google.includes("workouts"));
});

test("connections carry the switches for the app", async () => {
  const { db } = setup();
  await saveReadOff(db, 1, { provider: "google", type: "body", on: false });
  const status = await connectionStatus({ DB: db, USER_ID: 1 });
  assert.deepEqual(status.readOff.google, ["body"]);
  assert.deepEqual(status.readTypes, READ_TYPES);
});
