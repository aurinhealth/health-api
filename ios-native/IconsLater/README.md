# Icons kept for later

Drawn for the Roadmap update, held back from the app: the Záře (`glow-*`) and Prstenec (`ring-*`)
styles, 11 icons each, and 13 more Aurin Pro icons (`pro-*`). They sit outside `Aurin/`, so the
app does not bundle them.

To bring them back, move the `AppIcon-*.appiconset` folders into `Aurin/Resources/Assets.xcassets/`
and the previews into its `IconPreview/`, then add the styles to `AppIconChoice.styles` and the Pro
icons to `AppIconChoice.proIcons` (`Screens/SettingsPages/SettingsAppIcon.swift`) and update
`tests/app-icons.test.mjs` and `AurinTests/AppIconTests.swift`.
