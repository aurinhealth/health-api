import SwiftUI

// The top of Nastavení: who you are, your goals and the parts of the app as
// tiles. Rows below them carry names only (no values, no subtitles).

/// The small spaced capital title above a card, as on SettingsGroup.
struct SettingsTitle: View {
    let text: String

    var body: some View {
        Text(L10n.tr(text)).font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
            .padding(.horizontal, 4)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The photo, the name and "34 let, 182 cm, 81,4 kg" under it; opens Účet.
struct SettingsProfileCard: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    var signOut: () -> Void = {}
    @AppStorage(AppModel.displayNameKey) private var shownName = ""
    @AppStorage(AvatarStore.nameKey) private var accountName = ""

    private var name: String {
        store.profile["displayName"]?.string?.trimmingCharacters(in: .whitespaces).nilIfBlank
            ?? shownName.nilIfBlank ?? accountName.nilIfBlank ?? L10n.tr("Účet")
    }

    /// Age, height and the latest weight, whichever are known.
    private var details: String? {
        let p = store.profile
        var years: Int? = nil
        if let text = p["birthDate"]?.string, let date = ProfileSettingsView.dayFormat.date(from: text) {
            years = ProfileSettingsView.years(from: date)
        } else if let age = p["age"]?.number {
            years = Int(age)
        }
        var parts: [String] = []
        if let years, years > 0 { parts.append(L10n.f("%@ let", String(years))) }
        if let height = p["height"]?.number, height > 0 { parts.append(Units.lengthText(height)) }
        if let weight = model.today?.weight?.latest, weight > 0 { parts.append(Units.weightText(weight)) }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    var body: some View {
        NavigationLink { ProfileSettingsView(store: store, signOut: signOut) } label: {
            HStack(spacing: 14) {
                AvatarView(size: 54)
                VStack(alignment: .leading, spacing: 6) {
                    Text(name).font(Typo.number(28)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
                    if let details {
                        Text(verbatim: details).font(.footnote).foregroundStyle(Palette.muted).lineLimit(1).minimumScaleFactor(0.8)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 18).padding(.vertical, 16)
            .cardSurface(cornerRadius: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityLabel([L10n.tr("Účet"), name, details ?? ""].filter { !$0.isEmpty }.joined(separator: ", "))
    }
}

/// Cíle on one card: sleep, calories, drinks and the target weight, each its
/// symbol on a disc with the goal and its unit under it. No rings: a part-filled
/// ring reads as today's progress, and these are goals (D-NAST-5). Opens Cíle.
struct SettingsGoalsCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dynamicTypeSize) private var textSize
    let store: SettingsStore

    var body: some View {
        NavigationLink { GoalsSettingsView(store: store) } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Cíle").font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    Spacer()
                    Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, 6)
                Rectangle().fill(Palette.hairline).frame(height: 1).padding(.horizontal, 6)
                // Four in a row; two by two at the accessibility text sizes.
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: textSize.isAccessibilitySize ? 2 : 4),
                          spacing: 14) {
                    ForEach(cells, id: \.label) { cell in
                        VStack(spacing: 7) {
                            SettingsDisc(systemImage: cell.symbol, color: cell.color, size: 40)
                            // The number always 20 pt; the unit small beside it, so the row stays even.
                            HStack(alignment: .firstTextBaseline, spacing: 3) {
                                Text(verbatim: cell.number ?? "–").font(Typo.number(20)).foregroundStyle(Palette.ink)
                                if cell.number != nil {
                                    Text(verbatim: cell.unit).font(Typo.tiny).foregroundStyle(Palette.muted)
                                }
                            }
                            .lineLimit(1)
                            Text(L10n.tr(cell.label)).font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.secondary)
                                .multilineTextAlignment(.center).lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(L10n.tr(cell.label) + ", " + (cell.number.map { $0 + " " + cell.unit } ?? L10n.tr("nenastaveno")))
                    }
                }
            }
            .padding(.horizontal, 12).padding(.top, 14).padding(.bottom, 16)
            .cardSurface(cornerRadius: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableCardStyle())
    }

    struct Cell {
        let symbol: String
        let color: Color
        /// Nil while the goal is not set: a dash, and "nenastaveno" for VoiceOver.
        let number: String?
        let unit: String
        let label: String
    }

    /// "7" (with the unit "h" beside it) or "7 h 30", the one way a length is written (D-ZDRAVI-12).
    static func sleepText(_ minutes: Double) -> String {
        let m = Int(minutes.rounded())
        return m % 60 == 0 ? String(m / 60) : Fmt.duration(m)
    }

    /// "3,2" litres or "108" fl oz.
    static func drinkText(_ ml: Double) -> String {
        Units.imperial ? Fmt.int(Units.volume(ml)) : Fmt.decimal(ml / 1000, digits: 1)
    }

    /// The drinks goal as Cíle shows it: your own, the build-up's base, or
    /// today's automatic target (602 point 64: hub and Cíle say the same).
    static func waterGoal(_ store: SettingsStore, _ water: TodaySnapshot.Water?) -> Double? {
        switch store.profile["waterMode"]?.string {
        case "custom": return store.profile["waterGoal"]?.number
        case "build": return water?.build?.baseMl ?? store.profile["waterStart"]?.number
        default: return water?.target
        }
    }

    var cells: [Cell] {
        let today = model.today
        let sleepGoal = store.profile["sleepGoal"]?.number ?? today?.sleep?.need.map(Double.init)
        let kcal = today?.nutrition.target
        let water = Self.waterGoal(store, today?.nutrition.water)
        let weightGoal = store.profile["targetWeight"]?.number ?? today?.weight?.goal
        return [
            Cell(symbol: "moon.fill", color: Palette.indigo, number: sleepGoal.map(Self.sleepText),
                 unit: sleepGoal.map { Int($0.rounded()) % 60 == 0 } == false ? "" : "h", label: "Spánek"),
            Cell(symbol: "flame.fill", color: Palette.amber, number: kcal.map { Fmt.int($0) }, unit: "kcal", label: "Kalorie"),
            Cell(symbol: "drop.fill", color: Palette.blue, number: water.map(Self.drinkText), unit: Units.imperial ? Units.volumeUnit : "l", label: "Pití"),
            Cell(symbol: "scalemass.fill", color: Palette.green, number: weightGoal.map { Fmt.decimal(Units.weight($0), digits: 0) }, unit: Units.weightUnit, label: "Cílová váha")
        ]
    }
}

/// The top of Cíle: the four goal symbols on their discs, as on the card.
struct GoalsHeroArt: View {
    var body: some View {
        HStack(spacing: 10) {
            SettingsDisc(systemImage: "moon.fill", color: Palette.indigo, size: 46)
            SettingsDisc(systemImage: "flame.fill", color: Palette.amber, size: 46)
            SettingsDisc(systemImage: "drop.fill", color: Palette.blue, size: 46)
            SettingsDisc(systemImage: "scalemass.fill", color: Palette.green, size: 46)
        }
    }
}

/// Spánek, Posilovna, Výživa, Deník (and Cyklus): two tiles to a row, each
/// its symbol on a disc, the name and a chevron, opening its settings.
struct SettingsSectionTiles: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore

    /// Cycle tracking is open to everyone; it is a tile for women and for
    /// anyone who turned it on, otherwise a plain row in Přizpůsobení.
    static func cycleTile(_ store: SettingsStore, _ model: AppModel) -> Bool {
        store.profile["sex"]?.string == "female" || model.cycle?.enabled == true
    }

    @Environment(\.dynamicTypeSize) private var textSize

    /// Two a row; one a row at the accessibility text sizes, where a name no longer fits half the width.
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: textSize.isAccessibilitySize ? 1 : 2), alignment: .leading, spacing: 12) {
            tile("Spánek", "moon.fill", Palette.indigo) { SleepSettingsView(given: store) }
            tile("Posilovna", "dumbbell.fill", Palette.rust) { GymSettingsView() }
            tile("Výživa", "fork.knife", Palette.amber) { FoodDrinkSettingsView() }
            tile("Deník", "book.closed.fill", Palette.green) { JournalSettingsView() }
            if Self.cycleTile(store, model) {
                tile("Cyklus", "calendar", Palette.pink) { CycleSettingsView() }
            }
        }
    }

    private func tile<Destination: View>(_ title: String, _ symbol: String, _ color: Color, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink {
            destination()
        } label: {
            HStack(spacing: 8) {
                SettingsDisc(systemImage: symbol, color: color, size: 32)
                // The name first, so the spacer never splits a word: one line,
                // a little smaller if it must; two at the accessibility sizes
                // (one tile a row there).
                Text(L10n.tr(title)).font(.body.weight(.medium)).foregroundStyle(Palette.ink)
                    .lineLimit(textSize.isAccessibilitySize ? 2 : 1).minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    .layoutPriority(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").scaledFont(13, weight: .semibold).foregroundStyle(Palette.faint)
                    .accessibilityHidden(true)
            }
            .padding(.leading, 10).padding(.trailing, 12)
            .frame(minHeight: 64)
            .cardSurface(cornerRadius: 22)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableCardStyle())
    }
}

/// Deník: on or off (the Zdraví card, the morning sheet and the coach's view
/// of it), the morning questions and what it follows. Its consents (the
/// sensitive items for the coach, sexual activity) are in Soukromí a data.
struct JournalSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var enabled = JournalSwitch.isOn
    @State private var askMorning = true
    @State private var failure: String?
    @State private var tracked: Int?
    @State private var tracking = false

    var body: some View {
        SettingsPage(title: "Deník", hero: SettingsHero(systemImage: "book.closed.fill", color: Palette.green, text: heroText)) {
            SettingsGroup {
                SettingsToggle(title: "Sledovat deník", isOn: Binding(get: { enabled }, set: { on in
                    enabled = on
                    JournalSwitch.remember(on)
                    Task { await save(["enabled": .bool(on)]) }
                }))
            }
            if enabled {
                SettingsGroup {
                    SettingsToggle(title: "Ptát se ráno", isOn: Binding(get: { askMorning }, set: { on in
                        askMorning = on
                        Task { await save(["askMorning": .bool(on)]) }
                    }))
                    SettingsDivider()
                    Button { tracking = true } label: {
                        SettingsRow(title: "Co sledovat", value: tracked.map { String($0) })
                    }
                    .buttonStyle(.plain)
                }
                // The consents (sensitive items for the coach, sexual activity from Apple Health) live in Soukromí a data.
                PrivacyLinkRow(subtitle: "Citlivé položky a sexuální aktivita")
            }
            if let failure { Text(failure).font(Typo.small).foregroundStyle(Palette.rust).fixedSize(horizontal: false, vertical: true) }
        }
        .sheet(isPresented: $tracking, onDismiss: { Task { await load() } }) { JournalEditorView() }
        .task { await load() }
    }

    /// The state in one sentence: "Your journal is on, with 14 items to track."
    private var heroText: String {
        guard enabled else { return L10n.tr("Tvůj deník je vypnutý.") }
        guard let tracked else { return L10n.tr("Tvůj deník je zapnutý.") }
        return L10n.f("Tvůj deník je zapnutý, sleduješ v něm %@.", L10n.plural("%lld věcí", tracked))
    }

    private func load() async {
        if model.demo {
            tracked = DemoJournal.catalog?.pinned.count
            return
        }
        guard let catalog = try? await model.api.journalCatalog() else { return }
        enabled = catalog.enabled ?? true
        askMorning = catalog.askMorning ?? true
        tracked = catalog.pinned.count
        JournalSwitch.remember(catalog.enabled)
    }

    /// Whether the server stored it; if not, the reason is shown under the switches.
    @discardableResult
    private func save(_ body: JSONObject) async -> Bool {
        guard !model.demo else { return true }
        do {
            try await model.api.setJournalOptions(body)
            failure = nil
            return true
        } catch {
            failure = error.localizedDescription
            return false
        }
    }
}

/// What the coach gets from the sensitive journal items (src/routes-journal.js
/// journalForCoach) and the explicit consent (GDPR art. 9), like the cycle's.
struct JournalSensitiveConsentSheet: View {
    let accept: () -> Void

    var body: some View {
        ConsentSheet(title: "Kouč vidí citlivé položky",
                     lead: "Tvoje odpovědi o náladě, úzkosti, konopí, CBD a lécích pomohou kouči vysvětlit tvou regeneraci.",
                     legal: "Jde o údaje o zdraví (čl. 9 GDPR). Zapnutím dáváš výslovný souhlas s jejich předáním AI kouči (OpenAI, USA). Kdykoli ho vypneš a kouč je přestane dostávat.",
                     accept: accept) {
            ConsentSection("Co tím získáš")
            ConsentPoint("Rady, které počítají s léky, které bereš")
            ConsentPoint("Jasnější důvod, proč se připravenost změnila")
            ConsentSection("Co kouč uvidí")
            ConsentPoint("Včerejší odpovědi u těchto položek a jak působí na připravenost")
            ConsentPoint("Starší záznamy", included: false)
            ConsentSection("Které položky")
            Text("Nálada, Úzkost, Konopí, CBD a všechno v Lécích. Sex kouč neuvidí nikdy.").font(.body).foregroundStyle(Palette.secondary)
                .fixedSize(horizontal: false, vertical: true).padding(.vertical, 5)
        }
    }
}

/// Sexual activity from Apple Health (HealthReader.sexualActivity): what it
/// fills in and its own explicit consent (sex life, GDPR art. 9). It never
/// goes to the AI coach (src/journal-catalog.js NEVER_TO_AI).
struct AppleSexConsentSheet: View {
    let accept: () -> Void

    var body: some View {
        ConsentSheet(title: "Sexuální aktivita z Apple Health",
                     lead: "Vyplní v deníku položku Sex a ukáže, jak působí na tvou připravenost.",
                     legal: "Jde o údaj o sexuálním životě (čl. 9 GDPR). Zapnutím dáváš výslovný souhlas s jeho zpracováním. Kdykoli ho vypneš a uložené údaje smažeme.",
                     accept: accept) {
            ConsentPoint("Jedna hodnota za den: ano, nebo ne")
                .padding(.top, 14)
            ConsentPoint("Zůstane v Aurinu")
            ConsentPoint("Do AI kouče nejde nikdy", included: false)
        }
    }
}

/// Posilovna: what the workouts are made for (goal, experience, stretching),
/// the rests, their sound and vibration, and the heart-rate strap. The equipment stays in Trénink, where
/// the workouts are made from it.
struct GymSettingsView: View {
    var body: some View {
        SettingsPage(title: "Posilovna", hero: SettingsHero(systemImage: "dumbbell.fill", color: Palette.rust, text: "Jak se staví a časují tvoje tréninky v posilovně.")) {
            GymPreferencesGroup()
            GymRestGroup()
            GymSignalsGroup()
            SettingsGroup {
                NavigationLink { HeartRateSensorView() } label: {
                    SettingsRow(title: "Snímač tepu")
                }
            }
            .buttonStyle(.plain)
        }
    }
}

/// Výživa: the meals of the day, the favourite drinks, the figure and the food region.
struct FoodDrinkSettingsView: View {
    @AppStorage(FoodRegion.key) private var foodRegion = FoodRegion.automatic

    var body: some View {
        SettingsPage(title: "Výživa", hero: SettingsHero(systemImage: "fork.knife", color: Palette.amber, text: "Jídlo a pití nastavené tak, jak jíš.")) {
            SettingsGroup {
                NavigationLink { DietSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "leaf.fill", color: Palette.green, disc: true), title: "Strava")
                }
                SettingsDivider()
                NavigationLink { MealSlotsSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "fork.knife", color: Palette.amber, disc: true), title: "Jídla dne")
                }
                SettingsDivider()
                NavigationLink { DrinkSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "cup.and.saucer.fill", color: Palette.coffee, disc: true), title: "Oblíbené nápoje")
                }
                SettingsDivider()
                NavigationLink { DrinkFigureSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "face.smiling", color: Palette.blue, disc: true), title: "Postavička pití")
                }
                SettingsDivider()
                NavigationLink {
                    OptionListPage(title: "Region potravin", selection: $foodRegion, options: FoodRegion.options,
                                   footer: "Potraviny z tohoto regionu se ve vyhledávání ukážou první. Automaticky se řídí regionem iPhonu.")
                } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "globe", color: Palette.indigo, disc: true), title: "Region potravin",
                                value: foodRegion == FoodRegion.automatic ? "Automaticky" : FoodRegion.title(foodRegion))
                }
            }
            .buttonStyle(.plain)
        }
    }
}
