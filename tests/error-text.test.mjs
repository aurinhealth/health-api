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

test("the user databases' guards, a missing secret, a broken body and runtime errors stay in the log", async () => {
  for (const message of [
    "A query cannot join central and user databases or the food catalogue",
    "A batch must belong to one database",
    "A routed database cannot be dumped",
    "dump is not available on a user-scoped database",
    "A user id is required for database access",
    "OWNER_EMAIL is not configured",
    "Unexpected token 'x', \"xx\" is not valid JSON",
    "Unexpected end of JSON input",
    "Too many subrequests.",
    "Network connection lost.",
    "internal error; reference = 0123abcd",
  ]) {
    const response = await withPlainErrors(request("en"), Response.json({ message }, { status: 400 }));
    assert.equal((await response.json()).message, "Something went wrong. Try again in a moment.", message);
  }
  for (const text of ["Zapsat jde jen dnešek a dny před ním.", "Only today and earlier days can be logged.", "Rides and runs are planned from My workouts.", "Trénink jde naplánovat jen na dnešek nebo později."]) assert.equal(technicalText(text), false, text);
});

test("another service's quoted answer and a technical detail stay in the log too", async () => {
  const quoted = await withPlainErrors(request("en"), Response.json({ status: "error", message: 'Intervals.icu HTTP 500: {"error":"db timeout","trace":"x"}' }, { status: 500 }));
  assert.deepEqual(await quoted.json(), { status: "error", message: "Something went wrong. Try again in a moment." });
  const detail = await withPlainErrors(request(), Response.json({ message: "Uložené potraviny se nepodařilo načíst.", detail: "D1_ERROR: no such column: kcal" }, { status: 500 }));
  assert.deepEqual(await detail.json(), { message: "Uložené potraviny se nepodařilo načíst." });
  // The service's status alone, in a sentence written for the user, stays.
  assert.equal(technicalText("Intervals.icu rejected the move (HTTP 422)."), false);
  assert.equal(technicalText("Intervals.icu HTTP 503"), false);
});
