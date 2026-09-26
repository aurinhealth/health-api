# WHOOP: ověření a příprava propojení

1. Otevři https://developer-dashboard.whoop.com a přihlas se svým WHOOP účtem.
2. V Apps ověř, zda již existuje Petr Fitness Data. Pokud ne, vytvoř Team (pokud je vyžadován) a novou aplikaci.
3. Název: Petr Fitness Data. Web: https://petrfitnessdata.eu. Pokud formulář vyžaduje zásady soukromí, použij https://petrfitnessdata.eu/privacy.
4. Redirect URI musí přesně odpovídat: `https://petrfitnessdata.eu/oauth/whoop/callback`.
5. Aktuální backend žádá `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement` a `offline` pro obnovu tokenu. Vyber odpovídající data ve formuláři registrace.
6. Po vytvoření uvidíš Client ID a Client Secret. Secret neposílej do chatu, neukládej do Git ani do klientského kódu.
7. V Cloudflare otevři Worker `health-api` → Settings → Variables and Secrets. Přidej serverové secrets `WHOOP_CLIENT_ID` a `WHOOP_CLIENT_SECRET` s hodnotami z WHOOP. Nastavení ulož/nasaď podle pokynů Cloudflare.
8. V naší aplikaci otevři Nastavení → Přihlášení pro správu propojení. Použij stávající přístupový klíč aplikace.
9. Klikni Připojit WHOOP, přihlas se u WHOOP a potvrď požadované oprávnění. Po návratu obnov Nastavení: má být Připojeno. V Recovery & Health se mají ukázat reálné signály WHOOP.

Pokud už existuje aplikace, stačí ověřit callback, scopes a nastavení serverových secrets. Nikomu nepředávej heslo WHOOP ani Client Secret.

Oficiální postup: https://developer.whoop.com/docs/developing/getting-started/ a https://developer.whoop.com/docs/developing/oauth/.

# Apple Developer a osobní TestFlight

1. Otevři https://developer.apple.com/account/ a přihlas se Apple účtem.
2. V Membership details ověř členství Apple Developer Program, stav Active a datum platnosti. Samotné přihlášení nebo bezplatný vývojářský účet není placené členství.
3. Pokud aktivní členství chybí, registrace je na https://developer.apple.com/programs/enroll/. Apple uvádí 99 USD ročně, místní cenu zobrazí při registraci. Nákup ani odsouhlasení smluv neprovádíme za tebe.
4. Otevři https://appstoreconnect.apple.com a ověř přístup do Apps a TestFlight.
5. Pro sestavení potřebujeme macOS/Xcode lokálně nebo macOS build prostředí, podepsání aplikace a Apple účet s příslušnou rolí. Současný Windows workspace iOS build přímo nevytvoří.
6. Pro osobní použití lze využít interní TestFlight. Build má platnost nejvýše 90 dní; před koncem je potřeba nahrát nový. Publikování do veřejného App Store není nutné.

První varianta může využít stávající web a backend v nativním obalu. HealthKit ale potřebuje nativní modul, oprávnění na iPhonu a zabezpečenou synchronizaci. Není to pouze převod URL na ikonu.

Oficiální podmínky: https://developer.apple.com/programs/enroll/ a https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/.
