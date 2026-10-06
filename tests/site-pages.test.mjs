import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {overviewPage,privacyPage,termsPage,supportPage} from '../src/site-pages.js';

test('the overview keeps what Google verification reads on the homepage',async()=>{
  const html=await overviewPage().text();
  assert.match(html,/<title>Loadwise/);
  assert.match(html,/Google Health data disclosure/);
  assert.match(html,/may read fitness, health-metric, sleep, and nutrition data from Google Health/);
  assert.match(html,/add nutrition logs to Google Health when you ask/);
  for(const href of ['/privacy','/terms','/support','/app'])assert.match(html,new RegExp('href="'+href+'"'),href);
});

test('public pages follow the Vzhled switch like the app',async()=>{
  for(const page of [overviewPage,privacyPage,termsPage,supportPage]){
    const html=await page().text(),head=html.slice(0,html.indexOf('<style>'));
    assert.match(head,/lw-theme=\(light\|dark\)/);
    assert.equal((html.match(/:root\{[^}]*\}/g)||[]).length,1);
    for(const choice of ['system','light','dark'])assert.match(html,new RegExp('role="radio" data-theme-choice="'+choice+'"'));
  }
});

test('every screenshot the overview shows exists in both themes',async()=>{
  const html=await overviewPage().text(),names=[...html.matchAll(/src="\/site\/([a-z]+)-dark\.webp"/g)].map(m=>m[1]);
  assert.ok(names.length>=5);
  for(const name of names)for(const theme of ['dark','light'])assert.ok(existsSync(new URL(`../public/site/${name}-${theme}.webp`,import.meta.url)),`${name}-${theme}`);
});
