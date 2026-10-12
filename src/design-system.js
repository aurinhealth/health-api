import {icon} from './icons.js';
// Colour tokens and the Světlý / Tmavý switch of the public pages (site-pages.js).
// The light theme below only redefines the tokens.
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
// The public pages (/, /privacy, …).
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
// picking the device's own theme clears the choice; themeSwitchScript wires it.
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
