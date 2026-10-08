# Více uživatelů: nastavení a správa

Aplikace podporuje víc uživatelů. Každý se přihlašuje svým Google účtem, má vlastní připojení Google Health a Intervals.icu a vidí jen svoje data.

## Jednorázové nastavení (správce)

1. **Google Cloud Console → APIs & Services → Credentials →** OAuth klient, jehož Client ID je v secretu `GOOGLE_CLIENT_ID`. Do *Authorized redirect URIs* přidej:
   - `https://petrfitnessdata.eu/auth/google/callback` (přihlášení)
   - `https://petrfitnessdata.eu/oauth/google/callback` (připojení Google Health; už by tam mělo být)
2. Správce aplikace je účet z `OWNER_EMAIL` ve `wrangler.jsonc`. Všechna data, která v aplikaci existovala před zavedením více uživatelů, patří tomuto účtu.

Secret `ALLOWED_GOOGLE_EMAILS` už potřeba není.

## Pozvání uživatele

1. V aplikaci otevři **Nastavení → Uživatelé** a zadej e-mail Google účtu.
2. Přihlášení přes Google funguje pro každého pozvaného hned: žádá jen e-mail (`openid email`) a na ty se ověření ani testovací režim nevztahují. Ověření se týká jen připojení Google Health:
   - Projekt ve stavu *Testing*: přidej stejný e-mail i do **Google Cloud Console → Google Auth Platform → Audience → Test users** (nejvýš 100 lidí). Souhlas s Google Health jim vyprší po 7 dnech a musí se připojit znovu.
   - Projekt zveřejněný (*In production*), ale neověřený: seznam Test users není potřeba a souhlas nevyprší. Uživatel jen potvrdí varování, že aplikace není ověřená. Google Health takto připojí nejvýš 100 lidí, víc až po ověření aplikace Googlem.
3. Pošli uživateli odkaz `https://petrfitnessdata.eu/app`. Po přihlášení ho provede průvodce nastavením (podrobně `docs/account-workflow.md`):
   - **Propojení**: Google Health tlačítkem (souhlas na stránce Google), Intervals.icu tlačítkem, když je aplikace zaregistrovaná u Intervals.icu (`INTERVALS_CLIENT_ID`, `INTERVALS_CLIENT_SECRET`), jinak vložením API klíče z *Settings → Developer Settings* podle návodu v okně. Athlete ID není potřeba, aplikace ho zjistí z klíče.
   - **Profil a kalorie**: pohlaví, věk, výška, váha, pohyb přes den, sport za týden a cíl.
   - **Tvůj trénink**: hlavní sport a cíl, zkušenost, vybavení a čas na sport pro každý den; potom obrazovka s kalorickým cílem a co dál.

Propojení není povinné: stačí jedna služba, nebo žádná; uživatel pak zapisuje váhu a jídlo ručně a kalorický cíl se počítá z profilu. Průvodce jde znovu spustit v Nastavení → Účet; propojit služby jde kdykoli v Nastavení → Propojení.

Silový plán (Gym) má každý uživatel vlastní. Plán dne je v databázi (tabulka `gym_plans`) a odcvičené série se ukládají do historie (`strength_sets`). Google Sheets se už nepoužívá.

Katalog cviků odpovídá vybavení pobočky **METAGYM Kutná Hora** (`src/gym-equipment.js`, podle https://metagym.cz/kutnahora; ostatní pobočky mají jiné vybavení). Každý cvik má přiřazené stanoviště. Generátor nabídne jen cviky, pro které pobočka má vybavení. Kutná Hora nemá stojan na dřepy, proto se dřepy dělají na Pendulum squat nebo Pivot leg press.

## Přihlášení přes Apple (volitelné)

Tlačítko „Přihlásit se přes Apple“ se ukáže, až jsou nastavené všechny čtyři secrets `APPLE_*` (`src/apple-login.js`). Potřebuješ placený Apple Developer Program.

1. **Certificates, Identifiers & Profiles → Identifiers → App IDs**: App ID (např. `eu.petrfitnessdata.app`) se zapnutou schopností *Sign in with Apple*.
2. **Identifiers → Services IDs**: nový Services ID (např. `eu.petrfitnessdata.web`), zapni *Sign in with Apple*, *Configure*: primární App ID z bodu 1, doména `petrfitnessdata.eu`, Return URL `https://petrfitnessdata.eu/auth/apple/callback` (pro testovací kopii i `https://staging.petrfitnessdata.eu/auth/apple/callback` a doménu `staging.petrfitnessdata.eu`). Kdyby Apple chtěl ověřit doménu souborem, ulož jeho obsah do secretu `APPLE_DOMAIN_ASSOCIATION`.
3. **Keys**: nový klíč se schopností *Sign in with Apple* (primární App ID z bodu 1), stáhni soubor `.p8` (jde stáhnout jen jednou) a poznamenej si Key ID.
4. V Cloudflare nastav secrets: `APPLE_CLIENT_ID` = Services ID z bodu 2, `APPLE_TEAM_ID` = Team ID (vpravo nahoře v Apple Developer), `APPLE_KEY_ID` = Key ID, `APPLE_PRIVATE_KEY` = celý obsah souboru `.p8`.

Pozvánky fungují stejně jako u Googlu: účet vznikne, když Apple potvrdí pozvaný e-mail. Kdo u Apple zvolí *Skrýt můj e-mail*, dostane aplikace jinou adresu; takový uživatel se přihlásí přes Google a Apple si připojí v **Nastavení → Účet → Připojit Apple** (nebo pozvi přímo tu skrytou adresu). Propojená Apple ID jsou v tabulce `user_identities`.

## Přístupové klíče (passkeys)

Fungují hned, nic se nenastavuje (`src/passkeys.js`, ověřování v `src/webauthn.js`). Přihlášený uživatel si v **Nastavení → Účet → Přístupové klíče → Přidat** uloží klíč do telefonu, počítače nebo správce hesel a příště zvolí **Přihlásit se přístupovým klíčem**. Klíč odemyká otisk prstu, obličej nebo zámek obrazovky (aplikace ověření uživatele vyžaduje). Server má jen veřejný klíč (tabulka `user_passkeys`), výzvy k podpisu platí 5 minut a jdou použít jednou (`auth_challenges`). Klíč patří k doméně, na které vznikl: klíče z testovací kopie na živé aplikaci nefungují a naopak.

## Přihlášení kódem z e-mailu (volitelné)

Pro pozvané bez účtu Google: zadají e-mail a přijde jim šestimístný kód (platí 10 minut, 5 pokusů, nejvýš 1 kód za minutu a 10 denně na adresu; `src/email-login.js`). Kód dostanou jen aktivní uživatelé, pozvané adresy a správce, ostatním aplikace odpoví stejně, ale nic nepošle. E-maily posílá Cloudflare Email Service přes binding `EMAIL` ve `wrangler.jsonc` (v plánu Workers Paid je 3 000 e-mailů měsíčně v ceně). Zapnutí:

1. **Cloudflare → Compute → Email Service → Email Sending → Onboard Domain**: vyber `petrfitnessdata.eu` a nech Cloudflare přidat DNS záznamy (SPF, DKIM, DMARC a MX `cf-bounce`).
2. Worker `health-api` → **Settings → Variables and Secrets**: secret `EMAIL_FROM` = adresa odesílatele na té doméně, např. `noreply@petrfitnessdata.eu`. Pro testovací kopii totéž u `health-api-staging`.

Bez `EMAIL_FROM` se formulář s kódem na přihlašovací obrazovce neukáže. Když je e-mail zapnutý, dostane uživatel e-mail i ve chvíli, kdy si přidá přístupový klíč.

## Smazání účtu

Každý uživatel kromě správce si může v **Nastavení → Účet** stáhnout všechna svoje data a smazat účet (`src/account-data.js`, podrobně v [account-workflow.md](account-workflow.md)). Smazání nejdřív vrátí Googlu souhlas k Google Health, pak smaže řádky účtu ve všech osobních tabulkách (`PERSONAL_TABLES` v `src/tenancy.js`, včetně propojených Apple ID v `user_identities`) a nakonec samotného uživatele. Nová tabulka se sloupcem `user_id` proto patří do `PERSONAL_TABLES`, jinak ji stažení i smazání vynechá. Co už bylo zkopírované do Intervals.icu nebo Google Health, tam zůstane. Odpojení Google Health v Nastavení přístup u Googlu taky zruší.

## Co zatím zůstává jen pro správce

- GitHub automatizace silového plánu. Synchronizace Intervals a denní výživové poznámky už běží pro každého uživatele zvlášť.

## Aktualizace databáze po nasazení

Při prvním spuštění nové verze se ke všem osobním tabulkám doplní `user_id`. Velké tabulky se kopírují po dávkách. Během toho API krátce vrací HTTP 503 a deploy workflow počká, než aktualizace skončí. Při přerušení aktualizace pokračuje tam, kde skončila. D1 Time Travel navíc umožňuje obnovit databázi do stavu před aktualizací.
