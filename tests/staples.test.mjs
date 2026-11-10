import test from 'node:test';
import assert from 'node:assert/strict';
import { searchStaples, stapleProduct, STAPLES_SHOWN } from '../src/staples.js';
import { STAPLES } from '../src/staples-data.js';
import { searchWorldFoods } from '../src/world-foods.js';

test('every basic food has a key, both names, sane values and a portion name in both languages', () => {
  const keys = new Set();
  for (const r of STAPLES) {
    assert.match(r.k, /^usda_sr_legacy:\d+$/, r.cs);
    assert.ok(r.cs && r.en, r.k);
    keys.add(r.k + r.cs);
    for (const v of [r.e, r.p, r.c, r.f]) assert.ok(v >= 0 && v <= 1000, r.cs);
    assert.ok(r.p + r.c + r.f <= 101, r.cs);
    if (r.s) assert.ok(r.s[0] > 0 && r.s[0] <= 1000 && r.s[1] && r.s[2], r.cs);
  }
  assert.equal(keys.size, STAPLES.length);
  assert.ok(STAPLES.length >= 200);
});

test('a basic food is a product in the app language with its portion', () => {
  const coffee = STAPLES.find(r => r.en === 'Coffee, brewed');
  const cs = stapleProduct(coffee, 'cs'), en = stapleProduct(coffee, 'en');
  assert.equal(cs.name, 'Káva, překapávaná');
  assert.equal(en.name, 'Coffee, brewed');
  assert.equal(cs.nutrition_basis, 'ml');
  assert.equal(cs.serving_size, '237 ml');
  assert.equal(cs.serving_name, 'šálek');
  assert.equal(en.serving_name, 'cup');
  assert.equal(cs.source, 'table');
  assert.equal(cs.catalog_key, coffee.k);
});

test('Czech and English words find it, without diacritics, the own language first', () => {
  assert.equal(searchStaples(['kava'], 'kava', 'cs')[0].name, 'Káva, překapávaná');
  assert.equal(searchStaples(['coffee'], 'coffee', 'cs')[0].name, 'Káva, překapávaná');
  assert.equal(searchStaples(['coffee'], 'coffee', 'en')[0].name, 'Coffee, brewed');
  assert.deepEqual(searchStaples(['ban'], 'ban', 'cs').map(p => p.name), ['Banán']);
  assert.ok(searchStaples(['ryze', 'var'], 'ryze var', 'cs').every(p => /vařená/.test(p.name)));
  assert.ok(searchStaples(['mle'], 'mle', 'cs').length <= STAPLES_SHOWN);
  assert.deepEqual(searchStaples(['jo'], 'jo', 'cs'), []);
  assert.deepEqual(searchStaples(['xyzzy'], 'xyzzy', 'cs'), []);
});

test('search lists the basic foods first, also without the catalogue, and never for a barcode', async () => {
  const [first] = await searchWorldFoods({}, { name: 'banán', language: 'cs' });
  assert.equal(first.name, 'Banán');
  assert.equal(first.serving_name, 'kus');
  assert.deepEqual(await searchWorldFoods({}, { barcode: '8594001234567' }), []);
});
