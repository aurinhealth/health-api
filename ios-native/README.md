# Aurin for iPhone (native)

The native SwiftUI app with the new design. It reads the same server as the
web app (`/app/api/today` for the Today screen), so the numbers match.

## What it does now

- Sign-in with Apple, with Google via Safari (the handoff
  `/auth/google?app=…` → `loadwise://auth` → `POST /auth/app/session`) or
  with a code sent to the e-mail. After the first e-mail sign-in the app
  offers a passkey ("Příště přes Face ID", Data/Passkeys.swift); the sign-in
  screen then has "Přihlásit přes passkey". Passkeys need the
  `webcredentials:aurin.health` entitlement (project.yml) and the
  server's `/.well-known/apple-app-site-association` (APPLE_TEAM_ID).
- The first-run setup (Screens/SetupFlowView.swift): "Odkud brát data"
  (Apple Health on by default, Google Health, Intervals.icu, the consent to
  health data) and "O tobě" (sex, year of birth, height and weight, filled
  in from Apple Health or the server's suggestions).
- The Today screen:
  - readiness;
  - sleep, strain and HRV;
  - what the day means;
  - food and drink;
  - the day's plan;
  - steps;
  - resting heart rate;
  - weight.
- The Training screen (`/app/api/training`):
  - today's strain and where the plan takes it;
  - the week Monday to Sunday;
  - the next session;
  - the main event and the phase of the preparation;
  - form, VO2max, this week, active energy and heart-rate zones;
  - tap Form for the detail (fitness and fatigue, weekly load, intensity).
- The Health screen (`/app/api/health`): readiness and what makes it up,
  sleep with the need and debt, heart, breathing, skin temperature, oxygen,
  weight and body fat. Tap for details: readiness, the night (stages from
  `/app/api/night`), HRV and resting heart rate, weight (log a weighing).
- The Food screen (`/app/api/food-today`): eaten against the target, macros,
  water (+250 ml), the day's meals with a suggestion for the meals ahead.
  Adding food: search your foods and the catalog, AI lookup, typing it in,
  and the barcode scanner (VisionKit, camera permission).
- The "+" in the tab bar: food, water, weight, a workout typed in.
- Training → Tréninky týdne: every session of the week. Done ones open the
  activity detail (Intervals.icu: summary, power and heart rate, zones,
  laps, "Jak to šlo?"); planned ones show their structure and can be moved,
  set indoor/outdoor or deleted; the gym session opens the workout.
- The gym workout (`/app/api/gym`): exercises and sets, tick a set to record
  it, technique, swap an exercise; without a plan it builds one.
- The screens keep their last data on the phone and open with it without
  signal ("Bez připojení · uložená data").
- Settings (the "P" on Today), a closed menu with pages:
  - Profil: sex, age, height, heart rate, activity and the weight goal;
  - Cíle: main sport, weekly hours and the main event;
  - Zdroje dat: connected sources and "Synchronizovat vše"; each service has
    one page with what Aurin reads (Apple Health: the HealthKit areas,
    App/AppleHealth.swift) and what it sends (Apple Health, Google Health,
    Intervals.icu, Wahoo: planned workouts, done activities and the chosen
    health data), its permissions, sync and Odpojit; after a done activity a
    toast says where it went (Screens/SyncViews.swift, App/AppleHealthExport.swift);
  - Tréninkové zóny: run and bike separately, thresholds, presets and zones;
  - Vzhled (automatic, light, dark), Jednotky, signing out.
- "Prohlédnout ukázku" on the sign-in screen shows sample data without an
  account.

## Version check

Every request carries `X-Loadwise-Api: <APIClient.apiLevel>`. When the server
needs a newer app (`MIN_APP_API` in `src/app-version.js`) it answers 426 and
the app shows "Je potřeba nová verze" instead of the screens. Raise both
numbers in the same pull request, only for changes that break what installed
apps read.

## Build without a Mac

The GitHub Actions workflow `.github/workflows/ios-native.yml` runs on every
change in `ios-native/`. It:

1. generates the Xcode project from `project.yml` with XcodeGen;
2. runs the tests, which render the screens to PNG in light and dark mode;
3. takes simulator screenshots of the running app;
4. records the App Store preview videos (`AurinUITests/AppPreviewTests.swift`
   walks the sample day, `scripts/app-preview.mjs` cuts the recording into
   `preview/app-preview-en.mp4` and `-cs.mp4`, 886×1920, 15–30 s, plus a second pair
   `app-preview-en-coach.mp4` and `-cs-coach.mp4` with the muscles and the coach): upload them
   in App Store Connect → the version → App Previews;
5. builds `Aurin-native-unsigned.ipa`.

Download the artifacts under Actions → the run → Artifacts.

## TestFlight (paid Apple Developer account)

`.github/workflows/ios-testflight.yml` signs the app and uploads it to
TestFlight on every change in `ios-native/` merged to `main` (or by hand:
Actions → iOS TestFlight → Run workflow). Signing happens in the cloud with
an App Store Connect API key, so no certificate or profile is kept anywhere.
It needs the secrets `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` and
`ASC_KEY_P8`; without them it skips the upload.

On the phone: install TestFlight from the App Store, open the invitation,
and new builds arrive on their own. Builds expire after 90 days.

## Install with Sideloadly (free Apple ID)

1. Open `Aurin-native-unsigned.ipa` in Sideloadly and sign it with your
   Apple ID.
2. With a free Apple ID the app runs for 7 days, then install it again.
3. Turn on Developer Mode on the phone.

## Fonts

- SF Pro (system) for text.
- Instrument Serif for numbers.
- Newsreader for sentences.

Both serif fonts are under the SIL Open Font License (`Resources/Fonts/OFL-*.txt`).
Newsreader is a static instance (optical size 20, weight 400) of the variable
font from Google Fonts.
