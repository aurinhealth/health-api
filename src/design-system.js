// Colour tokens and type scale of the public pages (site-pages.js). They are the iPhone app's light
// palette (ios-native/Shared/Palette.swift); the site has one look and no theme switch.
export const themeTokens = `
:root{color-scheme:light;
  /* Surfaces and text. */
  --bg:#F3EFE8;--panel:#FBFAF7;--panel2:#EAE5DC;--text:#1B1A17;--sec:#3B3832;--muted:#6D6A63;
  --line:rgba(27,26,23,.09);--track:rgba(27,26,23,.08);
  /* App hues: readiness green, strain amber, coach indigo, macros. */
  --green:#1F6B52;--green-soft:#D3EADF;--amber:#A35A12;--amber-bar:#C4782A;--amber-soft:#F3E1C6;
  --indigo:#4F46C8;--lilac:#D9D6F3;--rust:#B4532F;--blue:#1D6FA3;--protein:#2F7FD8;--carbs:#D98A06;--fat:#7C5CE0;
  --primary:#1F6B52;--primary-text:#1F6B52;--primary-ink:#FFFFFF;--primary-surface:#D3EADF;
  --button:#15140F;--on-button:#F3EFE8;--frame:#DCD5CA;--health-red:#FF2D55;--google-blue:#4285F4;
  /* The Aurin mark (Rovnováha): the load half over the recovery half. */
  --logo-load:#F2B46B;--logo-recovery:#3FA383;
  /* The aurora behind the hero (the mark's two halves and a touch of the coach's lilac) and the phone's titanium. */
  --aurora-lilac:#B9B4EE;--device-hi:#F4F1EC;--device-mid:#C9C2B8;--device-lo:#A2998E;
  /* Soft glow behind each section's card, in the tint of the app tab it shows. */
  --glow-today:#DCEBE2;--glow-health:#E3E6F3;--glow-training:#F3E3C6;--glow-food:#F2E4D0;
  /* The public site: its page, the gym's sand, food's coffee and the coach's mint on its dark panel. */
  --site-bg:#F6F4EF;--sand:#E6D3B5;--coffee:#8A5A3B;--coach-mint:#8FE6C4;
  /* Type scale: caption for short uppercase labels, meta for chips, small for secondary text. */
  --fs-caption:12px;--fs-meta:13px;--fs-small:14px;--fs-body:15px;
}
`;
