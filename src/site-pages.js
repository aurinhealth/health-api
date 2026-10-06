// Public pages: the Loadwise overview on / and the policy pages. They share the app's colour
// tokens and Vzhled switch, so the site and the app look like one product in both themes.
// Screenshots live in public/site/ (Workers static assets), one per theme: phone-*.webp from the
// sandbox at 390×844 @2x, today-*.webp from the desktop app.
import {themeTokens,themeBoot,themeSwitch,themeSwitchScript,themeSwitchCss} from './design-system.js';
import {icon} from './icons.js';

const ORIGIN = 'https://petrfitnessdata.eu';

// Soft tinted surfaces: a hue mixed into the page background, so tiles work in both themes.
const tint = (hue, top, bottom) => `linear-gradient(170deg,color-mix(in srgb,var(--${hue}) ${top}%,var(--bg)),color-mix(in srgb,var(--${hue}) ${bottom}%,var(--bg)))`;

const siteCss = `
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--primary-text)}
img{max-width:100%}
.icon{width:1.15em;height:1.15em;flex:none;vertical-align:-.2em;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
h1,h2,h3{margin:0;letter-spacing:-.035em;line-height:1.05;font-weight:700}
p{margin:0}
.muted{color:var(--muted)}
:focus-visible{outline:2px solid var(--primary);outline-offset:3px}

/* Floating pill navigation. */
.site-head{position:sticky;top:12px;z-index:20;display:flex;justify-content:center;padding:0 16px;margin-top:12px;pointer-events:none}
.pill-nav{pointer-events:auto;display:flex;align-items:center;gap:6px;padding:6px 6px 6px 16px;border:1px solid color-mix(in srgb,var(--line) 70%,transparent);border-radius:999px;background:color-mix(in srgb,var(--panel) 78%,transparent);backdrop-filter:saturate(1.6) blur(18px);-webkit-backdrop-filter:saturate(1.6) blur(18px);box-shadow:0 8px 30px color-mix(in srgb,#000 10%,transparent)}
.logo{display:flex;align-items:center;gap:8px;color:var(--text);text-decoration:none;font-weight:700;font-size:16px;letter-spacing:-.02em;margin-right:10px}
.logo img{width:24px;height:24px;border-radius:7px}
.pill-nav .links{display:flex;gap:2px;margin-right:6px}
.pill-nav .links a{padding:7px 12px;border-radius:999px;color:var(--muted);text-decoration:none;font-size:14px;font-weight:550}
.pill-nav .links a:hover{color:var(--text);background:color-mix(in srgb,var(--text) 6%,transparent)}
.pill-nav .theme-switch{border-color:transparent;background:color-mix(in srgb,var(--text) 6%,transparent)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:9px 16px;border:0;border-radius:999px;background:color-mix(in srgb,var(--text) 8%,transparent);color:var(--text);font-weight:600;font-size:14px;text-decoration:none;white-space:nowrap;transition:transform .15s ease,filter .15s ease}
.btn:hover{transform:translateY(-1px)}
.btn.solid{background:var(--text);color:var(--bg)}
.btn.primary{background:var(--primary);color:var(--primary-ink)}
.btn.big{padding:14px 26px;font-size:17px}

/* Hero. */
.hero{position:relative;text-align:center;padding:88px 0 0;margin-top:-76px;padding-top:164px;background:radial-gradient(60% 50% at 20% 10%,color-mix(in srgb,var(--sky) 22%,transparent),transparent 70%),radial-gradient(55% 45% at 85% 5%,color-mix(in srgb,var(--primary) 22%,transparent),transparent 70%),radial-gradient(50% 40% at 50% 60%,color-mix(in srgb,var(--violet) 10%,transparent),transparent 70%)}
.hero h1{font-size:clamp(44px,8vw,92px);max-width:980px;margin:0 auto;letter-spacing:-.045em;line-height:.98}
.hero h1 span{color:var(--muted)}
.hero .sub{font-size:clamp(18px,2vw,22px);color:var(--muted);max-width:640px;margin:24px auto 0}
.hero-cta{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:34px}
.hero-cta small{color:var(--muted);font-size:14px}
.stage{position:relative;max-width:1080px;margin:72px auto 0;padding:0 24px 0}
.laptop{position:relative;border-radius:22px 22px 0 0;padding:12px 12px 0;background:#000;box-shadow:0 0 0 1px color-mix(in srgb,var(--text) 14%,transparent),0 40px 100px color-mix(in srgb,#000 30%,transparent)}
.laptop img{display:block;width:100%;height:auto;border-radius:10px 10px 0 0}
.laptop-base{height:16px;margin:0 -4%;border-radius:0 0 18px 18px;background:linear-gradient(color-mix(in srgb,var(--text) 30%,var(--bg)),color-mix(in srgb,var(--text) 14%,var(--bg)));box-shadow:0 20px 40px color-mix(in srgb,#000 20%,transparent)}
.stage .phone{position:absolute;right:-8px;bottom:-40px;width:clamp(150px,22%,240px)}

/* Phone mockup. */
.phone{position:relative;aspect-ratio:390/844;padding:9px;border-radius:44px;background:#000;box-shadow:0 0 0 1px color-mix(in srgb,var(--text) 18%,transparent),0 30px 70px color-mix(in srgb,#000 28%,transparent)}
.phone .screen{height:100%;padding-top:12%;border-radius:36px;overflow:hidden;background:var(--bg)}
.phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.phone::before{content:"";position:absolute;z-index:1;top:17px;left:50%;width:28%;height:22px;transform:translateX(-50%);border-radius:999px;background:#000}

/* Theme-specific screenshots. */
:root[data-theme="light"] .shot-dark,:root:not([data-theme="light"]) .shot-light{display:none!important}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]) .shot-dark{display:none!important}:root:not([data-theme="dark"]) .shot-light{display:block!important}}

.works{padding:120px 0 40px;text-align:center}
.works p{font-size:15px;color:var(--muted);font-weight:600}
.works .names{display:flex;justify-content:center;flex-wrap:wrap;gap:12px 44px;margin-top:16px;font-size:22px;font-weight:700;letter-spacing:-.02em;color:color-mix(in srgb,var(--text) 70%,var(--bg))}

section{padding:110px 0}
.head{text-align:center;max-width:760px;margin:0 auto 56px}
.head h2{font-size:clamp(36px,5.4vw,64px)}
.head p{font-size:clamp(17px,1.8vw,21px);color:var(--muted);margin-top:16px}

/* Bento tiles. */
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.tile{position:relative;overflow:hidden;border-radius:30px;padding:36px 32px 0;min-height:600px;display:flex;flex-direction:column}
.tile h3{font-size:34px}
.tile p{color:var(--muted);margin-top:10px;font-size:17px;max-width:30ch}
.tile .phone{width:min(78%,280px);margin:36px auto -120px}
.tile.load{background:${tint('amber',16,5)}}
.tile.sleep{background:${tint('violet',18,6)}}
.tile.recovery{background:${tint('green',18,5)}}
.wide{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:40px;margin-top:20px;padding:0 64px;min-height:560px;border-radius:30px;overflow:hidden}
.wide h3{font-size:clamp(34px,4.4vw,52px)}
.wide p{color:var(--muted);font-size:19px;margin-top:16px;max-width:34ch}
.wide ul{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:10px}
.wide li{display:flex;gap:10px;align-items:center;font-size:16px;font-weight:550}
.wide li .icon{color:var(--primary-text)}
.wide .phone{width:min(100%,290px);justify-self:center;margin:56px 0 -150px}
.wide.food{background:${tint('lilac',16,5)}}
.wide.plan{background:${tint('sky',16,5)}}
.wide.plan .text{order:2}

/* Assistant: a spotlight band with a glow, in either theme. */
.ai{overflow:hidden;background:radial-gradient(50% 60% at 50% 100%,color-mix(in srgb,var(--primary) 20%,transparent),transparent 70%),radial-gradient(40% 40% at 12% 20%,color-mix(in srgb,var(--violet) 16%,transparent),transparent 70%),radial-gradient(40% 40% at 88% 30%,color-mix(in srgb,var(--sky) 14%,transparent),transparent 70%),color-mix(in srgb,var(--panel2) 55%,var(--bg))}
.ai .head h2 span{color:var(--muted)}
.ai-grid{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:28px;align-items:center}
.ai .phone{width:300px}
.ai-card{padding:26px;border-radius:24px;background:color-mix(in srgb,var(--text) 6%,transparent);border:1px solid color-mix(in srgb,var(--text) 10%,transparent)}
.ai-card+.ai-card{margin-top:20px}
.ai-card .icon{width:24px;height:24px;color:var(--primary-text)}
.ai-card h3{font-size:22px;margin:14px 0 8px;letter-spacing:-.02em}
.ai-card p{color:var(--muted);font-size:16px}

.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.step{padding:32px;border-radius:26px;background:var(--panel);border:1px solid var(--line)}
.step b{display:block;font-size:56px;font-weight:700;letter-spacing:-.05em;line-height:1;background:linear-gradient(135deg,var(--primary),var(--sky));-webkit-background-clip:text;background-clip:text;color:transparent}
.step h3{font-size:24px;margin:22px 0 8px;letter-spacing:-.02em}
.step p{color:var(--muted);font-size:16px}

.privacy{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}
.privacy .card{padding:32px;border-radius:26px;background:var(--panel);border:1px solid var(--line)}
.privacy h3{font-size:22px;letter-spacing:-.02em;margin-bottom:14px}
.privacy ul{margin:0;padding:0;list-style:none;display:grid;gap:12px}
.privacy li{display:flex;gap:10px;color:var(--muted);font-size:16px}
.privacy li .icon{color:var(--primary-text);margin-top:3px}
.privacy .card[lang="en"] p{color:var(--muted);font-size:15px;margin-bottom:12px}

.final{text-align:center;padding:140px 0 150px;background:radial-gradient(50% 60% at 50% 100%,color-mix(in srgb,var(--primary) 16%,transparent),transparent 70%)}
.final h2{font-size:clamp(40px,6.4vw,76px)}
.final p{color:var(--muted);font-size:20px;margin:18px auto 34px;max-width:520px}

.site-foot{border-top:1px solid var(--line);padding:30px 0 40px;color:var(--muted);font-size:14px}
.site-foot .wrap{display:flex;gap:20px;flex-wrap:wrap;align-items:center}
.site-foot nav{display:flex;gap:20px;margin-left:auto}
.site-foot a{color:var(--muted);text-decoration:none}.site-foot a:hover{color:var(--text)}

.doc{max-width:760px;padding:72px 24px 96px}
.doc h1{font-size:48px;margin:0 0 24px}.doc h2{font-size:24px;margin:40px 0 10px;letter-spacing:-.02em}
.doc p{color:color-mix(in srgb,var(--text) 82%,var(--bg));margin-bottom:12px}

/* Content fades up as it scrolls in; only with JS and without reduced motion. */
@media (prefers-reduced-motion:no-preference){
  .js .reveal{opacity:0;transform:translateY(28px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.7,.2,1)}
  .js .reveal.in{opacity:1;transform:none}
}

@media (max-width:980px){
  .pill-nav .links{display:none}
  .tiles{grid-template-columns:1fr}
  .tile{min-height:0}
  .tile .phone{width:min(70%,280px);margin-bottom:-160px}
  .tile{padding-bottom:0;height:640px}
  .wide,.wide.plan{grid-template-columns:1fr;padding:40px 28px 0;gap:0}
  .wide.plan .text{order:0}
  .wide .phone{margin:40px auto -170px;width:min(70%,280px)}
  .wide{height:720px}
  .ai-grid{grid-template-columns:1fr;justify-items:center}
  .ai-col{width:100%;max-width:520px}
  .steps,.privacy{grid-template-columns:1fr}
  section{padding:80px 0}
}
@media (max-width:560px){
  .wrap{padding:0 16px}
  .pill-nav{padding-left:12px}
  .logo span{display:none}
  .hero{padding-top:128px}
  .stage{margin-top:48px;padding:0 4px}
  .laptop{padding:6px 6px 0;border-radius:14px 14px 0 0}
  .stage .phone{right:6px;bottom:-30px;width:34%;padding:5px;border-radius:24px}
  .works{padding-top:96px}
  .stage .phone .screen{border-radius:20px}
  .stage .phone::before{top:9px;height:11px}
  .tile{padding:28px 24px 0;height:600px}
  .tile h3{font-size:30px}
  .works .names{font-size:18px;gap:10px 28px}
  .ai .phone{width:250px}
  .site-foot nav{margin-left:0}
}
`;

function shot(file, alt, {eager=false, width=600, height=1299}={}) {
  const load = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return ['dark','light'].map(theme => `<img class="shot-${theme}" src="/site/${file}-${theme}.webp" alt="${alt}" width="${width}" height="${height}" decoding="async" ${load}>`).join('');
}
// The screen starts below a status-bar strip, so the camera cut-out never covers the app.
const phone = (name, alt, opts) => `<div class="phone"><div class="screen">${shot('phone-'+name, alt, opts)}</div></div>`;
const check = text => `<li>${icon('check')}<span>${text}</span></li>`;

const revealScript = `<script>(function(){var r=document.documentElement;r.classList.add('js');
if(!('IntersectionObserver' in window)){r.classList.remove('js');return;}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});})();</script>`;

function sitePage({title, description, lang='cs', body, index=true}) {
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b0e12" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#fbfcfd" media="(prefers-color-scheme: light)">
${themeBoot}
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${ORIGIN}/site/today-dark.webp">
${index ? '' : '<meta name="robots" content="noindex">'}
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>${themeTokens}${themeSwitchCss}${siteCss}</style>
</head>
<body>
<header class="site-head"><nav class="pill-nav" aria-label="Hlavní">
<a class="logo" href="/"><img src="/logo.svg" alt="" width="24" height="24"><span>Loadwise</span></a>
<div class="links"><a href="/#funkce">Funkce</a><a href="/#asistent">Asistent</a><a href="/#jak">Jak to funguje</a><a href="/#soukromi">Soukromí</a></div>
${themeSwitch()}<a class="btn solid" href="/app">Přihlásit se</a>
</nav></header>
${body}
<footer class="site-foot"><div class="wrap">
<span>© Loadwise · petrfitnessdata.eu</span>
<nav aria-label="Dokumenty"><a href="/privacy">Ochrana soukromí</a><a href="/terms">Podmínky</a><a href="/support">Podpora</a></nav>
</div></footer>
${themeSwitchScript}${revealScript}
</body></html>`;
  return new Response(html, {status:200, headers:{'content-type':'text/html; charset=utf-8', 'cache-control':'public, max-age=3600'}});
}

export function overviewPage() {
  return sitePage({
    title: 'Loadwise · trénink, regenerace a výživa na jednom místě',
    description: 'Loadwise spojí tréninky z Intervals.icu, spánek a zdraví z Google Health a jídlo do jednoho denního přehledu a podle toho poradí, co dnes trénovat a kolik jíst.',
    body: `<main>
<div class="hero">
<div class="wrap">
<h1>Trénuj podle toho, <span>jak se dnes máš.</span></h1>
<p class="sub">Loadwise spojí tréninky, spánek a jídlo do jednoho přehledu a každý den ti poradí, kolik zvládneš, kolik sníst a kdy ubrat.</p>
<div class="hero-cta"><a class="btn primary big" href="/app">Přihlásit se</a><small>Zatím jen na pozvánku</small></div>
</div>
<div class="stage reveal">
<div class="laptop">${shot('today', 'Loadwise na počítači: obrazovka Dnes se spánkem, námahou, kaloriemi, pitím a tréninky', {eager:true, width:1440, height:900})}</div>
<div class="laptop-base"></div>
${phone('today', 'Loadwise v telefonu: obrazovka Dnes', {eager:true})}
</div>
</div>

<div class="works wrap reveal"><p>Propojeno s</p><div class="names"><span>Intervals.icu</span><span>Google Health</span><span>Google Sheets</span></div></div>

<section id="funkce"><div class="wrap">
<div class="head reveal"><h2>Ráno víš, na čem jsi.</h2><p>Tělo posílá signály celý den. Loadwise z nich udělá pár jasných čísel a jedno doporučení.</p></div>
<div class="tiles">
<div class="tile load reveal"><h3>Zátěž</h3><p>Kondice, únava a forma z každého tréninku. Uvidíš, jestli rosteš, nebo jen sbíráš únavu.</p>${phone('training', 'Obrazovka Trénink: kondice, únava a forma')}</div>
<div class="tile sleep reveal"><h3>Spánek</h3><p>Kolik jsi spal, jaký máš spánkový dluh a jak pravidelně chodíš spát.</p>${phone('recovery', 'Obrazovka Zdraví: spánek a regenerace')}</div>
<div class="tile recovery reveal"><h3>Regenerace</h3><p>HRV a klidový tep proti tvému normálu. Když tělo nestíhá, řekne ti to dřív než výkon.</p>${phone('today', 'Obrazovka Dnes: denní signály')}</div>
</div>
<div class="wide food reveal"><div class="text"><h3>Víš, kolik sníst.</h3><p>Cíl kalorií a maker se řídí tím, co tě dnes čeká. Jídlo zapíšeš z fotky, čárového kódu nebo pár slovy.</p><ul>${check('Kalorie a makra podle tréninku')}${check('Zápis z fotky, kódu i textu')}${check('Pití jedním klepnutím')}</ul></div>${phone('nutrition', 'Obrazovka Výživa: snědeno, zbývá, makra a pití')}</div>
<div class="wide plan reveal"><div class="text"><h3>Plán, který se přizpůsobí.</h3><p>Tréninky na kolo, běh i posilovnu na celý týden, podle toho, kolik máš kdy času a jak se cítíš.</p><ul>${check('Týdenní plán na klik')}${check('Posilovna se sériemi a technikou')}${check('Synchronizace s Intervals.icu')}</ul></div>${phone('workouts', 'Obrazovka Plán: plán tréninků na týden')}</div>
</div></section>

<section id="asistent" class="ai"><div class="wrap">
<div class="head reveal"><h2><span>Ptej se.</span> Asistent zná tvoje data.</h2><p>Osobní trenér, který vidí tvůj spánek, tréninky i jídlo a radí podle nich, ne obecně.</p></div>
<div class="ai-grid">
<div class="ai-col reveal"><div class="ai-card">${icon('chat')}<h3>Odpovědi z tvých dat</h3><p>„Jak mám jet trénink, když jsem spal 6 hodin?“ Odpověď vychází z tvých čísel.</p></div><div class="ai-card">${icon('check')}<h3>Návrhy na jedno klepnutí</h3><p>Každou úpravu tréninku nebo jídla potvrdíš, odmítneš nebo probereš.</p></div></div>
<div class="reveal">${phone('coach', 'Osobní asistent v aplikaci: Co dnes upravíme?')}</div>
<div class="ai-col reveal"><div class="ai-card">${icon('calendar')}<h3>Celý týden v kontextu</h3><p>Probere s tebou den i týden a přeplánuje, co je potřeba.</p></div><div class="ai-card">${icon('spark')}<h3>Revize dne</h3><p>Projde s tebou celý den a navrhne, co upravit.</p></div></div>
</div>
</div></section>

<section id="jak"><div class="wrap">
<div class="head reveal"><h2>Za pár minut připraveno.</h2></div>
<div class="steps">
<div class="step reveal"><b>1</b><h3>Přihlas se Googlem</h3><p>Účet vznikne s pozvánkou, žádné nové heslo.</p></div>
<div class="step reveal"><b>2</b><h3>Propoj svoje služby</h3><p>Intervals.icu pro tréninky, Google Health pro spánek, zdraví a jídlo. Jen to, co sám povolíš.</p></div>
<div class="step reveal"><b>3</b><h3>Ráno otevři Dnes</h3><p>Jak na tom jsi, co tě čeká a kolik dnes sníst.</p></div>
</div>
</div></section>

<section id="soukromi"><div class="wrap">
<div class="head reveal"><h2>Tvoje data slouží jen tobě.</h2></div>
<div class="privacy">
<div class="card reveal"><h3>Co Loadwise s daty dělá</h3><ul>
${check('Čte jen data ze služeb, ke kterým mu sám dáš přístup.')}
${check('Používá je jen pro funkce, které si vyžádáš: přehled, plán a výživu.')}
${check('Data neprodává a nepoužívá k reklamě.')}
${check('Do Google Health zapisuje jen jídlo a pití, které si sám zapíšeš.')}
</ul><p style="margin-top:20px"><a href="/privacy">Celé zásady ochrany soukromí</a></p></div>
<div class="card reveal" lang="en"><h3>Google Health data disclosure</h3>
<p>Loadwise (Petr Fitness Data) is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows.</p>
<p>With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p>
<p style="margin:0">The service can process training and fitness data from connected services, including Google data and Google Sheets data that the account owner has authorized, in order to provide these requested workflows.</p></div>
</div>
</div></section>

<section class="final"><div class="wrap reveal">
<h2>Máš pozvánku?</h2>
<p>Loadwise je zatím jen pro pozvané. Přihlas se Google účtem, na který pozvánka přišla.</p>
<a class="btn primary big" href="/app">Přihlásit se</a>
</div></section>
</main>`
  });
}

const doc = (title, html) => sitePage({title: `${title} · Loadwise`, description: `${title} for Loadwise (petrfitnessdata.eu).`, lang: 'en', body: `<main class="wrap doc"><h1>${title}</h1>${html}</main>`});

export function privacyPage() {
  return doc('Privacy Policy', `<p><strong>Loadwise</strong> (Petr Fitness Data, petrfitnessdata.eu) is a personal training service for training, recovery and nutrition.</p><h2>What data the service may access</h2><p>When authorized by the account owner, the service may access fitness and training information from connected Google services and other configured services. This can include Google Sheet workout data, training history, planned workouts, cycling context, recovery metrics, nutrition information, and other fitness data needed for the requested workflows.</p><h2>How Google data is used</h2><p>Google user data is used only to provide the training and nutrition workflows requested by the account owner, such as reading and updating the configured workout spreadsheet, processing authorized fitness data, reading authorized nutrition logs, and adding nutrition logs that the account owner asks the service to record. The service does not sell Google user data and does not use it for advertising.</p><h2>Storage and sharing</h2><p>Data may be processed and stored in the private health-api backend, its configured database, and connected services such as the account owner's Google Sheet. Data may be transmitted between these configured services when necessary to provide the requested functionality. The service does not intentionally disclose personal data to unrelated third parties.</p><h2>Security</h2><p>OAuth credentials and API secrets are intended to be stored as private service secrets rather than in the source code repository. Access to the service is controlled by the configured authentication mechanisms.</p><h2>Changes</h2><p>This policy may be updated when the service or its data practices change. The current version is published on this page.</p><h2>Contact</h2><p>For support or privacy questions, use the <a href="/support">Support</a> page.</p>`);
}

export function termsPage() {
  return doc('Terms of Use', `<p>Loadwise is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.</p>`);
}

export function supportPage() {
  return doc('Support', `<p>Support for Loadwise is provided through the project repository and its maintainer. Include the affected tool name, approximate time, and non-sensitive error message when reporting a problem. Never include API keys, OAuth refresh tokens, or other secrets in a support request.</p>`);
}
