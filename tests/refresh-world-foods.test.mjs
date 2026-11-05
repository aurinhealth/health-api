import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { buildRows } from '../scripts/build-world-foods.mjs';
import { offKey, offRow, rowOf, versionRecords, refresh, checkCounts, smoke } from '../scripts/refresh-world-foods.mjs';
import { searchWorldFoods, WORLD_FOODS_FORMAT } from '../src/world-foods.js';

const food = (id, catalog_key, source_id, default_name, extra = {}) => ({
  id, catalog_key, source_id, default_name, cs: null, en: null, brand: null, barcode: null, basis_unit: 'g',
  kcal: 100, protein: 5, carbs: 10, fat: 2, fiber: null, sugars: null, salt: null, quantity: null, serving_size: null, cz: 0, ...extra
});
const product = (code, name, extra = {}) => ({
  code, lang: 'cs', names: [{ lang: 'main', text: name }], brands: 'Olma', quantity: '150 g', serving_size: null, unit: 'g', cz: true,
  n: [{ k: 'energy-kcal', v: 62 }, { k: 'proteins', v: 4.2 }, { k: 'carbohydrates', v: 5.1 }, { k: 'fat', v: 3 }], ...extra
});

function bucketFrom(dir, version) {
  return {
    async get(key, options = {}) {
      let data;
      if (key === 'current.json') data = Buffer.from(JSON.stringify({ format: WORLD_FOODS_FORMAT, version }));
      else { try { data = readFileSync(join(dir, key)); } catch { return null; } }
      if (options.range) data = data.subarray(options.range.offset, options.range.offset + options.range.length);
      return { body: new Blob([data]).stream(), json: async () => JSON.parse(data.toString('utf8')) };
    }
  };
}

const fixture = await (async () => {
  const dir = mkdtempSync(join(tmpdir(), 'refresh-foods-'));
  const previous = [
    // A generic food whose Czech name is its default name (rank 1 kept).
    food(1, 'fineli:11', 'fineli', 'Jogurt bílý', { cs: 'Jogurt bílý' }),
    food(2, 'usda_sr_legacy:170', 'usda_sr_legacy', 'Yogurt, plain, whole milk', { cs: 'Jogurt bílý plnotučný' }),
    food(3, 'gtin:00012345678905', 'usda_branded', 'GREEK YOGURT', { barcode: '012345678905', brand: 'Fage' }),
    food(4, 'gtin:08594001234567', 'off', 'Bílý jogurt', { barcode: '8594001234567', cz: 1, kcal: 70 }),
    food(5, 'gtin:03046920022651', 'off', 'Noir Intense', { barcode: '3046920022651', cs: 'Hořká čokoláda Intense', en: 'Dark chocolate Intense' }),
    food(6, 'gtin:04000000000001', 'off', 'Deleted product', { barcode: '4000000000001' }),
    food(7, 'cofid:1', 'cofid', 'Yogurt, Greek style', { en: 'Yogurt, Greek style' })
  ];
  const sources = [{ id: 'off', title: 'Open Food Facts contributors' }, { id: 'fineli', title: 'Fineli' }, { id: 'usda_sr_legacy', title: 'USDA SR' },
    { id: 'usda_branded', title: 'USDA Branded' }, { id: 'cofid', title: 'CoFID' }];
  buildRows(previous, sources, dir, { log: () => {}, version: 'v1' });
  const off = [
    product('8594001234567', 'Bílý jogurt'),
    { ...product('3046920022651', 'Noir Intense'), lang: 'fr', cz: false, brands: 'Lindt, Lindt & Sprüngli' },
    product('012345678905', 'Greek yogurt from OFF'),
    product('8594009999999', 'Nový tvaroh', { n: [{ k: 'energy', v: 418.4 }, { k: 'proteins', v: 12 }, { k: 'carbohydrates', v: 4 }, { k: 'fat', v: 0.5 }, { k: 'salt', v: 0.1 }] }),
    product('08594009999999', 'Duplicate of the new curd'),
    product('8590000000002', 'Broken values', { n: [{ k: 'energy-kcal', v: 4000 }, { k: 'proteins', v: 1 }, { k: 'carbohydrates', v: 1 }, { k: 'fat', v: 1 }] }),
    product('8590000000003', 'No values', { n: [] }),
    { ...product('5449000000996', 'Coca-Cola'), lang: 'en', unit: 'ml', cz: false, names: [{ lang: 'main', text: 'Coca-Cola' }, { lang: 'en', text: 'Coca-Cola' }] }
  ];
  const offFile = join(dir, 'off.ndjson.gz');
  writeFileSync(offFile, gzipSync(off.map(p => JSON.stringify(p)).join('\n')));
  const result = await refresh({ previousDir: join(dir, 'v1'), offFile, out: dir, version: 'v2', offDate: '2026-11-03', log: () => {} });
  return { dir, result, env: { FOOD_CATALOG_R2: bucketFrom(dir, 'v2') } };
})();
test.after(() => rmSync(fixture.dir, { recursive: true, force: true }));

const all = () => new Map([...versionRecords(join(fixture.dir, 'v2'))].map(r => [r.k, r]));

test('OFF codes become the same keys as in the kCalori release', () => {
  assert.equal(offKey('8594001234567'), 'gtin:08594001234567');
  assert.equal(offKey('17'), 'gtin:00000000000017');
  assert.equal(offKey('ab-12'), 'off:ab-12');
  assert.equal(offKey('123456789012345'), null);
  assert.equal(offKey('a b'), null);
});

test('an exported product needs a name and plausible values', () => {
  const row = offRow(product('8594001234567', '  Bílý   jogurt '));
  assert.equal(row.default_name, 'Bílý jogurt');
  assert.equal(row.cs, 'Bílý jogurt');
  assert.equal(row.cz, 1);
  assert.equal(offRow(product('1', '', {})), null);
  assert.equal(offRow(product('1', 'Too much', { n: [{ k: 'energy-kcal', v: 100 }, { k: 'proteins', v: 60 }, { k: 'carbohydrates', v: 60 }, { k: 'fat', v: 1 }] })), null);
  assert.equal(offRow({ ...product('1', 'Kj only'), n: [{ k: 'energy', v: 418.4 }, { k: 'proteins', v: 1 }, { k: 'carbohydrates', v: 1 }, { k: 'fat', v: 1 }] }).kcal, 100);
});

test('other sources are carried over with their names and rank', () => {
  const r = all();
  assert.equal(r.get('fineli:11').r, 1);
  assert.equal(r.get('usda_sr_legacy:170').cs, 'Jogurt bílý plnotučný');
  assert.equal(r.get('cofid:1').s, 'cofid');
  // A barcode USDA Branded already holds stays with it.
  assert.equal(r.get('gtin:00012345678905').s, 'usda_branded');
  assert.equal(r.get('gtin:00012345678905').n, 'GREEK YOGURT');
});

test('OFF products follow the export: new values, new products, deleted ones gone', async () => {
  const r = all();
  assert.equal(r.get('gtin:08594001234567').e, 62);
  assert.equal(r.get('gtin:08594009999999').n, 'Nový tvaroh');
  assert.equal(r.get('gtin:08594009999999').e, 100);
  assert.equal(r.has('gtin:04000000000001'), false);
  assert.equal(r.has('gtin:08590000000002'), false);
  assert.equal(r.get('gtin:05449000000996').u, 'ml');
  // Czech and English names the export lacks stay from the previous version.
  assert.equal(r.get('gtin:03046920022651').cs, 'Hořká čokoláda Intense');
  assert.equal(r.get('gtin:03046920022651').br, 'Lindt, Lindt & Sprüngli');
  const { stats, meta } = fixture.result;
  assert.equal(stats.off_duplicate, 1);
  assert.equal(stats.off_behind_other_source, 1);
  assert.equal(stats.names_kept, 1);
  assert.equal(meta.sources.find(s => s.id === 'off').version, '2026-11-03');
  assert.deepEqual(meta.sources.map(s => s.id).sort(), ['cofid', 'fineli', 'off', 'usda_branded', 'usda_sr_legacy']);
  const [found] = await searchWorldFoods(fixture.env, { barcode: '8594009999999', language: 'cs' });
  assert.equal(found.name, 'Nový tvaroh');
  const [generic] = await searchWorldFoods(fixture.env, { name: 'jogurt bily', language: 'cs' });
  assert.ok(generic);
});

test('a much smaller version is refused', () => {
  const prev = { foods: 1000, barcodes: 800, czech_market: 100, by_source: { off: 700, fineli: 200, usda_branded: 100 } };
  // The kCalori release counted foods that share a key or were never stored: fewer carried is fine.
  assert.deepEqual(checkCounts(prev, { foods: 1000, barcodes: 800, czech_market: 100, by_source: { off: 710, fineli: 200, usda_branded: 90 } }, { fineli: 200, usda_branded: 90 }), []);
  const problems = checkCounts(prev, { foods: 500, barcodes: 400, czech_market: 10, by_source: { fineli: 150 } }, { fineli: 200, usda_branded: 50 });
  assert.deepEqual(problems.map(p => p.split(':')[0]), ['foods', 'barcodes', 'czech_market', 'fineli', 'usda_branded', 'other sources', 'no Open Food Facts products']);
  assert.deepEqual(fixture.result.problems.filter(p => !/^(foods|barcodes|czech_market)/.test(p)), []);
});

test('the live version cannot be rebuilt in place', async () => {
  await assert.rejects(refresh({ previousDir: join(fixture.dir, 'v1'), offFile: join(fixture.dir, 'off.ndjson.gz'), out: fixture.dir, version: 'v1', log: () => {} }), /live one/);
});

test('the new version passes its own lookups, and a pull request builds from the export alone', async () => {
  assert.deepEqual(fixture.result.problems, []);
  const alone = await refresh({ previousDir: 'none', offFile: join(fixture.dir, 'off.ndjson.gz'), out: fixture.dir, version: 'v3', log: () => {} });
  assert.deepEqual(alone.problems, []);
  assert.deepEqual(Object.keys(alone.meta.counts.by_source), ['off']);
  assert.deepEqual(await smoke(join(fixture.dir, 'v3'), 'v3', [{ barcode: '4000000000001', catalog_key: 'gtin:04000000000001' }]), ['barcode 4000000000001 (gtin:04000000000001) not found']);
});

test('a carried record keeps every field', () => {
  const r = { k: 'gtin:1', n: 'A', cs: 'B', br: 'C', b: '1', u: 'ml', e: 1, p: 2, c: 3, f: 4, fi: 5, su: 6, sa: 7, q: '1 l', ss: '250 ml', s: 'usda_branded', cz: 1, r: 0 };
  const row = rowOf(r);
  assert.equal(row.rank, 0);
  assert.equal(row.basis_unit, 'ml');
  assert.equal(row.fiber, 5);
});
