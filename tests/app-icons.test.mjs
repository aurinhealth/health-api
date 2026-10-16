// Settings → Ikona aplikace (ios-native/Loadwise/Screens/SettingsPages/SettingsAppIcon.swift):
// every alternate icon has its 1024 px icon set and its picker preview, and the other way round.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const assets = new URL("../ios-native/Loadwise/Resources/Assets.xcassets/", import.meta.url);
const ids = dir => readdirSync(new URL(dir, assets)).filter(name => !name.endsWith(".json"));
const icons = ids(".").filter(name => name.startsWith("AppIcon-")).map(name => name.slice("AppIcon-".length, -".appiconset".length));
const previews = ids("IconPreview/").map(name => name.slice(0, -".imageset".length));
// Výchozí: the main icon's own looks (Tmavá, Bílá, Sklo) carry dark and tinted variants of their own.
const mains = ["dark", "white", "glass"];

// PNG width and height from the IHDR chunk.
const pngSize = url => {
  const png = readFileSync(url);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

test("every alternate icon has a preview and every preview but the main icon an icon", () => {
  assert.deepEqual([...icons].sort(), previews.filter(id => id !== "default").sort());
  assert.ok(previews.includes("default"));
});

test("the icon sets and previews name their PNG and have the sizes Xcode expects", () => {
  for (const id of mains) {
    const contents = JSON.parse(readFileSync(new URL(`AppIcon-${id}.appiconset/Contents.json`, assets), "utf8"));
    assert.equal(contents.images[0].filename, `appicon-${id}.png`, id);
    for (const image of contents.images) assert.deepEqual(pngSize(new URL(`AppIcon-${id}.appiconset/${image.filename}`, assets)), [1024, 1024], image.filename);
  }
  for (const id of icons.filter(id => !mains.includes(id))) {
    const dir = new URL(`AppIcon-${id}.appiconset/`, assets);
    const contents = JSON.parse(readFileSync(new URL("Contents.json", dir), "utf8"));
    assert.deepEqual(contents.images, [{ filename: `${id}.png`, idiom: "universal", platform: "ios", size: "1024x1024" }], id);
    assert.deepEqual(pngSize(new URL(`${id}.png`, dir)), [1024, 1024], id);
  }
  for (const id of previews) {
    const dir = new URL(`IconPreview/${id}.imageset/`, assets);
    const contents = JSON.parse(readFileSync(new URL("Contents.json", dir), "utf8"));
    assert.deepEqual(contents.images, [{ filename: `${id}.png`, idiom: "universal", scale: "3x" }], id);
    assert.deepEqual(pngSize(new URL(`${id}.png`, dir)), [192, 192], id);
  }
});

test("the picker's styles and Pro icons all have icons", () => {
  const swift = readFileSync(new URL("../ios-native/Loadwise/Screens/SettingsPages/SettingsAppIcon.swift", import.meta.url), "utf8");
  const styles = [...swift.matchAll(/Style\(key: "([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(styles, ["badge", "track"]);
  const slots = ["run", "run-gold", "ride", "ride-gold", "gym", "gym-gold", "spring", "summer", "autumn", "winter", "streak"];
  for (const style of styles) for (const slot of slots) assert.ok(icons.includes(`${style}-${slot}`), `${style}-${slot}`);
  const pro = [...swift.slice(swift.indexOf("static let proIcons")).split("\n    ]")[0].matchAll(/\("([a-z-]+)", "/g)].map(m => m[1]);
  assert.equal(pro.length, 5);
  for (const id of pro) assert.ok(icons.includes(`pro-${id}`), `pro-${id}`);
  assert.equal(icons.length, mains.length + styles.length * slots.length + pro.length);
});

// Záře, Prstenec and the 13 later Pro icons are kept for a later update, outside the app.
test("the icons kept for later stay out of the asset catalog", () => {
  const later = new URL("../ios-native/IconsLater/", import.meta.url);
  const kept = readdirSync(later).filter(name => name.startsWith("AppIcon-")).map(name => name.slice("AppIcon-".length, -".appiconset".length));
  assert.equal(kept.length, 35);
  for (const id of kept) {
    assert.ok(!icons.includes(id), id);
    assert.ok(readdirSync(new URL("IconPreview/", later)).includes(`${id}.imageset`), id);
  }
});
