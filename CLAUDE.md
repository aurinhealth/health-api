# Aurin (formerly Loadwise)

## The website follows the app

The public overview on aurin.health (`overviewPage` in `src/site-pages.js`) describes what the
iPhone app (`ios-native/`) does today. A pull request that adds, removes or renames something a user
sees in the app (a screen or section, a number on Today, a connection, sign-in, the coach, pricing or
availability) updates the overview in the same pull request. The site is in English only:

- Each section of the overview matches a part of the app. Its phones show the app's own screens: the
  English, light-mode screenshots of the sample day that CI takes (`ios-native.yml`: `screens/site/` and
  the smoke test's `smoke/4-…` walk through the app, in the Aurin-screens artifact), saved as
  `public/site/app/*.webp` (`scripts/site-screens.mjs` turns the unzipped artifact into them). The same screens
  make the overview as images for Reddit or the App Store (`scripts/render-overview.mjs`). Beside each phone stands a live demo (`src/site-demos.js`): a piece of the
  app rebuilt in HTML that moves (the dial turns, the rest timer counts down, the coach answers), following
  the app's own view and the sample day. Where a screenshot can't show a step, the phone's screen is built
  there too (strain, the finished workout, the coach). When a view a demo copies changes in the app, change
  the demo in the same pull request. The hero shows Today; below it one chapter per app area, whose steps
  take turns on the phone. The muscles show the app's 3D figure, rendered ahead by
  `scripts/render-muscles-site.mjs` (the licensed model never goes on the website). When a screen
  they show changes, take them again; the numbers around the hero phone follow the sample day
  (`DemoData.swift`, `tests/site-pages.test.mjs`).
- One section, "Real days" (`REAL_DAYS`, `public/site/real/`), shows the owner's own dark-mode screens from his posts
  instead of the sample day; it is the only place where real data appears.
- Colours come from the light palette in `ios-native/Shared/Palette.swift`.
- After changing the hero, render the share image `public/site/og-en.png` (1200×630) again.
- The privacy policy and the terms also have a Czech version (`?lang=cs`, linked from the page and the
  footer) that says the same as the English one; change both together.
- The privacy, terms and support pages are legal texts that Google verification reads: change them only
  when the way data is handled changes. The Google Health disclosure stays word for word
  (`googleDisclosure` in `src/site-pages.js`, `tests/site-pages.test.mjs`) and names every optional Google
  permission the app asks for. It goes on the overview only while Google verifies the app (`GOOGLE_DISCLOSURE_ON_HOME`), which is not planned now.
- The app and the site are only Aurin on aurin.health. petrfitnessdata.eu (the old address) only redirects
  there; the bundle IDs `eu.petrfitnessdata.*` cannot change and are never shown as a name.

The "Website copy" workflow flags app pull requests that leave the overview untouched.

## TestFlight notes

Every build in TestFlight gets "What to Test" from the descriptions of the pull requests it contains
(`.github/scripts/testflight_notes.py`). A pull request that changes `ios-native/` therefore carries this
section in its description, written in Czech for a tester, without PR numbers, file or type names:

```
## TestFlight
**Co je nového**
- What changed, as the user sees it in the app (one line each).
**Co otestovat**
- Concrete steps in the app: where to tap and what should happen.
```

When nothing changes for a tester (a refactor, a build fix), the section says "Nic k otestování". The
"TestFlight notes" workflow fails a pull request without a usable section; editing the description re-runs it.

## AI prompt texts are private

The texts the server sends to the AI models (the coach, food lookup and photos, week planning, gym, reviews)
live in the private repository `shaarkyn/aurin-prompts`, checked out to `src/private` (gitignored):
`git clone https://github.com/shaarkyn/aurin-prompts src/private`. The modules in `src/` import them from
`./private/<same file name>`; CI checks the repository out with the `PROMPTS_REPO_TOKEN` secret before tests and
the deploy. Change prompt texts with a pull request to `aurin-prompts`, never back in this public repository. A
change that needs both repositories merges `aurin-prompts` first; a change to `aurin-prompts` alone goes live by
running "Deploy Cloudflare Worker" on `main` (workflow_dispatch).
