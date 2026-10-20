// Public pages: the Aurin overview on / and the policy pages. They use the iPhone app's light
// palette (ios-native/Shared/Palette.swift): warm paper, white cards, tight sans headings.
// The phones on the overview show the app's own screens (Today in the hero, the gym as you scroll),
// taken in CI from the sample data in English, and move between them as the app does. The cards beside
// them are drawn here from the same sample day in the app's colours and number font, so they can move.
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

/* The overview. Short headlines in tight sans, each area of the app on its own tinted panel. The phones
   show the app's own screens and move between them as the app does; the cards beside them are drawn
   live from the sample day in the app's colours and its number font, so they can move. */
.eb{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--c,var(--green))}
.h2{font-size:clamp(34px,5.4vw,64px);line-height:1.02;letter-spacing:-.04em}
.lead{font-size:clamp(16px,1.6vw,19px);line-height:1.45;color:var(--sec);max-width:520px}
.n{font-family:"Instrument Serif","New York",Georgia,serif;font-weight:400;letter-spacing:-.01em;font-variant-numeric:lining-nums}
.phone{position:relative;width:236px;aspect-ratio:603/1311;padding:7px;border-radius:42px;background:var(--button);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 34px 70px -24px rgba(40,30,10,.45)}
.scr{position:relative;width:100%;height:100%;overflow:hidden;border-radius:35px;background:var(--bg)}
.scr img{position:absolute;inset:0;display:block;width:100%;height:100%;transform:translateX(100%)}
.scr img.on{z-index:2;transform:none}
.scr img.back{z-index:1;transform:translateX(-28%);filter:brightness(.92)}
.tap{position:absolute;z-index:5;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;background:rgba(27,26,23,.18);border:2px solid rgba(255,255,255,.9);opacity:0;pointer-events:none}
.tap.go{animation:tap .7s ease-out}
@keyframes tap{0%{opacity:0;transform:scale(1.5)}30%{opacity:1;transform:scale(1)}60%{transform:scale(.85)}100%{opacity:0;transform:scale(1.1)}}

/* A live card: the app's card, with its small grey title and big serif numbers. */
.lc{background:var(--panel);border-radius:22px;padding:15px 16px;text-align:left;box-shadow:0 22px 44px -16px rgba(40,30,10,.3),0 0 0 1px var(--line)}
.lc .t{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;color:var(--muted)}
.lc .t.caps{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.flat{box-shadow:none}
.pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.pill.g{background:var(--green-soft);color:var(--green)}.pill.a{background:var(--amber-soft);color:var(--amber)}.pill.i{background:var(--lilac);color:var(--indigo)}

.hero{padding:44px 0 0;text-align:center;overflow:hidden}
.kick{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;background:#fff;font-size:13px;font-weight:500;box-shadow:0 1px 0 rgba(0,0,0,.04)}
.kick i{width:7px;height:7px;border-radius:50%;background:var(--logo-recovery)}
.hero h1{font-size:clamp(44px,8.4vw,104px);line-height:.98;letter-spacing:-.045em;margin:18px auto 16px;max-width:900px}
.hero .lead{margin:0 auto 26px;max-width:560px}
.hero .small{margin-top:10px;font-size:13px;color:var(--muted)}
.stage{position:relative;width:390px;max-width:100%;height:560px;margin:36px auto 0}
.stage .phone{position:absolute;left:50%;top:0;transform:translateX(-50%)}
.glow{position:absolute;left:-30%;right:-30%;top:8%;height:76%;border-radius:50%;background:radial-gradient(closest-side,var(--g,var(--glow-today)),transparent)}
.fc{position:absolute;z-index:6;width:206px}
.js .fc{opacity:0;transform:translateY(16px) scale(.96);pointer-events:none}
.js .fc.on{opacity:1;transform:none}
html:not(.js) .fc:not([data-k=today]){display:none}
.fc .row{padding:7px 0}
.fc .row .a b{font-size:13px}.fc .row .a .n{font-size:20px}
.st{display:grid;gap:7px;margin-top:8px;font-size:13px}
.st div{display:grid;grid-template-columns:46px 1fr 36px;gap:8px;align-items:center}
.st i{height:6px;overflow:hidden;border-radius:9px;background:var(--track)}
.st b{display:block;height:100%;border-radius:9px;background:var(--c)}
.st .n{font-size:17px;text-align:right}

/* Readiness: what each part of the score is against your own normal, and the points it brings. */
.row{padding:12px 0;border-top:1px solid var(--line)}
.row:first-of-type{border:0}
.row .a{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.row .a b{font-size:15px;font-weight:500}
.row .a .n{font-size:24px;line-height:1}
.row .bb{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:var(--muted);margin-top:2px}
.rng{position:relative;height:6px;margin:9px 0 6px;border-radius:9px;background:var(--track)}
.rng .band{position:absolute;top:0;bottom:0;border-radius:9px;background:color-mix(in srgb,var(--text) 22%,var(--panel));transform-origin:left}
.rng .dot{position:absolute;top:50%;width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;border:2px solid var(--panel);background:var(--c)}
.pts{text-align:right;font-size:12px;font-weight:600;color:var(--c)}
.big{font-size:clamp(96px,11vw,128px);line-height:.8}
.bars{display:flex;gap:4px;align-items:flex-end;height:72px;margin-top:12px}
.bars i{flex:1;border-radius:3px 3px 1px 1px;background:var(--amber-bar)}
.bars i.hi{background:color-mix(in srgb,var(--green) 70%,var(--panel))}

/* Sleep: the app's dial with the bedtime (moon) and the wake time (sun) as handles. */
.dial{position:relative;width:min(100%,300px);margin:6px auto 0;touch-action:none;user-select:none;-webkit-user-select:none}
.dial svg{display:block;width:100%;overflow:visible}
.dial text{font-size:11px;fill:var(--muted)}
.dial .hd{cursor:grab;outline:none}
.dial .hd>circle{fill:var(--panel);filter:drop-shadow(0 1px 3px rgba(0,0,0,.25))}
.dial .hd:focus-visible>circle{stroke:var(--indigo);stroke-width:2}
.dial .mid{position:absolute;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none}
.dial .mid .n{font-size:46px;line-height:1}
.dial .mid small{font-size:13px;color:var(--muted)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.two .lc{padding:11px 13px}
.two .n{font-size:30px;line-height:1.1}
.lv{display:flex;gap:8px;margin-top:12px}
.lv button{flex:1;padding:8px 4px;border:1.5px solid transparent;border-radius:14px;background:var(--panel);font:inherit;font-size:14px;font-weight:500;color:var(--text);cursor:pointer;transition:background .3s,border-color .3s,color .3s}
.lv button small{display:block;font-size:12px;color:var(--muted)}
.lv button[aria-pressed=true]{background:var(--lilac);border-color:var(--indigo);color:var(--indigo)}
.why{margin-top:12px}
.why div{display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--line);font-size:15px}
.why div:first-of-type{border:0}
.why span+span{font-weight:500;color:var(--indigo)}
.why .goal{color:var(--text)}.why .less{color:var(--green)}
.alarm{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
.alarm small{display:block;font-size:13px;color:var(--muted)}
.tog{position:relative;flex:none;width:46px;height:28px;border:0;border-radius:999px;background:color-mix(in srgb,var(--text) 16%,var(--panel));cursor:pointer;transition:background .3s}
.tog::after{content:"";position:absolute;left:2px;top:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .3s}
.tog[aria-checked=true]{background:var(--green)}.tog[aria-checked=true]::after{left:20px}

/* Connections: every service at once. What Aurin reads runs down into it, what it sends back runs on
   down to the services that take it; a list underneath says the same in words. */
.conn{--t:#fff}
.flow{position:relative;max-width:420px;margin:26px auto 0}
.flow .lines{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.flow .lines path{fill:none;stroke:var(--track);stroke-width:1.5}
.cap{margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);text-align:center}
.lr{position:relative;z-index:2;display:flex;justify-content:space-between}
.lr.to{padding:0 12%}
.lt{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:#fff;box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.lt img{width:64%;height:64%;object-fit:contain}
.lt.dark{background:var(--button)}.lt.dark img{width:56%;height:auto}.lt.word img{width:84%}
.hub{position:relative;z-index:4;display:grid;place-items:center;width:80px;height:80px;margin:92px auto;border-radius:24px;background:var(--green-soft);box-shadow:0 0 0 8px color-mix(in srgb,var(--green) 7%,transparent)}
.pk{position:absolute;left:0;top:0;z-index:3;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;color:#fff;offset-rotate:0deg;offset-anchor:center;opacity:0;pointer-events:none}
.pk.in{background:var(--green)}.pk.out{background:var(--amber-bar)}
.svcs{display:grid;gap:8px;margin-top:26px;padding-bottom:30px}
.svc{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:18px;background:var(--site-bg)}
.svc .lt{flex:none;width:36px;height:36px;border-radius:10px}
.svc b{font-size:15px}
.svc p{font-size:14px;line-height:1.4;color:var(--sec)}
.svc em{font-style:normal;font-weight:600}
.svc .i{color:var(--green)}.svc .o{color:var(--amber)}.svc .none{color:var(--muted)}

/* Strain: the gauge fills from today's activities toward the target, the week shows done and planned. */
.gauge{position:relative;width:200px;margin:10px auto 0}
.gauge svg{display:block;width:100%}
.gauge path{fill:none;stroke-linecap:round}
.gauge .gt{stroke:var(--track)}.gauge .gz{stroke:color-mix(in srgb,var(--green) 40%,var(--panel))}.gauge .gv{stroke:var(--amber-bar)}
.gauge .mid{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
.gauge .mid .n{font-size:52px;line-height:1}
.gauge .mid small{font-size:12px;color:var(--muted)}
.act{display:flex;gap:10px;align-items:center;margin-top:12px}
.act .ic{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:11px;background:var(--amber-bar);color:#fff}
.act .ic.p{background:var(--sand);color:var(--amber)}
.act .ic .icon{width:18px;height:18px}
.act div{flex:1}.act b{font-size:15px;font-weight:600}.act small{display:block;font-size:13px;color:var(--muted)}
.act .n{font-size:24px}
.wk{display:flex;gap:6px;align-items:flex-end;height:120px;margin-top:8px}
.wk div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;text-align:center;font-size:12px;color:var(--muted)}
.wk .n{font-size:15px;color:var(--text)}
.wk i{display:block;margin:3px 0 4px;border-radius:5px;background:color-mix(in srgb,var(--amber-bar) 55%,var(--panel))}
.wk .now i{background:var(--amber-bar)}.wk .now{font-weight:700;color:var(--text)}
.wk .plan i{background:none;border:1.5px dashed var(--amber-bar)}

/* The gym: the phone stays on screen while the page scrolls and walks through a workout. */
.walk{position:relative;height:540vh}
.walk .pin{position:sticky;top:64px;height:calc(100vh - 64px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.walk .phone{width:min(218px,27vh)}
.steps{position:relative;width:100%;max-width:360px;height:76px;margin:0;padding:0;list-style:none;text-align:center}
.steps li{position:absolute;inset:0;opacity:0;transform:translateY(10px);transition:opacity .4s,transform .4s;font-size:15px;color:var(--sec)}
.steps li b{display:block;font-size:19px;letter-spacing:-.02em;color:var(--text)}
.steps li.on{opacity:1;transform:none}
.dots{display:flex;gap:6px;justify-content:center}
.dots i{width:6px;height:6px;border-radius:9px;background:color-mix(in srgb,var(--text) 18%,transparent);transition:width .3s,background .3s}
.dots i.on{width:18px;background:var(--text)}
.timer{position:absolute;z-index:6;right:-34px;top:52%;width:136px;padding:12px;text-align:center}
.timer svg{display:block;width:92px;margin:4px auto}
.timer circle{fill:none;stroke-width:7}
.timer .bgc{stroke:var(--track)}.timer .fgc{stroke:var(--green);stroke-linecap:round}
.timer .n{position:absolute;left:0;right:0;top:58px;font-size:30px;line-height:1}
.timer small{font-size:12px;color:var(--muted)}
html:not(.js) .walk{height:auto}html:not(.js) .walk .pin{position:static;height:auto;padding:24px 0}
html:not(.js) .steps{height:auto}html:not(.js) .steps li{position:static;opacity:1;transform:none;margin-bottom:12px}
html:not(.js) .dots,html:not(.js) .timer,.js .timer:not(.on){opacity:0;pointer-events:none}
.timer{transition:opacity .4s}

/* Nutrition: what the day adds up to and what the coach says about the next meal. */
.kc{display:flex;align-items:baseline;gap:8px}
.kc .n{font-size:76px;line-height:.9}
.kc span+span{font-size:14px;color:var(--muted)}
.mac{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}
.mac div{font-size:12px;color:var(--muted)}
.mac .n{font-size:26px;color:var(--text)}
.mac i{display:block;height:4px;margin-top:5px;overflow:hidden;border-radius:9px;background:var(--track)}
.mac i b{display:block;height:100%;width:var(--w);background:var(--c)}
.meal{display:flex;gap:10px;align-items:center;margin-top:14px;padding:10px 12px;border-radius:14px;background:#fff}
.meal .ic{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:11px;background:var(--amber-soft);color:var(--amber)}
.meal div{flex:1}.meal b{font-size:15px;font-weight:600}.meal small{display:block;font-size:13px;color:var(--muted)}
.meal .n{font-size:22px}
.say{margin-top:14px}
.say small{font-size:13px;font-weight:600;color:var(--green)}
.say p{margin-top:4px;font:20px/1.3 Newsreader,"New York",Georgia,serif;min-height:3.9em}

/* The coach: a question picked from the suggestions and its answer, with today's workout. */
.chat{display:flex;flex-direction:column;min-height:480px;margin-top:22px;padding:16px 14px 14px;border-radius:28px;background:var(--bg);color:var(--text);text-align:left}
.chat .top{text-align:center;font-size:16px;font-weight:600;margin-bottom:12px}
.ask{display:flex;flex-direction:column;align-items:flex-start;gap:7px;transition:opacity .3s}
.ask h3{font:400 25px/1.15 Newsreader,"New York",Georgia,serif;letter-spacing:0;margin-bottom:6px}
.ask span{padding:7px 12px;border-radius:14px;background:#fff;font-size:14px;transition:background .25s}
.ask span.tp{background:var(--panel2)}
.msgs{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:12px}
.me{align-self:flex-end;max-width:82%;padding:9px 14px;border-radius:18px 18px 4px 18px;background:var(--button);color:var(--on-button);font-size:15px}
.ai{align-self:flex-start;max-width:96%;min-height:1.4em;font:18px/1.38 Newsreader,"New York",Georgia,serif}
.wo{padding:12px 14px;border-radius:16px;background:#fff;font-size:14px}
.wo small{display:block;font-size:12px;color:var(--muted);letter-spacing:.04em}.wo b{display:block;font-size:15px}.wo span{color:var(--muted)}
.typing{display:flex;gap:4px;padding:8px 0}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:blink 1s infinite}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes blink{50%{opacity:.25}}
.inp{display:flex;gap:8px;align-items:center;margin-top:12px}
.inp span{flex:1;padding:10px 15px;border-radius:999px;background:#fff;font-size:14px;color:var(--muted)}
.inp i{width:34px;height:34px;border-radius:50%;background:var(--button)}
html:not(.js) .ask{display:none}
.js .chat:not(.done) .wo,.js .chat:not(.done) .me{opacity:0;transform:translateY(10px)}
.wo,.me{transition:opacity .4s,transform .4s}

/* A panel per area: words, then the live part of the app. */
.sec{padding:12px 0 0}
.panel{position:relative;overflow:clip;border-radius:36px;padding:40px 24px 30px;background:var(--t)}
.panel .h2{margin:10px 0 12px}
.demo{margin-top:24px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.chips span{padding:6px 12px;border-radius:999px;background:color-mix(in srgb,#fff 65%,transparent);font-size:13px;font-weight:500}
.sec.dark .panel{color:var(--on-button)}
.dark .lead{color:color-mix(in srgb,var(--on-button) 72%,var(--button))}

/* Muscles: the app's figure from the front or the back, a bubble on each tired muscle, and the bubble's
   muscle up close underneath, as its detail is in the app. */
.muscles{background:#fff}
.mu{display:grid;gap:16px;margin-top:10px}
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

/* Motion, only with JS and without reduced motion: the words rise in, the phones move between screens
   like the app, the cards fill as they come into view. */
@media (prefers-reduced-motion:no-preference){
  .js .rv{opacity:0;transform:translateY(36px) scale(.97);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0s)}
  .js .rv.in{opacity:1;transform:none}
  .scr img{transition:transform .55s cubic-bezier(.3,.7,.2,1),filter .55s}
  .fc{transition:opacity .35s,transform .6s cubic-bezier(.3,.7,.2,1)}
  .rng .band{transition:transform .7s}.rng .dot{transition:left 1s cubic-bezier(.3,.7,.2,1),opacity .3s}.pts{transition:opacity .4s,transform .4s}
  .bars i,.wk i{transition:height .6s cubic-bezier(.3,.7,.2,1)}
  .mac i b,.st b{transition:width 1s cubic-bezier(.3,.7,.2,1)}
  .act,.meal{transition:opacity .5s,transform .5s}
  .hub{animation:beat 1.8s ease-in-out infinite}
  @keyframes beat{50%{box-shadow:0 0 0 16px color-mix(in srgb,var(--green) 4%,transparent)}}
  .js .hero .kick,.js .hero h1,.js .hero .lead,.js .hero .wl{animation:up .9s cubic-bezier(.2,.7,.2,1) both}
  .js .hero h1{animation-delay:.08s}.js .hero .lead{animation-delay:.18s}.js .hero .wl{animation-delay:.28s}
  @keyframes up{from{opacity:0;transform:translateY(24px)}}
  @supports (interpolate-size:allow-keywords){
    .faq{interpolate-size:allow-keywords}
    .faq details::details-content{height:0;overflow:clip;transition:height .35s cubic-bezier(.16,1,.3,1),content-visibility .35s allow-discrete}
    .faq details[open]::details-content{height:auto}
  }
}
/* Before a card plays it starts empty; the script takes .pre off as it comes into view. */
.js .row.pre .rng .band{transform:scaleX(0)}.js .row.pre .rng .dot{left:50%!important;opacity:0}.js .row.pre .pts{opacity:0;transform:translateY(4px)}
.js .bars.pre i,.js .wk.pre i{height:0!important}
.js .mac.pre i b,.js .st.pre b{width:0!important}
.js .act.pre,.js .meal.pre{opacity:0;transform:translateX(-16px)}

/* A computer: the stages grow, each panel puts its words beside its live part, the grids widen. */
@media (min-width:900px){
  .hero{padding-top:72px}
  .hero .stage{transform:scale(1.2);transform-origin:top center;margin-bottom:120px}
  .panel{display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:56px;padding:64px}
  .panel>.demo{margin:0;max-width:440px;justify-self:center;width:100%}
  .conn{display:grid;grid-template-columns:1fr 1fr}
  .conn .flow{margin:0}
  .conn .svcs{margin:0;padding:0}
  .gym .panel{display:block}
  .gym .walk .pin{flex-direction:row;gap:64px}
  .gym .side{display:flex;flex-direction:column;gap:18px;width:360px}
  .gym .steps{text-align:left;height:110px}.gym .steps li b{font-size:28px}.gym .steps li{font-size:17px}
  .gym .dots{justify-content:flex-start}
  .walk .phone{width:min(260px,30vh)}
  .muscles{display:block;padding:64px}
  .mu{grid-template-columns:1fr 1fr;align-items:center;gap:48px}
  .fig{width:min(100%,380px)}
  .privacy .panel{display:block;padding:56px 64px}
  .final{padding:88px 24px 72px}
}
@media (max-width:899px){
  .site-head .links{display:none}
  .grid{grid-template-columns:1fr 1fr}
  .site-foot .top{grid-template-columns:1fr 1fr 1fr;gap:28px 20px}.site-foot .brand{grid-column:1/-1}
  .gym .side{display:contents}
}
@media (max-width:560px){
  .wrap{padding:0 10px}
  .hero .wrap,.more .h2,.faq{padding-left:8px;padding-right:8px}
  .panel{padding:32px 18px 26px;border-radius:30px}
  .site-foot .wrap{padding:0 22px}
  .stage{height:560px}
  .fc{width:196px}
  .timer{right:-26px}
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

// The page's motion, the live cards and the waitlist. Without JS every card shows the sample day as it
// ends; with reduced motion the cards show it at once and the phones stay on their first screen.
const siteScript = `<script>(function(){var r=document.documentElement;r.classList.add('js');
var still=matchMedia('(prefers-reduced-motion: reduce)').matches;
function $(s,e){return (e||document).querySelector(s);}function $$(s,e){return [].slice.call((e||document).querySelectorAll(s));}
function wait(ms){return new Promise(function(ok){setTimeout(ok,ms);});}
function tween(ms,f){return new Promise(function(ok){if(still){f(1);ok();return;}var t0=performance.now();(function s(t){var p=Math.min(1,(t-t0)/ms);f(1-Math.pow(1-p,3));if(p<1)requestAnimationFrame(s);else ok();})(t0);});}
function seen(el,fn,th){if(!el)return;if(!('IntersectionObserver' in window)){fn();return;}var o=new IntersectionObserver(function(es){if(es[0].isIntersecting){o.disconnect();fn();}},{threshold:th||.35});o.observe(el);}
if(still)$$('.pre').forEach(function(e){e.classList.remove('pre');});
async function reveal(list,gap){for(var i=0;i<list.length;i++){list[i].classList.remove('pre');await wait(gap);}}
// Words rise in as they come into view.
var rv=$$('.rv');
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px'});rv.forEach(function(el){io.observe(el);});}
else rv.forEach(function(el){el.classList.add('in');});
// The strain gauge: 0 to 21 over three quarters of a circle, the target as a band.
var A0=Math.PI*.75,SPAN=Math.PI*1.5;
function arc(r,a,b){var x0=100+r*Math.cos(a),y0=100+r*Math.sin(a),x1=100+r*Math.cos(b),y1=100+r*Math.sin(b);return 'M'+x0.toFixed(1)+' '+y0.toFixed(1)+'A'+r+' '+r+' 0 '+(b-a>Math.PI?1:0)+' 1 '+x1.toFixed(1)+' '+y1.toFixed(1);}
function gauge(g,v){$('.gv',g).setAttribute('d',v>.05?arc(78,A0,A0+SPAN*v/21):'');$('.mid .n',g).textContent=v.toFixed(1);}
function count(el,to,ms){return tween(ms||1100,function(p){el.textContent=Math.round(to*p).toLocaleString('en');});}
// The hero phone taps through Today: readiness, last night's sleep and today's strain, each with its card.
var hs=$('[data-hero]');
if(hs&&!still)(async function(){var stage=hs.closest('.stage'),imgs=$$('img',hs),tap=$('.tap',hs),fcs=$$('.fc',stage),glow=$('.glow',stage);
 function go(k,tint){imgs.forEach(function(i){var on=i.dataset.k===k;i.classList.toggle('on',on);i.classList.toggle('back',!on&&i.dataset.k==='today'&&k!=='today');});
  fcs.forEach(function(f){f.classList.toggle('on',f.dataset.k===k);});if(tint)glow.style.background='radial-gradient(closest-side,var('+tint+'),transparent)';}
 async function press(x,y){tap.style.left=x+'%';tap.style.top=y+'%';tap.classList.remove('go');void tap.offsetWidth;tap.classList.add('go');await wait(380);}
 var ready=$('.fc[data-k=ready]',stage),rows=$$('.row',ready),sleep=$('.fc[data-k=sleep] .st',stage),g=$('.fc[data-k=strain] .gauge',stage);
 await wait(2400);
 for(;;){if(document.hidden){await wait(600);continue;}
  await press(19,44);rows.forEach(function(x){x.classList.add('pre');});go('ready','--glow-today');await wait(350);await reveal(rows,380);await wait(2600);
  go('today');await wait(900);
  await press(17,75);sleep.classList.add('pre');go('sleep','--glow-health');await wait(350);sleep.classList.remove('pre');await wait(3000);
  go('today','--glow-today');await wait(900);
  await press(45,75);gauge(g,0);go('strain','--glow-training');await wait(300);await tween(1300,function(p){gauge(g,8.4*p);});await wait(2400);
  go('today','--glow-today');await wait(2600);}})();
// Connections: what each service gives Aurin runs down into it; what Aurin sends back runs on down.
var flow=$('.flow');
if(flow){var lines=$('.lines',flow),paths=[],live=false;
 function layout(){var fr=flow.getBoundingClientRect(),c=function(e){var b=e.getBoundingClientRect();return [b.left-fr.left+b.width/2,b.top-fr.top+b.height/2,b.height/2];},h=c($('.hub',flow)),out='';paths=[];
  lines.setAttribute('viewBox','0 0 '+fr.width+' '+fr.height);
  $$('.lr.from .lt',flow).forEach(function(e){var p=c(e),d='M'+p[0]+' '+(p[1]+p[2])+'C'+p[0]+' '+((p[1]+h[1])/2+10)+' '+h[0]+' '+(h[1]-h[2]-40)+' '+h[0]+' '+(h[1]-h[2]);out+='<path d="'+d+'"/>';paths.push({d:d,dir:'in',items:e.dataset.items.split('|')});});
  $$('.lr.to .lt',flow).forEach(function(e){var p=c(e),d='M'+h[0]+' '+(h[1]+h[2])+'C'+h[0]+' '+(h[1]+h[2]+40)+' '+p[0]+' '+((p[1]+h[1])/2-10)+' '+p[0]+' '+(p[1]-p[2]);out+='<path d="'+d+'"/>';paths.push({d:d,dir:'out',items:e.dataset.items.split('|')});});
  lines.innerHTML=out;}
 layout();addEventListener('resize',layout);
 function send(p,n){var el=document.createElement('span');el.className='pk '+p.dir;el.textContent=p.items[n%p.items.length];el.style.offsetPath='path("'+p.d+'")';flow.appendChild(el);
  el.animate([{offsetDistance:'0%',opacity:0},{opacity:1,offset:.12},{opacity:1,offset:.75},{offsetDistance:'100%',opacity:0}],{duration:2400,easing:'cubic-bezier(.4,0,.3,1)'}).onfinish=function(){el.remove();};}
 if(!still&&CSS.supports('offset-path','path("M0 0")')&&'IntersectionObserver' in window){var k=0;new IntersectionObserver(function(es){live=es[0].isIntersecting;}).observe(flow);
  setInterval(function(){if(!live||document.hidden)return;var ins=paths.filter(function(p){return p.dir==='in';}),outs=paths.filter(function(p){return p.dir==='out';});
   var a=ins[k%ins.length];send(a,Math.floor(k/ins.length));if(k%2){var o=outs[(k>>1)%outs.length];setTimeout(function(){send(o,k>>3);},700);}k++;},520);}}
// Readiness: each part slides to where it sits against your normal, then the score counts up.
var rc=$('#pripravenost .lc');
seen(rc,async function(){if(still)return;var n=$('[data-n]',rc);n.textContent='0';await reveal($$('.row',rc),500);await count(n,+n.dataset.n);$('.bars',rc).classList.remove('pre');});
// Sleep: the app's dial (SleepPlanner.swift). The sun moves the wake time and the bedtime follows; the
// moon changes how long to sleep. In bed is the sleep over the night's efficiency, in 5-minute steps.
var dial=$('.dial');
if(dial){var svg=$('svg',dial),eff=+dial.dataset.eff,wake=+dial.dataset.wake,sl=+dial.dataset.sleep,C=150,R=132,touched=false,lv=$$('.lv button');
 function wrap(m){return ((m%1440)+1440)%1440;}function inBed(m){return Math.round(m/eff/5)*5;}
 function pt(m){var a=m/1440*2*Math.PI-Math.PI/2;return [C+R*Math.cos(a),C+R*Math.sin(a)];}
 function clock(m){m=wrap(m);var h=Math.floor(m/60),mm=m%60,ap=h<12?'AM':'PM';h=h%12||12;return h+':'+(mm<10?'0':'')+mm+' '+ap;}
 function short(m){return Math.floor(m/60)+' h '+(m%60<10?'0':'')+m%60;}
 function draw(){var bed=wrap(wake-inBed(sl)),len=wrap(wake-bed),a=pt(bed),b=pt(bed+len);
  $('.night',svg).setAttribute('d','M'+a[0].toFixed(1)+' '+a[1].toFixed(1)+'A'+R+' '+R+' 0 '+(len>720?1:0)+' 1 '+b[0].toFixed(1)+' '+b[1].toFixed(1));
  $('.moon',svg).setAttribute('transform','translate('+a[0].toFixed(1)+' '+a[1].toFixed(1)+')');$('.sun',svg).setAttribute('transform','translate('+b[0].toFixed(1)+' '+b[1].toFixed(1)+')');
  $('.mid .n',dial).textContent=short(sl);$('.tbed').textContent=clock(bed);$('.twake').textContent=clock(wake);
  $('.moon',svg).setAttribute('aria-valuetext',clock(bed));$('.sun',svg).setAttribute('aria-valuetext',clock(wake));
  lv.forEach(function(x){x.setAttribute('aria-pressed',+x.dataset.m===sl);});}
 function at(e){var b=svg.getBoundingClientRect(),x=(e.clientX-b.left)/b.width*300-C,y=(e.clientY-b.top)/b.height*300-C,a=Math.atan2(y,x)+Math.PI/2;if(a<0)a+=2*Math.PI;return wrap(Math.round(a/(2*Math.PI)*1440/5)*5);}
 function setBed(m){sl=Math.min(720,Math.max(300,Math.round(wrap(wake-m)*eff/5)*5));}
 [['.sun',function(m){wake=m;}],['.moon',setBed]].forEach(function(x){var h=$(x[0],svg);
  h.addEventListener('pointerdown',function(e){touched=true;e.preventDefault();h.setPointerCapture(e.pointerId);function mv(e){x[1](at(e));draw();}h.addEventListener('pointermove',mv);h.addEventListener('pointerup',function(){h.removeEventListener('pointermove',mv);},{once:true});});
  h.addEventListener('keydown',function(e){var d=e.key==='ArrowRight'||e.key==='ArrowUp'?5:e.key==='ArrowLeft'||e.key==='ArrowDown'?-5:0;if(!d)return;e.preventDefault();touched=true;
   if(x[0]==='.sun')wake=wrap(wake+d);else setBed(wrap(wake-inBed(sl)+d));draw();});});
 async function toSleep(m){var f=sl;await tween(600,function(p){sl=Math.round((f+(m-f)*p)/5)*5;draw();});sl=m;draw();}
 async function toWake(m){var f=wake;await tween(1300,function(p){wake=Math.round((f+(m-f)*p)/5)*5;draw();});}
 lv.forEach(function(x){x.addEventListener('click',function(){touched=true;toSleep(+x.dataset.m);});});
 var tog=$('.tog');tog.addEventListener('click',function(){touched=true;tog.setAttribute('aria-checked',tog.getAttribute('aria-checked')!=='true');});
 draw();
 seen(dial,async function(){if(still)return;var w0=wake,s0=sl;await wait(500);if(touched)return;await toWake(w0-45);await wait(500);if(touched)return;await toWake(w0);await wait(500);if(touched)return;
  lv[1].setAttribute('aria-pressed','true');await toSleep(+lv[1].dataset.m);await wait(900);if(touched)return;await toSleep(s0);await wait(400);if(!touched)tog.setAttribute('aria-checked','true');},.5);}
// Strain: the morning run fills the gauge toward the target, then the planned workout and the week.
var sg=$('#zatez .gauge');
seen(sg,async function(){if(still)return;var acts=$$('#zatez .act');gauge(sg,0);await wait(300);acts[0].classList.remove('pre');await tween(1400,function(p){gauge(sg,+sg.dataset.v*p);});await wait(300);acts[1].classList.remove('pre');await wait(200);$('#zatez .wk').classList.remove('pre');},.4);
// The gym: the page scrolls a workout through the phone, from picking it to done; the rest is counted down.
var walk=$('.walk');
if(walk){var gs=$$('.scr img',walk),st=$$('.steps li',walk),dots=$$('.dots i',walk),gt=$('.tap',walk),timer=$('.timer',walk),TAPS=[[50,87],[50,62],[50,66],[50,65],[85,46]],gi=0,tick;
 function step(i){if(i===gi)return;var fw=i>gi;if(fw&&TAPS[gi]&&!still){gt.style.left=TAPS[gi][0]+'%';gt.style.top=TAPS[gi][1]+'%';gt.classList.remove('go');void gt.offsetWidth;gt.classList.add('go');}
  setTimeout(function(){gs.forEach(function(im,k){im.classList.toggle('on',k===i);im.classList.toggle('back',k<i);});},fw&&!still?250:0);
  st.forEach(function(p,k){p.classList.toggle('on',k===i);});dots.forEach(function(p,k){p.classList.toggle('on',k===i);});gi=i;
  clearInterval(tick);timer.classList.toggle('on',i===4);if(i===4){var s=90,n=$('.n',timer),c=$('.fgc',timer);function show(){n.textContent=Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60;c.style.strokeDashoffset=264*(1-s/90);}show();if(!still)tick=setInterval(function(){s=Math.max(0,s-1);show();},150);}}
 function onScroll(){var b=walk.getBoundingClientRect(),p=Math.min(1,Math.max(0,-b.top/(b.height-innerHeight)));step(Math.min(gs.length-1,Math.floor(p*gs.length)));}
 addEventListener('scroll',onScroll,{passive:true});onScroll();}
// Nutrition: breakfast goes in, the day adds up and the coach says what that means for the next meal.
var food=$('#vyziva .lc');
seen(food,async function(){if(still)return;var say=$('.say p',food),line=say.textContent;say.textContent='';await wait(200);$('.meal',food).classList.remove('pre');await wait(500);
 var k=$('.kc .n',food);count(k,+k.dataset.n,1400);$$('.mac .n',food).forEach(function(n){count(n,+n.dataset.n,1400);});$('.mac',food).classList.remove('pre');await wait(1500);
 for(var i=0;i<=line.length;i++){say.textContent=line.slice(0,i);await wait(22);}},.4);
// The coach: a suggestion is tapped, the question goes up and the answer comes in word by word.
var chat=$('.chat');
if(chat){var ai=$('.ai',chat),answer=ai.textContent;if(still){chat.classList.add('done');$('.ask',chat).style.display='none';}else{ai.textContent='';
 seen(chat,async function(){await wait(700);$('.ask span',chat).classList.add('tp');await wait(350);$('.ask',chat).style.opacity=0;await wait(300);$('.ask',chat).style.display='none';
  $('.me',chat).style.cssText='opacity:1;transform:none';await wait(400);ai.innerHTML='<div class="typing"><i></i><i></i><i></i></div>';await wait(1300);
  var w=answer.split(' ');for(var i=1;i<=w.length;i++){ai.textContent=w.slice(0,i).join(' ');await wait(60);}await wait(300);chat.classList.add('done');},.4);}}
// The waitlist: the address goes to /waitlist and the field turns into a thank-you.
$$('form.wl').forEach(function(f){var input=f.querySelector('input'),err=f.querySelector('.err'),busy=false;
 f.addEventListener('submit',function(e){e.preventDefault();if(busy)return;var email=input.value.trim();err.textContent='';
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){err.textContent='Enter a valid email.';input.focus();return;}
  busy=true;fetch('/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})})
  .then(function(r){return r.json().catch(function(){return {};}).then(function(b){if(!r.ok)throw new Error(b.message||'Something went wrong. Try again.');f.classList.add('sent');})})
  .catch(function(x){err.textContent=x.message;}).then(function(){busy=false;});});});
// Muscles: Front and Back turn the figure; a bubble shows its muscle up close, as its detail does in the app.
var fig=$('.fig');if(!fig)return;
var zoom=$('.zoom'),bubs=$$('.bub',fig),turn=$$('.turn button');
function pick(b){bubs.forEach(function(x){x.classList.toggle('on',x===b);});zoom.style.setProperty('--c',b.style.getPropertyValue('--c'));
 $('img',zoom).src=b.dataset.zoom;$('b',zoom).textContent=$('b',b).textContent;$('p',zoom).textContent=b.dataset.state;}
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
${path === '/' ? '<style>@import url(/site/fonts/instrument-serif.css);</style>' : ''}
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
  const shot = (name, {lazy = true, on = false, k = ''} = {}) => `<img src="/site/app/${name}.webp" alt="" width="603" height="1311"${on ? ' class="on"' : ''}${k ? ` data-k="${k}"` : ''}${lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"'}>`;
  const panel = (id, tint, color, eyebrow, h, p, demo, cls = '') => `<section id="${id}" class="sec${cls ? ' ' + cls : ''}"><div class="wrap"><div class="panel" style="--t:${tint};--c:${color}">
<div class="txt"><div class="eb">${eyebrow}</div><h2 class="h2 rv">${h}</h2><p class="lead rv">${p}</p></div>
<div class="demo">${demo}</div></div></div></section>`;

  // The sample day (DemoData.swift, in English as DemoEnglish.swift has it); every card below draws from it.
  const DAY = {readiness: 78, history: [65, 69, 60, 82, 67, 71, 62, 53, 75, 80, 63, 54, 77, 78],
    parts: [['Sleep', '7:12', 'your normal 7:53–9:11 h', '↓ below normal', -4, 432, 473, 551],
      ['Resting heart rate', '48 bpm', 'your normal 50–54 /min', '↓ below normal', 3, 48, 49.5, 53.5],
      ['HRV', '64 ms', 'your normal 55–61 ms', '↑ above normal', 9, 64, 55, 61]],
    stages: [['Deep', '1:23', 83], ['REM', '1:34', 94], ['Light', '4:15', 255], ['Awake', '0:17', 17]],
    tonight: {need: 510, sleep: 510, inBed: 545, wake: 7 * 60 + 15, goal: 480, strain: 15, debt: 30, naps: 15},
    strain: 8.4, target: [11.4, 14.4],
    week: [['Mo', 16.4], ['Tu', 9.9], ['We', 15.4], ['Th', 8.4, 'now'], ['Fr', 10.2, 'plan'], ['Sa', 14.8, 'plan'], ['Su', 4.2, 'plan']],
    food: {kcal: 1380, target: 2650, carbs: [177, 330], protein: [84, 150], fat: [36, 80]},
    coach: 'Sleep 7 h 12 min (40 min more than usual). HRV is above normal for the third day. Go all in on strength today, with a carb snack an hour and a half before.'};

  // Readiness parts: your value on a track around your own normal, and the points it brings.
  const at = (q, lo, hi) => {const w = hi - lo, min = lo - w * 1.3, max = hi + w * 1.3; return Math.max(4, Math.min(96, (q - min) / (max - min) * 100)).toFixed(1);};
  const row = ([name, value, normal, dir, points, v, lo, hi], short = false) => {
    const c = points < 0 ? 'var(--rust)' : 'var(--green)';
    return `<div class="row pre" style="--c:${c}"><div class="a"><b>${short ? name.replace('Resting heart rate', 'Resting HR') : name}</b><span class="n">${short ? value.split(' ')[0] : value}</span></div>
${short ? '' : `<div class="bb"><span>${normal}</span><span style="color:${c}">${dir}</span></div>`}<div class="rng"><i class="band" style="left:${at(lo, lo, hi)}%;width:${(at(hi, lo, hi) - at(lo, lo, hi)).toFixed(1)}%"></i><i class="dot" style="left:${at(v, lo, hi)}%"></i></div><div class="pts">${points > 0 ? '+' : '−'}${Math.abs(points)}${short ? ' points' : ' readiness points'}</div></div>`;
  };
  // The strain gauge, drawn as it ends; the script fills it from 0.
  const A0 = Math.PI * .75, SPAN = Math.PI * 1.5, ang = v => A0 + SPAN * v / 21;
  const arc = (r, a, b) => {const p = x => [100 + r * Math.cos(x), 100 + r * Math.sin(x)].map(n => n.toFixed(1)); const [x0, y0] = p(a), [x1, y1] = p(b); return `M${x0} ${y0}A${r} ${r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;};
  const gauge = (width, stroke, note) => `<div class="gauge" style="width:${width}px" data-v="${DAY.strain}"><svg viewBox="0 0 200 200" aria-hidden="true"><path class="gt" stroke-width="${stroke}" d="${arc(78, A0, A0 + SPAN)}"/><path class="gz" stroke-width="${stroke}" d="${arc(78, ang(DAY.target[0]), ang(DAY.target[1]))}"/><path class="gv" stroke-width="${stroke}" d="${arc(78, A0, ang(DAY.strain))}"/></svg><div class="mid"><span class="n">${DAY.strain.toFixed(1)}</span><small>${note}</small></div></div>`;
  const target = `${Math.round(DAY.target[0])}–${Math.round(DAY.target[1])}`;

  // The hero: the phone taps through Today (readiness, last night's sleep, today's strain) and the card
  // beside it plays what that screen shows.
  const total = DAY.stages.reduce((s, x) => s + x[2], 0);
  const stageColor = ['var(--indigo)', 'color-mix(in srgb,var(--indigo) 70%,var(--panel))', 'color-mix(in srgb,var(--indigo) 40%,var(--panel))', 'var(--amber-bar)'];
  const hero = `<div class="stage" role="img" aria-label="Aurin on a phone: Today with readiness ${DAY.readiness}, sleep 7:12, strain ${DAY.strain} and HRV 64 ms, then what makes up the readiness, last night’s sleep and today’s strain"><div class="glow"></div>
<div class="phone"><div class="scr" data-hero>${shot('today', {lazy: false, on: true, k: 'today'})}${shot('readiness-parts', {k: 'ready'})}${shot('sleep', {k: 'sleep'})}${shot('strain-target', {k: 'strain'})}<i class="tap"></i></div></div>
<div class="lc fc on" data-k="today" style="right:-6px;top:250px"><div class="t"><span>How to start today</span></div><p style="font:17px/1.3 Newsreader,Georgia,serif;margin-top:6px">Go all in on strength today, with a carb snack an hour and a half before.</p></div>
<div class="lc fc" data-k="ready" style="left:-6px;top:200px"><div class="t"><span>What makes up today</span></div>${DAY.parts.map(p => row(p, true)).join('')}</div>
<div class="lc fc" data-k="sleep" style="right:-6px;top:240px"><div class="t"><span>Sleep stages</span><span class="pill i">score 82</span></div><div class="st">${DAY.stages.map(([name, time, min], i) => `<div style="--c:${stageColor[i]}"><span>${name}</span><i><b style="width:${Math.max(6, Math.round(min / total * 160))}%"></b></i><span class="n">${time}</span></div>`).join('')}</div></div>
<div class="lc fc" data-k="strain" style="left:-6px;top:240px;width:176px;text-align:center"><div class="t"><span>Strain</span><span class="pill a">moderate</span></div>${gauge(130, 16, `target ${target}`)}</div>
</div>`;

  // Connections: what Aurin reads from each service and what it sends back, as the app's connect
  // sheet says it (SettingsConnectFlow.swift, SyncViews.swift). Each logo is the app's own file.
  const services = [
    {id: 'apple', name: 'Apple Health', logo: 'apple-health.png',
      reads: ['sleep', 'HRV', 'workouts', 'heart rate', 'steps', 'weight'], sends: ['workouts', 'weight', 'food', 'water']},
    {id: 'google', name: 'Google Health', logo: 'google-health.png',
      reads: ['sleep', 'HRV', 'workouts', 'heart rate', 'steps', 'food'], sends: ['food', 'drinks', 'workouts, if you allow', 'weight, if you allow']},
    {id: 'intervals', name: 'Intervals.icu', logo: 'intervals.svg',
      reads: ['workouts with power', 'plan', 'zones', 'weight'], sends: ['planned workouts', 'calorie target', 'weight', 'sleep, HRV and daily values']},
    {id: 'ultrahuman', name: 'Ultrahuman Ring', logo: 'ultrahuman.svg', tile: 'dark',
      reads: ['sleep', 'resting heart rate', 'HRV', 'VO₂max', 'temperature'], sends: [], none: 'Nothing, Aurin only reads the ring.'},
    {id: 'whoop', name: 'WHOOP', logo: 'whoop.svg',
      reads: ['sleep', 'resting heart rate', 'HRV', 'breathing rate', 'blood oxygen'], sends: [], none: 'Nothing, Aurin only reads WHOOP.'},
    {id: 'wahoo', name: 'Wahoo', logo: 'wahoo.png', tile: 'dark word',
      reads: ['finished rides and runs', 'power and TSS', 'heart rate'], sends: ['planned workouts, to ELEMNT and KICKR']}];
  // The labels that travel along the lines are the short form of the same words.
  const tag = x => x.split(/,| and | with /)[0].replace('finished ', '').replace('resting heart rate', 'resting HR');
  const logo = ({logo, tile = ''}, items) => `<span class="lt ${tile}"${items ? ` data-items="${items.map(tag).join('|')}"` : ''}><img src="/site/logos/${logo}" alt=""></span>`;
  const connect = `<section id="propojeni" class="sec"><div class="wrap"><div class="panel conn">
<div class="txt"><div class="eb">Connections</div><h2 class="h2 rv">Works with what you wear.</h2>
<p class="lead rv">Any watch or ring that saves to Apple Health or Google Health, plus these directly. Here is what goes where.</p>
<div class="flow" aria-hidden="true"><svg class="lines"></svg><p class="cap">Aurin reads</p>
<div class="lr from">${services.map(x => logo(x, x.reads)).join('')}</div>
<div class="hub">${mark(40)}</div>
<div class="lr to">${services.filter(x => x.sends.length).map(x => logo(x, x.sends)).join('')}</div><p class="cap" style="margin:10px 0 0">Aurin sends back</p></div></div>
<div class="svcs">${services.map(x => `<div class="svc" data-svc="${x.id}">${logo(x)}<div><b>${x.name}</b><p><em class="i">↓ In:</em> ${x.reads.join(', ')}</p><p>${x.sends.length ? `<em class="o">↑ Out:</em> ${x.sends.join(', ')}` : `<span class="none">${x.none}</span>`}</p></div></div>`).join('\n')}</div>
</div></div></section>`;

  // Readiness: the score, what makes it up and the last two weeks.
  const readiness = `<div class="lc flat"><div style="display:flex;align-items:flex-end;gap:10px"><span class="n big" data-n="${DAY.readiness}">${DAY.readiness}</span><span class="pill g" style="margin-bottom:10px">high</span></div>
<div class="t caps" style="margin-top:18px"><span>What makes up today’s score</span></div>${DAY.parts.map(p => row(p)).join('')}
<div class="t caps" style="margin-top:12px"><span>Last 14 days</span><span>average ${Math.round(DAY.history.reduce((s, v) => s + v, 0) / DAY.history.length)}</span></div>
<div class="bars pre">${DAY.history.map(v => `<i class="${v >= 67 ? 'hi' : ''}" style="height:${Math.round(v * .85)}%"></i>`).join('')}</div></div>`;

  // Sleep: the app's dial at tonight's plan, which the script lets you drag.
  const T = DAY.tonight, C = 150, R = 132, wrapM = m => ((m % 1440) + 1440) % 1440;
  const pt = (m, r = R) => {const a = m / 1440 * 2 * Math.PI - Math.PI / 2; return [C + r * Math.cos(a), C + r * Math.sin(a)].map(n => +n.toFixed(1));};
  const clock = m => {m = wrapM(m); const h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;};
  const hm = m => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  const bed = wrapM(T.wake - T.inBed), [bx, by] = pt(bed), [wx, wy] = pt(T.wake), usual = pt(23 * 60 + 48, R + 17);
  const sleep = `<div class="dial" data-eff="${(T.sleep / T.inBed).toFixed(4)}" data-wake="${T.wake}" data-sleep="${T.sleep}"><svg viewBox="0 0 300 300">
<circle cx="150" cy="150" r="${R}" fill="none" stroke="var(--track)" stroke-width="24"/>
<path class="night" fill="none" stroke="var(--indigo)" stroke-width="24" stroke-linecap="round" d="M${bx} ${by}A${R} ${R} 0 ${T.inBed > 720 ? 1 : 0} 1 ${wx} ${wy}"/>
${[0, 3, 6, 9, 12, 15, 18, 21].map(h => {const [x, y] = pt(h * 60, R - 26); return `<text x="${x}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${h}</text>`;}).join('')}
<circle cx="${usual[0]}" cy="${usual[1]}" r="3" fill="var(--muted)"/>
<g class="hd moon" role="slider" tabindex="0" aria-label="Bedtime" aria-valuetext="${clock(bed)}" transform="translate(${bx} ${by})"><circle r="16"/><path d="M-4.5-6a6.5 6.5 0 1 0 8.5 8.5A5.5 5.5 0 0 1-4.5-6Z" fill="var(--indigo)"/></g>
<g class="hd sun" role="slider" tabindex="0" aria-label="Wake up" aria-valuetext="${clock(T.wake)}" transform="translate(${wx} ${wy})"><circle r="16"/><circle r="4" fill="var(--amber)"/><path d="M0-9v2M0 7v2M-9 0h2M7 0h2M-6.4-6.4l1.4 1.4M5 5l1.4 1.4M-6.4 6.4l1.4-1.4M5-5l1.4-1.4" stroke="var(--amber)" stroke-width="2" stroke-linecap="round"/></g>
</svg><div class="mid"><span class="n">${hm(T.sleep)}</span><small>sleep</small></div></div>
<div class="two"><div class="lc flat"><div class="t"><span>Bedtime</span></div><div class="n tbed">${clock(bed)}</div></div><div class="lc flat"><div class="t"><span>Wake up</span></div><div class="n twake">${clock(T.wake)}</div></div></div>
<div class="lv" role="group" aria-label="Tonight I want">${[['Catch up', T.need], ['As usual', T.goal], ['At least', 420]].map(([name, m]) => `<button type="button" data-m="${m}" aria-pressed="${m === T.sleep}">${name}<small>${hm(m)}</small></button>`).join('')}</div>
<div class="lc flat why"><div class="t caps" style="margin-bottom:4px"><span>Why ${hm(T.need)}</span></div><div><span>Your goal</span><span class="goal">${hm(T.goal)}</span></div><div><span>Today’s strain</span><span>+${T.strain} min</span></div><div><span>Sleep debt</span><span>+${T.debt} min</span></div><div><span>Nap</span><span class="less">−${T.naps} min</span></div></div>
<div class="lc flat alarm"><div><b style="font-weight:500">Weekdays</b><small>Monday to Friday</small></div><button type="button" class="tog" role="switch" aria-checked="false" aria-label="Alarm on weekdays"></button></div>`;

  // Strain: today's run fills the gauge toward the target, then the planned workout and the week.
  const peak = Math.max(...DAY.week.map(d => d[1]));
  const strain = `<div class="lc flat" style="text-align:center">${gauge(200, 14, `target ${target} · of 21`)}
<div class="act pre"><span class="ic">${icon('steps')}</span><div style="text-align:left"><b>Morning run</b><small>7:30 AM · 42 min · 48 TSS</small></div><span class="n">+${DAY.strain}</span></div>
<div class="act pre"><span class="ic p">${icon('gym')}</span><div style="text-align:left"><b>Strength, full body</b><small>Planned · 5:30 PM · 45 min</small></div><span class="pill a">to target</span></div></div>
<div id="trenink" class="lc flat" style="margin-top:10px"><div class="t caps"><span>This week</span><span>dashed is planned</span></div>
<div class="wk pre">${DAY.week.map(([d, v, k = '']) => `<div class="${k}"><span class="n">${k === 'plan' ? Math.round(v) : v}</span><i style="height:${Math.round(v / peak * 80)}px"></i><span>${d}</span></div>`).join('')}</div></div>`;

  // The gym, as you scroll: pick a workout, Aurin builds it, start, tick off sets, rest, done.
  const GYM = [['builder', 'Say what you want', 'Upper body, legs or full body, and how long you have.'],
    ['gym-day', 'Aurin builds it', 'Legs rested since Monday, so squats at a moderate load.'],
    ['training-mode', 'Start when you’re ready', 'Your weights and reps are filled in.'],
    ['training-set', 'Tick off each set', 'One tap per set, warm-ups included.'],
    ['training-rest', 'Rest is timed for you', 'It keeps counting on your lock screen.'],
    ['training-done', 'Done and counted', 'Into your strain, your muscles and your week.']];
  const gym = `<section id="posilovna" class="sec gym"><div class="wrap"><div class="panel" style="--t:linear-gradient(180deg,var(--glow-training),var(--sand));--c:var(--amber)">
<div class="txt"><div class="eb">Gym</div><h2 class="h2 rv">A workout made for&nbsp;today.</h2><p class="lead rv">From your rested muscles, your time and your gym, logged set by set.</p></div>
<div class="walk"><div class="pin"><div class="phone" aria-hidden="true"><div class="scr">${GYM.map(([name], i) => shot(name, {on: !i})).join('')}<i class="tap"></i></div>
<div class="lc timer"><div class="t" style="justify-content:center"><span>Rest</span></div><svg viewBox="0 0 100 100"><circle class="bgc" cx="50" cy="50" r="42"/><circle class="fgc" cx="50" cy="50" r="42" transform="rotate(-90 50 50)" stroke-dasharray="264" stroke-dashoffset="0"/></svg><span class="n">1:30</span><small>next: Squat · set 3</small></div></div>
<div class="side"><div class="dots" aria-hidden="true">${GYM.map((x, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
<ol class="steps">${GYM.map(([, title, text], i) => `<li${i ? '' : ' class="on"'}><b>${title}</b>${text}</li>`).join('')}</ol></div></div></div>
</div></div></section>`;

  // Nutrition: what the day adds up to and what the coach says about the next meal.
  const F = DAY.food, macro = (name, [v, of], color) => `<div style="--c:${color}">${name}<div><span class="n" data-n="${v}">${v}</span> / ${of} g</div><i><b style="--w:${Math.round(v / of * 100)}%"></b></i></div>`;
  const nutrition = `<div class="lc flat"><div class="kc"><span class="n" data-n="${F.kcal}">${F.kcal.toLocaleString('en')}</span><span>of ${F.target.toLocaleString('en')}<br>kcal</span></div>
<div class="mac pre">${macro('Carbs', F.carbs, 'var(--carbs)')}${macro('Protein', F.protein, 'var(--protein)')}${macro('Fat', F.fat, 'var(--fat)')}</div>
<div class="meal pre"><span class="ic">${icon('camera')}</span><div><b>Oatmeal with yogurt</b><small>Breakfast · 7:30 AM</small></div><span class="n">430</span></div>
<div class="say"><small>${icon('spark')} Coach</small><p>Training day: 350 kcal more. 1,270 kcal left, an afternoon snack of about 360 kcal.</p></div></div>`;

  // The coach: a suggestion from the app's coach screen, and its answer from the sample day.
  const coach = `<div class="chat" aria-label="A conversation with the coach"><div class="top">Coach</div>
<div class="ask" aria-hidden="true"><h3>What would you like to ask?</h3><span>How should I train today?</span><span>I’m not feeling well, adjust my week.</span><span>Why is my readiness low?</span></div>
<div class="msgs"><div class="me">How should I train today?</div><div class="ai">${DAY.coach}</div>
<div class="wo"><small>TODAY · 5:30 PM</small><b>Strength, full body</b><span>45 min · Squat, Bench press, Rows</span></div></div>
<div class="inp" aria-hidden="true"><span>Message the coach…</span><i></i></div></div>`;

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
    ['drop', 'var(--blue)', 'Drinks', 'Water, coffee and tea in one tap.'],
    ['barcode', 'var(--amber)', 'Barcode', 'Scan a packet and log it in seconds.'],
    ['flame', 'var(--carbs)', 'Records', 'Your best lifts, kept for every exercise.'],
    ['training', 'var(--button)', 'Lock screen', 'The rest timer stays on your lock screen and shows what comes next.'],
    ['calendar', 'var(--rust)', 'Cycle', 'Your cycle day, its phase and the next period.'],
    ['today', 'var(--logo-recovery)', 'Widgets', 'Readiness, sleep, food and drinks on your home screen.'],
    ['heart', 'var(--indigo)', 'Trends', 'HRV, resting heart rate, VO₂max and weight over weeks and months.']];

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
<p class="small">Works with the watch or ring you already wear.</p>
${hero}
</div></section>

${connect}

${panel('pripravenost', 'var(--glow-today)', 'var(--green)', 'Readiness', 'One number every&nbsp;morning.',
  'Your sleep, resting heart rate and HRV, each against your own normal, added up into how ready you are today.', readiness)}

${panel('spanek', 'linear-gradient(180deg,var(--glow-health),var(--lilac))', 'var(--indigo)', 'Sleep and alarm', 'Bedtime that fits&nbsp;tomorrow.',
  'Aurin works out how much sleep you need tonight from a hard day and the debt from the week. Drag the sun to when you want to get up and the bedtime follows; the alarm can ring then every weekday.', sleep)}

${panel('zatez', 'linear-gradient(180deg,var(--glow-training),var(--amber-soft))', 'var(--amber)', 'Strain and training', 'See the load add&nbsp;up.',
  'Every run, ride and gym session counts toward today’s strain, with a target from your readiness, sleep debt and plan. The week shows what’s done and what’s planned, and it syncs with Intervals.icu.', strain)}

${gym}

${muscles}

${panel('vyziva', 'linear-gradient(180deg,var(--glow-food),var(--amber-soft))', 'var(--coffee)', 'Nutrition', 'Eat for the day you’re&nbsp;having.',
  'Take a photo of your plate, scan a barcode or search, and log drinks in a tap. Train harder and your target grows with it.', nutrition)}

${panel('kouc', 'var(--button)', 'var(--coach-mint)', 'AI coach', 'Just ask. It knows your&nbsp;data.',
  'Ask how to train today, how to adjust your week or what to eat before a workout. It remembers what you tell it, and you can see and edit what it remembers.', coach, 'dark')}

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
