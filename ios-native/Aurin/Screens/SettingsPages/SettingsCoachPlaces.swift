import SwiftUI

// Kouč na obrazovkách: the coach's card (CoachTextCard.swift) on Dnes, Trénink
// and Jídlo, each on or off. Off, the screen neither shows the text nor asks
// for it; the chat with the coach stays. Folding is on the card itself.

struct CoachPlacesSettingsView: View {
    var body: some View {
        SettingsPage(title: "Kouč na obrazovkách") {
            SettingsGroup(footer: "Vypnutá rada kouče se na obrazovce neukáže. Na kartě ji můžeš také jen sbalit šipkou. Tip na regeneraci na Dnes zůstává a chat s koučem funguje dál.") {
                ForEach(CoachTextPlaces.screens.indices, id: \.self) { i in
                    if i > 0 { SettingsDivider() }
                    CoachPlaceToggle(screen: CoachTextPlaces.screens[i].0, title: CoachTextPlaces.screens[i].1)
                }
            }
        }
    }
}

private struct CoachPlaceToggle: View {
    let title: String
    @AppStorage private var on: Bool

    init(screen: String, title: String) {
        self.title = title
        self._on = AppStorage(wrappedValue: true, CoachTextPlaces.shownKey(screen))
    }

    var body: some View {
        SettingsToggle(title: title, isOn: $on)
    }
}
