// Command-line import of the NutriDatabaze.cz export into D1, the alternative to
// the upload in Settings (Správce → NutriDatabaze). Writes SQL for wrangler.
// The export and the SQL stay on your machine: the licence forbids passing the
// data file on, and this repository is public.
//
//   node scripts/import-nutridatabaze.mjs <export.xlsx|.csv> [--version 11.26] [--out file.sql]
//   npx --yes wrangler@4 d1 execute health-data --remote --file=<file.sql>
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readTable,parseNutridatabaze,nutridatabazeSql} from '../src/nutridatabaze-import.js';

const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args.splice(i,2)[1];};
const versionArg=option('--version'),outArg=option('--out'),file=args[0];
if(!file){console.error('Usage: node scripts/import-nutridatabaze.mjs <export.xlsx|.csv> [--version 11.26] [--out file.sql]');process.exit(1);}
const result=parseNutridatabaze(await readTable(readFileSync(file),file),{version:versionArg});
if(!result.foods.length){console.error('No foods were read from the file.');process.exit(1);}
const out=resolve(outArg||fileURLToPath(new URL(`../data/private/nutridatabaze-${result.version}.sql`,import.meta.url)));
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,nutridatabazeSql(result.foods,result.version).join('\n')+'\n');
console.log(JSON.stringify({version:result.version,energy:result.energyUnit,imported:result.foods.length,skipped:result.skipped.length,energyMismatch:result.mismatched,totalCarbs:result.totalCarbs,firstSkipped:result.skipped.slice(0,10),sql:out},null,1));
console.log(`\nNahrání do produkce:\n  npx --yes wrangler@4 d1 execute health-data --remote --file="${out}"`);
