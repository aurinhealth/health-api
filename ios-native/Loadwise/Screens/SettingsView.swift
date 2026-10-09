import SwiftUI

/// Settings: a closed menu like Bevel's, each row opens its own page.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var store: SettingsStore?

    var body: some View {
        NavigationStack {
            Group {
                if let store {
                    SettingsMenu(store: store, signOut: signOut)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .background(Palette.settingsBackground.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)) }
                        .accessibilityLabel("Zavřít")
                }
            }
        }
        .tint(Palette.ink)
        .task {
            if store == nil {
                let s = SettingsStore(api: model.api, demo: model.demo)
                store = s
                await s.load()
            }
        }
    }

    private func signOut() {
        Task {
            await model.logout()
            dismiss()
        }
    }
}

struct SettingsMenu: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    var signOut: () -> Void = {}
    @AppStorage("appearance") private var appearance = "system"

    var body: some View {
        SettingsPage(title: "Nastavení") {
            if model.demo {
                Text("Prohlížíš ukázková data. Změny se neukládají.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
            if let error = store.errorMessage {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }

            NavigationLink { ProfileSettingsView(store: store) } label: {
                HStack(spacing: 14) {
                    Image(systemName: "person.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Palette.secondary)
                        .frame(width: 56, height: 56)
                        .background(Palette.sand.opacity(0.6), in: Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Profil").font(.headline).foregroundStyle(Palette.ink)
                        Text("pohlaví, věk, výška a aktivita pro výpočty").font(Typo.caption).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                }
                .padding(16)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                .shadow(color: .black.opacity(0.04), radius: 1, y: 1)
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Data") {
                NavigationLink { GoalsSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "scope", color: Palette.green), title: "Cíle", value: goalsValue)
                }
                SettingsDivider()
                NavigationLink { SourcesSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "arrow.triangle.2.circlepath", color: Palette.indigo), title: "Zdroje dat",
                                value: store.loaded ? "\(store.connectedCount) " + Fmt.plural(store.connectedCount, "připojený", "připojené", "připojených") : nil)
                }
                SettingsDivider()
                NavigationLink { ZonesSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "heart.text.square", color: Palette.rust), title: "Tréninkové zóny", value: "běh, kolo")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Aplikace") {
                NavigationLink { NotificationsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "bell.fill", color: Palette.amberBar), title: "Oznámení", value: remindersValue)
                }
                SettingsDivider()
                NavigationLink { AppearanceSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "circle.lefthalf.filled", color: Palette.button), title: "Vzhled", value: AppearanceSettingsView.label(appearance))
                }
                SettingsDivider()
                NavigationLink { UnitsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "ruler", color: Color(light: 0x5B7FA6, dark: 0x8FB1D6)), title: "Jednotky", value: "metrické")
                }
                SettingsDivider()
                SettingsRow(icon: SettingsIcon(systemImage: "globe", color: Palette.blue), title: "Jazyk", value: "čeština", chevron: false)
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Ostatní") {
                NavigationLink { PrivacySettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "lock.fill", color: Palette.faint), title: "Soukromí a data")
                }
                SettingsDivider()
                Link(destination: URL(string: "https://petrfitnessdata.eu/app")!) {
                    SettingsRow(icon: SettingsIcon(systemImage: "questionmark", color: Color(light: 0x8A5AA6, dark: 0xC79BE0)), title: "Nápověda a kontakt", subtitle: "ve webové aplikaci")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup {
                Button(action: signOut) {
                    SettingsRow(title: model.demo ? "Ukončit ukázku" : "Odhlásit se", chevron: false, titleColor: Palette.rust)
                }
                .buttonStyle(.plain)
            }

            Text("Loadwise \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
                .font(Typo.caption).foregroundStyle(Palette.faint)
                .frame(maxWidth: .infinity)
        }
    }

    @AppStorage(Reminders.bedtimeKey) private var r1 = true
    @AppStorage(Reminders.workoutKey) private var r2 = true
    @AppStorage(Reminders.waterKey) private var r3 = true
    @AppStorage(Reminders.foodKey) private var r4 = true

    private var remindersValue: String {
        let on = [r1, r2, r3, r4].filter { $0 }.count
        return on == 0 ? "vypnutá" : "\(on) " + Fmt.plural(on, "zapnuté", "zapnutá", "zapnutých")
    }

    private var goalsValue: String? {
        if let name = store.profile["eventName"]?.string { return name }
        return GoalsSettingsView.sports.first { $0.0 == store.profile["mainSport"]?.string }?.1
    }
}
