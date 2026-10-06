// Public pages: the Loadwise overview on / and the policy pages. They share the app's colour
// tokens and Vzhled switch, so the site and the app look like one product in both themes.
// Screenshots live in public/site/ (Workers static assets), one per theme.
import {themeTokens,themeBoot,themeSwitch,themeSwitchScript,themeSwitchCss} from './design-system.js';
import {icon} from './icons.js';

const ORIGIN = 'https://petrfitnessdata.eu';

const siteCss = `
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:var(--primary-text)}
.icon{width:1.15em;height:1.15em;flex:none;vertical-align:-.2em;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.site-head{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.site-head .wrap{display:flex;align-items:center;gap:20px;height:64px}
.logo{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:750;font-size:18px;letter-spacing:-.02em}
.logo img{width:30px;height:30px;border-radius:8px}
.site-nav{display:flex;gap:22px;margin-left:12px}
.site-nav a{color:var(--muted);text-decoration:none;font-size:15px;font-weight:550}.site-nav a:hover{color:var(--text)}
.head-end{display:flex;align-items:center;gap:10px;margin-left:auto}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border:1px solid var(--line);border-radius:11px;background:var(--panel);color:var(--text);font-weight:650;font-size:15px;text-decoration:none;white-space:nowrap}
.btn:hover{border-color:color-mix(in srgb,var(--text) 30%,var(--bg))}
.btn.primary{background:var(--primary);border-color:var(--primary);color:var(--primary-ink)}
.btn.primary:hover{filter:brightness(1.06)}
.btn.big{padding:13px 20px;font-size:16px;border-radius:13px}
:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.eyebrow{color:var(--primary-text);font-size:13px;font-weight:750;letter-spacing:.12em;text-transform:uppercase}
h1,h2,h3{letter-spacing:-.03em;line-height:1.15;margin:0}
.lead{color:var(--muted);font-size:19px;max-width:640px}
.hero{padding:72px 0 0;background:radial-gradient(ellipse 70% 60% at 50% 0,rgba(var(--primary-rgb),.16),transparent 70%)}
.hero h1{font-size:clamp(36px,5.4vw,60px);max-width:820px;margin:14px 0 18px}
.hero-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:28px 0 0}
.invite{color:var(--muted);font-size:14px}
.frame{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel);box-shadow:0 30px 80px color-mix(in srgb,#000 22%,transparent)}
.frame img{display:block;width:100%;height:auto}
.hero .frame{margin-top:56px;border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom:0}
:root[data-theme="light"] .shot-dark,:root:not([data-theme="light"]) .shot-light{display:none}
@media (prefers-color-scheme:light){:root:not([data-theme="dark"]) .shot-dark{display:none}:root:not([data-theme="dark"]) .shot-light{display:block}}
section{padding:96px 0;border-top:1px solid var(--line)}
.hero{border-top:0}
.section-head{max-width:680px;margin-bottom:48px}
.section-head h2{font-size:clamp(28px,3.6vw,40px);margin:10px 0 12px}
.section-head p{color:var(--muted);font-size:18px;margin:0}
.feature{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:56px;align-items:center;margin-bottom:88px}
.feature:last-of-type{margin-bottom:0}
.feature.flip{grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr)}
.feature.flip .feature-text{order:2}
.feature h3{font-size:28px;margin:14px 0 12px}
.feature p{color:var(--muted);font-size:17px;margin:0 0 14px}
.feature ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.feature li{display:flex;gap:10px;align-items:baseline;font-size:15px}
.feature li .icon{color:var(--primary-text);width:16px;height:16px;vertical-align:-.15em}
.badge{display:inline-grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--primary-surface);color:var(--primary-text)}
.badge .icon{width:22px;height:22px}
.feature .frame.tall{max-width:340px;justify-self:center}
.extras{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:88px}
.card{padding:24px;border:1px solid var(--line);border-radius:16px;background:var(--panel)}
.card h3{font-size:19px;margin:14px 0 8px}.card p{color:var(--muted);margin:0;font-size:15px}
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;counter-reset:step}
.steps .card::before{counter-increment:step;content:counter(step);display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--primary);color:var(--primary-ink);font-weight:750}
.privacy{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.privacy ul{margin:12px 0 0;padding-left:20px;color:var(--muted)}.privacy li{margin:6px 0}
.privacy .card[lang="en"] p{margin:0 0 12px}
.cta{text-align:center;padding:96px 0}
.cta h2{font-size:clamp(28px,3.6vw,40px);margin:0 0 12px}
.cta p{color:var(--muted);font-size:18px;margin:0 auto 28px;max-width:560px}
.site-foot{border-top:1px solid var(--line);padding:28px 0;color:var(--muted);font-size:14px}
.site-foot .wrap{display:flex;gap:20px;flex-wrap:wrap;align-items:center}
.site-foot nav{display:flex;gap:18px;margin-left:auto}
.site-foot a{color:var(--muted);text-decoration:none}.site-foot a:hover{color:var(--text)}
.doc{max-width:760px;padding:56px 24px 80px}
.doc h1{font-size:40px;margin:0 0 20px}.doc h2{font-size:22px;margin:36px 0 10px}
.doc p{color:color-mix(in srgb,var(--text) 82%,var(--bg))}
@media (max-width:900px){
  .site-nav{display:none}
  .feature,.feature.flip{grid-template-columns:1fr;gap:28px;margin-bottom:64px}
  .feature.flip .feature-text{order:0}
  .extras,.steps,.privacy{grid-template-columns:1fr}
  .extras{margin-top:64px}
  section{padding:64px 0}
}
@media (max-width:560px){
  .wrap{padding:0 16px}
  .head-end .btn{padding:8px 12px;font-size:14px}
  .head-end .btn .label-long{display:none}
  .hero{padding-top:44px}.lead{font-size:17px}
  .hero .frame{margin-top:36px}
  .site-foot nav{margin-left:0}
}
`;

function shot(name, alt, {eager=false, width=1100, height=742}={}) {
  const load = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<img class="shot-dark" src="/site/${name}-dark.webp" alt="${alt}" width="${width}" height="${height}" decoding="async" ${load}><img class="shot-light" src="/site/${name}-light.webp" alt="${alt}" width="${width}" height="${height}" decoding="async" ${load}>`;
}

const check = text => `<li>${icon('check')}<span>${text}</span></li>`;

function sitePage({title, description, lang='cs', body, index=true}) {
  const html = `<!doctype html>
<html lang="${lang}">
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
<meta property="og:image" content="${ORIGIN}/site/today-dark.webp">
${index ? '' : '<meta name="robots" content="noindex">'}
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>${themeTokens}${themeSwitchCss}${siteCss}</style>
</head>
<body>
<header class="site-head"><div class="wrap">
<a class="logo" href="/"><img src="/logo.svg" alt="" width="30" height="30">Loadwise</a>
<nav class="site-nav" aria-label="Sekce"><a href="/#funkce">Funkce</a><a href="/#jak">Jak to funguje</a><a href="/#soukromi">Soukromí</a></nav>
<div class="head-end">${themeSwitch()}<a class="btn primary" href="/app"><span>Otevřít<span class="label-long"> aplikaci</span></span></a></div>
</div></header>
${body}
<footer class="site-foot"><div class="wrap">
<span>© Loadwise · petrfitnessdata.eu</span>
<nav aria-label="Dokumenty"><a href="/privacy">Ochrana soukromí</a><a href="/terms">Podmínky</a><a href="/support">Podpora</a></nav>
</div></footer>
${themeSwitchScript}
</body></html>`;
  return new Response(html, {status:200, headers:{'content-type':'text/html; charset=utf-8', 'cache-control':'public, max-age=3600'}});
}

export function overviewPage() {
  return sitePage({
    title: 'Loadwise · trénink, regenerace a výživa na jednom místě',
    description: 'Loadwise spojí tréninky z Intervals.icu, spánek a zdraví z Google Health a jídlo do jednoho denního přehledu a podle toho poradí, co dnes trénovat a kolik jíst.',
    body: `<main>
<div class="hero"><div class="wrap">
<div class="eyebrow">Trénink · regenerace · výživa</div>
<h1>Trénink, který počítá s tím, jak se dnes máš.</h1>
<p class="lead">Loadwise spojí tvoje tréninky, spánek a jídlo do jednoho denního přehledu. Podle toho poradí, co dnes odjet nebo odcvičit, kolik sníst a kdy ubrat.</p>
<div class="hero-actions"><a class="btn primary big" href="/app">Přihlásit se</a><a class="btn big" href="#funkce">Co umí</a><span class="invite">Zatím jen na pozvánku.</span></div>
<div class="frame">${shot('today', 'Obrazovka Dnes: spánek, námaha, kalorie, pití, dnešní tréninky a časová osa dne', {eager:true, width:1440, height:900})}</div>
</div></div>

<section id="funkce"><div class="wrap">
<div class="section-head"><div class="eyebrow">Funkce</div><h2>Všechno, co ovlivňuje výkon, na jednom místě</h2><p>Místo pěti aplikací jedna obrazovka, která ví, co máš za sebou a co tě čeká.</p></div>

<div class="feature"><div class="feature-text"><span class="badge">${icon('training')}</span><h3>Forma, únava a kondice</h3>
<p>Tréninky z Intervals.icu se propisují do kondice, únavy a formy. Hned vidíš, jestli se zlepšuješ, nebo jen sbíráš únavu.</p>
<ul>${check('Kondice, únava a forma v čase')}${check('Svaly, rekordy a historie posilovny')}${check('Týdenní zátěž proti plánu')}</ul></div>
<div class="frame">${shot('training', 'Obrazovka Trénink: kondice, únava, forma a graf jejich vývoje')}</div></div>

<div class="feature flip"><div class="feature-text"><span class="badge">${icon('apple')}</span><h3>Kolik jíst podle toho, co děláš</h3>
<p>Denní cíl kalorií a maker se řídí tím, jaký trénink tě dnes čeká. Jídlo zapíšeš z fotky, čárového kódu nebo pár slovy, pití jedním klepnutím.</p>
<ul>${check('Kalorie a makra podle tréninku')}${check('Zápis jídla z fotky, kódu i textu')}${check('Co dál dnes sníst, aby to sedělo')}</ul></div>
<div class="frame">${shot('nutrition', 'Obrazovka Výživa: snědeno, zbývá, makra, pití a jídla dne')}</div></div>

<div class="feature"><div class="feature-text"><span class="badge">${icon('heart')}</span><h3>Spánek a regenerace</h3>
<p>Spánek, HRV, klidový tep a hmotnost z Google Health porovná s tvým třicetidenním průměrem. Když tělo nestíhá, řekne ti to dřív, než to poznáš na výkonu.</p>
<ul>${check('Spánek, spánkový dluh a rytmus')}${check('HRV a klidový tep proti tvému normálu')}${check('Doporučení, jak dnes trénovat')}</ul></div>
<div class="frame">${shot('recovery', 'Obrazovka Zdraví: spánkové a regenerační skóre, HRV a klidový tep')}</div></div>

<div class="feature flip"><div class="feature-text"><span class="badge">${icon('spark')}</span><h3>Asistent, který zná tvůj plán</h3>
<p>Zeptej se, jak jet trénink po krátké noci, nebo ať ti přeplánuje týden. Vidí tvoje data, takže neradí obecně. Každý návrh můžeš potvrdit, odmítnout nebo probrat.</p>
<ul>${check('Rady podle tvých dat, ne obecné tipy')}${check('Úpravy tréninku a jídelníčku na klik')}${check('Chaty k jednotlivým dnům a týdnům')}</ul></div>
<div class="frame tall">${shot('coach', 'Osobní asistent v aplikaci: Co dnes upravíme?', {width:430, height:710})}</div></div>

<div class="extras">
<div class="card"><span class="badge">${icon('calendar')}</span><h3>Plán na týden</h3><p>Vygeneruje tréninky na kolo, běh i posilovnu podle toho, kolik máš kdy času.</p></div>
<div class="card"><span class="badge">${icon('gym')}</span><h3>Posilovna krok za krokem</h3><p>Série, váhy a technika cviků při tréninku, mapa zapojených svalů po něm.</p></div>
<div class="card"><span class="badge">${icon('device')}</span><h3>Na počítači i v mobilu</h3><p>Funguje v prohlížeči a dá se přidat na plochu telefonu jako aplikace.</p></div>
</div>
</div></section>

<section id="jak"><div class="wrap">
<div class="section-head"><div class="eyebrow">Jak to funguje</div><h2>Tři kroky a máš přehled</h2></div>
<div class="steps">
<div class="card"><h3>Přihlas se Googlem</h3><p>Účet vznikne s pozvánkou, žádné nové heslo.</p></div>
<div class="card"><h3>Propoj svoje služby</h3><p>Intervals.icu pro tréninky a Google Health pro spánek, zdraví a jídlo. Jen to, co sám povolíš.</p></div>
<div class="card"><h3>Ráno otevři Dnes</h3><p>Uvidíš, jak jsi na tom, co tě čeká a kolik dnes sníst.</p></div>
</div>
</div></section>

<section id="soukromi"><div class="wrap">
<div class="section-head"><div class="eyebrow">Data a soukromí</div><h2>Tvoje data slouží jen tobě</h2></div>
<div class="privacy">
<div class="card"><h3>Co Loadwise s daty dělá</h3><ul>
<li>Čte jen data ze služeb, ke kterým mu sám dáš přístup.</li>
<li>Používá je jen pro funkce, které si vyžádáš: přehled, plán a výživu.</li>
<li>Data neprodává a nepoužívá k reklamě.</li>
<li>Do Google Health zapisuje jen jídlo a pití, které si sám zapíšeš.</li>
</ul><p style="margin:16px 0 0"><a href="/privacy">Celé zásady ochrany soukromí</a></p></div>
<div class="card" lang="en"><h3>Google Health data disclosure</h3>
<p>Loadwise (Petr Fitness Data) is a personal training service that organizes training history, generates strength workouts, uses cycling context, and supports nutrition workflows.</p>
<p>With your authorization, the service may read fitness, health-metric, sleep, and nutrition data from Google Health. It may also add nutrition logs to Google Health when you ask the service to record food or drinks. This data is used only for the requested training and nutrition features.</p>
<p style="margin:0">The service can process training and fitness data from connected services, including Google data and Google Sheets data that the account owner has authorized, in order to provide these requested workflows.</p></div>
</div>
</div></section>

<section class="cta"><div class="wrap">
<h2>Máš pozvánku?</h2>
<p>Loadwise je zatím jen pro pozvané. Přihlas se Google účtem, na který pozvánka přišla.</p>
<a class="btn primary big" href="/app">Přihlásit se</a>
</div></section>
</main>`
  });
}

const doc = (title, html) => sitePage({title: `${title} · Loadwise`, description: `${title} for Loadwise (petrfitnessdata.eu).`, lang: 'en', body: `<main class="wrap doc"><h1>${title}</h1>${html}</main>`});

export function privacyPage() {
  return doc('Privacy Policy', `<p><strong>Loadwise</strong> (Petr Fitness Data, petrfitnessdata.eu) is a personal training service for training, recovery and nutrition.</p><h2>What data the service may access</h2><p>When authorized by the account owner, the service may access fitness and training information from connected Google services and other configured services. This can include Google Sheet workout data, training history, planned workouts, cycling context, recovery metrics, nutrition information, and other fitness data needed for the requested workflows.</p><h2>How Google data is used</h2><p>Google user data is used only to provide the training and nutrition workflows requested by the account owner, such as reading and updating the configured workout spreadsheet, processing authorized fitness data, reading authorized nutrition logs, and adding nutrition logs that the account owner asks the service to record. The service does not sell Google user data and does not use it for advertising.</p><h2>Storage and sharing</h2><p>Data may be processed and stored in the private health-api backend, its configured database, and connected services such as the account owner's Google Sheet. Data may be transmitted between these configured services when necessary to provide the requested functionality. The service does not intentionally disclose personal data to unrelated third parties.</p><h2>Security</h2><p>OAuth credentials and API secrets are intended to be stored as private service secrets rather than in the source code repository. Access to the service is controlled by the configured authentication mechanisms.</p><h2>Changes</h2><p>This policy may be updated when the service or its data practices change. The current version is published on this page.</p><h2>Contact</h2><p>For support or privacy questions, use the <a href="/support">Support</a> page.</p>`);
}

export function termsPage() {
  return doc('Terms of Use', `<p>Loadwise is provided for personal training organization and planning. You are responsible for the accuracy of connected data and for deciding whether a generated workout is appropriate for you. The app does not provide medical diagnosis or emergency care. Use of the app requires authorization to the connected health-api service.</p>`);
}

export function supportPage() {
  return doc('Support', `<p>Support for Loadwise is provided through the project repository and its maintainer. Include the affected tool name, approximate time, and non-sensitive error message when reporting a problem. Never include API keys, OAuth refresh tokens, or other secrets in a support request.</p>`);
}
