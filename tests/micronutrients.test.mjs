import test from 'node:test';
import assert from 'node:assert/strict';
import { convert, number, round3, parseCsv, parseUsda, parseFineli, parseCiqual, parseCofid, sharedStrings, sheetRows, compute, normName } from '../scripts/build-micronutrients.mjs';
import { MATCHES, matchFood, nameMatches, macrosAgree } from '../scripts/micronutrient-matches.mjs';
import { microShard, microsFor, MICROS_FORMAT } from '../src/world-foods.js';

test('numbers, units and rounding', () => {
  assert.equal(number('1,25'), 1.25);
  assert.equal(number(' 0.4 '), 0.4);
  assert.equal(number('(0.4)'), 0.4);
  for (const v of ['Tr', 'N', '-', '< 0,5', 'traces', '', null]) assert.equal(number(v), null);
  assert.equal(convert(1, 'MG', 'ug'), 1000);
  assert.equal(convert(250, 'µg', 'mg'), 0.25);
  assert.equal(convert(2, 'mcg', 'ug'), 2);
  assert.ok(Math.abs(convert(418.4, 'kJ', 'kcal') - 100) < 1e-9);
  assert.equal(convert(10, 'IU', 'ug'), null);
  assert.equal(convert(10, 'kcal', 'g'), null);
  assert.equal(round3(1.23456), 1.23);
  assert.equal(round3(1234.5), 1230);
  assert.equal(round3(0.000123456), 0.000123);
  assert.equal(round3(0), 0);
});

test('CSV with quotes, quoted separators and newlines', () => {
  const rows = [];
  parseCsv('"a","b,c"\n1,"x ""y""\nz"\r\n2,\n', ',', r => rows.push(r));
  assert.deepEqual(rows, [['a', 'b,c'], ['1', 'x "y"\nz'], ['2', '']]);
});

test('USDA: nutrient numbers to keys, DFE folate preferred, other data types ignored', () => {
  const nutrient = '"id","name","unit_name","nutrient_nbr","rank"\n"1089","Iron, Fe","MG","303","1"\n"1103","Selenium, Se","UG","317","1"\n"1177","Folate, total","UG","417","1"\n"1190","Folate, DFE","UG","435","1"\n"1003","Protein","G","203","1"\n"1008","Energy","KCAL","208","1"\n"1104","Vitamin A, IU","IU","318","1"';
  const food = '"fdc_id","data_type","description","food_category_id","publication_date"\n"171077","sr_legacy_food","Chicken, broilers or fryers, breast, meat only, raw","5","2019-04-01"\n"9","branded_food","Something","1","2019"';
  const foodNutrient = '"id","fdc_id","nutrient_id","amount"\n"1","171077","1177","4"\n"2","171077","1190","5"\n"3","171077","1089","0.37"\n"4","171077","1103","22.8"\n"5","171077","1003","22.5"\n"6","171077","1104","30"\n"7","9","1089","9"';
  const foods = parseUsda({ food, nutrient, foodNutrient }, ['sr_legacy_food']);
  assert.equal(foods.size, 1);
  const f = foods.get('171077');
  assert.equal(f.name, 'Chicken, broilers or fryers, breast, meat only, raw');
  assert.deepEqual(f.v, { fol: 5, fe: 0.37, se: 22.8 });
  assert.deepEqual(f.m, { pro: 22.5 });
});

test('Fineli: decimal comma, units from component.csv, kJ to kcal', () => {
  const component = 'EUFDNAME;COMPUNIT;CMPCLASS;CMPCLASSP\nFE;MG;MINERAL;MINERAL\nVITD;UG;VITAM;VITAM\nFASAT;G;FAT;FAT\nENERC;KJ;ENERGY;ENERGY\nPROT;G;MACROCMP;MACROCMP';
  const componentValue = 'FOODID;EUFDNAME;BESTLOC;ACQTYPE;METHTYPE;METHIND\n1;FE;1,2;A;A;A\n1;VITD;0,5;A;A;A\n1;FASAT;3;A;A;A\n1;ENERC;418,4;A;A;A\n1;PROT;20;A;A;A\n1;NA;400;A;A;A';
  const foods = parseFineli({ component, componentValue, foodNames: 'FOODID;FOODNAME;LANG\n1;Salmon, farmed;EN' });
  const f = foods.get('1');
  assert.equal(f.name, 'Salmon, farmed');
  assert.deepEqual(f.v, { fe: 1.2, vitd: 0.5, sfa: 3 });
  assert.equal(Math.round(f.m.kcal), 100);
});

test('Ciqual: constituents by name and unit, traces left out, retinol equivalents', () => {
  const constants = `<?xml version="1.0" encoding="windows-1252"?><TABLE>
    <CONST><const_code> 10260 </const_code><const_nom_fr>Fer</const_nom_fr><const_nom_eng>Iron (mg/100 g)</const_nom_eng></CONST>
    <CONST><const_code> 10340 </const_code><const_nom_eng>Selenium (µg/100 g)</const_nom_eng></CONST>
    <CONST><const_code> 51200 </const_code><const_nom_eng>Retinol (µg/100 g)</const_nom_eng></CONST>
    <CONST><const_code> 51330 </const_code><const_nom_eng>Beta-carotene (µg/100 g)</const_nom_eng></CONST>
    <CONST><const_code> 56920 </const_code><const_nom_eng>Vitamin B12 (µg/100 g)</const_nom_eng></CONST></TABLE>`;
  const alim = '<TABLE><ALIM><alim_code> 20034 </alim_code><alim_nom_fr>Épinard, cru</alim_nom_fr><alim_nom_eng>Spinach, raw</alim_nom_eng></ALIM></TABLE>';
  const compo = `<TABLE><COMPO><alim_code> 20034 </alim_code><const_code> 10260 </const_code><teneur> 2,14 </teneur><min/><max/></COMPO>
    <COMPO><alim_code> 20034 </alim_code><const_code> 10340 </const_code><teneur> traces </teneur></COMPO>
    <COMPO><alim_code> 20034 </alim_code><const_code> 56920 </const_code><teneur> &lt; 0,1 </teneur></COMPO>
    <COMPO><alim_code> 20034 </alim_code><const_code> 51200 </const_code><teneur> 0 </teneur></COMPO>
    <COMPO><alim_code> 20034 </alim_code><const_code> 51330 </const_code><teneur> 3600 </teneur></COMPO></TABLE>`;
  const f = parseCiqual({ alim, compo, constants }).get('20034');
  assert.equal(f.name, 'Spinach, raw');
  assert.deepEqual(f.v, { fe: 2.14, vita: 600 });
});

test('CoFID: header row found, columns by name, Tr and N left out', () => {
  const sheets = [
    { name: '1.3 Proximates', rows: [['Food Code', 'Food Name', 'Protein (g)', 'Fat (g)', 'Cholesterol (mg)', 'Satd FA /100g fd (g)'], ['13-145', 'Lentils, red, dried', '23.8', '1.3', '0', '0.2']] },
    { name: '1.4 Inorganics', rows: [['Food Code', 'Food Name', 'Iron (mg)', 'Selenium (µg)', 'Iodine (µg)'], ['', '', '', '', ''], ['13-145', 'Lentils, red, dried', '7.6', 'Tr', 'N']] },
    { name: '1.5 Vitamins', rows: [['Food Code', 'Food Name', 'Retinol Equivalent (µg)', 'Niacin (mg)', 'Niacin equivalent (mg)', 'Folate (µg)'], ['13-145', 'Lentils, red, dried', '(3)', '2.0', '6.0', '35']] }
  ];
  const f = parseCofid(sheets).get('13-145');
  assert.equal(f.name, 'Lentils, red, dried');
  assert.deepEqual(f.v, { chol: 0, sfa: 0.2, fe: 7.6, vita: 3, b3: 2, fol: 35 });
  assert.deepEqual(f.m, { pro: 23.8, fat: 1.3 });
});

test('xlsx sheet cells: shared strings, inline strings, gaps', () => {
  const strings = sharedStrings('<sst><si><t>Food Code</t></si><si><r><t>Iron </t></r><r><t xml:space="preserve">(mg)</t></r></si></sst>');
  assert.deepEqual(strings, ['Food Code', 'Iron (mg)']);
  const rows = sheetRows('<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>13-145</t></is></c><c r="B2" s="1"/><c r="C2"><v>7.6</v></c></row></sheetData>', strings);
  assert.deepEqual([rows[0][0], rows[0][1], rows[0][2]], ['Food Code', undefined, 'Iron (mg)']);
  assert.deepEqual(rows[1], ['13-145', '', '7.6']);
});

test('the shard of a key is FNV-1a mod 256, three digits', () => {
  // FNV-1a 32-bit of "a" is 0xe40c292c.
  assert.equal(microShard('a'), String(0xe40c292c % 256).padStart(3, '0'));
  assert.equal(microShard(''), String(0x811c9dc5 % 256).padStart(3, '0'));
  assert.match(microShard('usda_sr_legacy:171077'), /^\d{3}$/);
  const seen = new Set(); for (let i = 0; i < 5000; i++) seen.add(microShard('off:' + i));
  assert.equal(seen.size, 256);
});

const BREAST = { k: 'usda_sr_legacy:171077', e: 120, p: 22.5, c: 0, f: 2.62, v: { fe: 0.37 } };
const MILK = { k: 'cofid:12-345', e: 46, p: 3.4, c: 4.7, f: 1.7, v: { ca: 120 } };
const refOf = (src, desc) => desc === 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw' ? BREAST
  : desc === 'Milk, semi-skimmed, pasteurised, average' ? MILK : null;

test('matcher: raw chicken breast is estimated, breaded and smoked are not', () => {
  const raw = { k: 'gtin:1', cs: 'Kuřecí prsní řízky chlazené', n: 'Kuřecí prsní řízky', e: 110, p: 23, c: 0, f: 1.5 };
  const m = matchFood(raw, refOf);
  assert.equal(m.entry.id, 'chicken_breast');
  assert.equal(m.ref, BREAST);
  assert.equal(matchFood({ k: 'off:2', en: 'Chicken breast fillets', e: 115, p: 24, c: 0.5, f: 2 }, refOf).entry.id, 'chicken_breast');
  for (const name of ['Kuřecí prsa v trojobalu', 'Uzená kuřecí prsa', 'Breaded chicken breast', 'Smoked chicken breast', 'Kuřecí prsa marinovaná', 'Kuřecí šunka z prsou', 'Kuřecí prsa s bylinkami'])
    assert.equal(nameMatches({ cs: name, e: 110, p: 23, c: 0, f: 1.5 }).some(e => e.id === 'chicken_breast'), false, name);
  assert.equal(nameMatches({ cs: 'Kuřecí stehenní řízky' }).some(e => e.id === 'chicken_breast'), false);
});

test('matcher: macros must agree with the reference', () => {
  assert.equal(macrosAgree({ e: 120, p: 22.5, c: 0, f: 2.6 }, BREAST), true);
  const cooked = { cs: 'Kuřecí prsa', e: 165, p: 31, c: 0, f: 3.6 };
  assert.deepEqual(matchFood(cooked, refOf).reason, 'macros');
  const fatty = { cs: 'Kuřecí prsa', e: 130, p: 22, c: 0, f: 6 };
  assert.equal(matchFood(fatty, refOf).ref, undefined);
  assert.equal(macrosAgree({ e: 130, p: 22, c: 0, f: 2 }, BREAST), true, 'kcal within 20 %');
  assert.equal(macrosAgree({ e: 150, p: 22, c: 0, f: 2 }, BREAST), false, 'kcal over 20 %');
  assert.equal(macrosAgree({ e: 120, p: 22, c: null, f: 2 }, BREAST), false, 'unknown carbs');
});

test('matcher: liquids only map to liquid references', () => {
  const milk = { cs: 'Mléko polotučné 1,5 %', u: 'ml', e: 47, p: 3.3, c: 4.8, f: 1.5 };
  assert.equal(matchFood(milk, refOf).entry.id, 'milk');
  const drink = { cs: 'Kuřecí prsa', u: 'ml', e: 120, p: 22.5, c: 0, f: 2.6 };
  assert.equal(matchFood(drink, refOf).reason, 'liquid');
  assert.equal(nameMatches({ cs: 'Ovesné mléko', u: 'ml' }).some(e => e.id === 'milk'), false);
});

test('every match entry has a Czech label, patterns and references', () => {
  const ids = new Set();
  for (const e of MATCHES) {
    assert.ok(!ids.has(e.id), e.id); ids.add(e.id);
    assert.ok(e.cs && e.has.length && e.refs.length, e.id);
  }
  assert.ok(MATCHES.length >= 140, `${MATCHES.length} entries`);
});

test('compute: direct values for table foods, estimates flagged, missing references fail', () => {
  const tables = {
    usda_sr_legacy: new Map([['171077', { name: 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw', v: { fe: 0.37, se: 22.8 }, m: { pro: 22.5, fat: 2.62, carb: 0, kcal: 120 } }]]),
    cofid: new Map([['12-345', { name: 'Milk, semi-skimmed, pasteurised, average', v: { ca: 120.4 }, m: { pro: 3.4, fat: 1.7, carb: 4.7, kcal: 46 } }]])
  };
  const entries = MATCHES.filter(e => e.id === 'chicken_breast' || e.id === 'milk').map(e => ({ ...e, refs: e.refs.filter(([, d]) => refOf(null, d)) }));
  const records = [
    { k: 'usda_sr_legacy:171077', n: 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw', s: 'usda_sr_legacy', e: 120, p: 22.5, c: 0, f: 2.62 },
    { k: 'cofid:12-345', n: 'Milk, semi-skimmed, pasteurised, average', s: 'cofid', e: 46, p: 3.4, c: 4.7, f: 1.7 },
    { k: 'gtin:08590000000001', n: 'Kuřecí prsní řízky', cs: 'Kuřecí prsní řízky', s: 'off', e: 110, p: 23, c: 0, f: 1.5 },
    { k: 'gtin:08590000000001', n: 'Kuřecí prsní řízky', cs: 'Kuřecí prsní řízky', s: 'off', e: 110, p: 23, c: 0, f: 1.5 },
    { k: 'off:9', n: 'Kuřecí prsa v trojobalu', s: 'off', e: 220, p: 15, c: 15, f: 11 },
    { k: 'gtin:08590000000002', n: 'Mléko polotučné', s: 'off', u: 'ml', e: 46, p: 3.4, c: 4.8, f: 1.5 }
  ];
  const { out, counts, top } = compute({ tables, records, entries, log: () => {} });
  assert.deepEqual(out.get('usda_sr_legacy:171077'), { fe: 0.37, se: 22.8 });
  assert.deepEqual(out.get('gtin:08590000000001'), { fe: 0.37, se: 22.8, x: 1 });
  assert.deepEqual(out.get('gtin:08590000000002'), { ca: 120, x: 1 });
  assert.equal(out.has('off:9'), false);
  assert.equal(counts.estimates, 2);
  assert.equal(counts.direct.usda_sr_legacy, 1);
  assert.equal(top.fe[0].k, 'usda_sr_legacy:171077');
  assert.equal(top.fe[0].cs, 'Kuřecí prsa');
  const broken = [{ ...entries[0], refs: [['usda_sr_legacy', 'Chicken, breast, missing']] }];
  assert.throws(() => compute({ tables, records, entries: broken, log: () => {} }), /Missing references[\s\S]*nearest: "chicken, broiler/);
  assert.equal(normName("Pasta, whole-wheat, dry (Includes foods for USDA's Food Distribution Program)"), 'pasta, whole-wheat, dry');
});

test('microsFor reads current.json and only the shards it needs, cached', async () => {
  const keys = ['usda_sr_legacy:171077', 'gtin:08590000000001', 'off:none'];
  const files = { 'micros/current.json': { format: MICROS_FORMAT, version: 'v1' } };
  for (const [k, v] of [[keys[0], { fe: 0.37 }], [keys[1], { fe: 0.37, x: 1 }]]) {
    const f = `micros/v1/${microShard(k)}.json`;
    files[f] = { ...files[f], [k]: v };
  }
  const reads = [];
  const bucket = { async get(key) { reads.push(key); return key in files ? { json: async () => structuredClone(files[key]) } : null; } };
  const env = { FOOD_CATALOG_R2: bucket };
  const got = await microsFor(env, keys);
  assert.deepEqual(Object.fromEntries(got), { [keys[0]]: { fe: 0.37 }, [keys[1]]: { fe: 0.37, x: 1 } });
  assert.equal(reads.length, 1 + new Set(keys.map(microShard)).size);
  await microsFor(env, keys);
  assert.equal(reads.length, 1 + new Set(keys.map(microShard)).size, 'second call served from the isolate cache');
  assert.deepEqual(await microsFor({}, keys), new Map());
  const stale = { FOOD_CATALOG_R2: { get: async () => ({ json: async () => ({ format: 99, version: 'x' }) }) } };
  assert.deepEqual(await microsFor(stale, keys), new Map());
});
