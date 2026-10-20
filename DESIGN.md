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
3. **Colour means a part of the app.** The page itself is paper and ink. Green, amber, indigo and rust appear
   only where that part of the app appears: readiness, strain/food, sleep, tired muscles.
4. **Warm, not clinical.** Paper instead of white, serif headlines, soft tinted glows. Never cold grey, never
   neon on black.
5. **Light only.** The site has one look and no theme switch. It follows the app's light screenshots. The one
   exception is the privacy promise: an ink panel (`--button` with `--on-button` text), so it stands apart.

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
| `--primary` / `--green` | #1F6B52 | Links, focus ring, readiness, "free" labels |
| `--green-soft` | #D3EADF | Success fills (waitlist "done") |
| `--amber` | #A35A12 | Strain, gym and food eyebrows and text |
| `--amber-bar` | #C4782A | Strain bars, "recovering" muscles |
| `--indigo` | #4F46C8 | Sleep and the coach |
| `--rust` | #B4532F | Tired muscles, warnings (shapes and bars) |
| `--rust-ink` | #A3482A | The muscles eyebrow and other small rust text (5.2:1 on paper) |
| `--red` (add) | #C2362B | Form errors only (from `Palette.red`) |
| `--protein` `--carbs` `--fat` | #2F7FD8 · #D98A06 · #7C5CE0 | Macros, only next to food data |
| `--logo-load` `--logo-recovery` | #F2B46B · #3FA383 | The Aurin mark and the hero aurora, nothing else |
| `--glow-today` `-health` `-training` `-food` | #DCEBE2 · #E3E6F3 · #F3E3C6 · #F2E4D0 | The soft glow behind each section's phone |

Each section sets two variables, `--tone` (its eyebrow and accent) and `--glow` (the tint behind the phone):
readiness, training and the coach are green on `glow-today`; sleep is indigo on `glow-health`; strain and the
gym are amber on `glow-training`; food is amber on `glow-food`; muscles are rust (`--rust-ink` for the eyebrow).

Contrast: body text is `--text`; small text is never lighter than `--muted`. `--amber-bar`, `--carbs`, the logo
colours and the glows are for shapes and bars, not for small text.

For a future dark band (for example the final call to action), the app's dark values are ready in
`Palette.swift`: background #0A0B0C, card #1C1E1F, ink #ECEAE6, green #8FE6C4, amber #F2B46B, indigo #A5A1FF.

## Typography

- **Headlines (h1, h2, the logo word):** Newsreader 400, self-hosted (`/site/fonts/newsreader.woff2`), fallback
  `"New York", Georgia, serif`. Letter-spacing -0.02em, line-height 1.02. Never bold: the serif carries the voice.
- **Everything else:** the system face (`-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", system-ui`), so
  the site reads like iOS. Weights 400 body, 500 links and nav, 600 buttons, numbers and h3, 700 only for
  eyebrows.
- **Numbers:** system face, 600, letter-spacing -0.03em, `font-variant-numeric: tabular-nums`.

| Step | Size / line height | Use |
|---|---|---|
| display | clamp(48px, 8vw, 96px) / 1.02 | The hero headline only |
| h2 | clamp(36px, 5vw, 64px) / 1.02 | Section headlines |
| h3 | 22px / 1.25, 600 | Step titles, card titles, policy headings |
| lede | 20px / 1.5 | The hero line and section sub-lines |
| body | 17px / 1.5 | Default text (site base) |
| small | 14px / 1.45 | Nav links, chips, footer |
| meta | 13px | Glass card labels, chips |
| eyebrow | 13px, 700, 0.18em, uppercase | The label above each section headline, in `--tone` |
| metric | 30px, 600, -0.03em | Numbers in the hero cards |

Text blocks stay under 640px wide (60-70 characters). Headlines are one short sentence that ends with a full
stop: "Know when to push." not "Smart Strain Tracking".

## Spacing and layout

- Scale (4-based): 4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160.
- Content width 1160px (`.wrap`), side gutter 24px, 16px under 480px.
- Section padding 128-160px on computers, 80px on phones.
- The hero is split: the words on the left, the app's Today on the right with up to three glass numbers.
- Under the hero, **one morning** says the sample day as a sentence, its numbers set as tinted chips.
- A part of the app is a **chapter**: the words and the steps on one side, the phone with its glow on the
  other, sides alternating. Each step shows its own screen and lifts a piece of it beside the phone; steps
  take turns while the chapter is in view (a thin bar fills under the active step) until one is picked. On
  phones it stacks: headline, phone, steps.
- Vary the rhythm: chapters, the muscle figure (split, figure on the right), the connections (a recessed box
  with a row of logos), the privacy promise (the ink panel), questions (heading left, answers right). Only the
  final call to action is centred.
- Never a row of three identical feature cards.

## Shape and depth

- Radius: 8 (inputs inside cards, small tiles), 16 (bubbles, popovers), 22 (lifted app parts, glass cards),
  28-32 (big boxes, the muscle card, the hub), 999 (buttons, nav, chips, the kicker). The phone keeps its
  real 58px corner.
- Shadows are warm (brown-tinted, never pure black) and used for things that float:
  - floating part: `0 40px 80px -30px rgba(60,40,10,.5), 0 2px 8px rgba(0,0,0,.06)`
  - ink button: `0 14px 30px -12px rgba(21,20,15,.6)`
  - nav pill and small floats: `0 8px 30px rgba(60,45,20,.08)`
  - flat cards have no shadow, only `--line`.
- Blur (glass) only on things that sit over moving content: the nav pill, the three hero cards, the muscle
  bubble. Nowhere else.
- Gradients only in three places: the hero and final aurora (from the logo colours), the section glows, and the
  phone's titanium edge. No gradient text, no purple-to-blue.

## Components

- **Ink pill (primary):** 56px tall, 0 28px, `--button` on `--on-button`, 17px 600, warm shadow. Hover: lift 1px
  and lighten 6%. Focus: 2px `--primary` ring, 3px offset. Disabled: 40% opacity, no lift. One per screen view.
- **Waitlist field:** the same pill as a `--panel` field with a round ink "go" button inside; after sending it
  turns into a green-soft "You're on the list" pill. Error text in `--red` under the field, never only colour.
  When the app is in the App Store this becomes the official App Store badge plus the ink pill "Download".
- **Secondary button:** transparent, 1px `--line`, 48px, `--text`. Hover: `--track` fill.
- **Link:** `--primary-text`, underline on hover; a trailing chevron icon when it leads to another page.
- **Nav:** a floating pill 12px from the top, sticky: the mark and the word Aurin in Newsreader, 4 section
  links in `--muted`, a small ink pill "Join the waitlist" on the right that appears once the hero's own button
  has scrolled away (one waitlist button on screen at a time). Under 960px the links go; under 560px the logo
  and a smaller pill stay, so the page's one action is always a tap away.
- **Kicker:** a small glassy pill above the hero headline with a green dot ("Free AI coach for iPhone").
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

## Voice

Plain, second person, short sentences, no hype words ("revolutionary", "unlock", "supercharge"). Say what the
app does today and nothing it doesn't. Prices and availability exactly as in the app. Quotes and ratings only
when they are real.
