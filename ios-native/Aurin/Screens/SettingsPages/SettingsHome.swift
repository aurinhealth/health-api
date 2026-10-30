import SwiftUI

// The top of Nastavení: who you are, your goals as rings and the parts of the
// app as tiles. Rows below them carry names only (no values, no subtitles).

/// The small spaced capital title above a card, as on SettingsGroup.
struct SettingsTitle: View {
    let text: String

    var body: some View {
        Text(L10n.tr(text)).font(.caption.weight(.medium)).tracking(1.6).textCase(.uppercase).foregroundStyle(Palette.muted)
            .padding(.horizontal, 4)
            .accessibilityAddTraits(.isHeader)
    }
}

/// The photo, the name and "34 let · 182 cm · 81,4 kg" under it; opens Účet.
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
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
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
            .background(RadialGradient(colors: [Palette.amber.opacity(0.16), .clear], center: .topLeading, startRadius: 0, endRadius: 220),
                        in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .cardSurface(cornerRadius: 24)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel([L10n.tr("Účet"), name, details ?? ""].filter { !$0.isEmpty }.joined(separator: ", "))
    }
}

/// A ring filled to the share done today, with the goal's symbol inside.
struct GoalRing: View {
    let progress: Double?
    let color: Color
    let systemImage: String
    var size: CGFloat = 46

    var body: some View {
        ZStack {
            Circle().stroke(Palette.track, lineWidth: 4.5)
            if let progress, progress > 0 {
                Circle().trim(from: 0, to: min(progress, 1))
                    .stroke(color, style: StrokeStyle(lineWidth: 4.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Image(systemName: systemImage).font(.system(size: size * 0.3, weight: .medium)).foregroundStyle(color)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Cíle on one card: sleep, food, drink and weight, each a ring of today's
/// share with the goal under it. Opens Cíle.
struct SettingsGoalsCard: View {
    @Environment(AppModel.self) private var model
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
                HStack(alignment: .top, spacing: 0) {
                    ForEach(cells, id: \.label) { cell in
                        VStack(spacing: 7) {
                            GoalRing(progress: cell.progress, color: cell.color, systemImage: cell.symbol)
                            Text(verbatim: cell.value).font(Typo.number(20)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
                            Text(L10n.tr(cell.label)).font(Typo.tiny.weight(.medium)).foregroundStyle(Palette.secondary)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(L10n.tr(cell.label) + " " + cell.value)
                    }
                }
            }
            .padding(.horizontal, 12).padding(.top, 14).padding(.bottom, 16)
            .cardSurface(cornerRadius: 24)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    struct Cell {
        let symbol: String
        let color: Color
        let value: String
        let label: String
        let progress: Double?
    }

    private static func share(_ done: Double?, _ goal: Double?) -> Double? {
        guard let done, let goal, goal > 0 else { return nil }
        return done / goal
    }

    var cells: [Cell] {
        let today = model.today
        let sleepGoal = store.profile["sleepGoal"]?.number ?? today?.sleep?.need.map(Double.init)
        let kcal = today?.nutrition.target
        let water = today?.nutrition.water
        let weightGoal = store.profile["targetWeight"]?.number ?? today?.weight?.goal
        let waterValue: String = water?.target.map { ml in
            Units.imperial ? Fmt.int(Units.volume(ml)) : Fmt.decimal(ml / 1000, digits: 1)
        } ?? "–"
        return [
            Cell(symbol: "moon.fill", color: Palette.indigo, value: sleepGoal.map { Fmt.hoursMinutes($0) } ?? "–", label: "Spánek",
                 progress: Self.share(today?.sleep?.minutes, sleepGoal)),
            Cell(symbol: "flame.fill", color: Palette.amber, value: kcal.map { Fmt.int($0) } ?? "–", label: "Kalorie",
                 progress: Self.share(today?.nutrition.kcal, kcal)),
            Cell(symbol: "drop.fill", color: Palette.blue, value: waterValue, label: Units.imperial ? "Unce" : "Litry",
                 progress: Self.share(water?.ml, water?.target)),
            Cell(symbol: "scalemass.fill", color: Palette.green, value: weightGoal.map { Fmt.decimal(Units.weight($0), digits: 0) } ?? "–",
                 label: Units.imperial ? "Libry" : "Kilogramy", progress: nil)
        ]
    }
}

/// Spánek, Posilovna, Jídlo a pití (and Cyklus): one tile each, opening its settings.
struct SettingsSectionTiles: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore

    /// Cycle tracking is open to everyone; it is a tile for women and for
    /// anyone who turned it on, otherwise a plain row under Měření.
    static func cycleTile(_ store: SettingsStore, _ model: AppModel) -> Bool {
        store.profile["sex"]?.string == "female" || model.cycle?.enabled == true
    }

    /// Four tiles in a row, as in "+" (AddSheet): the icon on its own tile and
    /// the name under it; Cyklus goes to a second row.
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10, alignment: .top), count: 4), alignment: .leading, spacing: 14) {
            tile("Spánek", "moon.fill", Palette.indigo) { SleepSettingsView(given: store) }
            tile("Posilovna", "dumbbell.fill", Palette.brown) { GymSettingsView() }
            tile("Výživa", "fork.knife", Palette.amber) { FoodDrinkSettingsView() }
            tile("Deník", "book.closed.fill", Palette.indigo) { JournalSettingsView() }
            if Self.cycleTile(store, model) {
                tile("Cyklus", "calendar", Palette.pink) { CycleSettingsView() }
            }
        }
    }

    private func tile<Destination: View>(_ title: String, _ symbol: String, _ color: Color, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink {
            destination()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: symbol).scaledFont(20, cap: .denseCap).foregroundStyle(color)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Palette.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                Text(L10n.tr(title)).font(.caption.weight(.medium)).foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center).lineLimit(2).minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableCardStyle())
    }
}

/// Deník: on or off (the Zdraví card, the morning sheet and the coach's view
/// of it), the morning questions, and what it follows.
struct JournalSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var enabled = JournalSwitch.isOn
    @State private var askMorning = true
    @State private var tracked: Int?
    @State private var tracking = false

    var body: some View {
        SettingsPage(title: "Deník") {
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
                }
                SettingsGroup {
                    Button { tracking = true } label: {
                        SettingsRow(icon: SettingsIcon(systemImage: "checklist", color: Palette.indigo), title: "Co sledovat",
                                    value: tracked.map { String($0) })
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .sheet(isPresented: $tracking, onDismiss: { Task { await load() } }) { JournalEditorView() }
        .task { await load() }
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

    private func save(_ body: JSONObject) async {
        guard !model.demo else { return }
        try? await model.api.setJournalOptions(body)
    }
}

/// Posilovna: what the workouts are made for (goal, experience, stretching),
/// the rests, their sound and vibration, and the heart-rate strap. The equipment stays in Trénink, where
/// the workouts are made from it.
struct GymSettingsView: View {
    var body: some View {
        SettingsPage(title: "Posilovna") {
            GymPreferencesGroup()
            GymRestGroup()
            GymSignalsGroup()
            SettingsGroup {
                NavigationLink { HeartRateSensorView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "sensor.tag.radiowaves.forward", color: Palette.rust), title: "Snímač tepu")
                }
            }
            .buttonStyle(.plain)
        }
    }
}

/// Výživa: the meals of the day, the favourite drinks and the figure.
struct FoodDrinkSettingsView: View {
    var body: some View {
        SettingsPage(title: "Výživa") {
            SettingsGroup {
                NavigationLink { DietSettingsView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "leaf", color: Palette.green), title: "Strava")
                }
                SettingsDivider()
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
