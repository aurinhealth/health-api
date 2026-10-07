# health-api

Cloudflare Worker za aplikací **Loadwise** (`https://petrfitnessdata.eu`): dashboard (`/app`), trenér cyklistiky, běhu a posilovny, výživa a deník jídla, MCP server a automatizace z GitHub Actions. Data jsou v D1 (`health-data`), zdroje jsou Google Health a Intervals.icu.

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

`src/entrypoint.js` je vstupní bod Workeru. Řeší přihlášení (`dashboard-auth.js`), uživatele (`tenancy.js`), dashboard API (`/app/api/*`), MCP (`/mcp`) a automatizace (`/automation/*`). Co nezpracuje sám, posílá dál:

```
entrypoint.js → strength-gateway.js → index.js
```

- `strength-gateway.js`: síla, výživa, denní plán, rozhodnutí dne (`/strength/*`, `/nutrition/*`, `/daily/plan`, …) a `/food/recommend` (návrhy jídel k osobnímu cíli z `food-recommend.js`).
- `index.js`: původní API: synchronizace Google Health a Intervals.icu, `/analysis/daily`, `/analysis/energy`, deník jídla, cron.

Vzhled dashboardu: barvy rozhraní jsou tokeny v `src/design-system.js` (načítá se jako poslední vrstva CSS), ikony jsou jedna SVG sada v `src/icons.js`. Ostatní odstíny se z tokenů míchají, např. `color-mix(in srgb,var(--text) 12%,var(--bg))`; barvu natvrdo pro plochy, čáry a šedé texty test `tests/design-tokens.test.mjs` nepustí. Světlý vzhled jen předefinuje tokeny (`:root[data-theme="light"]` a stejná sada pro systémové nastavení). Bez volby se vzhled řídí nastavením zařízení. Přepínač Světlý / Tmavý v horní liště nebo Nastavení ho přepíše přes cookie `lw-theme`, kterou stránka čte ještě před vykreslením; volba stejného vzhledu, jaký má zařízení, cookie smaže. Barvy dat v grafech (makra, fáze spánku, zóny) zůstávají u grafů.

Veřejný web: úvodní stránka Přehled na `/` a stránky `/privacy`, `/terms`, `/support` jsou v `src/site-pages.js`. Berou stejné tokeny a přepínač vzhledu jako aplikace. Snímky obrazovek jsou v `public/site/` (statické soubory Workeru, každý ve světlé i tmavé verzi) (`phone-*` z mobilu 390×844 @2x, `today-*` z počítače) a vznikají ze sandboxu `scripts/sandbox-preview.mjs`. Anglický odstavec „Google Health data disclosure“ na úvodní stránce musí zůstat kvůli ověření aplikace u Googlu.

Nová logika patří do samostatných modulů v `src/` volaných z `entrypoint.js` nebo `strength-gateway.js`.

Kalorický cíl, který vidí uživatel, je vyšší ze dvou hodnot (`applyEnergyBudget` v `energy-budget.js`): očekávaný den z profilu (`nutrition.calorieTarget` z `/analysis/daily`) a průběžný rozpočet z aktivní energie naměřené Google Health. Ráno tak cíl neleží na minimu a během aktivního dne roste. Očekávaný den počítá s každým sportem z Intervals.icu (kolo, běh, posilovna, chůze, plavání); záznam Google Health téhož tréninku (stejný druh sportu do 20 minut, v pražském čase) se nezapočítá podruhé. Běh a chůze bez naměřených kalorií se odhadují podle tělesné hmotnosti, kolo podle dohodnutých 500/600 kcal/h. Bílkoviny se nad BMI 30 počítají z hmotnosti při BMI 27. Dnes a dopředu cíl koriguje vývoj váhy (aspoň 4 vážení za 3 týdny) podle energetické bilance: tempo váhy je sklon lineární regrese všech vážení, rozdíl proti zvolenému tempu × 7700 kcal/kg, polovina, nejvýš ±250 kcal (`trendAdjustment` v `energy-profile.js`). Když cíl drží bezpečné minimum (klidový metabolismus, nejméně 1200/1500 kcal), aplikace řekne, že hubnutí půjde pomaleji než zvolené tempo. Do Intervals.icu se kalorie nezapisují vůbec (ani odhady k tréninkům, ani denní poznámky); automatizace `planned-calories` a `nutrition-notes` jen odstraňují to, co tam aplikace zapsala dřív.

Základ cíle je osobní (`energy-profile.js`): klidový metabolismus podle Mifflin-St Jeor (pohlaví, věk, výška, váha) × denní aktivita mimo sport, minus týdenní cíl (hubnutí nebo udržování; cíl přibírání zatím aplikace nemá). Trénink přidávají propojené zdroje; bez nich odhad sportu z profilu. Propojení Google Health a Intervals.icu je volitelné: bez něj dashboard běží z ručních záznamů. S Google Health se výška, denní aktivita (z průměru kroků za 28 dní), klidový tep (průměr 30 dní) a maximální tep (nejvyšší z aktivit Intervals.icu a Google Health za 6 měsíců) doplní samy (`profile-suggestions.js`, řádek `dashboard_profile` id=2); vlastní hodnoty z profilu mají vždy přednost. Pohlaví Google Health API neposkytuje a věk jen s oprávněním profilu, které aplikace nežádá. Bez váhy nebo úplného profilu se cíl nepočítá a dashboard řekne, co chybí. Správce si do vyplnění profilu ponechává dřívější kalibraci (2550 kcal klidový výdej, −550 kcal).

Věk se počítá z data narození v profilu, takže se aktualizuje sám.

**Regenerace, spánek a zátěž** počítá jeden model v `src/recovery-model.js` pro dashboard i trenéry (HRV jako lnRMSSD, klidový tep a spánek proti osobní 60denní baseline; potřeba spánku podle NSF; celodenní zátěž z tepových zón Google Health jako TRIMP). Klient nese jeho přesnou kopii: po změně modulu spusť `node scripts/sync-recovery-model.mjs`, test `tests/recovery-model.test.mjs` hlídá shodu. Metody a zdroje ke každé funkci jsou v `docs/methodology.md`. Jestli index regenerace u konkrétního sportovce sedí na průběh tréninků, ukáže `GET /app/api/recovery-validation` (přes více sportovců `scripts/recovery-validation-rmcorr.mjs`).

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
| `STRENGTH_API_KEY` | API klíč správce (MCP, interní volání, automatizace). Odvozuje se z něj i šifrovací klíč připojení uživatelů, proto ho neměň bez migrace uložených připojení. |
| `SESSION_SECRET` | Podpis přihlášení do dashboardu. Když chybí, použije se `STRENGTH_API_KEY`. Nastavení nebo změna jednou odhlásí všechny uživatele. |
| `MCP_API_KEY` | Volitelně samostatný klíč pro `/mcp`; jinak platí `STRENGTH_API_KEY`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Přihlášení přes Google a připojení Google Health. |
| `INTERVALS_API_KEY` | Intervals.icu správce (ostatní uživatelé si klíč ukládají v aplikaci). |
| `INTERVALS_CLIENT_ID`, `INTERVALS_CLIENT_SECRET` | Volitelné: aplikace zaregistrovaná u Intervals.icu. S nimi se Intervals.icu připojuje jedním tlačítkem (OAuth, `intervals-oauth.js`), bez nich vložením osobního API klíče. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Asistent trenéra a čtení fotek jídla (volitelně `OPENAI_VISION_MODEL`, jinak `OPENAI_LIGHT_MODEL`). |
| `AI_DAILY_LIMIT_USD` | Volitelný denní limit útraty za AI na jednoho uživatele v USD (výchozí 1; `0` vypne AI všem kromě správce). Správce limit nemá. |
| `OWNER_EMAIL` | Správce aplikace (ve `wrangler.jsonc`). |

Google OAuth: připojení žádá jen scopes Google Health (`google-scopes.js`). Tlačítko „Rozšířit oprávnění Google“ v Nastavení si zvlášť vyžádá zápis váhy (`googlehealth.health_metrics_and_measurements.writeonly`) a datum narození (`user.birthday.read`, People API); obojí musí být povolené na OAuth consent screen a People API zapnuté v Google Cloud. Udělená oprávnění se ukládají k připojení uživatele. Na souhlasové obrazovce Googlu jde jednotlivá oprávnění odškrtnout: token se pak žádá jen pro udělená (`healthScopes`), data bez oprávnění zůstanou prázdná a Nastavení → Propojení ukáže, co chybí, s tlačítkem „Povolit chybějící“.

Intervals.icu tlačítkem (OAuth): aplikaci zaregistruj e-mailem u podpory Intervals.icu (název, popis, web, logo, odkaz na zásady soukromí, Intervals ID a přesměrování `https://petrfitnessdata.eu/oauth/intervals/callback`), pak nastav `INTERVALS_CLIENT_ID` a `INTERVALS_CLIENT_SECRET`. Žádá `ACTIVITY:WRITE`, `WELLNESS:WRITE`, `CALENDAR:WRITE` a `SETTINGS:READ`. Token nevyprší; uloží se šifrovaně jako připojení `intervals` (s předponou `Bearer `) a všechny požadavky na Intervals berou hlavičku z `intervals-auth.js`.

Průvodce nastavením je popsaný v `docs/account-workflow.md`. Krok se službami používá stejné karty jako Nastavení → Propojení a stránky Googlu i Intervals.icu vracejí zpět do průvodce; poslední obrazovka ukáže denní kalorický cíl. Co aplikace drží v zařízení (poslední den, profil, chat), patří jednomu účtu: stránka nese id přihlášeného (`<meta name="lw-account">`) a po přihlášení jiného účtu v tomtéž prohlížeči se to smaže.

AI limit (`ai-usage.js`): každé volání modelu jde přes `callOpenAI`, které před dotazem zkontroluje dnešní útratu uživatele a po odpovědi ji zapíše do tabulky `ai_usage` (funkce, model, tokeny, cena podle `MODEL_PRICES`). Po dosažení limitu vrací API 429 se zprávou, že se limit zítra obnoví; den se počítá v pražském čase. Útrata za dnešek je vidět v Nastavení → Účet. Limit je místo, kde by placený tarif zvedal strop.

Rychlost: Worker má zapnuté Smart Placement (`wrangler.jsonc`), takže běží blízko databáze D1, když je to rychlejší. Stav je v Cloudflare v Workers → health-api → Settings → Placement.

GitHub Actions potřebují `CLOUDFLARE_API_TOKEN` a `CLOUDFLARE_ACCOUNT_ID`; automatizace se k API přihlašují tokenem GitHub OIDC.

## Testovací kopie (staging)

Na https://staging.petrfitnessdata.eu/app běží kopie aplikace s vlastní databází `health-data-staging` (`env.staging` ve `wrangler.jsonc`). Workflow `deploy-staging.yml` na ni nasadí každý push do otevřeného pull requestu (nebo ručně vybranou větev), takže se změna dá vyzkoušet před „mergni“. Živá verze se nasazuje dál jen z `main`.

- Prázdná databáze dostane strukturu živé databáze (bez dat) ze `staging/schema.sql`, potom běží migrace jako v produkci.
- Data: `scripts/copy-owner-data.mjs` jednou zkopíruje data správce (`OWNER_EMAIL`) ze živé databáze, kterou jen čte. Nekopíruje přihlašovací klíče ke Googlu a Intervals.icu, stav synchronizace ani data pozvaných uživatelů. Znovu se kopíruje jen při ručním spuštění workflow s volbou `refresh_data` (přepíše, co v kopii je).
- Každá stránka má dole štítek „TEST · staging“ a hlavičku `noindex`.
- Nemá cron, sama nic nesynchronizuje do Google ani Intervals.icu.
- Secrets se nastavují zvlášť u Workeru `health-api-staging` (v Cloudflare nebo `wrangler secret put NAZEV --env staging`). Pro přihlášení stačí `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (stejné jako v produkci) a `STRENGTH_API_KEY` (u stagingu vlastní, libovolný dlouhý náhodný řetězec); v Google Cloud musí OAuth klient mít navíc přesměrování `https://staging.petrfitnessdata.eu/auth/google/callback` a `https://staging.petrfitnessdata.eu/oauth/google/callback`. Pro asistenta a fotky jídla volitelně `OPENAI_API_KEY`.
- `INTERVALS_API_KEY` ani připojení Google Health ve stagingu raději nenastavuj: pracují se skutečnými účty, takže by se zápisy (tréninky, váha) propsaly i tam.

## Bezpečnost

- Cloudflare spouští `src/main.js`: aplikaci z `entrypoint.js` za přesměrováním na HTTPS a bezpečnostními hlavičkami (`web-security.js`: HSTS, zákaz vložení do cizí stránky, `nosniff`, `Referrer-Policy`). Hlavičku, kterou si odpověď nastaví sama, nepřepisuje.
- Repozitář je veřejný, a s ním i logy GitHub Actions. Workflow proto z odpovědí API vypisují jen souhrn ze `scripts/ci-summary.mjs` (stav, zpráva, počty), nikdy celé tělo, a nic necommitují zpět. Hlídá to `tests/ci-summary.test.mjs`.
- Zápis dat patří do POST (nebo PUT, DELETE), ne do GET: odkaz z cizího webu je GET a cookie přihlášení s sebou nese.
- Připojení ChatGPT k datům aplikace (OAuth na `/authorize` a `/token`, kde se do formuláře zadával klíč správce) je odstraněné. `/mcp` přijímá jen klíč správce v hlavičce `Authorization` a demo klíč, který vrací jen statická ukázková data.

## Další dokumentace

- `docs/multi-user-setup.md`: více uživatelů, pozvánky, připojení.
- `docs/workout-library.md`, `docs/cycling-coach-v2.md`: knihovna tréninků a trenér cyklistiky.
- `docs/adaptive-planning.md`: běžná dostupnost, týdenní výjimky, stavy a osobní asistent.
- `docs/food-data-sources.md`: odkud jsou hodnoty potravin (etiketa, moje potraviny, kuchařka).
