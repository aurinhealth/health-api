// Colour tokens and type scale of the public pages (site-pages.js). They are the iPhone app's light
// palette (ios-native/Shared/Palette.swift); darkTokens below are its dark half.
export const themeTokens = `
:root{color-scheme:light;
  /* Surfaces and text. */
  --bg:#F3EFE8;--panel:#FBFAF7;--panel2:#EAE5DC;--text:#1B1A17;--sec:#3B3832;--muted:#6D6A63;
  --line:rgba(27,26,23,.09);--track:rgba(27,26,23,.08);
  /* App hues: readiness green, strain amber, coach indigo, macros. */
  --green:#1F6B52;--green-soft:#D3EADF;--amber:#A35A12;--amber-bar:#C4782A;--amber-soft:#F3E1C6;--sand:#E6D3B5;--brown:#8A6D3B;
  --indigo:#4F46C8;--lilac:#D9D6F3;--rust:#B4532F;--rust-ink:#A3482A;--blue:#1D6FA3;--protein:#2F7FD8;--carbs:#D98A06;--fat:#7C5CE0;
  --primary:#1F6B52;--primary-text:#1F6B52;--primary-ink:#FFFFFF;--primary-surface:#D3EADF;
  --button:#15140F;--on-button:#F3EFE8;--frame:#DCD5CA;--health-red:#FF2D55;--google-blue:#4285F4;
  /* The Aurin mark (Rovnováha): the load half over the recovery half. */
  --logo-load:#F2B46B;--logo-recovery:#3FA383;
  /* The aurora behind the hero (the mark's two halves and a touch of the coach's lilac) and the phone's titanium. */
  --aurora-lilac:#B9B4EE;--device-hi:#F4F1EC;--device-mid:#C9C2B8;--device-lo:#A2998E;
  /* Soft glow behind each section's card, in the tint of the app tab it shows. */
  --glow-today:#DCEBE2;--glow-health:#E3E6F3;--glow-training:#F3E3C6;--glow-food:#F2E4D0;
  /* The welcome before the sign-in (WelcomePages.swift): its sunrise and coach tints, the logo's sun, the plate loader. */
  --glow-sunrise:#F7DFC2;--glow-coach:#E6E1F3;--sun:#E09A55;--metal:#BDB7AC;
  --plate-25:#C98A7C;--plate-25-line:#A86A5C;--plate-20:#7E8DB5;--plate-20-line:#5F6F98;--plate-15:#B39A5E;--plate-15-line:#937A40;
  --plate-10:#8AA58C;--plate-10-line:#6A866D;--plate-5:#AEB2B9;--plate-5-line:#8E939B;--plate-2-5:#85817B;--plate-2-5-line:#66625C;--plate-1-25:#A8A39B;--plate-1-25-line:#88837B;
  /* Type scale of the site's own text (DESIGN.md): nothing outside it. Headlines grow fluidly from one step to the
     next. The app's screens rebuilt in site-demos.js keep the app's own sizes. */
  --fs-12:12px;--fs-14:14px;--fs-17:17px;--fs-20:20px;--fs-28:28px;--fs-44:44px;--fs-64:64px;--fs-88:88px;
  --serif:Newsreader,"New York",Georgia,serif;
  --sans:-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",system-ui,sans-serif;
  /* Corners: small tiles and fields, chips inside cards, bubbles, the app's cards and big boxes, pills. */
  --r-8:8px;--r-12:12px;--r-16:16px;--r-22:22px;--r-pill:999px;
  /* Two shadows, warm and never black: a card resting on the paper, and something floating over the page. */
  --shadow-card:0 0 0 1px var(--line),0 1px 2px rgba(60,45,20,.05);
  --shadow-float:0 30px 70px -28px rgba(60,40,10,.42),0 2px 8px rgba(60,40,10,.06);
}
`;

// The same tokens in the app's dark palette (Palette.swift, WelcomePages.swift, AurinMark.swift, PlateLoader.swift),
// for a phone set to dark mode. It needs CI's dark screenshots of the sample day in public/site/app/*-dark.webp:
// light screenshots would glare on a dark page (DESIGN.md, "Dark mode"). Shadows turn into light rings, since a
// shadow does not show on near black, and the glows are the app's dark tints.
export const DARK_SITE = true;
export const darkTokens = `
@media (prefers-color-scheme:dark){:root{color-scheme:dark;
  --bg:#0A0B0C;--panel:#1C1E1F;--panel2:#141617;--text:#ECEAE6;--sec:#D9D6D0;--muted:#9AA39F;
  --line:rgba(236,234,230,.1);--track:rgba(236,234,230,.08);
  --green:#8FE6C4;--green-soft:#1D3B33;--amber:#F2B46B;--amber-bar:#E09A55;--amber-soft:#3A2A17;--sand:#4A3B28;--brown:#CFB07A;
  --indigo:#A5A1FF;--lilac:#34325A;--rust:#F0907A;--rust-ink:#F0907A;--blue:#7CC3F0;--protein:#83C7FF;--carbs:#FFC274;--fat:#B3A1FF;
  --primary:#8FE6C4;--primary-text:#8FE6C4;--primary-ink:#0A0B0C;--primary-surface:#1D3B33;
  --button:#F4F2EE;--on-button:#0A0B0C;--frame:#2E3132;
  --aurora-lilac:#34325A;--device-hi:#8E8A84;--device-mid:#55524E;--device-lo:#34322F;
  --glow-today:#1D3B33;--glow-health:#22253A;--glow-training:#3A2A17;--glow-food:#352818;
  --glow-sunrise:#3A2A17;--glow-coach:#2A2740;--sun:#F2B46B;--metal:#5E615F;
  --plate-25-line:#E2AFA3;--plate-20-line:#AAB7DA;--plate-15-line:#D8C08A;--plate-10-line:#B5CDB6;--plate-5-line:#D2D5DA;--plate-2-5-line:#AFAAA2;--plate-1-25-line:#CBC6BE;
  --shadow-card:0 0 0 1px var(--line);
  --shadow-float:0 0 0 1px rgba(236,234,230,.08),0 30px 70px -28px rgba(0,0,0,.8);
}}
`;
export const siteTokens = themeTokens + (DARK_SITE ? darkTokens : '');
