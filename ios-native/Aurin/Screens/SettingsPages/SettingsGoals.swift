import SwiftUI
import UserNotifications

// MARK: - Goals

/// Cíle: every goal in one place. Sleep (its own page with the alarm), the
/// weight, what sets the calorie target, the sport and the main race.
struct GoalsSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var goal = ""
    @State private var targetWeight = ""
    @State private var activity = ""
    @State private var sportHours = ""
    @State private var mainSport = "general"
    @State private var sportGoal = ""
    @State private var eventName = ""
    @State private var hasEvent = false
    @State private var eventDate = Date()
    @State private var weeklyHours = ""
    @State private var original: JSONObject = [:]
    @State private var filled = false

    static let sports = [("cycling", "cyklistika"), ("running", "běh"), ("triathlon", "triatlon"), ("strength", "silový trénink"), ("general", "všeobecná kondice")]

    var body: some View {
        SettingsPage(title: "Cíle") {
            if let error = store.errorMessage { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            SettingsGroup(title: "Tělo") {
                NavigationLink { SleepSettingsView(given: store) } label: {
                    SettingsRow(title: "Spánek", value: sleepValue)
                }
                .buttonStyle(.plain)
                SettingsDivider()
                SettingsPicker(title: "Cíl", selection: $goal, options: Self.goals)
                SettingsDivider()
                SettingsField(title: "Cílová váha", text: $targetWeight, unit: Units.weightUnit)
            }
            SettingsGroup(title: "Jídlo a pití") {
                SettingsPicker(title: "Běžný den", selection: $activity, options: activityOptions)
                SettingsDivider()
                SettingsPicker(title: "Sport týdně", selection: $sportHours, options: sportHourOptions)
                SettingsDivider()
                Button { editing = .kcal } label: { SettingsRow(title: "Kalorie", value: kcalValue) }
                    .buttonStyle(.plain)
                SettingsDivider()
                Button { editing = .water } label: { SettingsRow(title: "Pití", value: waterValue) }
                    .buttonStyle(.plain)
            }
            SettingsGroup(title: "Trénink") {
                SettingsPicker(title: "Hlavní sport", selection: $mainSport, options: sportOptions)
                SettingsDivider()
                SettingsField(title: "Hodin týdně", text: $weeklyHours, unit: "h", placeholder: recentHours.map { Fmt.decimal($0, digits: $0 < 10 ? 1 : 0) } ?? "–")
                SettingsDivider()
                TextField("Cíl vlastními slovy, třeba „zaběhnout půlmaraton pod 1:40“", text: $sportGoal, axis: .vertical)
                    .lineLimit(2...4)
                    .font(.body)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }
            SettingsGroup(title: "Hlavní závod") {
                SettingsToggle(title: "Mám hlavní závod", isOn: $hasEvent)
                if hasEvent {
                    SettingsDivider()
                    SettingsField(title: "Název", text: $eventName, keyboard: .default, placeholder: L10n.tr("Pražský půlmaraton"))
                    SettingsDivider()
                    DatePicker("Datum", selection: $eventDate, in: Date()..., displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                }
            }
        }
        .toolbar { SaveButton(enabled: changes != original, saving: store.saving) { Task { await save() } } }
        .sheet(item: $editing) { goal in
            switch goal {
            case .kcal: CalorieGoalSheet(store: store, auto: model.today?.nutrition.autoTarget ?? model.today?.nutrition.target)
            case .water: WaterGoalSheet(store: store, water: model.today?.nutrition.water, today: model.today?.date ?? "")
            }
        }
        // A changed goal shows on Today and in the rows above.
        .onChange(of: store.profile) { old, new in
            if ["kcalGoal", "waterMode", "waterGoal", "waterStart", "waterStep"].contains(where: { old[$0] != new[$0] }) {
                Task { await model.reloadToday() }
            }
        }
        // Once: coming back from Spánek keeps what was typed here.
        .onAppear { if !filled { fill(); filled = true } }
    }

    enum OwnGoal: String, Identifiable { case kcal, water; var id: String { rawValue } }
    @State private var editing: OwnGoal?

    /// "Auto · 2 450 kcal" or "Vlastní · 2 200 kcal".
    private var kcalValue: String {
        let own = store.profile["kcalGoal"]?.number
        let value = own ?? model.today?.nutrition.target
        return L10n.tr(own != nil ? "Vlastní" : "Auto") + (value.map { " · " + Fmt.int($0) + " kcal" } ?? "")
    }

    /// "Auto · 3,2 l", "Vlastní · 2,0 l" or "Postupně · 2,25 l".
    private var waterValue: String {
        let water = model.today?.nutrition.water
        let mode = store.profile["waterMode"]?.string ?? ""
        let word = mode == "custom" ? "Vlastní" : mode == "build" ? "Postupně" : "Auto"
        let ml = mode == "build" ? water?.build?.baseMl ?? store.profile["waterStart"]?.number : mode == "custom" ? store.profile["waterGoal"]?.number : water?.target
        return L10n.tr(word) + (ml.map { " · " + waterText($0) } ?? "")
    }

    /// "7:30 h", or "automaticky" while the goal follows age and the day.
    private var sleepValue: String {
        store.profile["sleepGoal"]?.number.map { Fmt.hoursMinutes($0) + " h" } ?? L10n.tr("automaticky")
    }

    static let activities = [("sedentary", "Sedavá práce"), ("light", "Lehce aktivní"), ("active", "Aktivní"), ("heavy", "Fyzicky náročná práce")]
    static let sportHourChoices = [("auto", "podle záznamů"), ("0", "žádný"), ("1-3", "1–3 h"), ("3-6", "3–6 h"), ("6-10", "6–10 h"), ("10+", "víc než 10 h")]
    /// "hubnout 0,5 kg týdně", in pounds when the units are imperial.
    static var goals: [(String, String)] {
        func lose(_ kg: Double, _ digits: Int) -> String {
            L10n.f("hubnout %@ týdně", Units.weightText(kg, digits: Units.imperial ? 1 : digits))
        }
        func gain(_ kg: Double, _ digits: Int) -> String {
            L10n.f("nabrat %@ týdně", Units.weightText(kg, digits: Units.imperial ? 1 : digits))
        }
        return [("lose_0.25", lose(0.25, 2)), ("lose_0.5", lose(0.5, 1)), ("lose_0.75", lose(0.75, 2)), ("lose_1", lose(1, 0)),
                ("maintain", L10n.tr("udržovat váhu")), ("gain_0.25", gain(0.25, 2)), ("gain_0.5", gain(0.5, 1))]
    }

    /// "automaticky · Aktivní": the usual day Aurin reads from the steps.
    private var activityOptions: [(String, String)] {
        let guess = store.suggestions["activity"]?.string.flatMap { id in Self.activities.first { $0.0 == id }?.1 }
        return [("", Self.auto(guess.map { L10n.tr($0) }))] + Self.activities
    }

    /// "automaticky · ≈ 4,5 h": the weekly sport of the last four weeks.
    private var sportHourOptions: [(String, String)] {
        let hours = history["weeklyHours"]?.number
        return Self.sportHourChoices.map { $0.0 == "auto" ? ("auto", Self.auto(hours.map { "≈ " + Fmt.decimal($0, digits: $0 < 10 ? 1 : 0) + " h" })) : $0 }
    }

    private static func auto(_ value: String?) -> String {
        value.map { L10n.tr("automaticky") + " · " + $0 } ?? L10n.tr("automaticky")
    }

    /// A value typed in the chosen unit, sent in metric (rounded to 1/scale).
    static func metric(_ text: String, _ toMetric: (Double) -> Double, scale: Double) -> JSONValue {
        let value = JSONValue.field(text)
        guard Units.imperial, case .number(let shown) = value else { return value }
        return .number((toMetric(shown) * scale).rounded() / scale)
    }

    private var history: JSONObject {
        if case .object(let h)? = store.suggestions["trainingHistory"] { return h }
        return [:]
    }

    /// The weekly hours of the last four weeks, shown while the field is empty.
    private var recentHours: Double? {
        history["weeklyHours"]?.number.flatMap { $0 >= 1 ? $0 : nil }
    }

    /// "automaticky · běh": the sport of the recent activities.
    private var sportOptions: [(String, String)] {
        let recent = (history["recentCount"]?.number ?? 0) > 0 ? store.suggestions["mainSport"]?.string ?? history["mainSport"]?.string : nil
        let label = recent.flatMap { id in Self.sports.first { $0.0 == id }?.1 }
        return [("auto", label.map { L10n.tr("automaticky") + " · " + L10n.tr($0) } ?? L10n.tr("automaticky"))] + Self.sports
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func fill() {
        let p = store.profile
        goal = p["goal"]?.string ?? ""
        targetWeight = (p["targetWeight"]?.number).map { (kg: Double) -> String in
            let shown = Units.weight(kg)
            return Fmt.decimal(shown, digits: shown.rounded() == shown ? 0 : 1)
        } ?? ""
        activity = p["activity"]?.string ?? ""
        sportHours = p["sportHours"]?.string ?? ""
        mainSport = p["mainSport"]?.string ?? "general"
        sportGoal = p["sportGoal"]?.string ?? ""
        eventName = p["eventName"]?.string ?? ""
        let date = p["eventDate"]?.string.flatMap { Self.isoDay.date(from: $0) }
        hasEvent = date != nil || !eventName.isEmpty
        eventDate = date ?? Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
        weeklyHours = (p["weeklyHours"]?.number).map { Fmt.decimal($0, digits: $0.rounded() == $0 ? 0 : 1) } ?? ""
        original = changes
    }

    private var changes: JSONObject {
        [
            "goal": .string(goal), "targetWeight": Self.metric(targetWeight, Units.kg, scale: 10),
            "activity": .string(activity), "sportHours": .string(sportHours),
            "mainSport": .string(mainSport),
            "sportGoal": .string(sportGoal),
            "eventName": .string(hasEvent ? eventName : ""),
            "eventDate": .string(hasEvent ? Self.isoDay.string(from: eventDate) : ""),
            "weeklyHours": .field(weeklyHours)
        ]
    }

    private func save() async {
        if await store.saveProfile(changes) { fill() }
    }
}
