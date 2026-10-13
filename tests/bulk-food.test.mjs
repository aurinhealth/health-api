import assert from "node:assert/strict";
import test from "node:test";
import { createD1 } from "./helpers/d1.mjs";
import { scopedDb } from "../src/tenancy.js";
import { saveAppleFood } from "../src/apple-food.js";
import { addFluid, listFluids, bulkFluids } from "../src/fluids.js";
import { bulkFoodEntries } from "../src/food-entry-management.js";

const diary = raw => raw.sqlite.exec("CREATE TABLE IF NOT EXISTS food_logs (user_id INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT, consumed_date TEXT NOT NULL, consumed_at TEXT, cookbook_page INTEGER, recipe_title TEXT, servings REAL NOT NULL DEFAULT (1), kcal REAL NOT NULL DEFAULT (0), protein_g REAL NOT NULL DEFAULT (0), carbs_g REAL NOT NULL DEFAULT (0), fat_g REAL NOT NULL DEFAULT (0), fiber_g REAL NOT NULL DEFAULT (0), source TEXT NOT NULL DEFAULT ('manual'), note TEXT, created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), status TEXT)");
const add = (raw, title, note = { mealType: "breakfast" }) => raw.sqlite.prepare("INSERT INTO food_logs (user_id,consumed_date,consumed_at,recipe_title,kcal,note) VALUES (7,'2026-10-13','2026-10-13T08:00:00',?,100,?)").run(title, JSON.stringify(note)).lastInsertRowid;

test("several foods are moved, copied and deleted at once; another app's food is copied as one's own, never moved", async () => {
  const raw = createD1(), db = scopedDb(raw, 7);
  diary(raw);
  const a = Number(add(raw, "Kaše")), b = Number(add(raw, "Banán"));
  await saveAppleFood(raw, 7, { from: "2026-10-13", to: "2026-10-13", meals: [{ id: "Y1", date: "2026-10-13", time: "08:10", name: "Jogurt", app: "Yazio", kcal: 150 }] });
  const y = (await raw.prepare("SELECT id FROM food_logs WHERE source='apple-health'").first()).id;

  const moved = await bulkFoodEntries(db, { action: "move", ids: [a, b, y], date: "2026-10-14", mealType: "snack_am" });
  assert.deepEqual(moved.skipped, [y]);
  const rows = (await raw.prepare("SELECT id,consumed_date,consumed_at,note FROM food_logs WHERE id IN (?,?) ORDER BY id").bind(a, b).all()).results;
  assert.deepEqual(rows.map(r => [r.consumed_date, JSON.parse(r.note).mealType]), [["2026-10-14", "snack_am"], ["2026-10-14", "snack_am"]]);
  assert.equal(rows[0].consumed_at.slice(0, 10), "2026-10-14");

  await bulkFoodEntries(db, { action: "copy", ids: [y], date: "2026-10-15", mealType: "lunch" });
  const copy = await raw.prepare("SELECT source,note FROM food_logs WHERE consumed_date='2026-10-15'").first();
  assert.equal(copy.source, "manual");
  assert.equal(JSON.parse(copy.note).mealType, "lunch");
  assert.equal(JSON.parse(copy.note).app, undefined);

  await bulkFoodEntries(db, { action: "delete", ids: [a, b, y] });
  assert.equal((await raw.prepare("SELECT COUNT(*) AS n FROM food_logs WHERE consumed_date IN ('2026-10-13','2026-10-14')").first()).n, 0);
  await assert.rejects(bulkFoodEntries(db, { action: "delete", ids: [] }));
});

test("several drinks are moved, copied and deleted at once, keeping their clock", async () => {
  const raw = createD1(), db = scopedDb(raw, 7);
  const one = await addFluid(db, { date: "2026-10-13", ml: 250, kind: "water", at: "2026-10-13T07:10" });
  const two = await addFluid(db, { date: "2026-10-13", ml: 200, kind: "coffee", at: "2026-10-13T07:40" });
  await bulkFluids(db, { action: "copy", ids: [one.id], date: "2026-10-14" });
  assert.deepEqual((await listFluids(db, "2026-10-14")).map(d => [d.ml, d.consumedAt]), [[250, "2026-10-14T07:10"]]);
  await bulkFluids(db, { action: "move", ids: [two.id], date: "2026-10-12" });
  assert.equal((await listFluids(db, "2026-10-12")).length, 1);
  await bulkFluids(db, { action: "delete", ids: [one.id] });
  assert.equal((await listFluids(db, "2026-10-13")).length, 0);
  await assert.rejects(bulkFluids(db, { action: "move", ids: [one.id] }));
});
