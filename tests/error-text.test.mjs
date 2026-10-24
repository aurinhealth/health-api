import test from "node:test";
import assert from "node:assert/strict";
import { withPlainErrors, technicalText } from "../src/error-text.js";

const request = (lang = "cs") => new Request("https://aurin.health/app/api/x", { headers: { "X-Interface-Language": lang } });

test("a database or code error gets a plain sentence in the app's language", async () => {
  for (const [lang, text] of [["cs", "Něco se pokazilo. Zkus to za chvíli znovu."], ["en", "Something went wrong. Try again in a moment."]]) {
    const response = await withPlainErrors(request(lang), Response.json({ status: "error", message: "D1_ERROR: no such table: food_logs: SQLITE_ERROR" }, { status: 500 }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { status: "error", message: text });
  }
  const unscoped = await withPlainErrors(request(), Response.json({ message: "Unscoped query on personal data: SELECT * FROM food_logs" }, { status: 400 }));
  assert.equal((await unscoped.json()).message, "Něco se pokazilo. Zkus to za chvíli znovu.");
  const code = await withPlainErrors(request(), Response.json({ message: "Cannot read properties of undefined (reading 'id')" }, { status: 500 }));
  assert.equal((await code.json()).message, "Něco se pokazilo. Zkus to za chvíli znovu.");
});

test("texts written for the user and successful answers pass unchanged", async () => {
  const user = Response.json({ message: "Bez souhlasu se zpracováním údajů o zdraví aplikace fungovat nemůže." }, { status: 400 });
  assert.equal(await withPlainErrors(request(), user), user);
  const ok = Response.json({ status: "ok", note: "undefined" });
  assert.equal(await withPlainErrors(request(), ok), ok);
  const html = new Response("TypeError", { status: 500, headers: { "Content-Type": "text/html" } });
  assert.equal(await withPlainErrors(request(), html), html);
  assert.equal(technicalText("Pro dnešek toho bylo s AI hodně. Pokračovat můžeš zítra."), false);
});
