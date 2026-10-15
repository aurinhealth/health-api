import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../scripts/build-world-foods.mjs';
import { plan } from '../scripts/upload-world-foods.mjs';
import { searchWorldFoods, barcodeKey, words, NODE_LIMIT, WORLD_FOODS_FORMAT } from '../src/world-foods.js';

// A small release in the kCalori schema (only the columns the build reads).
function release(dir) {
  const path = join(dir, 'foods.sqlite'), db = new DatabaseSync(path);
  db.exec(`CREATE TABLE sources(id TEXT PRIMARY KEY,title TEXT,url TEXT,license TEXT,license_url TEXT,version TEXT,release_allowed INTEGER NOT NULL);
    CREATE TABLE foods(id INTEGER PRIMARY KEY,catalog_key TEXT,barcode TEXT,source_id TEXT,default_name TEXT,default_lang TEXT,brand TEXT,basis_unit TEXT,
      kcal REAL,protein REAL,carbs REAL,fat REAL,fiber REAL,sugars REAL,salt REAL,quantity TEXT,serving_size TEXT,search_enabled INTEGER DEFAULT 1);
    CREATE TABLE food_names(id INTEGER PRIMARY KEY,food_id INTEGER,lang TEXT,name TEXT,is_primary INTEGER DEFAULT 0);
    CREATE TABLE food_markets(food_id INTEGER,country_tag TEXT);
    INSERT INTO sources VALUES('off','Open Food Facts contributors','https://world.openfoodfacts.org/','ODbL-1.0','',NULL,1),
      ('fineli','THL, Fineli','','CC-BY-4.0','',NULL,1),('legacy','Uploaded','','mixed','',NULL,1),('nutridatabaze','ÚZEI','','pending','',NULL,0);`);
  const food = db.prepare('INSERT INTO foods(id,catalog_key,barcode,source_id,default_name,default_lang,brand,basis_unit,kcal,protein,carbs,fat,fiber,sugars,salt,quantity,serving_size,search_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const name = db.prepare('INSERT INTO food_names(food_id,lang,name) VALUES(?,?,?)');
  const market = db.prepare('INSERT INTO food_markets VALUES(?,?)');
  food.run(1, 'gtin:08594001234567', '8594001234567', 'off', 'Bílý jogurt', 'cs', 'Olma', 'g', 62, 4.2, 5.1, 3, null, 5.1, 0.12, '150 g', '150 g', 1);
  market.run(1, 'en:czech-republic');
  food.run(2, 'gtin:03046920022651', '3046920022651', 'off', 'Noir Intense', 'fr', 'Lindt', 'g', 566, 9.5, 35, 41, 12.2, 30, 0.02, '100 g', '10 g', 1);
  name.run(2, 'cs', 'Hořká čokoláda Intense'); name.run(2, 'en', 'Dark chocolate Intense');
  food.run(3, 'gtin:05449000000996', '5449000000996', 'off', 'Coca-Cola', 'en', 'Coca-Cola', 'ml', 42, 0, 10.6, 0, null, 10.6, 0, '330 ml', '330 ml', 1);
  food.run(4, 'fineli:1', null, 'fineli', 'Yoghurt, natural', 'en', null, 'g', 60, 4, 5, 3, 0, 5, 0.1, null, null, 1);
  food.run(5, 'legacy:1', '8590000000001', 'legacy', 'Jogurt legacy', 'cs', null, 'g', 50, 1, 1, 1, null, null, null, null, null, 1);
  food.run(6, 'gtin:00000000000017', '17', 'off', 'Yogurt without values', 'en', null, 'g', null, null, null, null, null, null, null, null, null, 1);
  // More foods than one index node holds, so "cho" splits by the next letter.
  db.exec('BEGIN');
  for (let i = 0; i < NODE_LIMIT + 300; i++) food.run(100 + i, 'off:c' + i, null, 'off', (i % 2 ? 'Chocapic ' : 'Chorizo ') + i, 'fr', null, 'g', 400, 10, 50, 10, null, null, null, null, null, 1);
  db.exec('COMMIT');
  db.close();
  return path;
}

// R2 from the built files, with ranged reads.
function bucketFrom(dir, version) {
  let reads = 0;
  const bucket = {
    get reads() { return reads; },
    async get(key, options = {}) {
      reads++;
      let data;
      if (key === 'current.json') data = Buffer.from(JSON.stringify({ format: WORLD_FOODS_FORMAT, version }));
      else { try { data = readFileSync(join(dir, key)); } catch { return null; } }
      if (options.range) data = data.subarray(options.range.offset, options.range.offset + options.range.length);
      return { body: new Blob([data]).stream(), json: async () => JSON.parse(data.toString('utf8')) };
    }
  };
  return bucket;
}

const fixture = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'world-foods-'));
  const { meta } = build(release(dir), dir, { log: () => {}, version: 'test1' });
  return { dir, meta, env: { FOOD_CATALOG_R2: bucketFrom(dir, 'test1') } };
})();
test.after(() => rmSync(fixture.dir, { recursive: true, force: true }));

test('a barcode is found in one bucket read, in any length of the code', async () => {
  const [p] = await searchWorldFoods(fixture.env, { barcode: '8594001234567', language: 'cs' });
  assert.equal(p.name, 'Bílý jogurt');
  assert.equal(p.calories_100g, 62);
  assert.equal(p.source, 'catalog');
  assert.equal(p.source_name, 'Open Food Facts');
  assert.match(p.source_url, /openfoodfacts\.org\/product\/8594001234567/);
  const [cola] = await searchWorldFoods(fixture.env, { barcode: '05449000000996' });
  assert.equal(cola.nutrition_basis, 'ml');
  assert.deepEqual(await searchWorldFoods(fixture.env, { barcode: '4000000000000' }), []);
});

test('the name follows the app language, falling back to English and the original', async () => {
  const [cs] = await searchWorldFoods(fixture.env, { name: 'čokoláda', language: 'cs' });
  assert.equal(cs.name, 'Hořká čokoláda Intense');
  const [en] = await searchWorldFoods(fixture.env, { name: 'chocolate', language: 'en' });
  assert.equal(en.name, 'Dark chocolate Intense');
  const [brand] = await searchWorldFoods(fixture.env, { name: 'lindt noir', language: 'en' });
  assert.equal(brand.brand, 'Lindt');
});

test('foods sold in Czechia come first and every query word must match', async () => {
  const hits = await searchWorldFoods(fixture.env, { name: 'jogurt', language: 'cs' });
  assert.deepEqual(hits.map(p => p.name), ['Bílý jogurt']);
  const yog = await searchWorldFoods(fixture.env, { name: 'yoghurt natural', language: 'en' });
  assert.deepEqual(yog.map(p => p.name), ['Yoghurt, natural']);
  assert.deepEqual(await searchWorldFoods(fixture.env, { name: 'jogurt cokolada' }), []);
});

test('sources without a licence to pass data on and foods without values are left out', async () => {
  assert.deepEqual(await searchWorldFoods(fixture.env, { barcode: '8590000000001' }), []);
  assert.deepEqual(await searchWorldFoods(fixture.env, { barcode: '17' }), []);
  assert.deepEqual(fixture.meta.sources.map(s => s.id).sort(), ['fineli', 'off']);
  assert.equal(fixture.meta.counts.by_source.legacy, undefined);
});

test('a crowded word is split into smaller nodes and still finds every food', async () => {
  const manifest = JSON.parse(readFileSync(join(fixture.dir, 'test1', 'names', 'c.json'), 'utf8'));
  assert.equal(manifest.cho[3], 0, 'cho holds only the best ranked');
  assert.equal(manifest.choc[3], 1);
  assert.equal(manifest.chor[3], 1);
  const hits = await searchWorldFoods(fixture.env, { name: 'chorizo 1798', language: 'cs' });
  assert.deepEqual(hits.map(p => p.name), ['Chorizo 1798']);
  assert.equal((await searchWorldFoods(fixture.env, { name: 'cho' })).length, 12);
});

test('short queries, no bucket and an unknown format return nothing', async () => {
  assert.deepEqual(await searchWorldFoods(fixture.env, { name: 'jo' }), []);
  assert.deepEqual(await searchWorldFoods({}, { name: 'jogurt' }), []);
  const stale = { FOOD_CATALOG_R2: { get: async key => key === 'current.json' ? { json: async () => ({ format: 99, version: 'x' }) } : null } };
  assert.deepEqual(await searchWorldFoods(stale, { name: 'jogurt-format' }), []);
});

test('the upload sends every file and the version switch last', () => {
  const { version, files } = plan(join(fixture.dir, 'test1'));
  assert.equal(version, 'test1');
  const names = files.map(([f]) => f);
  assert.ok(names.includes('barcodes-0.pack') && names.includes('names-0.pack') && names.includes('names/c.json'));
  assert.equal(names.at(-1), 'meta.json');
});

test('codes and words fold like the release', () => {
  assert.equal(barcodeKey('859-4001234567'), '08594001234567');
  assert.equal(barcodeKey('123'), null);
  assert.deepEqual(words('Hořká čokoláda 70% a'), ['horka', 'cokolada', '70']);
});

test('typing more of the same word reads the catalogue node once', async () => {
  const env = { FOOD_CATALOG_R2: bucketFrom(fixture.dir, 'test1') };
  await searchWorldFoods(env, { name: 'jog', language: 'cs' });
  const after = env.FOOD_CATALOG_R2.reads;
  const [p] = await searchWorldFoods(env, { name: 'jogurt', language: 'cs' });
  assert.equal(p.name, 'Bílý jogurt');
  assert.equal(env.FOOD_CATALOG_R2.reads, after);
});
