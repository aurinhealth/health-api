# Loadwise for iPhone (native)

The native SwiftUI app with the new design. It reads the same server as the
web app (`/app/api/today` for the Today screen), so the numbers match.
`mobile/` is the older Capacitor app that wraps the web page; both can be
installed side by side (different bundle IDs).

## What it does now

- Sign-in with Google via Safari: the same handoff as `mobile/`
  (`/auth/google?app=…` → `loadwise://auth` → `POST /auth/app/session`).
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
  - Zdroje dat: connected sources and "Synchronizovat teď";
  - Tréninkové zóny: run and bike separately, thresholds, presets and zones;
  - Vzhled (automatic, light, dark), Jednotky, signing out.
- "Prohlédnout ukázku" on the sign-in screen shows sample data without an
  account.

## Build without a Mac

The GitHub Actions workflow `.github/workflows/ios-native.yml` runs on every
change in `ios-native/`. It:

1. generates the Xcode project from `project.yml` with XcodeGen;
2. runs the tests, which render the screens to PNG in light and dark mode;
3. takes simulator screenshots of the running app;
4. builds `Loadwise-native-unsigned.ipa`.

Download the artifacts under Actions → the run → Artifacts.

## Install on the iPhone

The same as `mobile/README.md`:

1. Open `Loadwise-native-unsigned.ipa` in Sideloadly and sign it with your
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
