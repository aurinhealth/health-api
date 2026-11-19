import SwiftUI

// Přizpůsobení (Settings concept 10, "Customization"): the measurements and
// the small things that make the app one's own, one level below the main
// Settings list so that list stays short.

struct CustomizationSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore

    var body: some View {
        SettingsPage(title: "Přizpůsobení",
                     hero: SettingsHero(systemImage: "slider.horizontal.3", color: Palette.green,
                                        text: "Měření a drobnosti, díky kterým je aplikace tvoje.")) {
            SettingsGroup(title: "Měření") {
                NavigationLink { UnitsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "ruler", color: Palette.blue, disc: true), title: "Jednotky")
                }
                SettingsDivider()
                NavigationLink { ZonesSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "chart.bar.fill", color: Palette.rust, disc: true), title: "Zóny")
                }
                // Cyklus is a tile on the main page for women and for anyone who turned it on.
                if !SettingsSectionTiles.cycleTile(store, model) {
                    SettingsDivider()
                    NavigationLink { CycleSettingsView() } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "calendar", color: Palette.pink, disc: true), title: "Cyklus")
                    }
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Aplikace") {
                NavigationLink { AppIconSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "app.badge.fill", color: Palette.amber, disc: true), title: "Ikona aplikace")
                }
                SettingsDivider()
                NavigationLink { QuickActionsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "hand.tap.fill", color: Palette.green, disc: true), title: "Rychlé akce")
                }
                SettingsDivider()
                NavigationLink { CoachPlacesSettingsView() } label: {
                    // The coach's own symbol, as everywhere the coach is.
                    HStack(spacing: 14) {
                        TwoLights(size: 20).frame(width: 34, height: 34)
                        Text("Karty kouče").font(.body).foregroundStyle(Palette.ink)
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .frame(minHeight: 52)
                    .contentShape(Rectangle())
                }
                SettingsDivider()
                NavigationLink { WeatherPlaceView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "mappin.and.ellipse", color: Palette.blue, disc: true), title: "Poloha pro počasí")
                }
            }
            .buttonStyle(.plain)
        }
    }
}
