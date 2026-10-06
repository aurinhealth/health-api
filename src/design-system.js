// Loadwise design system: the one place for UI colour tokens and shared component rules.
// It is loaded after every theme layer, so a token changed here changes the whole app.
// Chart data colours (macros, sleep stages, zones) stay with the charts.
// A light theme will only redefine the tokens in :root.
export const designSystem = `
:root{
  --primary:#83e9c3;--primary-rgb:131,233,195;--primary-ink:#0f241c;--primary-text:#a2f4d6;
  --primary-surface:#1d302b;--primary-line:#2d4b40;
  --accent:var(--primary);--accent2:var(--primary-text);--ok:#83e9c3;
  --muted:#a3afbf;
}
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
