import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// A stand-in for every browser object: any property is another stand-in, any
// call returns one. Enough for the script's top level to run as on page load,
// where no dialog is open and nothing is checked yet.
const FALSE = new Set(["open", "checked", "hidden", "disabled", "matches", "length"]);
function stub() {
  const fn = function () {};
  return new Proxy(fn, {
    get: (target, key) => FALSE.has(key) ? (key === "length" ? 0 : false) : key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : key === Symbol.iterator ? function* () {} : stub(),
    apply: () => stub(),
    construct: () => stub(),
    set: () => true,
    has: () => true
  });
}

test("the app script loads without an error at the top level", () => {
  const source = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  const browser = { document: stub(), window: stub(), navigator: stub(), localStorage: stub(), sessionStorage: stub(), location: stub(), history: stub(),
    fetch: () => new Promise(() => {}), setInterval: () => 0, setTimeout: () => 0, clearTimeout() {}, clearInterval() {}, requestAnimationFrame: () => 0,
    matchMedia: () => stub(), addEventListener() {}, getComputedStyle: () => stub(), MutationObserver: function () { return stub(); },
    ResizeObserver: function () { return stub(); }, IntersectionObserver: function () { return stub(); }, CustomEvent: function () { return stub(); },
    Intl, Date, Math, JSON, Promise, URL, URLSearchParams, TextDecoder, TextEncoder, console, queueMicrotask: () => {}, NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 }, Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 }, HTMLElement: function () {}, Element: function () {}, AbortController, Blob, FormData: function () { return stub(); }, Image: function () { return stub(); }, atob, btoa, crypto };
  browser.self = browser.globalThis = browser;
  // A temporal dead zone (a const used before its line) or a missing name is a
  // ReferenceError at load and stops the whole app, sign-in included. What the
  // stand-ins cannot imitate (a DOM walk that never ends) is not this test's concern.
  let error = null;
  try { vm.runInNewContext(source, browser, { filename: "dashboard-client.js", timeout: 3000 }); } catch (e) { error = e; }
  assert.ok(!(error && /before initialization|is not defined/.test(error.message)), error?.stack);
});
