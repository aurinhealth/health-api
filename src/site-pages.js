// Public pages: the Aurin overview on / and the policy pages. They use the iPhone app's light
// palette (ios-native/Shared/Palette.swift): warm paper, white cards, tight sans headings.
// The phones on the overview show the app's own screens (Today in the hero, then a tinted panel per
// area of the app), taken in CI from the sample data in English, with pieces of the next screens
// (public/site/app/parts/) floating over their edges.
// When the app changes what a section shows, change the section here too.
// The site is in English only (Aurin is for the whole world); the privacy policy and the terms also
// have a Czech version at ?lang=cs, linked from the page and the footer.
import {themeTokens} from './design-system.js';
import {icon} from './icons.js';
import {SITE_ORIGIN, SERVER_HOSTS} from './app-origin.js';


const siteCss = `
@font-face{font-family:Newsreader;src:url(/site/fonts/newsreader.woff2) format("woff2");font-display:swap}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:clip}
body{margin:0;background:var(--site-bg);color:var(--text);font:17px/1.5 -apple-system,BlinkMacSystemFont,Inter,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:clip}
a{color:var(--primary-text)}
img{max-width:100%}
.icon{width:1.15em;height:1.15em;flex:none;vertical-align:-.2em;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:-.035em}
p{margin:0}
.muted{color:var(--muted)}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
:focus-visible{outline:2px solid var(--primary);outline-offset:3px}

/* Top bar: the mark on the left, the waitlist on the right; on a computer the sections in between. */
.site-head{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--site-bg) 82%,transparent);-webkit-backdrop-filter:saturate(1.4) blur(16px);backdrop-filter:saturate(1.4) blur(16px)}
.site-head .wrap{display:flex;align-items:center;gap:24px;height:64px}
.logo{display:flex;align-items:center;gap:9px;color:var(--text);text-decoration:none;font-size:21px;font-weight:600;letter-spacing:-.03em}
.site-head .links{display:flex;gap:4px;margin-left:auto}
.site-head .links a{padding:7px 12px;border-radius:999px;color:var(--sec);text-decoration:none;font-size:15px;font-weight:500}
.site-head .links a:hover{background:var(--track)}
.btn{display:inline-flex;align-items:center;height:40px;padding:0 18px;border-radius:999px;background:var(--button);color:var(--on-button);text-decoration:none;font-size:15px;font-weight:600;white-space:nowrap}
.site-head .btn{margin-left:auto}.site-head .links+.btn{margin-left:8px}
@media (max-width:899px){.site-head .links+.btn{margin-left:auto}}

/* The waitlist: an e-mail field with its button inside, sent without leaving the page (siteScript). */
.wl{display:flex;flex-direction:column;align-items:center;width:100%;max-width:440px;margin:0 auto}
.wl .field{display:flex;align-items:center;gap:6px;width:100%;height:60px;padding:0 6px 0 22px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--line),0 14px 34px -14px rgba(40,30,10,.28)}
.wl input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:17px;color:var(--text)}
.wl input::placeholder{color:var(--muted)}
.wl .go{flex:none;height:48px;padding:0 20px;border:0;border-radius:999px;background:var(--button);color:var(--on-button);font:inherit;font-size:15px;font-weight:600;cursor:pointer}
.wl .done{display:none;align-items:center;gap:10px;height:60px;padding:0 26px;border-radius:999px;background:color-mix(in srgb,var(--green) 13%,#fff);color:var(--green);font-size:17px;font-weight:600}
.wl .done svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.wl .err{margin-top:10px;font-size:15px;color:var(--rust)}.wl .err:empty{display:none}
.wl.sent .field{display:none}.wl.sent .done{display:inline-flex}

/* Footer: the mark and the line from the hero, then three short groups, then who runs Aurin. */
.site-foot{padding:56px 0 36px;color:var(--muted);font-size:14px}
.site-foot .top{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:32px}
.site-foot .brand{display:flex;flex-direction:column;align-items:flex-start;gap:14px}
.site-foot .brand p{font-size:20px;font-weight:600;letter-spacing:-.03em;color:var(--text);max-width:320px}
.site-foot h3{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.site-foot ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.site-foot a{color:var(--sec);text-decoration:none}.site-foot a:hover{color:var(--text)}
.site-foot .base{display:flex;flex-wrap:wrap;gap:6px 24px;justify-content:space-between;margin-top:44px;padding-top:20px;border-top:1px solid var(--line);font-size:13px}

.doc{max-width:760px;padding:56px 24px 96px}
.doc h1{font-size:48px;line-height:1.05;margin:0 0 24px}
.doc h2{font-size:22px;line-height:1.25;letter-spacing:-.02em;margin:40px 0 10px}
.doc p{color:var(--sec);margin-bottom:12px}
.doc ul,.doc ol{color:var(--sec);margin:0 0 12px;padding-left:22px}.doc li{margin-bottom:6px}
.card{background:var(--panel);border-radius:28px;padding:24px;box-shadow:0 1px 2px rgba(60,45,20,.05)}
.disclosure{max-width:680px;margin:40px auto 0;padding:24px 26px;text-align:left}
.disclosure h3{font-size:16px;margin-bottom:10px;letter-spacing:0}
.disclosure p{font-size:14px;line-height:1.55;color:var(--muted);margin-bottom:12px}

/* The overview. Short headlines in tight sans, each area of the app on its own tinted panel, the app's
   whole screens in a phone and real pieces of the next screens floating over its edges. */
.eb{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--c,var(--green))}
.h2{font-size:clamp(34px,5.4vw,64px);line-height:1.02;letter-spacing:-.04em}
.lead{font-size:clamp(16px,1.6vw,19px);line-height:1.45;color:var(--sec);max-width:520px}
.phone{position:relative;width:226px;padding:7px;border-radius:42px;background:var(--button);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 34px 70px -24px rgba(40,30,10,.45)}
.phone img{display:block;width:100%;height:auto;aspect-ratio:600/1305;object-fit:cover;object-position:top;border-radius:35px}
.fl{position:absolute;z-index:2;overflow:hidden;border-radius:18px;background:var(--panel);box-shadow:0 20px 44px -14px rgba(40,30,10,.32),0 0 0 1px rgba(27,26,23,.05)}
.fl img{display:block;width:100%;height:auto}
.fl.round{border-radius:50%;aspect-ratio:1;background:var(--bg)}
.fl.round img{margin-top:-4%}
/* A stage is drawn at phone size and grows on a computer. */
.stage{position:relative;width:360px;max-width:100%;height:520px;margin:0 auto}
.stage .phone{position:absolute;left:50%;top:0;transform:translateX(-50%)}

.hero{padding:48px 0 0;text-align:center;overflow:hidden}
.kick{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 0 rgba(0,0,0,.04)}
.kick i{width:7px;height:7px;border-radius:50%;background:var(--logo-recovery)}
.hero h1{font-size:clamp(46px,8.4vw,104px);line-height:.98;letter-spacing:-.045em;margin:18px auto 16px;max-width:900px}
.hero .lead{margin:0 auto 26px;max-width:560px}
.hero .small{margin-top:10px;font-size:13px;color:var(--muted)}
.hero .stage{height:560px;margin-top:40px}
.hero .glow{position:absolute;left:-30%;right:-30%;top:12%;height:70%;border-radius:50%;background:radial-gradient(closest-side,var(--glow-today),transparent)}
.cyc img+img{position:absolute;left:7px;top:7px;width:calc(100% - 14px)}
.cyc img{transition:opacity .7s ease}
.js .cyc img:not(.on){opacity:0}
.hc{transition:opacity .5s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
.js .hc:not(.on){opacity:0;transform:translateY(26px) scale(.92);pointer-events:none}
html:not(.js) .hc:not([data-g="0"]){display:none}

/* Strips that run sideways: the app's screens, and the services Aurin connects to. */
.marquee{overflow:hidden;-webkit-mask:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.marquee .run{display:flex;gap:12px;width:max-content}
.shots{margin-top:8px}
.shots img{display:block;width:132px;height:auto;border-radius:20px;box-shadow:0 12px 26px -14px rgba(40,30,10,.35)}
.shots .run{padding:6px 0 18px}
.works{padding:34px 0 30px;text-align:center}
.works .eb{color:var(--muted);margin-bottom:6px}
.works .sub{font-size:14px;color:var(--muted);margin:0 24px 18px}
.lg{flex:none;display:flex;align-items:center;gap:9px;height:50px;padding:0 16px;border-radius:15px;background:#fff;font-size:15px;font-weight:600;white-space:nowrap}
.lg img{height:24px;width:auto}
.lg.dark{background:var(--button)}.lg.dark img.word{height:15px}

/* Bento: one tile per number on Today, each in its tab's tint with the piece of the app it explains. */
.start{padding:40px 0 0}
.start .h2{margin:0 0 22px}
.bento{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.tile{position:relative;overflow:hidden;border-radius:28px;padding:22px 20px 0;background:var(--t)}
.tile h3{font-size:clamp(19px,2vw,26px);line-height:1.08;margin-top:6px}
.tile p{font-size:14px;line-height:1.38;color:var(--sec);margin:6px 0 14px}
.tile .cut{overflow:hidden;border-radius:16px;background:var(--panel);box-shadow:0 12px 26px -12px rgba(40,30,10,.28)}
.tile .cut img{display:block;width:100%;height:auto}
.tile.w2{grid-column:span 2}
.tile .pad{height:20px}
.tile .big{display:flex;gap:14px;align-items:flex-end}
.tile .num{font:400 clamp(84px,9vw,120px)/.8 Newsreader,"New York",Georgia,serif;letter-spacing:-.03em;padding-bottom:22px}
.tile .big .cut{flex:1;margin-bottom:-10px}

/* A panel per area: words, then the phone with pieces of the next screens over its edges. */
.sec{padding:12px 0 0}
.panel{position:relative;overflow:hidden;border-radius:36px;padding:40px 24px 0;background:var(--t)}
.panel .h2{margin:10px 0 12px}
.panel .stage{margin-top:28px;height:500px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.chips span{padding:6px 12px;border-radius:999px;background:color-mix(in srgb,#fff 65%,transparent);font-size:13px;font-weight:500}
.sec.dark .panel{color:var(--on-button)}
.dark .lead{color:color-mix(in srgb,var(--on-button) 72%,var(--button))}
.dark .phone{box-shadow:0 0 0 1px color-mix(in srgb,var(--on-button) 20%,var(--button)),0 30px 90px -10px color-mix(in srgb,var(--logo-recovery) 55%,transparent)}

/* Muscles: the app's figure from the front or the back, a bubble on each tired muscle, and the bubble's
   muscle up close underneath, as its detail is in the app. */
.muscles{background:#fff}
.mu{display:grid;gap:16px;margin-top:10px;padding-bottom:28px}
.fig{position:relative;width:min(100%,300px);aspect-ratio:640/1000;margin:0 auto}
.fig img{position:absolute;inset:0;width:100%;height:100%;transition:opacity .5s}
.fig img.back,.fig.turned img.front{opacity:0}.fig.turned img.back{opacity:1}
.bub{position:absolute;z-index:2;display:flex;align-items:center;gap:9px;padding:9px 13px 9px 11px;border:0;border-radius:16px;background:#fff;box-shadow:0 12px 30px -10px rgba(0,0,0,.3);font:inherit;font-size:14px;text-align:left;color:var(--text);cursor:pointer;transform:translateY(-50%);transition:opacity .35s,transform .45s cubic-bezier(.2,.7,.2,1)}
.bub i{width:9px;height:9px;border-radius:50%;background:var(--c)}
.bub b{display:block;font-weight:600}.bub small{display:block;font-size:12px;color:var(--muted)}
.bub.on{box-shadow:0 0 0 2px var(--c),0 12px 30px -10px rgba(0,0,0,.3)}
.fig:not(.turned) .bub[data-side=back],.fig.turned .bub[data-side=front]{opacity:0;pointer-events:none;transform:translateY(-50%) scale(.8)}
.turn{display:flex;gap:4px;width:max-content;margin:0 auto;padding:4px;border-radius:999px;background:var(--panel2)}
.turn button{border:0;padding:7px 16px;border-radius:999px;background:none;font:inherit;font-size:14px;font-weight:500;color:var(--sec);cursor:pointer}
.turn button[aria-pressed=true]{background:#fff;color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.zoom{overflow:hidden;border-radius:22px;background:var(--panel);box-shadow:0 0 0 1px var(--line)}
.zoom img{display:block;width:100%;height:auto;aspect-ratio:800/440}
.zoom div{padding:14px 18px 16px}.zoom b{font-size:18px}.zoom p{font-size:14px;font-weight:600;color:var(--c)}

/* More: the smaller things the app does, one line each. */
.more{padding:60px 0 0}
.more .h2{margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.grid div{padding:18px;border-radius:22px;background:#fff}
.grid i{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:var(--c);color:#fff}
.grid i .icon{width:18px;height:18px}
.grid h3{font-size:16px;letter-spacing:-.01em;margin:12px 0 4px}
.grid p{font-size:13.5px;line-height:1.38;color:var(--muted)}

.privacy .panel{padding-bottom:36px}
.privacy .lock{width:32px;height:32px;color:var(--green);stroke-width:1.8}
.privacy .h2{font-size:clamp(28px,4vw,48px)}

/* Questions: plain details/summary, so they open without JS; browsers that can animate to auto height do. */
.faq{max-width:820px;margin:0 auto;padding:64px 0 0}
.faq .h2{margin-bottom:18px}
.faq details{margin-bottom:8px;border-radius:18px;background:#fff}
.faq summary{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 20px;font-size:16px;font-weight:500;cursor:pointer;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";flex:none;font-size:22px;font-weight:300;color:var(--muted);transition:transform .3s}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{padding:0 20px 18px;color:var(--sec);font-size:15px}

.final{margin-top:48px;padding:56px 24px 40px;border-radius:36px;text-align:center;color:var(--on-button);background:linear-gradient(160deg,var(--green),color-mix(in srgb,var(--green) 55%,#000))}
.final .mark{display:block;margin:0 auto 18px}
.final .h2{font-size:clamp(40px,6vw,72px);margin-bottom:24px}
.final .wl .field{box-shadow:none}

/* Motion, only with JS and without reduced motion: pieces rise in as they scroll into view and then
   float, the strips run, the hero phone walks through its screens and the readiness counts up. */
@media (prefers-reduced-motion:no-preference){
  .js .rv{opacity:0;transform:translateY(36px) scale(.97);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0s)}
  .js .rv.in{opacity:1;transform:none}
  .js .fl.rv{transform:translateY(46px) scale(.9)}
  .js .fl.rv.in{transform:none;animation:float 6s ease-in-out 1.2s infinite}
  @keyframes float{50%{translate:0 -7px}}
  .marquee .run{animation:run var(--t,40s) linear infinite}
  .marquee.back .run{animation-direction:reverse}
  @keyframes run{to{transform:translateX(calc(-50% - 6px))}}
  .js .hero .kick,.js .hero h1,.js .hero .lead,.js .hero .wl{animation:up .9s cubic-bezier(.2,.7,.2,1) both}
  .js .hero h1{animation-delay:.08s}.js .hero .lead{animation-delay:.18s}.js .hero .wl{animation-delay:.28s}
  @keyframes up{from{opacity:0;transform:translateY(24px)}}
  @supports (interpolate-size:allow-keywords){
    .faq{interpolate-size:allow-keywords}
    .faq details::details-content{height:0;overflow:clip;transition:height .35s cubic-bezier(.16,1,.3,1),content-visibility .35s allow-discrete}
    .faq details[open]::details-content{height:auto}
  }
}

/* A computer: the stages grow, each panel puts its words beside the phone, the grids widen. */
@media (min-width:900px){
  .hero{padding-top:72px}
  .hero .stage{transform:scale(1.25);transform-origin:top center;margin-bottom:140px}
  .panel{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:40px;padding:0 64px;min-height:640px}
  .panel>.txt{padding:64px 0}
  .panel .stage{margin:40px auto 0;align-self:end;transform:scale(1.15);transform-origin:bottom center}
  .muscles{display:block;padding:64px}
  .mu{grid-template-columns:1fr 1fr;align-items:center;gap:48px}
  .fig{width:min(100%,380px)}
  .privacy .panel{display:block;padding:56px 64px;min-height:0}
  .tile.w2 .cut{max-width:440px;margin:0 auto}
  .final{padding:88px 24px 72px}
}
@media (max-width:899px){
  .site-head .links{display:none}
  .bento,.grid{grid-template-columns:1fr 1fr}
  .site-foot .top{grid-template-columns:1fr 1fr 1fr;gap:28px 20px}.site-foot .brand{grid-column:1/-1}
}
@media (max-width:560px){
  .wrap{padding:0 12px}
  .hero .wrap,.start .wrap>.h2,.works,.more .h2,.faq{padding-left:6px;padding-right:6px}
  .bento{gap:10px}
  .tile{padding:18px 14px 0;border-radius:24px}
  .panel{padding:34px 20px 0;border-radius:32px}
  .site-foot .wrap{padding:0 22px}
}
`;

// Language of the app-facing pages (sign-in by e-mail, shared workouts): ?lang= in the link, then
// the lw-lang cookie (shared with the app), then the browser's first language (Czech or Slovak → cs,
// anything else → en). The public site itself is English; see pageLang.
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

// The Aurin mark (Rovnováha): the load half over the recovery half, offset as in the app icon.
const mark = width => `<svg class="mark" viewBox="6 10 88 80" width="${width}" height="${Math.round(width * 80 / 88)}" aria-hidden="true"><path d="M6 46A36 36 0 0 1 78 46Z" fill="var(--logo-load)"/><path d="M22 54A36 36 0 0 0 94 54Z" fill="var(--logo-recovery)"/></svg>`;
const LOCK = '<svg class="icon lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
// The waitlist: an e-mail field with its button; the address waits for the owner, who invites
// people into TestFlight from the app (src/testflight-waitlist.js).
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const store = (id, label) => `<form class="wl" action="/waitlist" method="post" novalidate>
<span class="field"><label class="vh" for="wl-${id}">Your email</label><input id="wl-${id}" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com" required><button type="submit" class="go">${label}</button></span>
<span class="done" role="status">${CHECK}<span>You're on the list</span></span>
<span class="err" role="alert"></span>
</form>`;

// The page's motion and the waitlist. Without JS everything is simply shown; with reduced motion
// nothing moves.
const siteScript = `<script>(function(){var r=document.documentElement;r.classList.add('js');
var still=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Pieces rise in as they come into view; a number in one counts up to its value.
function count(el){var n=+el.dataset.n,t0=performance.now();if(still)return;(function step(now){var k=Math.min(1,(now-t0)/1100);el.textContent=Math.round(n*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(step);})(t0);}
var rv=[].slice.call(document.querySelectorAll('.rv'));
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;e.target.classList.add('in');io.unobserve(e.target);
 [].forEach.call(e.target.querySelectorAll('[data-n]'),count);});},{rootMargin:'0px 0px -8% 0px'});rv.forEach(function(el){io.observe(el);});}
else rv.forEach(function(el){el.classList.add('in');});
// The hero phone walks through Today, Sleep, Training and Food; each screen brings its own pieces.
var shots=[].slice.call(document.querySelectorAll('.cyc img')),at=0;
function show(i,on){[].forEach.call(document.querySelectorAll('.hc[data-g="'+i+'"]'),function(el,j){setTimeout(function(){el.classList.toggle('on',on);},on?250+j*160:0);});}
if(shots.length>1&&!still)setInterval(function(){if(document.hidden)return;show(at,false);shots[at].classList.remove('on');at=(at+1)%shots.length;shots[at].classList.add('on');show(at,true);},3200);
// The waitlist: the address goes to /waitlist and the field turns into a thank-you.
document.querySelectorAll('form.wl').forEach(function(f){var input=f.querySelector('input'),err=f.querySelector('.err'),busy=false;
 f.addEventListener('submit',function(e){e.preventDefault();if(busy)return;var email=input.value.trim();err.textContent='';
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){err.textContent='Enter a valid email.';input.focus();return;}
  busy=true;fetch('/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})})
  .then(function(r){return r.json().catch(function(){return {};}).then(function(b){if(!r.ok)throw new Error(b.message||'Something went wrong. Try again.');f.classList.add('sent');})})
  .catch(function(x){err.textContent=x.message;}).then(function(){busy=false;});});});
// Muscles: Front and Back turn the figure; a bubble shows its muscle up close, as its detail does in the app.
var fig=document.querySelector('.fig');if(!fig)return;
var zoom=document.querySelector('.zoom'),bubs=[].slice.call(fig.querySelectorAll('.bub')),turn=[].slice.call(document.querySelectorAll('.turn button'));
function pick(b){bubs.forEach(function(x){x.classList.toggle('on',x===b);});zoom.style.setProperty('--c',b.style.getPropertyValue('--c'));
 zoom.querySelector('img').src=b.dataset.zoom;zoom.querySelector('b').textContent=b.querySelector('b').textContent;zoom.querySelector('p').textContent=b.dataset.state;}
bubs.forEach(function(b){b.addEventListener('click',function(){pick(b);});});
turn.forEach(function(t){t.addEventListener('click',function(){var back=t.dataset.side==='back';fig.classList.toggle('turned',back);
 turn.forEach(function(x){x.setAttribute('aria-pressed',x===t);});pick(bubs.filter(function(b){return b.dataset.side===t.dataset.side;})[0]);});});
})();</script>`;

function sitePage({title, description, lang, origin, path, body, czech=false, index=true}) {
  const self = `${origin}${path}${lang === 'cs' ? '?lang=cs' : ''}`;
  const html = `<!doctype html>
<html lang="${lang}" class="site">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#F6F4EF">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${origin}/site/og-en.png">
<meta property="og:locale" content="${lang === 'cs' ? 'cs_CZ' : 'en_US'}">
<link rel="canonical" href="${self}">
${czech ? `<link rel="alternate" hreflang="en" href="${origin}${path}">\n<link rel="alternate" hreflang="cs" href="${origin}${path}?lang=cs">` : ''}
${index ? '' : '<meta name="robots" content="noindex">'}
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="preload" href="/site/fonts/newsreader.woff2" as="font" type="font/woff2" crossorigin>
<style>${themeTokens}${siteCss}</style>
</head>
<body>
<header class="site-head"><div class="wrap">
<a class="logo" href="/">${mark(28)}<span>Aurin</span></a>
<nav class="links" aria-label="Main"><a href="/#pripravenost">Features</a><a href="/#kouc">AI coach</a><a href="/#propojeni">Connections</a><a href="/#soukromi">Privacy</a></nav>
<a class="btn" href="/#join">Join waitlist</a>
</div></header>
${body}
<footer class="site-foot"><div class="wrap">
<div class="top">
<div class="brand">${mark(40)}<p>Train for how you feel today.</p></div>
<nav aria-label="Aurin"><h3>Aurin</h3><ul><li><a href="/#pripravenost">Features</a></li><li><a href="/#kouc">AI coach</a></li><li><a href="/#propojeni">Connections</a></li></ul></nav>
<nav aria-label="Help"><h3>Help</h3><ul><li><a href="/support">Support</a></li><li><a href="/#faq">Questions</a></li><li><a href="/support#problem">Report a problem</a></li><li><a href="mailto:${CONTACT_EMAIL}">Write to us</a></li></ul></nav>
<nav aria-label="Documents"><h3>Documents</h3><ul><li><a href="/privacy">Privacy Policy</a></li><li><a href="/terms">Terms of Use</a></li><li lang="cs">Česky: <a href="/privacy?lang=cs" hreflang="cs">Soukromí</a> · <a href="/terms?lang=cs" hreflang="cs">Podmínky</a></li></ul></nav>
</div>
<div class="base"><span>© 2026 Aurin · run by Petr Bouma, Czech Republic</span><span>Aurin is not a medical device.</span></div>
</div></footer>
${siteScript}
</body></html>`;
  return new Response(html, {status:200, headers:{'content-type':'text/html; charset=utf-8', 'content-language':lang, 'cache-control':'private, max-age=0, must-revalidate'}});
}

// Pages take the request (to pick the host, and ?lang=cs on the pages that have Czech) or nothing
// (English on aurin.health, for tests).
function pageLang(request, czech = false) {
  if (!request) return {lang: 'en', origin: SITE_ORIGIN};
  // The site's home is aurin.health; petrfitnessdata.eu serves the same pages for older links.
  // Absolute links (share image, language versions) keep to the host the page is served on.
  const host = new URL(request.url).hostname;
  const lang = czech && new URL(request.url).searchParams.get('lang') === 'cs' ? 'cs' : 'en';
  return {lang, origin: SERVER_HOSTS.has(host) ? `https://${host}` : SITE_ORIGIN};
}

// Google's policies ask the privacy policy to name every party that receives data, how it is stored and
// secured, and what happens on disconnecting and deleting; the support page is the help on managing and
// deleting data. Keep both in step with the code: scopes in google-scopes.js, the wellness copy in
// wellness-sync.js, the download and deletion in account-data.js.
const UPDATED = {cs: '19. října 2026', en: '19 October 2026'};
// The controller's address for questions and data requests (privacy policy and support page).
const CONTACT_EMAIL = 'support@aurin.health';
const API_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy';
const HEALTH_POLICY = 'https://developers.google.com/health/policies/health-api-developer-user-data-policy';
const GOOGLE_CONNECTIONS = 'https://myaccount.google.com/connections';

// The overview follows the app: Today in the hero, then a story with one phone whose screen follows
// the chapters (readiness, strain, the plan, the gym, food, the coach), the connections, privacy and
// questions. The numbers are one believable morning, the same everywhere.
// Google's app verification reads this disclosure on the homepage. Petr took it off the overview
// to keep the page clean (2026-10-15); before asking Google to verify the app, set this to true.
// The text stays word for word (tests/site-pages.test.mjs).
export const GOOGLE_DISCLOSURE_ON_HOME = false;
export const googleDisclosure = () => `<div class="card disclosure reveal" lang="en"><h3>Google Health data disclosure</h3>
<p>Aurin (Petr Fitness Data) is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows.</p>
<p>With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p>
<p style="margin:0">The service can process training and fitness data from connected services, including Google Health data that the account owner has authorized, in order to provide these requested workflows.</p>
<p style="margin:12px 0 0">Two optional permissions are requested separately: adding weight records to Google Health (weight you log in Aurin or Intervals.icu) and reading your date of birth from your Google Account to fill in your age.</p>
<p style="margin:12px 0 0">Aurin’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="${API_POLICY}">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
<p style="margin:12px 0 0">The use of information received from Google Health API and/or Developer Tools will adhere to the <a href="${HEALTH_POLICY}">Google Health API Developer and User Data Policy</a>, including the Limited Use requirements.</p></div>`;

export function overviewPage(request) {
  const {lang, origin} = pageLang(request);
  // A screen of the app: a screenshot taken in CI from the sample data (public/site/app/).
  const shot = (name, {lazy = true, cls = ''} = {}) => `<img src="/site/app/${name}.webp" alt="" width="600" height="1305"${cls ? ` class="${cls}"` : ''}${lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"'}>`;
  // A piece of the app lifted out beside a phone (public/site/app/parts/, cut from the same screenshots).
  const PARTS = {'build-form': 582, 'coach-card': 350, 'food-add': 903, 'food-top': 934, 'ready-parts': 804, 'sleep-dial': 876,
    'sleep-need': 565, 'sleep-stages': 401, 'sleep-why': 737, 'strain-gauge': 715, 'tm-rest': 759, week: 408};
  const img = name => `<img src="/site/app/parts/${name}.webp" alt="" width="${name === 'week' ? 540 : 840}" height="${PARTS[name]}" loading="lazy" decoding="async">`;
  const part = (name, style, cls = '') => `<div class="fl ${cls}" style="${style}">${img(name)}</div>`;
  const phone = (screen, parts) => `<div class="stage" aria-hidden="true"><div class="phone">${shot(screen)}</div>
${parts.map(([name, style, cls = ''], i) => part(name, `${style};--d:${(.12 + i * .16).toFixed(2)}s`, `rv ${cls}`)).join('\n')}</div>`;
  const panel = (id, tint, color, eyebrow, h, p, stage, extra = '', cls = '') => `<section id="${id}" class="sec${cls ? ' ' + cls : ''}"><div class="wrap"><div class="panel" style="--t:${tint};--c:${color}">
<div class="txt"><div class="eb">${eyebrow}</div><h2 class="h2 rv">${h}</h2><p class="lead rv">${p}</p>${extra}</div>
${stage}</div></div></section>`;

  // The hero phone walks through four screens of the sample day; each brings pieces of its next screens.
  const HERO = [
    ['today', [['ready-parts', 'left:-6px;top:250px;width:178px'], ['sleep-stages', 'right:-8px;top:70px;width:170px'], ['strain-gauge', 'right:-4px;top:384px;width:150px']]],
    ['sleep', [['sleep-why', 'right:-10px;top:60px;width:172px'], ['sleep-dial', 'left:-10px;top:250px;width:170px', 'round']]],
    ['training', [['week', 'left:-8px;top:120px;width:190px'], ['strain-gauge', 'right:-6px;top:330px;width:150px']]],
    ['food-day', [['food-add', 'left:-10px;top:260px;width:176px'], ['coach-card', 'right:-12px;top:96px;width:196px']]]];
  const hero = `<div class="stage" role="img" aria-label="Aurin on a phone: the Today screen with readiness 78, sleep, strain and HRV, then sleep, the training week and food"><div class="glow"></div>
<div class="phone cyc">${HERO.map(([screen], i) => shot(screen, {lazy: i > 0, cls: i ? '' : 'on'})).join('')}</div>
${HERO.map(([, parts], g) => parts.map(([name, style, cls = '']) => `<div class="fl hc ${cls}${g ? '' : ' on'}" data-g="${g}" style="${style}">${img(name)}</div>`).join('')).join('\n')}</div>`;

  // Strips that run sideways; the second copy is only for the loop.
  const marquee = (items, cls = '', time = 40) => `<div class="marquee ${cls}" style="--t:${time}s"><div class="run">${items}<span style="display:contents" aria-hidden="true">${items}</span></div></div>`;
  const screens = ['sleep', 'strain-target', 'training', 'builder', 'training-set', 'food-day', 'journal-impact', 'coach-ask', 'sleep-need', 'bedtime']
    .map(name => shot(name)).join('');
  // Every service the app connects to, with the app's own logo file.
  const services = [['apple-health.png', 'Apple Health'], ['google-health.png', 'Google Health'], ['intervals.svg', 'Intervals.icu'],
    ['whoop.svg', ''], ['ultrahuman.svg', '', 'dark'], ['wahoo.png', '', 'dark word']]
    .map(([file, name, cls = '']) => `<span class="lg${cls.includes('dark') ? ' dark' : ''}"><img src="/site/logos/${file}" alt="${name ? '' : {'whoop.svg': 'WHOOP', 'ultrahuman.svg': 'Ultrahuman Ring', 'wahoo.png': 'Wahoo'}[file]}"${cls.includes('word') ? ' class="word"' : ''}>${name}</span>`).join('');

  // Muscles: the figure from the front and the back (rendered ahead by scripts/render-muscles-site.mjs),
  // with the sample day's tired and recovering muscles (DemoData.muscles), in English.
  const MUSCLES = [['front', 'quads', 'Quads', '37 % rested · ≈ in 2 days', 'var(--rust)', 'left:2%;top:60%'],
    ['front', 'chest', 'Chest', '61 % rested · today', 'var(--amber-bar)', 'right:0;top:25%'],
    ['back', 'glutes', 'Glutes', '26 % rested · in 2 days', 'var(--rust)', 'right:0;top:48%'],
    ['back', 'hamstrings', 'Hamstrings', '35 % rested · in 2 days', 'var(--rust)', 'left:0;top:64%']];
  const bubble = ([side, id, name, state, color, at], i) => `<button type="button" class="bub${i ? '' : ' on'}" data-side="${side}" data-zoom="/site/muscles/z-${id}.webp" data-state="${state}" style="${at};--c:${color}"><i></i><span><b>${name}</b><small>${state.split(' · ')[0]}</small></span></button>`;
  const muscles = `<section id="svaly" class="sec"><div class="wrap"><div class="panel muscles" style="--c:var(--green)">
<div class="eb">Muscles</div><h2 class="h2 rv">Know what’s recovered.</h2><p class="lead rv">From the gym and from your runs and rides. Tap a muscle to see it up close.</p>
<div class="mu"><div><div class="fig" role="img" aria-label="Aurin’s figure of the muscles: legs and glutes tired, chest and back recovering, the rest rested">
<img class="front" src="/site/muscles/f00.webp" alt="" width="640" height="1000" loading="lazy" decoding="async"><img class="back" src="/site/muscles/f36.webp" alt="" width="640" height="1000" loading="lazy" decoding="async">
${MUSCLES.map(bubble).join('\n')}</div>
<div class="turn"><button type="button" data-side="front" aria-pressed="true">Front</button><button type="button" data-side="back" aria-pressed="false">Back</button></div></div>
<div class="zoom rv" style="--c:${MUSCLES[0][4]}"><img src="/site/muscles/z-${MUSCLES[0][1]}.webp" alt="" width="800" height="440" loading="lazy" decoding="async"><div><b>${MUSCLES[0][2]}</b><p>${MUSCLES[0][3]}</p></div></div></div>
</div></div></section>`;

  const MORE = [['check', 'var(--green)', 'Journal', 'Tick off a sauna, alcohol or a late meal and see what each does to your mornings.'],
    ['moon', 'var(--indigo)', 'Alarm', 'Set your wake-up from your sleep plan, right in the iPhone alarm.'],
    ['drop', 'var(--blue)', 'Drinks', 'Water, coffee and tea in one tap.'],
    ['barcode', 'var(--amber)', 'Barcode', 'Scan a packet and log it in seconds.'],
    ['flame', 'var(--carbs)', 'Records', 'Your best lifts, kept for every exercise.'],
    ['training', 'var(--button)', 'Lock screen', 'The rest timer stays on your lock screen and shows what comes next.'],
    ['calendar', 'var(--rust)', 'Cycle', 'Your cycle day, its phase and the next period.'],
    ['today', 'var(--logo-recovery)', 'Widgets', 'Readiness, sleep, food and drinks on your home screen.']];

  const faq = [
    ['Do I need an Apple Watch?', 'No. Aurin works with any watch or ring that saves to Apple Health or Google Health, such as Apple Watch, Fitbit, Pixel Watch or Garmin. The Ultrahuman Ring, WHOOP and Wahoo connect directly.'],
    ['Which phones does Aurin run on?', 'Aurin is an iPhone app. Google Health data comes through your Google account, so a Fitbit or a Pixel Watch works with it too.'],
    ['What does it cost?', 'Aurin is free, the AI coach included. If paid features come later, you will see the price before you buy, and they will be sold only through the App Store.'],
    ['I wear more than one device. Which one counts?', 'For your nights, Aurin uses the device you wore most nights in the last 30 days, and the others only fill the nights it missed. Your day is put together hour by hour from whichever device measured that hour. You can also pick the source yourself in Settings → Data sources → Where to take data from.'],
    ['What does the AI coach see?', 'Only the data the question needs, when you use an AI feature such as the coach or a food photo. It goes to OpenAI, which does not use it to train its models. <a href="/privacy">More in the privacy policy</a>.'],
    ['Can I delete my data?', 'Yes. In Settings → Privacy &amp; data you can download all your data or delete your account with everything in it.'],
    ['Is Aurin a medical device?', 'No. Aurin helps you plan training, food and rest. It does not diagnose or treat anything, so if you feel unwell, see a doctor.'],
    ['Something doesn’t work. What now?', `In the app, open Settings → Help → Report a problem and send it with diagnostics attached, or write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`],
    ['I’m missing something in Aurin. Can I suggest it?', 'Yes. In the app, open Settings → Help → Suggest a feature, write what would help you and send it.']]
    .map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n');

  return sitePage({lang, origin, path: '/',
    title: 'Aurin · train for how you feel today',
    description: 'Aurin for iPhone reads your sleep, HRV and workouts from Apple Health, Google Health and Intervals.icu, shows your readiness every morning and plans your training and food around it.',
    body: `<main>
<section class="hero"><div class="wrap">
<span class="kick"><i></i>AI fitness coach for iPhone</span>
<h1>Train for how you feel today.</h1>
<p class="lead">Aurin reads your sleep, HRV and workouts and turns them into one number, one plan and one coach every morning.</p>
${store('top', 'Join the waitlist')}
<p class="small">Free to start. Works with the watch or ring you already wear.</p>
${hero}
</div></section>
<div class="shots" aria-hidden="true">${marquee(screens, '', 60)}</div>

<section id="propojeni" class="works"><div class="eb">Works with what you wear</div>
<p class="sub">Any watch or ring that saves to Apple Health or Google Health, plus these directly.</p>
${marquee(services, '', 30)}</section>

<section id="pripravenost" class="start"><div class="wrap">
<h2 class="h2 rv">Start every day knowing where you stand.</h2>
<div class="bento">
<div class="tile w2 rv" style="--t:var(--glow-today);--c:var(--green)"><div class="eb">Readiness</div><h3>One number every morning.</h3><p>HRV, resting heart rate and sleep, weighed against your own normal.</p>
<div class="big"><div class="num" data-n="78">78</div><div class="cut">${img('ready-parts')}</div></div></div>
<div class="tile rv" style="--t:var(--glow-health);--c:var(--indigo);--d:.1s"><div class="eb">Sleep</div><h3>Know what you need tonight.</h3><p>Your need grows with a hard day and with the debt from the week.</p><div class="cut">${img('sleep-need')}</div><div class="pad"></div></div>
<div id="zatez" class="tile rv" style="--t:var(--glow-training);--c:var(--amber);--d:.2s"><div class="eb">Strain</div><h3>A target for today.</h3><p>Where today’s strain should land, from your readiness, sleep debt and plan.</p><div class="cut">${img('strain-gauge')}</div><div class="pad"></div></div>
<div id="trenink" class="tile w2 rv" style="--t:color-mix(in srgb,var(--glow-today) 60%,#fff);--c:var(--green)"><div class="eb">Training</div><h3>A plan that adapts.</h3><p>An activity for every day, picked for how you recovered. Follow a plan, plan the week yourself or let the AI do it, and sync it with Intervals.icu.</p><div class="cut">${img('week')}</div><div class="pad"></div></div>
<div class="tile w2 rv" style="--t:var(--glow-food);--c:var(--coffee);--d:.1s"><div class="eb">Nutrition</div><h3>Your target moves with your training.</h3><p>Train harder and you get more to eat. The coach says what that means for your next meal.</p><div class="cut">${img('food-top')}</div><div class="pad"></div></div>
</div></div></section>

${panel('spanek', 'linear-gradient(180deg,var(--glow-health),var(--lilac))', 'var(--indigo)', 'Sleep', 'Every night, in&nbsp;detail.',
  'Deep, REM and light sleep from any watch or ring. Drag the moon and the sun on the dial and Aurin tells you when to go to bed to wake up rested.',
  phone('sleep', [['sleep-dial', 'left:-10px;top:200px;width:170px', 'round'], ['sleep-why', 'right:-12px;top:40px;width:168px']]))}

${panel('posilovna', 'linear-gradient(180deg,var(--glow-training),var(--sand))', 'var(--amber)', 'Gym', 'A workout made for&nbsp;today.',
  'From your rested muscles, your time and your gym. Then log every set in a tap, with your weights from last time and a rest timer.',
  phone('training-set', [['build-form', 'left:-10px;top:40px;width:160px'], ['tm-rest', 'right:-14px;top:250px;width:150px', 'round']]),
  '<div class="chips rv"><span>30 to 120 min</span><span>Full body · Upper · Legs</span><span>Only your equipment</span></div>', 'rezim')}

${muscles}

${panel('vyziva', 'linear-gradient(180deg,var(--glow-food),var(--amber-soft))', 'var(--coffee)', 'Nutrition', 'Snap, scan or&nbsp;search.',
  'Take a photo of your plate, scan a barcode or search, and log drinks with one tap.',
  phone('food-day', [['food-add', 'left:-10px;top:250px;width:172px']]))}

${panel('kouc', 'var(--button)', 'var(--coach-mint)', 'AI coach', 'Just ask. It knows your&nbsp;data.',
  'Ask how to train today, how to adjust your week or what to eat before a workout. It remembers what you tell it, and you can see and edit what it remembers.',
  phone('coach-ask', [['coach-card', 'right:-12px;top:330px;width:200px']]), '<div class="chips rv"><span>Free for everyone</span></div>', 'dark')}

<section class="more"><div class="wrap">
<h2 class="h2 rv">And there’s more.</h2>
<div class="grid">${MORE.map(([name, color, title, text], i) => `<div class="rv" style="--d:${(i % 4) * .06}s"><i style="--c:${color}">${icon(name)}</i><h3>${title}</h3><p>${text}</p></div>`).join('')}</div>
</div></section>

<section id="soukromi" class="sec privacy"><div class="wrap"><div class="panel" style="--t:var(--green-soft)">
${LOCK}<h2 class="h2 rv" style="margin-top:14px">Your data works only for you.</h2>
<p class="lead rv">Aurin reads only what you allow, never sells it or uses it for ads, and you can delete all of it in Settings at any time.</p>
${GOOGLE_DISCLOSURE_ON_HOME ? googleDisclosure() : ''}
</div></div></section>

<section id="faq"><div class="wrap"><div class="faq">
<h2 class="h2 rv">Questions</h2>
${faq}
</div></div></section>

<section id="join" class="wrap"><div class="final rv">
${mark(64)}
<h2 class="h2">Your mornings, with a plan.</h2>
${store('end', 'Join')}
</div></section>
</main>`
  });
}

// Policy pages. The English text is the reference version (Google verification reads it). The
// privacy policy and the terms also have a Czech version that says the same, at ?lang=cs.
function doc(request, path, title, html) {
  const czech = Boolean(html.cs), {lang, origin} = pageLang(request, czech), pick = x => lang === 'cs' ? x.cs : x.en;
  const other = !czech ? '' : lang === 'cs'
    ? `<p class="muted"><a href="${path}" lang="en" hreflang="en">English version</a></p>`
    : `<p class="muted"><a href="${path}?lang=cs" lang="cs" hreflang="cs">Česká verze</a></p>`;
  return sitePage({lang, origin, path, czech, title: `${pick(title)} · Aurin`, description: lang === 'cs' ? `${title.cs} pro Aurin (aurin.health).` : `${title.en} for Aurin (aurin.health).`,
    body: `<main class="wrap doc"><h1>${pick(title)}</h1>${other}${pick(html)}</main>`});
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
<li>activity and fitness: steps, distance, floors, active minutes, active zone minutes, active energy burned, time in heart rate zones, sedentary periods and exercise sessions, including the GPS route of a workout recorded with GPS, kept to show its map;</li>
<li>health metrics and measurements: heart rate, resting heart rate, heart rate variability, oxygen saturation, respiratory rate, VO2 max, weight, height and body fat;</li>
<li>sleep: sleep sessions and sleep stages;</li>
<li>nutrition: food and drink logs.</li>
</ul>
<p>Two optional permissions are asked for separately: reading your date of birth from your Google Account, to fill in your age, and writing your weight to Google Health.</p>
<p><strong>Intervals.icu</strong>, only if you connect it: your activities and their details, planned workouts and events, wellness data and sport settings.</p>
<p><strong>Ultrahuman</strong>, only if you connect your Ultrahuman Ring: your sleep and its stages, heart rate variability, resting heart rate, skin temperature deviation and VO2max, to work out your readiness. Aurin only reads this data, never passes it on to other services, and deletes it when you disconnect the ring.</p>
<p><strong>WHOOP</strong>, only if you connect your WHOOP account: your sleep and its stages, resting heart rate, heart rate variability, breathing rate and blood oxygen, to work out your readiness. Aurin only reads this data, never passes it on to other services, and deletes it when you disconnect WHOOP.</p>
<p><strong>Wahoo</strong>, only if you connect your Wahoo account: your finished rides and runs (start, duration, distance, climbing, power, training load, heart rate, cadence and calories), to count them in your training load. Aurin deletes them when you disconnect Wahoo.</p>
<p><strong>What you enter in Aurin:</strong> your profile (such as age, height, weight, sports, goals and the time you have for training), food and drinks, workouts and how they went, notes, your journal answers (such as alcohol, caffeine, sauna or how you felt), and your conversations with the assistant. We count the messages you send the coach each week, to keep the service fair for everyone.</p>
<p><strong>What you send us from Settings → Help:</strong> a problem report with what you write, a screenshot if you add one and, if you leave it on, the app’s diagnostics (app and iOS version, your connections and their last errors, failed requests and crashes, never your health data), or a feature idea with the app version. We keep them to answer you and fix the problem, and they are deleted with your account.</p>
<p><strong>The waitlist on our website:</strong> when you join it, we keep the email address you enter and when you joined. We use it only to let you test Aurin through Apple’s TestFlight; we send no newsletters to it.</p>
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
<li>Journal, only if you allow it (Settings → Data sources → Apple Health → Journal): mindful minutes, time in daylight, noise levels while you sleep, symptoms (headache, runny nose, body ache and stomach trouble), sexual activity and yoga or stretching workouts, one value a day each, plus the days your iPhone changed time zone. They are used only to fill in your journal, and the AI coach sees them only as the answers of the journal items you keep in your journal, like the ones you tap yourself.</li>
<li>Cycle tracking, only if you turn it on (Settings → Cycle): the periods, their strength, symptoms, contraception, the life stage (perimenopause or menopause) and hormone therapy if you set them, the pill you mark as taken and the dates you enter, plus menstrual flow, ovulation tests, hot flashes, night sweats and sleep changes from Apple Health if you allow them. They are used to show your cycle, to judge your readiness against your own normal for each phase and to ease a hard training day. They go to the AI coach only if you turn on "Coach knows my cycle", and then only today's phase, cycle day, bleeding, symptoms, life stage and hormone therapy, never dates or history. They are not sent to any connected service, and turning the tracking off keeps them until you delete your account.</li>
<li>Writing to Apple Health, only if you turn it on (Settings → Sync → Apple Health): workouts you log in Aurin and, for the types you choose, the weight you type in, the day’s food (energy, protein, carbohydrates and fat) and water. iOS asks your permission for each type, and you can turn writing off in the same place or in the iPhone Settings → Health → Data Access &amp; Devices → Aurin. What Aurin wrote stays in Apple Health when you delete your account.</li>
<li>Apple Health data goes only to our server and, for features you use, to the services under “Who receives your data”. We do not sell it, do not use or share it for advertising, and do not give it to data brokers.</li>
<li>You change or remove access in the iPhone Settings → Health → Data Access & Devices → Aurin. Data already synced is deleted with your account.</li>
</ul>
<h2>Who receives your data</h2>
<ul>
<li><strong>Intervals.icu</strong>, if you connect it: the workouts you plan in Aurin, the workouts you finish in Aurin, workouts from Apple Health that no other service has brought there (type, time, distance, heart rate and calories), nutrition notes and calorie targets in your calendar, your weight, and several times a day a copy of your daily wellness from Google Health and Apple Health (sleep, average sleeping heart rate, steps, resting heart rate, HRV, oxygen saturation, respiration, VO2 max and body fat). Intervals.icu handles this data under its own privacy policy.</li>
<li><strong>Wahoo</strong>, if you connect it: the rides and runs you plan in Aurin, with their steps and targets, so they appear on your ELEMNT and KICKR. Wahoo handles this data under its own privacy policy.</li>
<li><strong>Google Health</strong>: the food and drinks you log and, if you allow it, your weight.</li>
<li><strong>OpenAI</strong> (USA), when you use an AI feature (such as the assistant, recognizing food from a photo, label or description, plan reviews, workout reflections or exercise descriptions): the data that request needs, such as your message, the photo and related training, sleep, health and nutrition data. OpenAI processes it on our behalf, does not use data sent through its API to train its models and keeps it for up to 30 days to detect abuse.</li>
<li><strong>Cloudflare</strong> runs Aurin, stores its database in Europe and keeps the technical logs.${email ? ' Its Email Service sends the sign-in codes and the notices about new passkeys.' : ''}</li>
<li><strong>Apple</strong>, when we add you to the testers from the waitlist: your email address, so that TestFlight emails you how to install Aurin. Apple handles it under its own privacy policy.</li>
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
<li><strong>Deleting your account</strong> in Settings → Privacy &amp; data immediately deletes your account and permanently deletes all its data in Aurin (for a large account, the rest within minutes): profile, food, workouts, sleep and health data, connections, passkeys and assistant history. The record of your consents is deleted with it. Aurin also gives up its access to your Google Account and clears its copy on the device you use. Database backups are overwritten within 30 days.</li>
<li>To stop using a passkey, delete it from your iPhone or password manager. Deleting your account removes all your passkeys from Aurin.</li>
<li>Data that Aurin copied to Intervals.icu or Google Health stays there; you can delete it in those services.</li>
<li>You can also remove Aurin’s access at any time in your Google Account under <a href="${GOOGLE_CONNECTIONS}">Third-party apps and services</a>. Aurin then can no longer read or write your Google data.</li>
${apple ? '<li>You can stop using Sign in with Apple for Aurin in your Apple ID settings, or unlink Apple in Settings → Account.</li>' : ''}
<li>Technical logs are kept for a few days, and OpenAI keeps AI requests for up to 30 days.</li>
<li>An address on the waitlist stays there until testing ends, or until you ask us to remove it at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
</ul>
<p>The <a href="/support">Support</a> page explains step by step how to manage and delete your data.</p>
<h2>Legal bases and your rights</h2>
<p>We process your data to provide the service you asked for (Article 6(1)(b) GDPR). Health data, from Google Health, Apple Health, Intervals.icu or entered by you, is processed only with your explicit consent (Article 9(2)(a) GDPR). You give it in the app before you first use it, and we record when and to which version of this text; syncing of your connected services in the background also runs only after it. The consent covers sending the data an AI feature needs to OpenAI, because the AI features are part of the service. You withdraw your consent by deleting your account in Settings → Privacy &amp; data, where you can first download all your data; disconnecting a service stops new data from it. Withdrawing does not affect processing before it. Technical logs rely on our legitimate interest in a secure service (Article 6(1)(f) GDPR).</p>
<p>You have the right to access, correct and delete your data, to restrict or object to its processing and to receive it in a portable format. Most of this you can do directly in the app: in Settings → Privacy &amp; data you can download all your data as a JSON Lines (NDJSON) file or delete your account. You can also lodge a complaint with the Czech Office for Personal Data Protection (<a href="https://uoou.gov.cz">uoou.gov.cz</a>).</p>
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
<li>aktivita a kondice: kroky, vzdálenost, patra, aktivní minuty, minuty v aktivních zónách, aktivní energie, čas v tepových zónách, období nečinnosti a tréninky, u tréninku s GPS i jeho trasa, kterou uchováváme, abychom ukázali mapu;</li>
<li>zdravotní měření: tep, klidový tep, variabilita srdečního tepu (HRV), okysličení krve, dechová frekvence, VO₂max, váha, výška a tělesný tuk;</li>
<li>spánek: spánky a spánkové fáze;</li>
<li>výživa: záznamy jídla a pití.</li>
</ul>
<p>Dvě oprávnění jsou nepovinná a žádáme o ně zvlášť: čtení data narození z tvého účtu Google, aby se doplnil věk, a zápis váhy do Google Health.</p>
<p><strong>Intervals.icu</strong>, jen když ho připojíš: tvoje aktivity a jejich podrobnosti, plánované tréninky a události, wellness údaje a nastavení sportů.</p>
<p><strong>Ultrahuman</strong>, jen když připojíš prsten Ultrahuman: tvůj spánek a jeho fáze, variabilitu srdečního tepu, klidový tep, odchylku teploty kůže a VO2max, z nichž počítáme připravenost. Aurin tato data jen čte, nikomu dalšímu je nepředává a po odpojení prstenu je smaže.</p>
<p><strong>WHOOP</strong>, jen když připojíš účet WHOOP: tvůj spánek a jeho fáze, klidový tep, variabilitu srdečního tepu, dechovou frekvenci a okysličení krve, z nichž počítáme připravenost. Aurin tato data jen čte, nikomu dalšímu je nepředává a po odpojení WHOOPu je smaže.</p>
<p><strong>Wahoo</strong>, jen když připojíš účet Wahoo: tvoje dokončené jízdy a běhy (začátek, délku, vzdálenost, převýšení, výkon, tréninkovou zátěž, tep, kadenci a kalorie), aby se započítaly do tréninkové zátěže. Aurin je po odpojení Wahoo smaže.</p>
<p><strong>Co zadáš v Aurinu:</strong> profil (třeba věk, výška, váha, sporty, cíle a čas na trénink), jídlo a pití, tréninky a jejich hodnocení, poznámky, odpovědi v deníku (třeba alkohol, kofein, sauna nebo jak ti bylo) a konverzace s asistentem. Počítáme, kolik zpráv koučovi za týden pošleš, aby služba zůstala férová pro všechny.</p>
<p><strong>Co nám pošleš z Nastavení → Pomoc:</strong> hlášení problému s tím, co napíšeš, snímkem obrazovky, když ho přidáš, a pokud ji necháš zapnutou, diagnostikou aplikace (verze aplikace a iOS, propojení a jejich poslední chyby, nepovedené požadavky a pády, nikdy tvoje zdravotní data), nebo návrh funkce s verzí aplikace. Uchováváme je, abychom ti odpověděli a problém opravili, a smažou se s tvým účtem.</p>
<p><strong>Waitlist na našem webu:</strong> když se do něj zapíšeš, uložíme e-mail, který zadáš, a datum zápisu. Použijeme ho jen k testování Aurinu přes TestFlight od Applu; žádné newslettery na něj neposíláme.</p>
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
<li>Deník, jen když ho povolíš (Nastavení → Zdroje dat → Apple Health → Deník): minuty všímavosti, čas na denním světle, hluk ve spánku, příznaky (bolest hlavy, rýma, bolest těla a potíže se žaludkem), sexuální aktivita a tréninky jógy nebo protahování, u každého jedna hodnota za den, a k tomu dny, kdy iPhone změnil časové pásmo. Slouží jen k vyplnění deníku a AI kouč je vidí jen jako odpovědi u položek, které máš v deníku, stejně jako ty, které odklikneš sám.</li>
<li>Sledování cyklu, jen když ho zapneš (Nastavení → Cyklus): menstruace, jejich síla, potíže, antikoncepce, fáze života (perimenopauza, menopauza) a hormonální terapie, pokud je nastavíš, prášky, které odklikneš, a data, která zadáš, a z Apple Health menstruace, ovulační testy, návaly horka, noční pocení a změny spánku, pokud je povolíš. Slouží k zobrazení cyklu, k hodnocení připravenosti proti tvému normálu v dané fázi a ke zlehčení náročného tréninku. AI kouč je dostane jen po zapnutí „Kouč ví o cyklu“, a to jen dnešní fázi, den cyklu, krvácení, potíže, fázi života a hormonální terapii, nikdy data ani historii. Žádné připojené službě je neposíláme a po vypnutí sledování zůstanou uložené, dokud nesmažeš účet.</li>
<li>Zápis do Apple Health, jen když ho zapneš (Nastavení → Synchronizace → Apple Zdraví): tréninky, které zapíšeš v Aurinu, a u typů, které vybereš, i váha, kterou zadáš, denní jídlo (energie, bílkoviny, sacharidy a tuky) a pití. iOS se tě na každý typ zeptá zvlášť a zápis vypneš na stejném místě nebo v Nastavení iPhonu → Zdraví → Přístup k datům a zařízení → Aurin. Co Aurin zapsal, zůstane v Apple Health i po smazání účtu.</li>
<li>Data z Apple Health jdou jen na náš server a kvůli funkcím, které používáš, ke službám z části Kdo data dostává. Neprodáváme je, nepoužíváme ani nepředáváme k reklamě a nedáváme je obchodníkům s daty.</li>
<li>Přístup změníš nebo zrušíš v Nastavení iPhonu → Zdraví → Přístup k datům a zařízení → Aurin. Už synchronizovaná data se smažou s účtem.</li>
</ul>
<h2>Kdo data dostává</h2>
<ul>
<li><strong>Intervals.icu</strong>, když ho připojíš: tréninky, které naplánuješ v Aurinu, tréninky, které v Aurinu dokončíš, tréninky z Apple Zdraví, které tam nepřinesla jiná služba (typ, čas, vzdálenost, tep a kalorie), poznámky k výživě a cíle kalorií v kalendáři, tvoji váhu a několikrát denně kopii denních wellness údajů z Google Health a Apple Zdraví (spánek, průměrný tep ve spánku, kroky, klidový tep, HRV, okysličení krve, dech, VO₂max a tělesný tuk). Intervals.icu s nimi zachází podle svých zásad ochrany soukromí.</li>
<li><strong>Wahoo</strong>, když ho připojíš: jízdy a běhy, které naplánuješ v Aurinu, s jejich úseky a cíli, aby se objevily v ELEMNT a KICKR. Wahoo s nimi nakládá podle svých zásad ochrany osobních údajů.</li>
<li><strong>Google Health</strong>: jídlo a pití, které zapíšeš, a když to povolíš, i tvoje váha.</li>
<li><strong>OpenAI</strong> (USA), když použiješ AI funkci (třeba asistenta, rozpoznání jídla z fotky, etikety nebo popisu, revizi plánu, zhodnocení tréninku nebo popis cviku): data, která daný požadavek potřebuje, třeba tvoji zprávu, fotku a související údaje o tréninku, spánku, zdraví a výživě. OpenAI je zpracovává naším jménem, data poslaná přes své API nepoužívá k trénování modelů a uchovává je nejvýš 30 dní kvůli odhalování zneužití.</li>
<li><strong>Cloudflare</strong> provozuje Aurin, ukládá jeho databázi v Evropě a uchovává technické záznamy.${email ? ' Jeho služba Email Service posílá kódy pro přihlášení a upozornění na nové přístupové klíče.' : ''}</li>
<li><strong>Apple</strong>, když tě z waitlistu přidáme k testerům: tvůj e-mail, aby ti TestFlight poslal, jak Aurin nainstalovat. Apple s ním nakládá podle svých zásad ochrany soukromí.</li>
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
<li><strong>Smazání účtu</strong> v Nastavení → Soukromí a data okamžitě smaže tvůj účet a natrvalo všechna data v Aurinu (u velkého účtu zbytek do několika minut): profil, jídla, tréninky, spánek a zdravotní data, připojení služeb, přístupové klíče i historii asistenta. Smaže se i záznam o tvých souhlasech. Aurin se zároveň vzdá přístupu k tvému účtu Google a smaže svou kopii v zařízení, ve kterém účet mažeš. Zálohy databáze se přepíšou do 30 dní.</li>
<li>Přístupový klíč přestaneš používat, když ho smažeš z iPhonu nebo ze správce hesel. Smazáním účtu zmizí z Aurinu všechny tvoje přístupové klíče.</li>
<li>Co Aurin zkopíroval do Intervals.icu nebo Google Health, tam zůstane; smazat to můžeš v těchto službách.</li>
<li>Přístup Aurinu můžeš kdykoli odebrat i ve svém účtu Google v části <a href="${GOOGLE_CONNECTIONS}">Aplikace a služby třetích stran</a>. Aurin pak už tvoje data z Googlu nepřečte ani nezapíše.</li>
${apple ? '<li>Přihlašování přes Apple pro Aurin ukončíš v nastavení svého Apple ID, nebo Apple odpojíš v Nastavení → Účet.</li>' : ''}
<li>Technické záznamy se uchovávají několik dní a OpenAI uchovává požadavky AI nejvýš 30 dní.</li>
<li>E-mail ve waitlistu zůstane, dokud testování neskončí nebo dokud nás nepožádáš o jeho smazání na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
</ul>
<p>Na stránce <a href="/support">Podpora</a> najdeš postup krok za krokem, jak data spravovat a smazat.</p>
<h2>Právní základ a tvoje práva</h2>
<p>Data zpracováváme, abychom ti poskytli službu, o kterou stojíš (čl. 6 odst. 1 písm. b) GDPR). Údaje o zdraví, z Google Health, Apple Health, Intervals.icu i ty, které zadáš sám, zpracováváme jen s tvým výslovným souhlasem (čl. 9 odst. 2 písm. a) GDPR). Dáváš ho v aplikaci před prvním použitím a my zaznamenáme kdy a ke které verzi tohoto textu; synchronizace propojených služeb na pozadí běží až po něm. Souhlas zahrnuje i posílání dat, která AI funkce potřebuje, do OpenAI, protože AI funkce jsou součástí služby. Souhlas odvoláš smazáním účtu v Nastavení → Soukromí a data, kde si předtím můžeš stáhnout všechna svoje data; odpojením služby zastavíš nová data z ní. Odvoláním nepřestává být zákonné zpracování před ním. Technické záznamy vedeme na základě oprávněného zájmu na bezpečné službě (čl. 6 odst. 1 písm. f) GDPR).</p>
<p>Máš právo na přístup ke svým datům, jejich opravu a výmaz, na omezení zpracování, vznesení námitky a na přenositelnost dat. Většinu z toho uděláš přímo v aplikaci: v Nastavení → Soukromí a data si všechna svoje data stáhneš jako soubor JSON Lines (NDJSON), nebo smažeš účet. Můžeš si také stěžovat u Úřadu pro ochranu osobních údajů (<a href="https://uoou.gov.cz">uoou.gov.cz</a>).</p>
<h2>Děti</h2>
<p>Aurin není určený dětem mladším 16 let a jejich data vědomě nesbíráme.</p>
<h2>Změny</h2>
<p>Zásady upravíme, když se změní Aurin nebo způsob práce s daty, a aktuální verzi s datem zveřejníme na této stránce. Než data, která už máme, použijeme novým způsobem, požádáme tě o souhlas.</p>
<h2>Kontakt</h2>
<p>S dotazy k těmto zásadám nebo ke svým datům a s uplatněním svých práv se obrať na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<p class="muted">Závazné je anglické znění: <a href="/privacy?lang=en">Privacy Policy</a>.</p>`
  });
}

// Terms of Use. The English text is the reference version; the Czech one says the same.
const TERMS_UPDATED = {cs: '18. října 2026', en: '18 October 2026'};
const APPLE_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export function termsPage(request) {
  return doc(request, '/terms', {cs: 'Podmínky použití', en: 'Terms of Use'}, {
    en: `<p class="muted">Last updated: ${TERMS_UPDATED.en}</p>
<p>These terms are the agreement between you and the operator of Aurin when you use the Aurin iPhone app and aurin.health. Aurin is run by Petr Bouma, a private individual in the Czech Republic (“we” below), reachable at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. By creating an account or using Aurin you agree to them. How we handle your personal data is described in the <a href="/privacy">Privacy Policy</a>.</p>
<h2>What Aurin does</h2>
<ul>
<li>Aurin reads the data you connect (Apple Health, Google Health, Intervals.icu, Ultrahuman Ring, WHOOP, Wahoo), evaluates your recovery and training load, and suggests workouts, training plans and nutrition targets.</li>
<li>Readiness, strain, calories, zones and similar numbers are estimates calculated from your devices’ measurements. They depend on the quality of that data and can be wrong.</li>
</ul>
<h2>Aurin is not medical care</h2>
<ul>
<li>Aurin is not a medical device. It does not diagnose, treat or prevent any disease and does not replace a doctor, physiotherapist or nutrition specialist.</li>
<li>Talk to a doctor before you start a new training programme or change your diet, especially if you have a health condition, are pregnant or take medication.</li>
<li>Stop exercising and get help if you feel pain, dizziness, chest pressure or unusual shortness of breath. In an emergency call 112 (in the Czech Republic also 155).</li>
<li>Cycle tracking is not contraception. Do not use it to prevent or plan a pregnancy.</li>
<li>You decide whether a suggested workout or meal suits you, and you train at your own risk.</li>
</ul>
<h2>Your account</h2>
<ul>
<li>You must be at least 16 years old.</li>
<li>An account is for one person. Keep your sign-in (Apple, Google, e-mail or passkey) to yourself and tell us if you think someone else has access.</li>
<li>Fill in your profile truthfully. Calorie targets, zones and other estimates are based on it.</li>
</ul>
<h2>Your data</h2>
<ul>
<li>Your data remains yours. You allow us to store and process it only to run Aurin for you, as the Privacy Policy describes. We do not sell it or use it for advertising.</li>
<li>You can download a copy or delete everything at any time in <strong>Settings → Privacy &amp; data</strong>.</li>
</ul>
<h2>Connected services</h2>
<ul>
<li>Apple Health, Google Health, Intervals.icu, Ultrahuman, WHOOP and Wahoo are run by other companies under their own terms. We are not responsible for their availability, for the accuracy of the data they provide or for changes on their side, and a connection can stop working if a service changes or withdraws access.</li>
<li>Names and logos of these services belong to their owners. Aurin shows them only so you can see which service you are connecting. Aurin is not made, endorsed or sponsored by those companies.</li>
</ul>
<h2>AI features</h2>
<ul>
<li>The coach, reading food photos and looking up foods use artificial intelligence and work only with your consent, which you can withdraw in <strong>Settings → Privacy &amp; data → AI features</strong>. The rest of Aurin works without them.</li>
<li>AI answers are generated automatically and can be incomplete or wrong, including nutrition values and ingredients. Check them before you rely on them, especially if you have an allergy or follow a medical diet.</li>
</ul>
<h2>Price</h2>
<p>Aurin is currently free. If we introduce paid features, we will tell you in advance, show the price and conditions before you buy, and sell them only through the App Store, where Apple handles payment, cancellation and refunds. We never charge you without your purchase.</p>
<h2>Fair use</h2>
<p>Do not try to get around Aurin’s security, access someone else’s account or data, overload the service, download it automatically, copy or resell it, or use it for anything unlawful. Reverse engineering is allowed only where the law permits it.</p>
<h2>Availability and changes</h2>
<ul>
<li>We develop Aurin continuously, so features can change, move or be removed. We do our best to keep it running, but we cannot promise it will always be available or free of errors.</li>
<li>If we ever shut Aurin down, we will tell you at least 30 days ahead in the app or by e-mail, so you can download your data.</li>
</ul>
<h2>Liability</h2>
<ul>
<li>Aurin is provided as it is. As far as the law allows, we are not liable for indirect damage, for data in connected services or for decisions you make based on Aurin’s estimates and suggestions.</li>
<li>Nothing in these terms limits liability that the law does not allow to be limited, in particular for harm to life or health or for damage caused intentionally or through gross negligence, and nothing limits your rights as a consumer.</li>
</ul>
<h2>Ending your use</h2>
<ul>
<li>You can stop at any time by deleting your account in <strong>Settings → Privacy &amp; data → Delete account</strong>.</li>
<li>We may suspend or close an account that seriously or repeatedly breaks these terms. Unless the law prevents it, we tell you by e-mail why.</li>
<li>An account nobody has signed in to for two years is deleted, as the Privacy Policy describes.</li>
</ul>
<h2>Aurin’s name and content</h2>
<p>The app, this website, the name Aurin, its logo, texts and graphics belong to the operator. You may use the app for your own personal, non-commercial purposes.</p>
<h2>App Store</h2>
<p>If you got Aurin from the App Store, Apple’s <a href="${APPLE_EULA}">Licensed Application End User License Agreement</a> applies as well. These terms are between you and us, not Apple, and Apple is not responsible for Aurin or its support.</p>
<h2>Changes to these terms</h2>
<p>We publish every change on this page with its date. Before a significant change takes effect, we tell you at least 30 days ahead in the app or by e-mail. If you do not agree, you can delete your account before then.</p>
<h2>Law and disputes</h2>
<p>These terms are governed by Czech law. If you are a consumer living in another country, you keep the protection that the mandatory law of that country gives you. If something goes wrong, write to us first and we will try to put it right.</p>
<h2>Contact</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>`,
    cs: `<p class="muted">Poslední změna: ${TERMS_UPDATED.cs}</p>
<p>Tyto podmínky jsou dohodou mezi tebou a provozovatelem Aurinu, když používáš aplikaci Aurin pro iPhone a web aurin.health. Aurin provozuje Petr Bouma, soukromá osoba v České republice (dál „my“), na adrese <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Založením účtu nebo používáním Aurinu s nimi souhlasíš. Jak zacházíme s tvými osobními údaji, popisují <a href="/privacy">Zásady ochrany soukromí</a>.</p>
<h2>Co Aurin dělá</h2>
<ul>
<li>Aurin čte data, která propojíš (Apple Zdraví, Google Health, Intervals.icu, prsten Ultrahuman, WHOOP, Wahoo), vyhodnocuje tvou regeneraci a tréninkovou zátěž a navrhuje tréninky, tréninkové plány a cíle výživy.</li>
<li>Připravenost, námaha, kalorie, zóny a podobná čísla jsou odhady spočítané z měření tvých zařízení. Závisí na kvalitě těchto dat a můžou být nepřesné.</li>
</ul>
<h2>Aurin není zdravotní péče</h2>
<ul>
<li>Aurin není zdravotnický prostředek. Nediagnostikuje, neléčí ani nepředchází nemocem a nenahrazuje lékaře, fyzioterapeuta ani odborníka na výživu.</li>
<li>Než začneš nový tréninkový program nebo změníš jídelníček, poraď se s lékařem, hlavně když máš zdravotní potíže, jsi těhotná nebo užíváš léky.</li>
<li>Když při cvičení cítíš bolest, závrať, tlak na hrudi nebo nezvyklou dušnost, přestaň a vyhledej pomoc. V nouzi volej 112 nebo 155.</li>
<li>Sledování cyklu není antikoncepce. Nepoužívej ho k zabránění ani plánování těhotenství.</li>
<li>Jestli ti navržený trénink nebo jídlo sedí, rozhoduješ ty a trénuješ na vlastní odpovědnost.</li>
</ul>
<h2>Tvůj účet</h2>
<ul>
<li>Musí ti být aspoň 16 let.</li>
<li>Účet je pro jednoho člověka. Přihlášení (Apple, Google, e-mail nebo přístupový klíč) si nech pro sebe, a když máš podezření, že k účtu má přístup někdo jiný, dej nám vědět.</li>
<li>Profil vyplň pravdivě. Vychází z něj cíl kalorií, zóny i další odhady.</li>
</ul>
<h2>Tvoje data</h2>
<ul>
<li>Data zůstávají tvoje. Dovoluješ nám je ukládat a zpracovávat jen proto, abychom ti mohli Aurin provozovat, tak jak to popisují Zásady ochrany soukromí. Neprodáváme je ani je nepoužíváme k reklamě.</li>
<li>Kopii si stáhneš nebo všechno smažeš kdykoli v <strong>Nastavení → Soukromí a data</strong>.</li>
</ul>
<h2>Propojené služby</h2>
<ul>
<li>Apple Zdraví, Google Health, Intervals.icu, Ultrahuman, WHOOP a Wahoo provozují jiné firmy podle svých podmínek. Neodpovídáme za jejich dostupnost, za správnost dat, která poskytují, ani za změny na jejich straně a propojení může přestat fungovat, když služba něco změní nebo přístup odebere.</li>
<li>Názvy a loga těchto služeb patří jejich vlastníkům. Aurin je ukazuje jen proto, aby bylo vidět, kterou službu propojuješ. Aurin tyto firmy nevytvořily, nedoporučují ani nesponzorují.</li>
</ul>
<h2>AI funkce</h2>
<ul>
<li>Kouč, čtení fotek jídla a dohledání potravin používají umělou inteligenci a fungují jen s tvým souhlasem, který odvoláš v <strong>Nastavení → Soukromí a data → AI funkce</strong>. Zbytek Aurinu funguje i bez nich.</li>
<li>Odpovědi AI vznikají automaticky a můžou být neúplné nebo chybné, včetně nutričních hodnot a složení. Než se na ně spolehneš, zkontroluj je, hlavně když máš alergii nebo držíš léčebnou dietu.</li>
</ul>
<h2>Cena</h2>
<p>Aurin je zatím zdarma. Pokud zavedeme placené funkce, dáme ti vědět předem, cenu a podmínky uvidíš před nákupem a prodávat je budeme jen přes App Store, kde platbu, zrušení i vrácení peněz řeší Apple. Bez tvého nákupu ti nikdy nic neúčtujeme.</p>
<h2>Férové používání</h2>
<p>Nesnaž se obejít zabezpečení Aurinu, dostat se k cizímu účtu nebo datům, přetěžovat službu, automaticky ji stahovat, kopírovat ji nebo přeprodávat, ani ji používat k ničemu protiprávnímu. Zpětná analýza je dovolená jen tam, kde to povoluje zákon.</p>
<h2>Dostupnost a změny</h2>
<ul>
<li>Aurin průběžně vyvíjíme, takže se funkce můžou měnit, přesouvat nebo zmizet. Snažíme se, aby fungoval, ale nemůžeme slíbit, že bude vždy dostupný a bez chyb.</li>
<li>Kdybychom Aurin někdy ukončili, dáme ti to vědět aspoň 30 dní předem v aplikaci nebo e-mailem, ať máš čas si stáhnout data.</li>
</ul>
<h2>Odpovědnost</h2>
<ul>
<li>Aurin poskytujeme tak, jak je. V rozsahu, který zákon dovoluje, neodpovídáme za nepřímé škody, za data v propojených službách ani za rozhodnutí, která uděláš podle odhadů a návrhů Aurinu.</li>
<li>Nic v těchto podmínkách neomezuje odpovědnost, kterou zákon omezit nedovoluje, hlavně za újmu na životě nebo zdraví a za škodu způsobenou úmyslně nebo z hrubé nedbalosti, a nic neomezuje tvoje práva spotřebitele.</li>
</ul>
<h2>Konec používání</h2>
<ul>
<li>Přestat můžeš kdykoli smazáním účtu v <strong>Nastavení → Soukromí a data → Smazat účet</strong>.</li>
<li>Účet, který vážně nebo opakovaně porušuje tyto podmínky, můžeme pozastavit nebo zrušit. Pokud to zákon nezakazuje, napíšeme ti e-mailem proč.</li>
<li>Účet, do kterého se dva roky nikdo nepřihlásil, smažeme, jak popisují Zásady ochrany soukromí.</li>
</ul>
<h2>Název a obsah Aurinu</h2>
<p>Aplikace, tento web, název Aurin, jeho logo, texty a grafika patří provozovateli. Aplikaci smíš používat pro vlastní osobní a nekomerční potřebu.</p>
<h2>App Store</h2>
<p>Pokud máš Aurin z App Storu, platí navíc <a href="${APPLE_EULA}">licenční smlouva Apple pro koncové uživatele</a> (Licensed Application End User License Agreement). Tyto podmínky jsou mezi tebou a námi, ne Applem, a Apple za Aurin ani jeho podporu neodpovídá.</p>
<h2>Změny podmínek</h2>
<p>Každou změnu zveřejníme na této stránce s datem. Než začne platit podstatná změna, dáme ti to vědět aspoň 30 dní předem v aplikaci nebo e-mailem. Když nesouhlasíš, můžeš do té doby účet smazat.</p>
<h2>Právo a spory</h2>
<p>Tyto podmínky se řídí českým právem. Pokud jsi spotřebitel s bydlištěm v jiné zemi, zůstává ti ochrana, kterou ti dávají kogentní předpisy té země. Když se něco pokazí, napiš nám nejdřív a pokusíme se to napravit.</p>
<h2>Kontakt</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
<p class="muted">Závazné je anglické znění: <a href="/terms?lang=en">Terms of Use</a>.</p>`
  });
}

export function supportPage(request, {apple = false, email = false, open = false} = {}) {
  return doc(request, '/support', {en: 'Support'}, {
    en: `<p>${open ? '' : 'Aurin is currently available only by personal invitation. '}If something does not work, report it in the app or write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Never send passwords, API keys or other secrets.</p>
<h2 id="problem">Reporting a problem</h2>
<ol>
<li>In the app, open <strong>Settings → Help → Report a problem</strong>.</li>
<li>Under <strong>What happened</strong>, describe the problem and roughly when it happened. Add a screenshot if it helps.</li>
<li>Leave <strong>Attach diagnostics</strong> on: the report then carries technical details about the app, syncing, recent errors and crashes, so the cause is easier to find. You can read them first under <strong>View diagnostics</strong>, or turn them off.</li>
<li>Choose <strong>Send</strong>.</li>
</ol>
<p>If you cannot open the app, e-mail <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> what went wrong, roughly when, the error message the app showed and your iPhone model and iOS version. For anything else, <strong>Settings → Help → Contact us</strong> opens an e-mail with your app version already filled in.</p>
<h2 id="idea">Suggesting a feature</h2>
<p>Missing something? Open <strong>Settings → Help → Suggest a feature</strong>, write what would help you and choose <strong>Send</strong>. Only your text and the app version are sent.</p>
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
<li>In the app, open <strong>Settings → Data sources</strong>. Tap <strong>+</strong> to connect Apple Health, Google Health, Intervals.icu, the Ultrahuman Ring, WHOOP or Wahoo. Each connected service has its own page, with <strong>Disconnect</strong> at the bottom.</li>
<li>For Apple Health, your iPhone asks which data Aurin may read. You change that later in the iPhone Settings → Health → Data Access &amp; Devices → Aurin.</li>
<li>Before sending you to Google, Aurin shows what it reads from Google Health, what it writes there and who receives the data, and asks for your consent.</li>
<li>Disconnecting stops Aurin from reading and writing data in that service. For Google, Aurin also gives up its access at Google. Disconnecting the Ultrahuman Ring, WHOOP or Wahoo also deletes the data Aurin got from it.</li>
<li>You can also remove Aurin’s access in your Google Account: open <a href="${GOOGLE_CONNECTIONS}">Third-party apps and services</a>, choose Aurin and remove its access.</li>
<li>When two of your devices measure the same thing, <strong>Where to take data from</strong> in Data sources decides which one Aurin uses for your nights and your days. <strong>Automatic</strong> picks it for you.</li>
</ul>
<h2>Managing your data</h2>
<ul>
<li>You can edit or delete food, drinks and weight entries where you see them in the app, and change your profile in Settings.</li>
<li>Data that Aurin copied to Apple Health, Intervals.icu or Google Health can be edited or deleted in those services.</li>
<li><strong>Settings → Privacy &amp; data → AI features</strong> turns sending data to AI on or off. Without it, the coach, food photos and food lookup stop and the rest of the app keeps working.</li>
<li>To get a copy of everything Aurin stores about you, open <strong>Settings → Privacy &amp; data</strong> and choose <strong>Download my data</strong> (a JSON Lines file, one record per line).</li>
</ul>
<h2>Deleting your account and data</h2>
<ol>
<li>Open <strong>Settings → Privacy &amp; data</strong>.</li>
<li>If you want to keep a copy, first choose <strong>Download my data</strong>.</li>
<li>Choose <strong>Delete account</strong>, type DELETE to confirm and choose <strong>Delete</strong>.</li>
</ol>
<p>Aurin immediately and permanently deletes your account and all its data: profile, food, workouts, sleep and health data, connections, passkeys and assistant history. It also gives up its access to your Google Account and clears its copy on your device. Database backups are overwritten within 30 days. Data already in Apple Health, Intervals.icu or Google Health stays there. More in the <a href="/privacy">Privacy Policy</a>.</p>`
  });
}

// Search engines: the public pages are listed in the sitemap; sign-in, the app's API and shared
// workouts are left out of the index.
const PUBLIC_PAGES = ['/', '/support', '/privacy', '/terms', '/privacy?lang=cs', '/terms?lang=cs'];

export function robotsTxt(request) {
  const {origin} = pageLang(request);
  return new Response(`User-agent: *\nDisallow: /app/\nDisallow: /auth/\nDisallow: /oauth/\nDisallow: /t/\n\nSitemap: ${origin}/sitemap.xml\n`,
    {headers: {'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600'}});
}

export function sitemapXml(request) {
  const {origin} = pageLang(request);
  const urls = PUBLIC_PAGES.map(path => `<url><loc>${origin}${path.replace('&', '&amp;')}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    {headers: {'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600'}});
}
