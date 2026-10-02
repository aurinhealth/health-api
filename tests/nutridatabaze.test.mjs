import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createD1} from './helpers/d1.mjs';
import {parseCsv,parseNutridatabaze,readTable,nutridatabazeSql,importNutridatabaze,nutridatabazeStatus} from '../src/nutridatabaze-import.js';
import {resolveFood,nutridatabazeReference} from '../src/food-sources.js';
import {resetNutridatabazeCache,searchNutridatabaze} from '../src/nutridatabaze.js';

// Values as published on nutridatabaze.cz 11.26 (FCDB ID 0032, 0037, 0360).
const csv=`Výběr z NutriDatabaze.cz v11.26
Kód potraviny;Název potraviny v češtině;Název potraviny v angličtině;Koeficient pro jedlý podíl;Přepočítávací faktor pro bílkoviny;Energie (kJ) [ENERC];Energie (kcal) [ENERC];Tuky [FAT];Nasycené mastné kyseliny [FASAT];Sacharidy celkové [CHOT];Sacharidy využitelné [CHO];Vláknina potravy [FIBT];Bílkoviny [PROT];Sodík [NA];Sůl [NACL]
0032;Banány;Bananas, raw;0,63;6,25;415;98;0,3;0,1;23,9;21,6;2,3;1,1;1;tr
0037;Jablka;Apples, raw;0,9;6,25;219;52;0,4;0,1;12,8;10,5;2,3;0,4;-;
0360;Nektarinky;Nectarines, raw;0,9;6,25;200;48;0,3;0;11;9,3;1,7;1,1;0;0
0999;Bez energie;;1;;-;-;1;;;1;;1;;
`;
const windows1250=text=>Buffer.from([...text].map(c=>({'ý':0xfd,'ě':0xec,'č':0xe8,'í':0xed,'á':0xe1,'é':0xe9,'ů':0xf9,'ž':0x9e,'Ž':0x8e,'Ů':0xd9,'ř':0xf8,'š':0x9a,'ú':0xfa,'ó':0xf3,'ň':0xf2,'ť':0x9d,'ď':0xef,'Č':0xc8,'Ř':0xd8,'Š':0x8a,'Ý':0xdd,'Á':0xc1,'Í':0xcd,'É':0xc9,'Ú':0xda,'Ó':0xd3,'Ě':0xcc,'Ň':0xd2,'Ť':0x8d,'Ď':0xcf})[c]??c.charCodeAt(0)));

async function loadedDb(){
 const db=createD1();db.sqlite.exec(readFileSync(new URL('../migrations/0003_nutridatabaze.sql',import.meta.url),'utf8'));
 await importNutridatabaze(db,new TextEncoder().encode(csv),{fileName:'export.csv'});resetNutridatabazeCache();return db;
}

test('a Czech Excel export (semicolons, decimal commas, windows-1250) is read column by EuroFIR code',async()=>{
 const r=parseNutridatabaze(await readTable(windows1250(csv),'export.csv'));
 assert.equal(r.version,'11.26');assert.equal(r.energyUnit,'kcal');
 assert.deepEqual(r.foods.map(f=>f.name),['Banány','Jablka','Nektarinky']);
 const banana=r.foods[0];
 assert.deepEqual([banana.code,banana.calories_100g,banana.protein_100g,banana.carbs_100g,banana.fat_100g,banana.fiber_100g,banana.salt_100g,banana.edible_portion],['0032',98,1.1,21.6,0.3,2.3,0,0.63]);
 assert.equal(r.foods[1].salt_100g,null,'unknown salt stays unknown');
 assert.deepEqual(r.skipped.map(s=>s.code),['0999']);
});

test('an export with energy only in kJ is converted, and the version can be passed in',()=>{
 const rows=parseCsv(csv).slice(1).map(r=>r.filter((_,i)=>i!==6));
 const r=parseNutridatabaze(rows,{version:'11.26'});
 assert.equal(r.energyUnit,'kJ');assert.equal(r.foods[0].calories_100g,99.19);
 assert.throws(()=>parseNutridatabaze(rows),/verze/);
});

test('NutriDatabaze is the first source for a food searched by name, with its licence citation',async()=>{
 const db=await loadedDb(),old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('offline');};
 try{
  const r=await resolveFood({name:'banán'},{db});
  assert.equal(r.product.source,'nutridatabaze');assert.equal(r.product.name,'Banány');
  assert.equal(r.product.source_url,'https://www.nutridatabaze.cz/potraviny/?id=32');
  assert.equal(r.product.attribution,'Na základě dat z NutriDatabaze.cz, verze 11.26, ÚZEI, Praha');
  assert.ok(r.candidates.some(p=>p.source==='opennutrition'),'reference foods follow');
  assert.equal((await resolveFood({name:'jablko'},{db})).product.name,'Jablka');
  assert.equal((await searchNutridatabaze(db,'monster')).length,0);
 }finally{globalThis.fetch=old;}
});

test('a newer import replaces the older version without emptying the table first',async()=>{
 const db=await loadedDb(),{foods}=parseNutridatabaze(parseCsv(csv));
 await db.batch(nutridatabazeSql(foods.slice(0,1).map(f=>({...f,calories_100g:97})),'12.27').map(sql=>db.prepare(sql)));resetNutridatabazeCache();
 const rows=(await db.prepare('SELECT code,version,calories_100g FROM nutridatabaze_foods').all()).results;
 assert.deepEqual(rows,[{code:'0032',version:'12.27',calories_100g:97}]);
});

test('without the table the other sources still answer',async()=>{
 resetNutridatabazeCache();const db=createD1();
 const r=await resolveFood({name:'ovesné vločky'},{db});assert.equal(r.product.source,'opennutrition');
});

test('the NutriDatabaze search link opens their search form, which ignores a query string',()=>{
 assert.equal(nutridatabazeReference('banán').url,'https://www.nutridatabaze.cz/vyhledavani-potravin/podle-nazvu/');
});

test('an XLSX export with merged two-row headers is read, and the upload reports what it stored',async()=>{
 const db=createD1();db.sqlite.exec(readFileSync(new URL('../migrations/0003_nutridatabaze.sql',import.meta.url),'utf8'));
 assert.deepEqual(await nutridatabazeStatus(db),{count:0,version:null,updated_at:null});
 const r=await importNutridatabaze(db,readFileSync(new URL('./fixtures/nutridatabaze-sample.xlsx',import.meta.url)),{fileName:'export.xlsx'});
 assert.deepEqual([r.version,r.energyUnit,r.imported,r.skipped],['11.26','kcal',3,0]);
 const rows=(await db.prepare('SELECT code,calories_100g,carbs_100g,salt_100g FROM nutridatabaze_foods ORDER BY code').all()).results;
 assert.deepEqual(rows,[{code:'0032',calories_100g:98,carbs_100g:21.6,salt_100g:0},{code:'0360',calories_100g:48,carbs_100g:9.3,salt_100g:0},{code:'37',calories_100g:52,carbs_100g:10.5,salt_100g:null}]);
 assert.equal((await nutridatabazeStatus(db)).count,3);
});

test('a file that is not the export is refused and leaves the stored data alone',async()=>{
 const db=await loadedDb();
 await assert.rejects(importNutridatabaze(db,new TextEncoder().encode('jméno;věk\nPetr;40\n'),{fileName:'jine.csv'}),/názvy sloupců/);
 assert.equal((await nutridatabazeStatus(db)).count,3);
});

test('names with quotes cannot break the generated SQL',async()=>{
 const db=createD1();db.sqlite.exec(readFileSync(new URL('../migrations/0003_nutridatabaze.sql',import.meta.url),'utf8'));
 await db.batch(nutridatabazeSql([{code:"1');DROP TABLE nutridatabaze_foods;--",name:"Rock 'n' roll",calories_100g:1,protein_100g:0,carbs_100g:0,fat_100g:0}],'11.26').map(sql=>db.prepare(sql)));
 assert.equal((await db.prepare('SELECT name FROM nutridatabaze_foods').first()).name,"Rock 'n' roll");
});

// Header row exactly as in the downloaded export (v11.26): bare EuroFIR codes, no title row.
const exportHeader='OrigFdCd;OrigFdNm;EngFdNam;SciNam;EDIBLE;NCF;FACF;ENERC [kJ];ENERC [kcal];FAT [g];FASAT [g];FAMS [g];FAPU [g];FATRN [g];CHOT [g];CHO [g];SUGAR [g];FIBT [g];PROT [g];ASH [g];NA [mg];NACL [g];WATER [g]';
const exportCsv=exportHeader+`
0032;Banány;Bananas, raw;Musa paradisiaca L.;0,63;6,25;0,8;415;98;0,3;0,1;0;0,1;0;23,9;21,6;17;2,3;1,1;0,8;1;tr;73,9
0360;Nektarinky;Nectarines, raw;Prunus persica;0,9;6,25;0,7;200;48;0,3;0;0,1;0,1;0;11;9,3;8;1,7;1,1;0,5;;;87,6
0351;Hamburger (firma McDONALD´S);Hamburger;;1;6,25;0;1050;248;7,4;;;;;32,4;;;;13;;;;44,8
`;
test('the real export header (bare EuroFIR codes, no title row) is read with the version from the form',async()=>{
 const rows=await readTable(new TextEncoder().encode(exportCsv),'NutriDatabaze.csv');
 assert.throws(()=>parseNutridatabaze(rows,{fileName:'NutriDatabaze.csv'}),/verze/);
 assert.throws(()=>parseNutridatabaze(rows,{version:'11.26; DROP'}),/tvar/);
 const r=parseNutridatabaze(rows,{version:'11.26'});
 assert.equal(r.energyUnit,'kcal');
 assert.deepEqual(r.foods[0],{code:'0032',name:'Banány',name_en:'Bananas, raw',edible_portion:0.63,calories_100g:98,protein_100g:1.1,carbs_100g:21.6,fat_100g:0.3,fiber_100g:2.3,salt_100g:0,version:'11.26'});
 assert.equal(r.foods[1].salt_100g,null);
 // Only total carbohydrates listed: used as is, they match the stated energy.
 assert.deepEqual([r.foods[2].carbs_100g,r.foods[2].fiber_100g,r.totalCarbs,r.skipped.length],[32.4,null,1,0]);
 assert.equal(parseNutridatabaze(rows,{fileName:'vyber_NutriDatabaze_v11.26.xlsx'}).version,'11.26');
});
