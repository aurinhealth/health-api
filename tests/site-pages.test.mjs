import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import worker from '../src/entrypoint.js';
import {overviewPage,privacyPage,termsPage,supportPage,healthDataPage,robotsTxt,sitemapXml,googleDisclosure,GOOGLE_DISCLOSURE_ON_HOME} from '../src/site-pages.js';

test('the overview keeps what Google verification reads on the homepage',async()=>{
  const html=await overviewPage().text();
  assert.match(html,/<title>Aurin/);
  // The disclosure is on the overview while Google verifies the app; the switch can take it off later.
  assert.equal(html.includes('Google Health data disclosure'),GOOGLE_DISCLOSURE_ON_HOME);
  for(const page of [overviewPage,privacyPage,termsPage,supportPage])assert.doesNotMatch(await page().text(),/sheet/i,'Google Sheets is gone; the public pages must not mention it');
  assert.match(googleDisclosure(),/may read fitness, health-metric, sleep, and nutrition data from Google Health/);
  assert.match(googleDisclosure(),/add nutrition logs to Google Health when you ask/);
  for(const href of ['/privacy','/terms','/support'])assert.match(html,new RegExp('href="'+href+'"'),href);
  assert.doesNotMatch(html,/href="\/app"/,'the web app is switched off');
});

test('public pages use the app’s light palette',async()=>{
  for(const page of [overviewPage,privacyPage,termsPage,supportPage]){
    const html=await page().text();
    assert.match(html,/<html lang="en" class="site"/);
    assert.match(html,/:root\{color-scheme:light;[^}]*--bg:#F3EFE8;/);
    assert.equal((html.match(/:root\{[^}]*\}/g)||[]).length,1);
    assert.doesNotMatch(html,/data-theme-choice/,'the site has one look; the Vzhled switch stays in the app');
  }
});

test('the overview follows the app section by section and every file it loads exists',async()=>{
  const html=await overviewPage(new Request('https://aurin.health/')).text();
  for(const id of ['spanek','pripravenost','zatez','trenink','posilovna','rezim','svaly','vyziva','kouc','propojeni','soukromi','faq'])assert.match(html,new RegExp('<section id="'+id+'"'),id);
  const files=[...new Set([...html.matchAll(/(?:src|href|content)="(?:https:\/\/aurin\.health)?\/site\/([^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1]))];
  assert.ok(files.includes('og-en.png'),'share image');
  assert.ok(files.includes('fonts/newsreader.woff2'));
  for(const file of files)assert.ok(existsSync(new URL(`../public/site/${file}`,import.meta.url)),file);
  for(const name of ['today','sleep','readiness-parts','training','builder','training-mode','food-day'])assert.ok(files.includes('app/'+name+'.webp'),'the app’s screen '+name);
  assert.ok(files.includes('fonts/instrument-serif.woff2'),'the app’s number font');
  // Strain, the finished workout and the coach are screens built in site-demos.js, so they can move.
  for(const text of ['5.1</b> workout <b>3.3</b> movement','Saved to Apple Health','Proposal confirmed.'])assert.ok(html.includes(text),text);
  // The 3D figure's frames, its map of muscles and a close-up of every muscle the bubble can open.
  const base=html.match(/data-base="\/site\/([^"]+)"/)[1];
  for(let i=0;i<72;i++)assert.ok(existsSync(new URL(`../public/site/${base}f${String(i).padStart(2,'0')}.webp`,import.meta.url)),'frame '+i);
  assert.ok(existsSync(new URL(`../public/site/${base}ids.png`,import.meta.url)));
  const script=html.match(/var LABEL=\{([^}]+)\}/)[1];
  for(const [,id] of script.matchAll(/(\w+):'/g))assert.ok(existsSync(new URL(`../public/site/${base}z-${id}.webp`,import.meta.url)),'close-up '+id);
  assert.doesNotMatch(html,/undefined/,'every icon and text the page draws exists');
});

// Link previews: a large image card on X, Facebook, LinkedIn, Slack and iMessage, with icons that exist.
test('every public page carries a link preview with the share image and icons',async()=>{
  for(const page of [overviewPage,privacyPage,termsPage,supportPage,healthDataPage]){
    const html=await page(new Request('https://aurin.health/')).text();
    for(const tag of ['og:title','og:description','og:image','og:image:alt','og:url'])assert.match(html,new RegExp('<meta property="'+tag+'" content="[^"]+">'),tag);
    assert.match(html,/<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html,/<meta name="twitter:image" content="https:\/\/aurin\.health\/site\/og-en\.png\?v=\d+">/,'versioned, so the networks pick up a new render');
    for(const [,file] of html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="\/([^"]+)"/g))
      if(file!=='logo.svg')assert.ok(existsSync(new URL(`../public/${file}`,import.meta.url)),file);
    assert.match(html,/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
  }
  const description=(await overviewPage().text()).match(/<meta name="description" content="([^"]+)">/)[1];
  assert.ok(description.length<=160,'Google cuts a longer description: '+description.length);
});

// The phones show the app's sample morning (screenshots from ios-native.yml), so the numbers floating
// around the hero phone come from the same sample day (DemoData.swift) and change with it.
test('the numbers around the hero phone are the sample morning its screenshot shows',async()=>{
  const demo=readFileSync(new URL('../ios-native/Aurin/Data/DemoData.swift',import.meta.url),'utf8');
  const today=JSON.parse(demo.match(/json = """\n([\s\S]*?)\n    """/)[1]);
  const html=await overviewPage().text();
  const clock=m=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0');
  assert.match(html,new RegExp('readiness '+today.readiness.score+','));
  assert.match(html,new RegExp('<div class="k">HRV</div><div class="v">'+today.hrv.value+' ms</div><div class="d up">↑ '+(today.hrv.value-today.hrv.baseline)+' ms above normal'));
  assert.match(html,new RegExp('<div class="k">Sleep</div><div class="v">'+clock(today.sleep.minutes)+'</div><div class="d sleep">score '+today.sleep.index+'<'));
  // The strain screen built for the site splits the day as the sample day does (DemoData strain.training/movement).
  assert.ok(html.includes('<b>'+today.strain.training+'</b> workout <b>'+today.strain.movement+'</b> movement'),'strain split');
  assert.equal(Math.round((today.strain.training+today.strain.movement)*10)/10,today.strain.score);
});

const visit=(path,headers={})=>new Request('https://aurin.health'+path,{headers});

test('the site is English whatever the browser says; privacy and terms also have Czech',async()=>{
  const lang=async (page,path,headers={})=>(await page(new Request('https://aurin.health'+path,{headers})).text()).match(/<html lang="(cs|en)"/)[1];
  for(const page of [overviewPage,supportPage])assert.equal(await lang(page,'/?lang=cs',{'accept-language':'cs',cookie:'lw-lang=cs'}),'en');
  for(const page of [privacyPage,termsPage]){
    assert.equal(await lang(page,'/x',{'accept-language':'cs-CZ',cookie:'lw-lang=cs'}),'en');
    assert.equal(await lang(page,'/x?lang=cs'),'cs');
  }
  for(const page of [overviewPage,privacyPage,termsPage,supportPage]){
    const html=await page().text();
    assert.doesNotMatch(html,/data-lang-choice|lang-switch/,'no language switch');
    assert.match(html,/<li lang="cs">Česky: <a href="\/privacy\?lang=cs" hreflang="cs">Soukromí<\/a> · <a href="\/terms\?lang=cs" hreflang="cs">Podmínky<\/a><\/li>/);
  }
  assert.match(await privacyPage().text(),/<a href="\/privacy\?lang=cs" lang="cs" hreflang="cs">Česká verze<\/a>/);
  assert.match(await termsPage(new Request('https://aurin.health/terms?lang=cs')).text(),/<a href="\/terms" lang="en" hreflang="en">English version<\/a>/);
  assert.doesNotMatch(await overviewPage().text(),/hreflang="cs" href=/,'the overview has no Czech version');
  assert.equal(overviewPage(new Request('https://aurin.health/',{headers:{'accept-language':'cs'}})).headers.get('content-language'),'en');
});

test('the overview speaks English and offers the waitlist',async()=>{
  const en=await overviewPage().text();
  assert.match(en,/Join the waitlist/);
  assert.match(en,/<form class="wl" action="\/waitlist"/);
  assert.match(en,/Train for how you feel today/);
  assert.doesNotMatch(en,/href="\/app"/);
  assert.match(await privacyPage().text(),/Google user data is used only to provide/);
});

test('the privacy policy and support page cover what Google verification asks for',async()=>{
  const en=path=>visit(path,{'accept-language':'en'});
  const home=googleDisclosure(),privacy=await privacyPage(en('/privacy')).text(),support=await supportPage(en('/support')).text();
  const limitedUse=[/Aurin’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https:\/\/developers\.google\.com\/terms\/api-services-user-data-policy">Google API Services User Data Policy<\/a>, including the Limited Use requirements\./,
    /The use of information received from Google Health API and\/or Developer Tools will adhere to the <a href="https:\/\/developers\.google\.com\/health\/policies\/health-api-developer-user-data-policy">Google Health API Developer and User Data Policy<\/a>, including the Limited Use requirements\./];
  for(const statement of limitedUse){assert.match(home,statement);assert.match(privacy,statement);}
  // The disclosure stays word for word, under the app's one name, and names every optional permission.
  assert.match(home,/<p>Aurin is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows\.<\/p>/);
  assert.match(home,/Four optional permissions can be left unticked on Google’s consent screen: adding weight records to Google Health \(weight you log in Aurin or Intervals\.icu\), adding the workouts you finish in Aurin to Google Health, reading the GPS route of a workout to show its map, and reading your date of birth/);
  assert.doesNotMatch(home+privacy,/Petr Fitness Data/);
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
  const cs=await privacyPage(visit('/privacy?lang=cs')).text();
  assert.match(cs,/Data uživatelů z Googlu slouží jen k funkcím Aurinu/);
  assert.match(cs,/<strong>Smazání účtu<\/strong> v Nastavení/);
});

test('the privacy policy names the controller and the contact',async()=>{
  const page=async(fn,path,lang)=>(await fn(new Request('https://aurin.health'+path+'?lang='+lang))).text();
  const en=await page(privacyPage,'/privacy','en'),cs=await page(privacyPage,'/privacy','cs');
  assert.match(en,/The controller of your personal data is Petr Bouma/);
  assert.match(cs,/Správcem tvých osobních údajů je Petr Bouma/);
  for(const html of [en,cs,await page(supportPage,'/support','en'),await page(supportPage,'/support','cs')])assert.match(html,/<a href="mailto:support@aurin\.health">support@aurin\.health<\/a>/);
  // The consent step (consent.js) and the two-year deletion (inactiveAccounts) are described.
  assert.match(en,/deleted automatically with all its data/);
  assert.match(cs,/dva roky nepřihlásil, automaticky smažeme/);
  assert.match(en,/Sending the data an AI feature needs to OpenAI takes a separate explicit consent/);
  assert.match(cs,/Posílání dat, která AI funkce potřebuje, do OpenAI vyžaduje samostatný výslovný souhlas/);
  assert.doesNotMatch(en+cs,/ChatGPT|the same way you received your invitation|stejnou cestou, jakou ti přišla pozvánka/);
});

test('with open sign-up the privacy policy and support page no longer speak of invitations',async()=>{
  const invite=/invitation|pozvánk|pozvan/i;
  for(const [page,path] of [[privacyPage,'/privacy?lang=en'],[privacyPage,'/privacy?lang=cs'],[supportPage,'/support']]){
    const req=()=>new Request('https://aurin.health'+path);
    assert.match(await page(req(),{apple:true,email:true}).text(),invite,path+' invite only');
    assert.doesNotMatch(await page(req(),{apple:true,email:true,open:true}).text(),invite,path+' open');
  }
  const support=await supportPage(new Request('https://aurin.health/support'),{apple:true,email:true,open:true}).text();
  assert.match(support,/<strong>Continue with Apple<\/strong>, <strong>Continue with Google<\/strong> or <strong>Continue with e-mail<\/strong>/);
  assert.match(support,/Next time with Face ID/);
});

test('the terms say who runs Aurin, that it is not medical care, and name no internal service',async()=>{
  for(const lang of ['en','cs']){
    const html=await termsPage(new Request('https://aurin.health/terms?lang='+lang)).text();
    assert.doesNotMatch(html,/health-api/);
    assert.match(html,lang==='en'?/Aurin is run by Petr Bouma/:/Aurin provozuje Petr Bouma/);
    assert.match(html,lang==='en'?/Aurin is not a medical device/:/Aurin není zdravotnický prostředek/);
    assert.match(html,lang==='en'?/Cycle tracking is not contraception/:/Sledování cyklu není antikoncepce/);
    assert.match(html,/apple\.com\/legal\/internet-services\/itunes\/dev\/stdeula/);
  }
});

test('the support page follows the app’s Settings and every page has the footer groups',async()=>{
  const read=path=>readFileSync(new URL('../ios-native/'+path,import.meta.url),'utf8');
  const settings=read('Aurin/Screens/SettingsView.swift'),strings=read('Shared/en.lproj/Localizable.strings');
  const en=label=>strings.match(new RegExp('^"'+label+'" = "([^"]+)";','m'))?.[1];
  for(const title of ['Zdroje dat','Soukromí a data','Nahlásit problém','Kontaktovat nás'])assert.match(settings,new RegExp('title: "'+title+'"'),title);
  const support=await supportPage().text();
  for(const label of ['Settings → '+en('Zdroje dat'),'Settings → '+en('Soukromí a data').replace('&','&amp;'),'Settings → Help → '+en('Nahlásit problém'),'Ultrahuman'])assert.ok(support.includes(label),label);
  for(const page of [privacyPage,supportPage])for(const lang of ['en','cs'])
    assert.doesNotMatch(await page(new Request('https://aurin.health/x?lang='+lang)).text(),/Nastavení → Účet,|Settings → Account(?!;)|Settings → Account you|Nastavení → Propojení|Settings → Connections/);
  for(const page of [overviewPage,privacyPage,termsPage,supportPage]){
    const html=await page().text();
    for(const href of ['/#pripravenost','/support#problem','mailto:support@aurin.health','/privacy','/terms'])assert.ok(html.includes('href="'+href+'"'),href);
    assert.match(html,/Aurin is not a medical device\./);
  }
  assert.match(support,/<h2 id="problem">/);
});

test('the privacy policy says what Aurin writes to Apple Health, in both languages',async()=>{
  assert.match(await privacyPage().text(),/<li>Writing to Apple Health, only if you turn it on \(Settings → Data sources → Apple Health\)/);
  assert.match(await privacyPage(new Request('https://aurin.health/privacy?lang=cs')).text(),/<li>Zápis do Apple Health, jen když ho zapneš/);
});

test('robots.txt and the sitemap list the public pages on the host they are served on',async()=>{
  const robots=await robotsTxt(new Request('https://aurin.health/robots.txt')).text();
  assert.match(robots,/Disallow: \/app\//);
  assert.match(robots,/Sitemap: https:\/\/aurin\.health\/sitemap\.xml/);
  const map=await sitemapXml(new Request('https://aurin.health/sitemap.xml')).text();
  for(const path of ['/','/support','/privacy','/terms','/health-data','/privacy?lang=cs','/terms?lang=cs'])assert.ok(map.includes('<loc>https://aurin.health'+path+'</loc>'),path);
});

// Connections show only the services the app offers to connect, each with the app's own logo file
// (Assets.xcassets), and say what Aurin sends back only where the app can sync to that service.
test('the connections use the app’s own logos and only the services the app offers',async()=>{
  const html=await overviewPage().text();
  const section=html.slice(html.indexOf('<section id="propojeni"'),html.indexOf('<section id="soukromi"'));
  const asset=path=>readFileSync(new URL('../ios-native/Aurin/Resources/Assets.xcassets/'+path,import.meta.url));
  const site=file=>readFileSync(new URL('../public/site/logos/'+file,import.meta.url));
  for(const [file,source] of [['apple-health.png','AppleHealthLogo.imageset/apple-health.png'],['google-health.png','GoogleHealthLogo.imageset/google-health.png'],['intervals.svg','IntervalsLogo.imageset/intervals.svg'],['ultrahuman.svg','UltrahumanMark.imageset/ultrahuman-white.svg'],['whoop.svg','WhoopLogo.imageset/whoop-black.svg'],['wahoo.png','WahooLogo.imageset/wahoo-wordmark-white.png']]){
    assert.ok(site(file).equals(asset(source)),file+' is the app’s logo, unchanged');
    assert.ok(section.includes('/site/logos/'+file),file);
  }
  assert.deepEqual([...section.matchAll(/id="tab-(\w+)"/g)].map(m=>m[1]),['apple','google','intervals','ultrahuman','whoop','wahoo']);
  assert.doesNotMatch(section,/strava|garmin|oura/i,'only services the app offers');
  const sync=readFileSync(new URL('../ios-native/Aurin/Screens/SyncViews.swift',import.meta.url),'utf8');
  for(const id of ['apple','google','intervals'])assert.match(sync,new RegExp('SyncDestination\\(id: "'+id+'"'),id);
  for(const id of ['ultrahuman','whoop'])assert.doesNotMatch(sync,new RegExp('SyncDestination\\(id: "'+id+'"'),id);
  assert.match(section,/nothing, Aurin only reads the ring/);
  assert.match(section,/nothing, Aurin only reads WHOOP/);
  // Wahoo gets the planned workouts, as its connect sheet says (SettingsConnectFlow.swift).
  const connect=readFileSync(new URL('../ios-native/Aurin/Screens/SettingsPages/SettingsConnectFlow.swift',import.meta.url),'utf8');
  assert.match(connect,/Tréninky naplánované v Aurinu, do ELEMNT a KICKR/);
  assert.match(section,/planned workouts, to ELEMNT and KICKR/);
});

test('the questions open without JS and name the app’s real Settings paths',async()=>{
  const strings=readFileSync(new URL('../ios-native/Shared/en.lproj/Localizable.strings',import.meta.url),'utf8');
  const en=label=>strings.match(new RegExp('^"'+label+'" = "([^"]+)";','m'))?.[1];
  const html=await overviewPage().text();
  const faq=html.slice(html.indexOf('<section id="faq">'),html.indexOf('<section class="final">'));
  assert.ok((faq.match(/<details><summary>/g)||[]).length>=6);
  for(const label of ['Settings → '+en('Zdroje dat'),'Settings → '+en('Soukromí a data').replace('&','&amp;'),'Settings → Help → '+en('Nahlásit problém')])assert.ok(faq.includes(label),label);
  assert.match(faq,/mailto:support@aurin\.health/);
});

test('the public pages answer GET and HEAD without storage or a session, so crawlers can check them',async()=>{
  for(const path of ['/','/privacy','/terms','/support','/health-data','/robots.txt','/sitemap.xml']){
    for(const method of ['GET','HEAD']){
      const r=await worker.fetch(new Request('https://aurin.health'+path,{method}),{},{waitUntil(){}});
      assert.equal(r.status,200,method+' '+path);
      if(method==='HEAD')assert.equal(await r.text(),'');
      else assert.ok((await r.text()).length>0);
    }
  }
});

test('the Consumer Health Data Privacy Policy is its own page, linked from the homepage, and names the processors and appeals',async()=>{
  const html=await healthDataPage(new Request('https://aurin.health/health-data')).text();
  for(const part of ['My Health My Data Act','Senate Bill 370','we do not sell consumer health data','Cloudflare','OpenAI','Appeal','Washington State Attorney General'])assert.ok(html.includes(part),part);
  assert.match(await overviewPage().text(),/<a href="\/health-data">/);
});

