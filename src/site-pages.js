// Public pages: the Aurin overview on / and the policy pages. They use the iPhone app's light
// palette (ios-native/Shared/Palette.swift): warm paper, white cards, Newsreader headings.
// The phone on the overview is drawn in HTML from the app's Today screen, so it needs no screenshots
// and speaks both languages. When the app changes what a section shows, change the section here too.
import {themeTokens} from './design-system.js';
import {icon} from './icons.js';
import {SITE_ORIGIN, SERVER_HOSTS} from './app-origin.js';


const siteCss = `
@font-face{font-family:Newsreader;src:url(/site/fonts/newsreader.woff2) format("woff2");font-display:swap}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.5 -apple-system,BlinkMacSystemFont,Inter,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--primary-text)}
img{max-width:100%}
.icon{width:1.15em;height:1.15em;flex:none;vertical-align:-.2em;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wrap{max-width:1160px;margin:0 auto;padding:0 24px}
h1,h2,h3{margin:0;font-weight:400}
h1,h2{font-family:Newsreader,"New York",Georgia,serif;letter-spacing:-.02em;line-height:1.02}
p{margin:0}
.muted{color:var(--muted)}
:focus-visible{outline:2px solid var(--primary);outline-offset:3px}

/* Floating pill navigation. */
.site-head{position:sticky;top:12px;z-index:20;display:flex;justify-content:center;padding:0 16px;margin-top:12px;pointer-events:none}
.pill-nav{pointer-events:auto;display:flex;align-items:center;gap:6px;padding:6px 6px 6px 14px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--panel) 80%,transparent);backdrop-filter:saturate(1.4) blur(18px);-webkit-backdrop-filter:saturate(1.4) blur(18px);box-shadow:0 8px 30px rgba(60,45,20,.08)}
.logo{display:flex;align-items:center;gap:9px;color:var(--text);text-decoration:none;margin-right:10px}
.logo span{font:400 25px/1 Newsreader,"New York",Georgia,serif;letter-spacing:-.01em}
.pill-nav .links{display:flex;gap:2px;margin-right:6px}
.pill-nav .links a{padding:7px 12px;border-radius:999px;color:var(--muted);text-decoration:none;font-size:14px;font-weight:500}
.pill-nav .links a:hover{color:var(--text);background:var(--track)}
.lang-switch{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:var(--track)}
.lang-switch button{display:grid;place-items:center;min-width:32px;height:30px;padding:0 8px;border:0;border-radius:999px;background:none;color:var(--muted);cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;line-height:1;letter-spacing:.02em}
.lang-switch button:hover{color:var(--text)}
.lang-switch button[aria-checked=true]{background:var(--panel);color:var(--text);box-shadow:0 1px 2px rgba(60,45,20,.12)}

/* The store badge: the app is not in the App Store yet, so it is a label, not a link. */
.store{display:inline-flex;align-items:center;gap:10px;height:54px;padding:0 26px;border-radius:999px;background:var(--button);color:var(--on-button);font-size:17px;font-weight:600}
.store svg{width:20px;height:20px;fill:currentColor}

/* Hero. */
.hero{text-align:center;margin-top:-76px;padding:168px 0 0;background:radial-gradient(70% 60% at 50% 0%,var(--glow-today),transparent 75%)}
.hero h1{font-size:clamp(52px,8.4vw,108px);max-width:940px;margin:0 auto}
.hero .store{margin-top:34px}
.stage{position:relative;width:min(100%,760px);margin:72px auto 0;padding:0 16px 96px}
.float{position:absolute;z-index:1;text-align:left;width:220px;padding:16px 18px;border-radius:22px;background:var(--panel);box-shadow:0 18px 50px rgba(80,60,30,.12)}
.float .k{font-size:13px;color:var(--muted)}
.float .v{font-size:30px;font-weight:600;letter-spacing:-.03em;margin-top:2px}
.float .d{font-size:13px;font-weight:600}
.float.left{left:0;top:180px}
.float.right{right:0;top:340px}
@media (min-width:961px){.stage{width:min(100%,900px)}.stage .phone{zoom:1.22}.float.left{top:240px}.float.right{top:430px}}

/* The phone, drawn in HTML from the app's Today screen. */
.phone{width:290px;margin:0 auto;padding:8px;border-radius:50px;background:var(--frame);box-shadow:0 40px 90px rgba(80,60,30,.20);text-align:left}
.screen{position:relative;height:590px;padding:50px 18px 0;border-radius:42px;overflow:hidden;background:radial-gradient(120% 45% at 50% 0%,var(--glow-today),var(--bg) 70%);font-size:13px;line-height:1.35}
.screen::before{content:"";position:absolute;top:11px;left:50%;width:92px;height:26px;transform:translateX(-50%);border-radius:14px;background:#000}
.screen .top{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px}
.screen .me{width:28px;height:28px;border-radius:50%;background:var(--button);color:var(--on-button);display:grid;place-items:center;font-size:13px}
.screen .lbl{margin-top:24px;color:var(--muted)}
.screen .ready{display:flex;align-items:flex-end;gap:8px}
.screen .ready b{font:400 92px/.9 Newsreader,Georgia,serif;letter-spacing:-.04em}
.pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
.pill.good{background:var(--green-soft);color:var(--green)}
.screen .pill{margin-bottom:12px}
.pc{background:var(--panel);border-radius:18px;padding:12px 13px;margin-top:10px}
.cells{display:grid;grid-template-columns:repeat(3,1fr);margin-top:16px}
.cells>div+div{border-left:1px solid var(--line);padding-left:11px}
.cells .k{font-size:11.5px;color:var(--muted)}
.cells .v{font-size:23px;font-weight:500;letter-spacing:-.02em;margin-top:1px}
.cells .d{font-size:11px}
.next{display:flex;align-items:center;gap:11px}
.sport{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;flex:none;color:#fff}
.sport .icon{width:19px;height:19px}
.next .t{font-weight:600;display:flex;align-items:center;gap:5px}
.next .t .icon{width:12px;height:12px;color:var(--amber)}
.next .s{font-size:12px;color:var(--muted)}
.tabbar{position:absolute;left:12px;right:12px;bottom:12px;height:54px;border-radius:27px;background:var(--panel);display:flex;justify-content:space-around;align-items:center;box-shadow:0 4px 20px rgba(60,45,20,.10);color:var(--muted)}
.tabbar .icon{width:21px;height:21px}
.tabbar .on{color:var(--text)}

/* Sections: text on one side, the picture on the other; stacked on phones. */
section{padding:120px 0 0}
/* A soft section tint that fades out before the section's edges, so no seam shows. */
section[class*=glow-]{background:radial-gradient(min(70%,620px) 330px at 50% 380px,var(--glow),transparent)}
.glow-health{--glow:var(--glow-health)}.glow-training{--glow:var(--glow-training)}.glow-food{--glow:var(--glow-food)}.glow-today{--glow:var(--glow-today)}
.feature{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,520px);gap:80px;align-items:center}
.feature.flip .text{order:2}
.eyebrow{font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:14px}
.feature h2,.center h2{font-size:clamp(42px,5.4vw,68px)}
.card{background:var(--panel);border-radius:28px;padding:24px;box-shadow:0 1px 2px rgba(60,45,20,.05)}
.card+.card,.card+.trio,.trio+.trio{margin-top:12px}
.note{font-size:16px;color:var(--sec);margin-top:14px}
.trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.trio .card{margin:0;padding:18px 16px;border-radius:22px}
.trio .k{font-size:13px;color:var(--muted)}
.trio .v{font-size:28px;font-weight:500;letter-spacing:-.03em;margin-top:4px}
.trio .d{font-size:13px;font-weight:600;margin-top:2px}
.tile{text-align:center}
.tile .icon{width:26px;height:26px;margin:0 auto;display:block}
.tile span{display:block;font-size:15px;font-weight:500;margin-top:8px}
.big{font:400 150px/.85 Newsreader,Georgia,serif;letter-spacing:-.05em;color:var(--green);text-align:center}
.readiness>.card:first-child{padding:40px 24px 30px;text-align:center}
.up{color:var(--green)}.sleep{color:var(--indigo)}.warm{color:var(--amber)}

.gauge-head{display:flex;justify-content:space-between;align-items:baseline;font-size:15px;color:var(--muted)}
.gauge-head .warm{font-weight:600}
.num{font-size:58px;font-weight:600;letter-spacing:-.04em;line-height:1.1;margin-top:4px}
.gauge{position:relative;height:12px;border-radius:6px;background:var(--track);margin-top:14px}
.gauge i{position:absolute;top:0;bottom:0;border-radius:6px}
.gauge .fill{left:0;width:54%;background:var(--amber-bar)}
.gauge .band{left:57%;width:14%;top:-4px;bottom:-4px;border:1.5px solid var(--amber-bar);background:color-mix(in srgb,var(--amber-bar) 20%,transparent)}
.week{display:flex;gap:7px;align-items:flex-end;height:96px;margin-top:30px}
.week i{flex:1;border-radius:5px;background:var(--track)}
.week i.on{background:var(--amber-bar)}
.days{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:8px}
.days span{flex:1;text-align:center}

.cal{display:flex}
.cal div{flex:1;text-align:center;font-size:12px;color:var(--muted)}
.cal b{display:grid;place-items:center;width:34px;height:34px;margin:7px auto 0;border-radius:50%;font-size:14px;font-weight:600;color:var(--text);border:2px solid transparent}
.cal .today{background:var(--amber-bar);color:#fff}
.cal .ride{border-color:var(--amber-bar)}.cal .gym{border-color:var(--indigo)}.cal .run{border-color:var(--green)}
.workout .head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.workout .name{font-size:19px;font-weight:600;display:flex;gap:7px;align-items:center}
.workout .name .icon{width:16px;height:16px;color:var(--amber)}
.workout .len{font:400 24px Newsreader,Georgia,serif;color:var(--sec);white-space:nowrap}
.graph{display:flex;gap:3px;align-items:flex-end;height:78px;margin-top:18px}
.graph i{border-radius:3px}
.graph .easy{background:var(--blue);opacity:.75}.graph .hard{background:var(--amber-bar)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.chips span{padding:9px 15px;border-radius:999px;background:var(--panel);font-size:15px;font-weight:500}

.muscle{display:flex;align-items:center;gap:14px;padding:11px 0;font-size:16px}
.muscle+.muscle{border-top:1px solid var(--line)}
.muscle .m{width:104px;font-weight:500}
.muscle .bar{flex:1;height:8px;border-radius:4px;background:var(--track);overflow:hidden}
.muscle .bar i{display:block;height:100%;border-radius:4px}
.muscle .p{width:46px;text-align:right;color:var(--muted);font-size:15px}
.live{display:flex;align-items:center;gap:14px}
.live .t{font-size:17px;font-weight:600}
.live .s{font-size:14px;color:var(--muted)}
.live .clock{margin-left:auto;font-size:26px;font-weight:600;letter-spacing:-.02em}

.food{display:flex;align-items:center;gap:24px}
.ring{width:124px;height:124px;flex:none;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:12}
.ring .track{stroke:var(--track)}.ring .val{stroke:var(--green);stroke-linecap:round}
.food .kcal{font-size:38px;font-weight:600;letter-spacing:-.03em;line-height:1.1}
.food .of{font-size:15px;color:var(--muted)}
.macros{list-style:none;padding:0;margin:12px 0 0;font-size:14px;line-height:1.75}
.macros i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px}

.chat{display:flex;flex-direction:column;gap:12px;font-size:16.5px;line-height:1.45}
.chat .me{align-self:flex-end;max-width:84%;padding:13px 18px;border-radius:22px 22px 6px 22px;background:var(--button);color:var(--on-button)}
.chat .ai{align-self:flex-start;max-width:90%;padding:16px 18px;border-radius:22px 22px 22px 6px;background:var(--panel)}
.chat .acts{display:flex;gap:8px;margin-top:12px}
.chat .acts span{padding:8px 14px;border-radius:999px;font-size:14px;font-weight:600;background:var(--panel2)}
.chat .acts span:first-child{background:var(--green);color:#fff}
.free{margin-top:22px;font-size:17px;font-weight:600;color:var(--green)}

.sources{display:grid;gap:12px}
.source{display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:22px;background:var(--panel);font-size:17px;font-weight:500}
.source .logo-tile{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;flex:none;background:#fff;box-shadow:0 0 0 1px var(--line)}
.source .logo-tile .icon{width:22px;height:22px}
.source .ok{margin-left:auto;color:var(--green)}
.health-red{color:var(--health-red)}.google{color:var(--google-blue);font-size:21px;font-weight:700}
.icu{background:var(--button)!important;color:var(--on-button);font-size:12px;font-weight:700}
.uh{background:var(--button)!important;color:var(--on-button);font-size:20px;font-weight:700}

.center{text-align:center;max-width:760px;margin:0 auto}
.center .lock{width:32px;height:32px;color:var(--muted);margin-bottom:18px}
.checks{list-style:none;margin:32px auto 0;padding:6px 24px;max-width:620px;text-align:left}
.checks li{display:flex;gap:12px;align-items:flex-start;padding:14px 0;font-size:17px;font-weight:500}
.checks li+li{border-top:1px solid var(--line)}
.checks .icon{color:var(--green);margin-top:2px}
.checks a{font-weight:600}
.disclosure{max-width:620px;margin:12px auto 0;padding:22px 24px;text-align:left}
.disclosure h3{font-size:16px;font-weight:600;margin-bottom:10px}
.disclosure p{font-size:14px;line-height:1.55;color:var(--muted);margin-bottom:12px}

.final{text-align:center;padding:150px 0 140px;background:radial-gradient(60% 70% at 50% 100%,var(--glow-training),transparent 75%)}
.final .mark{display:block;margin:0 auto}
.final h2{font-size:clamp(52px,7vw,84px);margin-top:22px}
.final .store{margin-top:30px}

.site-foot{border-top:1px solid var(--line);padding:30px 0 40px;color:var(--muted);font-size:14px}
.site-foot .wrap{display:flex;gap:20px;flex-wrap:wrap;align-items:center}
.site-foot nav{display:flex;gap:20px;margin-left:auto}
.site-foot a{color:var(--muted);text-decoration:none}.site-foot a:hover{color:var(--text)}

.doc{max-width:760px;padding:72px 24px 96px}
.doc h1{font-size:52px;margin:0 0 24px}
.doc h2{font-family:inherit;font-size:22px;font-weight:600;line-height:1.25;letter-spacing:-.01em;margin:40px 0 10px}
.doc p{color:var(--sec);margin-bottom:12px}
.doc ul,.doc ol{color:var(--sec);margin:0 0 12px;padding-left:22px}.doc li{margin-bottom:6px}

/* Content fades up as it scrolls in; only with JS and without reduced motion. */
@media (prefers-reduced-motion:no-preference){
  .js .reveal{opacity:0;transform:translateY(28px);transition:opacity .8s ease,transform .8s cubic-bezier(.2,.7,.2,1)}
  .js .reveal.in{opacity:1;transform:none}
}

@media (max-width:960px){
  .pill-nav .links{display:none}
  .float{display:none}
  .feature{grid-template-columns:1fr;gap:32px}
  .feature.flip .text{order:0}
  .visual{max-width:520px}
  section{padding-top:88px}
}
@media (max-width:560px){
  .wrap{padding:0 16px}
  .hero{padding-top:132px}
  .stage{margin-top:48px;padding-bottom:64px}
  .card{padding:20px;border-radius:24px}
  .trio{gap:8px}
  .trio .card{padding:14px 12px;border-radius:20px}
  .trio .v{font-size:24px}
  .big{font-size:124px}
  .food{gap:18px}.ring{width:104px;height:104px}.food .kcal{font-size:32px}
  .muscle .m{width:84px}
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

const check = text => `<li>${icon('check')}<span>${text}</span></li>`;
const APPLE_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.2.8 1.1 1.7 2.3 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.2-2.6 0 0-2.4-.9-2.4-3.7zM14.2 5.6c.6-.8 1.1-1.8 1-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2-.5 2.7-1.3z"/></svg>';
// The Aurin mark (Rovnováha): the load half over the recovery half, offset as in the app icon.
const mark = width => `<svg class="mark" viewBox="6 10 88 80" width="${width}" height="${Math.round(width * 80 / 88)}" aria-hidden="true"><path d="M6 46A36 36 0 0 1 78 46Z" fill="var(--logo-load)"/><path d="M22 54A36 36 0 0 0 94 54Z" fill="var(--logo-recovery)"/></svg>`;
const LOCK = '<svg class="icon lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
const store = t => `<span class="store">${APPLE_LOGO}${t('Brzy v App Store', 'Coming soon to the App Store')}</span>`;

const revealScript = `<script>(function(){var r=document.documentElement;r.classList.add('js');
if(!('IntersectionObserver' in window)){r.classList.remove('js');return;}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});})();</script>`;

const langSwitch = lang => `<div class="theme-switch lang-switch" role="radiogroup" aria-label="${lang === 'en' ? 'Language' : 'Jazyk'}">${[['cs','CZ','Čeština'],['en','EN','English']].map(([code, label, name]) => `<button type="button" role="radio" data-lang-choice="${code}" lang="${code}" aria-label="${name}" aria-checked="${code === lang}">${label}</button>`).join('')}</div>`;
const langSwitchScript = `<script>(function(){document.addEventListener('click',function(e){var b=e.target.closest('[data-lang-choice]');if(!b)return;
var c=b.dataset.langChoice,dev=document.documentElement.dataset.deviceLang;
document.cookie=c===dev?'lw-lang=; path=/; max-age=0; samesite=lax':'lw-lang='+c+'; path=/; max-age=31536000; samesite=lax';
var u=new URL(location.href);u.searchParams.delete('lang');location.replace(u.pathname+u.search+u.hash);});})();</script>`;

function sitePage({title, description, lang, device, origin, path, body, index=true}) {
  const t = (cs, en) => lang === 'en' ? en : cs;
  const html = `<!doctype html>
<html lang="${lang}" class="site" data-device-lang="${device}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#F3EFE8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${origin}/site/og${lang === 'en' ? '-en' : ''}.png">
<meta property="og:locale" content="${t('cs_CZ', 'en_US')}">
<link rel="alternate" hreflang="cs" href="${origin}${path}?lang=cs">
<link rel="alternate" hreflang="en" href="${origin}${path}?lang=en">
<link rel="alternate" hreflang="x-default" href="${origin}${path}">
${index ? '' : '<meta name="robots" content="noindex">'}
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="preload" href="/site/fonts/newsreader.woff2" as="font" type="font/woff2" crossorigin>
<style>${themeTokens}${siteCss}</style>
</head>
<body>
<header class="site-head"><nav class="pill-nav" aria-label="${t('Hlavní', 'Main')}">
<a class="logo" href="/">${mark(30)}<span>Aurin</span></a>
<div class="links"><a href="/#pripravenost">${t('Funkce', 'Features')}</a><a href="/#kouc">${t('AI kouč', 'AI coach')}</a><a href="/#propojeni">${t('Propojení', 'Connections')}</a><a href="/#soukromi">${t('Soukromí', 'Privacy')}</a></div>
${langSwitch(lang)}
</nav></header>
${body}
<footer class="site-foot"><div class="wrap">
<span>© 2026 Aurin · aurin.health</span>
<nav aria-label="${t('Dokumenty', 'Documents')}"><a href="/privacy">${t('Ochrana soukromí', 'Privacy Policy')}</a><a href="/terms">${t('Podmínky', 'Terms')}</a><a href="/support">${t('Podpora', 'Support')}</a></nav>
</div></footer>
${langSwitchScript}${revealScript}
</body></html>`;
  // The same URL serves both languages, so caches must key on the cookie and the browser language.
  return new Response(html, {status:200, headers:{'content-type':'text/html; charset=utf-8', 'content-language':lang, 'vary':'Cookie, Accept-Language', 'cache-control':'private, max-age=0, must-revalidate'}});
}

// Pages take the request (to pick the language and host) or nothing (Czech on aurin.health, for tests).
function pageLang(request) {
  if (!request) return {lang: 'cs', device: 'cs', origin: SITE_ORIGIN};
  // The site's home is aurin.health; petrfitnessdata.eu serves the same pages for older links.
  // Absolute links (share image, language versions) keep to the host the page is served on.
  const host = new URL(request.url).hostname;
  return {lang: siteLang(request), device: deviceLang(request), origin: SERVER_HOSTS.has(host) ? `https://${host}` : SITE_ORIGIN};
}

// Google's policies ask the privacy policy to name every party that receives data, how it is stored and
// secured, and what happens on disconnecting and deleting; the support page is the help on managing and
// deleting data. Keep both in step with the code: scopes in google-scopes.js, the wellness copy in
// wellness-sync.js, the download and deletion in account-data.js.
const UPDATED = {cs: '13. října 2026', en: '13 October 2026'};
// The controller's address for questions and data requests (privacy policy and support page).
const CONTACT_EMAIL = 'support@aurin.health';
const API_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy';
const HEALTH_POLICY = 'https://developers.google.com/health/policies/health-api-developer-user-data-policy';
const GOOGLE_CONNECTIONS = 'https://myaccount.google.com/connections';

// The overview follows the app section by section: Today, readiness, strain, the plan, the gym,
// food, the coach and the connections. The numbers are one believable morning, the same everywhere.
export function overviewPage(request) {
  const {lang, device, origin} = pageLang(request), t = (cs, en) => lang === 'en' ? en : cs;
  const days = t(['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const short = t(['P', 'Ú', 'S', 'Č', 'P', 'S', 'N'], ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  const today = `<div class="phone" role="img" aria-label="${t('Aurin v telefonu: obrazovka Dnes s připraveností, spánkem, námahou, HRV a dnešním tréninkem', 'Aurin on a phone: the Today screen with readiness, sleep, strain, HRV and today’s workout')}"><div class="screen" aria-hidden="true">
<div class="top"><span>${t('Pondělí 12. 10.', 'Monday, Oct 12')}</span><span class="me">P</span></div>
<div class="lbl">${t('Připravenost', 'Readiness')}</div>
<div class="ready"><b>78</b><span class="pill good">${t('vysoká', 'high')}</span></div>
<div class="pc cells">
<div><div class="k">${t('Spánek', 'Sleep')}</div><div class="v">7:12</div><div class="d sleep">index 84</div></div>
<div><div class="k">${t('Námaha', 'Strain')}</div><div class="v">${t('11,4', '11.4')}</div><div class="d warm">${t('plán ~14', 'plan ~14')}</div></div>
<div><div class="k">HRV</div><div class="v">66</div><div class="d up">↑ 8 ms</div></div></div>
<div class="pc next"><span class="sport" style="background:var(--amber-bar)">${icon('bike')}</span><div><div class="t">Sweet spot 3×12 ${icon('spark')}</div><div class="s">${t('1 h 25 min · dnes v 17:30', '1h 25m · today at 5:30 pm')}</div></div></div>
<div class="pc"><div class="s" style="color:var(--muted);font-size:12px">${t('Kouč', 'Coach')}</div><div style="margin-top:3px">${t('Spal jsi dobře a HRV je nad normálem. Dnešní intervaly dej naplno.', 'You slept well and your HRV is above normal. Go all in on today’s intervals.')}</div></div>
<div class="tabbar"><span class="on">${icon('today')}</span><span>${icon('heart')}</span><span>${icon('training')}</span><span>${icon('meal')}</span></div>
</div></div>`;
  const graph = [[9,34,'easy'],[15,74,'hard'],[4,34,'easy'],[15,74,'hard'],[4,34,'easy'],[15,74,'hard'],[9,28,'easy']]
    .map(([w, h, k]) => `<i class="${k}" style="width:${w}%;height:${h}%"></i>`).join('');
  const cal = [['12','today'],['13','gym'],['14','run'],['15',''],['16','ride'],['17','run'],['18','']]
    .map(([n, k], i) => `<div>${days[i]}<b class="${k}">${n}</b></div>`).join('');
  const week = [30,55,20,70,45,15,62].map((h, i) => `<i class="${[1,3,4,6].includes(i) ? 'on' : ''}" style="height:${h}%"></i>`).join('');
  const muscles = [[t('Hrudník', 'Chest'),92,'green'],[t('Záda', 'Back'),81,'green'],[t('Nohy', 'Legs'),54,'amber-bar'],[t('Ramena', 'Shoulders'),38,'rust']]
    .map(([m, p, c]) => `<div class="muscle"><span class="m">${m}</span><span class="bar"><i style="width:${p}%;background:var(--${c})"></i></span><span class="p">${p} %</span></div>`).join('');
  const sources = [['Apple Zdraví', 'Apple Health', `<span class="logo-tile health-red">${icon('heart')}</span>`],
    ['Google Health', 'Google Health', '<span class="logo-tile google">G</span>'],
    ['Intervals.icu', 'Intervals.icu', '<span class="logo-tile icu">i.icu</span>'],
    ['Prsten Ultrahuman', 'Ultrahuman Ring', '<span class="logo-tile uh">U</span>'],
    ['WHOOP', 'WHOOP', '<span class="logo-tile uh">W</span>']]
    .map(([cs, en, logo]) => `<div class="source">${logo}<span>${t(cs, en)}</span><span class="ok">${icon('check')}</span></div>`).join('');
  return sitePage({lang, device, origin, path: '/',
    title: t('Aurin · trénuj podle toho, jak se dnes máš', 'Aurin · train for how you feel today'),
    description: t('Aurin pro iPhone čte spánek, HRV a tréninky z Apple Zdraví, Google Health a Intervals.icu, každé ráno ukáže připravenost a podle ní navrhne trénink a jídlo.',
      'Aurin for iPhone reads your sleep, HRV and workouts from Apple Health, Google Health and Intervals.icu, shows your readiness every morning and plans your training and food around it.'),
    body: `<main>
<div class="hero">
<div class="wrap">
<h1>${t('Trénuj podle toho, jak se dnes máš.', 'Train for how you feel today.')}</h1>
${store(t)}
</div>
<div class="stage reveal">
<div class="float left" aria-hidden="true"><div class="k">HRV</div><div class="v">66 ms</div><div class="d up">↑ 8 ms</div></div>
<div class="float right" aria-hidden="true"><div class="k">${t('Spánek', 'Sleep')}</div><div class="v">7:12</div><div class="d sleep">index 84</div></div>
${today}
</div>
</div>

<section id="pripravenost" class="glow-health"><div class="wrap feature">
<div class="text reveal"><div class="eyebrow">${t('Připravenost', 'Readiness')}</div><h2>${t('Každé ráno jedno číslo.', 'One number every morning.')}</h2></div>
<div class="visual readiness reveal">
<div class="card"><div class="big">78</div><p class="note">${t('HRV, klidový tep a spánek proti tvému normálu', 'HRV, resting heart rate and sleep against your normal')}</p></div>
<div class="trio">
<div class="card"><div class="k">HRV</div><div class="v">66</div><div class="d up">↑ 8 ms</div></div>
<div class="card"><div class="k">${t('Tep v klidu', 'Resting HR')}</div><div class="v">48</div><div class="d up">↓ 2</div></div>
<div class="card"><div class="k">${t('Spánek', 'Sleep')}</div><div class="v">7:12</div><div class="d sleep">${t('dluh 0:40', 'debt 0:40')}</div></div>
</div></div>
</div></section>

<section id="zatez"><div class="wrap feature flip">
<div class="text reveal"><div class="eyebrow">${t('Námaha', 'Strain')}</div><h2>${t('Víš, kdy přidat a kdy ubrat.', 'Know when to push and when to back off.')}</h2></div>
<div class="visual reveal"><div class="card">
<div class="gauge-head"><span>${t('Dnes', 'Today')}</span><span class="warm">${t('cíl 12–15', 'target 12–15')}</span></div>
<div class="num">${t('11,4', '11.4')}</div>
<div class="gauge"><i class="band"></i><i class="fill"></i></div>
<div class="week">${week}</div>
<div class="days">${short.map(d => `<span>${d}</span>`).join('')}</div>
</div></div>
</div></section>

<section id="trenink" class="glow-training"><div class="wrap feature">
<div class="text reveal"><div class="eyebrow">${t('Trénink', 'Training')}</div><h2>${t('Plán, který se přizpůsobí.', 'A plan that adapts.')}</h2></div>
<div class="visual reveal">
<div class="card cal">${cal}</div>
<div class="card workout">
<div class="head"><span class="name">Sweet spot 3×12 ${icon('spark')}</span><span class="len">${t('1 h 25 min', '1h 25m')}</span></div>
<div class="graph" aria-hidden="true">${graph}</div>
<p class="note">${t('Vybráno AI z knihovny podle dnešní připravenosti.', 'Picked by AI from the library for today’s readiness.')}</p>
</div>
<div class="chips"><span>${t('Trénink dne od kouče', 'Coach’s pick of the day')}</span><span>${t('Kolo', 'Ride')}</span><span>${t('Běh', 'Run')}</span><span>${t('Posilovna', 'Gym')}</span><span>${t('Plán týdne sám nebo od AI', 'Week plan by you or the AI')}</span><span>${t('Revize po tréninku', 'Review after each workout')}</span><span>${t('Synchronizace s Intervals.icu', 'Syncs with Intervals.icu')}</span><span>${t('Jeden trénink z hodinek i Intervals.icu', 'One workout from watch and Intervals.icu')}</span><span>${t('Vlastní tréninky', 'Your own workouts')}</span><span>${t('Sdílení s přáteli', 'Share with friends')}</span></div>
</div>
</div></section>

<section id="posilovna"><div class="wrap feature flip">
<div class="text reveal"><div class="eyebrow">${t('Posilovna', 'Gym')}</div><h2>${t('Série, váhy a regenerace svalů.', 'Sets, weights and muscle recovery.')}</h2></div>
<div class="visual reveal">
<div class="card">${muscles}</div>
<div class="card live"><span class="sport" style="background:var(--indigo)">${icon('gym')}</span><div><div class="t">Bench press</div><div class="s">${t('Série 3 ze 4 · 80 kg × 8', 'Set 3 of 4 · 80 kg × 8')}</div></div><span class="clock">1:30</span></div>
<div class="chips"><span>${t('Supersérie', 'Supersets')}</span><span>${t('Levá a pravá strana', 'Left and right side')}</span><span>${t('Síla, svaly nebo kondice', 'Strength, muscle or fitness')}</span><span>${t('Rozcvička a protažení', 'Warm-up and stretching')}</span></div>
</div>
</div></section>

<section id="vyziva" class="glow-food"><div class="wrap feature">
<div class="text reveal"><div class="eyebrow">${t('Výživa', 'Nutrition')}</div><h2>${t('Jídlo podle tréninku.', 'Food that follows your training.')}</h2></div>
<div class="visual reveal">
<div class="card food">
<svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="50"/><circle class="val" cx="60" cy="60" r="50" stroke-dasharray="218 314"/></svg>
<div><div class="kcal">${t('1 840', '1,840')}</div><div class="of">${t('z 2 650 kcal', 'of 2,650 kcal')}</div>
<ul class="macros"><li><i style="background:var(--protein)"></i>${t('bílkoviny', 'protein')} 112 g</li><li><i style="background:var(--carbs)"></i>${t('sacharidy', 'carbs')} 240 g</li><li><i style="background:var(--fat)"></i>${t('tuky', 'fat')} 58 g</li></ul></div>
</div>
<div class="trio">
<div class="card tile" style="color:var(--green)">${icon('camera')}<span style="color:var(--text)">${t('Fotka', 'Photo')}</span></div>
<div class="card tile" style="color:var(--amber)">${icon('barcode')}<span style="color:var(--text)">${t('Kód', 'Barcode')}</span></div>
<div class="card tile" style="color:var(--blue)">${icon('drop')}<span style="color:var(--text)">${t('Pití', 'Drinks')}</span></div>
</div>
<div class="chips"><span>${t('AI odhad', 'AI estimate')}</span><span>${t('Jídlo z jiných aplikací', 'Food from other apps')}</span><span>${t('Hromadné kopírování a přesun', 'Copy and move in bulk')}</span></div>
</div>
</div></section>

<section id="kouc" class="glow-today"><div class="wrap feature flip">
<div class="text reveal"><div class="eyebrow">${t('AI kouč', 'AI coach')}</div><h2>${t('Ptej se. Zná tvoje data.', 'Just ask. It knows your data.')}</h2><p class="free">${t('Zdarma pro všechny.', 'Free for everyone.')}</p></div>
<div class="visual chat reveal">
<div class="me">${t('Spal jsem jen 6 hodin. Mám jet ty intervaly?', 'I only slept 6 hours. Should I still do the intervals?')}</div>
<div class="ai">${t('HRV máš v normálu, ale spánkový dluh roste. Zkrátil bych to na 2×12 a dnes šel spát o 30 minut dřív.', 'Your HRV is normal, but your sleep debt is growing. I’d cut it to 2×12 and go to bed 30 minutes earlier tonight.')}
<div class="acts" aria-hidden="true"><span>${t('Upravit trénink', 'Adjust workout')}</span><span>${t('Nechat', 'Keep it')}</span></div></div>
</div>
</div></section>

<section id="propojeni"><div class="wrap feature">
<div class="text reveal"><div class="eyebrow">${t('Propojení', 'Connections')}</div><h2>${t('Data odtud, tréninky tam.', 'Data in, workouts out.')}</h2><p>${t('Nosíš víc zařízení? Noc i den bere Aurin z toho, které nosíš nejvíc, nebo si zdroj vybereš sám.', 'Wear more than one device? Aurin takes the night and the day from the one you wear most, or you pick the source yourself.')}</p></div>
<div class="visual sources reveal">${sources}</div>
</div></section>

<section id="soukromi"><div class="wrap">
<div class="center reveal">${LOCK}<h2>${t('Tvoje data slouží jen tobě.', 'Your data works only for you.')}</h2></div>
<ul class="card checks reveal">
${check(t('Čte jen to, co mu povolíš.', 'It reads only what you allow.'))}
${check(t('Data neprodává ani nepoužívá k reklamě.', 'It never sells your data or uses it for ads.'))}
${check(t('Účet i se všemi daty kdykoli smažeš v Nastavení.', 'You can delete your account and all its data in Settings at any time.'))}
${check(`<a href="/privacy">${t('Celé zásady ochrany soukromí', 'Full privacy policy')}</a>`)}
</ul>
<div class="card disclosure reveal" lang="en"><h3>Google Health data disclosure</h3>
<p>Aurin (Petr Fitness Data) is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows.</p>
<p>With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p>
<p style="margin:0">The service can process training and fitness data from connected services, including Google Health data that the account owner has authorized, in order to provide these requested workflows.</p>
<p style="margin:12px 0 0">Two optional permissions are requested separately: adding weight records to Google Health (weight you log in Aurin or Intervals.icu) and reading your date of birth from your Google Account to fill in your age.</p>
<p style="margin:12px 0 0">Aurin’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="${API_POLICY}">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
<p style="margin:12px 0 0">The use of information received from Google Health API and/or Developer Tools will adhere to the <a href="${HEALTH_POLICY}">Google Health API Developer and User Data Policy</a>, including the Limited Use requirements.</p></div>
</div></section>

<section class="final"><div class="wrap reveal">
${mark(96)}
<h2>Aurin</h2>
${store(t)}
</div></section>
</main>`
  });
}

// Policy pages. The English text is the reference version (Google verification reads it);
// the Czech one says the same.
function doc(request, path, title, html) {
  const {lang, device, origin} = pageLang(request), pick = x => lang === 'en' ? x.en : x.cs;
  return sitePage({lang, device, origin, path, title: `${pick(title)} · Aurin`, description: lang === 'en' ? `${title.en} for Aurin (aurin.health).` : `${title.cs} pro Aurin (aurin.health).`,
    body: `<main class="wrap doc"><h1>${pick(title)}</h1>${pick(html)}</main>`});
}

// Sign in with Apple and e-mail codes are described only once they are set up (signIn from the
// entrypoint); passkeys need no setup and are always there.
export function privacyPage(request, {apple = false, email = false, open = false} = {}) {
  const methods = {en: (apple ? 'Apple, ' : '') + (email ? 'Google, a passkey or a one-time code sent to your email' : 'Google or a passkey'), cs: (apple ? 'přes Apple, ' : '') + (email ? 'přes Google, přístupovým klíčem nebo jednorázovým kódem z e-mailu' : 'přes Google nebo přístupovým klíčem')};
  return doc(request, '/privacy', {cs: 'Zásady ochrany soukromí', en: 'Privacy Policy'}, {
    en: `<p class="muted">Last updated: ${UPDATED.en}</p>
<p><strong>Aurin</strong> (formerly Loadwise; Petr Fitness Data, aurin.health) is a personal service for training, recovery and nutrition. The controller of your personal data is Petr Bouma, a private individual in the Czech Republic (the operator, “we” below). You can reach the operator at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.${open ? '' : ' Aurin is currently available only by personal invitation.'}</p>
<h2>In short</h2>
<ul>
<li>We use your data only to provide the Aurin features you use.</li>
<li>We do not sell your data, use it for advertising or share it with data brokers.</li>
<li>You choose which services to connect. You can disconnect them, or delete your account and all its data, in the app at any time.</li>
</ul>
<h2>Data we collect</h2>
<p><strong>Your account.</strong> When you sign in with Google, we receive your email address and your Google account ID. We use them to recognize you${open ? '' : ' and check your invitation'}, and we record when you last signed in.${apple ? ' When you sign in with Apple, we receive your Apple ID user identifier, the email address Apple shares with us (it can be a private relay address) and, the first time, your name if you choose to share it.' : ''}</p>
<p><strong>Passkeys.</strong> When you add a passkey, we store its public key, its identifier, a random identifier of your account that the passkey keeps, the name of the device or password manager it was made in, and when it was added and last used. The private key stays on your device or in your password manager, and your fingerprint, face or screen lock never leaves your device.${email ? ' When you add a passkey, we send you an email about it, so you notice one you did not add.' : ''}</p>${email ? `
<p><strong>Codes sent by email.</strong> When you ask for a sign-in code, we send a six-digit code to the address you entered, if it has access to Aurin. We keep only a keyed hash of the code for 10 minutes, and counters that limit how many codes and attempts an address gets; these counters are deleted two days after the last code. A code sent to a new address also confirms changing your account’s email in Settings → Account; the old address then gets a notice of the change.</p>` : ''}
<p><strong>Google Health</strong>, only if you connect it and allow it on Google’s consent screen:</p>
<ul>
<li>activity and fitness: steps, distance, floors, active minutes, active zone minutes, active energy burned, time in heart rate zones, sedentary periods and exercise sessions;</li>
<li>health metrics and measurements: heart rate, resting heart rate, heart rate variability, oxygen saturation, respiratory rate, VO2 max, weight, height and body fat;</li>
<li>sleep: sleep sessions and sleep stages;</li>
<li>nutrition: food and drink logs.</li>
</ul>
<p>Two optional permissions are asked for separately: reading your date of birth from your Google Account, to fill in your age, and writing your weight to Google Health.</p>
<p><strong>Intervals.icu</strong>, only if you connect it with your API key: your activities and their details, planned workouts and events, wellness data and sport settings.</p>
<p><strong>Ultrahuman</strong>, only if you connect your Ultrahuman Ring: your sleep and its stages, heart rate variability, resting heart rate, skin temperature deviation and VO2max, to work out your readiness. Aurin only reads this data, never passes it on to other services, and deletes it when you disconnect the ring.</p>
<p><strong>WHOOP</strong>, only if you connect your WHOOP account: your sleep and its stages, resting heart rate, heart rate variability, breathing rate and blood oxygen, to work out your readiness. Aurin only reads this data, never passes it on to other services, and deletes it when you disconnect WHOOP.</p>
<p><strong>What you enter in Aurin:</strong> your profile (such as age, height, weight, sports, goals and the time you have for training), food and drinks, workouts and how they went, notes, and your conversations with the assistant.</p>
<p><strong>On your device:</strong> a sign-in cookie valid for up to 30 days, a short-lived cookie that protects signing in, cookies with your theme and language and, in the browser’s storage, a copy of the last loaded day and a few display settings so the app opens instantly, and, once you add or use a passkey, your email with the passkey’s identifier, so this device signs you in with it instead of sending a code. We use no advertising or tracking cookies.</p>
<p><strong>Technical logs:</strong> our hosting provider records technical details of requests (such as time, IP address, page and errors) to keep the service running and secure. These logs are kept for a few days.</p>
<h2>How we use your data</h2>
<ul>
<li>to show your daily overview, training load, recovery, sleep and calorie and macro targets;</li>
<li>to plan and adjust your workouts and nutrition;</li>
<li>to keep data in sync between Aurin and the services you connect, as described below;</li>
<li>to answer your questions in the assistant and run other AI features when you use them;</li>
<li>to keep the service secure and fix errors.</li>
</ul>
<p>Aurin is not a medical device and does not give medical advice or diagnoses.</p>
<h2>How Google user data is used</h2>
<p>Google user data is used only to provide the user-facing training, recovery and nutrition features of Aurin that you use:</p>
<ul>
<li>We read Google Health data to show and evaluate your activity, health metrics, sleep and nutrition in Aurin.</li>
<li>We write to Google Health only the food and drinks you log in Aurin and, if you allow it, the weight you record in Aurin or Intervals.icu.</li>
<li>We transfer Google user data only to the services listed under “Who receives your data”, only to provide features you use and with your consent. Beyond that, only for security purposes, to comply with the law, or as part of a merger, acquisition or sale of the service after your explicit consent.</li>
<li>We do not sell Google user data, do not use or transfer it for advertising, and do not transfer it to advertising platforms, data brokers or information resellers.</li>
<li>We do not use Google user data to train AI models or to determine creditworthiness or for lending.</li>
<li>No one reads your data unless you ask us to (for example, to help with a problem), it is needed for security purposes such as investigating abuse, or it is required by law. For internal operations we use only aggregated, anonymized data.</li>
</ul>
<p>Aurin’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="${API_POLICY}">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
<p>The use of information received from Google Health API and/or Developer Tools will adhere to the <a href="${HEALTH_POLICY}">Google Health API Developer and User Data Policy</a>, including the Limited Use requirements.</p>
<h2>How Apple Health data is used</h2>
<ul>
<li>On iPhone, Aurin reads from Apple Health only the types you allow, such as sleep, workouts, heart rate, HRV, steps, active energy, VO₂ max, weight, and food and water logged in other apps. It uses them only to show and evaluate your recovery, training load, workouts, food diary and calorie target.</li>
<li>Cycle tracking, only if you turn it on (Settings → Cycle): the periods, their strength, symptoms, contraception, the pill you mark as taken and the dates you enter, plus menstrual flow and ovulation tests from Apple Health if you allow them. They are used to show your cycle, to judge your readiness against your own normal for each phase and to ease a hard training day. They go to the AI coach only if you turn on "Coach knows my cycle", and then only today's phase, cycle day, bleeding and symptoms, never dates or history. They are not sent to any connected service, and turning the tracking off keeps them until you delete your account.</li>
<li>Apple Health data goes only to our server and, for features you use, to the services under “Who receives your data”. We do not sell it, do not use or share it for advertising, and do not give it to data brokers.</li>
<li>You change or remove access in the iPhone Settings → Health → Data Access & Devices → Aurin. Data already synced is deleted with your account.</li>
</ul>
<h2>Who receives your data</h2>
<ul>
<li><strong>Intervals.icu</strong>, if you connect it: the workouts you plan in Aurin, nutrition notes and calorie targets in your calendar, your weight, and every hour a copy of your daily wellness from Google Health (sleep, average sleeping heart rate, steps, resting heart rate, HRV, oxygen saturation, respiration, VO2 max and body fat). Intervals.icu handles this data under its own privacy policy.</li>
<li><strong>Google Health</strong>: the food and drinks you log and, if you allow it, your weight.</li>
<li><strong>OpenAI</strong> (USA), when you use an AI feature (such as the assistant, recognizing food from a photo, label or description, plan reviews, workout reflections or exercise descriptions): the data that request needs, such as your message, the photo and related training, sleep, health and nutrition data. OpenAI processes it on our behalf, does not use data sent through its API to train its models and keeps it for up to 30 days to detect abuse.</li>
<li><strong>Cloudflare</strong> runs Aurin, stores its database in Europe and keeps the technical logs.${email ? ' Its Email Service sends the sign-in codes and the notices about new passkeys.' : ''}</li>
<li><strong>Open-Meteo</strong> gets only the place you choose for the weather in your training plan: a place you search for, or your location rounded to about 1 km if you allow it. Without that the app shows no weather.</li>
<li><strong>Authorities</strong>, only when the law requires it.</li>
</ul>
<p>When you scan a barcode or a food label without AI, the image is processed on your device; the scanning library is loaded from the jsDelivr network. Exercise videos are embedded from YouTube in privacy-enhanced mode, and YouTube receives data only when you play a video.</p>
<p><strong>Food database.</strong> Food search uses a catalogue stored with Aurin (your searches are not sent anywhere else), made from open data: Open Food Facts (© Open Food Facts contributors, <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>), USDA FoodData Central (public domain), Fineli by THL (CC BY 4.0), Ciqual by Anses (Licence Ouverte / CC BY 4.0) and CoFID by Public Health England (Open Government Licence 3.0). The catalogue as a database is available under the ODbL; values are as the sources give them and are not checked against every label.</p>
<p>Some of these providers are based in the United States. Where data leaves the European Union, they protect it with the safeguards the GDPR requires, such as the EU Standard Contractual Clauses.</p>
<h2>Storage and security</h2>
<ul>
<li>Your data is stored in Aurin’s database at Cloudflare, encrypted at rest. All connections use HTTPS.</li>
<li>Access tokens and API keys for connected services are additionally encrypted (AES-GCM) with a key kept apart from the database.</li>
<li>Each user sees only their own data. You sign in with ${methods.en}, and your session is a signed cookie that scripts cannot read.</li>
<li>Only the operator has access to the systems that run Aurin, and does not read users’ data except as described above.</li>
</ul>
<h2>How long we keep data and how to delete it</h2>
<ul>
<li>We keep your data while you have an account. An account nobody has signed in to for two years is deleted automatically with all its data.</li>
<li><strong>Disconnecting a service</strong> in Settings stops Aurin from reading from and writing to it and removes the stored access; for Google, Aurin also gives up its access at Google. Data imported so far stays in your account until you delete it or the account.</li>
<li><strong>Deleting your account</strong> in Settings → Account immediately deletes your account and permanently deletes all its data in Aurin (for a large account, the rest within minutes): profile, food, workouts, sleep and health data, connections, passkeys and assistant history. The record of your consents is deleted with it. Aurin also gives up its access to your Google Account and clears its copy on the device you use. Database backups are overwritten within 30 days.</li>
<li>To stop using a passkey, delete it from your iPhone or password manager. Deleting your account removes all your passkeys from Aurin.</li>
<li>Data that Aurin copied to Intervals.icu or Google Health stays there; you can delete it in those services.</li>
<li>You can also remove Aurin’s access at any time in your Google Account under <a href="${GOOGLE_CONNECTIONS}">Third-party apps and services</a>. Aurin then can no longer read or write your Google data.</li>
${apple ? '<li>You can stop using Sign in with Apple for Aurin in your Apple ID settings, or unlink Apple in Settings → Account.</li>' : ''}
<li>Technical logs are kept for a few days, and OpenAI keeps AI requests for up to 30 days.</li>
</ul>
<p>The <a href="/support">Support</a> page explains step by step how to manage and delete your data.</p>
<h2>Legal bases and your rights</h2>
<p>We process your data to provide the service you asked for (Article 6(1)(b) GDPR). Health data, from Google Health, Apple Health, Intervals.icu or entered by you, is processed only with your explicit consent (Article 9(2)(a) GDPR). You give it in the app before you first use it, and we record when and to which version of this text; syncing of your connected services in the background also runs only after it. The consent covers sending the data an AI feature needs to OpenAI, because the AI features are part of the service. You withdraw your consent by deleting your account in Settings → Account, where you can first download all your data; disconnecting a service stops new data from it. Withdrawing does not affect processing before it. Technical logs rely on our legitimate interest in a secure service (Article 6(1)(f) GDPR).</p>
<p>You have the right to access, correct and delete your data, to restrict or object to its processing and to receive it in a portable format. Most of this you can do directly in the app: in Settings → Account you can download all your data as a JSON Lines (NDJSON) file or delete your account. You can also lodge a complaint with the Czech Office for Personal Data Protection (<a href="https://uoou.gov.cz">uoou.gov.cz</a>).</p>
<h2>Children</h2>
<p>Aurin is not intended for children under 16, and we do not knowingly collect their data.</p>
<h2>Changes</h2>
<p>We update this policy when Aurin or the way it uses data changes, and publish the current version on this page with its date. Before we use data you have already given us in a new way, we ask for your consent.</p>
<h2>Contact</h2>
<p>For questions about this policy or your data, or to exercise your rights, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`,
    cs: `<p class="muted">Poslední změna: ${UPDATED.cs}</p>
<p><strong>Aurin</strong> (dříve Loadwise; Petr Fitness Data, aurin.health) je osobní služba pro trénink, regeneraci a výživu. Správcem tvých osobních údajů je Petr Bouma, soukromá osoba v České republice (dále provozovatel nebo „my“). Provozovatele zastihneš na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.${open ? '' : ' Aurin je zatím dostupný jen na osobní pozvánku.'}</p>
<h2>Ve zkratce</h2>
<ul>
<li>Tvoje data používáme jen k funkcím Aurinu, které používáš.</li>
<li>Data neprodáváme, nepoužíváme k reklamě a nesdílíme s obchodníky s daty.</li>
<li>Které služby propojíš, je na tobě. Kdykoli je v aplikaci odpojíš, nebo smažeš účet i se všemi daty.</li>
</ul>
<h2>Jaká data získáváme</h2>
<p><strong>Tvůj účet.</strong> Když se přihlásíš přes Google, dostaneme tvou e-mailovou adresu a ID tvého účtu Google. Podle nich tě poznáme${open ? '' : ' a ověříme pozvánku'}. Zaznamenáváme i čas posledního přihlášení.${apple ? ' Když se přihlásíš přes Apple, dostaneme identifikátor tvého Apple ID, e-mail, který nám Apple předá (může to být skrytá adresa od Apple), a napoprvé i jméno, pokud ho sdílíš.' : ''}</p>
<p><strong>Přístupové klíče (passkeys).</strong> Když si přidáš přístupový klíč, uložíme jeho veřejný klíč, jeho identifikátor, náhodný identifikátor tvého účtu, který si klíč pamatuje, název zařízení nebo správce hesel, ve kterém vznikl, a kdy byl přidaný a naposledy použitý. Soukromý klíč zůstává ve tvém zařízení nebo ve správci hesel a otisk prstu, obličej ani zámek obrazovky tvoje zařízení neopustí.${email ? ' Když si přidáš přístupový klíč, pošleme ti o tom e-mail, takže se o každém novém klíči dozvíš.' : ''}</p>${email ? `
<p><strong>Kódy e-mailem.</strong> Když si řekneš o kód pro přihlášení, pošleme šestimístný kód na zadanou adresu, pokud má do Aurinu přístup. Uchováváme jen jeho otisk vytvořený tajným klíčem, a to 10 minut, a počítadla, která omezují, kolik kódů a pokusů adresa dostane; ta se smažou dva dny po posledním kódu. Kód poslaný na novou adresu potvrzuje i změnu e-mailu účtu v Nastavení → Účet; na starou adresu pak přijde upozornění.</p>` : ''}
<p><strong>Google Health</strong>, jen když ho připojíš a povolíš na obrazovce souhlasu Google:</p>
<ul>
<li>aktivita a kondice: kroky, vzdálenost, patra, aktivní minuty, minuty v aktivních zónách, aktivní energie, čas v tepových zónách, období nečinnosti a tréninky;</li>
<li>zdravotní měření: tep, klidový tep, variabilita srdečního tepu (HRV), okysličení krve, dechová frekvence, VO₂max, váha, výška a tělesný tuk;</li>
<li>spánek: spánky a spánkové fáze;</li>
<li>výživa: záznamy jídla a pití.</li>
</ul>
<p>Dvě oprávnění jsou nepovinná a žádáme o ně zvlášť: čtení data narození z tvého účtu Google, aby se doplnil věk, a zápis váhy do Google Health.</p>
<p><strong>Intervals.icu</strong>, jen když ho připojíš svým klíčem API: tvoje aktivity a jejich podrobnosti, plánované tréninky a události, wellness údaje a nastavení sportů.</p>
<p><strong>Ultrahuman</strong>, jen když připojíš prsten Ultrahuman: tvůj spánek a jeho fáze, variabilitu srdečního tepu, klidový tep, odchylku teploty kůže a VO2max, z nichž počítáme připravenost. Aurin tato data jen čte, nikomu dalšímu je nepředává a po odpojení prstenu je smaže.</p>
<p><strong>WHOOP</strong>, jen když připojíš účet WHOOP: tvůj spánek a jeho fáze, klidový tep, variabilitu srdečního tepu, dechovou frekvenci a okysličení krve, z nichž počítáme připravenost. Aurin tato data jen čte, nikomu dalšímu je nepředává a po odpojení WHOOPu je smaže.</p>
<p><strong>Co zadáš v Aurinu:</strong> profil (třeba věk, výška, váha, sporty, cíle a čas na trénink), jídlo a pití, tréninky a jejich hodnocení, poznámky a konverzace s asistentem.</p>
<p><strong>Ve tvém zařízení:</strong> cookie přihlášení s platností nejvýš 30 dní, krátkodobá cookie, která chrání přihlašování, cookies s vybraným vzhledem a jazykem a v úložišti prohlížeče kopie naposledy načteného dne a několik nastavení zobrazení, aby se aplikace otevřela hned, a když si přidáš nebo použiješ přístupový klíč, tvůj e-mail s označením klíče, aby tě zařízení přihlásilo jím a nemuselo posílat kód. Reklamní ani sledovací cookies nepoužíváme.</p>
<p><strong>Technické záznamy:</strong> náš poskytovatel hostingu zaznamenává technické údaje o požadavcích (třeba čas, IP adresu, stránku a chyby), aby služba fungovala a byla bezpečná. Tyto záznamy se uchovávají několik dní.</p>
<h2>K čemu data používáme</h2>
<ul>
<li>k přehledu dne, tréninkové zátěže, regenerace, spánku a cílů kalorií a maker;</li>
<li>k plánování a úpravám tréninků a výživy;</li>
<li>k synchronizaci dat mezi Aurinem a službami, které propojíš, jak popisujeme níže;</li>
<li>k odpovědím asistenta a dalším AI funkcím, když je použiješ;</li>
<li>k zabezpečení služby a opravám chyb.</li>
</ul>
<p>Aurin není zdravotnický prostředek a neposkytuje lékařské rady ani diagnózy.</p>
<h2>Jak používáme data z Googlu</h2>
<p>Data uživatelů z Googlu slouží jen k funkcím Aurinu pro trénink, regeneraci a výživu, které používáš:</p>
<ul>
<li>Data z Google Health čteme, abychom ti v Aurinu ukázali a vyhodnotili aktivitu, zdravotní měření, spánek a výživu.</li>
<li>Do Google Health zapisujeme jen jídlo a pití, které zapíšeš v Aurinu, a když to povolíš, i váhu zapsanou v Aurinu nebo Intervals.icu.</li>
<li>Data z Googlu předáváme jen službám z části Kdo data dostává, jen kvůli funkcím, které používáš, a s tvým souhlasem. Jinak už jen kvůli bezpečnosti, kvůli povinnosti ze zákona nebo při fúzi, akvizici či prodeji služby, a to po tvém výslovném souhlasu.</li>
<li>Data z Googlu neprodáváme, nepoužíváme ani nepředáváme k reklamě a nepředáváme je reklamním platformám, obchodníkům s daty ani jiným přeprodejcům informací.</li>
<li>Data z Googlu nepoužíváme k trénování modelů AI ani k posuzování úvěruschopnosti nebo půjček.</li>
<li>Tvoje data nikdo nečte, pokud o to nepožádáš (třeba při řešení problému), pokud to nevyžaduje bezpečnost, například vyšetřování zneužití, nebo zákon. Pro interní provoz používáme jen souhrnná anonymizovaná data.</li>
</ul>
<p>Použití a předání informací získaných z Google API jiné aplikaci se řídí <a href="${API_POLICY}">zásadami Google API Services User Data Policy</a> včetně požadavků na omezené použití (Limited Use).</p>
<p>Použití informací získaných z Google Health API a vývojářských nástrojů se řídí <a href="${HEALTH_POLICY}">zásadami Google Health API Developer and User Data Policy</a> včetně požadavků na omezené použití (Limited Use).</p>
<h2>Jak používáme data z Apple Health</h2>
<ul>
<li>Na iPhonu Aurin čte z Apple Health jen údaje, které povolíš, třeba spánek, tréninky, tep, HRV, kroky, aktivní energii, VO₂max, váhu a jídlo a pití zapsané v jiných aplikacích. Používá je jen k tomu, aby ti ukázal a vyhodnotil regeneraci, tréninkovou zátěž, tréninky, jídelníček a kalorický cíl.</li>
<li>Sledování cyklu, jen když ho zapneš (Nastavení → Cyklus): menstruace, jejich síla, potíže, antikoncepce, prášky, které odklikneš, a data, která zadáš, a z Apple Health menstruace a ovulační testy, pokud je povolíš. Slouží k zobrazení cyklu, k hodnocení připravenosti proti tvému normálu v dané fázi a ke zlehčení náročného tréninku. AI kouč je dostane jen po zapnutí „Kouč ví o cyklu“, a to jen dnešní fázi, den cyklu, krvácení a potíže, nikdy data ani historii. Žádné připojené službě je neposíláme a po vypnutí sledování zůstanou uložené, dokud nesmažeš účet.</li>
<li>Data z Apple Health jdou jen na náš server a kvůli funkcím, které používáš, ke službám z části Kdo data dostává. Neprodáváme je, nepoužíváme ani nepředáváme k reklamě a nedáváme je obchodníkům s daty.</li>
<li>Přístup změníš nebo zrušíš v Nastavení iPhonu → Zdraví → Přístup k datům a zařízení → Aurin. Už synchronizovaná data se smažou s účtem.</li>
</ul>
<h2>Kdo data dostává</h2>
<ul>
<li><strong>Intervals.icu</strong>, když ho připojíš: tréninky, které naplánuješ v Aurinu, poznámky k výživě a cíle kalorií v kalendáři, tvoji váhu a každou hodinu kopii denních wellness údajů z Google Health (spánek, průměrný tep ve spánku, kroky, klidový tep, HRV, okysličení krve, dech, VO₂max a tělesný tuk). Intervals.icu s nimi zachází podle svých zásad ochrany soukromí.</li>
<li><strong>Google Health</strong>: jídlo a pití, které zapíšeš, a když to povolíš, i tvoje váha.</li>
<li><strong>OpenAI</strong> (USA), když použiješ AI funkci (třeba asistenta, rozpoznání jídla z fotky, etikety nebo popisu, revizi plánu, zhodnocení tréninku nebo popis cviku): data, která daný požadavek potřebuje, třeba tvoji zprávu, fotku a související údaje o tréninku, spánku, zdraví a výživě. OpenAI je zpracovává naším jménem, data poslaná přes své API nepoužívá k trénování modelů a uchovává je nejvýš 30 dní kvůli odhalování zneužití.</li>
<li><strong>Cloudflare</strong> provozuje Aurin, ukládá jeho databázi v Evropě a uchovává technické záznamy.${email ? ' Jeho služba Email Service posílá kódy pro přihlášení a upozornění na nové přístupové klíče.' : ''}</li>
<li><strong>Open-Meteo</strong> dostane jen místo, které vybereš pro počasí v plánu tréninků: vyhledané místo, nebo tvou polohu zaokrouhlenou zhruba na 1 km, pokud ji povolíš. Bez toho aplikace počasí neukazuje.</li>
<li><strong>Úřady</strong>, jen když to vyžaduje zákon.</li>
</ul>
<p>Když skenuješ čárový kód nebo etiketu bez AI, obrázek se zpracuje přímo ve tvém zařízení; knihovna pro skenování se načítá ze sítě jsDelivr. Videa cviků jsou vložená z YouTube v režimu se zvýšenou ochranou soukromí a YouTube dostane data, až když video spustíš.</p>
<p><strong>Databáze potravin.</strong> Hledání potravin používá katalog uložený u Aurinu (co hledáš, se nikam dál neposílá), sestavený z otevřených dat: Open Food Facts (© přispěvatelé Open Food Facts, <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>), USDA FoodData Central (volné dílo), Fineli od THL (CC BY 4.0), Ciqual od Anses (Licence Ouverte / CC BY 4.0) a CoFID od Public Health England (Open Government Licence 3.0). Katalog jako databáze je k dispozici pod licencí ODbL; hodnoty jsou převzaté ze zdrojů a nejsou ověřené proti každé etiketě.</p>
<p>Někteří z těchto poskytovatelů sídlí ve Spojených státech. Když data opouštějí Evropskou unii, chrání je zárukami, které vyžaduje GDPR, například standardními smluvními doložkami EU.</p>
<h2>Uložení a zabezpečení</h2>
<ul>
<li>Data jsou uložená v databázi Aurinu u Cloudflare a jsou šifrovaná. Všechna spojení používají HTTPS.</li>
<li>Přístupové tokeny a klíče API k propojeným službám jsou navíc šifrované (AES-GCM) klíčem, který je uložený mimo databázi.</li>
<li>Každý uživatel vidí jen svoje data. Přihlašuješ se ${methods.cs} a tvoje relace je podepsaná cookie, kterou skripty nepřečtou.</li>
<li>K systémům, na kterých Aurin běží, má přístup jen provozovatel a data uživatelů nečte, kromě případů popsaných výše.</li>
</ul>
<h2>Jak dlouho data uchováváme a jak je smazat</h2>
<ul>
<li>Data uchováváme, dokud máš účet. Účet, do kterého se nikdo dva roky nepřihlásil, automaticky smažeme i se všemi daty.</li>
<li><strong>Odpojení služby</strong> v Nastavení zastaví čtení i zápis do ní a smaže uložený přístup; u Googlu se Aurin vzdá přístupu i přímo u Googlu. Data, která se do té doby načetla, zůstanou v tvém účtu, dokud je nesmažeš, nebo nesmažeš účet.</li>
<li><strong>Smazání účtu</strong> v Nastavení → Účet okamžitě smaže tvůj účet a natrvalo všechna data v Aurinu (u velkého účtu zbytek do několika minut): profil, jídla, tréninky, spánek a zdravotní data, připojení služeb, přístupové klíče i historii asistenta. Smaže se i záznam o tvých souhlasech. Aurin se zároveň vzdá přístupu k tvému účtu Google a smaže svou kopii v zařízení, ve kterém účet mažeš. Zálohy databáze se přepíšou do 30 dní.</li>
<li>Přístupový klíč přestaneš používat, když ho smažeš z iPhonu nebo ze správce hesel. Smazáním účtu zmizí z Aurinu všechny tvoje přístupové klíče.</li>
<li>Co Aurin zkopíroval do Intervals.icu nebo Google Health, tam zůstane; smazat to můžeš v těchto službách.</li>
<li>Přístup Aurinu můžeš kdykoli odebrat i ve svém účtu Google v části <a href="${GOOGLE_CONNECTIONS}">Aplikace a služby třetích stran</a>. Aurin pak už tvoje data z Googlu nepřečte ani nezapíše.</li>
${apple ? '<li>Přihlašování přes Apple pro Aurin ukončíš v nastavení svého Apple ID, nebo Apple odpojíš v Nastavení → Účet.</li>' : ''}
<li>Technické záznamy se uchovávají několik dní a OpenAI uchovává požadavky AI nejvýš 30 dní.</li>
</ul>
<p>Na stránce <a href="/support">Podpora</a> najdeš postup krok za krokem, jak data spravovat a smazat.</p>
<h2>Právní základ a tvoje práva</h2>
<p>Data zpracováváme, abychom ti poskytli službu, o kterou stojíš (čl. 6 odst. 1 písm. b) GDPR). Údaje o zdraví, z Google Health, Apple Health, Intervals.icu i ty, které zadáš sám, zpracováváme jen s tvým výslovným souhlasem (čl. 9 odst. 2 písm. a) GDPR). Dáváš ho v aplikaci před prvním použitím a my zaznamenáme kdy a ke které verzi tohoto textu; synchronizace propojených služeb na pozadí běží až po něm. Souhlas zahrnuje i posílání dat, která AI funkce potřebuje, do OpenAI, protože AI funkce jsou součástí služby. Souhlas odvoláš smazáním účtu v Nastavení → Účet, kde si předtím můžeš stáhnout všechna svoje data; odpojením služby zastavíš nová data z ní. Odvoláním nepřestává být zákonné zpracování před ním. Technické záznamy vedeme na základě oprávněného zájmu na bezpečné službě (čl. 6 odst. 1 písm. f) GDPR).</p>
<p>Máš právo na přístup ke svým datům, jejich opravu a výmaz, na omezení zpracování, vznesení námitky a na přenositelnost dat. Většinu z toho uděláš přímo v aplikaci: v Nastavení → Účet si všechna svoje data stáhneš jako soubor JSON Lines (NDJSON), nebo smažeš účet. Můžeš si také stěžovat u Úřadu pro ochranu osobních údajů (<a href="https://uoou.gov.cz">uoou.gov.cz</a>).</p>
<h2>Děti</h2>
<p>Aurin není určený dětem mladším 16 let a jejich data vědomě nesbíráme.</p>
<h2>Změny</h2>
<p>Zásady upravíme, když se změní Aurin nebo způsob práce s daty, a aktuální verzi s datem zveřejníme na této stránce. Než data, která už máme, použijeme novým způsobem, požádáme tě o souhlas.</p>
<h2>Kontakt</h2>
<p>S dotazy k těmto zásadám nebo ke svým datům a s uplatněním svých práv se obrať na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<p class="muted">Závazné je anglické znění: <a href="/privacy?lang=en">Privacy Policy</a>.</p>`
  });
}

export function termsPage(request) {
  return doc(request, '/terms', {cs: 'Podmínky použití', en: 'Terms of Use'}, {
    en: `<p>Aurin is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.</p>`,
    cs: `<p>Aurin slouží k organizaci a plánování osobního tréninku. Za správnost propojených dat a za rozhodnutí, jestli je vygenerovaný trénink pro tebe vhodný, odpovídáš ty. Aplikace neposkytuje lékařskou diagnózu ani pomoc v nouzi. Používání aplikace vyžaduje přístup k propojené službě health-api.</p><p class="muted">Závazné je anglické znění: <a href="/terms?lang=en">Terms of Use</a>.</p>`
  });
}

export function supportPage(request, {apple = false, email = false, open = false} = {}) {
  return doc(request, '/support', {cs: 'Podpora', en: 'Support'}, {
    en: `<p>${open ? '' : 'Aurin is currently available only by personal invitation. '}If something does not work, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> what went wrong, roughly when, and the error message the app showed. Never send passwords, API keys or other secrets.</p>
<h2>Signing in</h2>
<p>In the iPhone app, choose ${apple ? '<strong>Continue with Apple</strong>, ' : ''}<strong>Continue with Google</strong>${email ? ' or <strong>Continue with e-mail</strong>: you get a six-digit code that is valid for 10 minutes' : ''}. Use the same way each time, so you land in the same account.${open ? '' : ' If the app says your account is not invited, ask the operator to invite the address you use.'}</p>
<h2>Passkeys</h2>
<ul>
<li>After your first sign-in with an e-mail code, the app offers <strong>Next time with Face ID</strong>. Agree, and your iPhone saves a passkey in its password manager.</li>
<li>Next time, choose <strong>Sign in with a passkey</strong> and unlock it with Face ID, Touch ID or your passcode. A passkey saved in iCloud Keychain works on your other Apple devices too.</li>
<li>To stop using a passkey, delete it from your iPhone or password manager. Deleting your account removes all your passkeys from Aurin.</li>
</ul>
<h2>Connecting and disconnecting services</h2>
<ul>
<li>In the app, open <strong>Settings → Connections</strong>. Google Health and Intervals.icu each have a card with a button to connect them and, once connected, to disconnect them.</li>
<li>Before sending you to Google, Aurin shows what it reads from Google Health, what it writes there and who receives the data, and asks for your consent.</li>
<li>Disconnecting stops Aurin from reading and writing data in that service. For Google, Aurin also gives up its access at Google.</li>
<li>You can also remove Aurin’s access in your Google Account: open <a href="${GOOGLE_CONNECTIONS}">Third-party apps and services</a>, choose Aurin and remove its access.</li>
</ul>
<h2>Managing your data</h2>
<ul>
<li>You can edit or delete food, drinks and weight entries where you see them in the app, and change your profile in Settings.</li>
<li>Data that Aurin copied to Intervals.icu or Google Health can be edited or deleted in those services.</li>
<li>To get a copy of everything Aurin stores about you, open <strong>Settings → Account</strong> and choose <strong>Download my data</strong> (a JSON Lines file, one record per line).</li>
</ul>
<h2>Deleting your account and data</h2>
<ol>
<li>Open <strong>Settings → Account</strong>.</li>
<li>If you want to keep a copy, first choose <strong>Download my data</strong>.</li>
<li>Choose <strong>Delete account</strong>, type SMAZAT to confirm and choose <strong>Delete account permanently</strong>.</li>
</ol>
<p>Aurin immediately and permanently deletes your account and all its data: profile, food, workouts, sleep and health data, connections, passkeys and assistant history. It also gives up its access to your Google Account and clears its copy on your device. Database backups are overwritten within 30 days. Data already in Intervals.icu or Google Health stays there. More in the <a href="/privacy">Privacy Policy</a>.</p>`,
    cs: `<p>${open ? '' : 'Aurin je zatím dostupný jen na osobní pozvánku. '}Když něco nefunguje, napiš na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>, co nefungovalo, přibližně kdy to bylo a jakou chybu aplikace ukázala. Nikdy neposílej hesla, klíče API ani jiná tajemství.</p>
<h2>Přihlášení</h2>
<p>V aplikaci pro iPhone zvol ${apple ? '<strong>Pokračovat přes Apple</strong>, ' : ''}<strong>Pokračovat přes Google</strong>${email ? ' nebo <strong>Pokračovat e-mailem</strong>: přijde ti šestimístný kód, který platí 10 minut' : ''}. Přihlašuj se pokaždé stejně, ať se dostaneš do stejného účtu.${open ? '' : ' Když aplikace hlásí, že účet není pozvaný, požádej provozovatele, ať pozve adresu, kterou používáš.'}</p>
<h2>Přístupové klíče (passkeys)</h2>
<ul>
<li>Po prvním přihlášení kódem z e-mailu ti aplikace nabídne <strong>Příště přes Face ID</strong>. Když souhlasíš, iPhone si uloží přístupový klíč do správce hesel.</li>
<li>Příště zvol <strong>Přihlásit přes passkey</strong> a odemkni ho přes Face ID, Touch ID nebo kódem telefonu. Klíč uložený v Klíčence na iCloudu funguje i na tvých dalších zařízeních Apple.</li>
<li>Přístupový klíč přestaneš používat, když ho smažeš z iPhonu nebo ze správce hesel. Smazáním účtu zmizí z Aurinu všechny tvoje přístupové klíče.</li>
</ul>
<h2>Připojení a odpojení služeb</h2>
<ul>
<li>V aplikaci otevři <strong>Nastavení → Propojení</strong>. Google Health i Intervals.icu tam mají kartu s tlačítkem pro připojení a po připojení i pro odpojení.</li>
<li>Než tě Aurin pošle na Google, ukáže, co z Google Health čte, co tam zapisuje a kdo data dostane, a požádá tě o souhlas.</li>
<li>Odpojení zastaví čtení i zápis dat v dané službě. U Googlu se Aurin vzdá přístupu i přímo u Googlu.</li>
<li>Přístup Aurinu můžeš odebrat i ve svém účtu Google: otevři <a href="${GOOGLE_CONNECTIONS}">Aplikace a služby třetích stran</a>, vyber Aurin a přístup odeber.</li>
</ul>
<h2>Správa dat</h2>
<ul>
<li>Záznamy jídla, pití a váhy upravíš nebo smažeš tam, kde je v aplikaci vidíš, a profil změníš v Nastavení.</li>
<li>Co Aurin zkopíroval do Intervals.icu nebo Google Health, upravíš nebo smažeš v těchto službách.</li>
<li>Kopii všeho, co o tobě Aurin ukládá, si stáhneš v <strong>Nastavení → Účet</strong> tlačítkem <strong>Stáhnout moje data</strong> (soubor JSON Lines, jeden záznam na řádek).</li>
</ul>
<h2>Smazání účtu a dat</h2>
<ol>
<li>Otevři <strong>Nastavení → Účet</strong>.</li>
<li>Jestli si chceš data nechat, nejdřív zvol <strong>Stáhnout moje data</strong>.</li>
<li>Zvol <strong>Smazat účet</strong>, pro potvrzení napiš SMAZAT a zvol <strong>Smazat účet natrvalo</strong>.</li>
</ol>
<p>Aurin okamžitě a natrvalo smaže tvůj účet a všechna data: profil, jídla, tréninky, spánek a zdravotní data, připojení služeb, přístupové klíče i historii asistenta. Zároveň se vzdá přístupu k tvému účtu Google a smaže svou kopii ve tvém zařízení. Zálohy databáze se přepíšou do 30 dní. Co už je v Intervals.icu nebo Google Health, tam zůstane. Víc v <a href="/privacy">Zásadách ochrany soukromí</a>.</p>`
  });
}
