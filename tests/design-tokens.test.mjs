import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {overviewPage} from '../src/site-pages.js';

// Surfaces, lines and text greys must come from tokens (or color-mix() of tokens), otherwise a
// light theme cannot change them. Saturated mid-tone colours (chart data, accents) work on both
// backgrounds and may stay; black stays for shadows and masks, white for text on a coloured fill.
const LAYERS=['design-system.js','site-pages.js'];

const lin=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;};
function oklab(r,g,b){const R=lin(r),G=lin(g),B=lin(b);const l=Math.cbrt(0.4122214708*R+0.5363325363*G+0.0514459929*B),m=Math.cbrt(0.2119034982*R+0.6806995451*G+0.1073969566*B),s=Math.cbrt(0.0883024619*R+0.2817188376*G+0.6299787005*B);return [0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s];}
function themeBound(hex){
  let h=hex.slice(1);if(h.length<=4)h=[...h].map(c=>c+c).join('');
  const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)),alpha=h.length===8?parseInt(h.slice(6),16)/255:1;
  const [L,a,bb]=oklab(r,g,b),chroma=Math.hypot(a,bb);
  if(L<0.1&&(alpha<1||L===0))return false;
  if(r===255&&g===255&&b===255&&alpha===1)return false;
  return chroma<0.06||L<0.45||L>0.88;
}

test('theme layers take surface, line and text colours from tokens',()=>{
  const found=[];
  for(const file of LAYERS){
    const src=readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/:root[^{]*\{[^}]*\}/g,'').replace(/content="[^"]*"/g,'');
    for(const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g))if([4,5,7,9].includes(m[0].length)&&themeBound(m[0]))found.push(file+' '+m[0]);
  }
  assert.deepEqual(found,[],'use var(--token) or color-mix(in srgb,var(--text) N%,var(--bg)) instead of these colours');
});

test('the design system defines every token the layers mix from, once',async()=>{
  const html=await overviewPage().text();
  const roots=html.match(/:root\{[^}]*\}/g)||[];
  const {DARK_SITE}=await import('../src/design-system.js');
  assert.equal(roots.length,DARK_SITE?2:1,'all colour tokens live in design-system.js');
  for(const name of new Set([...html.matchAll(/color-mix\(in srgb,var\(--([a-z0-9-]+)\)/g)].map(m=>m[1]))) assert.match(roots[0],new RegExp('--'+name+':'),name);
});

test('the public pages keep the app’s light palette without a theme switch',async()=>{
  const html=await overviewPage().text();
  assert.match(html,/:root\{color-scheme:light;[^}]*--bg:#F3EFE8;/);
  assert.doesNotMatch(html,/lw-theme|data-theme/,'one look, taken from Palette.swift');
});

// Small text was 12px almost everywhere and hard to read; sizes under 15px now come from the
// type scale in design-system.js, so the app keeps one readable hierarchy.
test('theme layers take small font sizes from the type scale',()=>{
  const found=[];
  for(const file of LAYERS.filter(f=>f!=='site-pages.js')){
    const src=readFileSync(new URL('../src/'+file,import.meta.url),'utf8')
      .replace(/\.lang-switch button\{[^}]*\}/,'')      // public pages share it and have no scale
      .replace(/\.info-tip\{[^}]*\}/,'');               // the (i) glyph inside its 17px circle
    for(const m of src.matchAll(/font(?:-size)?:[^;"'}]*?(\d+(?:\.\d+)?)px/g))if(+m[1]<15)found.push(file+' '+m[0]);
  }
  assert.deepEqual(found,[],'use var(--fs-12|14|17) instead');
});

test('the site keeps to its type scale, corners and two shadows (DESIGN.md)',async()=>{
  const html=await overviewPage().text();
  assert.match(html,/--fs-12:12px;--fs-14:14px;--fs-17:17px;--fs-20:20px;--fs-28:28px;--fs-44:44px;--fs-64:64px;--fs-88:88px;/);
  // The site's own styles (not the app's screens rebuilt in site-demos.js) take sizes, corners and shadows from tokens.
  const src=readFileSync(new URL('../src/site-pages.js',import.meta.url),'utf8');
  const css=src.slice(src.indexOf('const siteCss = `'),src.indexOf('`;',src.indexOf('const siteCss = `')));
  assert.deepEqual([...css.matchAll(/font(?:-size)?:[^;}]*?\d+(?:\.\d+)?px/g)].map(m=>m[0]),[],'use var(--fs-…)');
  // The phone keeps its real corners (58, 49, 44) and thin bars keep 2px.
  assert.deepEqual([...css.matchAll(/border-radius:(\d+)px/g)].map(m=>+m[1]).filter(r=>![2,44,49,58].includes(r)),[],'use var(--r-…)');
  // Shadows: the two tokens, the phone's own, rings and glows drawn with box-shadow.
  const shadows=[...css.matchAll(/box-shadow:([^;}]*)/g)].map(m=>m[1]).filter(v=>/rgba\(/.test(v)&&!/inset 0 0 0 1px rgba\(255,255,255,\.7\)/.test(v));
  assert.deepEqual(shadows,[],'use var(--shadow-card) or var(--shadow-float)');
});

// Dark mode (DESIGN.md): the app's dark palette for every colour token, switched on only once CI's dark
// screenshots of every screen are in public/site/app/, since light screenshots glare on a dark page.
test('the dark tokens cover every colour of the light ones, and wait for the dark screenshots',async()=>{
  const {themeTokens,darkTokens,DARK_SITE}=await import('../src/design-system.js');
  const names=css=>new Set([...css.matchAll(/(--[a-z0-9-]+):\s*(?:#|rgba|0 )/g)].map(m=>m[1]));
  const light=names(themeTokens),dark=names(darkTokens);
  for(const name of dark) assert.ok(light.has(name),`${name} has no light value`);
  // Colours that stay the same in both palettes: the mark, the plates' fill, other brands, fixed device glare.
  const same=new Set(['--logo-load','--logo-recovery','--health-red','--google-blue','--plate-25','--plate-20','--plate-15','--plate-10','--plate-5','--plate-2-5','--plate-1-25']);
  assert.deepEqual([...light].filter(n=>!dark.has(n)&&!same.has(n)),[],'give these a dark value from Palette.swift');
  const html=await overviewPage().text();
  if(!DARK_SITE){assert.doesNotMatch(html,/prefers-color-scheme:dark/);return;}
  const {readdirSync}=await import('node:fs');
  const files=new Set(readdirSync(new URL('../public/site/app/',import.meta.url)));
  for(const m of html.matchAll(/\/site\/app\/([a-z-]+)\.webp/g)) if(!m[1].endsWith('-dark')) assert.ok(files.has(`${m[1]}-dark.webp`),`${m[1]}-dark.webp is missing (scripts/site-screens.mjs)`);
});
