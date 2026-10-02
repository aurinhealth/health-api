// Turns the NutriDatabaze.cz export ("Výběr z NutriDatabaze.cz", registered
// users only) into SQL for the nutridatabaze_foods table in D1. Nutrients are
// copied, never generated. The export and the SQL stay on your machine: the
// licence forbids passing the data file on, and this repository is public.
//
//   node scripts/import-nutridatabaze.mjs <export.xlsx|.csv> [--version 11.26] [--out file.sql]
//   npx --yes wrangler@4 d1 execute health-data --remote --file=<file.sql>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';

const fold=value=>String(value??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const round=value=>value==null?null:Math.round(value*100)/100;

// EuroFIR values: "tr" (trace) and "<x" (below the limit) count as 0, "-" or empty is unknown.
export function nutrientValue(value){
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 const s=String(value??'').trim().replace(/\s/g,'').replace(',','.');
 if(!s||/^[-–—]$|^n\.?a\.?$/i.test(s))return null;
 if(/^(tr|stopy)$/i.test(s)||/^<\d/.test(s))return 0;
 const n=Number(s);return Number.isFinite(n)?n:null;
}

function decodeText(buffer){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer).replace(/^﻿/,'');}
 catch{return new TextDecoder('windows-1250').decode(buffer);}
}

export function parseCsv(text){
 const lines=text.split(/\r?\n/).filter(Boolean).slice(0,5).join('\n');
 const delimiter=[';','\t',','].map(d=>[d,lines.split(d).length]).sort((a,b)=>b[1]-a[1])[0][0];
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;continue;}
  if(c==='"')quoted=true;else if(c===delimiter){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}
 return rows;
}

// Minimal XLSX reader: the first worksheet's cell values, without dependencies.
function unzip(buffer){
 let end=buffer.length-22;while(end>=0&&buffer.readUInt32LE(end)!==0x06054b50)end--;
 if(end<0)throw new Error('Not a ZIP/XLSX file');
 const files=new Map();let p=buffer.readUInt32LE(end+16);
 for(let i=0,count=buffer.readUInt16LE(end+10);i<count;i++){
  const method=buffer.readUInt16LE(p+10),size=buffer.readUInt32LE(p+20),nameLength=buffer.readUInt16LE(p+28),extra=buffer.readUInt16LE(p+30),comment=buffer.readUInt16LE(p+32),offset=buffer.readUInt32LE(p+42);
  const name=buffer.toString('utf8',p+46,p+46+nameLength);
  const start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28),data=buffer.subarray(start,start+size);
  files.set(name,()=>(method===8?inflateRawSync(data):data).toString('utf8'));
  p+=46+nameLength+extra+comment;
 }
 return files;
}
const xmlText=s=>s.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&');
export function parseXlsx(buffer){
 const files=unzip(buffer),read=name=>files.get(name)?.();
 const strings=[...(read('xl/sharedStrings.xml')||'').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')));
 const rid=(read('xl/workbook.xml')||'').match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
 const target=rid&&(read('xl/_rels/workbook.xml.rels')||'').match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
  ||(read('xl/_rels/workbook.xml.rels')||'').match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
 const sheet=read(target?('xl/'+target.replace(/^\/?xl\//,'').replace(/^\//,'')):'xl/worksheets/sheet1.xml')||read('xl/worksheets/sheet1.xml');
 if(!sheet)throw new Error('The XLSX file has no worksheet');
 const rows=[];
 for(const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
  const row=[];
  for(const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
   const col=[...(c[1].match(/\br="([A-Z]+)\d+"/)?.[1]||'')].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1,type=c[1].match(/\bt="([^"]+)"/)?.[1],body=c[2]||'';
   const v=body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
   row[col<0?row.length:col]=type==='s'?strings[Number(v)]:type==='inlineStr'?xmlText(body):v==null?'':type==='str'?xmlText(v):Number(v);
  }
  rows.push(Array.from(row,cell=>cell??''));
 }
 return rows;
}

export function readTable(buffer,fileName=''){
 return /\.xlsx$/i.test(fileName)||buffer.readUInt32LE(0)===0x04034b50?parseXlsx(buffer):parseCsv(decodeText(buffer));
}

// Columns are found by EuroFIR code first ([CHO] = available carbohydrates,
// [CHOT] = total), then by the Czech name. Conversion factors are never nutrients.
const COLUMNS={
 code:l=>/\bkod potraviny\b|\bfcdb\b|\bfood code\b|^kod$/.test(l)&&!/eurofir/.test(l),
 name:l=>/^nazev potraviny$|^nazev$|nazev.*(cesk|cest|cz\b)/.test(l)&&!/angl|engl|latin/.test(l),
 name_en:l=>/nazev.*(angl|engl)|english/.test(l),
 edible:l=>/jedl[yi] podil|edible/.test(l),
 protein:l=>/\[prot\]|\bbilkovin/.test(l),
 fat:l=>/\[fat\]|^tuky\b|\btuky celk/.test(l)&&!/mastn/.test(l),
 carbs:l=>/\[cho\]|vyuziteln/.test(l),
 carbs_total:l=>/\[chot\]|sacharidy celk|^celkove$/.test(l),
 fiber:l=>/\[fibt\]|vlaknin/.test(l),
 salt:l=>/\[nacl\]|\bsul\b/.test(l),
 sodium:l=>/\[na\]|\bsodik/.test(l),
};
const isFactor=l=>/faktor|factor|koeficient/.test(l);

export function parseNutridatabaze(rows,{version}={}){
 rows=rows.map(r=>r.map(c=>typeof c==='string'?c.trim():c));
 const score=row=>row.filter(c=>{const l=fold(c);return Object.entries(COLUMNS).some(([k,m])=>k!=='code'&&k!=='edible'&&m(l)&&!isFactor(l))||/\benerc\b|energ/.test(l);}).length;
 const headerRow=rows.findIndex(r=>score(r)>=3);
 if(headerRow<0)throw new Error('No header row with nutrient columns (energy, protein, fat, carbohydrates) was found');
 let dataStart=headerRow+1;while(dataStart<rows.length&&rows[dataStart].filter(c=>nutrientValue(c)!=null).length<3)dataStart++;
 version=version||rows.slice(0,dataStart).flat().map(c=>String(c).match(/\bv(?:erze|ersion)?\s*(\d+\.\d+)\b/i)?.[1]).find(Boolean);
 if(!version)throw new Error('The database version is not in the file: pass --version, e.g. --version 11.26');
 // Multi-row headers: merged cells are empty after their first column.
 const width=Math.max(...rows.slice(headerRow,dataStart+1).map(r=>r.length));
 const labels=Array.from({length:width},()=>[]);
 for(let i=headerRow;i<dataStart;i++){let last='';for(let c=0;c<width;c++){let v=String(rows[i][c]??'');if(!v&&i<dataStart-1)v=last;else last=v;if(v)labels[c].push(v);}}
 const folded=labels.map(parts=>fold(parts.join(' ')));
 const used=new Set(),find=key=>{const i=folded.findIndex((l,c)=>!used.has(c)&&(key==='edible'||!isFactor(l))&&COLUMNS[key](l));if(i>=0)used.add(i);return i<0?null:i;};
 const col={};for(const key of Object.keys(COLUMNS))col[key]=find(key);
 if(col.code==null)col.code=folded.findIndex(l=>/^kod\b/.test(l)&&!/eurofir/.test(l));
 for(const key of ['code','name','protein','fat'])if(col[key]==null||col[key]<0)throw new Error(`Column not found: ${key}`);
 if(col.carbs==null&&col.carbs_total==null)throw new Error('Column not found: carbohydrates');
 const data=rows.slice(dataStart).filter(r=>String(r[col.code]??'').trim()&&String(r[col.name]??'').trim());
 const value=(r,key)=>col[key]==null?null:nutrientValue(r[col[key]]);
 const carbsOf=r=>value(r,'carbs')??(value(r,'carbs_total')!=null&&value(r,'fiber')!=null?Math.max(0,value(r,'carbs_total')-value(r,'fiber')):null);
 // kJ or kcal is told by the values: kcal is close to 4·P + 4·C + 9·F + 2·fibre.
 // An empty label right after the energy column is its merged kJ/kcal twin.
 const isEnergy=l=>/\benerc\b|energ/.test(l);
 const energy=folded.map((l,c)=>({l,c})).filter(({l,c})=>!used.has(c)&&(isEnergy(l)||!l&&c>0&&isEnergy(folded[c-1]))).map(({l,c})=>{
  const ratios=data.map(r=>{const e=nutrientValue(r[c]),est=4*(value(r,'protein')??0)+4*(carbsOf(r)??0)+9*(value(r,'fat')??0)+2*(value(r,'fiber')??0);return e!=null&&est>=20?e/est:null;}).filter(x=>x!=null).sort((a,b)=>a-b);
  const median=ratios[Math.floor(ratios.length/2)];
  return {c,unit:median>=.7&&median<=1.4?'kcal':median>=3&&median<=5.5?'kJ':/kcal/.test(l)&&!/kj/.test(l)?'kcal':null};
 }).filter(e=>e.unit).sort((a,b)=>(a.unit==='kcal'?0:1)-(b.unit==='kcal'?0:1))[0];
 if(!energy)throw new Error('No energy column in kcal or kJ was found');
 const foods=[],skipped=[],seen=new Set();let mismatched=0;
 for(const r of data){
  const code=String(r[col.code]).trim(),name=String(r[col.name]).trim(),raw=nutrientValue(r[energy.c]);
  const food={code,name,name_en:col.name_en==null?null:String(r[col.name_en]||'').trim()||null,edible_portion:value(r,'edible'),
   calories_100g:raw==null?null:round(energy.unit==='kJ'?raw/4.184:raw),protein_100g:round(value(r,'protein')),carbs_100g:round(carbsOf(r)),fat_100g:round(value(r,'fat')),
   fiber_100g:round(value(r,'fiber')),salt_100g:round(value(r,'salt')??(value(r,'sodium')==null?null:value(r,'sodium')*2.5/1000)),version};
  const bad=['calories_100g','protein_100g','carbs_100g','fat_100g'].find(k=>food[k]==null||food[k]<0||food[k]>(k==='calories_100g'?950:100));
  if(bad||seen.has(code)){skipped.push({code,name,reason:bad?`missing or invalid ${bad}`:'duplicate code'});continue;}
  seen.add(code);
  const est=4*food.protein_100g+4*food.carbs_100g+9*food.fat_100g+2*(food.fiber_100g??0);
  if(Math.abs(food.calories_100g-est)>Math.max(35,food.calories_100g*.35))mismatched++;
  foods.push(food);
 }
 return {version,energyUnit:energy.unit,foods,skipped,mismatched};
}

const sqlValue=v=>v==null?'NULL':typeof v==='number'?String(v):`'${String(v).replace(/'/g,"''")}'`;
export function toSql(foods,version){
 const columns=['code','name','name_en','edible_portion','calories_100g','protein_100g','carbs_100g','fat_100g','fiber_100g','salt_100g','version'];
 const update=columns.filter(c=>c!=='code').map(c=>`${c}=excluded.${c}`).join(',');
 // Upsert, then drop older rows: the table is never empty while the file runs.
 return foods.map(f=>`INSERT INTO nutridatabaze_foods(${columns.join(',')}) VALUES(${columns.map(c=>sqlValue(f[c])).join(',')}) ON CONFLICT(code) DO UPDATE SET ${update},updated_at=CURRENT_TIMESTAMP;`)
  .concat(`DELETE FROM nutridatabaze_foods WHERE version<>${sqlValue(version)};`).join('\n')+'\n';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args.splice(i,2)[1];};
 const versionArg=option('--version'),outArg=option('--out'),file=args[0];
 if(!file){console.error('Usage: node scripts/import-nutridatabaze.mjs <export.xlsx|.csv> [--version 11.26] [--out file.sql]');process.exit(1);}
 const result=parseNutridatabaze(readTable(readFileSync(file),file),{version:versionArg});
 if(!result.foods.length){console.error('No foods were read from the file.');process.exit(1);}
 const out=resolve(outArg||new URL(`../data/private/nutridatabaze-${result.version}.sql`,import.meta.url).pathname);
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,toSql(result.foods,result.version));
 console.log(JSON.stringify({version:result.version,energy:result.energyUnit,imported:result.foods.length,skipped:result.skipped.length,energyMismatch:result.mismatched,firstSkipped:result.skipped.slice(0,10),sql:out},null,1));
 console.log(`\nNahrání do produkce:\n  npx --yes wrangler@4 d1 execute health-data --remote --file="${out}"`);
}
