# Aurin (formerly Loadwise)

## The website follows the app

The public overview on aurin.health (`overviewPage` in `src/site-pages.js`) describes what the
iPhone app (`ios-native/`) does today. A pull request that adds, removes or renames something a user
sees in the app (a screen or section, a number on Today, a connection, sign-in, the coach, pricing or
availability) updates the overview in the same pull request. The site is in English only:

- Each section of the overview matches a part of the app. Its phones show the app's own screens: the
  English, light-mode screenshots of the sample day that CI takes (`ios-native.yml`, `screens/site/` in
  the Loadwise-native-screens artifact), saved as `public/site/app/*.webp`. The hero shows Today; the
  story below it has one chapter per app area, and its phone shows that area's screen. When a screen
  they show changes, take them again; the numbers around the hero phone follow the sample day
  (`DemoData.swift`, `tests/site-pages.test.mjs`).
- Colours come from the light palette in `ios-native/Shared/Palette.swift`.
- After changing the hero, render the share image `public/site/og-en.png` (1200×630) again.
- The privacy policy and the terms also have a Czech version (`?lang=cs`, linked from the page and the
  footer) that says the same as the English one; change both together.
- The privacy, terms and support pages are legal texts that Google verification reads: change them only
  when the way data is handled changes. The Google Health disclosure stays word for word
  (`googleDisclosure` in `src/site-pages.js`, `tests/site-pages.test.mjs`). It is off the overview for now
  (`GOOGLE_DISCLOSURE_ON_HOME`) and goes back on before the app is sent to Google for verification.

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
