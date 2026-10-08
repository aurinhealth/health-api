import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createD1 } from "./helpers/d1.mjs";
import { getCookbook, getCookbookRecipeByPage, useCookbookDatabase, saveCookbook, _resetCookbookForTest } from "../src/cookbook.js";
import { cookbookSql } from "../scripts/import-cookbook.mjs";

const migration = readFileSync(new URL("../migrations/0013_cookbook_and_consents.sql", import.meta.url), "utf8");
const sample = {
  recipes: [
    { page: 7, title: "Lívance", category: "Snídaně", kcal: 500, ingredients: "1 vejce, 'banán'" },
    { page: 13, title: "Kuře s rýží", category: "Oběd", kcal: 640 }
  ],
  page_aliases: { 14: 13 }
};

test("the cookbook is read from the database and pages continue to their recipe", async () => {
  const db = createD1();
  db.sqlite.exec(migration);
  db.sqlite.exec(await cookbookSql(sample));
  _resetCookbookForTest();
  useCookbookDatabase(db);
  const book = await getCookbook();
  assert.deepEqual(book.recipes.map(r => r.title), ["Lívance", "Kuře s rýží"]);
  assert.equal(book.recipes[0].ingredients, "1 vejce, 'banán'");
  assert.equal((await getCookbookRecipeByPage(14)).page_match, "continuation");
  assert.equal((await getCookbookRecipeByPage("7")).title, "Lívance");
  assert.equal(await getCookbookRecipeByPage(99), null);
});

test("without imported recipes the cookbook is empty instead of failing", async () => {
  const empty = createD1();
  empty.sqlite.exec(migration);
  _resetCookbookForTest();
  useCookbookDatabase(empty);
  assert.deepEqual((await getCookbook()).recipes, []);
  _resetCookbookForTest();
  useCookbookDatabase(createD1());
  assert.deepEqual((await getCookbook()).recipes, []);
});

test("importing again replaces the recipes and stays within one D1 statement", async () => {
  const db = createD1();
  db.sqlite.exec(migration);
  db.sqlite.exec(await cookbookSql(sample));
  db.sqlite.exec(await cookbookSql({ recipes: [sample.recipes[0]], page_aliases: {} }));
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM cookbook").get().n, 1);
  _resetCookbookForTest();
  useCookbookDatabase(db);
  assert.deepEqual((await getCookbook()).recipes.map(r => r.title), ["Lívance"]);
  await assert.rejects(cookbookSql({ recipes: [] }));
  const big = { recipes: Array.from({ length: 4000 }, (_, i) => ({ page: i, title: crypto.randomUUID() + crypto.randomUUID() })) };
  await assert.rejects(cookbookSql(big), /100000/);
});

test("the owner's upload is stored and used at once; anything else is refused", async () => {
  const db = createD1();
  db.sqlite.exec(migration);
  _resetCookbookForTest();
  assert.deepEqual(await saveCookbook(db, sample), { recipes: 2 });
  assert.equal((await getCookbookRecipeByPage(14)).title, "Kuře s rýží");
  await assert.rejects(saveCookbook(db, { recipes: [{ page: "x" }] }), /Expected/);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM cookbook").get().n, 1);
  const entry = readFileSync(new URL("../src/entrypoint.js", import.meta.url), "utf8");
  assert.match(entry, /\/app\/api\/admin\/cookbook"[\s\S]{0,120}if \(!user\.isOwner\)/);
});

// The printed book is copyrighted: its recipes must not come back into this public repository.
test("the repository carries no embedded recipe data", () => {
  for (const dir of ["src", "scripts"]) for (const file of readdirSync(new URL(`../${dir}/`, import.meta.url))) {
    const text = readFileSync(new URL(`../${dir}/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /[A-Za-z0-9+/=]{20000}/, `${dir}/${file} holds a large encoded blob`);
    assert.doesNotMatch(text, /Banánové lívance/, `${dir}/${file} holds a recipe from the book`);
  }
});
