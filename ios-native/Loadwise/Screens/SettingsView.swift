import SwiftUI

/// Settings: who you are and your goals at the top, the parts of the app as
/// tiles, then closed groups of names only; each row opens its own page.
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
    @Environment(\.dismiss) private var close

    var body: some View {
        SettingsPage(title: "Nastavení") {
            if model.demo {
                Text("Prohlížíš ukázková data. Změny se neukládají.")
                    .font(Typo.small).foregroundStyle(Palette.muted)
            }
            if let error = store.errorMessage {
                Text(error).font(Typo.small).foregroundStyle(Palette.rust)
            }

            SettingsProfileCard(store: store, signOut: signOut)
            ProSettingsRow()
            SettingsGoalsCard(store: store)

            VStack(alignment: .leading, spacing: 10) {
                SettingsTitle(text: "Části aplikace")
                SettingsSectionTiles(store: store)
            }

            // Only the owner: users' corrections of catalogue foods to approve.
            if store.owner && !model.demo {
                SettingsGroup(title: "Správa") {
                    NavigationLink { FoodSuggestionsView(store: store) } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "tray", color: Palette.amber), title: "Návrhy oprav potravin",
                                    badge: store.pendingFoodSuggestions)
                    }
                }
                .buttonStyle(.plain)
            }

            SettingsGroup(title: "Měření") {
                NavigationLink { UnitsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "ruler", color: Palette.blue), title: "Jednotky")
                }
                SettingsDivider()
                NavigationLink { ZonesSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "chart.bar", color: Palette.rust), title: "Zóny")
                }
                if !SettingsSectionTiles.cycleTile(store, model) {
                    SettingsDivider()
                    NavigationLink { CycleSettingsView() } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "calendar", color: Palette.pink), title: "Cyklus")
                    }
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Data") {
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
                NavigationLink { PrivacySettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "lock", color: Palette.muted), title: "Soukromí a data")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Aplikace") {
                NavigationLink { NotificationsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "bell", color: Palette.amber), title: "Oznámení")
                }
                SettingsDivider()
                NavigationLink { AppearanceSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "circle.lefthalf.filled", color: Palette.ink), title: "Vzhled")
                }
                SettingsDivider()
                NavigationLink { AppIconSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "app.badge", color: Palette.amber), title: "Ikona aplikace")
                }
                SettingsDivider()
                NavigationLink { QuickActionsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "hand.tap", color: Palette.green), title: "Rychlé akce")
                }
                SettingsDivider()
                NavigationLink { LanguageSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "globe", color: Palette.blue), title: "Jazyk")
                }
                SettingsDivider()
                NavigationLink { WeatherPlaceView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "mappin.and.ellipse", color: Palette.blue), title: "Poloha pro počasí")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Pomoc") {
                NavigationLink { ReportProblemView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "ladybug", color: Palette.rust), title: "Nahlásit problém")
                }
                SettingsDivider()
                NavigationLink { SuggestFeatureView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "lightbulb", color: Palette.amber), title: "Navrhnout funkci")
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

            // Only the internal testers: the live server or the test server (ServerChoice.swift).
            if store.internalTester && !model.demo {
                SettingsGroup(title: "Testování") {
                    NavigationLink {
                        OptionListPage(title: "Server", selection: serverSelection,
                                       options: ServerChoice.allCases.map { ($0.rawValue, $0.title) })
                    } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "server.rack", color: Palette.muted), title: "Server", value: ServerChoice.current.title)
                    }
                    // The owner only: the website's waitlist, approved into TestFlight.
                    if store.owner {
                        SettingsDivider()
                        NavigationLink { WaitlistView(store: store) } label: {
                            SettingsRow(icon: SettingsIcon(systemImage: "person.2", color: Palette.green), title: "Zájemci", badge: store.pendingWaitlist)
                        }
                    }
                }
                .buttonStyle(.plain)
            }

            Text(verbatim: "Aurin \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
                .font(Typo.caption).foregroundStyle(Palette.faint)
                .frame(maxWidth: .infinity)
        }
    }

    /// Picking the other server switches the whole app to it (AppModel.switchServer).
    private var serverSelection: Binding<String> {
        Binding(get: { ServerChoice.current.rawValue }, set: { raw in
            guard let choice = ServerChoice(rawValue: raw) else { return }
            Task {
                await model.switchServer(to: choice)
                // Settings showed the other server's account.
                close()
            }
        })
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
