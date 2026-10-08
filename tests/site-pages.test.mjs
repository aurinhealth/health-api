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

test('the privacy policy and support page cover what Google verification asks for',async()=>{
  const en=path=>visit(path,{'accept-language':'en'});
  const home=await overviewPage(en('/')).text(),privacy=await privacyPage(en('/privacy')).text(),support=await supportPage(en('/support')).text();
  const limitedUse=[/Loadwise’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https:\/\/developers\.google\.com\/terms\/api-services-user-data-policy">Google API Services User Data Policy<\/a>, including the Limited Use requirements\./,
    /The use of information received from Google Health API and\/or Developer Tools will adhere to the <a href="https:\/\/developers\.google\.com\/health\/policies\/health-api-developer-user-data-policy">Google Health API Developer and User Data Policy<\/a>, including the Limited Use requirements\./];
  for(const statement of limitedUse){assert.match(home,statement);assert.match(privacy,statement);}
  // The original disclosure stays word for word.
  assert.match(home,/<p>Loadwise \(Petr Fitness Data\) is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows\.<\/p>/);
  assert.match(home,/<p style="margin:0">The service can process training and fitness data from connected services, including Google Health data that the account owner has authorized, in order to provide these requested workflows\.<\/p>/);
  // Every party that receives data, how it is secured, and what happens on disconnecting and deleting.
  for(const party of ['Intervals.icu','OpenAI','Cloudflare','Open-Meteo'])assert.match(privacy,new RegExp('<strong>'+party.replace('.','\\.')+'</strong>'),party);
  // ChatGPT is no recipient: users cannot connect it to their data, and the assistant goes through OpenAI.
  assert.doesNotMatch(privacy,/ChatGPT/);
  assert.match(privacy,/encrypted at rest/);
  assert.match(privacy,/<strong>Disconnecting a service<\/strong>/);
  assert.match(privacy,/<strong>Deleting your account<\/strong> in Settings/);
  assert.match(privacy,/do not use or transfer it for advertising/);
  assert.match(privacy,/uoou\.gov\.cz/);
  assert.match(support,/<h2>Deleting your account and data<\/h2>/);
  assert.match(support,/myaccount\.google\.com\/connections/);
  const cs=await privacyPage(visit('/privacy',{'accept-language':'cs'})).text();
  assert.match(cs,/Data uživatelů z Googlu slouží jen k funkcím Loadwise/);
  assert.match(cs,/<strong>Smazání účtu<\/strong> v Nastavení/);
});

test('the privacy policy names the controller and the contact',async()=>{
  const page=async(fn,path,lang)=>(await fn(new Request('https://petrfitnessdata.eu'+path+'?lang='+lang))).text();
  const en=await page(privacyPage,'/privacy','en'),cs=await page(privacyPage,'/privacy','cs');
  assert.match(en,/The controller of your personal data is Petr Bouma/);
  assert.match(cs,/Správcem tvých osobních údajů je Petr Bouma/);
  for(const html of [en,cs,await page(supportPage,'/support','en'),await page(supportPage,'/support','cs')])assert.match(html,/<a href="mailto:petrbouma1994@icloud\.com">petrbouma1994@icloud\.com<\/a>/);
  // The consent step and the two-year deletion come with their own change; until then the policy does not describe them.
  assert.doesNotMatch(en,/two years|separate, optional consent/);
  assert.doesNotMatch(en+cs,/ChatGPT|the same way you received your invitation|stejnou cestou, jakou ti přišla pozvánka/);
});
