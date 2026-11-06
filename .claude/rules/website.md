---
paths:
  - "ios-native/**"
  - "src/site-*.js"
  - "public/**"
  - "scripts/site-*"
  - "scripts/render-*"
  - "tests/site-pages.test.mjs"
  - "docs/website-follows-app.md"
---

# The website follows the app

The public overview on aurin.health (`overviewPage` in `src/site-pages.js`, English only) describes what
the iPhone app (`ios-native/`) does today. A pull request that adds, removes or renames something a user
sees in the app (a screen or section, a number on Today, a connection, sign-in, the coach, pricing or
availability) updates the overview, its screenshots and live demos (`src/site-demos.js`, incl. the Apple
Watch section) in the same pull request. Before touching the site, read
[docs/website-follows-app.md](../../docs/website-follows-app.md) (screenshots, demos, hero, legal pages).

- The site shows only the sample day, never anyone's real data.
- The privacy, terms and support pages are legal texts for Google verification: change them only when
  data handling changes; Czech and English versions change together; the Google Health disclosure stays
  word for word.
