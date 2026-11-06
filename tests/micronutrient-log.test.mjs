import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanMicros, scaleMicros, entryNutrients, buildNutrients, buildNutrientDetail, cleanFavorites, nutrientCoach } from '../src/micronutrients.js';
import { foodIntake } from '../src/food-portions.js';
import { productFromLabel } from '../src/food-sources.js';

const chicken = { name: 'Kuřecí prsa', calories_100g: 120, protein_100g: 22.5, carbs_100g: 0, fat_100g: 2.6, nutrition_basis: 'g', catalog_key: 'usda_sr_legacy:171077', micros_100g: { fe: 0.37, b12: 0.21, k: 334, bogus: 5, zn: -1 } };
const entry = (title, fiber, note) => ({ recipe_title: title, fiber_g: fiber, note: JSON.stringify(note) });

test('only known, plausible nutrients are kept and scaled', () => {
  assert.deepEqual(cleanMicros(chicken.micros_100g), { fe: 0.37, b12: 0.21, k: 334 });
  assert.deepEqual(scaleMicros(chicken.micros_100g, 2), { fe: 0.74, b12: 0.42, k: 668 });
  assert.equal(cleanMicros('x'), null);
});

test('a logged amount carries its vitamins and minerals', () => {
  const p = productFromLabel(chicken);
  assert.equal(p.catalog_key, 'usda_sr_legacy:171077');
  assert.deepEqual(foodIntake(p, 200, 'g').micros, { fe: 0.74, b12: 0.42, k: 668 });
  assert.equal(foodIntake({ ...p, micros_100g: undefined }, 200, 'g').micros, null);
});

test('free accounts see fibre, sugar and salt; the rest is locked', () => {
  const food = { entries: [entry('Kuře', 1, { sugar_g: 2, salt_g: 0.5, micros: { fe: 3 } }), entry('Jablko', 3, { sugar_g: 10 })] };
  const free = buildNutrients({ days: [{ date: '2026-10-15', food }], pro: false, kcalTarget: 2000, language: 'cs' });
  const by = k => free.items.find(i => i.key === k);
  assert.equal(by('fiber').eaten, 4); assert.equal(by('fiber').target, 28);
  assert.equal(by('sugar').eaten, 12); assert.equal(by('sugar').limit, true);
  assert.equal(by('fe').locked, true); assert.equal(by('fe').eaten, null);
  assert.equal(free.coach, null);
  const pro = buildNutrients({ days: [{ date: '2026-10-15', food }], pro: true, profile: { sex: 'female' }, language: 'cs' });
  const fe = pro.items.find(i => i.key === 'fe');
  assert.deepEqual([fe.eaten, fe.target, fe.percent, fe.known], [3, 16, 19, true]);
  assert.equal(pro.items.find(i => i.key === 'vitd').known, false);
  assert.equal(pro.withMicros, 1); assert.equal(pro.meals, 2);
});

test('seven days are averaged and the coach names what is lowest', () => {
  const day = { entries: [entry('Kuře', 1, { micros: { fe: 4, vitd: 1, vitc: 100 } })] };
  const r = buildNutrients({ days: Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-0${i + 1}`, food: day })), pro: true, language: 'cs' });
  assert.equal(r.items.find(i => i.key === 'fe').eaten, 4);
  assert.equal(r.coach, 'Celý týden máš málo vitamínu D a železa. Přidej tučné ryby nebo vejce.');
  assert.equal(nutrientCoach(r.items, { days: 1 }, 'en'), 'Today you have had little vitamin D and iron. Add oily fish or eggs.');
});

test('a nutrient detail lists today’s meals and rich foods', () => {
  const today = { entries: [entry('Ovesné vločky', 5, { micros: { fe: 3.1 } }), entry('Kuře', 0, { micros: { fe: 1.4 } }), entry('Jablko', 2, {})] };
  const d = buildNutrientDetail({ key: 'fe', today, week: [{ food: today }, { food: { entries: [] } }], profile: { sex: 'male' }, rich: [{ n: 'Lentils', cs: 'Čočka', v: 3.3 }], language: 'cs' });
  assert.equal(d.eaten, 4.5); assert.equal(d.target, 11);
  assert.equal(d.weekPercent, 41, 'the day with nothing logged is not averaged in'); assert.equal(d.weekDays, 1);
  assert.deepEqual(d.sources.map(s => s.name), ['Ovesné vločky', 'Kuře']);
  assert.deepEqual(d.rich, [{ name: 'Čočka', per100: 3.3 }]);
  assert.equal(buildNutrientDetail({ key: 'nope', today }), null);
});

test('at most three known favourites', () => {
  assert.deepEqual(cleanFavorites(['fe', 'fe', 'x', 'vitd', 'salt', 'ca']), ['fe', 'vitd', 'salt']);
  assert.deepEqual(entryNutrients({ fiber_g: null, note: '{' }), {});
});

// Audit 13.1: oat porridge with fibre, a bar without a fibre value, a meal typed by hand.
test('a meal without a fibre value is not counted as 0 g of fibre', () => {
  const food = { entries: [entry('Ovesná kaše', 8, { sugar_g: 10 }), entry('Proteinová tyčinka', 0, { fiber_unknown: true }), entry('Ručně', 0, { fiber_unknown: true })] };
  const r = buildNutrients({ days: [{ date: '2026-10-15', food }], pro: false, kcalTarget: 2500, language: 'cs' });
  const by = k => r.items.find(i => i.key === k);
  assert.deepEqual([by('fiber').eaten, by('fiber').count, r.meals], [8, 1, 3]);
  assert.deepEqual([by('sugar').count, by('salt').count, by('salt').known], [1, 0, false]);
  assert.deepEqual(entryNutrients(entry('x', 0, { fiber_unknown: true })), {});
  // Logged before the flag: 0 g stays a known 0 (old rows are left as they are).
  assert.deepEqual(entryNutrients(entry('x', 0, {})), { fiber: 0 });
});

// Audit 13.2: four meals, only the apple has vitamin and mineral values.
test('the coach says nothing about vitamins when under half the meals have values', () => {
  const plain = entry('Chléb', 2, {}), apple = entry('Jablko', 3, { micros: { fe: 0.1, ca: 6, vitc: 5 } });
  const few = buildNutrients({ days: [{ date: '2026-10-15', food: { entries: [apple, plain, plain, plain] } }], pro: true, language: 'cs' });
  assert.equal(few.withMicros, 1); assert.equal(few.coach, null);
  assert.equal(few.items.find(i => i.key === 'vitd').known, false);
  const half = buildNutrients({ days: [{ date: '2026-10-15', food: { entries: [apple, apple, plain, plain] } }], pro: true, language: 'cs' });
  assert.equal(half.coach, 'Dnes máš v jídlech s údaji málo vápníku a železa. Přidej mléčné výrobky nebo mák.');
  const halfEn = buildNutrients({ days: [{ date: '2026-10-15', food: { entries: [apple, apple, plain, plain] } }], pro: true, language: 'en' });
  assert.equal(halfEn.coach, 'Today you have had little calcium and iron in the meals with values. Add dairy or poppy seeds.');
});

// Audit 13.3: logged on 2 days of 7, 20 g fibre and 10 mg iron each day.
test('the 7-day average is over the days something was logged on', () => {
  const logged = { entries: [entry('Jídlo', 20, { micros: { fe: 10 } })] }, none = { entries: [] };
  const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-0${i + 1}`, food: i < 2 ? logged : none }));
  const r = buildNutrients({ days, pro: true, kcalTarget: 2500, profile: { sex: 'male' }, language: 'cs' });
  const by = k => r.items.find(i => i.key === k);
  assert.equal(r.loggedDays, 2);
  assert.deepEqual([by('fiber').eaten, by('fe').eaten, by('fe').percent], [20, 10, 91]);
  assert.equal(r.coach, null, 'iron at 91 % is not low');
  const d = buildNutrientDetail({ key: 'fe', today: logged, week: days, profile: { sex: 'male' }, language: 'cs' });
  assert.deepEqual([d.weekPercent, d.weekDays], [91, 2]);
  // Low on the logged days: the coach says so, not "all week".
  const lowDays = days.map((d, i) => i < 2 ? { ...d, food: { entries: [entry('Jídlo', 20, { micros: { fe: 2, vitc: 100 } })] } } : d);
  assert.equal(buildNutrients({ days: lowDays, pro: true, profile: { sex: 'male' }, language: 'cs' }).coach, 'V zapsaných dnech máš málo železa. Přidej luštěniny, červené maso nebo ryby.');
});
