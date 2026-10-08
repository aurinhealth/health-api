# Loadwise pro iPhone

Nativní obal (Capacitor) kolem webové aplikace `https://petrfitnessdata.eu/app`.
Aplikace načítá živý web s opravdovými daty. Změny webu proto nepotřebují nové
sestavení, nový build je potřeba jen při změně v `mobile/`.

Oproti webu v Safari:

- **Kamera:** iOS se zeptá jednou a povolení si pamatuje natrvalo.
- **Přihlášení přes Google:** proběhne v Safari uvnitř aplikace (Google
  přihlášení ve vloženém prohlížeči blokuje). Pak se automaticky vrátí do
  aplikace přes `loadwise://auth`, viz `src/google-login.js`.

## Sestavení bez Macu

Workflow `.github/workflows/ios-app.yml` aplikaci sestaví na GitHubu (macOS
runner). Spustí se samo po změně v `mobile/`, nebo ručně: Actions → iOS app →
Run workflow. Výsledek je v běhu workflow pod Artifacts → `Loadwise-ios`:

- `Loadwise-unsigned.ipa`: pro instalaci do iPhonu.
- `Loadwise-simulator.zip`: pro simulátor (Xcode nebo appetize.io).

## Instalace do iPhonu bez placeného Apple Developer Programu

1. Na počítači s Windows (nebo Macem) nainstaluj [Sideloadly](https://sideloadly.io)
   a iTunes ze stránek Applu (kvůli ovladači pro iPhone).
2. Připoj iPhone kabelem, v Sideloadly vyber `Loadwise-unsigned.ipa`, zadej
   svoje Apple ID a dej Start.
3. Na iPhonu:
   - Nastavení → Soukromí a zabezpečení → Režim pro vývojáře → zapnout
     (iPhone se restartuje).
   - Nastavení → Obecné → Správa VPN a zařízení → svoje Apple ID → Důvěřovat.

S bezplatným Apple ID instalace platí 7 dní, pak ji Sideloadly znovu nainstaluje
(data zůstávají na serveru). Najednou můžou být takto nainstalované nejvýš 3
aplikace.

## Vyzkoušení v prohlížeči (bez iPhonu)

Na [appetize.io](https://appetize.io) nahraj `Loadwise-simulator.zip`. Simulátor
nemá fotoaparát, skenování se tam proto vyzkoušet nedá.

## Úpravy

- `capacitor.config.json`: adresa aplikace (`server.url`), název, identifikátor.
- `ios/App/App/Info.plist`: schéma `loadwise://` a texty žádostí o kameru a fotky.
- `ios/App/App/Assets.xcassets`: ikona (1024 px) a úvodní obrazovka.
- Verze Capacitoru jsou v `package.json`. Po jejich změně spusť `npm install`
  a `npx cap sync ios`.
