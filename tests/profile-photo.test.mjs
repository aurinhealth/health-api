import test from "node:test";
import assert from "node:assert/strict";
import { parseProfilePhoto, profilePhoto, saveProfilePhoto, removeProfilePhoto, MAX_PHOTO_BYTES } from "../src/profile-photo.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";

test("the profile photo is one JPEG of limited size", () => {
  assert.equal(parseProfilePhoto({ jpeg: "/9j/4AAQ" }), "/9j/4AAQ");
  assert.throws(() => parseProfilePhoto({}));
  assert.throws(() => parseProfilePhoto({ jpeg: "iVBORw0K" }), /JPEG/);
  assert.throws(() => parseProfilePhoto({ jpeg: "/9j/" + "A".repeat(Math.ceil(MAX_PHOTO_BYTES / 3) * 4) }), /large|velká/);
});

test("the profile photo is kept per user, replaced and removed", async () => {
  const raw = createD1(), db = scopedDb(raw, 3), other = scopedDb(raw, 4);
  assert.deepEqual(await profilePhoto(db), { jpeg: null, updatedAt: null }, "nothing before the first save");
  await removeProfilePhoto(db);
  await saveProfilePhoto(db, { jpeg: "/9j/AAAA" });
  await saveProfilePhoto(db, { jpeg: "/9j/BBBB" });
  assert.equal((await profilePhoto(db)).jpeg, "/9j/BBBB");
  assert.equal((await profilePhoto(other)).jpeg, null);
  await removeProfilePhoto(db);
  assert.equal((await profilePhoto(db)).jpeg, null);
  assert.ok(PERSONAL_TABLES.profile_photos, "deleted and exported with the account");
});
