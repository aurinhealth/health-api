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
    @AppStorage("restSets") private var restSets = 90
    @AppStorage("restExercises") private var restExercises = 120
    @AppStorage(DrinkFigureKind.storageKey) private var drinkFigure = DrinkFigureKind.fallback.rawValue

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

            NavigationLink { ProfileSettingsView(store: store, signOut: signOut) } label: {
                HStack(spacing: 14) {
                    AvatarView(size: 56)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(verbatim: profileName ?? L10n.tr("Profil")).font(.headline).foregroundStyle(Palette.ink).lineLimit(1)
                        Text(verbatim: email.isEmpty ? L10n.tr("fotka, jméno, věk a výška") : email)
                            .font(Typo.caption).foregroundStyle(Palette.muted).lineLimit(1).truncationMode(.middle)
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
                                value: !store.problems.isEmpty ? L10n.tr("připojit znovu")
                                    : store.loaded ? "\(store.connectedCount) " + Fmt.plural(store.connectedCount, "připojený", "připojené", "připojených") : nil)
                        // A source to connect again: a red dot on the icon.
                        .overlay(alignment: .topLeading) {
                            if !store.problems.isEmpty {
                                Circle().fill(Palette.rust).frame(width: 10, height: 10)
                                    .overlay(Circle().stroke(Palette.card, lineWidth: 2))
                                    .offset(x: 40, y: 8)
                                    .accessibilityLabel("Připojit znovu")
                            }
                        }
                }
                SettingsDivider()
                NavigationLink { SyncSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "arrow.up.forward.app.fill", color: Palette.green), title: "Synchronizace")
                }
                SettingsDivider()
                NavigationLink { HeartActivitySettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "heart.fill", color: Palette.rust), title: "Tep a aktivita",
                                value: HeartActivitySettingsView.summary(store.profile, suggestions: store.suggestions))
                }
                SettingsDivider()
                NavigationLink { SleepSettingsView(given: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "moon.zzz.fill", color: Palette.indigo), title: "Spánek a budík", value: sleepValue)
                }
                SettingsDivider()
                NavigationLink { ZonesSettingsView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "heart.text.square", color: Palette.rust), title: "Tréninkové zóny", value: "běh, kolo")
                }
                SettingsDivider()
                NavigationLink { WeatherPlaceView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "cloud.sun.fill", color: Palette.blue), title: "Poloha pro počasí", value: model.today?.weather?.place)
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Posilovna, jídlo a pití") {
                NavigationLink { EquipmentView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "dumbbell.fill", color: Palette.brown), title: "Vybavení na posilování")
                }
                SettingsDivider()
                NavigationLink { GymRestSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "timer", color: Palette.amberBar), title: "Pauzy v posilovně",
                                value: GymRestSettingsView.label(restSets) + " / " + GymRestSettingsView.label(restExercises))
                }
                SettingsDivider()
                NavigationLink { HeartRateSensorView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "heart.fill", color: Palette.rust), title: "Snímač tepu",
                                value: HeartRateSensor.shared.savedName)
                }
                SettingsDivider()
                NavigationLink { MealSlotsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "fork.knife", color: Palette.amber), title: "Jídla dne")
                }
                SettingsDivider()
                NavigationLink { DrinkSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "cup.and.saucer.fill", color: Palette.blue), title: "Oblíbené nápoje")
                }
                SettingsDivider()
                NavigationLink { DrinkFigureSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "drop.fill", color: Palette.blue), title: "Postavička pití",
                                value: DrinkFigureKind.from(drinkFigure).label)
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
                    SettingsRow(icon: SettingsIcon(systemImage: "ruler", color: Color(light: 0x5B7FA6, dark: 0x8FB1D6)), title: "Jednotky", value: UnitsSettingsView.label(units))
                }
                SettingsDivider()
                NavigationLink { LanguageSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "globe", color: Palette.blue), title: "Jazyk", value: LanguageSettingsView.label(language))
                }
            }
            .buttonStyle(.plain)

            SettingsGroup(title: "Ostatní") {
                NavigationLink { PrivacySettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "lock.fill", color: Palette.faint), title: "Soukromí a data")
                }
                SettingsDivider()
                NavigationLink { ReportProblemView(store: store) } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "ladybug.fill", color: Palette.rust), title: "Nahlásit problém")
                }
                SettingsDivider()
                Link(destination: URL(string: "https://aurin.health/support")!) {
                    SettingsRow(icon: SettingsIcon(systemImage: "questionmark", color: Color(light: 0x8A5AA6, dark: 0xC79BE0)), title: "Nápověda a kontakt", subtitle: "aurin.health/support")
                }
            }
            .buttonStyle(.plain)

            SettingsGroup {
                Button(action: signOut) {
                    SettingsRow(title: model.demo ? "Ukončit ukázku" : "Odhlásit se", chevron: false, titleColor: Palette.rust)
                }
                .buttonStyle(.plain)
            }

            Text(verbatim: "Loadwise \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
                .font(Typo.caption).foregroundStyle(Palette.faint)
                .frame(maxWidth: .infinity)
        }
    }

    @AppStorage(AvatarStore.nameKey) private var accountName = ""
    @AppStorage(AvatarStore.emailKey) private var email = ""

    /// The name typed in Profil, else the account's.
    private var profileName: String? {
        store.profile["displayName"]?.string ?? accountName.nilIfBlank
    }

    @AppStorage(Units.key) private var units = "metric"
    @AppStorage(L10n.key) private var language = L10n.defaultLanguage
    @AppStorage(Reminders.bedtimeKey) private var r1 = true
    @AppStorage(Reminders.workoutKey) private var r2 = true
    @AppStorage(Reminders.waterKey) private var r3 = true
    @AppStorage(Reminders.foodKey) private var r4 = true

    private var remindersValue: String {
        let on = [r1, r2, r3, r4].filter { $0 }.count
        return on == 0 ? "vypnutá" : "\(on) " + Fmt.plural(on, "zapnuté", "zapnutá", "zapnutých")
    }

    private var sleepValue: String? {
        if let wake = store.profile["wakeTime"]?.string { return L10n.f("budík %@", ClockText.format(wake)) }
        return store.profile["sleepGoal"]?.number.map { Fmt.hoursMinutes($0) + " h" }
    }

    private var goalsValue: String? {
        if let name = store.profile["eventName"]?.string { return name }
        if store.profile["mainSport"]?.string == "auto" { return "automaticky" }
        return GoalsSettingsView.sports.first { $0.0 == store.profile["mainSport"]?.string }?.1
    }
}
