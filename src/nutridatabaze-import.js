// Reads the NutriDatabaze.cz export ("Výběr z NutriDatabaze.cz", registered
// users only) and stores it in D1. Runs in the Worker (upload in Settings) and
// in Node (scripts/import-nutridatabaze.mjs). Nutrients are copied, never
// generated. The file itself is never stored: the licence forbids passing it on.

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

// Czech Excel saves CSV in windows-1250; not every runtime's TextDecoder knows it.
const CP1250_HIGH='€�‚�„…†‡�‰Š‹ŚŤŽŹ�‘’“”•–—�™š›śťžź ˇ˘Ł¤Ą¦§¨©Ş«¬­®Ż°±˛ł´µ¶·¸ąş»Ľ˝ľżŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢßŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙';
function decodeText(bytes){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^﻿/,'');}
 catch{let s='';for(const b of bytes)s+=b<0x80?String.fromCharCode(b):CP1250_HIGH[b-0x80];return s;}
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
async function inflateRaw(bytes){
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}
function unzip(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=p=>view.getUint16(p,true),u32=p=>view.getUint32(p,true);
 let end=bytes.length-22;while(end>=0&&u32(end)!==0x06054b50)end--;
 if(end<0)throw new Error('Soubor není XLSX ani CSV.');
 const files=new Map(),utf8=new TextDecoder();let p=u32(end+16);
 for(let i=0,count=u16(end+10);i<count;i++){
  const method=u16(p+10),size=u32(p+20),nameLength=u16(p+28),offset=u32(p+42),name=utf8.decode(bytes.subarray(p+46,p+46+nameLength));
  const start=offset+30+u16(offset+26)+u16(offset+28),data=bytes.subarray(start,start+size);
  files.set(name,async()=>utf8.decode(method===8?await inflateRaw(data):data));
  p+=46+nameLength+u16(p+30)+u16(p+32);
 }
 return files;
}
const xmlText=s=>s.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&');
export async function parseXlsx(bytes){
 const files=unzip(bytes),read=async name=>files.has(name)?files.get(name)():'';
 const strings=[...(await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>xmlText([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')));
 const rid=(await read('xl/workbook.xml')).match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1],rels=await read('xl/_rels/workbook.xml.rels');
 const target=rid&&[...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m=>m[0]).find(r=>r.includes(`Id="${rid}"`))?.match(/Target="([^"]+)"/)?.[1];
 const sheet=(target&&await read('xl/'+target.replace(/^\/?(xl\/)?/,'')))||await read('xl/worksheets/sheet1.xml');
 if(!sheet)throw new Error('V souboru XLSX není žádný list.');
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

export async function readTable(bytes,fileName=''){
 bytes=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const zip=bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&bytes[2]===3&&bytes[3]===4;
 return /\.xlsx$/i.test(fileName)||zip?parseXlsx(bytes):parseCsv(decodeText(bytes));
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
const LABELS={code:'kód potraviny',name:'název potraviny',protein:'bílkoviny',fat:'tuky'};
const isFactor=l=>/faktor|factor|koeficient/.test(l);
const isEnergy=l=>/\benerc\b|energ/.test(l);

export function parseNutridatabaze(rows,{version}={}){
 rows=rows.map(r=>r.map(c=>typeof c==='string'?c.trim():c));
 const score=row=>row.filter(c=>{const l=fold(c);return Object.entries(COLUMNS).some(([k,m])=>k!=='code'&&k!=='edible'&&m(l)&&!isFactor(l))||isEnergy(l);}).length;
 const headerRow=rows.findIndex(r=>score(r)>=3);
 if(headerRow<0)throw new Error('V souboru chybí řádek s názvy sloupců (energie, bílkoviny, tuky, sacharidy).');
 let dataStart=headerRow+1;while(dataStart<rows.length&&rows[dataStart].filter(c=>nutrientValue(c)!=null).length<3)dataStart++;
 version=version||rows.slice(0,dataStart).flat().map(c=>String(c).match(/\bv(?:erze|ersion)?\s*(\d+\.\d+)\b/i)?.[1]).find(Boolean);
 if(!version)throw new Error('V souboru není verze databáze: zadej ji, např. 11.26.');
 // Multi-row headers: merged cells are empty after their first column.
 const width=Math.max(...rows.slice(headerRow,dataStart+1).map(r=>r.length));
 const labels=Array.from({length:width},()=>[]);
 for(let i=headerRow;i<dataStart;i++){let last='';for(let c=0;c<width;c++){let v=String(rows[i][c]??'');if(!v&&i<dataStart-1)v=last;else last=v;if(v)labels[c].push(v);}}
 const folded=labels.map(parts=>fold(parts.join(' ')));
 const used=new Set(),find=key=>{const i=folded.findIndex((l,c)=>!used.has(c)&&(key==='edible'||!isFactor(l))&&COLUMNS[key](l));if(i>=0)used.add(i);return i<0?null:i;};
 const col={};for(const key of Object.keys(COLUMNS))col[key]=find(key);
 if(col.code==null){const i=folded.findIndex(l=>/^kod\b/.test(l)&&!/eurofir/.test(l));col.code=i<0?null:i;}
 for(const key of ['code','name','protein','fat'])if(col[key]==null)throw new Error(`V souboru chybí sloupec: ${LABELS[key]}.`);
 if(col.carbs==null&&col.carbs_total==null)throw new Error('V souboru chybí sloupec: sacharidy.');
 const data=rows.slice(dataStart).filter(r=>String(r[col.code]??'').trim()&&String(r[col.name]??'').trim());
 const value=(r,key)=>col[key]==null?null:nutrientValue(r[col[key]]);
 const carbsOf=r=>value(r,'carbs')??(value(r,'carbs_total')!=null&&value(r,'fiber')!=null?Math.max(0,value(r,'carbs_total')-value(r,'fiber')):null);
 // kJ or kcal is told by the values: kcal is close to 4·P + 4·C + 9·F + 2·fibre.
 // An empty label right after the energy column is its merged kJ/kcal twin.
 const energy=folded.map((l,c)=>({l,c})).filter(({l,c})=>!used.has(c)&&(isEnergy(l)||!l&&c>0&&isEnergy(folded[c-1]))).map(({l,c})=>{
  const ratios=data.map(r=>{const e=nutrientValue(r[c]),est=4*(value(r,'protein')??0)+4*(carbsOf(r)??0)+9*(value(r,'fat')??0)+2*(value(r,'fiber')??0);return e!=null&&est>=20?e/est:null;}).filter(x=>x!=null).sort((a,b)=>a-b);
  const median=ratios[Math.floor(ratios.length/2)];
  return {c,unit:median>=.7&&median<=1.4?'kcal':median>=3&&median<=5.5?'kJ':/kcal/.test(l)&&!/kj/.test(l)?'kcal':null};
 }).filter(e=>e.unit).sort((a,b)=>(a.unit==='kcal'?0:1)-(b.unit==='kcal'?0:1))[0];
 if(!energy)throw new Error('V souboru chybí sloupec energie v kcal nebo kJ.');
 const foods=[],skipped=[],seen=new Set();let mismatched=0;
 for(const r of data){
  const code=String(r[col.code]).trim(),name=String(r[col.name]).trim(),raw=nutrientValue(r[energy.c]);
  const food={code,name,name_en:col.name_en==null?null:String(r[col.name_en]||'').trim()||null,edible_portion:value(r,'edible'),
   calories_100g:raw==null?null:round(energy.unit==='kJ'?raw/4.184:raw),protein_100g:round(value(r,'protein')),carbs_100g:round(carbsOf(r)),fat_100g:round(value(r,'fat')),
   fiber_100g:round(value(r,'fiber')),salt_100g:round(value(r,'salt')??(value(r,'sodium')==null?null:value(r,'sodium')*2.5/1000)),version};
  const bad=['calories_100g','protein_100g','carbs_100g','fat_100g'].find(k=>food[k]==null||food[k]<0||food[k]>(k==='calories_100g'?950:100));
  if(bad||seen.has(code)){skipped.push({code,name,reason:bad?`chybí nebo neplatná hodnota ${bad}`:'duplicitní kód'});continue;}
  seen.add(code);
  const est=4*food.protein_100g+4*food.carbs_100g+9*food.fat_100g+2*(food.fiber_100g??0);
  if(Math.abs(food.calories_100g-est)>Math.max(35,food.calories_100g*.35))mismatched++;
  foods.push(food);
 }
 return {version,energyUnit:energy.unit,foods,skipped,mismatched};
}

// Values are inlined (strings quoted, numbers from the parser) so a few
// multi-row statements carry the whole file: D1 caps bound parameters and the
// statements per request. Upsert, then drop older rows, so the table is never empty.
const COLUMN_NAMES=['code','name','name_en','edible_portion','calories_100g','protein_100g','carbs_100g','fat_100g','fiber_100g','salt_100g','version'];
const sqlValue=v=>v==null?'NULL':typeof v==='number'?(Number.isFinite(v)?String(v):'NULL'):`'${String(v).replace(/'/g,"''")}'`;
export function nutridatabazeSql(foods,version,rowsPerStatement=200){
 const update=COLUMN_NAMES.filter(c=>c!=='code').map(c=>`${c}=excluded.${c}`).join(',')+',updated_at=CURRENT_TIMESTAMP',statements=[];
 for(let i=0;i<foods.length;i+=rowsPerStatement)
  statements.push(`INSERT INTO nutridatabaze_foods(${COLUMN_NAMES.join(',')}) VALUES ${foods.slice(i,i+rowsPerStatement).map(f=>'('+COLUMN_NAMES.map(c=>sqlValue(c==='version'?version:f[c])).join(',')+')').join(',')} ON CONFLICT(code) DO UPDATE SET ${update};`);
 statements.push(`DELETE FROM nutridatabaze_foods WHERE version<>${sqlValue(version)};`);
 return statements;
}

// One D1 batch is one transaction: a failed import leaves the previous data intact.
export async function importNutridatabaze(db,bytes,{fileName='',version}={}){
 const result=parseNutridatabaze(await readTable(bytes,fileName),{version});
 if(!result.foods.length)throw new Error('V souboru nejsou žádné potraviny s úplnými hodnotami.');
 await db.batch(nutridatabazeSql(result.foods,result.version).map(sql=>db.prepare(sql)));
 return {version:result.version,energyUnit:result.energyUnit,imported:result.foods.length,skipped:result.skipped.length,energyMismatch:result.mismatched,firstSkipped:result.skipped.slice(0,10)};
}

export async function nutridatabazeStatus(db){
 try{const row=await db.prepare('SELECT COUNT(*) AS count,MAX(version) AS version,MAX(updated_at) AS updated_at FROM nutridatabaze_foods').first();return {count:Number(row?.count||0),version:row?.version||null,updated_at:row?.updated_at||null};}
 catch{return {count:0,version:null,updated_at:null};}
}
