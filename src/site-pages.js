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
/* Small cards (assistant, steps, privacy) share one surface, radius and hairline in both themes. */
.ai-card{padding:26px;border-radius:24px;background:var(--panel);border:1px solid var(--line);box-shadow:0 1px 2px color-mix(in srgb,#000 5%,transparent)}
.ai-card+.ai-card{margin-top:20px}
.ai-card .icon{width:24px;height:24px;color:var(--primary-text)}
.ai-card h3{font-size:22px;margin:14px 0 8px;letter-spacing:-.02em}
.ai-card p{color:var(--muted);font-size:16px}

.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.step{padding:32px;border-radius:24px;background:var(--panel);border:1px solid var(--line);box-shadow:0 1px 2px color-mix(in srgb,#000 5%,transparent)}
.step b{display:block;font-size:56px;font-weight:700;letter-spacing:-.05em;line-height:1;background:linear-gradient(135deg,var(--primary),var(--sky));-webkit-background-clip:text;background-clip:text;color:transparent}
.step h3{font-size:24px;margin:22px 0 8px;letter-spacing:-.02em}
.step p{color:var(--muted);font-size:16px}

.privacy{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}
.privacy .card{padding:32px;border-radius:24px;background:var(--panel);border:1px solid var(--line);box-shadow:0 1px 2px color-mix(in srgb,#000 5%,transparent)}
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

// Language: ?lang= in the link, then the lw-lang cookie (shared with the app), then the
// browser's first language (Czech or Slovak → cs, anything else → en). The switch in the top
// bar sets the cookie, or clears it when you pick the browser's own language.
export function siteLang(request) {
  const url = new URL(request.url), asked = url.searchParams.get('lang');
  if (asked === 'cs' || asked === 'en') return asked;
  const cookie = /(?:^|;\s*)lw-lang=(cs|en)/.exec(request.headers.get('cookie') || '');
  return cookie ? cookie[1] : deviceLang(request);
}
function deviceLang(request) {
  const first = (request.headers.get('accept-language') || 'cs').split(',')[0].trim().toLowerCase();
  return /^(cs|sk)\b/.test(first) ? 'cs' : 'en';
}

function shot(file, alt, lang, {eager=false, width=600, height=1299}={}) {
  const load = eager ? 'fetchpriority="high"' : 'loading="lazy"', suffix = lang === 'en' ? '-en' : '';
  return ['dark','light'].map(theme => `<img class="shot-${theme}" src="/site/${file}${suffix}-${theme}.webp" alt="${alt}" width="${width}" height="${height}" decoding="async" ${load}>`).join('');
}
// The screen starts below a status-bar strip, so the camera cut-out never covers the app.
const phone = (name, alt, lang, opts) => `<div class="phone"><div class="screen">${shot('phone-'+name, alt, lang, opts)}</div></div>`;
const check = text => `<li>${icon('check')}<span>${text}</span></li>`;

const revealScript = `<script>(function(){var r=document.documentElement;r.classList.add('js');
if(!('IntersectionObserver' in window)){r.classList.remove('js');return;}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});})();</script>`;

const langSwitch = lang => `<div class="theme-switch lang-switch" role="radiogroup" aria-label="${lang === 'en' ? 'Language' : 'Jazyk'}">${[['cs','CZ','Čeština'],['en','EN','English']].map(([code, label, name]) => `<button type="button" role="radio" data-lang-choice="${code}" lang="${code}" aria-label="${name}" aria-checked="${code === lang}">${label}</button>`).join('')}</div>`;
const langSwitchScript = `<script>(function(){document.addEventListener('click',function(e){var b=e.target.closest('[data-lang-choice]');if(!b)return;
var c=b.dataset.langChoice,dev=document.documentElement.dataset.deviceLang;
document.cookie=c===dev?'lw-lang=; path=/; max-age=0; samesite=lax':'lw-lang='+c+'; path=/; max-age=31536000; samesite=lax';
var u=new URL(location.href);u.searchParams.delete('lang');location.replace(u.pathname+u.search+u.hash);});})();</script>`;

function sitePage({title, description, lang, device, path, body, index=true}) {
  const t = (cs, en) => lang === 'en' ? en : cs;
  const html = `<!doctype html>
<html lang="${lang}" data-device-lang="${device}">
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
<meta property="og:image" content="${ORIGIN}/site/today${lang === 'en' ? '-en' : ''}-dark.webp">
<meta property="og:locale" content="${t('cs_CZ', 'en_US')}">
<link rel="alternate" hreflang="cs" href="${ORIGIN}${path}?lang=cs">
<link rel="alternate" hreflang="en" href="${ORIGIN}${path}?lang=en">
<link rel="alternate" hreflang="x-default" href="${ORIGIN}${path}">
${index ? '' : '<meta name="robots" content="noindex">'}
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>${themeTokens}${themeSwitchCss}${siteCss}</style>
</head>
<body>
<header class="site-head"><nav class="pill-nav" aria-label="${t('Hlavní', 'Main')}">
<a class="logo" href="/"><img src="/logo.svg" alt="" width="24" height="24"><span>Loadwise</span></a>
<div class="links"><a href="/#funkce">${t('Funkce', 'Features')}</a><a href="/#asistent">${t('Asistent', 'Assistant')}</a><a href="/#jak">${t('Jak to funguje', 'How it works')}</a><a href="/#soukromi">${t('Soukromí', 'Privacy')}</a></div>
${langSwitch(lang)}${themeSwitch(lang)}<a class="btn solid" href="/app">${t('Přihlásit se', 'Sign in')}</a>
</nav></header>
${body}
<footer class="site-foot"><div class="wrap">
<span>© Loadwise · petrfitnessdata.eu</span>
<nav aria-label="${t('Dokumenty', 'Documents')}"><a href="/privacy">${t('Ochrana soukromí', 'Privacy Policy')}</a><a href="/terms">${t('Podmínky', 'Terms')}</a><a href="/support">${t('Podpora', 'Support')}</a></nav>
</div></footer>
${themeSwitchScript}${langSwitchScript}${revealScript}
</body></html>`;
  // The same URL serves both languages, so caches must key on the cookie and the browser language.
  return new Response(html, {status:200, headers:{'content-type':'text/html; charset=utf-8', 'content-language':lang, 'vary':'Cookie, Accept-Language', 'cache-control':'private, max-age=0, must-revalidate'}});
}

// Pages take the request (to pick the language) or nothing (Czech, for tests and previews).
function pageLang(request) {
  return request ? {lang: siteLang(request), device: deviceLang(request)} : {lang: 'cs', device: 'cs'};
}

export function overviewPage(request) {
  const {lang, device} = pageLang(request), t = (cs, en) => lang === 'en' ? en : cs;
  const ph = (name, alt, opts) => phone(name, alt, lang, opts);
  return sitePage({lang, device, path: '/',
    title: t('Loadwise · trénink, regenerace a výživa na jednom místě', 'Loadwise · training, recovery and nutrition in one place'),
    description: t('Loadwise spojí tréninky z Intervals.icu, spánek a zdraví z Google Health a jídlo do jednoho denního přehledu a podle toho poradí, co dnes trénovat a kolik jíst.',
      'Loadwise brings workouts from Intervals.icu, sleep and health from Google Health, and food into one daily view, then tells you what to train today and how much to eat.'),
    body: `<main>
<div class="hero">
<div class="wrap">
<h1>${t('Trénuj podle toho, <span>jak se dnes máš.</span>', 'Train for how <span>you feel today.</span>')}</h1>
<p class="sub">${t('Loadwise spojí tréninky, spánek a jídlo do jednoho přehledu a každý den ti poradí, kolik zvládneš, kolik sníst a kdy ubrat.', 'Loadwise brings your workouts, sleep and food into one view and tells you every day how much you can handle, how much to eat and when to back off.')}</p>
<div class="hero-cta"><a class="btn primary big" href="/app">${t('Přihlásit se', 'Sign in')}</a><small>${t('Zatím jen na pozvánku', 'Invite only for now')}</small></div>
</div>
<div class="stage reveal">
<div class="laptop">${shot('today', t('Loadwise na počítači: obrazovka Dnes se spánkem, námahou, kaloriemi, pitím a tréninky', 'Loadwise on a computer: the Today screen with sleep, strain, calories, hydration and workouts'), lang, {eager:true, width:1440, height:900})}</div>
<div class="laptop-base"></div>
${ph('today', t('Loadwise v telefonu: obrazovka Dnes', 'Loadwise on a phone: the Today screen'), {eager:true})}
</div>
</div>

<div class="works wrap reveal"><p>${t('Propojeno s', 'Works with')}</p><div class="names"><span>Intervals.icu</span><span>Google Health</span></div></div>

<section id="funkce"><div class="wrap">
<div class="head reveal"><h2>${t('Ráno víš, na čem jsi.', 'Know where you stand every morning.')}</h2><p>${t('Tělo posílá signály celý den. Loadwise z nich udělá pár jasných čísel a jedno doporučení.', 'Your body sends signals all day. Loadwise turns them into a few clear numbers and one recommendation.')}</p></div>
<div class="tiles">
<div class="tile load reveal"><h3>${t('Zátěž', 'Load')}</h3><p>${t('Kondice, únava a forma z každého tréninku. Uvidíš, jestli rosteš, nebo jen sbíráš únavu.', 'Fitness, fatigue and form from every workout. See whether you are getting stronger or just piling up fatigue.')}</p>${ph('training', t('Obrazovka Trénink: kondice, únava a forma', 'The Training screen: fitness, fatigue and form'))}</div>
<div class="tile sleep reveal"><h3>${t('Spánek', 'Sleep')}</h3><p>${t('Kolik jsi spal, jaký máš spánkový dluh a jak pravidelně chodíš spát.', 'How long you slept, how much sleep debt you carry and how regular your bedtime is.')}</p>${ph('recovery', t('Obrazovka Zdraví: spánek a regenerace', 'The Health screen: sleep and recovery'))}</div>
<div class="tile recovery reveal"><h3>${t('Regenerace', 'Recovery')}</h3><p>${t('HRV a klidový tep proti tvému normálu. Když tělo nestíhá, řekne ti to dřív než výkon.', 'HRV and resting heart rate against your normal. When your body is not keeping up, you hear it before your performance drops.')}</p>${ph('today', t('Obrazovka Dnes: denní signály', 'The Today screen: daily signals'))}</div>
</div>
<div class="wide food reveal"><div class="text"><h3>${t('Víš, kolik sníst.', 'Know how much to eat.')}</h3><p>${t('Cíl kalorií a maker se řídí tím, co tě dnes čeká. Jídlo zapíšeš z fotky, čárového kódu nebo pár slovy.', 'Your calorie and macro targets follow what your day holds. Log food from a photo, a barcode or a few words.')}</p><ul>${check(t('Kalorie a makra podle tréninku', 'Calories and macros that follow your training'))}${check(t('Zápis z fotky, kódu i textu', 'Log from a photo, barcode or text'))}${check(t('Pití jedním klepnutím', 'Drinks in one tap'))}</ul></div>${ph('nutrition', t('Obrazovka Výživa: snědeno, zbývá, makra a pití', 'The Nutrition screen: eaten, remaining, macros and drinks'))}</div>
<div class="wide plan reveal"><div class="text"><h3>${t('Plán, který se přizpůsobí.', 'A plan that adapts.')}</h3><p>${t('Tréninky na kolo, běh i posilovnu na celý týden, podle toho, kolik máš kdy času a jak se cítíš.', 'Rides, runs and gym sessions for the whole week, built around the time you have and how you feel.')}</p><ul>${check(t('Týdenní plán na klik', 'A weekly plan in one click'))}${check(t('Posilovna se sériemi a technikou', 'Gym sessions with sets and technique'))}${check(t('Synchronizace s Intervals.icu', 'Synced with Intervals.icu'))}</ul></div>${ph('workouts', t('Obrazovka Plán: plán tréninků na týden', 'The Plan screen: the week of workouts'))}</div>
</div></section>

<section id="asistent" class="ai"><div class="wrap">
<div class="head reveal"><h2>${t('<span>Ptej se.</span> Asistent zná tvoje data.', '<span>Just ask.</span> The assistant knows your data.')}</h2><p>${t('Osobní trenér, který vidí tvůj spánek, tréninky i jídlo a radí podle nich, ne obecně.', 'A personal coach that sees your sleep, workouts and food and gives advice based on them, not generic tips.')}</p></div>
<div class="ai-grid">
<div class="ai-col reveal"><div class="ai-card">${icon('chat')}<h3>${t('Odpovědi z tvých dat', 'Answers from your data')}</h3><p>${t('„Jak mám jet trénink, když jsem spal 6 hodin?“ Odpověď vychází z tvých čísel.', '“How should I ride today after 6 hours of sleep?” The answer comes from your numbers.')}</p></div><div class="ai-card">${icon('check')}<h3>${t('Návrhy na jedno klepnutí', 'One-tap suggestions')}</h3><p>${t('Každou úpravu tréninku nebo jídla potvrdíš, odmítneš nebo probereš.', 'Confirm, reject or discuss every change to a workout or meal.')}</p></div></div>
<div class="reveal">${ph('coach', t('Osobní asistent v aplikaci: Co dnes upravíme?', 'The personal assistant in the app: What shall we adjust today?'))}</div>
<div class="ai-col reveal"><div class="ai-card">${icon('calendar')}<h3>${t('Celý týden v kontextu', 'The whole week in context')}</h3><p>${t('Probere s tebou den i týden a přeplánuje, co je potřeba.', 'It goes through the day and the week with you and replans what needs it.')}</p></div><div class="ai-card">${icon('spark')}<h3>${t('Revize dne', 'Day review')}</h3><p>${t('Projde s tebou celý den a navrhne, co upravit.', 'It walks through your whole day and suggests what to change.')}</p></div></div>
</div>
</div></section>

<section id="jak"><div class="wrap">
<div class="head reveal"><h2>${t('Za pár minut připraveno.', 'Ready in a few minutes.')}</h2></div>
<div class="steps">
<div class="step reveal"><b>1</b><h3>${t('Přihlas se Googlem', 'Sign in with Google')}</h3><p>${t('Účet vznikne s pozvánkou, žádné nové heslo.', 'Your account comes with the invitation, no new password.')}</p></div>
<div class="step reveal"><b>2</b><h3>${t('Propoj svoje služby', 'Connect your services')}</h3><p>${t('Intervals.icu pro tréninky, Google Health pro spánek, zdraví a jídlo. Jen to, co sám povolíš.', 'Intervals.icu for workouts, Google Health for sleep, health and food. Only what you allow.')}</p></div>
<div class="step reveal"><b>3</b><h3>${t('Ráno otevři Dnes', 'Open Today in the morning')}</h3><p>${t('Jak na tom jsi, co tě čeká a kolik dnes sníst.', 'How you are doing, what is ahead and how much to eat today.')}</p></div>
</div>
</div></section>

<section id="soukromi"><div class="wrap">
<div class="head reveal"><h2>${t('Tvoje data slouží jen tobě.', 'Your data works only for you.')}</h2></div>
<div class="privacy">
<div class="card reveal"><h3>${t('Co Loadwise s daty dělá', 'What Loadwise does with your data')}</h3><ul>
${check(t('Čte jen data ze služeb, ke kterým mu sám dáš přístup.', 'It reads data only from the services you give it access to.'))}
${check(t('Používá je jen pro funkce, které si vyžádáš: přehled, plán a výživu.', 'It uses them only for the features you ask for: your overview, plan and nutrition.'))}
${check(t('Data neprodává a nepoužívá k reklamě.', 'It does not sell your data or use it for advertising.'))}
${check(t('Do Google Health zapisuje jen jídlo a pití, které si sám zapíšeš.', 'It writes to Google Health only the food and drinks you log yourself.'))}
</ul><p style="margin-top:20px"><a href="/privacy">${t('Celé zásady ochrany soukromí', 'Full privacy policy')}</a></p></div>
<div class="card reveal" lang="en"><h3>Google Health data disclosure</h3>
<p>Loadwise (Petr Fitness Data) is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows.</p>
<p>With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p>
<p style="margin:0">The service can process training and fitness data from connected services, including Google Health data that the account owner has authorized, in order to provide these requested workflows.</p></div>
</div>
</div></section>

<section class="final"><div class="wrap reveal">
<h2>${t('Máš pozvánku?', 'Got an invitation?')}</h2>
<p>${t('Loadwise je zatím jen pro pozvané. Přihlas se Google účtem, na který pozvánka přišla.', 'Loadwise is invite only for now. Sign in with the Google account the invitation was sent to.')}</p>
<a class="btn primary big" href="/app">${t('Přihlásit se', 'Sign in')}</a>
</div></section>
</main>`
  });
}

// Policy pages. The English text is the reference version (Google verification reads it);
// the Czech one says the same.
function doc(request, path, title, html) {
  const {lang, device} = pageLang(request), pick = x => lang === 'en' ? x.en : x.cs;
  return sitePage({lang, device, path, title: `${pick(title)} · Loadwise`, description: lang === 'en' ? `${title.en} for Loadwise (petrfitnessdata.eu).` : `${title.cs} pro Loadwise (petrfitnessdata.eu).`,
    body: `<main class="wrap doc"><h1>${pick(title)}</h1>${pick(html)}</main>`});
}

export function privacyPage(request) {
  return doc(request, '/privacy', {cs: 'Zásady ochrany soukromí', en: 'Privacy Policy'}, {
    en: `<p><strong>Loadwise</strong> (Petr Fitness Data, petrfitnessdata.eu) is a personal training service for training, recovery and nutrition.</p><h2>What data the service may access</h2><p>When authorized by the account owner, the service may access fitness and training information from connected Google services and other configured services. This can include training history, planned workouts, cycling context, recovery metrics, nutrition information, and other fitness data needed for the requested workflows.</p><h2>How Google data is used</h2><p>Google user data is used only to provide the training and nutrition workflows requested by the account owner, such as processing authorized fitness data, reading authorized nutrition logs, and adding nutrition logs that the account owner asks the service to record. The service does not sell Google user data and does not use it for advertising.</p><h2>Storage and sharing</h2><p>Data may be processed and stored in the private health-api backend, its configured database, and connected services such as Intervals.icu and Google Health. Data may be transmitted between these configured services when necessary to provide the requested functionality. The service does not intentionally disclose personal data to unrelated third parties.</p><h2>Your data and deleting it</h2><p>In the app under Settings → Account you can download everything the service stores about you (a JSON file) and delete your account. Deleting removes your profile, entries, workouts, chat and connections from the service and revokes its access to Google Health. Data kept by Google Health or Intervals.icu themselves stays with them.</p><h2>Security</h2><p>OAuth credentials and API secrets are intended to be stored as private service secrets rather than in the source code repository. Access to the service is controlled by the configured authentication mechanisms.</p><h2>Changes</h2><p>This policy may be updated when the service or its data practices change. The current version is published on this page.</p><h2>Contact</h2><p>For support or privacy questions, use the <a href="/support">Support</a> page.</p>`,
    cs: `<p><strong>Loadwise</strong> (Petr Fitness Data, petrfitnessdata.eu) je osobní služba pro trénink, regeneraci a výživu.</p><h2>K jakým datům může služba přistupovat</h2><p>S povolením majitele účtu může služba číst údaje o kondici a tréninku z propojených služeb Google a dalších nastavených služeb. Patří sem historie tréninků, plánované tréninky, cyklistický kontext, údaje o regeneraci, výživě a další data o kondici potřebná pro funkce, které si majitel účtu vyžádá.</p><h2>Jak se používají data z Googlu</h2><p>Data uživatelů z Googlu slouží jen k tréninkovým a výživovým funkcím, které si majitel účtu vyžádá, například ke zpracování povolených dat o kondici, čtení povolených záznamů o jídle a přidávání záznamů o jídle, které si majitel účtu nechá zapsat. Služba data uživatelů z Googlu neprodává a nepoužívá je k reklamě.</p><h2>Uložení a sdílení</h2><p>Data se mohou zpracovávat a ukládat v soukromém backendu health-api, v jeho databázi a v propojených službách, jako jsou Intervals.icu a Google Health. Mezi těmito službami se data přenášejí jen tehdy, když je to pro požadovanou funkci potřeba. Služba osobní data záměrně nepředává nesouvisejícím třetím stranám.</p><h2>Tvoje data a jejich smazání</h2><p>V aplikaci v Nastavení → Účet si stáhneš všechno, co o tobě služba ukládá (soubor JSON), a můžeš smazat svůj účet. Smazání odstraní ze služby profil, záznamy, tréninky, chat i propojení a zruší její přístup ke Google Health. Data uložená přímo v Google Health nebo Intervals.icu zůstávají u nich.</p><h2>Zabezpečení</h2><p>Přihlašovací údaje OAuth a klíče API se ukládají jako soukromá tajemství služby, ne do repozitáře se zdrojovým kódem. Přístup ke službě řídí nastavené přihlašování.</p><h2>Změny</h2><p>Zásady se mohou změnit, když se změní služba nebo způsob práce s daty. Aktuální verze je vždy na této stránce.</p><h2>Kontakt</h2><p>S dotazy k podpoře nebo soukromí použij stránku <a href="/support">Podpora</a>.</p><p class="muted">Závazné je anglické znění: <a href="/privacy?lang=en">Privacy Policy</a>.</p>`
  });
}

export function termsPage(request) {
  return doc(request, '/terms', {cs: 'Podmínky použití', en: 'Terms of Use'}, {
    en: `<p>Loadwise is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.</p>`,
    cs: `<p>Loadwise slouží k organizaci a plánování osobního tréninku. Za správnost propojených dat a za rozhodnutí, jestli je vygenerovaný trénink pro tebe vhodný, odpovídáš ty. Aplikace neposkytuje lékařskou diagnózu ani pomoc v nouzi. Používání aplikace vyžaduje přístup k propojené službě health-api.</p><p class="muted">Závazné je anglické znění: <a href="/terms?lang=en">Terms of Use</a>.</p>`
  });
}

export function supportPage(request) {
  return doc(request, '/support', {cs: 'Podpora', en: 'Support'}, {
    en: `<p>Support for Loadwise is provided through the project repository and its maintainer. Include the affected tool name, approximate time, and non-sensitive error message when reporting a problem. Never include API keys, OAuth refresh tokens, or other secrets in a support request.</p>`,
    cs: `<p>Podporu pro Loadwise zajišťuje repozitář projektu a jeho správce. Když hlásíš problém, uveď dotčený nástroj, přibližný čas a chybovou hlášku bez citlivých údajů. Nikdy do žádosti o podporu nevkládej klíče API, obnovovací tokeny OAuth ani jiná tajemství.</p>`
  });
}
