// Colour tokens and type scale of the public pages (site-pages.js). They are the iPhone app's light
// palette (ios-native/Shared/Palette.swift); the site has one look and no theme switch.
export const themeTokens = `
:root{color-scheme:light;
  /* Surfaces and text. */
  --bg:#F3EFE8;--panel:#FBFAF7;--panel2:#EAE5DC;--text:#1B1A17;--sec:#3B3832;--muted:#6D6A63;
  --line:rgba(27,26,23,.09);--track:rgba(27,26,23,.08);
  /* App hues: readiness green, strain amber, coach indigo, macros. */
  --green:#1F6B52;--green-soft:#D3EADF;--amber:#A35A12;--amber-bar:#C4782A;--amber-soft:#F3E1C6;
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
