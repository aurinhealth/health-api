import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { hydrationTarget, addFluid, listFluids, deleteFluid, dayActivityHours, drinkFromFoodEntry, foodDrinks } from "../src/fluids.js";

test("drink target: 30 ml/kg plus 0.5 l per training hour, rounded and bounded", () => {
  assert.deepEqual(hydrationTarget({ weightKg: 81.4, trainingHours: 2 }), { ml: 3400, baseMl: 2400, exerciseMl: 1000, weightKg: 81.4, trainingHours: 2, walkHours: 0 });
  assert.equal(hydrationTarget({ sex: "female" }).ml, 1600);
  assert.equal(hydrationTarget({ sex: "male" }).ml, 2000);
  assert.equal(hydrationTarget({ weightKg: 45 }).ml, 1500); // never under 1.5 l
  assert.equal(hydrationTarget({ weightKg: 80, walkHours: 1 }).ml, 2700);
  assert.equal(hydrationTarget({ weightKg: 120, trainingHours: 8 }).ml, 6000); // capped
});

test("drinks are stored per user and day, and can be deleted", async () => {
  const raw = createD1(), db = scopedDb(raw, 7), other = scopedDb(raw, 8);
  const a = await addFluid(db, { date: "2026-10-03", ml: 250, kind: "coffee", at: "2026-10-03T08:05" });
  await addFluid(db, { date: "2026-10-03", ml: 500 });
  await addFluid(other, { date: "2026-10-03", ml: 900 });
  assert.deepEqual((await listFluids(db, "2026-10-03")).map(e => [e.consumedAt, e.ml, e.kind]), [["2026-10-03T08:05", 250, "coffee"], ["2026-10-03T12:00", 500, "water"]]);
  await deleteFluid(db, a.id);
  assert.equal((await listFluids(db, "2026-10-03")).length, 1);
  await assert.rejects(addFluid(db, { date: "2026-10-03", ml: 5000 }), /10–3000 ml/);
  await assert.rejects(addFluid(db, { date: "zítra", ml: 200 }), /datum/);
});

test("training hours count done sessions, or the plan when more is planned", async () => {
  const raw = createD1();
  raw.sqlite.exec(`CREATE TABLE health_datapoints (id INTEGER PRIMARY KEY, user_id INTEGER, source_family TEXT, data_type TEXT, external_id TEXT, start_time TEXT, end_time TEXT, sample_time TEXT, value_numeric REAL, payload_json TEXT, record_role TEXT);`);
  const ins = raw.sqlite.prepare("INSERT INTO health_datapoints (user_id, source_family, data_type, start_time, end_time, payload_json) VALUES (7, ?, ?, ?, ?, ?)");
  ins.run("intervals", "activity", "2026-10-03T14:00:00", null, JSON.stringify({ type: "Ride", moving_time: 5400 }));
  ins.run("google-wearables", "exercise", "2026-10-03T06:10:00Z", "2026-10-03T07:10:00Z", JSON.stringify({ exercise: { exerciseType: "WALKING", activeDuration: "3600s" } }));
  ins.run("intervals", "planned-workout", "2026-10-03T00:00:00", null, JSON.stringify({ name: "Endurance", moving_time: 14400 }));
  const db = scopedDb(raw, 7);
  assert.deepEqual(await dayActivityHours(db, 7, "2026-10-03"), { trainingHours: 4, walkHours: 1 });
});

test("the dashboard has the day overview with drinks, compact meals and quick logging", () => {
  const client = readFileSync(new URL("../src/dashboard-client.js", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /url\.pathname==='\/app\/api\/fluids'/);
  assert.match(entry, /url\.pathname==='\/app\/api\/food\/recipes'&&request\.method==='GET'/);
  assert.match(client, /<h3>Denní přehled<\/h3>/);
  assert.doesNotMatch(client, /Dnešní palivo/);
  assert.match(client, /function wheelColumn\(items,index,onPick\)/);
  assert.match(client, /reader\.decodeFromConstraints\(\{video:\{facingMode:\{ideal:'environment'\}\},audio:false\},video,/);
  // An unknown barcode goes to AI straight away.
  assert.match(client, /searchFood=async function\(\)\{await search\(\);if\(\$\('foodBarcode'\)\.value\.trim\(\)&&!foodCandidates\.length&&\$\('foodAiLookup'\)\)await lookupFoodAi\(\);\}/);
  // The meal select knows both snacks, so "+" on a snack selects it.
  assert.match(client, /meal\.innerHTML=mealSlots\.map\(s=>'<option value="'\+s\.id\+'">'/);
  assert.match(client, /await saveFoodEntry\(\{preventDefault\(\)\{\}\}\)/);
  // Logging lives in a panel that "+" on a meal opens; a saved meal closes it.
  assert.match(client, /function startMealLog\(slot\)\{openFoodLogger\(slot\);\}/);
  assert.match(client, /\$\('foodPanelBody'\)\.append\(entry\);/);
  assert.match(client, /if\(\(mealEntries\|\|\[\]\)\.length>before\)\{closeFoodLogger\(\);/);
  // "Co dál dnes?" replaces the energy-by-meal chart.
  assert.match(client, /chart\.classList\.add\('replaced'\);chart\.after\(next\);/);
});

test("drinks logged as food count automatically; alcohol and foods in grams do not", async () => {
  const note = o => JSON.stringify(o);
  assert.equal(drinkFromFoodEntry({ id: 1, consumed_at: "2026-10-03T15:00:00", recipe_title: "Monster Energy", note: note({ amount: 500, unit: "ml" }) }).ml, 500);
  // "Přidat" logs a meal of one or more ingredients; the ml ones are drinks.
  const meal = drinkFromFoodEntry({ id: 2, recipe_title: "Snídaně", note: note({ amount: 1, unit: "portion", ingredients: [{ name: "Káva s mlékem", amount: 250, unit: "ml" }, { name: "Rohlík", amount: 43, unit: "g" }] }) });
  assert.equal(meal.ml, 250);
  const beer = drinkFromFoodEntry({ id: 3, recipe_title: "Pivo Plzeň", note: note({ amount: 500, unit: "ml" }) });
  assert.deepEqual([beer.ml, beer.alcohol, beer.totalMl], [0, true, 500]);
  assert.equal(drinkFromFoodEntry({ id: 4, recipe_title: "Jogurt", note: note({ amount: 150, unit: "g" }) }), null);

  const raw = createD1();
  raw.sqlite.exec("CREATE TABLE food_logs (id INTEGER PRIMARY KEY, user_id INTEGER, consumed_date TEXT, consumed_at TEXT, recipe_title TEXT, note TEXT)");
  raw.sqlite.prepare("INSERT INTO food_logs (user_id, consumed_date, consumed_at, recipe_title, note) VALUES (7, '2026-10-03', '2026-10-03T15:00:00', 'Monster Energy', ?)").run(note({ amount: 500, unit: "ml" }));
  raw.sqlite.prepare("INSERT INTO food_logs (user_id, consumed_date, consumed_at, recipe_title, note) VALUES (8, '2026-10-03', '2026-10-03T15:00:00', 'Cola', ?)").run(note({ amount: 330, unit: "ml" }));
  const drinks = await foodDrinks(scopedDb(raw, 7), 7, "2026-10-03");
  assert.deepEqual(drinks.map(d => [d.name, d.ml, d.kind]), [["Monster Energy", 500, "food"]]);
});
