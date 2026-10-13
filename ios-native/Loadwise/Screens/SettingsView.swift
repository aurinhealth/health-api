import SwiftUI

/// Settings: a closed menu of names only, each row opens its own page.
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
    @Environment(\.openURL) private var openURL

    var body: some View {
        SettingsPage(title: "Nastavení") {
            if model.demo {
                Text("Prohlížíš ukázková data. Změny se neukládají.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
            if let error = store.errorMessage {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }

            ProSettingsRow()

            SettingsGroup(title: "Obecné") {
                NavigationLink { ProfileSettingsView(store: store, signOut: signOut) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "person", color: Palette.green), title: "Účet")
                }
                SettingsDivider()
                NavigationLink { NotificationsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "bell", color: Palette.amber), title: "Oznámení")
                }
                SettingsDivider()
                NavigationLink { AppearanceSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "circle.lefthalf.filled", color: Palette.ink), title: "Vzhled")
                }
                SettingsDivider()
                NavigationLink { CustomizeSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "slider.horizontal.3", color: Palette.indigo), title: "Přizpůsobení")
                }
                SettingsDivider()
                NavigationLink { LanguageSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "globe", color: Palette.blue), title: "Jazyk")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Data") {
                NavigationLink { GoalsSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "scope", color: Palette.green), title: "Cíle")
                }
                SettingsDivider()
                NavigationLink { SourcesSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "link", color: Palette.indigo), title: "Zdroje dat")
                        // A source to connect again: a red dot on the icon.
                        .overlay(alignment: .topLeading) {
                            if !store.problems.isEmpty {
                                Circle().fill(Palette.rust).frame(width: 9, height: 9)
                                    .overlay(Circle().stroke(Palette.card, lineWidth: 2))
                                    .offset(x: 36, y: 10)
                                    .accessibilityLabel("Připojit znovu")
                            }
                        }
                }
                SettingsDivider()
                NavigationLink { SyncSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "arrow.triangle.2.circlepath", color: Palette.green), title: "Synchronizace")
                }
                SettingsDivider()
                NavigationLink { WeatherPlaceView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "mappin.and.ellipse", color: Palette.blue), title: "Poloha pro počasí")
                }
                SettingsDivider()
                NavigationLink { PrivacySettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "lock", color: Palette.muted), title: "Soukromí a data")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Ostatní") {
                NavigationLink { ReportProblemView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "ladybug", color: Palette.rust), title: "Nahlásit problém")
                }
                SettingsDivider()
                Button(action: contact) {
                    SettingsRow(icon: SettingsIcon(systemImage: "envelope", color: Palette.indigo), title: "Kontaktovat nás", chevron: false)
                        .overlay(alignment: .trailing) {
                            Image(systemName: "arrow.up.right.square").font(.system(size: 14)).foregroundStyle(Palette.faint)
                                .padding(.trailing, 18).accessibilityHidden(true)
                        }
                }
            }
            .buttonStyle(.plain)

            Text(verbatim: "Aurin \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
                .font(Typo.caption).foregroundStyle(Palette.faint)
                .frame(maxWidth: .infinity)
        }
    }

    /// Kontaktovat nás: a new e-mail to support in the phone's mail app, with
    /// the app and iOS version at the end; the support page without one.
    private func contact() {
        let info = Bundle.main.infoDictionary
        let version = "Aurin \(info?["CFBundleShortVersionString"] as? String ?? "") (\(info?["CFBundleVersion"] as? String ?? "")) · iOS \(UIDevice.current.systemVersion)"
        var mail = URLComponents(string: "mailto:support@aurin.health")!
        mail.queryItems = [URLQueryItem(name: "subject", value: "Aurin"), URLQueryItem(name: "body", value: "\n\n\n" + version)]
        openURL(mail.url!) { opened in
            if !opened { openURL(URL(string: "https://aurin.health/support")!) }
        }
    }
}

/// Přizpůsobení: how Aurin fits the body, the gym and the food diary.
struct CustomizeSettingsView: View {
    let store: SettingsStore

    var body: some View {
        SettingsPage(title: "Přizpůsobení") {
            SettingsGroup(title: "Tělo") {
                NavigationLink { HeartActivitySettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "heart", color: Palette.rust), title: "Tep a aktivita")
                }
                SettingsDivider()
                NavigationLink { ZonesSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "chart.bar", color: Palette.rust), title: "Tréninkové zóny")
                }
                SettingsDivider()
                NavigationLink { SleepSettingsView(given: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "moon", color: Palette.indigo), title: "Spánek a budík")
                }
                // Cycle tracking: only with the profile's sex set to female.
                if store.profile["sex"]?.string == "female" {
                    SettingsDivider()
                    NavigationLink { CycleSettingsView() } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "calendar", color: Palette.pink), title: "Cyklus")
                    }
                }
                SettingsDivider()
                NavigationLink { UnitsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "ruler", color: Palette.blue), title: "Jednotky")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Posilovna") {
                NavigationLink { EquipmentView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "dumbbell", color: Palette.brown), title: "Vybavení")
                }
                SettingsDivider()
                NavigationLink { GymRestSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "timer", color: Palette.amber), title: "Pauzy")
                }
                SettingsDivider()
                NavigationLink { HeartRateSensorView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "sensor.tag.radiowaves.forward", color: Palette.rust), title: "Snímač tepu")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Jídlo a pití") {
                NavigationLink { MealSlotsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "fork.knife", color: Palette.amber), title: "Jídla dne")
                }
                SettingsDivider()
                NavigationLink { DrinkSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "cup.and.saucer", color: Palette.blue), title: "Oblíbené nápoje")
                }
                SettingsDivider()
                NavigationLink { DrinkFigureSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "face.smiling", color: Palette.blue), title: "Postavička pití")
                }
            }
            .buttonStyle(.plain)
        }
    }
}
