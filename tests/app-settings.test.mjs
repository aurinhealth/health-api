import test from "node:test";
import assert from "node:assert/strict";
import { parseAppSettings, appSettings, saveAppSettings, MAX_SETTINGS_BYTES } from "../src/app-settings.js";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb, PERSONAL_TABLES } from "../src/tenancy.js";

test("app settings are one base64 property list of limited size", () => {
  assert.equal(parseAppSettings({ data: "YnBsaXN0MDA=" }), "YnBsaXN0MDA=");
  assert.throws(() => parseAppSettings({}));
  assert.throws(() => parseAppSettings({ data: "not base64!" }));
  assert.throws(() => parseAppSettings({ data: "A".repeat(Math.ceil(MAX_SETTINGS_BYTES / 3) * 4 + 4) }), /large|velké/);
});

test("app settings are kept per user and replaced as a whole", async () => {
  const raw = createD1(), db = scopedDb(raw, 3), other = scopedDb(raw, 4);
  assert.deepEqual(await appSettings(db), { data: null, updatedAt: null }, "nothing before the first save");
  await saveAppSettings(db, { data: "AAAA" });
  await saveAppSettings(db, { data: "BBBB" });
  assert.equal((await appSettings(db)).data, "BBBB");
  assert.ok((await appSettings(db)).updatedAt);
  assert.equal((await appSettings(other)).data, null);
  assert.ok(PERSONAL_TABLES.app_settings, "deleted and exported with the account");
});
