import test from "node:test";
import assert from "node:assert/strict";
import { PAIN_WORDS, PASSING_WORDS } from "../src/pain-words.js";
import { injuryNote } from "../src/morning-advice.js";
import { painfulExercises } from "../src/strength-generator.js";

// Audit "Kouč jako skutečný trenér" 2026-11-07, point 7: one rule for pain,
// without the words that only contain it.
test("pain and injury in Czech and English", () => {
  for (const text of ["Bolí mě koleno při dřepech", "koleno me boli", "Bolelo mě rameno", "Mám bolest zad", "Bolavé lýtko", "Zraněný kotník", "Natažený sval na stehně", "Podvrtnutý kotník", "Výron kotníku", "Nateklé koleno",
    "My knee hurts", "Shoulder pain when pressing", "Knee pains", "Sore lower back", "My back aches", "Aching hip", "Injured ankle", "Sprained wrist", "Strained calf", "Swollen knee", "Pulled hamstring"])
    assert.ok(PAIN_WORDS.test(text), text);
});

test("no pain: negated, past healing words and look-alike words", () => {
  for (const text of ["Koleno už mě nebolí", "Nezraněný", "Boleslav", "Hill repeats on Tuesdays", "I will ride 4x a week", "Still prefer mornings", "Training camp in Spain", "Riding in the cold is fine", "Painting the house at weekends", "Lifestyle: sorry, mornings only", "Constrained by work hours"])
    assert.equal(PAIN_WORDS.test(text), false, text);
});

test("what passes on its own: pain, illness, pregnancy; not training habits", () => {
  for (const text of ["Bolí mě koleno", "Jsem nemocný", "Jsem nachlazený", "Mám chřipku", "I'm ill", "I have a cold", "I'm sick", "Down with the flu", "Jsem těhotná", "I'm pregnant"])
    assert.ok(PASSING_WORDS.test(text), text);
  for (const text of ["I will ride 4x a week", "Hill repeats on Tuesdays", "Training camp in Spain", "Riding in the cold", "a cold wind on Sundays", "Still prefer mornings", "Koleno už nebolí", "Fluent in Czech"])
    assert.equal(PASSING_WORDS.test(text), false, text);
});

test("Today's verdict and the gym plan see no pain in a healed knee or Spain", () => {
  assert.equal(injuryNote(["Koleno už mě nebolí", "Training camp in Spain"]), null);
  assert.equal(injuryNote(["Bolí mě koleno"]), "Bolí mě koleno");
  assert.equal(painfulExercises(["Koleno už mě nebolí"]).avoid.size, 0);
  assert.ok(painfulExercises(["Bolí mě koleno"]).avoid.size > 0);
});
