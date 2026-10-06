import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/dashboard-client.js', import.meta.url), 'utf8');
const context = vm.createContext({ esc: v => String(v ?? '').replace(/</g, '&lt;'), fmt: v => String(Math.round(Number(v))), cz: (v, d) => Number(v).toFixed(d).replace('.', ','), URL });
vm.runInContext(source.slice(source.indexOf('// What the AI found, as a card'), source.indexOf('async function recognizeFoodPhotoSummary(')), context);

test('an AI lookup shows as a card: values, confidence, a clean note and links as source chips', () => {
  const html = vm.runInContext('foodAiCard(' + JSON.stringify({
    name: 'Häagen-Dazs zmrzlina', brand: 'Häagen-Dazs', quantity: '420 ml', confidence: 'medium', nutrition_basis: 'g',
    calories_100g: 285, protein_100g: 5.1, carbs_100g: 24.6, fat_100g: 18.4,
    note: 'Obsahuje pistácie i mandle; ověřte variantu. Nutriční údaje jsou na 100 g. ([nakup.itesco.cz](https://nakup.itesco.cz/p/1))',
    sources: [{ url: 'https://nakup.itesco.cz/p/1', title: 'Tesco' }]
  }) + ')', context);
  assert.match(html, /jistota střední/);
  assert.equal((html.match(/<i class="on">/g) || []).length, 2);
  assert.match(html, /<b>285<\/b><span>kcal/);
  assert.match(html, /<b>5,1<\/b><span>g bílk\./);
  assert.match(html, /⚠ Obsahuje pistácie i mandle; ověřte variantu\.<\/p>/);
  assert.doesNotMatch(html, /\]\(|Nutriční údaje jsou/);
  assert.equal((html.match(/class="fac-sources"><a /g) || []).length, 1);
  assert.equal((html.match(/🔗 nakup\.itesco\.cz ↗/g) || []).length, 1);
});
