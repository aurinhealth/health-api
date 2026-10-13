import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {overviewPage,privacyPage,termsPage,supportPage} from '../src/site-pages.js';

test('the overview keeps what Google verification reads on the homepage',async()=>{
  const html=await overviewPage().text();
  assert.match(html,/<title>Loadwise/);
  assert.match(html,/Google Health data disclosure/);
  for(const page of [overviewPage,privacyPage,termsPage,supportPage])assert.doesNotMatch(await page().text(),/sheet/i,'Google Sheets is gone; the public pages must not mention it');
  assert.match(html,/may read fitness, health-metric, sleep, and nutrition data from Google Health/);
  assert.match(html,/add nutrition logs to Google Health when you ask/);
  for(const href of ['/privacy','/terms','/support'])assert.match(html,new RegExp('href="'+href+'"'),href);
  assert.doesNotMatch(html,/href="\/app"/,'the web app is switched off');
});

test('public pages use the app’s light palette',async()=>{
  for(const page of [overviewPage,privacyPage,termsPage,supportPage]){
    const html=await page().text();
    assert.match(html,/<html lang="cs" class="site"/);
    assert.match(html,/:root\{color-scheme:light;[^}]*--bg:#F3EFE8;/);
    assert.equal((html.match(/:root\{[^}]*\}/g)||[]).length,1);
    assert.doesNotMatch(html,/data-theme-choice/,'the site has one look; the Vzhled switch stays in the app');
  }
});

test('the overview follows the app section by section and every file it loads exists',async()=>{
  for(const lang of ['cs','en']){
    const html=await overviewPage(new Request('https://petrfitnessdata.eu/?lang='+lang)).text();
    for(const id of ['pripravenost','zatez','trenink','posilovna','vyziva','kouc','propojeni','soukromi'])assert.match(html,new RegExp('<section id="'+id+'"'),id);
    const files=[...new Set([...html.matchAll(/(?:src|href|content)="(?:https:\/\/petrfitnessdata\.eu)?\/site\/([^"]+)"/g)].map(m=>m[1]))];
    assert.ok(files.includes(lang==='en'?'og-en.png':'og.png'),'share image');
    assert.ok(files.includes('fonts/newsreader.woff2'));
    for(const file of files)assert.ok(existsSync(new URL(`../public/site/${file}`,import.meta.url)),file);
    assert.doesNotMatch(html,/\.webp"/,'the phone is drawn in HTML, not a screenshot');
    assert.doesNotMatch(html,/undefined/,'every icon and text the page draws exists');
  }
});

// The phone in the hero is the Today screen: its key numbers carry the app's own labels
// (TodayView.swift, English from Localizable.strings), so a rename in the app fails here.
test('the phone in the hero labels the key numbers like the app’s Today screen',async()=>{
  const read=path=>readFileSync(new URL('../ios-native/'+path,import.meta.url),'utf8');
  const labels=[...read('Loadwise/Screens/TodayView.swift').matchAll(/\bcell\("([^"]+)"/g)].map(m=>m[1]);
  assert.ok(labels.length>=3,'KeyNumbers cells');
  const strings=read('Shared/en.lproj/Localizable.strings');
  const en=label=>strings.match(new RegExp('^"'+label+'" = "([^"]+)";','m'))?.[1]||label;
  for(const lang of ['cs','en']){
    const html=await overviewPage(new Request('https://petrfitnessdata.eu/?lang='+lang)).text();
    for(const label of labels)assert.match(html,new RegExp('<div class="k">'+(lang==='en'?en(label):label)+'</div>'),lang+' '+label);
  }
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
  assert.match(en,/Coming soon to the App Store/);
  assert.match(en,/Train for how you feel today/);
  assert.doesNotMatch(en,/href="\/app"/);
  assert.match(en,/Google Health data disclosure/);
  assert.match(await privacyPage(visit('/',{'accept-language':'en'})).text(),/Google user data is used only to provide/);
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
  // The consent step (consent.js) and the two-year deletion (inactiveAccounts) are described.
  assert.match(en,/deleted automatically with all its data/);
  assert.match(cs,/dva roky nepřihlásil, automaticky smažeme/);
  assert.match(en,/The consent covers sending the data an AI feature needs to OpenAI/);
  assert.match(cs,/Souhlas zahrnuje i posílání dat, která AI funkce potřebuje, do OpenAI/);
  assert.doesNotMatch(en+cs,/ChatGPT|the same way you received your invitation|stejnou cestou, jakou ti přišla pozvánka/);
});

test('with open sign-up the privacy policy and support page no longer speak of invitations',async()=>{
  for(const lang of ['cs','en']){
    const req=path=>new Request('https://petrfitnessdata.eu'+path+'?lang='+lang);
    const invite=/invitation|pozvánk|pozvan/i;
    for(const [page,path] of [[privacyPage,'/privacy'],[supportPage,'/support']]){
      assert.match(await page(req(path),{apple:true,email:true}).text(),invite,path+' invite only');
      assert.doesNotMatch(await page(req(path),{apple:true,email:true,open:true}).text(),invite,path+' open');
    }
  }
  const support=await supportPage(new Request('https://petrfitnessdata.eu/support?lang=cs'),{apple:true,email:true,open:true}).text();
  assert.match(support,/<strong>Pokračovat přes Apple<\/strong>, <strong>Pokračovat přes Google<\/strong> nebo <strong>Pokračovat e-mailem<\/strong>/);
  assert.match(support,/Příště přes Face ID/);
});
