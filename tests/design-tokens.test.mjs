import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dashboardPage} from '../src/dashboard.js';

// Surfaces, lines and text greys must come from tokens (or color-mix() of tokens), otherwise a
// light theme cannot change them. Saturated mid-tone colours (chart data, accents) work on both
// backgrounds and may stay; black stays for shadows and masks, white for text on a coloured fill.
const LAYERS=['dashboard.js','dashboard-client.js','experience-theme.js','mobile-theme.js','gym-focus-view.js','workouts-hub-theme.js','assistant-panel-theme.js','design-system.js','site-pages.js'];

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
    const src=readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/:root[^{]*\{[^}]*\}/g,'').replace(/content="[^"]*"/g,'').replace(/const LIGHT = `[^`]*`/,'');
    for(const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g))if([4,5,7,9].includes(m[0].length)&&themeBound(m[0]))found.push(file+' '+m[0]);
  }
  assert.deepEqual(found,[],'use var(--token) or color-mix(in srgb,var(--text) N%,var(--bg)) instead of these colours');
});

test('the design system defines every token the layers mix from, once',async()=>{
  const html=await dashboardPage().text();
  const roots=html.match(/:root\{[^}]*\}/g)||[];
  assert.equal(roots.length,1,'all colour tokens live in design-system.js');
  for(const name of new Set([...html.matchAll(/color-mix\(in srgb,var\(--([a-z0-9-]+)\)/g)].map(m=>m[1]))) assert.match(roots[0],new RegExp('--'+name+':'),name);
});

test('light theme follows the lw-theme cookie or the system setting',async()=>{
  const html=await dashboardPage().text(),client=readFileSync(new URL('../src/dashboard-client.js',import.meta.url),'utf8');
  const head=html.slice(0,html.indexOf('<style>'));
  assert.match(head,/lw-theme=\(light\|dark\)/,'theme is applied before the first paint');
  assert.match(html,/:root\[data-theme="light"\]\{[^}]*--bg:/);
  assert.match(html,/@media \(prefers-color-scheme:light\)\{:root:not\(\[data-theme="dark"\]\)\{[^}]*--bg:/);
  for(const choice of ['light','dark'])assert.match(html,new RegExp('role="radio" data-theme-choice="'+choice+'"'),'top bar switch: '+choice);
  for(const choice of ['light','dark'])assert.match(client,new RegExp('data-theme-choice="'+choice+'"'));
  assert.doesNotMatch(html+client,/data-theme-choice="system"/,'the device decides without a choice; there is no separate option for it');
});

// Small text was 12px almost everywhere and hard to read; sizes under 15px now come from the
// type scale in design-system.js, so the app keeps one readable hierarchy.
test('app layers take small font sizes from the type scale',()=>{
  const found=[];
  for(const file of LAYERS.filter(f=>f!=='site-pages.js')){
    const src=readFileSync(new URL('../src/'+file,import.meta.url),'utf8')
      .replace(/\.lang-switch button\{[^}]*\}/,'')      // public pages share it and have no scale
      .replace(/\.info-tip\{[^}]*\}/,'');               // the (i) glyph inside its 17px circle
    for(const m of src.matchAll(/font(?:-size)?:[^;"'}]*?(\d+(?:\.\d+)?)px/g))if(+m[1]<15)found.push(file+' '+m[0]);
  }
  assert.deepEqual(found,[],'use var(--fs-caption|meta|small|body) instead');
});

test('the type scale keeps secondary text at 14px and fields at 16px on phones',async()=>{
  const html=await dashboardPage().text();
  assert.match(html,/--fs-small:14px/);
  assert.match(html,/--fs-body:15px/);
  assert.match(html,/max-width:700px\)\{input[^{]*,select,textarea\{font-size:16px/);
});
