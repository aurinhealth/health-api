// Public pages: the Aurin overview on / and the policy pages. They use the iPhone app's light
// palette (ios-native/Shared/Palette.swift): warm paper, white cards, Newsreader headings.
// The phones on the overview show the app's own screens (Today in the hero, then a scene per area of
// the app whose phone walks through its screens), taken in CI from the sample data in English.
// When the app changes what a section shows, change the section here too.
// The site is in English only (Aurin is for the whole world); the privacy policy and the terms also
// have a Czech version at ?lang=cs, linked from the page and the footer.
import {themeTokens} from './design-system.js';
import {icon, ICON_PATHS} from './icons.js';
import {DEMOS, SCREENS, demoCss, demoScript} from './site-demos.js';
import {SITE_ORIGIN, SERVER_HOSTS} from './app-origin.js';


const siteCss = `
@font-face{font-family:Newsreader;src:url(/site/fonts/newsreader.woff2) format("woff2");font-display:swap}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;overflow-x:clip}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.5 -apple-system,BlinkMacSystemFont,Inter,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:clip}
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

/* The waitlist: the app is not in the App Store yet; an e-mail field with its button (store()). */
.wl{display:inline-flex;flex-direction:column;align-items:center;max-width:100%}
.wl .done{display:none}
.wl .field{display:flex;align-items:center;gap:6px;height:56px;width:340px;max-width:100%;padding:0 6px 0 22px;border-radius:999px;background:var(--panel);box-shadow:0 0 0 1px var(--line),0 14px 30px -12px rgba(21,20,15,.35)}
.wl input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:17px;color:var(--text)}
.wl .go{flex:none;width:44px;height:44px;border:0;border-radius:50%;background:var(--button);display:flex;align-items:center;justify-content:center;cursor:pointer}
.wl .go svg,.wl .done svg{width:20px;height:20px;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.wl .go svg{stroke:var(--on-button)}
.wl .done{align-items:center;gap:10px;height:56px;padding:0 26px;border-radius:999px;background:color-mix(in srgb,var(--green) 13%,var(--panel));color:var(--green);font-size:17px;font-weight:600}
.wl .done svg{stroke:currentColor}
.wl .err{margin-top:10px;font-size:15px;color:var(--rust)}.wl .err:empty{display:none}
.wl.sent .field{display:none}.wl.sent .done{display:inline-flex}
/* After joining: pass Aurin on (the phone's own sharing, or the link copied). Nothing about it is stored. */
.wl .share{display:none;align-items:center;gap:8px;margin-top:12px;padding:8px 14px;border:0;border-radius:999px;background:transparent;font:inherit;font-size:15px;font-weight:600;color:var(--sec);cursor:pointer}
.wl .share:hover{background:var(--panel)}.wl .share svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.wl.sent .share{display:inline-flex}

/* Grain over the whole page: printed paper rather than a flat screen. */
.site body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:60;opacity:.05;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}

/* Shared pieces of the overview. */
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--tone,var(--green));margin-bottom:16px}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.sub{font-size:20px;line-height:1.5;color:var(--sec);max-width:520px;margin-top:20px}
.sub.free{margin-top:8px;color:var(--green);font-weight:600}
h2.big{font-size:clamp(44px,5.6vw,80px);line-height:.98;letter-spacing:-.025em}
.up{color:var(--green)}.sleep{color:var(--indigo)}.warm{color:var(--amber)}
.nav-cta{display:inline-flex;align-items:center;height:36px;padding:0 16px;border-radius:999px;background:var(--button);color:var(--on-button);font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap}
.nav-cta:hover{opacity:.9}
/* One waitlist button at a time: the nav's pill appears once the hero's button has scrolled away (always there without JS). */
.js .site-head:not(.away) .nav-cta{display:none}

/* Aurora: the two halves of the mark (and a little lilac), soft behind the hero phone and the end. */
.aurora{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.aurora i{position:absolute;border-radius:50%;filter:blur(80px);opacity:.42}
.aurora .a{width:40vmax;height:34vmax;right:2vmax;top:-4vmax;background:var(--logo-load)}
.aurora .b{width:38vmax;height:36vmax;right:-14vmax;top:16vmax;background:var(--logo-recovery)}
.aurora .c{width:26vmax;height:24vmax;right:22vmax;top:26vmax;background:var(--aurora-lilac);opacity:.3}
.aurora::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,transparent 60%,var(--bg))}

/* Hero: the line on the left, the app's Today on the right with three numbers floating beside it. */
.hero{position:relative;margin-top:-76px;padding:136px 0 72px;overflow:clip}
.hero .grid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);align-items:center;gap:32px}
.kicker{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:color-mix(in srgb,var(--panel) 60%,transparent);border:1px solid var(--line);font-size:14px;font-weight:600;color:var(--sec)}
.kicker i{width:8px;height:8px;border-radius:50%;background:var(--green)}
.hero h1{font-size:clamp(56px,7.2vw,112px);line-height:.96;letter-spacing:-.03em;margin-top:26px}
.hero h1 .w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.1em;margin-bottom:-.1em}
.hero h1 .w>span{display:inline-block}
.lede{max-width:500px;margin-top:26px;font-size:20px;color:var(--sec)}
.hero .cta{margin-top:36px}
.hero .wl{align-items:flex-start}
.hero .note{margin-top:16px;font-size:14px;color:var(--muted)}
.stage{position:relative;height:720px;display:flex;align-items:center;justify-content:center}
.glass{position:absolute;z-index:2;text-align:left;padding:16px 18px;border-radius:22px;background:color-mix(in srgb,var(--panel) 74%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);border:1px solid color-mix(in srgb,var(--panel) 85%,transparent);box-shadow:0 24px 60px -18px rgba(80,60,30,.28)}
.glass .k{font-size:13px;color:var(--muted)}.glass .v{font-size:30px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.glass .d{font-size:13px;font-weight:600}
.glass.g1{left:calc(50% - 300px);top:150px}
.glass.g2{right:calc(50% - 280px);top:300px}
.glass.g3{left:calc(50% - 300px);bottom:84px;width:240px;font-size:15px}

/* A real-looking iPhone: titanium edge, black bezel, glass glare and a deep shadow. Its screens are
   the app's own, taken in CI from the sample data (ios-native.yml, screens/site/). */
.device{position:relative;width:322px;padding:10px;border-radius:58px;text-align:left;background:linear-gradient(140deg,var(--device-hi) 0%,var(--device-lo) 18%,var(--device-hi) 34%,var(--device-lo) 58%,var(--device-mid) 80%,var(--device-lo) 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),inset 0 0 3px 1px rgba(0,0,0,.25),0 2px 2px rgba(0,0,0,.08),0 60px 120px -30px rgba(60,40,15,.45),0 30px 60px -30px rgba(0,0,0,.35)}
.device::before,.device::after{content:"";position:absolute;width:4px;border-radius:2px;background:linear-gradient(var(--device-mid),var(--device-lo))}
.device::before{left:-3px;top:150px;height:58px}.device::after{right:-3px;top:190px;height:86px}
.bezel{padding:5px;border-radius:49px;background:#000}
.screen{position:relative;aspect-ratio:1206/2622;border-radius:44px;overflow:hidden;background:var(--bg)}
.screen img{display:block;width:100%;height:100%}
.screen::after{content:"";position:absolute;inset:0;z-index:4;pointer-events:none;border-radius:inherit;background:linear-gradient(118deg,rgba(255,255,255,.28),rgba(255,255,255,0) 32%)}
/* The hero's Today: the coach's sentence scrolled under the tab bar fades into the paper instead of reading as cut off. */
.hero .screen::before{content:"";position:absolute;left:0;right:0;bottom:0;height:56px;z-index:3;pointer-events:none;background:linear-gradient(to top,var(--bg) 45%,transparent)}
.scr{position:absolute;inset:0;transition:opacity .6s ease,transform .8s cubic-bezier(.16,1,.3,1)}
.scr:not(.on){opacity:0;transform:translateY(14px) scale(.985)}

/* One morning: the sample day said as a sentence, with the numbers the hero phone shows. */
.morning{padding:56px 0 24px}
.morning .say{max-width:1000px;font:400 clamp(30px,3.8vw,52px)/1.18 Newsreader,"New York",Georgia,serif;letter-spacing:-.015em;color:var(--text)}
.morning .say b{font:600 .78em/1 -apple-system,BlinkMacSystemFont,Inter,"Segoe UI",system-ui,sans-serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums;padding:.08em .32em;border-radius:.4em;white-space:nowrap;background:color-mix(in srgb,currentColor 11%,transparent)}
.morning .say em{font-style:italic}

/* Chapters: one per area of the app, in the order of its tabs. The words on one side, the phone on
   the other (sides alternate); each step shows its own screen and lifts a piece of it beside the phone.
   Steps take turns on their own while the chapter is in view, until one is picked. */
.chapter{position:relative;padding:140px 0 0}
.ch{display:grid;grid-template-columns:minmax(0,1fr) 640px;grid-template-areas:"head vis" "steps vis";column-gap:56px;align-items:start}
.chapter.flip .ch{grid-template-columns:640px minmax(0,1fr);grid-template-areas:"vis head" "vis steps"}
.ch .head{grid-area:head;padding-top:56px}
.ch .vis-wrap{grid-area:vis;position:relative}
.ch .steps{grid-area:steps;list-style:none;margin:40px 0 0;padding:0;max-width:480px}
.vis{position:relative;width:640px;height:702px;zoom:var(--z,1)}
.vis .glow{position:absolute;left:50%;top:50%;width:880px;height:880px;margin:-440px 0 0 -440px;border-radius:50%;background:radial-gradient(circle,var(--glow) 0,transparent 62%);pointer-events:none}
.vis .device{position:absolute;left:318px;top:18px}
.flip .vis .device{left:0}
.part{position:absolute;left:0;width:380px;border-radius:22px;overflow:hidden;background:var(--panel);box-shadow:0 40px 80px -30px rgba(60,40,10,.5),0 2px 8px rgba(0,0,0,.06),0 0 0 1px rgba(27,26,23,.05);opacity:0;z-index:3}
.flip .part{left:260px}
.part img{display:block;width:100%;height:auto}
.part.on{opacity:1}
.part:has(>.dm.wait:not(.in)){opacity:0!important}
.step{border-top:1px solid var(--line)}
.step:last-child{border-bottom:1px solid var(--line)}
.step>button,.step>div{display:grid;grid-template-columns:40px 1fr;column-gap:8px;width:100%;padding:20px 0;border:0;background:none;font:inherit;color:inherit;text-align:left}
.step>button{cursor:pointer}
.step .n{grid-row:1/3;font-size:13px;font-weight:700;letter-spacing:.06em;color:var(--tone);padding-top:6px;font-variant-numeric:tabular-nums}
.step .tt{font:400 28px/1.1 Newsreader,"New York",Georgia,serif;letter-spacing:-.015em}
.step .tx{margin-top:8px;color:var(--sec);font-size:17px}
.step .bar{grid-column:2;display:none;height:2px;margin-top:16px;border-radius:2px;background:var(--track);overflow:hidden}
.step .bar i{display:block;height:100%;width:0;background:var(--tone)}
.part{pointer-events:none}.part:has(.dial){pointer-events:auto}
.js .multi .step:not(.on) .tx{display:none}
.js .multi .step:not(.on) .tt{color:var(--muted)}
.js .multi .step>button:hover .tt{color:var(--text)}

/* Muscles: the app's 3D figure (Muscle3D.swift). The model is licensed and stays out of the page: the
   figure is drawn ahead from 72 sides (scripts/render-muscles-site.html), and a map per side says which
   muscle each pixel is, so dragging turns it and a tap names the muscle as the app's bubble does. */
.muscles{padding:150px 0 0;--tone:var(--rust-ink)}
.mu{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:center}
.muscles .key{display:flex;flex-wrap:wrap;gap:18px;margin-top:28px;font-size:14px;color:var(--muted)}
.muscles .key span{display:inline-flex;align-items:center;gap:7px}
.muscles .key i{width:9px;height:9px;border-radius:50%;background:var(--c)}
.muscles .hint{font-size:14px;color:var(--muted);margin-top:14px;transition:opacity .4s}
.fig{position:relative;margin:0 auto;width:min(480px,100%,calc((100svh - 120px) * .64));aspect-ratio:640/1000;touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none}
.fig::before{content:"";position:absolute;inset:10% -20%;z-index:-1;background:radial-gradient(circle,color-mix(in srgb,var(--rust) 15%,transparent) 0,transparent 60%)}
.fig canvas{display:block;width:100%;height:100%}
.fig .bubble{position:absolute;z-index:2;display:flex;gap:12px;align-items:center;padding:10px 12px 10px 14px;border:1px solid var(--line);border-radius:16px;background:color-mix(in srgb,var(--panel) 86%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 6px 24px rgba(0,0,0,.25);font:inherit;text-align:left;white-space:nowrap;cursor:pointer;transform:translate(-50%,-100%) scale(.85);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s cubic-bezier(.16,1,.3,1)}
.fig .bubble.on{opacity:1;transform:translate(-50%,-100%);pointer-events:auto}
.fig .bubble b{display:block;font-size:16px;font-weight:600;color:var(--text)}
.fig .bubble span{font-size:13px}
.fig .bubble .icon{color:var(--muted);width:14px;height:14px}
.muscle-card{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bg) 60%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .35s,visibility .35s}
.muscle-card.on{opacity:1;visibility:visible;pointer-events:auto}
.muscle-card .card{width:min(400px,calc(100% - 32px));padding:20px;border-radius:28px;background:var(--bg);text-align:left;box-shadow:0 40px 80px -30px rgba(60,40,10,.5);transform:scale(.94);transition:transform .45s cubic-bezier(.16,1,.3,1)}
.muscle-card.on .card{transform:none}
.muscle-card .zoom{height:220px;border-radius:22px;background:var(--panel) center/cover no-repeat}
.muscle-card h3{font:400 28px/1.1 Newsreader,"New York",Georgia,serif;margin:16px 0 4px}
.muscle-card .close{float:right;width:34px;height:34px;margin:-6px -6px 10px 10px;border:0;border-radius:50%;background:var(--track);color:var(--text);font-size:18px;cursor:pointer}

/* Connections: a row of the services the app connects; picking one says what Aurin reads from it and
   what it sends back. They take turns until one is picked. */
.connect{padding:150px 0 0}
.connect .intro{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:56px;align-items:end}
.connect .intro .sub{margin:0}
.connect .box{margin-top:48px}
.flow{position:relative;aspect-ratio:1000/440;border-radius:24px;background:var(--panel2);overflow:hidden}
.fc{position:absolute;left:0;top:0;width:1000px;height:440px;zoom:var(--fz,1)}
.lines{position:absolute;inset:0;width:100%;height:100%}.lines.tall,.pks.tall{display:none}
.lines path{fill:none;stroke-width:2.5;stroke-linecap:round;transition:opacity .5s,stroke .5s}
.lines .in{stroke:color-mix(in srgb,var(--green) 30%,transparent)}.lines .out{stroke:color-mix(in srgb,var(--amber-bar) 34%,transparent)}
.lines path.on{stroke-width:3}.lines .in.on{stroke:var(--green)}.lines .out.on{stroke:var(--amber-bar)}
.pk{position:absolute;left:0;top:0;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px 0 8px;border-radius:99px;background:var(--panel);box-shadow:0 4px 14px -4px rgba(60,45,20,.3);font-size:12.5px;font-weight:600;white-space:nowrap;offset-rotate:0deg;offset-anchor:50% 50%;opacity:0;animation:travel 4.4s linear infinite;transition:filter .4s}
.pk .icon{width:14px;height:14px}.pk.in{color:var(--green)}.pk.out{color:var(--amber)}
.pk:not(.on){visibility:hidden}
@keyframes travel{0%{offset-distance:0%;opacity:0}12%{opacity:1}85%{opacity:1}100%{offset-distance:100%;opacity:0}}
.col-l,.col-r{position:absolute;top:18px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
.col-l{left:40px;color:var(--green)}.col-r{right:40px;color:var(--amber)}
.flow .core{position:absolute;left:50%;top:50%;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;display:grid;place-items:center;background:var(--panel);box-shadow:0 14px 34px rgba(60,45,20,.16)}
.node,.dst{position:absolute;left:var(--x);top:var(--y);display:flex;align-items:center;gap:10px;transform:translate(-50%,-50%);border:0;background:none;padding:6px 10px 6px 6px;border-radius:16px;font:inherit;color:var(--muted);transition:background .3s,box-shadow .3s,color .3s}
.node{cursor:pointer;flex-direction:row-reverse;transform:translate(calc(-100% + 34px),-50%)}
.dst{transform:translate(-34px,-50%)}
.node:hover,.node[aria-selected=true],.dst.on{color:var(--text)}
.node[aria-selected=true],.dst.on{background:var(--panel);box-shadow:0 10px 30px -12px rgba(60,45,20,.3)}
.node .logo-tile,.dst .logo-tile{flex:none;width:52px;height:52px;display:grid;place-items:center}
.node img,.dst img{display:block;width:100%;height:100%}.node img.pad,.dst img.pad{padding:4%}
.node .nm,.dst .nm{font-size:14px;font-weight:600;white-space:nowrap}
.legend{display:flex;flex-wrap:wrap;gap:8px 20px;justify-content:center;margin-top:14px;font-size:14px;color:var(--muted)}
.legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px}.legend .in{background:var(--green)}.legend .out{background:var(--amber-bar)}
@media (prefers-reduced-motion:reduce){.pk{display:none}}
@media (max-width:640px){
  .flow{aspect-ratio:340/660}.fc{width:340px;height:660px}
  .lines.wide,.pks.wide{display:none}.lines.tall,.pks.tall{display:block}
  .node,.dst{left:var(--mx);top:var(--my);flex-direction:column;gap:4px;padding:6px;transform:translate(-50%,-50%)}
  .node .logo-tile,.dst .logo-tile{width:46px;height:46px}.node .nm,.dst .nm{font-size:11px;font-weight:600;max-width:84px;text-align:center;white-space:normal;line-height:1.15}
  .col-l{left:16px}.col-r{right:auto;left:16px;top:auto;bottom:118px}
  .flow .core{width:92px;height:92px;margin:-46px 0 0 -46px}.flow .core svg{width:46px;height:auto}
  .legend .tip{display:none}
}
.uh-tile{position:relative;display:grid;place-items:center;width:100%;height:100%;border-radius:26%;background:#000}
.uh-tile img{width:56%!important;height:auto!important}
.uh-tile.word img{width:78%!important}
.panels{margin-top:14px;padding:26px 28px;border-radius:24px;background:var(--panel);box-shadow:0 1px 2px rgba(60,45,20,.05)}
.svc h3{font-size:21px;font-weight:600}
.svc .io{display:grid;grid-template-columns:140px 1fr;gap:12px;margin-top:16px;align-items:start}
.svc .lbl{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;padding-top:7px}
.svc .lbl .icon{width:15px;height:15px;stroke-width:2.4}
.svc .lbl.in{color:var(--green)}.svc .lbl.out{color:var(--amber)}
.svc .items{display:flex;flex-wrap:wrap;gap:8px}
.svc .items span{display:inline-flex;align-items:center;gap:7px;padding:7px 12px 7px 10px;border-radius:999px;font-size:15px;font-weight:500;background:var(--bg)}
.svc .items .icon{width:16px;height:16px}
.svc .in+.items .icon{color:var(--green)}.svc .out+.items .icon{color:var(--amber)}
.svc .none{font-size:15px;color:var(--muted);padding-top:6px}
.svc+.svc{margin-top:24px;padding-top:22px;border-top:1px solid var(--line)}
.tabs .svc+.svc{margin:0;padding:0;border:0}
.tabs .svc:not(.on){display:none}

/* Privacy: the one ink panel on the page, so the promise stands apart. */
.privacy{padding:150px 0 0}
.privacy .ink{position:relative;padding:72px 64px;border-radius:32px;background:var(--button);color:var(--on-button);overflow:hidden}
.privacy .ink::before{content:"";position:absolute;right:-120px;top:-160px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--logo-recovery) 34%,transparent) 0,transparent 65%)}
.privacy .lock{position:relative;width:40px;height:40px;color:var(--logo-recovery);margin-bottom:28px;stroke-width:1.8}
.privacy .big{position:relative;max-width:920px;font:400 clamp(30px,4.2vw,56px)/1.12 Newsreader,"New York",Georgia,serif;letter-spacing:-.02em}
.privacy .more{position:relative;display:inline-flex;align-items:center;gap:8px;margin-top:32px;color:var(--on-button);font-weight:600;text-decoration:none;opacity:.86}
.privacy .more:hover{opacity:1;text-decoration:underline}
.privacy .more .icon{width:16px;height:16px}
.card{background:var(--panel);border-radius:28px;padding:24px;box-shadow:0 1px 2px rgba(60,45,20,.05)}
.disclosure{max-width:680px;margin:40px auto 0;padding:24px 26px;text-align:left}
.disclosure h3{font-size:16px;font-weight:600;margin-bottom:10px}
.disclosure p{font-size:14px;line-height:1.55;color:var(--muted);margin-bottom:12px}

/* Questions: the heading stays on the left, plain details/summary on the right (they open without JS). */
#faq{padding:150px 0 0}
.faq{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:56px;align-items:start}
.faq .side{position:sticky;top:110px}
.faq .side p{margin-top:18px;color:var(--sec)}
.faq details{border-top:1px solid var(--line)}
.faq details:last-child{border-bottom:1px solid var(--line)}
.faq summary{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:22px 2px;font-size:19px;font-weight:600;cursor:pointer;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"";flex:none;width:10px;height:10px;margin-top:-5px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg);transition:transform .3s}
.faq details[open] summary::after{transform:translateY(5px) rotate(-135deg)}
.faq details p{padding:0 2px 22px;color:var(--sec);max-width:640px}

/* The end: the mark, the name and the waitlist once more. */
.final{position:relative;padding:180px 0 170px;text-align:center;overflow:clip}
.final .aurora i{opacity:.36}
.final .aurora .a{right:auto;left:8vmax;top:6vmax}.final .aurora .b{right:4vmax;top:4vmax}.final .aurora .c{right:auto;left:38%;top:12vmax}
.final .aurora::after{background:linear-gradient(var(--bg),transparent 35%,transparent 70%,var(--bg))}
.final .wrap{position:relative;z-index:1}
.final .mark{display:block;margin:0 auto 26px;filter:drop-shadow(0 20px 30px rgba(60,45,20,.18))}
.final h2{font-size:clamp(58px,8vw,104px)}
.final .sub{margin:18px auto 0;text-align:center}
.final .wl{margin-top:32px}

/* Footer: the mark and the line from the hero, then three short groups, then who runs Aurin. */
.site-foot{border-top:1px solid var(--line);padding:56px 0 36px;color:var(--muted);font-size:14px}
.site-foot .top{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:32px}
.site-foot .brand{display:flex;flex-direction:column;align-items:flex-start;gap:14px}
.site-foot .brand p{font:400 22px/1.2 Newsreader,"New York",Georgia,serif;color:var(--text);letter-spacing:-.01em;max-width:320px}
.site-foot h3{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}
.site-foot ul{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.site-foot a{color:var(--sec);text-decoration:none}.site-foot a:hover{color:var(--text)}
.site-foot .base{display:flex;flex-wrap:wrap;gap:6px 24px;justify-content:space-between;margin-top:44px;padding-top:20px;border-top:1px solid var(--line);font-size:13px}

.doc{max-width:760px;padding:72px 24px 96px}
.doc h1{font-size:52px;margin:0 0 24px}
.doc h2{font-family:inherit;font-size:22px;font-weight:600;line-height:1.25;letter-spacing:-.01em;margin:40px 0 10px}
.doc p{color:var(--sec);margin-bottom:12px}
.doc ul,.doc ol{color:var(--sec);margin:0 0 12px;padding-left:22px}.doc li{margin-bottom:6px}

/* Phones and tablets: blurred, blended and glass layers are redrawn on every scrolled frame there, which makes the
   scroll stutter. The same colours are drawn flat instead: soft gradients for the aurora, no grain, solid glass. */
@media (hover:none),(max-width:960px){
  .site body::after{display:none}
  .aurora i{filter:none;opacity:.55;background:radial-gradient(closest-side,var(--k) 35%,transparent)!important}
  .aurora .a{--k:var(--logo-load)}.aurora .b{--k:var(--logo-recovery)}.aurora .c{--k:var(--aurora-lilac)}
  .site *{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
}

/* Motion, only with JS and without reduced motion: the headline rises word by word, the aurora drifts,
   content fades up as it scrolls in, a step's bar fills while it is shown and its piece floats. */
@media (prefers-reduced-motion:no-preference){
  .js .hero h1 .w>span{transform:translateY(105%);animation:rise .7s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(var(--i) * 40ms)}
  @keyframes rise{to{transform:none}}
  .js .hero .lede,.js .hero .cta,.js .hero .kicker{opacity:0;animation:fade .5s .15s forwards}
  .js .hero .kicker{animation-delay:0s}.js .hero .cta{animation-delay:.25s}
  .js .stage{opacity:0;transform:translateY(40px);animation:lift 1s cubic-bezier(.16,1,.3,1) .2s forwards}
  .js .glass{opacity:0;animation:pop .9s cubic-bezier(.16,1,.3,1) forwards}
  .js .glass.g1{animation-delay:.6s}.js .glass.g2{animation-delay:.75s}.js .glass.g3{animation-delay:.9s}
  @keyframes fade{to{opacity:1}}
  @keyframes lift{to{opacity:1;transform:none}}
  @keyframes pop{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:none}}
  .aurora i{animation:drift 22s ease-in-out infinite alternate}
  .aurora .b{animation-duration:26s;animation-delay:-8s}.aurora .c{animation-duration:30s;animation-delay:-14s}
  @keyframes drift{33%{transform:translate(4vmax,3vmax) scale(1.06)}66%{transform:translate(-3vmax,5vmax) scale(.95)}100%{transform:translate(2vmax,-2vmax) scale(1.03)}}
  .js .reveal{opacity:0;transform:translateY(28px);transition:opacity .8s ease,transform .8s cubic-bezier(.16,1,.3,1)}
  .js .reveal.in{opacity:1;transform:none}
  .js .part{transform:translate(-24px,24px) scale(.94);clip-path:inset(0 100% 0 0 round 22px);transition:opacity .5s,transform .9s cubic-bezier(.2,.8,.2,1),clip-path 1s cubic-bezier(.2,.8,.2,1) .1s}
  .js .flip .part{transform:translate(24px,24px) scale(.94);clip-path:inset(0 0 0 100% round 22px)}
  .js .part.on,.js .flip .part.on{transform:none;clip-path:inset(0 0 0 0 round 22px);animation:float 6s ease-in-out 1.2s infinite}
  @keyframes float{50%{transform:translateY(-8px)}}
  .js .auto .step.on .bar{display:block}
  .js .auto .step.on .bar i{animation:fill var(--dur,6.5s) linear forwards}
  .js .auto.paused .step.on .bar i{animation-play-state:paused}
  @keyframes fill{to{width:100%}}
  .js .multi .step.on .tx{animation:fade .5s both}
  @media (hover:none),(max-width:960px){.aurora i,.js .part.on{animation:none}}
  .tabs .svc.on h3{animation:fade .5s both}
  .tabs .svc.on .items span{opacity:0;animation:chip .5s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(.08s + var(--i,0) * 60ms)}
  @keyframes chip{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
  @supports (interpolate-size:allow-keywords){
    .faq{interpolate-size:allow-keywords}
    .faq details::details-content{height:0;overflow:clip;transition:height .35s cubic-bezier(.16,1,.3,1),content-visibility .35s allow-discrete}
    .faq details[open]::details-content{height:auto}
  }
}

@media (max-width:1180px){
  .ch{grid-template-columns:minmax(0,1fr) 560px}.chapter.flip .ch{grid-template-columns:560px minmax(0,1fr)}
  .vis{--z:.875}
}
@media (max-width:960px){
  .pill-nav .links{display:none}
  /* Hero: the words first, the phone under them. */
  .hero{padding-top:120px}
  .hero .grid{grid-template-columns:1fr;text-align:center}
  .lede{margin-left:auto;margin-right:auto}
  .hero .wl{align-items:center}
  .stage{height:700px;margin-top:24px}
  .glass.g3{display:none}
  .glass.g1{left:max(4px,calc(50% - 300px))}.glass.g2{right:max(4px,calc(50% - 300px))}
  .morning{padding-top:32px}
  /* Chapters: the words, then the phone with its piece over the lower part, then the steps. */
  .chapter{padding-top:110px}
  .ch,.chapter.flip .ch{grid-template-columns:1fr;grid-template-areas:"head" "vis" "steps"}
  .ch .head{padding-top:0}
  .ch .vis-wrap{display:flex;justify-content:center;margin-top:32px}
  .vis{width:440px;height:700px}
  .vis .glow{width:640px;height:640px;margin:-320px 0 0 -320px}
  .vis .device,.flip .vis .device{left:59px;top:0}
  .part,.flip .part{left:30px;width:380px;top:auto!important;bottom:-24px}
  .ch .steps{max-width:none;margin-top:44px}
  .mu,.connect .intro,.faq{grid-template-columns:1fr;gap:32px}
  .muscles,.connect,.privacy,#faq{padding-top:110px}
  .faq .side{position:static}
  .privacy .ink{padding:48px 32px}
}
@media (max-width:560px){
  .wrap{padding:0 16px}
  .nav-cta{height:32px;padding:0 12px;font-size:13px}
  .hero{padding-top:110px}
  .lede,.sub{font-size:18px}
  .stage{height:640px}
  /* On a phone the floating cards would cover the real screen's numbers. */
  .glass{display:none}
  .step .tt{font-size:24px}
  .svc .io{grid-template-columns:1fr;gap:8px}.svc .lbl{padding-top:0}
  .panels{padding:20px}
  .privacy .ink{padding:40px 24px;border-radius:24px}
  .site-foot .top{grid-template-columns:1fr 1fr;gap:28px 20px}.site-foot .brand{grid-column:1/-1}
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
// "Join the waitlist": the button opens an e-mail field; the address waits for the owner, who
// invites people into TestFlight from the app (src/testflight-waitlist.js).
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
const store = id => `<form class="wl" action="/waitlist" method="post" novalidate>
<span class="field"><label class="vh" for="wl-${id}">Your email</label><input id="wl-${id}" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@email.com" required><button type="submit" class="go" aria-label="Join the waitlist">${ARROW}</button></span>
<span class="done" role="status">${CHECK}<span>You're on the list</span></span>
<button type="button" class="share">${SHARE}<span>Know someone who trains? Share Aurin</span></button>
<span class="err" role="alert"></span>
</form>`;

// The page's motion: content fades up as it scrolls in, each chapter's steps take turns on its phone,
// the connections take turns. Without JS everything is simply shown; with reduced motion nothing moves
// on its own and the steps still switch screens when picked.
const siteScript = `<script>(function(){var r=document.documentElement;r.classList.add('js');
var still=matchMedia('(prefers-reduced-motion: reduce)').matches,IO='IntersectionObserver' in window;
if(IO){var hb=document.querySelector('.hero .wl'),sh=document.querySelector('.site-head');if(hb&&sh)new IntersectionObserver(function(es){sh.classList.toggle('away',!es[0].isIntersecting);}).observe(hb);}
if(IO){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.reveal').forEach(function(el){io.observe(el);});}else document.querySelectorAll('.reveal').forEach(function(el){el.classList.add('in');});
// Each chapter's stage is drawn at one size and scaled to the window.
var vis=[].slice.call(document.querySelectorAll('.vis'));
function fit(){var w=innerWidth,z=w<=960?Math.min(1,(w-32)/440):w<=1180?.875:1;vis.forEach(function(v){v.style.setProperty('--z',z.toFixed(3));});}
addEventListener('resize',fit);fit();
// Chapters: a step shows its screen and its demo, and plays the demo while the chapter is in view. Steps take
// turns (the bar under the step fills for the step's time, then the next one comes) until one is picked or a
// demo is touched; a chapter with one step plays it again after its time. With reduced motion every demo shows
// its last frame and nothing turns on its own.
var D=window.AurinDemo;
document.querySelectorAll('.chapter').forEach(function(ch){
 var steps=[].slice.call(ch.querySelectorAll('.step')),scr=[].slice.call(ch.querySelectorAll('.scr')),parts=[].slice.call(ch.querySelectorAll('.part')),cur=0,seen=false,loop=null,multi=ch.classList.contains('multi');
 function units(i){return [scr[i],parts[i]].filter(Boolean);}
 function run(i){units(i).forEach(function(u){if(still||!seen)D.last(u);else D.play(u);});
  clearTimeout(loop);if(!multi&&seen&&!still&&!ch._touched)loop=setTimeout(function(){run(0);},+steps[0].dataset.dur+2500);}
 function show(i){units(cur).forEach(function(u){D.stop(u);});cur=i;
  steps.forEach(function(s,j){var on=j===i;s.classList.toggle('on',on);var b=s.querySelector('button');if(b)b.setAttribute('aria-pressed',on);});
  scr.forEach(function(s,j){s.classList.toggle('on',j===i);});parts.forEach(function(p,j){p.classList.toggle('on',j===i);});run(i);}
 scr.concat(parts).forEach(function(u){if(still)D.last(u);else D.first(u);});
 ch.addEventListener('demo:touch',function(){ch._touched=true;ch.classList.remove('auto');clearTimeout(loop);});
 if(multi)steps.forEach(function(s,i){s.querySelector('button').addEventListener('click',function(){ch.classList.remove('auto');show(i);});
  s.querySelector('.bar i').addEventListener('animationend',function(){if(ch.classList.contains('auto'))show((cur+1)%steps.length);});});
 if(still||!IO){seen=!IO;run(0);return;}
 if(multi)ch.classList.add('auto','paused');
 new IntersectionObserver(function(es){var on=es[0].isIntersecting;ch.classList.toggle('paused',!on);
  if(on&&!seen){seen=true;run(cur);}else if(!on&&seen){seen=false;clearTimeout(loop);units(cur).forEach(function(u){D.last(u);});}},{threshold:.35}).observe(ch.querySelector('.vis-wrap'));});
document.querySelectorAll('form.wl').forEach(function(f){var input=f.querySelector('input'),err=f.querySelector('.err'),busy=false;
 f.addEventListener('submit',function(e){e.preventDefault();if(busy)return;var email=input.value.trim();err.textContent='';
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){err.textContent='Enter a valid email.';input.focus();return;}
  busy=true;fetch('/waitlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})})
  .then(function(r){return r.json().catch(function(){return {};}).then(function(b){if(!r.ok)throw new Error(b.message||'Something went wrong. Try again.');f.classList.add('sent');})})
  .catch(function(x){err.textContent=x.message;}).then(function(){busy=false;});});
 var sh=f.querySelector('.share'),said=sh.querySelector('span');
 sh.addEventListener('click',function(){var link=location.origin+'/';
  if(navigator.share)navigator.share({title:'Aurin',text:'Aurin reads your sleep, HRV and workouts and tells you how hard to train today. Free to test on iPhone:',url:link}).catch(function(){});
  else if(navigator.clipboard)navigator.clipboard.writeText(link).then(function(){said.textContent='Link copied: '+link;});});});
// Connections: a logo shows what Aurin reads from it and sends back; they take turns until one is picked.
var box=document.querySelector('.connect .box');if(!box)return;
var tabs=[].slice.call(box.querySelectorAll('[role=tab]')),cur=0,timer;
function pick(i){cur=i;var pid=tabs[i].id.slice(4);tabs.forEach(function(t,j){var on=j===i,id=t.id.slice(4);t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;
document.getElementById('svc-'+id).classList.toggle('on',on);});box.querySelectorAll('.flow [data-svc]').forEach(function(el){el.classList.toggle('on',el.dataset.svc===pid);});}
var flowEl=box.querySelector('.flow');function ffit(){flowEl.style.setProperty('--fz',(flowEl.clientWidth/(innerWidth<=640?340:1000)).toFixed(4));}
addEventListener('resize',ffit);ffit();
tabs.forEach(function(t,i){t.addEventListener('click',function(){clearInterval(timer);pick(i);});
t.addEventListener('keydown',function(e){var n=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;
if(n){e.preventDefault();clearInterval(timer);pick((i+n+tabs.length)%tabs.length);tabs[cur].focus();}});});
// Pointing at the logos or moving focus into them stops the turns, so what is read stays put.
['mouseenter','focusin'].forEach(function(t){box.addEventListener(t,function(){clearInterval(timer);});});
r.classList.add('tabs');pick(0);if(!still)timer=setInterval(function(){pick((cur+1)%tabs.length);},5200);})();</script>
<script>(function(){
// Muscles: frame k of 72 is the figure turned k·5°; ids.png holds, per frame, which muscle each pixel is
// (a quarter of the size, the index in NAMES). The frames load when the figure comes near.
var fig=document.querySelector('.fig');if(!fig)return;
var N=72,IW=160,IH=250,base=fig.dataset.base,still=matchMedia('(prefers-reduced-motion: reduce)').matches;
var NAMES=['quads','hamstrings','glutes','calves','adductors','abductors','chest','back','lower_back','traps','shoulders','side_delts','rear_delts','biceps','triceps','forearms','core','other','bone'];
var LABEL={quads:'Quads',hamstrings:'Hamstrings',glutes:'Glutes',calves:'Calves',adductors:'Adductors',abductors:'Abductors',chest:'Chest',back:'Back',lower_back:'Lower back',traps:'Traps',shoulders:'Shoulders',side_delts:'Side delts',rear_delts:'Rear delts',biceps:'Biceps',triceps:'Triceps',forearms:'Forearms',core:'Core'};
var TIRED='var(--rust)',RECOVERING='var(--amber)',RESTED=['rested','var(--green)'];
var STATE={glutes:['26 % rested · in 2 days',TIRED],hamstrings:['35 % rested · in 2 days',TIRED],quads:['37 % rested · ≈ in 2 days',TIRED],
 calves:['47 % rested · ≈ tomorrow',TIRED],chest:['61 % rested · today',RECOVERING],back:['61 % rested · today',RECOVERING]};
var cv=fig.querySelector('canvas'),cx=cv.getContext('2d',{willReadFrequently:true}),bub=fig.querySelector('.bubble'),hint=document.querySelector('.muscles .hint'),card=document.querySelector('.muscle-card');
var frames=[],ids=null,cur=0,vel=0,sel=null,spin=!still,drag=null,shown=-1,running=false;
function load(){if(frames.length)return;
 for(var i=0;i<N;i++){var im=new Image();im.decoding='async';im.onload=draw;im.src=base+'f'+(i<10?'0':'')+i+'.webp';frames.push(im);}
 var map=new Image();map.onload=function(){var c=document.createElement('canvas');c.width=map.width;c.height=map.height;var g=c.getContext('2d');g.drawImage(map,0,0);ids=g.getImageData(0,0,c.width,c.height);};map.src=base+'ids.png';}
function at(){return ((Math.round(cur)%N)+N)%N;}
function idAt(k,x,y){return ids?ids.data[((Math.floor(k/9)*IH+y)*ids.width+(k%9)*IW+x)*4]:255;}
// The app dims the other muscles to 62 % and lights the one tapped.
function draw(){var k=at(),im=frames[k];if(!im||!im.complete||!im.naturalWidth)return;shown=k;
 cx.clearRect(0,0,640,1000);cx.drawImage(im,0,0);if(sel===null||!ids)return;
 var d=cx.getImageData(0,0,640,1000),p=d.data;
 for(var y=0;y<1000;y++){var iy=Math.min(IH-1,(y*IH/1000)|0);for(var x=0;x<640;x++){var o=(y*640+x)*4;if(!p[o+3])continue;
  var f=idAt(k,x>>2,iy)===sel?1.25:.62;p[o]*=f;p[o+1]*=f;p[o+2]*=f;}}
 cx.putImageData(d,0,0);}
function close(){sel=null;bub.classList.remove('on');draw();}
function tick(){if(!running)return;
 if(!drag){if(spin)cur+=.12;else{cur+=vel;vel*=.92;}}
 if(at()!==shown){if(sel!==null&&Math.abs(vel)>.05)close();else draw();}
 requestAnimationFrame(tick);}
if('IntersectionObserver' in window)new IntersectionObserver(function(es){var on=es[0].isIntersecting;if(on)load();if(on&&!running){running=true;requestAnimationFrame(tick);}else if(!on)running=false;},{rootMargin:'50% 0px'}).observe(fig);
else{load();running=true;requestAnimationFrame(tick);}
fig.addEventListener('pointerdown',function(e){if(e.target.closest('.bubble'))return;drag={x:e.clientX,c:cur,moved:false};spin=false;vel=0;hint.style.opacity=0;});
addEventListener('pointermove',function(e){if(!drag)return;var dx=e.clientX-drag.x;if(Math.abs(dx)>4)drag.moved=true;
 var next=drag.c-dx/fig.clientWidth*40;vel=(next-cur)*.5;cur=next;if(drag.moved&&sel!==null)close();});
addEventListener('pointerup',function(e){if(!drag)return;var moved=drag.moved;drag=null;if(moved)return;
 var r=cv.getBoundingClientRect(),g=idAt(at(),Math.floor((e.clientX-r.left)/r.width*IW),Math.floor((e.clientY-r.top)/r.height*IH)),name=NAMES[g];
 if(!LABEL[name])return close();
 sel=g;vel=0;draw();var st=STATE[name]||RESTED,f=fig.getBoundingClientRect();
 bub.querySelector('b').textContent=LABEL[name];var t=bub.querySelector('.txt span');t.textContent=st[0];t.style.color=st[1];
 bub.style.left=Math.min(Math.max(e.clientX-f.left,115),f.width-115)+'px';bub.style.top=Math.max(60,e.clientY-f.top-16)+'px';
 bub.dataset.id=name;bub.classList.add('on');});
// The bubble opens the muscle as its detail does in the app: the figure close on it, its name and how rested.
bub.addEventListener('click',function(){var name=bub.dataset.id,st=STATE[name]||RESTED;
 card.querySelector('.zoom').style.backgroundImage='url('+base+'z-'+name+'.webp)';card.querySelector('h3').textContent=LABEL[name];
 var p=card.querySelector('.state');p.textContent=st[0];p.style.color=st[1];card.classList.add('on');card.querySelector('.close').focus();});
function hide(){card.classList.remove('on');close();}
card.addEventListener('click',function(e){if(e.target===card||e.target.closest('.close'))hide();});
addEventListener('keydown',function(e){if(e.key==='Escape'&&card.classList.contains('on'))hide();});
})();</script>`;

// The share image (link previews on X, Facebook, LinkedIn, Slack, iMessage). The networks keep an image
// for days by its URL, so ?v= goes up whenever og-en.png is rendered again.
const SHARE_IMAGE = '/site/og-en.png?v=3';
const SHARE_IMAGE_ALT = 'Aurin: Train for how you feel today. The Today screen with readiness 78.';

function sitePage({title, description, lang, origin, path, body, czech=false, index=true, jsonLd=null}) {
  const self = `${origin}${path}${lang === 'cs' ? '?lang=cs' : ''}`;
  const html = `<!doctype html>
<html lang="${lang}" class="site">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#F3EFE8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${self}">
<meta property="og:site_name" content="Aurin">
<meta property="og:image" content="${origin}${SHARE_IMAGE}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${SHARE_IMAGE_ALT}">
<meta property="og:locale" content="${lang === 'cs' ? 'cs_CZ' : 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@aurin_health">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${origin}${SHARE_IMAGE}">
<meta name="twitter:image:alt" content="${SHARE_IMAGE_ALT}">
<link rel="canonical" href="${self}">
${czech ? `<link rel="alternate" hreflang="en" href="${origin}${path}">\n<link rel="alternate" hreflang="cs" href="${origin}${path}?lang=cs">` : ''}
${index ? '' : '<meta name="robots" content="noindex">'}
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/site/fonts/newsreader.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/site/fonts/instrument-serif.woff2" as="font" type="font/woff2" crossorigin>
<style>${themeTokens}${siteCss}${demoCss}</style>
</head>
<body>
<header class="site-head"><nav class="pill-nav" aria-label="Main">
<a class="logo" href="/">${mark(30)}<span>Aurin</span></a>
<div class="links"><a href="/#pripravenost">Features</a><a href="/#kouc">AI coach</a><a href="/#propojeni">Connections</a><a href="/#soukromi">Privacy</a></div>
<a class="nav-cta" href="/#join">Join the waitlist</a>
</nav></header>
${body}
<footer class="site-foot"><div class="wrap">
<div class="top">
<div class="brand">${mark(40)}<p>Train for how you feel today.</p></div>
<nav aria-label="Aurin"><h3>Aurin</h3><ul><li><a href="/#pripravenost">Features</a></li><li><a href="/#kouc">AI coach</a></li><li><a href="/#propojeni">Connections</a></li></ul></nav>
<nav aria-label="Help"><h3>Help</h3><ul><li><a href="/support">Support</a></li><li><a href="/#faq">Questions</a></li><li><a href="/support#problem">Report a problem</a></li><li><a href="mailto:${CONTACT_EMAIL}">Write to us</a></li></ul></nav>
<nav aria-label="Documents"><h3>Documents</h3><ul><li><a href="/privacy">Privacy Policy</a></li><li><a href="/terms">Terms of Use</a></li><li><a href="/health-data">Consumer Health Data</a></li><li lang="cs">Česky: <a href="/privacy?lang=cs" hreflang="cs">Soukromí</a> · <a href="/terms?lang=cs" hreflang="cs">Podmínky</a></li></ul></nav>
</div>
<div class="base"><span>© 2026 Aurin · run by Petr Bouma, Czech Republic</span><span>Aurin is not a medical device.</span></div>
</div></footer>
${demoScript}
${siteScript}
</body></html>`;
  return new Response(html, {status:200, headers:{'content-type':'text/html; charset=utf-8', 'content-language':lang, 'cache-control':'private, max-age=0, must-revalidate'}});
}

// Pages take the request (to pick the host, and ?lang=cs on the pages that have Czech) or nothing
// (English on aurin.health, for tests).
function pageLang(request, czech = false) {
  if (!request) return {lang: 'en', origin: SITE_ORIGIN};
  // Absolute links (share image, language versions) keep to the host the page is served on.
  const host = new URL(request.url).hostname;
  const lang = czech && new URL(request.url).searchParams.get('lang') === 'cs' ? 'cs' : 'en';
  return {lang, origin: SERVER_HOSTS.has(host) ? `https://${host}` : SITE_ORIGIN};
}

// Google's policies ask the privacy policy to name every party that receives data, how it is stored and
// secured, and what happens on disconnecting and deleting; the support page is the help on managing and
// deleting data. Keep both in step with the code: scopes in google-scopes.js, the wellness copy in
// wellness-sync.js, the download and deletion in account-data.js.
const UPDATED = {cs: '24. října 2026', en: '24 October 2026'};
// The controller's address for questions and data requests (privacy policy and support page).
const CONTACT_EMAIL = 'support@aurin.health';
const API_POLICY = 'https://developers.google.com/terms/api-services-user-data-policy';
const HEALTH_POLICY = 'https://developers.google.com/health/policies/health-api-developer-user-data-policy';
const GOOGLE_CONNECTIONS = 'https://myaccount.google.com/connections';

// The overview follows the app: Today in the hero, one morning said as a sentence, then a chapter per area
// of the app (its words on one side, a phone with its screens on the other), the muscles, the connections,
// privacy and questions. The numbers are one believable morning, the same everywhere.
// Google's app verification reads this disclosure on the homepage. Aurin is not going through Google's
// verification (2026-10-24), so it stays off the overview; before asking Google to verify the app, set this to true.
// The text stays word for word (tests/site-pages.test.mjs).
export const GOOGLE_DISCLOSURE_ON_HOME = false;
export const googleDisclosure = () => `<div class="card disclosure reveal" lang="en"><h3>Google Health data disclosure</h3>
<p>Aurin is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows.</p>
<p>With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p>
<p style="margin:0">The service can process training and fitness data from connected services, including Google Health data that the account owner has authorized, in order to provide these requested workflows.</p>
<p style="margin:12px 0 0">Four optional permissions can be left unticked on Google’s consent screen: adding weight records to Google Health (weight you log in Aurin or Intervals.icu), adding the workouts you finish in Aurin to Google Health, reading the GPS route of a workout to show its map, and reading your date of birth from your Google Account to fill in your age.</p>
<p style="margin:12px 0 0">Aurin’s use and transfer to any other app of information received from Google APIs will adhere to the <a href="${API_POLICY}">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
<p style="margin:12px 0 0">The use of information received from Google Health API and/or Developer Tools will adhere to the <a href="${HEALTH_POLICY}">Google Health API Developer and User Data Policy</a>, including the Limited Use requirements.</p></div>`;

export function overviewPage(request) {
  const {lang, origin} = pageLang(request);
  // A screen of the app: a screenshot taken in CI from the sample data (public/site/app/).
  const shot = (name, lazy = true) => `<img src="/site/app/${name}.webp" alt="" width="600" height="1305"${lazy ? ' loading="lazy" decoding="async"' : ' fetchpriority="high"'}>`;
  // The chapters, one per area of the app: [section id, eyebrow, headline, line, tone, glow, steps]. Each step is
  // [the phone's screen, the live demo beside it (site-demos.js), how far down the stage, title, text, ms it
  // shows]. A screen is the app's screenshot (public/site/app/), or "html:" and a screen built in site-demos.js
  // where the screenshot cannot show the step (a moving screen, or one the sample day draws wrong).
  const scenes = [
    ['spanek', 'Sleep', 'Every night, in detail.', 'From any watch or ring you wear.', 'indigo', 'glow-health', [
      ['sleep', 'sleepNight', 300, 'See how you slept.', 'Deep, REM and light sleep, when you fell asleep and when you woke up.'],
      ['sleep-need', 'sleepNeed', 150, 'Know what you need tonight.', 'Your sleep need grows with a hard day and with the debt from the week, and you see why.'],
      ['bedtime', 'dial', 40, 'Plan your bedtime.', 'Turn the moon and the sun on the dial, here too. Aurin tells you when to go to bed to wake up rested.', 9500],
      ['bedtime-goal', 'tonight', 220, 'Catch up when you need to.', 'Pick how much you want tonight: catch up, as usual or at least seven hours, and your bedtime follows.', 9000]]],
    ['pripravenost', 'Readiness', 'One number every morning.', 'HRV, resting heart rate and sleep, weighed against your own normal.', 'green', 'glow-today', [
      ['readiness-parts', 'readyParts', 70, 'See what’s behind it.', 'Sleep, resting heart rate and HRV each add or take points, against your own normal.', 7000],
      ['journal-impact', 'journal', 110, 'Learn what helps you.', 'The journal fills in what it can from your data. Tick off a sauna, a late meal or alcohol and see what each does to your mornings.', 7000]]],
    ['zatez', 'Strain', 'Know when to push.', 'Every workout and every step adds up.', 'amber', 'glow-training', [
      ['html:strain', 'strainMade', 200, 'A target for today.', 'Aurin shows where today’s strain should land, from your readiness, sleep debt and plan, and what fills it.', 7000]]],
    ['trenink', 'Training', 'A plan that adapts.', 'An activity for every day, picked for how you recovered.', 'green', 'glow-today', [
      ['training', 'week', 150, 'Your week at a glance.', 'Follow a training plan for a race, from 5 km to a marathon, a gran fondo or a time trial, with your goal time and race-day power, or a strength plan for the gym or for home. Or plan the week yourself or let the AI do it, each workout with its intervals drawn out, and sync it with Intervals.icu. Turn on your iPhone calendar and a busy day gets a shorter workout, with the plan written into the free time. Take one session out and keep the rest, or have the week recalculated. When your readiness and the load ahead add up to too much, the coach proposes moving, easing or dropping a session. A finished workout shows how much of the plan you did, 92 % or 140 %, with where it came from, and the same workout done before beside it, watts or pace against heart rate. On a hot day a ride or run outdoors says how to adjust it. The month is a pull away.', 8000]]],
    ['posilovna', 'Gym', 'A workout made for today.', 'From your rested muscles, your time and your gym.', 'amber', 'glow-training', [
      ['builder', 'builder', 200, 'Say how long and what.', 'Pick the day, the length and the focus. Aurin knows which muscles are rested and builds the workout only from the equipment your gym has.', 8500],
      ['gym-day', 'gymParts', 150, 'Warm-up to stretching.', 'Switch the warm-up, cardio and stretching on or off, and move them into the order you like. Then start.', 7000]]],
    ['rezim', 'Training mode', 'Log every set in a tap.', 'Weights from last time, a rest timer and your summary.', 'green', 'glow-today', [
      ['training-mode', 'tmTable', 140, 'Your weights, ready.', 'Every set is filled in with its weight and reps. Change them, add or remove a set, swap an exercise when its machine is taken, keep your own note on how to set it up, and start.', 6000],
      ['training-set', 'tmTick', 380, 'Tick off every set.', 'One tap marks a set done. A letter says how hard it was, from warm-up to failure and drop sets.', 6000],
      ['training-rest', 'tmRest', 120, 'Rest on time.', 'The timer starts by itself, as long as the exercise needs, longer after squats than after curls. It stays on your lock screen and shows what comes next. The last seconds count down with a vibration you feel even with the phone on the bench, or a tone if you like.', 13500],
      ['html:done', 'tmDone', 250, 'See what you lifted.', 'Time, sets, volume and new records when you finish, saved to Apple Health. Then say how it went.', 6000]]],
    ['vyziva', 'Nutrition', 'Eat for the day you’re having.', 'Your target moves with your training.', 'amber', 'glow-food', [
      ['food-day', 'foodTarget', 120, 'A target that moves.', 'Train harder and you get more to eat. The coach says what that means for your next meal.', 7500],
      ['food-add', 'foodAdd', 100, 'Snap, scan or search.', 'Take a photo of your plate, scan a barcode or search, set the portion your way, and log drinks with one tap.', 8000]]],
    ['kouc', 'AI coach', 'Just ask. It knows your data.', 'It remembers what you tell it, and you can see and edit what it remembers.', 'green', 'glow-today', [
      ['html:coach', 'coachWeek', 520, 'Answers from your numbers.', 'Ask how to train today, how to adjust your week or what to eat before a workout, or send a photo of a plan from your trainer. Tap Coach on a workout, an exercise or your HRV to ask about just that, or reply straight from its notification. When it proposes a workout, confirm it and it lands in your plan.', 15000]]]];
  // A chapter: the words, the phone with a screen and a lifted piece per step, and the steps. Sides
  // alternate. Steps of a chapter with more than one are buttons that switch the phone's screen.
  const chapter = ([id, eyebrow, h, p, tone, glow, list], n) => {
    const multi = list.length > 1;
    const subs = p.split('<span class="free">').map((t, j) => `<p class="sub${j ? ' free' : ''}">${t.replace('</span>', '')}</p>`).join('');
    const body = ([, , , title, text], i) => `<span class="n">0${i + 1}</span><span class="tt">${title}</span><span class="tx">${text}</span>`;
    const steps = list.map((x, i) => `<li class="step${i === 0 ? ' on' : ''}" style="--dur:${x[5] || 6500}ms" data-dur="${x[5] || 6500}">${multi
      ? `<button type="button" aria-pressed="${i === 0}">${body(x, i)}<span class="bar" aria-hidden="true"><i></i></span></button>`
      : `<div>${body(x, i)}</div>`}</li>`).join('');
    return `<section id="${id}" class="chapter${n % 2 ? ' flip' : ''}${multi ? ' multi' : ''}" style="--tone:var(--${tone});--glow:var(--${glow})"><div class="wrap ch">
<div class="head reveal"><div class="eyebrow">${eyebrow}</div><h2 class="big">${h}</h2>${subs}</div>
<div class="vis-wrap"><div class="vis"><div class="glow"></div>
<div class="device" aria-hidden="true"><div class="bezel"><div class="screen">${list.map(([screen], i) => `<div class="scr${i === 0 ? ' on' : ''}">${screen.startsWith('html:') ? SCREENS[screen.slice(5)] : shot(screen)}</div>`).join('')}</div></div></div>
${list.map(([, demo, top], i) => `<div class="part${i === 0 ? ' on' : ''}" style="top:${top}px"${demo === 'dial' ? '' : ' aria-hidden="true"'}>${DEMOS[demo]}</div>`).join('')}
</div></div>
<ol class="steps">${steps}</ol>
</div></section>`;
  };
  // Muscles sit between training mode and food, as Svaly sits under Trénink in the app. The bubble's
  // words are the sample day's (DemoData.muscles), in English.
  const muscles = `<section id="svaly" class="muscles"><div class="wrap mu">
<div class="copy reveal"><div class="eyebrow">Muscles</div><h2 class="big">Know what’s recovered.</h2><p class="sub">From the gym and from your runs and rides. Turn the figure and tap a muscle.</p>
<div class="key" aria-hidden="true"><span style="--c:var(--rust)"><i></i>Tired</span><span style="--c:var(--amber-bar)"><i></i>Recovering</span><span style="--c:color-mix(in srgb,var(--text) 22%,var(--bg))"><i></i>Rested</span></div>
<p class="hint">Drag to turn · tap a muscle</p></div>
<div class="fig" data-base="/site/muscles/"><canvas width="640" height="1000" role="img" aria-label="Aurin’s 3D figure of the muscles: legs and glutes tired, chest and back recovering, the rest rested"></canvas><button type="button" class="bubble"><span class="txt"><span class="vh">Muscle: </span><b></b><span></span></span><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button></div>
</div></section>
<div class="muscle-card" role="dialog" aria-modal="true" aria-label="Muscle"><div class="card"><button type="button" class="close" aria-label="Close">×</button><div class="zoom"></div><h3></h3><p class="state"></p></div></div>`;

  // Connections: what Aurin reads from each service and what it sends back, as the app's connect
  // sheet says it (SettingsConnectFlow.swift, SyncViews.swift). Each logo is the app's own file.
  const services = [
    {id: 'apple', name: 'Apple Health', logo: '<img src="/site/logos/apple-health.png" alt="" width="40" height="40">',
      reads: [['moon', 'sleep'], ['bike', 'workouts'], ['heart', 'heart rate'], ['training', 'HRV'], ['steps', 'steps'], ['scale', 'weight']],
      sends: [['bike', 'workouts'], ['scale', 'weight'], ['meal', 'food'], ['drop', 'water']]},
    {id: 'google', name: 'Google Health', logo: '<img src="/site/logos/google-health.png" alt="" width="40" height="40" class="pad">',
      reads: [['moon', 'sleep'], ['bike', 'workouts'], ['heart', 'heart rate'], ['training', 'HRV'], ['steps', 'steps'], ['meal', 'food']],
      sends: [['meal', 'food'], ['drop', 'drinks'], ['bike', 'workouts, if you allow'], ['scale', 'weight, if you allow']]},
    {id: 'intervals', name: 'Intervals.icu', logo: '<img src="/site/logos/intervals.svg" alt="" width="40" height="40">',
      reads: [['bolt', 'workouts with power'], ['calendar', 'plan'], ['zones', 'zones'], ['scale', 'weight']],
      sends: [['calendar', 'planned workouts'], ['flame', 'calorie target'], ['scale', 'weight'], ['training', 'sleep, HRV and daily values']]},
    {id: 'ultrahuman', name: 'Ultrahuman Ring', logo: '<span class="uh-tile"><img src="/site/logos/ultrahuman.svg" alt="" width="40" height="40"></span>',
      reads: [['moon', 'sleep'], ['heart', 'resting heart rate'], ['training', 'HRV'], ['wind', 'VO₂max'], ['thermo', 'temperature']], sends: [], none: 'nothing, Aurin only reads the ring'},
    {id: 'whoop', name: 'WHOOP', logo: '<img src="/site/logos/whoop.svg" alt="" width="40" height="40">',
      reads: [['moon', 'sleep'], ['heart', 'resting heart rate'], ['training', 'HRV'], ['wind', 'breathing rate'], ['drop', 'blood oxygen']], sends: [], none: 'nothing, Aurin only reads WHOOP'},
    {id: 'wahoo', name: 'Wahoo', logo: '<span class="uh-tile word"><img src="/site/logos/wahoo.png" alt="" width="40" height="40"></span>',
      reads: [['bike', 'finished rides and runs'], ['bolt', 'power and TSS'], ['heart', 'heart rate']],
      sends: [['calendar', 'planned workouts, to ELEMNT and KICKR']]}];
  // The flow: each service on the left sends what Aurin reads along a curve into the mark, and what Aurin sends
  // back runs out to the services on the right that take it. Two layouts: wide (left to right) for computers,
  // tall (top to bottom) for phones. The things carried are chips that travel the curves (CSS offset-path); the
  // services take turns being lit, and picking one keeps it lit and shows its panel below.
  const senders = services.filter(x => x.sends.length);
  const FLOW = {
    wide: {w: 1000, h: 440, core: [500, 220], src: i => [210, 62 + i * 64], dst: j => [790, 92 + j * 86],
      into: ([x, y], [cx, cy]) => `M${x + 42} ${y}C${(x + cx) / 2} ${y} ${(x + cx) / 2} ${cy} ${cx - 58} ${cy}`,
      out: ([cx, cy], [x, y]) => `M${cx + 58} ${cy}C${(x + cx) / 2} ${cy} ${(x + cx) / 2} ${y} ${x - 42} ${y}`},
    tall: {w: 340, h: 660, core: [170, 330], src: i => [60 + (i % 3) * 110, 52 + Math.floor(i / 3) * 104], dst: j => [47 + j * 82, 606],
      into: ([x, y], [cx, cy]) => `M${x} ${y + 40}C${x} ${(y + cy) / 2 + 20} ${cx} ${(y + cy) / 2} ${cx} ${cy - 56}`,
      out: ([cx, cy], [x, y]) => `M${cx} ${cy + 56}C${cx} ${(y + cy) / 2} ${x} ${(y + cy) / 2 - 20} ${x} ${y - 40}`}};
  const pct = (v, all) => (v / all * 100).toFixed(2) + '%';
  const flowPaths = kind => { const L = FLOW[kind]; return {
    into: services.map((x, i) => L.into(L.src(i), L.core)),
    out: senders.map((x, j) => L.out(L.core, L.dst(j)))}; };
  const travel = (d, items, cls, id, kind) => items.slice(0, 3).map(([name, label], k, all) =>
    `<span class="pk ${cls} ${kind}" data-svc="${id}" style="offset-path:path('${d}');animation-delay:${(-k * 4.4 / all.length - (id.length % 3) * .6).toFixed(2)}s">${icon(name)}${label}</span>`).join('');
  const layer = kind => { const L = FLOW[kind], P = flowPaths(kind);
    return `<svg class="lines ${kind}" viewBox="0 0 ${L.w} ${L.h}" aria-hidden="true">${services.map(({id}, i) => `<path data-svc="${id}" class="in" d="${P.into[i]}"/>`).join('')}${senders.map(({id}, j) => `<path data-svc="${id}" class="out" d="${P.out[j]}"/>`).join('')}</svg>
<div class="pks ${kind}" aria-hidden="true">${services.map(({id, reads}, i) => travel(P.into[i], reads, 'in', id, kind)).join('')}${senders.map(({id, sends}, j) => travel(P.out[j], sends, 'out', id, kind)).join('')}</div>`; };
  const nodes = services.map(({id, name, logo}, i) => { const [x, y] = FLOW.wide.src(i), [mx, my] = FLOW.tall.src(i);
    return `<button type="button" role="tab" class="node" id="tab-${id}" aria-controls="svc-${id}" aria-selected="${i === 0}" style="--x:${pct(x, 1000)};--y:${pct(y, 440)};--mx:${pct(mx, 340)};--my:${pct(my, 660)}"><span class="logo-tile">${logo}</span><span class="nm">${name}</span></button>`; }).join('');
  const backs = senders.map(({id, name, logo}, j) => { const [x, y] = FLOW.wide.dst(j), [mx, my] = FLOW.tall.dst(j);
    return `<span class="dst" data-svc="${id}" style="--x:${pct(x, 1000)};--y:${pct(y, 440)};--mx:${pct(mx, 340)};--my:${pct(my, 660)}" aria-hidden="true"><span class="logo-tile">${logo}</span><span class="nm">${name}</span></span>`; }).join('');
  const flow = `<div class="flow"><div class="fc">
${layer('wide')}${layer('tall')}
<span class="col-l">Into Aurin</span><span class="col-r">Sent back</span>
<div class="core" aria-hidden="true">${mark(56)}</div>
<div role="tablist" aria-label="Connected services">${nodes}</div>${backs}
</div></div>`;
  const chips = items => `<div class="items">${items.map(([name, label], i) => `<span style="--i:${i}">${icon(name)}${label}</span>`).join('')}</div>`;
  const panels = services.map(({id, name, reads, sends, none}, i) => `<div class="svc${i === 0 ? ' on' : ''}" id="svc-${id}" role="tabpanel" aria-labelledby="tab-${id}">
<h3>${name}</h3>
<div class="io"><div class="lbl in">${icon('down')}Into Aurin</div>${chips(reads)}</div>
<div class="io"><div class="lbl out">${icon('up')}Sent back</div>${sends.length ? chips(sends) : `<div class="none">${none}</div>`}</div>
</div>`).join('');

  const faq = [
    ['Do I need an Apple Watch?', 'No. Aurin works with any watch or ring that saves to Apple Health or Google Health, such as Apple Watch, Fitbit, Pixel Watch or Garmin. The Ultrahuman Ring, WHOOP and Wahoo connect directly.'],
    ['Which phones does Aurin run on?', 'Aurin is an iPhone app. Google Health data comes through your Google account, so a Fitbit or a Pixel Watch works with it too.'],
    ['What does it cost?', 'Nothing during testing. The price after the release is not set yet; you will see it in the App Store before you buy, and Apple handles the purchase.'],
    ['I wear more than one device. Which one counts?', 'For your nights, Aurin uses the device you wore most nights in the last 30 days, and the others only fill the nights it missed. Your day is put together hour by hour from whichever device measured that hour. You can also pick the source yourself in Settings → Data sources → Where to take data from.'],
    ['What does the AI coach see?', 'Only the data the question needs, when you use an AI feature such as the coach or a food photo. It goes to OpenAI, which does not use it to train its models. <a href="/privacy">More in the privacy policy</a>.'],
    ['Can I delete my data?', 'Yes. In Settings → Privacy &amp; data you can download all your data or delete your account with everything in it.'],
    ['Is Aurin a medical device?', 'No. Aurin helps you plan training, food and rest. It does not diagnose or treat anything, so if you feel unwell, see a doctor.'],
    ['Something doesn’t work. What now?', `In the app, open Settings → Help → Report a problem and send it with diagnostics attached, or write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.`],
    ['I’m missing something in Aurin. Can I suggest it?', 'Yes. In the app, open Settings → Help → Suggest a feature, write what would help you and send it.']]
    .map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n');
  const headline = 'Train for how you feel today.';
  const aurora = '<div class="aurora" aria-hidden="true"><i class="a"></i><i class="b"></i><i class="c"></i></div>';
  // The sample morning (DemoData.swift) the hero phone shows; the sentence under the hero says the same.
  const day = {readiness: 78, hrv: 64, hrvBaseline: 58, sleep: '7:12', sleepScore: 82};

  const description = 'Aurin for iPhone reads sleep, HRV and workouts from Apple Health and Google Health, shows your readiness each morning and plans training and food.';
  // What search engines read about the app (schema.org); the overview text says the same.
  const jsonLd = {'@context': 'https://schema.org', '@graph': [
    {'@type': 'SoftwareApplication', name: 'Aurin', url: origin, description, applicationCategory: 'HealthApplication',
     operatingSystem: 'iOS', image: `${origin}${SHARE_IMAGE}`, screenshot: `${origin}/site/app/today.webp`,
     offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/PreOrder', description: 'Free test version in TestFlight'},
     publisher: {'@id': `${origin}/#org`}},
    {'@type': 'Organization', '@id': `${origin}/#org`, name: 'Aurin', url: origin, logo: `${origin}/logo.svg`,
     email: CONTACT_EMAIL, sameAs: ['https://x.com/aurin_health']},
    {'@type': 'WebSite', url: origin, name: 'Aurin', inLanguage: 'en', publisher: {'@id': `${origin}/#org`}}]};

  return sitePage({lang, origin, path: '/', jsonLd,
    title: 'Aurin · train for how you feel today',
    description,
    body: `<main>
<div class="hero">${aurora}
<div class="wrap grid">
<div class="copy">
<span class="kicker"><i></i>For iPhone · now in TestFlight</span>
<h1 aria-label="${headline}">${headline.split(' ').map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ')}</h1>
<p class="lede">Aurin reads your sleep, HRV and workouts and turns them into one number, one plan and one coach every morning.</p>
<div class="cta">${store('top')}<p class="note">We invite people to the test version in TestFlight. Testing costs nothing.</p></div>
</div>
<div class="stage">
<div class="glass g1" aria-hidden="true"><div class="k">HRV</div><div class="v">${day.hrv} ms</div><div class="d up">↑ ${day.hrv - day.hrvBaseline} ms above normal</div></div>
<div class="glass g2" aria-hidden="true"><div class="k">Sleep</div><div class="v">${day.sleep}</div><div class="d sleep">score ${day.sleepScore}</div></div>
<div class="glass g3" aria-hidden="true"><div class="k">Coach</div><div style="margin-top:4px">Go all in on strength today.</div></div>
<div class="device" role="img" aria-label="Aurin on a phone: the Today screen with readiness ${day.readiness}, how you feel, the weather, sleep, strain and HRV"><div class="bezel"><div class="screen" aria-hidden="true"><div class="scr on">${shot('today', false)}</div></div></div></div>
</div>
</div>
</div>

<section class="morning"><div class="wrap reveal"><div class="eyebrow">One morning with Aurin</div>
<p class="say">You slept <b class="sleep">${day.sleep}</b>, your HRV is <b class="up">${day.hrv - day.hrvBaseline} ms above normal</b> and your readiness is <b class="up">${day.readiness}</b>. So the coach says: <em>go all in on strength today.</em></p>
</div></section>

${scenes.slice(0, 6).map(chapter).join('\n')}
${muscles}
${scenes.slice(6).map((s, i) => chapter(s, i + 6)).join('\n')}

<section id="propojeni" class="connect"><div class="wrap">
<div class="intro reveal"><div><div class="eyebrow">Connections</div><h2 class="big">Works with what you wear.</h2></div><p class="sub">Any watch or ring that saves to Apple Health or Google Health, plus power and plans from Intervals.icu. Wear more than one? Aurin takes each night and day from the one you wear most, or you pick.</p></div>
<div class="box reveal">
${flow}
<div class="legend" aria-hidden="true"><span><i class="in"></i>Into Aurin</span><span><i class="out"></i>Sent back</span><span class="tip">Pick a service to see what it carries</span></div>
<div class="panels">${panels}</div>
</div>
</div></section>

<section id="soukromi" class="privacy"><div class="wrap">
<div class="ink reveal">${LOCK}<p class="big">Your data works only for you. Aurin reads only what you allow, never sells it or uses it for ads, and you can delete all of it in Settings at any time.</p>
<a class="more" href="/privacy">Read the privacy policy <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></a></div>
${GOOGLE_DISCLOSURE_ON_HOME ? googleDisclosure() : ''}
</div></section>

<section id="faq"><div class="wrap faq">
<div class="side reveal"><h2 class="big">Questions</h2><p>Something else? Write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p></div>
<div class="list">
${faq}
</div>
</div></section>

<section class="final">${aurora}<div class="wrap reveal" id="join">
${mark(120)}
<h2>Aurin</h2>
<p class="sub">Leave your email and we’ll invite you to try Aurin on your iPhone.</p>
${store('end')}
</div></section>
</main>`
  });
}

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
<p><strong>Aurin</strong> (formerly Loadwise, aurin.health) is a personal service for training, recovery and nutrition. The controller of your personal data is Petr Bouma, a private individual in the Czech Republic (the operator, “we” below). You can reach the operator at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.${open ? '' : ' Aurin is currently in testing: access is by invitation to the testers from the waitlist, through Apple’s TestFlight.'}</p>
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
<p>Four permissions are optional and can be left unticked on Google’s consent screen: reading your date of birth from your Google Account, to fill in your age, reading the GPS route of a workout, to show its map, writing your weight to Google Health, and writing the workouts you finish in Aurin to Google Health.</p>
<p><strong>Intervals.icu</strong>, only if you connect it: your activities and their details, planned workouts and events, wellness data and sport settings.</p>
<p><strong>Ultrahuman</strong>, only if you connect your Ultrahuman Ring: your sleep and its stages, heart rate variability, resting heart rate, skin temperature deviation and VO2max, to work out your readiness. Aurin only reads this data and deletes it when you disconnect the ring. It does not pass it on to other services, except that an AI feature you use sends OpenAI the part of it that the request needs (see below). It is never sold or used to train AI models.</p>
<p><strong>WHOOP</strong>, only if you connect your WHOOP account: your sleep and its stages, resting heart rate, heart rate variability, breathing rate and blood oxygen, to work out your readiness. Aurin only reads this data and deletes it when you disconnect WHOOP. It does not pass it on to other services, except that an AI feature you use sends OpenAI the part of it that the request needs (see below). It is never sold or used to train AI models.</p>
<p><strong>Wahoo</strong>, only if you connect your Wahoo account: your finished rides and runs (start, duration, distance, climbing, power, training load, heart rate, cadence and calories), to count them in your training load. Aurin deletes them when you disconnect Wahoo.</p>
<p><strong>The calendar on your iPhone</strong>, only if you turn on Read calendar: the app reads your events on the phone and sends us only the number of minutes free for training on each day of the next two weeks, never the events, their names or times. We keep these numbers for up to a week after the day and delete them when you turn reading off. If you turn on Add workouts, the app writes your planned workouts into the calendar on your phone.</p>
<p><strong>What you enter in Aurin:</strong> your profile (such as age, height, weight, sports, goals and the time you have for training), food and drinks, workouts and how they went, notes, your journal answers (such as alcohol, caffeine, sauna or how you felt), and your conversations with the assistant. A photo you send the coach goes to OpenAI with that one message (see below) and is not stored; the conversation keeps only a note that a photo was there. We count the messages you send the coach each week, to keep the service fair for everyone.</p>
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
<li>We write to Google Health only the food and drinks you log in Aurin and, if you allow it, the weight you record in Aurin or Intervals.icu and the workouts you finish in Aurin.</li>
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
<li>Writing to Apple Health, only if you turn it on (Settings → Data sources → Apple Health): workouts you log in Aurin and, for the types you choose, the weight you type in, the day’s food (energy, protein, carbohydrates and fat) and water. iOS asks your permission for each type, and you can turn writing off in the same place or in the iPhone Settings → Health → Data Access &amp; Devices → Aurin. What Aurin wrote stays in Apple Health when you delete your account.</li>
<li>Apple Health data goes only to our server and, for features you use, to the services under “Who receives your data”. We do not sell it, do not use or share it for advertising, and do not give it to data brokers.</li>
<li>You change or remove access in the iPhone Settings → Health → Data Access & Devices → Aurin. Data already synced is deleted with your account.</li>
</ul>
<h2>Who receives your data</h2>
<ul>
<li><strong>Intervals.icu</strong>, if you connect it: the workouts you plan in Aurin, the workouts you finish in Aurin, workouts from Apple Health that no other service has brought there (type, time, distance, heart rate and calories), nutrition notes and calorie targets in your calendar, your weight, and several times a day a copy of your daily wellness from Google Health and Apple Health (sleep, average sleeping heart rate, steps, resting heart rate, HRV, oxygen saturation, respiration, VO2 max and body fat). Intervals.icu handles this data under its own privacy policy.</li>
<li><strong>Wahoo</strong>, if you connect it: the rides and runs you plan in Aurin, with their steps and targets, so they appear on your ELEMNT and KICKR. Wahoo handles this data under its own privacy policy.</li>
<li><strong>Google Health</strong>: the food and drinks you log and, if you allow it, your weight and the workouts you finish in Aurin.</li>
<li><strong>OpenAI</strong> (USA), when you use an AI feature (such as the assistant, recognizing food from a photo, label or description, plan reviews, workout reflections or exercise descriptions): the data that request needs, such as your message, the photo and related training, sleep, health and nutrition data, including data from a connected Ultrahuman Ring or WHOOP. OpenAI processes it on our behalf under its API data processing terms: it does not use data sent through its API to train its models and keeps it for up to 30 days to detect abuse, unless the law requires it to keep it longer.</li>
<li><strong>Cloudflare</strong> runs Aurin, stores its database in Europe and keeps the technical logs.${email ? ' Its Email Service sends the sign-in codes and the notices about new passkeys.' : ''}</li>
<li><strong>Apple</strong>, if you allow notifications (Settings → Notifications): your iPhone’s notification token and the text of each notification, such as the morning readiness or a note from the coach, which Apple’s push service delivers to your iPhone. Turning notifications off or signing out removes the token.</li>
<li><strong>Apple</strong>, when we add you to the testers from the waitlist: your email address, so that TestFlight emails you how to install Aurin. Apple handles it under its own privacy policy.</li>
<li><strong>Open-Meteo</strong> gets only the place you choose for the weather in your training plan: a place you search for, or your location rounded to about 1 km if you allow it. Without that the app shows no weather.</li>
<li><strong>Authorities</strong>, only when the law requires it.</li>
</ul>
<p>When you scan a barcode or a food label without AI, or pick a photo with a barcode, the image is processed on your device. Exercise photos are loaded from GitHub (the Free Exercise DB), and where an exercise has none, a still from its video is loaded from YouTube; these services see only your IP address and which image is loaded. Exercise videos are embedded from YouTube in privacy-enhanced mode, and YouTube receives more data only when you play a video.</p>
<p><strong>Food database.</strong> Food search uses a catalogue stored with Aurin (your searches are not sent anywhere else), made from open data: Open Food Facts (© Open Food Facts contributors, <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>), USDA FoodData Central (public domain), Fineli by THL (CC BY 4.0), Ciqual by Anses (Licence Ouverte / CC BY 4.0) and CoFID by Public Health England (Open Government Licence 3.0). The catalogue as a database is available under the ODbL; values are as the sources give them and are not checked against every label.</p>
<p>Some of these providers are based in the United States. Where data leaves the European Union, they protect it with the safeguards the GDPR requires: the EU–US Data Privacy Framework where the provider is certified under it, and otherwise the EU Standard Contractual Clauses.</p>
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
<li>So that deleting an account and signing up again does not reset the AI features’ usage limits, we keep after deletion only keyed hashes of your e-mail address and of the Apple or Google account you signed in with, together with how much of the limits you used this week and this month. A new account with the same e-mail, Apple or Google account continues from there. This record is deleted once that week and month are over, within at most about five weeks.</li>
<li>To stop using a passkey, delete it from your iPhone or password manager. Deleting your account removes all your passkeys from Aurin.</li>
<li>Data that Aurin copied to Intervals.icu or Google Health stays there; you can delete it in those services.</li>
<li>You can also remove Aurin’s access at any time in your Google Account under <a href="${GOOGLE_CONNECTIONS}">Third-party apps and services</a>. Aurin then can no longer read or write your Google data.</li>
${apple ? '<li>You can stop using Sign in with Apple for Aurin in your Apple ID settings.</li>' : ''}
<li>Technical logs are kept for a few days, and OpenAI keeps AI requests for up to 30 days under its API terms.</li>
<li>An address on the waitlist stays there until testing ends, or until you ask us to remove it at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
</ul>
<p>The <a href="/support">Support</a> page explains step by step how to manage and delete your data.</p>
<h2>Legal bases and your rights</h2>
<p>We process your data to provide the service you asked for (Article 6(1)(b) GDPR). Health data, from Google Health, Apple Health, Intervals.icu, Ultrahuman, WHOOP, Wahoo or entered by you, is processed only with your explicit consent (Article 9(2)(a) GDPR). You give it in the app before you first use it, and we record when and to which version of this text; syncing of your connected services in the background also runs only after it. Sending the data an AI feature needs to OpenAI takes a separate explicit consent (Article 9(2)(a) GDPR): a checkbox of its own when you start, or later in the app (for example “Allow AI” in the coach). Without it Aurin sends nothing to OpenAI and the rest of Aurin keeps working. You withdraw it at any time in Settings → Privacy &amp; data → AI features. Your email on the waitlist is processed at your request, as a step before using Aurin (Article 6(1)(b) GDPR). You withdraw your consent by deleting your account in Settings → Privacy &amp; data, where you can first download all your data; disconnecting a service stops new data from it. Withdrawing does not affect processing before it. Technical logs rely on our legitimate interest in a secure service (Article 6(1)(f) GDPR).</p>
<p>You have the right to access, correct and delete your data, to restrict or object to its processing and to receive it in a portable format. Most of this you can do directly in the app: in Settings → Privacy &amp; data you can download all your data as a JSON Lines (NDJSON) file or delete your account. You can also lodge a complaint with the Czech Office for Personal Data Protection (<a href="https://uoou.gov.cz">uoou.gov.cz</a>). Aurin makes no decisions about you with legal or similarly significant effects by automated means alone; the coach’s proposals wait for your confirmation.</p>
<h2>Children</h2>
<p>Aurin is not intended for children under 16, and we do not knowingly collect their data.</p>
<h2>Changes</h2>
<p>We update this policy when Aurin or the way it uses data changes, and publish the current version on this page with its date. Before we use data you have already given us in a new way, we ask for your consent.</p>
<h2>Contact</h2>
<p>For questions about this policy or your data, or to exercise your rights, write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>`,
    cs: `<p class="muted">Poslední změna: ${UPDATED.cs}</p>
<p><strong>Aurin</strong> (dříve Loadwise, aurin.health) je osobní služba pro trénink, regeneraci a výživu. Správcem tvých osobních údajů je Petr Bouma, soukromá osoba v České republice (dále provozovatel nebo „my“). Provozovatele zastihneš na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.${open ? '' : ' Aurin je zatím v testování: přístup dostávají pozvaní testeři z waitlistu přes TestFlight od Applu.'}</p>
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
<p>Čtyři oprávnění jsou nepovinná a na stránce Googlu se souhlasem je můžeš nezaškrtnout: čtení data narození z tvého účtu Google, aby se doplnil věk, čtení trasy GPS tréninku, aby se ukázala jeho mapa, zápis váhy do Google Health a zápis tréninků, které v Aurinu dokončíš, do Google Health.</p>
<p><strong>Intervals.icu</strong>, jen když ho připojíš: tvoje aktivity a jejich podrobnosti, plánované tréninky a události, wellness údaje a nastavení sportů.</p>
<p><strong>Ultrahuman</strong>, jen když připojíš prsten Ultrahuman: tvůj spánek a jeho fáze, variabilitu srdečního tepu, klidový tep, odchylku teploty kůže a VO2max, z nichž počítáme připravenost. Aurin tato data jen čte a po odpojení prstenu je smaže. Jiným službám je nepředává, jen AI funkce, kterou použiješ, pošle společnosti OpenAI tu část, kterou daný požadavek potřebuje (viz níže). Data nikdy neprodáváme ani je nepoužíváme k trénování modelů AI.</p>
<p><strong>WHOOP</strong>, jen když připojíš účet WHOOP: tvůj spánek a jeho fáze, klidový tep, variabilitu srdečního tepu, dechovou frekvenci a okysličení krve, z nichž počítáme připravenost. Aurin tato data jen čte a po odpojení WHOOPu je smaže. Jiným službám je nepředává, jen AI funkce, kterou použiješ, pošle společnosti OpenAI tu část, kterou daný požadavek potřebuje (viz níže). Data nikdy neprodáváme ani je nepoužíváme k trénování modelů AI.</p>
<p><strong>Wahoo</strong>, jen když připojíš účet Wahoo: tvoje dokončené jízdy a běhy (začátek, délku, vzdálenost, převýšení, výkon, tréninkovou zátěž, tep, kadenci a kalorie), aby se započítaly do tréninkové zátěže. Aurin je po odpojení Wahoo smaže.</p>
<p><strong>Kalendář v iPhonu</strong>, jen když zapneš Číst kalendář: aplikace přečte události v telefonu a pošle nám jen počet volných minut na trénink v každém dni příštích dvou týdnů, nikdy události, jejich názvy ani časy. Tato čísla uchováváme nejvýš týden po daném dni a smažeme je, když čtení vypneš. Když zapneš Zapisovat tréninky, aplikace zapíše naplánované tréninky do kalendáře v telefonu.</p>
<p><strong>Co zadáš v Aurinu:</strong> profil (třeba věk, výška, váha, sporty, cíle a čas na trénink), jídlo a pití, tréninky a jejich hodnocení, poznámky, odpovědi v deníku (třeba alkohol, kofein, sauna nebo jak ti bylo) a konverzace s asistentem. Fotka, kterou pošleš kouči, jde do OpenAI jen s tou jednou zprávou (viz níže) a neukládáme ji; v konverzaci zůstane jen poznámka, že tam fotka byla. Počítáme, kolik zpráv koučovi za týden pošleš, aby služba zůstala férová pro všechny.</p>
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
<li>Do Google Health zapisujeme jen jídlo a pití, které zapíšeš v Aurinu, a když to povolíš, i váhu zapsanou v Aurinu nebo Intervals.icu a tréninky, které v Aurinu dokončíš.</li>
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
<li>Zápis do Apple Health, jen když ho zapneš (Nastavení → Zdroje dat → Apple Health): tréninky, které zapíšeš v Aurinu, a u typů, které vybereš, i váha, kterou zadáš, denní jídlo (energie, bílkoviny, sacharidy a tuky) a pití. iOS se tě na každý typ zeptá zvlášť a zápis vypneš na stejném místě nebo v Nastavení iPhonu → Zdraví → Přístup k datům a zařízení → Aurin. Co Aurin zapsal, zůstane v Apple Health i po smazání účtu.</li>
<li>Data z Apple Health jdou jen na náš server a kvůli funkcím, které používáš, ke službám z části Kdo data dostává. Neprodáváme je, nepoužíváme ani nepředáváme k reklamě a nedáváme je obchodníkům s daty.</li>
<li>Přístup změníš nebo zrušíš v Nastavení iPhonu → Zdraví → Přístup k datům a zařízení → Aurin. Už synchronizovaná data se smažou s účtem.</li>
</ul>
<h2>Kdo data dostává</h2>
<ul>
<li><strong>Intervals.icu</strong>, když ho připojíš: tréninky, které naplánuješ v Aurinu, tréninky, které v Aurinu dokončíš, tréninky z Apple Zdraví, které tam nepřinesla jiná služba (typ, čas, vzdálenost, tep a kalorie), poznámky k výživě a cíle kalorií v kalendáři, tvoji váhu a několikrát denně kopii denních wellness údajů z Google Health a Apple Zdraví (spánek, průměrný tep ve spánku, kroky, klidový tep, HRV, okysličení krve, dech, VO₂max a tělesný tuk). Intervals.icu s nimi zachází podle svých zásad ochrany soukromí.</li>
<li><strong>Wahoo</strong>, když ho připojíš: jízdy a běhy, které naplánuješ v Aurinu, s jejich úseky a cíli, aby se objevily v ELEMNT a KICKR. Wahoo s nimi nakládá podle svých zásad ochrany osobních údajů.</li>
<li><strong>Google Health</strong>: jídlo a pití, které zapíšeš, a když to povolíš, i tvoje váha a tréninky, které v Aurinu dokončíš.</li>
<li><strong>OpenAI</strong> (USA), když použiješ AI funkci (třeba asistenta, rozpoznání jídla z fotky, etikety nebo popisu, revizi plánu, zhodnocení tréninku nebo popis cviku): data, která daný požadavek potřebuje, třeba tvoji zprávu, fotku a související údaje o tréninku, spánku, zdraví a výživě, včetně dat z připojeného prstenu Ultrahuman nebo WHOOPu. OpenAI je zpracovává naším jménem podle svých podmínek zpracování dat přes API: data poslaná přes API nepoužívá k trénování modelů a uchovává je nejvýš 30 dní kvůli odhalování zneužití, pokud mu zákon neukládá uchovat je déle.</li>
<li><strong>Cloudflare</strong> provozuje Aurin, ukládá jeho databázi v Evropě a uchovává technické záznamy.${email ? ' Jeho služba Email Service posílá kódy pro přihlášení a upozornění na nové přístupové klíče.' : ''}</li>
<li><strong>Apple</strong>, když povolíš oznámení (Nastavení → Oznámení): token tvého iPhonu pro oznámení a text každého oznámení, třeba ranní připravenosti nebo zprávy od kouče, které Applova služba pro oznámení doručí do tvého iPhonu. Vypnutím oznámení nebo odhlášením se token smaže.</li>
<li><strong>Apple</strong>, když tě z waitlistu přidáme k testerům: tvůj e-mail, aby ti TestFlight poslal, jak Aurin nainstalovat. Apple s ním nakládá podle svých zásad ochrany soukromí.</li>
<li><strong>Open-Meteo</strong> dostane jen místo, které vybereš pro počasí v plánu tréninků: vyhledané místo, nebo tvou polohu zaokrouhlenou zhruba na 1 km, pokud ji povolíš. Bez toho aplikace počasí neukazuje.</li>
<li><strong>Úřady</strong>, jen když to vyžaduje zákon.</li>
</ul>
<p>Když skenuješ čárový kód nebo etiketu bez AI, nebo vybereš fotku s kódem, obrázek se zpracuje přímo ve tvém zařízení. Fotky cviků se načítají z GitHubu (Free Exercise DB), a kde cvik žádnou nemá, načte se náhled jeho videa z YouTube; tyto služby vidí jen tvou IP adresu a který obrázek se načítá. Videa cviků jsou vložená z YouTube v režimu se zvýšenou ochranou soukromí a YouTube dostane víc dat, až když video spustíš.</p>
<p><strong>Databáze potravin.</strong> Hledání potravin používá katalog uložený u Aurinu (co hledáš, se nikam dál neposílá), sestavený z otevřených dat: Open Food Facts (© přispěvatelé Open Food Facts, <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>), USDA FoodData Central (volné dílo), Fineli od THL (CC BY 4.0), Ciqual od Anses (Licence Ouverte / CC BY 4.0) a CoFID od Public Health England (Open Government Licence 3.0). Katalog jako databáze je k dispozici pod licencí ODbL; hodnoty jsou převzaté ze zdrojů a nejsou ověřené proti každé etiketě.</p>
<p>Někteří z těchto poskytovatelů sídlí ve Spojených státech. Když data opouštějí Evropskou unii, chrání je zárukami, které vyžaduje GDPR: rámcem EU–USA pro ochranu údajů (Data Privacy Framework), pokud je v něm poskytovatel certifikovaný, jinak standardními smluvními doložkami EU.</p>
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
<li>Aby smazání účtu a nová registrace nevynulovaly limity používání AI funkcí, ponecháme po smazání jen otisky tvého e-mailu a účtu Apple nebo Google, přes který ses přihlašoval, vytvořené tajným klíčem, a kolik z limitů jsi využil tento týden a měsíc. Nový účet se stejným e-mailem, účtem Apple nebo Google na to naváže. Tento záznam se smaže, jakmile ten týden i měsíc skončí, nejpozději zhruba do pěti týdnů.</li>
<li>Přístupový klíč přestaneš používat, když ho smažeš z iPhonu nebo ze správce hesel. Smazáním účtu zmizí z Aurinu všechny tvoje přístupové klíče.</li>
<li>Co Aurin zkopíroval do Intervals.icu nebo Google Health, tam zůstane; smazat to můžeš v těchto službách.</li>
<li>Přístup Aurinu můžeš kdykoli odebrat i ve svém účtu Google v části <a href="${GOOGLE_CONNECTIONS}">Aplikace a služby třetích stran</a>. Aurin pak už tvoje data z Googlu nepřečte ani nezapíše.</li>
${apple ? '<li>Přihlašování přes Apple pro Aurin ukončíš v nastavení svého Apple ID.</li>' : ''}
<li>Technické záznamy se uchovávají několik dní a OpenAI podle svých podmínek API uchovává požadavky AI nejvýš 30 dní.</li>
<li>E-mail ve waitlistu zůstane, dokud testování neskončí nebo dokud nás nepožádáš o jeho smazání na <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</li>
</ul>
<p>Na stránce <a href="/support">Podpora</a> najdeš postup krok za krokem, jak data spravovat a smazat.</p>
<h2>Právní základ a tvoje práva</h2>
<p>Data zpracováváme, abychom ti poskytli službu, o kterou stojíš (čl. 6 odst. 1 písm. b) GDPR). Údaje o zdraví, z Google Health, Apple Health, Intervals.icu, Ultrahumanu, WHOOPu, Wahoo i ty, které zadáš sám, zpracováváme jen s tvým výslovným souhlasem (čl. 9 odst. 2 písm. a) GDPR). Dáváš ho v aplikaci před prvním použitím a my zaznamenáme kdy a ke které verzi tohoto textu; synchronizace propojených služeb na pozadí běží až po něm. Posílání dat, která AI funkce potřebuje, do OpenAI vyžaduje samostatný výslovný souhlas (čl. 9 odst. 2 písm. a) GDPR): vlastní zaškrtávací políčko na začátku, nebo později v aplikaci (třeba „Povolit AI“ u kouče). Bez něj Aurin do OpenAI nic neposílá a zbytek Aurinu funguje dál. Odvoláš ho kdykoli v Nastavení → Soukromí a data → AI funkce. E-mail ve waitlistu zpracováváme na tvou žádost jako krok před používáním Aurinu (čl. 6 odst. 1 písm. b) GDPR). Souhlas odvoláš smazáním účtu v Nastavení → Soukromí a data, kde si předtím můžeš stáhnout všechna svoje data; odpojením služby zastavíš nová data z ní. Odvoláním nepřestává být zákonné zpracování před ním. Technické záznamy vedeme na základě oprávněného zájmu na bezpečné službě (čl. 6 odst. 1 písm. f) GDPR).</p>
<p>Máš právo na přístup ke svým datům, jejich opravu a výmaz, na omezení zpracování, vznesení námitky a na přenositelnost dat. Většinu z toho uděláš přímo v aplikaci: v Nastavení → Soukromí a data si všechna svoje data stáhneš jako soubor JSON Lines (NDJSON), nebo smažeš účet. Můžeš si také stěžovat u Úřadu pro ochranu osobních údajů (<a href="https://uoou.gov.cz">uoou.gov.cz</a>). Aurin o tobě nerozhoduje čistě automatizovaně způsobem, který by měl právní nebo podobně závažné účinky; návrhy kouče čekají na tvoje potvrzení.</p>
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
const TERMS_UPDATED = {cs: '22. října 2026', en: '22 October 2026'};
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
<li>The coach, reading food photos and labels, looking up foods, planning the week, recognizing gym equipment and reviewing workouts use artificial intelligence. They have usage limits and work only with your consent, which you can withdraw in <strong>Settings → Privacy &amp; data → AI features</strong>. The rest of Aurin works without them.</li>
<li>AI answers are generated automatically and can be incomplete or wrong, including nutrition values and ingredients. Check them before you rely on them, especially if you have an allergy or follow a medical diet.</li>
</ul>
<h2>Price</h2>
<p>Aurin is currently free. If we introduce paid features, we will tell you in advance, show the price and conditions before you buy, and sell them only through the App Store, where Apple handles payment, cancellation and refunds. We never charge you without your purchase.</p>
<h2>Fair use</h2>
<p>Do not try to get around Aurin’s security, access someone else’s account or data, overload the service, download it automatically, copy or resell it, or use it for anything unlawful. Reverse engineering is allowed only where the law permits it.</p>
<h2>Availability and changes</h2>
<ul>
<li>Aurin is currently in testing through Apple’s TestFlight: test builds expire, and the app changes more often than a released one.</li>
<li>We develop Aurin continuously, so features can change, move or be removed. We do our best to keep it running, but we cannot promise it will always be available or free of errors. We provide the updates needed to keep Aurin working as described, through the App Store or TestFlight; install them when they come.</li>
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
<p>If you got Aurin from the App Store, Apple’s <a href="${APPLE_EULA}">Licensed Application End User License Agreement</a> applies as well. These terms are between you and us, not Apple. Apple has no obligation to provide maintenance, support or a warranty for Aurin, and any claim about the app, including product liability, consumer protection or intellectual property claims, is ours to handle, not Apple’s. Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you. You confirm that you are not in a country under a US government embargo and not on any US list of prohibited or restricted parties.</p>
<h2>Changes to these terms</h2>
<p>We publish every change on this page with its date. Before a significant change takes effect, we tell you at least 30 days ahead in the app or by e-mail. If you do not agree, you can delete your account before then.</p>
<h2>Law and disputes</h2>
<p>These terms are governed by Czech law. If you are a consumer living in another country, you keep the protection that the mandatory law of that country gives you. If something goes wrong, write to us first and we will try to put it right. If you are a consumer in the Czech Republic, you can also turn to the Czech Trade Inspection Authority (<a href="https://www.coi.cz">coi.cz</a>) for out-of-court resolution of a dispute.</p>
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
<li>Kouč, čtení fotek jídla a etiket, dohledání potravin, plánování týdne, rozpoznání vybavení posilovny a hodnocení tréninků používají umělou inteligenci. Mají limity použití a fungují jen s tvým souhlasem, který odvoláš v <strong>Nastavení → Soukromí a data → AI funkce</strong>. Zbytek Aurinu funguje i bez nich.</li>
<li>Odpovědi AI vznikají automaticky a můžou být neúplné nebo chybné, včetně nutričních hodnot a složení. Než se na ně spolehneš, zkontroluj je, hlavně když máš alergii nebo držíš léčebnou dietu.</li>
</ul>
<h2>Cena</h2>
<p>Aurin je zatím zdarma. Pokud zavedeme placené funkce, dáme ti vědět předem, cenu a podmínky uvidíš před nákupem a prodávat je budeme jen přes App Store, kde platbu, zrušení i vrácení peněz řeší Apple. Bez tvého nákupu ti nikdy nic neúčtujeme.</p>
<h2>Férové používání</h2>
<p>Nesnaž se obejít zabezpečení Aurinu, dostat se k cizímu účtu nebo datům, přetěžovat službu, automaticky ji stahovat, kopírovat ji nebo přeprodávat, ani ji používat k ničemu protiprávnímu. Zpětná analýza je dovolená jen tam, kde to povoluje zákon.</p>
<h2>Dostupnost a změny</h2>
<ul>
<li>Aurin je zatím v testování přes TestFlight od Applu: testovací sestavení mají omezenou platnost a aplikace se mění častěji než vydaná.</li>
<li>Aurin průběžně vyvíjíme, takže se funkce můžou měnit, přesouvat nebo zmizet. Snažíme se, aby fungoval, ale nemůžeme slíbit, že bude vždy dostupný a bez chyb. Aktualizace potřebné k tomu, aby Aurin fungoval, jak popisujeme, dodáváme přes App Store nebo TestFlight; nainstaluj si je, když přijdou.</li>
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
<p>Pokud máš Aurin z App Storu, platí navíc <a href="${APPLE_EULA}">licenční smlouva Apple pro koncové uživatele</a> (Licensed Application End User License Agreement). Tyto podmínky jsou mezi tebou a námi, ne Applem. Apple nemá povinnost poskytovat k Aurinu údržbu, podporu ani záruku a jakýkoli nárok týkající se aplikace, včetně odpovědnosti za výrobek, ochrany spotřebitele nebo duševního vlastnictví, řešíme my, ne Apple. Apple a jeho dceřiné společnosti jsou oprávněnou třetí stranou těchto podmínek a mohou je vůči tobě vymáhat. Potvrzuješ, že nejsi v zemi, na kterou vláda USA uvalila embargo, ani na žádném seznamu zakázaných nebo omezených osob USA.</p>
<h2>Změny podmínek</h2>
<p>Každou změnu zveřejníme na této stránce s datem. Než začne platit podstatná změna, dáme ti to vědět aspoň 30 dní předem v aplikaci nebo e-mailem. Když nesouhlasíš, můžeš do té doby účet smazat.</p>
<h2>Právo a spory</h2>
<p>Tyto podmínky se řídí českým právem. Pokud jsi spotřebitel s bydlištěm v jiné zemi, zůstává ti ochrana, kterou ti dávají kogentní předpisy té země. Když se něco pokazí, napiš nám nejdřív a pokusíme se to napravit. Spotřebitel v České republice se může s mimosoudním řešením sporu obrátit také na Českou obchodní inspekci (<a href="https://www.coi.cz">coi.cz</a>).</p>
<h2>Kontakt</h2>
<p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
<p class="muted">Závazné je anglické znění: <a href="/terms?lang=en">Terms of Use</a>.</p>`
  });
}

export function supportPage(request, {apple = false, email = false, open = false} = {}) {
  return doc(request, '/support', {en: 'Support'}, {
    en: `<p>${open ? '' : 'Aurin is currently in testing through Apple’s TestFlight; access is by invitation from the waitlist at aurin.health. '}If something does not work, report it in the app or write to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Never send passwords, API keys or other secrets.</p>
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

// The Consumer Health Data Privacy Policy that Washington's My Health My Data Act (RCW 19.373) and
// Nevada's SB 370 ask for, apart from the privacy policy and linked from the homepage (footer). It
// says the same as the privacy policy, in the categories those laws use; change both together.
const HEALTH_DATA_UPDATED = '24 October 2026';
export function healthDataPage(request) {
  return doc(request, '/health-data', {en: 'Consumer Health Data Privacy Policy'}, {
    en: `<p class="muted">Last updated: ${HEALTH_DATA_UPDATED}</p>
<p>This policy explains how Aurin handles “consumer health data” as defined by Washington’s My Health My Data Act and Nevada’s Senate Bill 370. It adds to our <a href="/privacy">Privacy Policy</a>, which describes everything Aurin does with your data in more detail. Aurin is run by Petr Bouma, a private individual in the Czech Republic, reachable at <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
<h2>Consumer health data we collect</h2>
<ul>
<li>Sleep (duration, stages, times), heart rate, resting heart rate, heart rate variability, breathing rate, blood oxygen, skin or wrist temperature, VO2 max, steps and activity.</li>
<li>Workouts and how they went, training load, readiness and recovery estimates, soreness, pain, illness or injury status you report.</li>
<li>Body measurements: weight, height, body fat, age and sex.</li>
<li>Food, drinks and nutrition targets, including photos of food you choose to send.</li>
<li>Journal entries you tick off (such as sauna, a late meal, alcohol, medication or breathing exercises) and, if you allow it, symptoms and mindful minutes from Apple Health.</li>
<li>Only if you turn cycle tracking on: periods, their strength, symptoms, contraception, life stage, hormone therapy and the pills you mark as taken.</li>
<li>What you write to the AI coach and the photos you send it.</li>
</ul>
<h2>Why we collect it</h2>
<p>Only to provide Aurin to you: to estimate your readiness and training load, suggest workouts, plans and nutrition targets, show your history and, when you use them, run the AI features. We do not use it for advertising, do not sell it and do not give it to data brokers.</p>
<h2>Where it comes from</h2>
<p>From you, from your iPhone (Apple Health, with the permissions you give in iOS) and from services you connect: Google Health, Intervals.icu, the Ultrahuman Ring, WHOOP and Wahoo.</p>
<h2>Consent</h2>
<p>We collect and process consumer health data only after you consent in the app, before any of it is synced. Sharing it with OpenAI for the AI features takes a separate consent, a checkbox of its own that is never ticked in advance; you can withdraw it at any time in <strong>Settings → Privacy &amp; data → AI features</strong>, and Aurin keeps working without it.</p>
<h2>Who receives it</h2>
<ul>
<li><strong>Processors acting on our behalf:</strong> Cloudflare, which hosts Aurin and its database, OpenAI, which processes the data an AI feature needs when you use one and does not use it to train its models, and Apple’s push service, which delivers the notifications you allow (such as the morning readiness).</li>
<li><strong>Services you ask us to send data to:</strong> Intervals.icu, Wahoo, Google Health and Apple Health, only if you connect them and only what the <a href="/privacy">Privacy Policy</a> lists for each.</li>
<li><strong>Authorities</strong>, only when the law requires it.</li>
</ul>
<p>We have no affiliates that receive consumer health data, and we do not sell consumer health data.</p>
<h2>Your rights</h2>
<ul>
<li><strong>Know and access:</strong> confirm whether we collect, share or sell your consumer health data, see a list of the third parties we share it with, and download a copy of all your data in <strong>Settings → Privacy &amp; data → Download my data</strong>.</li>
<li><strong>Withdraw consent:</strong> turn off the AI features in the app, disconnect a service in <strong>Settings → Data sources</strong>, or withdraw consent entirely by deleting your account.</li>
<li><strong>Delete:</strong> <strong>Settings → Privacy &amp; data → Delete account</strong> deletes your account and all its data immediately. Data Aurin copied to Intervals.icu, Google Health or Apple Health stays there; you can delete it in those services.</li>
</ul>
<p>You can also e-mail any request to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. We may ask you to confirm the request from the e-mail address of your account, and we answer within 45 days.</p>
<h2>Appeals</h2>
<p>If we decline your request, you can appeal by replying to our answer or writing to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with “Appeal” in the subject. We decide within 45 days and explain why. If the appeal is denied, you can contact the <a href="https://www.atg.wa.gov/file-complaint">Washington State Attorney General</a> or, in Nevada, the <a href="https://ag.nv.gov/Complaints/File_Complaint/">Nevada Attorney General</a>.</p>
<h2>Changes</h2>
<p>We publish every change on this page with its date. Before we collect or share consumer health data in a new way, we ask for your consent in the app.</p>`
  });
}

// Search engines: the public pages are listed in the sitemap; sign-in, the app's API and shared
// workouts are left out of the index.
const PUBLIC_PAGES = ['/', '/support', '/privacy', '/terms', '/health-data', '/privacy?lang=cs', '/terms?lang=cs'];

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
