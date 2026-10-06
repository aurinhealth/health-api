import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {overviewPage,privacyPage,termsPage,supportPage} from '../src/site-pages.js';

test('the overview keeps what Google verification reads on the homepage',async()=>{
  const html=await overviewPage().text();
  assert.match(html,/<title>Loadwise/);
  assert.match(html,/Google Health data disclosure/);
  for(const page of [overviewPage,privacyPage,termsPage,supportPage])assert.doesNotMatch(await page().text(),/sheet/i,'Google Sheets is gone; the public pages must not mention it');
  assert.match(html,/may read fitness, health-metric, sleep, and nutrition data from Google Health/);
  assert.match(html,/add nutrition logs to Google Health when you ask/);
  for(const href of ['/privacy','/terms','/support','/app'])assert.match(html,new RegExp('href="'+href+'"'),href);
});

test('public pages follow the Vzhled switch like the app',async()=>{
  for(const page of [overviewPage,privacyPage,termsPage,supportPage]){
    const html=await page().text(),head=html.slice(0,html.indexOf('<style>'));
    assert.match(head,/lw-theme=\(light\|dark\)/);
    assert.equal((html.match(/:root\{[^}]*\}/g)||[]).length,1);
    for(const choice of ['light','dark'])assert.match(html,new RegExp('role="radio" data-theme-choice="'+choice+'"'));
    assert.doesNotMatch(html,/data-theme-choice="system"/);
  }
});

test('every screenshot the overview shows exists in both themes',async()=>{
  const html=await overviewPage().text(),names=[...new Set([...html.matchAll(/src="\/site\/([a-z-]+)-dark\.webp"/g)].map(m=>m[1]))];
  assert.ok(names.length>=5);
  for(const name of names)for(const theme of ['dark','light'])assert.ok(existsSync(new URL(`../public/site/${name}-${theme}.webp`,import.meta.url)),`${name}-${theme}`);
});

const visit=(path,headers={})=>new Request('https://petrfitnessdata.eu'+path,{headers});

test('the site speaks the browser language unless a cookie or link says otherwise',async()=>{
  const lang=async req=>(await overviewPage(req).text()).match(/<html lang="(cs|en)"/)[1];
  assert.equal(await lang(visit('/',{'accept-language':'cs-CZ,cs;q=0.9,en;q=0.8'})),'cs');
  assert.equal(await lang(visit('/',{'accept-language':'sk'})),'cs');
  assert.equal(await lang(visit('/',{'accept-language':'en-US,en;q=0.9'})),'en');
  assert.equal(await lang(visit('/',{'accept-language':'de-DE'})),'en');
  assert.equal(await lang(visit('/',{'accept-language':'en-US',cookie:'a=1; lw-lang=cs'})),'cs');
  assert.equal(await lang(visit('/?lang=en',{'accept-language':'cs',cookie:'lw-lang=cs'})),'en');
  assert.match(overviewPage(visit('/')).headers.get('vary'),/Cookie.*Accept-Language/);
  assert.equal(overviewPage(visit('/',{'accept-language':'en'})).headers.get('content-language'),'en');
});

test('every public page has the CZ / EN switch and an English version',async()=>{
  for(const page of [overviewPage,privacyPage,termsPage,supportPage]){
    const cs=await page(visit('/',{'accept-language':'cs'})).text(),en=await page(visit('/',{'accept-language':'en'})).text();
    for(const html of [cs,en])for(const code of ['cs','en'])assert.match(html,new RegExp('role="radio" data-lang-choice="'+code+'"'));
    assert.match(en,/data-device-lang="en"/);
    assert.notEqual(cs,en);
  }
  const en=await overviewPage(visit('/',{'accept-language':'en'})).text();
  assert.match(en,/Sign in/);
  assert.match(en,/Google Health data disclosure/);
  assert.match(await privacyPage(visit('/',{'accept-language':'en'})).text(),/Google user data is used only to provide/);
});

test('the English overview shows English screenshots in both themes',async()=>{
  const html=await overviewPage(visit('/',{'accept-language':'en'})).text(),names=[...new Set([...html.matchAll(/src="\/site\/([a-z-]+)-dark\.webp"/g)].map(m=>m[1]))];
  assert.ok(names.length>=5);
  for(const name of names){assert.match(name,/-en$/);for(const theme of ['dark','light'])assert.ok(existsSync(new URL(`../public/site/${name}-${theme}.webp`,import.meta.url)),`${name}-${theme}`);}
});
