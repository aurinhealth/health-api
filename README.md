# health-api

Cloudflare Worker za aplikací **Loadwise** (`https://petrfitnessdata.eu`): dashboard (`/app`), trenér cyklistiky, běhu a posilovny, výživa a deník jídla, MCP server pro ChatGPT a automatizace z GitHub Actions. Data jsou v D1 (`health-data`), zdroje jsou Google Health a Intervals.icu.

## Lokálně

Potřebuješ Node 22 (testy používají `node:sqlite`).

```sh
npm test              # všechny testy (node --test)
npm run check         # kontrola syntaxe všech modulů
npm run migrate:local # D1 migrace do lokální databáze
npm run dev           # wrangler dev; secrets dej do .dev.vars
```

Na produkci se nasazuje jen přes GitHub Actions (`.github/workflows/deploy-worker.yml`) po pushi do `main`. Nejdřív proběhnou testy, pak D1 migrace, deploy a smoke testy proti produkci.

## Jak teče požadavek

`src/entrypoint.js` je vstupní bod Workeru. Řeší přihlášení (`dashboard-auth.js`), uživatele (`tenancy.js`), dashboard API (`/app/api/*`), MCP (`/mcp`) a automatizace (`/automation/*`). Co nezpracuje sám, posílá dál vrstvami, z nichž každá přepisuje pár cest a zbytek předá níž:

```
entrypoint.js → sheets-gateway.js → v400.js → v323fix.js → v323.js → index.js
```

- `sheets-gateway.js`: síla, výživa, denní plán, rozhodnutí dne (`/strength/*`, `/nutrition/*`, `/daily/plan`, …).
- `v400.js`: `/analysis/energy`, `/analysis/day-plan`, `/food/day-plan`.
- `v323fix.js`: opravuje klasifikaci plánovaných tréninků z Intervals.icu pro všechny cesty pod sebou.
- `v323.js`: `/food/recommend` (doporučení jídel k osobnímu cíli) a kontext tréninku k `/analysis/energy`.
- `index.js`: původní API: synchronizace Google Health a Intervals.icu, `/analysis/daily`, deník jídla, cron.

Vzhled dashboardu: barvy rozhraní jsou tokeny v `src/design-system.js` (načítá se jako poslední vrstva CSS), ikony jsou jedna SVG sada v `src/icons.js`. Ostatní odstíny se z tokenů míchají, např. `color-mix(in srgb,var(--text) 12%,var(--bg))`; barvu natvrdo pro plochy, čáry a šedé texty test `tests/design-tokens.test.mjs` nepustí. Světlý vzhled jen předefinuje tokeny (`:root[data-theme="light"]` a stejná sada pro systémové nastavení). Volbu Systém / Světlý / Tmavý z horní lišty nebo Nastavení drží cookie `lw-theme`, kterou stránka čte ještě před vykreslením. Barvy dat v grafech (makra, fáze spánku, zóny) zůstávají u grafů.

Nová logika patří do samostatných modulů v `src/` volaných z `entrypoint.js` nebo `sheets-gateway.js`, ne do vrstev `v*.js`. Ty se postupně ruší.

Kalorický cíl, který vidí uživatel, je vyšší ze dvou hodnot (`applyEnergyBudget` v `energy-budget.js`): očekávaný den z profilu (`nutrition.calorieTarget` z `/analysis/daily`) a průběžný rozpočet z aktivní energie naměřené Google Health. Ráno tak cíl neleží na minimu a během aktivního dne roste.

Základ cíle je osobní (`energy-profile.js`): klidový metabolismus podle Mifflin-St Jeor (pohlaví, věk, výška, váha) × denní aktivita mimo sport, minus týdenní cíl (hubnutí, udržování, přibírání). Trénink přidávají propojené zdroje; bez nich odhad sportu z profilu. Propojení Google Health a Intervals.icu je volitelné: bez něj dashboard běží z ručních záznamů. S Google Health se výška, denní aktivita (z průměru kroků za 28 dní), klidový tep (průměr 30 dní) a maximální tep (nejvyšší z aktivit Intervals.icu a Google Health za 6 měsíců) doplní samy (`profile-suggestions.js`, řádek `dashboard_profile` id=2); vlastní hodnoty z profilu mají vždy přednost. Pohlaví Google Health API neposkytuje a věk jen s oprávněním profilu, které aplikace nežádá. Bez váhy nebo úplného profilu se cíl nepočítá a dashboard řekne, co chybí. Správce si do vyplnění profilu ponechává dřívější kalibraci (2550 kcal klidový výdej, −550 kcal).

Věk se počítá z data narození v profilu, takže se aktualizuje sám.

**Apple Health** nemá webové API. Data z iPhonu a Apple Watch přicházejí přes Intervals.icu (aplikace IntervalsWellnessSync, Intervals Companion nebo Health Sync zapisují wellness do Intervals) nebo přes aplikaci Google Health na iPhonu (import z Apple Health). Noci, které Google Health nemá, doplní `/app/api/sleep` a trenér z wellness Intervals.icu (`intervals-sleep.js`: délka a skóre spánku, bez fází). Návod je v Nastavení u připojení.

**Váha** je stejná v aplikaci, Google Health a Intervals.icu (`weight-sync.js`). Ručně zapsaná váha jde hned do Google Health i Intervals.icu. Jednou za hodinu (v :30) se porovná posledních 14 dní: váha z Google Health (chytrá váha) jde do Intervals.icu, váha zapsaná v Intervals.icu do Google Health (a odtud do aplikace), bez Google Health rovnou do aplikace. Když se hodnoty za stejný den liší, platí Google Health. Zapsané hodnoty si sync pamatuje, aby nezapisoval dvakrát.

**Wellness do Intervals.icu** (`wellness-sync.js`): spánek, průměrný tep ve spánku, kroky, klidový tep, HRV, SpO2, dech, VO2max a tělesný tuk z Google Health se každou hodinu (v :30) a po tlačítku synchronizace zapíšou do wellness v Intervals.icu za posledních 14 dní. Pole se zapíše jen tehdy, když je v Intervals prázdné, nebo když ho tam zapsala tahle synchronizace. Data z jiných zdrojů (Garmin, ruční zápis) se nepřepisují.

## Cron

- `* * * * *`: zpracuje frontu synchronizace Google Health, jednou za hodinu stáhne nedávná data.
- `5 1 * * *`: noční údržba (plná synchronizace Google, Intervals.icu, párování aktivit).

Obojí běží pro každého uživatele s připojenými službami.

## Secrets a proměnné

Nastavují se v Cloudflare (`wrangler secret put NAZEV`), ne v repozitáři.

| Název | K čemu |
| --- | --- |
| `STRENGTH_API_KEY` | API klíč správce (MCP, interní volání, automatizace); zadává se při autorizaci OAuth. Klienti OAuth (ChatGPT) dostanou místo něj podepsaný token jen pro `/mcp` s platností 1 hodina. Odvozuje se z něj i šifrovací klíč připojení uživatelů, proto ho neměň bez migrace uložených připojení. |
| `SESSION_SECRET` | Podpis přihlášení do dashboardu. Když chybí, použije se `STRENGTH_API_KEY`. Nastavení nebo změna jednou odhlásí všechny uživatele. |
| `MCP_API_KEY` | Volitelně samostatný klíč pro `/mcp`; jinak platí `STRENGTH_API_KEY`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Přihlášení přes Google a připojení Google Health. |
| `INTERVALS_API_KEY` | Intervals.icu správce (ostatní uživatelé si klíč ukládají v aplikaci). |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Asistent trenéra a čtení fotek jídla (volitelně `OPENAI_VISION_MODEL`, jinak `OPENAI_LIGHT_MODEL`). |
| `OWNER_EMAIL` | Správce aplikace (ve `wrangler.jsonc`). |

Google OAuth: připojení žádá jen scopes Google Health (`google-scopes.js`). Tlačítko „Rozšířit oprávnění Google“ v Nastavení si zvlášť vyžádá zápis váhy (`googlehealth.health_metrics_and_measurements.writeonly`) a datum narození (`user.birthday.read`, People API); obojí musí být povolené na OAuth consent screen a People API zapnuté v Google Cloud. Udělená oprávnění se ukládají k připojení uživatele.

GitHub Actions potřebují `CLOUDFLARE_API_TOKEN` a `CLOUDFLARE_ACCOUNT_ID`; automatizace se k API přihlašují tokenem GitHub OIDC.

## Další dokumentace

- `docs/multi-user-setup.md`: více uživatelů, pozvánky, připojení.
- `docs/workout-library.md`, `docs/cycling-coach-v2.md`: knihovna tréninků a trenér cyklistiky.
- `docs/adaptive-planning.md`: běžná dostupnost, týdenní výjimky, stavy a osobní asistent.
- `docs/food-data-sources.md`: odkud jsou hodnoty potravin (etiketa, moje potraviny, kuchařka).
- `docs/chatgpt-plugin-submission.md`: MCP / ChatGPT.
