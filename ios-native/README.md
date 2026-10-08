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
- "Prohlédnout ukázku" on the sign-in screen shows sample data without an
  account.
- Training, Food and Health are placeholders that link to the web app.

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
