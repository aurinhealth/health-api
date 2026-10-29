// Turns the Aurin-screens artifact of ios-native.yml (Actions → the run → Artifacts) into the app's screens
// on the website (public/site/app/*.webp, 600×1305, the English light-mode shots of the sample day):
//
//   unzip Aurin-screens.zip -d screens/   then   node scripts/site-screens.mjs screens/
//
// The website shows each screen under its own name (overviewPage in src/site-pages.js and the overview
// images of scripts/render-overview.mjs); the artifact names them after the step of the walk that took them
// (site/<tab>.png from the workflow, smoke/4-NN-<step>.png from test4WebsiteScenes in SmokeTests.swift).
// This is the one place that says which is which. The same walk in dark mode (site-dark/, smoke-dark/) becomes
// <name>-dark.webp for the site's dark look (DARK_SITE in src/design-system.js); a run without it keeps the
// dark files as they are. Needs ImageMagick (magick or convert).
import {execFileSync} from 'node:child_process';
import {readdirSync, existsSync, statSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCREENS = {
  // The hero and the training chapter: the tabs as the workflow shoots them.
  today: 'site/today',
  training: 'site/training',
  muscles: 'site/muscles',
  // The walk through the app (test4WebsiteScenes), by the step's name without its number.
  sleep: 'spanek',
  'sleep-need': 'spanek-2',
  bedtime: 'planovac',
  'bedtime-goal': 'planovac-2',
  'readiness-parts': 'pripravenost',
  'journal-impact': 'co-pusobi',
  'strain-target': 'namaha',
  builder: 'sestavit',
  'gym-day': 'posilovna',
  'training-mode': 'rezim',
  // The second rest screen: the first one still has the system's notification question over it.
  'training-rest': 'odpocinek-2',
  'training-set': 'dalsi-serie',
  'training-done': 'dokoncit',
  'food-day': 'jidlo',
  'food-add': 'pridat',
  'coach-ask': 'kouc'};
const WIDTH = 600, HEIGHT = 1305, QUALITY = 80;

const from = process.argv[2];
if (!from || !existsSync(from)) {
  console.error('usage: node scripts/site-screens.mjs <unzipped Aurin-screens directory>');
  process.exit(2);
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'site', 'app');
const magick = (() => { for (const bin of ['magick', 'convert']) { try { execFileSync(bin, ['-version'], {stdio: 'ignore'}); return bin; } catch { /* next */ } } })();
if (!magick) { console.error('ImageMagick is missing: brew install imagemagick'); process.exit(2); }

const source = (step, dark) => {
  const suffix = dark ? '-dark' : '';
  if (step.startsWith('site/')) return join(from, step.replace('site/', `site${suffix}/`) + '.png');
  const dir = join(from, `smoke${suffix}`);
  const file = existsSync(dir) && readdirSync(dir).find(f => /^4-\d\d-/.test(f) && f.replace(/^4-\d\d-/, '').replace(/\.png$/, '') === step);
  return file && join(dir, file);
};
const save = (png, name) => {
  const target = join(out, `${name}.webp`);
  execFileSync(magick, [png, '-filter', 'Lanczos', '-resize', `${WIDTH}x${HEIGHT}!`, '-quality', String(QUALITY), '-define', 'webp:method=6', target]);
  return Math.round(statSync(target).size / 1024);
};
let missing = 0, dark = 0;
const hasDark = existsSync(join(from, 'site-dark')) || existsSync(join(from, 'smoke-dark'));
for (const [name, step] of Object.entries(SCREENS)) {
  const png = source(step, false);
  if (!png || !existsSync(png)) { console.error(`${name}: ${step} is not in the artifact`); missing++; continue; }
  console.log(`${name}.webp  ←  ${step}  (${save(png, name)} kB)`);
  if (!hasDark) continue;
  const darkPng = source(step, true);
  if (!darkPng || !existsSync(darkPng)) { console.error(`${name}-dark: ${step} is not in the dark shots`); continue; }
  console.log(`${name}-dark.webp  ←  ${step} (dark)  (${save(darkPng, `${name}-dark`)} kB)`);
  dark++;
}
if (hasDark) console.log(`${dark} of ${Object.keys(SCREENS).length} dark screens; the site's dark look needs all of them (DARK_SITE).`);
if (missing) process.exit(1);
