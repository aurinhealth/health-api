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
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 18).padding(.vertical, 16)
            .background(RadialGradient(colors: [Palette.amber.opacity(0.16), .clear], center: .topLeading, startRadius: 0, endRadius: 220),
                        in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
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
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.faint)
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, 6)
                HStack(alignment: .top, spacing: 0) {
                    ForEach(cells, id: \.label) { cell in
                        VStack(spacing: 7) {
                            GoalRing(progress: cell.progress, color: cell.color, systemImage: cell.symbol)
                            Text(verbatim: cell.value).font(Typo.number(20)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.7)
                            Text(L10n.tr(cell.label)).font(Typo.tiny).foregroundStyle(Palette.muted).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(L10n.tr(cell.label) + " " + cell.value)
                    }
                }
            }
            .padding(.horizontal, 12).padding(.top, 14).padding(.bottom, 16)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
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
            Cell(symbol: "moon.fill", color: Palette.indigo, value: sleepGoal.map { Fmt.hoursMinutes($0) } ?? "–", label: "spánek",
                 progress: Self.share(today?.sleep?.minutes, sleepGoal)),
            Cell(symbol: "flame.fill", color: Palette.amber, value: kcal.map { Fmt.int($0) } ?? "–", label: "kcal",
                 progress: Self.share(today?.nutrition.kcal, kcal)),
            Cell(symbol: "drop.fill", color: Palette.blue, value: waterValue, label: Units.imperial ? "fl oz" : "l",
                 progress: Self.share(water?.ml, water?.target)),
            Cell(symbol: "scalemass.fill", color: Palette.green, value: weightGoal.map { Fmt.decimal(Units.weight($0), digits: 0) } ?? "–",
                 label: Units.weightUnit, progress: nil)
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

    var body: some View {
        HStack(spacing: 10) {
            tile("Spánek", "moon.fill", Palette.indigo) { SleepSettingsView(given: store) }
            tile("Posilovna", "dumbbell.fill", Palette.brown) { GymSettingsView() }
            tile("Jídlo a pití", "fork.knife", Palette.amber) { FoodDrinkSettingsView() }
            if Self.cycleTile(store, model) {
                tile("Cyklus", "calendar", Palette.pink) { CycleSettingsView() }
            }
        }
    }

    private func tile<Destination: View>(_ title: String, _ symbol: String, _ color: Color, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink {
            destination()
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                Image(systemName: symbol).font(.system(size: 16, weight: .medium)).foregroundStyle(color)
                    .frame(width: 34, height: 34)
                    .background(color.opacity(0.14), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                Spacer(minLength: 14)
                Text(L10n.tr(title)).font(.subheadline.weight(.medium)).foregroundStyle(Palette.ink)
                    .lineLimit(2).minimumScaleFactor(0.85).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
            .padding(14)
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Posilovna: what the workouts are made for (goal, experience, stretching),
/// the rests and the heart-rate strap. The equipment stays in Trénink, where
/// the workouts are made from it.
struct GymSettingsView: View {
    var body: some View {
        SettingsPage(title: "Posilovna") {
            GymPreferencesGroup()
            GymRestGroup()
            SettingsGroup {
                NavigationLink { HeartRateSensorView() } label: {
                    SettingsRow(icon: SettingsIcon(systemImage: "sensor.tag.radiowaves.forward", color: Palette.rust), title: "Snímač tepu")
                }
            }
            .buttonStyle(.plain)
        }
    }
}

/// Jídlo a pití: the meals of the day, the favourite drinks and the figure.
struct FoodDrinkSettingsView: View {
    var body: some View {
        SettingsPage(title: "Jídlo a pití") {
            SettingsGroup {
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
