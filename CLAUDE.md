# Aurin (formerly Loadwise)

## The website follows the app

The public overview on aurin.health (`overviewPage` in `src/site-pages.js`) describes what the
iPhone app (`ios-native/`) does today. A pull request that adds, removes or renames something a user
sees in the app (a screen or section, a number on Today, a connection, sign-in, the coach, pricing or
availability) updates the overview in the same pull request. The site is in English only:

- Each section of the overview matches a part of the app; the phone in the hero is drawn in HTML from
  the Today screen, so its labels and layout follow `TodayView.swift`. The story below it has one
  chapter per app area, and its phone shows that area's screen.
- Colours come from the light palette in `ios-native/Shared/Palette.swift`.
- After changing the hero, render the share image `public/site/og-en.png` (1200×630) again.
- The privacy policy and the terms also have a Czech version (`?lang=cs`, linked from the page and the
  footer) that says the same as the English one; change both together.
- The privacy, terms and support pages are legal texts that Google verification reads: change them only
  when the way data is handled changes, and keep the Google Health disclosure on the overview word for word
  (`tests/site-pages.test.mjs`).

The "Website copy" workflow flags app pull requests that leave the overview untouched.
