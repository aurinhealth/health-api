# The website follows the app (details)

Short rule in `CLAUDE.md`. This file holds the how-to.

The public overview on aurin.health (`overviewPage` in `src/site-pages.js`) describes what the
iPhone app (`ios-native/`) does today. The "Website copy" workflow (`.github/workflows/site-copy.yml`)
flags app pull requests that leave the overview untouched.

## Overview sections and phones

- Each section of the overview matches a part of the app. Its phones show the app's own screens: the
  English, light-mode screenshots of the sample day that CI takes (`ios-native.yml`: `screens/site/` and
  the smoke test's `smoke/4-…` walk through the app, in the Aurin-screens artifact), saved as
  `public/site/app/*.webp`. `scripts/site-screens.mjs` turns the unzipped artifact into them; the same
  shots in dark mode become `*-dark.webp` for the site's dark look (`DARK_SITE`).
- The same screens make the overview as images for Reddit or the App Store (`scripts/render-overview.mjs`).
- The App Store screenshots (6.3" 1206×2622, 6.9" 1320×2868; the app is iPhone only) use the same English
  shots, plus the smoke test's `dnes-*` (Today down to the day's timeline), `trenink-*` (Training down to the
  coach's card) and `kouc-odpoved` (the coach answering).
- Beside each phone stands a live demo (`src/site-demos.js`): a piece of the app rebuilt in HTML that
  moves (the dial turns, the rest timer counts down, the coach answers), following the app's own view and
  the sample day. Where a screenshot can't show a step, the phone's screen is built there too (strain, the
  finished workout, the coach). When a view a demo copies changes in the app, change the demo in the same
  pull request.
- The Apple Watch section (`WATCH` in `src/site-demos.js`) rebuilds the watch app's screens in HTML, since
  CI takes no watch screenshots; change it with the watch views.
- The hero shows Today; below it one chapter per app area, whose steps take turns on the phone.
- The muscles show the app's 3D figure, rendered ahead by `scripts/render-muscles-site.mjs` (the licensed
  model never goes on the website). When a screen they show changes, take them again.
- The numbers around the hero phone follow the sample day (`DemoData.swift`, `tests/site-pages.test.mjs`).
- After changing the hero, render the share image `public/site/og-en.jpg` (1200×630) again.
- Colours come from the light palette in `ios-native/Shared/Palette.swift`.
- The site shows only the sample day, never anyone's real data (the "From a real day" cards were dropped
  on 2026-10-29).

## Legal pages

- The privacy policy and the terms also have a Czech version (`/cs/privacy`, `/cs/terms`; the old
  `?lang=cs` redirects there; linked from the page and the footer) that says the same as the English one;
  change both together.
- The privacy, terms and support pages are legal texts that Google verification reads: change them only
  when the way data is handled changes.
- The Google Health disclosure stays word for word (`googleDisclosure` in `src/site-pages.js`,
  `tests/site-pages.test.mjs`) and names every optional Google permission the app asks for. It goes on
  the overview only while Google verifies the app (`GOOGLE_DISCLOSURE_ON_HOME`); verification was
  submitted on 2026-10-25.
