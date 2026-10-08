import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

// The iPhone app (mobile/) wraps the live web app; its sign-in returns through
// the loadwise:// scheme that src/google-login.js sends Safari back to.
test("the iPhone app opens the live app and owns the sign-in return scheme", () => {
  const config = JSON.parse(read("mobile/capacitor.config.json"));
  assert.equal(config.server.url, "https://petrfitnessdata.eu/app");
  const plist = read("mobile/ios/App/App/Info.plist");
  assert.match(plist, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>loadwise<\/string>/);
  assert.match(plist, /<key>NSCameraUsageDescription<\/key>/);
  assert.match(read("src/google-login.js"), /const APP_RETURN_URL = "loadwise:\/\/auth";/);
  const client = read("src/dashboard-client.js");
  assert.match(client, /startsWith\('loadwise:\/\/auth'\)\)finishNativeLogin/);
  assert.match(client, /fetch\('\/auth\/app\/session'/);
  // The plugins the page calls through the bridge are installed in the app.
  const pkg = JSON.parse(read("mobile/package.json"));
  for (const plugin of ["@capacitor/app", "@capacitor/browser"]) assert.ok(pkg.dependencies[plugin], plugin);
});
