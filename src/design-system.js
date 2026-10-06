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
  --text:#121821;--muted:#596474;
  --ok:#0f8f66;--warn:#a86a00;--bad:#d42f47;--cyan:#0a76b8;--sky:#0784a8;--blue:#2563eb;
  --green:#0f8a5c;--amber:#b86e00;--violet:#7444d6;--lilac:#8657e0;
  --primary:#0f8f66;--primary-rgb:15,143,102;--primary-ink:#ffffff;--primary-text:#0a6b4c;
  --primary-surface:#ddf3ea;--primary-line:#a9dcc8;
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
}
:root[data-theme="light"]{${LIGHT}}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]){${LIGHT}}}
`;

// Runs in <head> before the first paint, so a saved choice never flashes the other theme.
export const themeBoot = `<script>(function(){try{var m=document.cookie.match(/(?:^|; )lw-theme=(light|dark)/);if(m)document.documentElement.dataset.theme=m[1];}catch(e){}})();</script>`;

// Vzhled switch: Dle zařízení / Světlý / Tmavý. The app wires it in dashboard-client.js,
// the public pages with themeSwitchScript.
export const themeSwitch = () => `<div class="theme-switch" role="radiogroup" aria-label="Vzhled"><button type="button" role="radio" data-theme-choice="system" aria-label="Vzhled dle zařízení" title="Dle zařízení">${icon('device')}</button><button type="button" role="radio" data-theme-choice="light" aria-label="Světlý vzhled" title="Světlý">${icon('today')}</button><button type="button" role="radio" data-theme-choice="dark" aria-label="Tmavý vzhled" title="Tmavý">${icon('moon')}</button></div>`;

export const themeSwitchScript = `<script>(function(){
var root=document.documentElement,media=matchMedia('(prefers-color-scheme: light)');
function choice(){return root.dataset.theme||'system';}
function sync(){document.querySelectorAll('[data-theme-choice]').forEach(function(b){b.setAttribute('aria-checked',String(b.dataset.themeChoice===choice()));});}
document.addEventListener('click',function(e){var b=e.target.closest('[data-theme-choice]');if(!b)return;var c=b.dataset.themeChoice;
if(c==='system'){delete root.dataset.theme;document.cookie='lw-theme=; path=/; max-age=0; samesite=lax';}
else{root.dataset.theme=c;document.cookie='lw-theme='+c+'; path=/; max-age=31536000; samesite=lax';}sync();});
media.addEventListener('change',sync);sync();})();</script>`;

export const themeSwitchCss = `
.theme-switch{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--line);border-radius:999px;background:var(--panel)}
.theme-switch button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:999px;background:none;color:var(--muted);cursor:pointer}
.theme-switch button:hover{color:var(--text)}
.theme-switch button[aria-checked=true]{background:var(--primary-surface);color:var(--primary-text)}
.theme-switch .icon{width:16px;height:16px}
`;

export const designSystem = themeTokens + themeSwitchCss + `
body{background:var(--bg)}
.brand span{text-transform:none;letter-spacing:0;font-size:12px}
/* The day timeline scrolls inside its card; the fade says there is more below. */
#todayTimelineSlot .timeline{padding-bottom:20px;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 26px),transparent)}
.btn.primary{background:var(--primary);border-color:var(--primary);color:var(--primary-ink);box-shadow:none}
.btn.primary:disabled{opacity:.55}
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
.is-empty{font-size:14px!important;font-weight:600!important;color:var(--muted)!important;letter-spacing:normal!important;line-height:1.4!important}
.link-btn{background:none;border:0;padding:0;color:var(--primary-text);font:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.empty-state{padding:18px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:13px;line-height:1.55}
.empty-state .link-btn{margin-left:4px}

/* Sub-tabs (Trénink). */
.subtabs{display:flex;gap:6px;margin:16px 0 4px;overflow-x:auto;scrollbar-width:none}
.subtabs::-webkit-scrollbar{display:none}
.subtabs button{flex:none;border:1px solid var(--line);background:var(--panel);color:var(--muted);padding:9px 14px;border-radius:999px;font-weight:650;font-size:13px}
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
