import test from 'node:test';
import assert from 'node:assert/strict';
import { photoResultFromAnswer, readFoodPhotoWithAI, validFoodImage, FOOD_PHOTO_SCHEMA } from '../src/food-photo.js';
import { parseNutritionLabel } from '../src/food-label.js';

const IMAGE = 'data:image/jpeg;base64,' + Buffer.from('jpeg').toString('base64');
const answer = extra => ({ kind: 'label', name: 'Skyr', basis: '100g', serving_size: '150 g', calories: 63, protein_g: 11, carbs_g: 4, fat_g: 0.2, fiber_g: null, salt_g: 0.1, confidence: 'high', note: '', ...extra });

test('a label read by AI becomes editor values and text the label parser reads the same', () => {
  const r = photoResultFromAnswer(JSON.stringify(answer()), 'label');
  assert.equal(r.basis, '100g');
  assert.deepEqual(r.values, { calories_100g: 63, protein_100g: 11, carbs_100g: 4, fat_100g: 0.2, salt_100g: 0.1 });
  assert.deepEqual(parseNutritionLabel(r.text), r.values);
  assert.equal(r.warning, null);
});

test('portion mode, meal estimates and nonsense are handled safely', () => {
  const meal = photoResultFromAnswer(answer({ kind: 'meal_photo', basis: 'portion', calories: 720, protein_g: 45, carbs_g: 80, fat_g: 22, confidence: 'high' }), 'portion');
  assert.equal(meal.basis, 'portion');
  assert.equal(meal.confidence, 'medium');
  assert.doesNotMatch(meal.text, /100 g/);
  assert.equal(photoResultFromAnswer(answer({ kind: 'unreadable' })), null);
  assert.equal(photoResultFromAnswer(answer({ protein_g: 140 }), 'label'), null);
  assert.equal(photoResultFromAnswer(answer({ calories: null, protein_g: null, carbs_g: null, fat_g: null })), null);
  assert.match(photoResultFromAnswer(answer({ calories: 630 }), 'label').warning, /nesedí/);
});

test('only small data-URL images are sent, with the image and the schema', async () => {
  assert.equal(validFoodImage('https://example.com/a.jpg'), false);
  assert.equal(validFoodImage(IMAGE), true);
  const original = globalThis.fetch;let sent;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ model: 'm', output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer()) }] }] }), { status: 200 }); };
  try {
    const r = await readFoodPhotoWithAI({ OPENAI_API_KEY: 'k' }, { image: IMAGE, mode: 'label' });
    assert.equal(r.result.name, 'Skyr');
    assert.equal(sent.text.format.name, FOOD_PHOTO_SCHEMA.name);
    assert.equal(sent.input[0].content[1].type, 'input_image');
    assert.equal(sent.input[0].content[1].image_url, IMAGE);
    await assert.rejects(readFoodPhotoWithAI({ OPENAI_API_KEY: 'k' }, { image: 'data:text/html;base64,AA==' }), /JPG/);
  } finally { globalThis.fetch = original; }
});

test('barcode digits read by AI count only with a valid check digit', async () => {
  const { validBarcode, readBarcodeWithAI } = await import('../src/food-photo.js');
  assert.equal(validBarcode('8594001170012'), true);
  assert.equal(validBarcode('8594001170013'), false);
  assert.equal(validBarcode('5000159461122'), true);
  assert.equal(validBarcode('96385074'), true);
  const original = globalThis.fetch;
  const reply = digits => async () => new Response(JSON.stringify({ model: 'm', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ found: true, digits }) }] }] }), { status: 200 });
  try {
    globalThis.fetch = reply('8594 0011 70012');
    assert.equal((await readBarcodeWithAI({ OPENAI_API_KEY: 'k' }, { image: IMAGE })).barcode, '8594001170012');
    globalThis.fetch = reply('8594001170019');
    assert.equal((await readBarcodeWithAI({ OPENAI_API_KEY: 'k' }, { image: IMAGE })).barcode, null);
  } finally { globalThis.fetch = original; }
});
