# DESIGN.md: aurin.health

Direction: **Warm paper, calm data.** The website looks like the Aurin app sitting on a desk: the app's warm
paper and ink, Newsreader headlines, and the app's own screens as the main image. From the references we take
Apple's restraint (one idea per section, big short headlines, lots of air), Bevel's habit of lifting real
pieces of the app out beside the phone, and WHOOP's confidence with numbers.

Source of truth: the colours are the app's light palette (`ios-native/Shared/Palette.swift`), already in
`src/design-system.js` as CSS variables. The pages use those names, never raw hex values. When the app's
palette changes, change `design-system.js` and this file together.

## Principles

1. **The app is the picture, and it moves.** Every chapter shows real screens from CI (`public/site/app/`)
   and, beside the phone, a live demo of that step rebuilt from the app's own view (`src/site-demos.js`):
   numbers count, the dial turns, the timer runs, the coach answers. No stock photos, no illustrations of
   people, no UI the app doesn't have.
2. **One idea per section.** One eyebrow, one headline (a short sentence with a full stop), one line under it,
   one phone. The steps inside a section carry the detail.
3. **Colour means a part of the app.** The page itself is paper and ink, and green is the site's one accent: eyebrows,
   step numbers, links, labels, focus. Amber, indigo and rust appear only in data: the app's screens and demos,
   the numbers they carry (sleep 7:12 in indigo), the bars, dots and lines of a chart or the connections. Never
   on link text, eyebrows or labels.
4. **Warm, not clinical.** Paper instead of white, serif headlines, soft tinted glows. Never cold grey, never
   neon on black.
5. **Light only, for now.** The site has one look and no theme switch. It follows the app's light screenshots;
   a dark version needs CI to take the dark screenshots too (see "Dark mode, next" below).
6. **The welcome sets the tone.** The hero, the openings of the parts, the privacy lock and the end take the look
   and motion of the app's welcome before the sign-in (`WelcomePages.swift`): the logo rising behind spreading
   rings, a sunrise tint, the app's own cards rising into place one after another.

## Colour

| Token | Value | Role |
|---|---|---|
| `--bg` | #F3EFE8 | Page background (the app's paper) |
| `--panel` | #FBFAF7 | Cards, the nav pill, the waitlist field, lifted app parts |
| `--panel2` | #EAE5DC | Recessed areas (the connections hub) |
| `--text` | #1B1A17 | Headlines and body |
| `--sec` | #3B3832 | Secondary body text in long passages |
| `--muted` | #6D6A63 | Sub-lines, captions, nav links (about 4.7:1 on paper) |
| `--line` | rgba(27,26,23,.09) | Borders and dividers |
| `--track` | rgba(27,26,23,.08) | Hover fills, empty bars, close buttons |
| `--button` | #15140F | Primary button (the ink pill) |
| `--on-button` | #F3EFE8 | Text on the ink pill |
| `--primary` / `--green` | #1F6B52 | Links, focus ring, readiness |
| `--green-soft` | #D3EADF | Success fills (waitlist "done") |
| `--amber` | #A35A12 | Strain, gym and food numbers and text inside the app's screens and demos |
| `--amber-bar` | #C4782A | Strain bars, "recovering" muscles |
| `--indigo` | #4F46C8 | Sleep and the coach |
| `--rust` | #B4532F | Tired muscles, warnings (shapes and bars) |
| `--rust-ink` | #A3482A | Small rust text inside data, such as form errors (5.2:1 on paper) |
| `--red` (add) | #C2362B | Form errors only (from `Palette.red`) |
| `--protein` `--carbs` `--fat` | #2F7FD8 · #D98A06 · #7C5CE0 | Macros, only next to food data |
| `--logo-load` `--logo-recovery` | #F2B46B · #3FA383 | The Aurin mark, nothing else |
| `--sun` | #E09A55 | The rings and glow around the mark, the scanning beam, the progress pill's dot (`AurinMark.amber`) |
| `--glow-sunrise` `--glow-coach` | #F7DFC2 · #E6E1F3 | The hero and final tint; the coach's part (`WelcomeGlow`) |
| `--metal` `--plate-25` `--plate-5` | #BDB7AC · #C98A7C · #AEB2B9 | The plate loader's bar and plates, with their `-line` outlines |
| `--glow-today` `-health` `-training` `-food` | #DCEBE2 · #E3E6F3 · #F3E3C6 · #F2E4D0 | The soft glow behind each section's phone |

Each section sets two variables, `--tone` (the bar under its active step) and `--glow` (the tint behind the phone):
readiness, training and the coach are green on `glow-today`; each part's opening is tinted with its welcome page's glow (readiness `glow-today`, training `glow-training`, nutrition `glow-food`, sleep `glow-health`, coach `glow-coach`); sleep is indigo on `glow-health`; strain and the
gym are amber on `glow-training`; food is amber on `glow-food`; muscles are rust (`--rust-ink` for the eyebrow).

Contrast: body text is `--text`; small text is never lighter than `--muted`. `--amber-bar`, `--carbs`, the logo
colours and the glows are for shapes and bars, not for small text.

For a future dark band (for example the final call to action), the app's dark values are ready in
`Palette.swift`: background #0A0B0C, card #1C1E1F, ink #ECEAE6, green #8FE6C4, amber #F2B46B, indigo #A5A1FF.

## Typography

- **One serif on the site: Newsreader 400** for h1, h2, step titles, the opener lines, the logo word and the
  footer line. Self-hosted (`/site/fonts/newsreader.woff2`), token `--serif`, fallback `"New York", Georgia, serif`.
  Letter-spacing -0.02em, line-height 1.02. Never bold: the serif carries the voice. The italic in the hero is
  Newsreader too.
- **Instrument Serif lives only inside the app's screens** that `site-demos.js` rebuilds (the dial, the readiness
  number, the demo cards), because the app sets its numbers in it (`Typography.swift`). The site's own text never
  uses it.
- **Everything else:** the system face (`--sans`: `-apple-system, BlinkMacSystemFont, Inter, "Segoe UI",
  system-ui`), so the site reads like iOS. Weights 400 body, 500 links and nav, 600 buttons, numbers and h3, 700
  only for eyebrows.
- **Numbers:** system face, 600, letter-spacing -0.03em, `font-variant-numeric: tabular-nums`.

**The scale** (`--fs-*` in `design-system.js`). The site's own text uses these eight sizes and nothing else;
headlines grow fluidly with the window, but only between two neighbouring steps. The app's screens rebuilt in
`site-demos.js` keep the app's own sizes, since they copy the app. `tests/design-tokens.test.mjs` checks it.

| Token | Size | Use |
|---|---|---|
| `--fs-12` | 12px | Eyebrows (700, 0.18em, uppercase), step numbers, footer headings and base line, flow labels |
| `--fs-14` | 14px | Nav links, chips, notes under the waitlist, hero card labels, legends, footer links, legal small print |
| `--fs-17` | 17px | Body (site base), step text, real-day captions, buttons, FAQ answers |
| `--fs-20` | 20px | Ledes and section sub-lines (17 on phones), FAQ questions, service names, legal h2 |
| `--fs-28` | 28px | Step titles, the opener lines (20 on phones), the mid-page call, hero card numbers, the logo word |
| `--fs-44` | 44px | h2 on phones, the smallest hero headline, legal h1 |
| `--fs-64` | 64px | h2 on computers (`clamp(44, 5vw, 64)`), the part titles on phones |
| `--fs-88` | 88px | The hero headline (`clamp(44, 6.4vw, 88)`) and the part titles (`clamp(64, 7vw, 88)`) |

Body text never goes under 17px; anything under it is a label, not a paragraph. Text blocks stay under 640px
wide (60-70 characters). Headlines are one short sentence that ends with a full stop: "Know when to push." not
"Smart Strain Tracking".

## Spacing and layout

- Scale (4-based): 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160.
- Content width 1160px (`.wrap`), side gutter 24px, 16px under 480px.
- Section padding 128-160px on computers, 80px on phones.
- On phones and tablets (under 960px) the hero drops the sun, since the mark is already in the nav; under 560px
  the app's Today comes right under the line and the waitlist field follows the phone, so the product is above the
  fold. The hero's three glass numbers sit in a fixed-size rig with the phone that scales down with the column,
  so they never leave it; the coach's card sits under the phone, never over its tab bar.
- The hero is split: the sun (the mark in its rings), the kicker and the welcome's line "A coach that knows *how
  you slept.*" (the last words in green italic) on the left, the app's Today on the right with up to three glass
  numbers, all over the sunrise tint.
- Under the hero, **one morning** says the sample day as a sentence, its numbers set as tinted chips.
- The page goes through the app in the welcome's order: **Readiness, Training, Nutrition, Sleep, Coach**. Each
  part opens with the welcome's page: the title alone as the headline, the welcome's line in Newsreader, and
  the welcome's cards (`ACTS` in `site-demos.js`) on the tinted glow. Its chapters follow; the first has no
  eyebrow, since the part's title says it. While the reader is inside the parts, a pill at the bottom of the
  window shows the part's name and the welcome's line of dots, the current one glowing.
- A part of the app is a **chapter**: the words and the steps on one side, the phone with its glow on the
  other, sides alternating. Each step shows its own screen and lifts a piece of it beside the phone; steps
  take turns while the chapter is in view (a thin bar fills under the active step) until one is picked. On
  phones it stacks: headline, phone, steps.
- Vary the rhythm: chapters, the muscle figure (split, figure on the right), the connections (a recessed box
  with a row of logos), the privacy promise (the welcome's lock, centred), questions (heading left, answers right). The privacy
  promise and the final call to action are centred.
- Never a row of three identical feature cards.

## Shape and depth

- **Corners** (`--r-*`): 8 (fields inside cards, small tiles), 12 (thumbnails such as the real-day screen),
  16 (bubbles, the connection nodes, inner panels), 22 (the app's cards, glass cards, lifted app parts, big boxes:
  the connections, the panels, the muscle card), `--r-pill` (buttons, nav, chips, the kicker). The phone keeps its
  real 58px corner, thin bars 2px.
- **Two shadows**, warm (brown-tinted, never pure black):
  - `--shadow-card`: a card resting on the paper (a 1px `--line` ring and a hairline shadow). Panels, real-day
    cards, chips that travel the connections, the picked service.
  - `--shadow-float`: anything floating over the page: the nav, the progress pill, the hero's glass numbers, the
    lifted app parts, the muscle bubble and card, the waitlist field (with a `--line` ring), the lock.
  - The phone keeps its own titanium shadow; the ink pill and glows are not shadows.
- Blur (glass) only on things that sit over moving content: the nav pill, the three hero cards, the muscle
  bubble. Nowhere else.
- Gradients only in these places: the sunrise behind the hero and the end, the parts' and sections' glows, the
  rings around the mark, and the phone's titanium edge. No gradient text, no purple-to-blue.

## Components

- **Ink pill (primary):** 56px tall, 0 28px, `--button` on `--on-button`, 17px 600, warm shadow. Hover: lift 1px
  and lighten 6%. Focus: 2px `--primary` ring, 3px offset. Disabled: 40% opacity, no lift. One per screen view.
- **Waitlist field:** the same pill as a `--panel` field with a round ink "go" button inside; after sending it
  turns into a green-soft "You're on the list" pill. Error text in `--red` under the field, never only colour.
  When the app is in the App Store this becomes the official App Store badge plus the ink pill "Download".
- **Secondary button (`.ghost`):** transparent, 1px `--line`, 48px, `--text`, 17px 600, a trailing arrow. Hover:
  `--track` fill.
- **Mid-page call (`.mid`):** after the last part (the coach), one Newsreader line "Try it on your own mornings."
  and a secondary button down to the waitlist at the end. Light on purpose: the ink pill stays the hero's and
  the end's.
- **Link:** `--primary-text`, underline on hover; a trailing chevron icon when it leads to another page.
- **Nav:** a floating pill 12px from the top, sticky: the mark and the word Aurin in Newsreader, 4 section
  links in `--muted`, a small ink pill "Join the waitlist" on the right that appears once the hero's own button
  has scrolled away (one waitlist button on screen at a time: it hides while the hero's or the end's field or the
  mid-page call is in view). Under 960px the links go; under 560px the logo
  and a smaller pill stay, so the page's one action is always a tap away.
- **Kicker:** a small glassy pill above the hero headline with a green dot ("For iPhone · now in TestFlight"). The
  site never sells the app as free: it is in testing, and the price after the release is not set.
- **Sun:** the mark with a soft `--sun` glow and three rings that keep spreading and fading (4 s), the mark
  bobbing 6px; still rings with reduced motion.
- **Welcome cards:** the app's paper cards (radius 22, `0 16px 36px -12px` warm shadow) stacked 12px apart. They
  rise 26px into place one after another and then move as in the app: readiness counts to 78, the rest ring
  counts down, plates slide onto the bar, sets tick off, the barcode is scanned, the drink fills, the night is
  drawn, the coach types its answer and offers the workout.
- **Progress pill:** fixed 18px above the bottom, `--panel` glass, the part's name in 14px 600 and a 136px line
  with a dot per part; the dots link to the parts.
- **Privacy lock:** a paper lock with the mark whose shackle clicks shut when the promise scrolls in, the
  promise as a Newsreader headline, the line under it and the link to the policy.
- **Phone:** the CSS iPhone (titanium edge, black bezel, glare) around a real screenshot. Never a flat rectangle.
- **Live demo:** a card 380px wide, 22px radius, `--panel`, floating shadow, overlapping the phone's edge. It
  plays its step's timeline while the chapter is in view and shows its last frame with reduced motion. Numbers
  in Instrument Serif (the app's number face, `/site/fonts/instrument-serif.woff2`), sentences in Newsreader.
- **Connections flow:** services on the left send chips (sleep, HRV, workouts…) along curves into the Aurin
  mark, and what Aurin sends back runs out to the services on the right. Services take turns being lit; the
  panel below lists everything for the lit one.
- **Glass metric card (hero only):** label in meta `--muted`, value in metric style, change in 13px 600 coloured
  by meaning (green up, rust down, indigo for sleep).
- **Step:** "01" in `--tone`, a Newsreader title, one or two sentences of body; inactive steps show only
  their title in `--muted`.
- **FAQ:** `<details>` rows separated by `--line`, question in 17px 600, answer in `--sec`.
- **Footer:** paper, small `--muted` links (Privacy, Terms, Support, contact, Czech versions of the legal pages),
  © line.
- **Legal pages (`.doc`):** one narrow column, h2 in the system face 22px 600.

## Imagery and icons

- **Screens:** English, light-mode screenshots of the sample day, taken by CI. When a screen changes in the app,
  take it again. The numbers around the hero phone follow the sample day (`DemoData.swift`).
- **Muscles:** the 3D figure rendered ahead by `scripts/render-muscles-site.mjs`; the licensed model never
  ships to the site.
- **Logos of other services:** their official marks at their own colours, on a panel tile; never recoloured.
- **Icons:** one set (`src/icons.js`), 24px grid, 2px stroke, round caps, `currentColor`. No emoji.
- **Share image:** `public/site/og-en.png`, 1200×630, re-rendered whenever the hero changes.
- **Motion:** slow and soft (`cubic-bezier(.16,1,.3,1)`, 400-600ms); the phone stands up as you scroll, words of
  the headline rise one by one. Everything respects `prefers-reduced-motion` with a still version.

## Dark mode, next

Not built yet. The tokens are named by role, so a dark theme is a second `:root` block under
`prefers-color-scheme: dark` with the app's dark values (`Palette.swift`: background #0A0B0C, card #1C1E1F, ink
#ECEAE6, green #8FE6C4, amber #F2B46B, indigo #A5A1FF), the shadows turned to light rings, and the glows dimmed.
What holds it back is the pictures: the phones show light screenshots, which would glare on a dark page. It
needs CI to take the dark screenshots of the sample day as well (`ios-native.yml`), saved beside the light
ones and picked with `<picture>` and `prefers-color-scheme`, and the "From a real day" cards in dark too.

## Voice

Plain, second person, short sentences, no hype words ("revolutionary", "unlock", "supercharge"). Say what the
app does today and nothing it doesn't. Prices and availability exactly as in the app. Quotes and ratings only
when they are real.
