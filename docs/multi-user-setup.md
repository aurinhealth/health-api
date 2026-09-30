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

Dokud uživatel nepřipojí obě služby, dashboard zobrazuje jen průvodce připojením.

## Co zatím zůstává jen pro správce

- Silový plán v Google Sheetu a jeho generování. Po přechodu plánů do databáze bude dostupné všem.
- Přístup přes MCP / ChatGPT (sdílený klíč `STRENGTH_API_KEY` pracuje s daty správce).
- GitHub automatizace silového plánu. Synchronizace Intervals a denní výživové poznámky už běží pro každého uživatele zvlášť.

## Aktualizace databáze po nasazení

Při prvním spuštění nové verze se ke všem osobním tabulkám doplní `user_id`. Velké tabulky se kopírují po dávkách. Během toho API krátce vrací HTTP 503 a deploy workflow počká, než aktualizace skončí. Při přerušení aktualizace pokračuje tam, kde skončila. D1 Time Travel navíc umožňuje obnovit databázi do stavu před aktualizací.
