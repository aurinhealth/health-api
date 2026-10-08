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
.doc ul,.doc ol{color:color-mix(in srgb,var(--text) 82%,var(--bg));margin:0 0 12px;padding-left:22px}.doc li{margin-bottom:6px}

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
<div class="links"><a href="/#funkce">${t('Funkce', 'Features')}</a><a href="/#asistent">${t('AI', 'AI')}</a><a href="/#jak">${t('Jak to funguje', 'How it works')}</a><a href="/#soukromi">${t('Soukromí', 'Privacy')}</a></div>
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

// Google's policies ask the privacy policy to name every party that receives data, how it is stored and
// secured, and what happens on disconnecting and deleting; the support page is the help on managing and
// deleting data. Keep both in step with the code: scopes in google-scopes.js, the wellness copy in
// wellness-sync.js, the download and deletion in account-data.js.
const UPDATED = {cs: '8. října 2026', en: '8 October 2026'};
// The controller's address for questions and data requests (privacy policy and support page).
const CONTACT_EMAIL = 'petrbouma1994@icloud.com';
const API_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy';
const HEALTH_POLICY = 'https://developers.google.com/health/policies/health-api-developer-user-data-policy';
const GOOGLE_CONNECTIONS = 'https://myaccount.google.com/connections';

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
<div class="head reveal"><h2>${t('<span>Ptej se.</span> AI zná tvoje data.', '<span>Just ask.</span> AI knows your data.')}</h2><p>${t('Osobní trenér, který vidí tvůj spánek, tréninky i jídlo a radí podle nich, ne obecně.', 'A personal coach that sees your sleep, workouts and food and gives advice based on them, not generic tips.')}</p></div>
<div class="ai-grid">
<div class="ai-col reveal"><div class="ai-card">${icon('chat')}<h3>${t('Odpovědi z tvých dat', 'Answers from your data')}</h3><p>${t('„Jak mám jet trénink, když jsem spal 6 hodin?“ Odpověď vychází z tvých čísel.', '“How should I ride today after 6 hours of sleep?” The answer comes from your numbers.')}</p></div><div class="ai-card">${icon('check')}<h3>${t('Návrhy na jedno klepnutí', 'One-tap suggestions')}</h3><p>${t('Každou úpravu tréninku nebo jídla potvrdíš, odmítneš nebo probereš.', 'Confirm, reject or discuss every change to a workout or meal.')}</p></div></div>
<div class="reveal">${ph('coach', t('AI v aplikaci: Co dnes upravíme?', 'AI in the app: What shall we adjust today?'))}</div>
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
${check(t('Do Google Health zapisuje jen jídlo a pití, které si zapíšeš, a když to povolíš, i váhu.', 'It writes to Google Health only the food and drinks you log and, if you allow it, your weight.'))}
${check(t('Účet i se všemi daty kdykoli smažeš v Nastavení.', 'You can delete your account and all its data in Settings at any time.'))}
</ul><p style="margin-top:20px"><a href="/privacy">${t('Celé zásady ochrany soukromí', 'Full privacy policy')}</a></p></div>
<div class="card reveal" lang="en"><h3>Google Health data disclosure</h3>
<p>Loadwise (Petr Fitness Data) is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows.</p>
<p>With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p>
<p style="margin:0">The service can process training and fitness data from connected services, including Google Health data that the account owner has authorized, in order to provide these requested workflows.</p>
<p style="margin:12px 0 0">Two optional permissions are requested separately: adding weight records to Google Health (weight you log in Loadwise or Intervals.icu) and reading your date of birth from your Google Account to fill in your age.</p>
<p style="margin:12px 0 0">Loadwise’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="${API_POLICY}">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
<p style="margin:12px 0 0">The use of information received from Google Health API and/or Developer Tools will adhere to the <a href="${HEALTH_POLICY}">Google Health API Developer and User Data Policy</a>, including the Limited Use requirements.</p></div>
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

// Sign in with Apple and e-mail codes are described only once they are set up (signIn from the
// entrypoint); passkeys need no setup and are always there.
export function privacyPage(request, {apple = false, email = false} = {}) {
  const methods = {en: email ? 'Google, a passkey or a one-time code sent to your email' : 'Google or a passkey', cs: email ? 'přes Google, přístupovým klíčem nebo jednorázovým kódem z e-mailu' : 'přes Google nebo přístupovým klíčem'};
  return doc(request, '/privacy', {cs: 'Zásady ochrany soukromí', en: 'Privacy Policy'}, {
    en: `<p class="muted">Last updated: ${UPDATED.en}</p>
<p><strong>Loadwise</strong> (Petr Fitness Data, petrfitnessdata.eu) is a personal service for training, recovery and nutrition. The controller of your personal data is Petr Bouma, a private individual in the Czech Republic (the operator, “we” below). You can reach the operator at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Loadwise is currently available only by personal invitation.</p>
<h2>In short</h2>
<ul>
<li>We use your data only to provide the Loadwise features you use.</li>
<li>We do not sell your data, use it for advertising or share it with data brokers.</li>
<li>You choose which services to connect. You can disconnect them, or delete your account and all its data, in the app at any time.</li>
</ul>
<h2>Data we collect</h2>
<p><strong>Your account.</strong> When you sign in with Google, we receive your email address and your Google account ID. We use them to recognize you and check your invitation, and we record when you last signed in.${apple ? ' When you sign in with Apple, we receive your Apple ID user identifier, the email address Apple shares with us (it can be a private relay address) and, the first time, your name if you choose to share it.' : ''}</p>
<p><strong>Passkeys.</strong> When you add a passkey, we store its public key, its identifier, a random identifier of your account that the passkey keeps, the name of the device or password manager it was made in, and when it was added and last used. The private key stays on your device or in your password manager, and your fingerprint, face or screen lock never leaves your device.${email ? ' When you add a passkey, we send you an email about it, so you notice one you did not add.' : ''}</p>${email ? `
<p><strong>Codes sent by email.</strong> When you ask for a sign-in code, we send a six-digit code to the address you entered, if it has access to Loadwise. We keep only a keyed hash of the code for 10 minutes, and counters that limit how many codes and attempts an address gets; these counters are deleted two days after the last code. A code sent to a new address also confirms changing your account’s email in Settings → Account; the old address then gets a notice of the change.</p>` : ''}
<p><strong>Google Health</strong>, only if you connect it and allow it on Google’s consent screen:</p>
<ul>
<li>activity and fitness: steps, distance, floors, active minutes, active zone minutes, active energy burned, time in heart rate zones, sedentary periods and exercise sessions;</li>
<li>health metrics and measurements: heart rate, resting heart rate, heart rate variability, oxygen saturation, respiratory rate, VO2 max, weight, height and body fat;</li>
<li>sleep: sleep sessions and sleep stages;</li>
<li>nutrition: food and drink logs.</li>
</ul>
<p>Two optional permissions are asked for separately: reading your date of birth from your Google Account, to fill in your age, and writing your weight to Google Health.</p>
<p><strong>Intervals.icu</strong>, only if you connect it with your API key: your activities and their details, planned workouts and events, wellness data and sport settings.</p>
<p><strong>What you enter in Loadwise:</strong> your profile (such as age, height, weight, sports, goals and the time you have for training), food and drinks, workouts and how they went, notes, and your conversations with the assistant.</p>
<p><strong>On your device:</strong> a sign-in cookie valid for up to 30 days, a short-lived cookie that protects signing in, cookies with your theme and language and, in the browser’s storage, a copy of the last loaded day and a few display settings so the app opens instantly, and, once you add or use a passkey, your email with the passkey’s identifier, so this device signs you in with it instead of sending a code. We use no advertising or tracking cookies.</p>
<p><strong>Technical logs:</strong> our hosting provider records technical details of requests (such as time, IP address, page and errors) to keep the service running and secure. These logs are kept for a few days.</p>
<h2>How we use your data</h2>
<ul>
<li>to show your daily overview, training load, recovery, sleep and calorie and macro targets;</li>
<li>to plan and adjust your workouts and nutrition;</li>
<li>to keep data in sync between Loadwise and the services you connect, as described below;</li>
<li>to answer your questions in the assistant and run other AI features when you use them;</li>
<li>to keep the service secure and fix errors.</li>
</ul>
<p>Loadwise is not a medical device and does not give medical advice or diagnoses.</p>
<h2>How Google user data is used</h2>
<p>Google user data is used only to provide the user-facing training, recovery and nutrition features of Loadwise that you use:</p>
<ul>
<li>We read Google Health data to show and evaluate your activity, health metrics, sleep and nutrition in Loadwise.</li>
<li>We write to Google Health only the food and drinks you log in Loadwise and, if you allow it, the weight you record in Loadwise or Intervals.icu.</li>
<li>We transfer Google user data only to the services listed under “Who receives your data”, only to provide features you use and with your consent. Beyond that, only for security purposes, to comply with the law, or as part of a merger, acquisition or sale of the service after your explicit consent.</li>
<li>We do not sell Google user data, do not use or transfer it for advertising, and do not transfer it to advertising platforms, data brokers or information resellers.</li>
<li>We do not use Google user data to train AI models or to determine creditworthiness or for lending.</li>
<li>No one reads your data unless you ask us to (for example, to help with a problem), it is needed for security purposes such as investigating abuse, or it is required by law. For internal operations we use only aggregated, anonymized data.</li>
</ul>
<p>Loadwise’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="${API_POLICY}">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
<p>The use of information received from Google Health API and/or Developer Tools will adhere to the <a href="${HEALTH_POLICY}">Google Health API Developer and User Data Policy</a>, including the Limited Use requirements.</p>
<h2>Who receives your data</h2>
<ul>
<li><strong>Intervals.icu</strong>, if you connect it: the workouts you plan in Loadwise, nutrition notes and calorie targets in your calendar, your weight, and every hour a copy of your daily wellness from Google Health (sleep, average sleeping heart rate, steps, resting heart rate, HRV, oxygen saturation, respiration, VO2 max and body fat). Intervals.icu handles this data under its own privacy policy.</li>
<li><strong>Google Health</strong>: the food and drinks you log and, if you allow it, your weight.</li>
<li><strong>OpenAI</strong> (USA), when you use an AI feature (such as the assistant, recognizing food from a photo, label or description, plan reviews, workout reflections or exercise descriptions): the data that request needs, such as your message, the photo and related training, sleep, health and nutrition data. OpenAI processes it on our behalf, does not use data sent through its API to train its models and keeps it for up to 30 days to detect abuse.</li>
<li><strong>Cloudflare</strong> runs Loadwise, stores its database in Europe and keeps the technical logs.${email ? ' Its Email Service sends the sign-in codes and the notices about new passkeys.' : ''}</li>
<li><strong>Open-Meteo</strong> gets only the place you choose for the weather in your training plan: a place you search for, or your location rounded to about 1 km if you allow it. Without that the app shows no weather.</li>
<li><strong>Authorities</strong>, only when the law requires it.</li>
</ul>
<p>When you scan a barcode or a food label without AI, the image is processed on your device; the scanning library is loaded from the jsDelivr network. Exercise videos are embedded from YouTube in privacy-enhanced mode, and YouTube receives data only when you play a video.</p>
<p>Some of these providers are based in the United States. Where data leaves the European Union, they protect it with the safeguards the GDPR requires, such as the EU Standard Contractual Clauses.</p>
<h2>Storage and security</h2>
<ul>
<li>Your data is stored in Loadwise’s database at Cloudflare, encrypted at rest. All connections use HTTPS.</li>
<li>Access tokens and API keys for connected services are additionally encrypted (AES-GCM) with a key kept apart from the database.</li>
<li>Each user sees only their own data. You sign in with ${methods.en}, and your session is a signed cookie that scripts cannot read.</li>
<li>Only the operator has access to the systems that run Loadwise, and does not read users’ data except as described above.</li>
</ul>
<h2>How long we keep data and how to delete it</h2>
<ul>
<li>We keep your data while you have an account. An account nobody has signed in to for two years is deleted automatically with all its data.</li>
<li><strong>Disconnecting a service</strong> in Settings stops Loadwise from reading from and writing to it and removes the stored access; for Google, Loadwise also gives up its access at Google. Data imported so far stays in your account until you delete it or the account.</li>
<li><strong>Deleting your account</strong> in Settings → Account immediately deletes your account and permanently deletes all its data in Loadwise (for a large account, the rest within minutes): profile, food, workouts, sleep and health data, connections, passkeys and assistant history. The record of your consents is deleted with it. Loadwise also gives up its access to your Google Account and clears its copy on the device you use. Database backups are overwritten within 30 days.</li>
<li>You can remove a passkey in Settings → Account. Loadwise then no longer accepts it; delete it from your device or password manager as well.</li>
<li>Data that Loadwise copied to Intervals.icu or Google Health stays there; you can delete it in those services.</li>
<li>You can also remove Loadwise’s access at any time in your Google Account under <a href="${GOOGLE_CONNECTIONS}">Third-party apps and services</a>. Loadwise then can no longer read or write your Google data.</li>
${apple ? '<li>You can stop using Sign in with Apple for Loadwise in your Apple ID settings, or unlink Apple in Settings → Account.</li>' : ''}
<li>Technical logs are kept for a few days, and OpenAI keeps AI requests for up to 30 days.</li>
</ul>
<p>The <a href="/support">Support</a> page explains step by step how to manage and delete your data.</p>
<h2>Legal bases and your rights</h2>
<p>We process your data to provide the service you asked for (Article 6(1)(b) GDPR). Health data, from Google Health, Intervals.icu or entered by you, is processed only with your explicit consent (Article 9(2)(a) GDPR). You give it in the app before you first use it, and we record when and to which version of this text; syncing of your connected services in the background also runs only after it. The consent covers sending the data an AI feature needs to OpenAI, because the AI features are part of the service. You withdraw your consent by deleting your account in Settings → Account, where you can first download all your data; disconnecting a service stops new data from it. Withdrawing does not affect processing before it. Technical logs rely on our legitimate interest in a secure service (Article 6(1)(f) GDPR).</p>
<p>You have the right to access, correct and delete your data, to restrict or object to its processing and to receive it in a portable format. Most of this you can do directly in the app: in Settings → Account you can download all your data as a JSON file or delete your account. You can also lodge a complaint with the Czech Office for Personal Data Protection (<a href="https://uoou.gov.cz">uoou.gov.cz</a>).</p>
<h2>Children</h2>
<p>Loadwise is not intended for children under 16, and we do not knowingly collect their data.</p>
<h2>Changes</h2>
<p>We update this policy when Loadwise or the way it uses data changes, and publish the current version on this page with its date. Before we use data you have already given us in a new way, we ask for your consent.</p>
<h2>Contact</h2>
<p>For questions about this policy or your data, or to exercise your rights, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`,
    cs: `<p class="muted">Poslední změna: ${UPDATED.cs}</p>
<p><strong>Loadwise</strong> (Petr Fitness Data, petrfitnessdata.eu) je osobní služba pro trénink, regeneraci a výživu. Správcem tvých osobních údajů je Petr Bouma, soukromá osoba v České republice (dále provozovatel nebo „my“). Provozovatele zastihneš na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Loadwise je zatím dostupný jen na osobní pozvánku.</p>
<h2>Ve zkratce</h2>
<ul>
<li>Tvoje data používáme jen k funkcím Loadwise, které používáš.</li>
<li>Data neprodáváme, nepoužíváme k reklamě a nesdílíme s obchodníky s daty.</li>
<li>Které služby propojíš, je na tobě. Kdykoli je v aplikaci odpojíš, nebo smažeš účet i se všemi daty.</li>
</ul>
<h2>Jaká data získáváme</h2>
<p><strong>Tvůj účet.</strong> Když se přihlásíš přes Google, dostaneme tvou e-mailovou adresu a ID tvého účtu Google. Podle nich tě poznáme a ověříme pozvánku. Zaznamenáváme i čas posledního přihlášení.${apple ? ' Když se přihlásíš přes Apple, dostaneme identifikátor tvého Apple ID, e-mail, který nám Apple předá (může to být skrytá adresa od Apple), a napoprvé i jméno, pokud ho sdílíš.' : ''}</p>
<p><strong>Přístupové klíče (passkeys).</strong> Když si přidáš přístupový klíč, uložíme jeho veřejný klíč, jeho identifikátor, náhodný identifikátor tvého účtu, který si klíč pamatuje, název zařízení nebo správce hesel, ve kterém vznikl, a kdy byl přidaný a naposledy použitý. Soukromý klíč zůstává ve tvém zařízení nebo ve správci hesel a otisk prstu, obličej ani zámek obrazovky tvoje zařízení neopustí.${email ? ' Když si přidáš přístupový klíč, pošleme ti o tom e-mail, takže se o každém novém klíči dozvíš.' : ''}</p>${email ? `
<p><strong>Kódy e-mailem.</strong> Když si řekneš o kód pro přihlášení, pošleme šestimístný kód na zadanou adresu, pokud má do Loadwise přístup. Uchováváme jen jeho otisk vytvořený tajným klíčem, a to 10 minut, a počítadla, která omezují, kolik kódů a pokusů adresa dostane; ta se smažou dva dny po posledním kódu. Kód poslaný na novou adresu potvrzuje i změnu e-mailu účtu v Nastavení → Účet; na starou adresu pak přijde upozornění.</p>` : ''}
<p><strong>Google Health</strong>, jen když ho připojíš a povolíš na obrazovce souhlasu Google:</p>
<ul>
<li>aktivita a kondice: kroky, vzdálenost, patra, aktivní minuty, minuty v aktivních zónách, aktivní energie, čas v tepových zónách, období nečinnosti a tréninky;</li>
<li>zdravotní měření: tep, klidový tep, variabilita srdečního tepu (HRV), okysličení krve, dechová frekvence, VO₂max, váha, výška a tělesný tuk;</li>
<li>spánek: spánky a spánkové fáze;</li>
<li>výživa: záznamy jídla a pití.</li>
</ul>
<p>Dvě oprávnění jsou nepovinná a žádáme o ně zvlášť: čtení data narození z tvého účtu Google, aby se doplnil věk, a zápis váhy do Google Health.</p>
<p><strong>Intervals.icu</strong>, jen když ho připojíš svým klíčem API: tvoje aktivity a jejich podrobnosti, plánované tréninky a události, wellness údaje a nastavení sportů.</p>
<p><strong>Co zadáš v Loadwise:</strong> profil (třeba věk, výška, váha, sporty, cíle a čas na trénink), jídlo a pití, tréninky a jejich hodnocení, poznámky a konverzace s asistentem.</p>
<p><strong>Ve tvém zařízení:</strong> cookie přihlášení s platností nejvýš 30 dní, krátkodobá cookie, která chrání přihlašování, cookies s vybraným vzhledem a jazykem a v úložišti prohlížeče kopie naposledy načteného dne a několik nastavení zobrazení, aby se aplikace otevřela hned, a když si přidáš nebo použiješ přístupový klíč, tvůj e-mail s označením klíče, aby tě zařízení přihlásilo jím a nemuselo posílat kód. Reklamní ani sledovací cookies nepoužíváme.</p>
<p><strong>Technické záznamy:</strong> náš poskytovatel hostingu zaznamenává technické údaje o požadavcích (třeba čas, IP adresu, stránku a chyby), aby služba fungovala a byla bezpečná. Tyto záznamy se uchovávají několik dní.</p>
<h2>K čemu data používáme</h2>
<ul>
<li>k přehledu dne, tréninkové zátěže, regenerace, spánku a cílů kalorií a maker;</li>
<li>k plánování a úpravám tréninků a výživy;</li>
<li>k synchronizaci dat mezi Loadwise a službami, které propojíš, jak popisujeme níže;</li>
<li>k odpovědím asistenta a dalším AI funkcím, když je použiješ;</li>
<li>k zabezpečení služby a opravám chyb.</li>
</ul>
<p>Loadwise není zdravotnický prostředek a neposkytuje lékařské rady ani diagnózy.</p>
<h2>Jak používáme data z Googlu</h2>
<p>Data uživatelů z Googlu slouží jen k funkcím Loadwise pro trénink, regeneraci a výživu, které používáš:</p>
<ul>
<li>Data z Google Health čteme, abychom ti v Loadwise ukázali a vyhodnotili aktivitu, zdravotní měření, spánek a výživu.</li>
<li>Do Google Health zapisujeme jen jídlo a pití, které zapíšeš v Loadwise, a když to povolíš, i váhu zapsanou v Loadwise nebo Intervals.icu.</li>
<li>Data z Googlu předáváme jen službám z části Kdo data dostává, jen kvůli funkcím, které používáš, a s tvým souhlasem. Jinak už jen kvůli bezpečnosti, kvůli povinnosti ze zákona nebo při fúzi, akvizici či prodeji služby, a to po tvém výslovném souhlasu.</li>
<li>Data z Googlu neprodáváme, nepoužíváme ani nepředáváme k reklamě a nepředáváme je reklamním platformám, obchodníkům s daty ani jiným přeprodejcům informací.</li>
<li>Data z Googlu nepoužíváme k trénování modelů AI ani k posuzování úvěruschopnosti nebo půjček.</li>
<li>Tvoje data nikdo nečte, pokud o to nepožádáš (třeba při řešení problému), pokud to nevyžaduje bezpečnost, například vyšetřování zneužití, nebo zákon. Pro interní provoz používáme jen souhrnná anonymizovaná data.</li>
</ul>
<p>Použití a předání informací získaných z Google API jiné aplikaci se řídí <a href="${API_POLICY}">zásadami Google API Services User Data Policy</a> včetně požadavků na omezené použití (Limited Use).</p>
<p>Použití informací získaných z Google Health API a vývojářských nástrojů se řídí <a href="${HEALTH_POLICY}">zásadami Google Health API Developer and User Data Policy</a> včetně požadavků na omezené použití (Limited Use).</p>
<h2>Kdo data dostává</h2>
<ul>
<li><strong>Intervals.icu</strong>, když ho připojíš: tréninky, které naplánuješ v Loadwise, poznámky k výživě a cíle kalorií v kalendáři, tvoji váhu a každou hodinu kopii denních wellness údajů z Google Health (spánek, průměrný tep ve spánku, kroky, klidový tep, HRV, okysličení krve, dech, VO₂max a tělesný tuk). Intervals.icu s nimi zachází podle svých zásad ochrany soukromí.</li>
<li><strong>Google Health</strong>: jídlo a pití, které zapíšeš, a když to povolíš, i tvoje váha.</li>
<li><strong>OpenAI</strong> (USA), když použiješ AI funkci (třeba asistenta, rozpoznání jídla z fotky, etikety nebo popisu, revizi plánu, zhodnocení tréninku nebo popis cviku): data, která daný požadavek potřebuje, třeba tvoji zprávu, fotku a související údaje o tréninku, spánku, zdraví a výživě. OpenAI je zpracovává naším jménem, data poslaná přes své API nepoužívá k trénování modelů a uchovává je nejvýš 30 dní kvůli odhalování zneužití.</li>
<li><strong>Cloudflare</strong> provozuje Loadwise, ukládá jeho databázi v Evropě a uchovává technické záznamy.${email ? ' Jeho služba Email Service posílá kódy pro přihlášení a upozornění na nové přístupové klíče.' : ''}</li>
<li><strong>Open-Meteo</strong> dostane jen místo, které vybereš pro počasí v plánu tréninků: vyhledané místo, nebo tvou polohu zaokrouhlenou zhruba na 1 km, pokud ji povolíš. Bez toho aplikace počasí neukazuje.</li>
<li><strong>Úřady</strong>, jen když to vyžaduje zákon.</li>
</ul>
<p>Když skenuješ čárový kód nebo etiketu bez AI, obrázek se zpracuje přímo ve tvém zařízení; knihovna pro skenování se načítá ze sítě jsDelivr. Videa cviků jsou vložená z YouTube v režimu se zvýšenou ochranou soukromí a YouTube dostane data, až když video spustíš.</p>
<p>Někteří z těchto poskytovatelů sídlí ve Spojených státech. Když data opouštějí Evropskou unii, chrání je zárukami, které vyžaduje GDPR, například standardními smluvními doložkami EU.</p>
<h2>Uložení a zabezpečení</h2>
<ul>
<li>Data jsou uložená v databázi Loadwise u Cloudflare a jsou šifrovaná. Všechna spojení používají HTTPS.</li>
<li>Přístupové tokeny a klíče API k propojeným službám jsou navíc šifrované (AES-GCM) klíčem, který je uložený mimo databázi.</li>
<li>Každý uživatel vidí jen svoje data. Přihlašuješ se ${methods.cs} a tvoje relace je podepsaná cookie, kterou skripty nepřečtou.</li>
<li>K systémům, na kterých Loadwise běží, má přístup jen provozovatel a data uživatelů nečte, kromě případů popsaných výše.</li>
</ul>
<h2>Jak dlouho data uchováváme a jak je smazat</h2>
<ul>
<li>Data uchováváme, dokud máš účet. Účet, do kterého se nikdo dva roky nepřihlásil, automaticky smažeme i se všemi daty.</li>
<li><strong>Odpojení služby</strong> v Nastavení zastaví čtení i zápis do ní a smaže uložený přístup; u Googlu se Loadwise vzdá přístupu i přímo u Googlu. Data, která se do té doby načetla, zůstanou v tvém účtu, dokud je nesmažeš, nebo nesmažeš účet.</li>
<li><strong>Smazání účtu</strong> v Nastavení → Účet okamžitě smaže tvůj účet a natrvalo všechna data v Loadwise (u velkého účtu zbytek do několika minut): profil, jídla, tréninky, spánek a zdravotní data, připojení služeb, přístupové klíče i historii asistenta. Smaže se i záznam o tvých souhlasech. Loadwise se zároveň vzdá přístupu k tvému účtu Google a smaže svou kopii v zařízení, ve kterém účet mažeš. Zálohy databáze se přepíšou do 30 dní.</li>
<li>Přístupový klíč odebereš v Nastavení → Účet. Loadwise ho pak už nepřijme; smaž ho i ze zařízení nebo ze správce hesel.</li>
<li>Co Loadwise zkopíroval do Intervals.icu nebo Google Health, tam zůstane; smazat to můžeš v těchto službách.</li>
<li>Přístup Loadwise můžeš kdykoli odebrat i ve svém účtu Google v části <a href="${GOOGLE_CONNECTIONS}">Aplikace a služby třetích stran</a>. Loadwise pak už tvoje data z Googlu nepřečte ani nezapíše.</li>
${apple ? '<li>Přihlašování přes Apple pro Loadwise ukončíš v nastavení svého Apple ID, nebo Apple odpojíš v Nastavení → Účet.</li>' : ''}
<li>Technické záznamy se uchovávají několik dní a OpenAI uchovává požadavky AI nejvýš 30 dní.</li>
</ul>
<p>Na stránce <a href="/support">Podpora</a> najdeš postup krok za krokem, jak data spravovat a smazat.</p>
<h2>Právní základ a tvoje práva</h2>
<p>Data zpracováváme, abychom ti poskytli službu, o kterou stojíš (čl. 6 odst. 1 písm. b) GDPR). Údaje o zdraví, z Google Health, Intervals.icu i ty, které zadáš sám, zpracováváme jen s tvým výslovným souhlasem (čl. 9 odst. 2 písm. a) GDPR). Dáváš ho v aplikaci před prvním použitím a my zaznamenáme kdy a ke které verzi tohoto textu; synchronizace propojených služeb na pozadí běží až po něm. Souhlas zahrnuje i posílání dat, která AI funkce potřebuje, do OpenAI, protože AI funkce jsou součástí služby. Souhlas odvoláš smazáním účtu v Nastavení → Účet, kde si předtím můžeš stáhnout všechna svoje data; odpojením služby zastavíš nová data z ní. Odvoláním nepřestává být zákonné zpracování před ním. Technické záznamy vedeme na základě oprávněného zájmu na bezpečné službě (čl. 6 odst. 1 písm. f) GDPR).</p>
<p>Máš právo na přístup ke svým datům, jejich opravu a výmaz, na omezení zpracování, vznesení námitky a na přenositelnost dat. Většinu z toho uděláš přímo v aplikaci: v Nastavení → Účet si všechna svoje data stáhneš jako soubor JSON, nebo smažeš účet. Můžeš si také stěžovat u Úřadu pro ochranu osobních údajů (<a href="https://uoou.gov.cz">uoou.gov.cz</a>).</p>
<h2>Děti</h2>
<p>Loadwise není určený dětem mladším 16 let a jejich data vědomě nesbíráme.</p>
<h2>Změny</h2>
<p>Zásady upravíme, když se změní Loadwise nebo způsob práce s daty, a aktuální verzi s datem zveřejníme na této stránce. Než data, která už máme, použijeme novým způsobem, požádáme tě o souhlas.</p>
<h2>Kontakt</h2>
<p>S dotazy k těmto zásadám nebo ke svým datům a s uplatněním svých práv se obrať na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<p class="muted">Závazné je anglické znění: <a href="/privacy?lang=en">Privacy Policy</a>.</p>`
  });
}

export function termsPage(request) {
  return doc(request, '/terms', {cs: 'Podmínky použití', en: 'Terms of Use'}, {
    en: `<p>Loadwise is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.</p>`,
    cs: `<p>Loadwise slouží k organizaci a plánování osobního tréninku. Za správnost propojených dat a za rozhodnutí, jestli je vygenerovaný trénink pro tebe vhodný, odpovídáš ty. Aplikace neposkytuje lékařskou diagnózu ani pomoc v nouzi. Používání aplikace vyžaduje přístup k propojené službě health-api.</p><p class="muted">Závazné je anglické znění: <a href="/terms?lang=en">Terms of Use</a>.</p>`
  });
}

export function supportPage(request, {apple = false, email = false} = {}) {
  return doc(request, '/support', {cs: 'Podpora', en: 'Support'}, {
    en: `<p>Loadwise is currently available only by personal invitation. If something does not work, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> what went wrong, roughly when, and the error message the app showed. Never send passwords, API keys or other secrets.</p>
<h2>Signing in</h2>
<p>Sign in with the Google account your invitation was sent to.${apple ? ' If you also see Sign in with Apple, you can use an Apple ID with the same email address. If you hide your email from Apple, sign in with Google first and link Apple in Settings → Account.' : ''}${email ? ' Without a Google account, enter the invited address under “or with a code by email”: you get a six-digit code that is valid for 10 minutes.' : ''} If the app says your account is not invited, ask the operator to invite the address you use.</p>
<h2>Passkeys</h2>
<ul>
<li>Once you are signed in, open <strong>Settings → Account</strong> and choose <strong>Add</strong> next to Passkeys. Your phone or computer saves the passkey, usually in its password manager.</li>
<li>Next time, choose <strong>Sign in with a passkey</strong> and unlock it with your fingerprint, face or screen lock. A passkey saved in iCloud Keychain or Google Password Manager works on your other devices too.</li>
<li>To remove a passkey, choose <strong>Remove</strong> next to it in Settings → Account, then delete it from your device or password manager as well.</li>
</ul>
<h2>Connecting and disconnecting services</h2>
<ul>
<li>In the app, open <strong>Settings → Connections</strong>. Google Health and Intervals.icu each have a card with a button to connect them and, once connected, to disconnect them.</li>
<li>Before sending you to Google, Loadwise shows what it reads from Google Health, what it writes there and who receives the data, and asks for your consent.</li>
<li>Disconnecting stops Loadwise from reading and writing data in that service. For Google, Loadwise also gives up its access at Google.</li>
<li>You can also remove Loadwise’s access in your Google Account: open <a href="${GOOGLE_CONNECTIONS}">Third-party apps and services</a>, choose Loadwise and remove its access.</li>
</ul>
<h2>Managing your data</h2>
<ul>
<li>You can edit or delete food, drinks and weight entries where you see them in the app, and change your profile in Settings.</li>
<li>Data that Loadwise copied to Intervals.icu or Google Health can be edited or deleted in those services.</li>
<li>To get a copy of everything Loadwise stores about you, open <strong>Settings → Account</strong> and choose <strong>Download my data</strong> (a JSON file).</li>
</ul>
<h2>Deleting your account and data</h2>
<ol>
<li>Open <strong>Settings → Account</strong>.</li>
<li>If you want to keep a copy, first choose <strong>Download my data</strong>.</li>
<li>Choose <strong>Delete account</strong>, type SMAZAT to confirm and choose <strong>Delete account permanently</strong>.</li>
</ol>
<p>Loadwise immediately and permanently deletes your account and all its data: profile, food, workouts, sleep and health data, connections, passkeys and assistant history. It also gives up its access to your Google Account and clears its copy on your device. Database backups are overwritten within 30 days. Data already in Intervals.icu or Google Health stays there. More in the <a href="/privacy">Privacy Policy</a>.</p>`,
    cs: `<p>Loadwise je zatím dostupný jen na osobní pozvánku. Když něco nefunguje, napiš na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>, co nefungovalo, přibližně kdy to bylo a jakou chybu aplikace ukázala. Nikdy neposílej hesla, klíče API ani jiná tajemství.</p>
<h2>Přihlášení</h2>
<p>Přihlas se účtem Google, na který ti přišla pozvánka.${apple ? ' Pokud vidíš i Přihlásit se přes Apple, můžeš použít Apple ID se stejnou e-mailovou adresou. Když před Apple e-mail skrýváš, přihlas se nejdřív přes Google a Apple si připoj v Nastavení → Účet.' : ''}${email ? ' Bez účtu Google zadej pozvanou adresu pod „nebo kódem z e-mailu“: přijde ti šestimístný kód, který platí 10 minut.' : ''} Když aplikace hlásí, že účet není pozvaný, požádej provozovatele, ať pozve adresu, kterou používáš.</p>
<h2>Přístupové klíče (passkeys)</h2>
<ul>
<li>Po přihlášení otevři <strong>Nastavení → Účet</strong> a u Přístupových klíčů zvol <strong>Přidat</strong>. Telefon nebo počítač si klíč uloží, obvykle do správce hesel.</li>
<li>Příště zvol <strong>Přihlásit se přístupovým klíčem</strong> a odemkni ho otiskem prstu, obličejem nebo zámkem obrazovky. Klíč uložený v Klíčence na iCloudu nebo ve Správci hesel Google funguje i na tvých dalších zařízeních.</li>
<li>Klíč odebereš tlačítkem <strong>Odebrat</strong> u něj v Nastavení → Účet; pak ho smaž i ze zařízení nebo ze správce hesel.</li>
</ul>
<h2>Připojení a odpojení služeb</h2>
<ul>
<li>V aplikaci otevři <strong>Nastavení → Propojení</strong>. Google Health i Intervals.icu tam mají kartu s tlačítkem pro připojení a po připojení i pro odpojení.</li>
<li>Než tě Loadwise pošle na Google, ukáže, co z Google Health čte, co tam zapisuje a kdo data dostane, a požádá tě o souhlas.</li>
<li>Odpojení zastaví čtení i zápis dat v dané službě. U Googlu se Loadwise vzdá přístupu i přímo u Googlu.</li>
<li>Přístup Loadwise můžeš odebrat i ve svém účtu Google: otevři <a href="${GOOGLE_CONNECTIONS}">Aplikace a služby třetích stran</a>, vyber Loadwise a přístup odeber.</li>
</ul>
<h2>Správa dat</h2>
<ul>
<li>Záznamy jídla, pití a váhy upravíš nebo smažeš tam, kde je v aplikaci vidíš, a profil změníš v Nastavení.</li>
<li>Co Loadwise zkopíroval do Intervals.icu nebo Google Health, upravíš nebo smažeš v těchto službách.</li>
<li>Kopii všeho, co o tobě Loadwise ukládá, si stáhneš v <strong>Nastavení → Účet</strong> tlačítkem <strong>Stáhnout moje data</strong> (soubor JSON).</li>
</ul>
<h2>Smazání účtu a dat</h2>
<ol>
<li>Otevři <strong>Nastavení → Účet</strong>.</li>
<li>Jestli si chceš data nechat, nejdřív zvol <strong>Stáhnout moje data</strong>.</li>
<li>Zvol <strong>Smazat účet</strong>, pro potvrzení napiš SMAZAT a zvol <strong>Smazat účet natrvalo</strong>.</li>
</ol>
<p>Loadwise okamžitě a natrvalo smaže tvůj účet a všechna data: profil, jídla, tréninky, spánek a zdravotní data, připojení služeb, přístupové klíče i historii asistenta. Zároveň se vzdá přístupu k tvému účtu Google a smaže svou kopii ve tvém zařízení. Zálohy databáze se přepíšou do 30 dní. Co už je v Intervals.icu nebo Google Health, tam zůstane. Víc v <a href="/privacy">Zásadách ochrany soukromí</a>.</p>`
  });
}
