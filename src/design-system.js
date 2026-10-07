import {icon} from './icons.js';
// Loadwise design system: the one place for UI colour tokens and shared component rules.
// It is loaded after every theme layer, so a token changed here changes the whole app.
// Chart data colours (macros, sleep stages, zones) stay with the charts.
// Theme layers use tokens or color-mix() of tokens, never a raw colour for a surface, line or grey
// (tests/design-tokens.test.mjs), so the light theme below only redefines the tokens.
// Theme choice: the lw-theme cookie (light | dark) sets <html data-theme>; without it the
// system setting decides.
const LIGHT = `
  color-scheme:light;
  --bg:#fbfcfd;--sidebar:#f3f5f8;--panel:#ffffff;--panel2:#eef1f5;--line:#d9dee6;
  --text:#121821;--muted:#4f5a69;
  --ok:#0c7f5a;--warn:#a86a00;--bad:#d42f47;--cyan:#0a76b8;--sky:#0784a8;--blue:#2563eb;
  --green:#0f8a5c;--amber:#b86e00;--violet:#7444d6;--lilac:#8657e0;
  --primary:#0c7f5a;--primary-rgb:12,127,90;--primary-ink:#ffffff;--primary-text:#0a6b4c;
  --primary-surface:#ddf3ea;--primary-line:#a9dcc8;
  --ink-l:.5;
  --card:var(--panel);--card-line:color-mix(in srgb,var(--muted) 20%,var(--bg));
  --card-shadow:0 1px 2px rgba(16,24,40,.05);--btn:var(--panel);
`;
// Shared by the app (/app) and the public pages (/, /privacy, …).
export const themeTokens = `
:root{
  color-scheme:dark;
  /* Surfaces and text. Other neutral shades are mixes of --text over --bg, so the light theme
     only swaps these (plus the surfaces) and every grey in the app follows. */
  --bg:#0b0e12;--sidebar:#0b0e12;--panel:#151a20;--panel2:#20262f;--line:#2c333e;
  --text:#f6f7fb;--muted:#a3afbf;
  /* Status and accent hues; tints are mixes of a hue with --bg (surfaces) or --text (light text). */
  --ok:#83e9c3;--warn:#ffc15c;--bad:#ff6478;--cyan:#7ec8ff;--sky:#64d2ff;--blue:#60a5fa;
  --green:#3fda9c;--amber:#f59e0b;--violet:#9b6bff;--lilac:#b393ff;
  --primary:#83e9c3;--primary-rgb:131,233,195;--primary-ink:#0f241c;--primary-text:#a2f4d6;
  --primary-surface:#1d302b;--primary-line:#2d4b40;
  --accent:var(--primary);--accent2:var(--primary-text);
  /* Data-coloured text (.ink, colour in --c): the light theme caps its lightness so pastel
     chart hues stay readable on white; the dark theme keeps them as they are. */
  --ink-l:1;
  /* Card surface: a light lift over the page in the dark theme, white with a hairline in the light one. */
  --card:color-mix(in srgb,var(--muted) 7%,var(--bg));--card-line:color-mix(in srgb,var(--muted) 22%,var(--bg));
  --card-shadow:none;--btn:color-mix(in srgb,var(--muted) 15%,var(--bg));
  /* Type scale. Theme layers take sizes under 15px from these tokens (tests/design-tokens.test.mjs):
     caption only for short uppercase labels, meta for dense chips, legends and calendar cells,
     small for secondary sentences, notes, table cells and buttons, body for running text. */
  --fs-caption:12px;--fs-meta:13px;--fs-small:14px;--fs-body:15px;
}
:root[data-theme="light"]{${LIGHT}}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){${LIGHT}}}
`;

// Runs in <head> before the first paint, so a saved choice never flashes the other theme.
export const themeBoot = `<script>(function(){try{var m=document.cookie.match(/(?:^|; )lw-theme=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1];}catch(e){}})();</script>`;

// Vzhled switch: Světlý / Tmavý, showing the theme in use. Without a choice the device decides;
// picking the device's own theme clears the choice. The app wires it in dashboard-client.js,
// the public pages with themeSwitchScript.
const SWITCH_TEXT = {cs: ['Vzhled', 'Světlý vzhled', 'Světlý', 'Tmavý vzhled', 'Tmavý'], en: ['Appearance', 'Light appearance', 'Light', 'Dark appearance', 'Dark']};
export const themeSwitch = (lang = 'cs') => { const [group, lightLabel, light, darkLabel, dark] = SWITCH_TEXT[lang] || SWITCH_TEXT.cs;
  return `<div class="theme-switch" role="radiogroup" aria-label="${group}"><button type="button" role="radio" data-theme-choice="light" aria-label="${lightLabel}" title="${light}">${icon('today')}</button><button type="button" role="radio" data-theme-choice="dark" aria-label="${darkLabel}" title="${dark}">${icon('moon')}</button></div>`; };

export const themeSwitchScript = `<script>(function(){
var root=document.documentElement,media=matchMedia('(prefers-color-scheme: light)');
function sys(){return media.matches?'light':'dark';}
function choice(){return root.dataset.theme||sys();}
function sync(){document.querySelectorAll('[data-theme-choice]').forEach(function(b){b.setAttribute('aria-checked',String(b.dataset.themeChoice===choice()));});}
document.addEventListener('click',function(e){var b=e.target.closest('[data-theme-choice]');if(!b)return;var c=b.dataset.themeChoice;
if(c===sys()){delete root.dataset.theme;document.cookie='lw-theme=; path=/; max-age=0; samesite=lax';}
else{root.dataset.theme=c;document.cookie='lw-theme='+c+'; path=/; max-age=31536000; samesite=lax';}sync();});
media.addEventListener('change',sync);sync();})();</script>`;

export const themeSwitchCss = `
.theme-switch{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--line);border-radius:999px;background:var(--panel)}
.theme-switch button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:999px;background:none;color:var(--muted);cursor:pointer}
.theme-switch button:hover{color:var(--text)}
.theme-switch button[aria-checked=true]{background:var(--primary-surface);color:var(--primary-text)}
.theme-switch .icon{width:16px;height:16px}
.lang-switch button{width:auto;min-width:30px;padding:0 7px;font-size:12px;font-weight:650;line-height:1;letter-spacing:.02em}
`;

export const designSystem = themeTokens + themeSwitchCss + `
/* Buttons used to inherit the 14px body; keep them at small instead of growing with running text. */
button{font-size:var(--fs-small)}
/* iOS zooms into any field under 16px when it gets focus. */
@media (max-width:700px){input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea{font-size:16px!important}
  /* At 16px the date in the top bar needs more than the old 114px, or its year is cut off. */
  .topbar #viewDate{width:138px}}
body{background:var(--bg)}
.ink{color:var(--c);color:oklch(from var(--c) min(l,var(--ink-l)) c h)}
svg .ink{fill:var(--c);fill:oklch(from var(--c) min(l,var(--ink-l)) c h)}
.brand span{text-transform:none;letter-spacing:0;font-size:var(--fs-small)}
/* The day timeline scrolls inside its card; the fade says there is more below. */
#todayTimelineSlot .timeline{padding-bottom:20px;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent)}
.btn.primary{background:var(--primary);border-color:var(--primary);color:var(--primary-ink);box-shadow:none}
.btn.primary:disabled{opacity:.55}
.pill.good{color:var(--primary-text)}
.nav button.active{background:var(--primary-surface);border-color:var(--primary-line);color:var(--primary-text);box-shadow:none}
.plan-day.today,.day.today,.hub-day.today{border-color:var(--primary);box-shadow:inset 0 0 0 1px rgba(var(--primary-rgb),.2)}
.fab{color:var(--primary-ink)}
:focus-visible{outline-color:var(--primary)}

/* Vzhled: the switch itself is themeSwitchCss; this is its card in Nastavení. */
.theme-card{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.theme-card h3{margin:0 0 4px}.theme-card p{margin:0}
.theme-choices{display:flex;gap:6px;flex-wrap:wrap}
.theme-choices .btn.selected{background:var(--primary-surface);border-color:var(--primary-line);color:var(--primary-text)}

/* Icons: one inline SVG set, sized to the text next to it. */
.icon{width:1.15em;height:1.15em;flex:none;vertical-align:-.2em;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.nav button .icon{width:18px;height:18px}

/* Empty states read as a note, not as a measured value. */
.is-empty{font-size:var(--fs-body)!important;font-weight:600!important;color:var(--muted)!important;letter-spacing:normal!important;line-height:1.4!important}
.link-btn{background:none;border:0;padding:0;color:var(--primary-text);font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.empty-state{padding:18px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:var(--fs-small);line-height:1.55}
.empty-state .link-btn{margin-left:4px}

/* Sub-tabs (Trénink). */
.subtabs{display:flex;gap:6px;margin:16px 0 4px;overflow-x:auto;scrollbar-width:none}
.subtabs::-webkit-scrollbar{display:none}
.subtabs button{flex:none;border:1px solid var(--line);background:var(--panel);color:var(--muted);padding:9px 14px;border-radius:999px;font-weight:650;font-size:var(--fs-small)}
.subtabs button[aria-selected=true]{background:var(--primary-surface);border-color:var(--primary-line);color:var(--primary-text)}
[data-tab-hidden]{display:none!important}

/* Planned ride or run: outdoors or on the trainer. */
.env-toggle{display:flex;align-items:center;gap:6px;margin:12px 0}.env-toggle .small{margin-right:4px}
.env-toggle .btn.selected{background:var(--primary-surface);border-color:var(--primary-line);color:var(--primary-text)}

/* Výživa: the right column holds the meals and what to eat next. */
.meal-column{display:grid;gap:14px;align-content:start;min-width:0}
.meal-column>.card{margin:0}
.experience-grid.single{grid-template-columns:minmax(0,1fr)}

/* Nastavení: a save button is as wide as its label, not a whole grid cell. */
.food-editor-grid>.btn.primary{justify-self:start;align-self:end;width:auto;min-height:0;height:auto;padding:10px 18px}

/* One look for the same thing everywhere (thread "Grafika webu", 2026-10-07). */
/* Cards: every panel, tile and ring tile sits on the same surface. */
.card,.metric-tile,.coach-council,.mini-ring,.plan-day,.day,.section-hero,.hero.section-hero,.weekbar.section-hero,.recovery-command{background:var(--card);border-color:var(--card-line);box-shadow:var(--card-shadow)}
@media(min-width:701px){.recovery-indices .score-caption{white-space:nowrap}}
/* Stat cards (Denní signály, Výkonnostní kapacita, Zdraví): label, number with its change chip,
   and one line under it. Subgrid keeps those three rows level across cards in a row, so a chip
   that wraps in one card does not push the line under the next card's number. */
.quick-grid>.card,#training>.grid>.card,#healthTiles>.metric-tile{display:grid;grid-row:span 3;grid-template-rows:subgrid;row-gap:6px;align-content:start}
.quick-grid>.card>*,#training>.grid>.card>*,#healthTiles>.metric-tile>*{margin:0}
.quick-grid .value,#training>.grid .value,#healthTiles .metric-number{display:flex;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:4px 10px}
/* Number blocks with a caption, a number and a note (Osobní trend, Spánkový rytmus): the numbers
   stay on one line even when one caption wraps. */
.detail-stats>div,.experience-stats>div{display:grid;grid-row:span 3;grid-template-rows:subgrid;row-gap:4px;align-content:start}
.experience-stats>div{grid-row:span 2}
.detail-stats>div>*,.experience-stats>div>*{margin:0;align-self:start}
@media(min-width:701px){
  #nutrition .daygrid>.day{display:grid;grid-row:span 4;grid-template-rows:subgrid;row-gap:8px;align-content:start}
  #nutrition .daygrid>.day>*{margin:0}
}
.daygrid .dayhead{display:flex;flex-direction:column;align-items:flex-start;gap:5px}
.daygrid .dayhead>span{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:var(--fs-meta);font-weight:700;line-height:1.45}
.daygrid .day .macro-line{display:grid;gap:1px;justify-content:start}
.quick-grid .value .trend,#training>.grid .value .trend,#healthTiles .metric-number .delta-badge{margin:0}
/* Change chips: same pill, arrow and size wherever a value is compared with something. */
/* On a narrow card the basis wraps under the number inside the chip instead of overflowing it. */
.trend,.delta-badge{display:inline-block;max-width:100%;padding:2px 9px;border-radius:12px;font-size:var(--fs-small);font-weight:700;line-height:1.45;letter-spacing:normal;word-spacing:normal;white-space:normal;text-align:left;font-variant-numeric:tabular-nums}
.trend:not(.up):not(.down),.delta-badge.flat{background:color-mix(in srgb,var(--text) 8%,var(--bg));color:color-mix(in srgb,var(--muted) 60%,var(--text))}
.nowrap{white-space:nowrap}
/* Buttons: one height, radius and weight; .primary is the one green action on a screen. */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:38px;border-radius:10px;font-weight:650;line-height:1.2;vertical-align:middle;background:var(--btn)}
.topbar .actions{align-items:center}
.topbar .actions>.btn{height:40px;min-height:40px}
/* Den timeline: full "Zapsat váhu" on a computer, a short "Váha" on a phone. */
.tl-short{display:none}
@media(max-width:700px){.tl-short{display:inline}}
.hydration-custom .btn.primary{background:var(--primary);color:var(--primary-ink);border-radius:10px}
.ml-add{background:var(--primary-surface);color:var(--primary-text);box-shadow:inset 0 0 0 1px var(--primary-line);font-size:22px}
.ml-add:hover{background:var(--primary);color:var(--primary-ink)}
#ownFoodLibraryButtons{align-items:center}#ownFoodLibraryButtons>.btn{margin:0}
/* Plán: "Přidat vlastní trénink" sits next to the sport switch instead of above the hero card. */
#workouts .section-hero>div:first-child{display:flex;flex-wrap:wrap;align-items:center;column-gap:8px}
#workouts .section-hero>div:first-child>*{flex-basis:100%}
#workouts .section-hero>div:first-child>.sport-switch,#workouts .section-hero>div:first-child>#addManualWorkout{flex-basis:auto;margin-top:12px}
@media(max-width:700px){#workouts .section-hero>div:first-child>.sport-switch{flex-basis:100%}#workouts .section-hero .sport-switch .btn{flex:1 1 auto;white-space:nowrap}#workouts .section-hero>div:first-child>#addManualWorkout{margin-top:8px}}
/* Výživa: a day's "2470 / 2650 kcal" stays on one line, so the macro rows line up across days. */
.daygrid .day .value.day-kcal{font-size:20px;white-space:nowrap}.day-kcal small{font-size:var(--fs-small);font-weight:600;color:var(--muted)}

/* Floating buttons: the end of every page can scroll clear of them. */
.content{padding-bottom:110px}
@media(max-width:700px){
  /* One floating button on a phone; the assistant is the first item of its sheet. */
  .assistant-fab{display:none!important}
  .nav button .icon{width:22px;height:22px}
  .content{padding-bottom:calc(150px + env(safe-area-inset-bottom))}
  .fab.has-advice::after{content:"";position:absolute;top:5px;right:5px;width:12px;height:12px;border-radius:50%;background:var(--warn);border:2px solid var(--bg)}
}
`;
