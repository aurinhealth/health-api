# Aurin (formerly Loadwise)

## The website follows the app

The public overview on aurin.health (`overviewPage` in `src/site-pages.js`, English only) describes what
the iPhone app (`ios-native/`) does today. A pull request that adds, removes or renames something a user
sees in the app (a screen or section, a number on Today, a connection, sign-in, the coach, pricing or
availability) updates the overview, its screenshots and live demos (`src/site-demos.js`, incl. the Apple
Watch section) in the same pull request. Before touching the site, read
[docs/website-follows-app.md](docs/website-follows-app.md) (screenshots, demos, hero, legal pages).

- The site shows only the sample day, never anyone's real data.
- The privacy, terms and support pages are legal texts for Google verification: change them only when
  data handling changes; Czech and English versions change together; the Google Health disclosure stays
  word for word.
- The app and the site are only Aurin on aurin.health. petrfitnessdata.eu only redirects there; the
  bundle IDs `eu.petrfitnessdata.*` cannot change and are never shown as a name.

## TestFlight notes

A pull request that changes `ios-native/` carries a `## TestFlight` section in its description (Czech,
then English; "Nic k otestování" when nothing changes for a tester). CI fails without it. Format in
[docs/testflight-notes.md](docs/testflight-notes.md).

## AI prompt texts are private

The texts the server sends to the AI models live in the private repository `shaarkyn/aurin-prompts`,
checked out to `src/private` (gitignored): `git clone https://github.com/shaarkyn/aurin-prompts src/private`.
Modules in `src/` import them from `./private/<same file name>`. Change prompt texts only with a pull
request to `aurin-prompts`, never in this public repository. A change that needs both repositories merges
`aurin-prompts` first; an `aurin-prompts`-only change goes live by running "Deploy Cloudflare Worker" on
`main` (workflow_dispatch).
