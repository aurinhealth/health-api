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
2. Dokud Google aplikaci neověří (OAuth consent screen je ve stavu *Testing*), přidej stejný e-mail i do **Google Cloud Console → OAuth consent screen → Test users**. Bez toho Google připojení Google Health odmítne. Limit je 100 testovacích uživatelů.
3. Pošli uživateli odkaz `https://petrfitnessdata.eu/app`. Po přihlášení ho aplikace provede připojením:
   - **Google Health**: souhlas na stránce Google.
   - **Intervals.icu**: API klíč z *Settings → Developer Settings*. Athlete ID není potřeba, aplikace ho zjistí z klíče.

Propojení není povinné. Průvodce lze přeskočit tlačítkem *Pokračovat bez propojení*; uživatel pak zapisuje váhu a jídlo ručně a kalorický cíl se počítá z profilu (pohlaví, věk, výška, váha, denní aktivita, sport za týden a cíl). Propojit služby jde kdykoli v Nastavení.

Silový plán (Gym) má každý uživatel vlastní. Plán dne je v databázi (tabulka `gym_plans`) a odcvičené série se ukládají do historie (`strength_sets`). Google Sheets se už nepoužívá.

Katalog cviků odpovídá vybavení pobočky **METAGYM Kutná Hora** (`src/gym-equipment.js`, podle https://metagym.cz/kutnahora; ostatní pobočky mají jiné vybavení). Každý cvik má přiřazené stanoviště. Generátor nabídne jen cviky, pro které pobočka má vybavení. Kutná Hora nemá stojan na dřepy, proto se dřepy dělají na Pendulum squat nebo Pivot leg press.

## Co zatím zůstává jen pro správce

- Přístup přes MCP / ChatGPT (sdílený klíč `STRENGTH_API_KEY` pracuje s daty správce).
- GitHub automatizace silového plánu. Synchronizace Intervals a denní výživové poznámky už běží pro každého uživatele zvlášť.

## Aktualizace databáze po nasazení

Při prvním spuštění nové verze se ke všem osobním tabulkám doplní `user_id`. Velké tabulky se kopírují po dávkách. Během toho API krátce vrací HTTP 503 a deploy workflow počká, než aktualizace skončí. Při přerušení aktualizace pokračuje tam, kde skončila. D1 Time Travel navíc umožňuje obnovit databázi do stavu před aktualizací.
