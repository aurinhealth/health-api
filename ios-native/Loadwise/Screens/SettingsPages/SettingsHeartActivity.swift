import SwiftUI
import UserNotifications

/// Tep a aktivita: the values behind heart-rate zones and the calorie target,
/// apart from Profil's personal details.
struct HeartActivitySettingsView: View {
    let store: SettingsStore
    @State private var hrmax = ""
    @State private var rhr = ""
    @State private var activity = ""
    @State private var sportHours = ""
    @State private var goal = ""
    @State private var targetWeight = ""
    @State private var original: JSONObject = [:]

    static let activities = [("sedentary", "Sedavá práce"), ("light", "Lehce aktivní"), ("active", "Aktivní"), ("heavy", "Fyzicky náročná práce")]
    static let sportHourOptions = [("auto", "podle záznamů"), ("0", "žádný"), ("1-3", "1–3 h"), ("3-6", "3–6 h"), ("6-10", "6–10 h"), ("10+", "víc než 10 h")]
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

    /// "automaticky · Aktivní": the usual day Loadwise reads from the steps.
    private var activityOptions: [(String, String)] {
        let guess = store.suggestions["activity"]?.string.flatMap { id in Self.activities.first { $0.0 == id }?.1 }
        return [("", Self.auto(guess.map { L10n.tr($0) }))] + Self.activities
    }

    /// "automaticky · ≈ 4,5 h": the weekly sport of the last four weeks.
    private var sportOptions: [(String, String)] {
        let hours: Double? = {
            if case .object(let history)? = store.suggestions["trainingHistory"] { return history["weeklyHours"]?.number }
            return nil
        }()
        return Self.sportHourOptions.map { $0.0 == "auto" ? ("auto", Self.auto(hours.map { "≈ " + Fmt.decimal($0, digits: $0 < 10 ? 1 : 0) + " h" })) : $0 }
    }

    private static func auto(_ value: String?) -> String {
        value.map { L10n.tr("automaticky") + " · " + $0 } ?? L10n.tr("automaticky")
    }

    var body: some View {
        SettingsPage(title: "Tep a aktivita") {
            if let error = store.errorMessage { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            SettingsGroup(title: "Tep") {
                SettingsField(title: "Maximální tep", text: $hrmax, unit: "bpm", keyboard: .numberPad, placeholder: suggested("hrmax"))
                SettingsDivider()
                SettingsField(title: "Klidový tep", text: $rhr, unit: "bpm", keyboard: .numberPad, placeholder: suggested("rhr"))
            }
            SettingsGroup(title: "Aktivita a cíl") {
                SettingsPicker(title: "Běžný den", selection: $activity, options: activityOptions)
                SettingsDivider()
                SettingsPicker(title: "Sport týdně", selection: $sportHours, options: sportOptions)
                SettingsDivider()
                SettingsPicker(title: "Cíl", selection: $goal, options: Self.goals)
                SettingsDivider()
                SettingsField(title: "Cílová váha", text: $targetWeight, unit: Units.weightUnit)
            }
        }
        .toolbar { SaveButton(enabled: changes != original, saving: store.saving) { Task { await save() } } }
        .onAppear(perform: fill)
    }

    /// The worked-out value shown in an empty field.
    private func suggested(_ key: String) -> String {
        (store.suggestions[key]?.number).map { Fmt.int($0) } ?? "–"
    }

    /// "max 186 · klid 48" for the row in Settings.
    static func summary(_ profile: JSONObject, suggestions: JSONObject = [:]) -> String? {
        let value = { (key: String) in profile[key]?.string ?? suggestions[key]?.number.map { Fmt.int($0) } }
        let parts = [value("hrmax").map { L10n.f("max %@", $0) }, value("rhr").map { L10n.f("klid %@", $0) }].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func fill() {
        let p = store.profile
        hrmax = p["hrmax"]?.string ?? ""
        rhr = p["rhr"]?.string ?? ""
        activity = p["activity"]?.string ?? ""
        sportHours = p["sportHours"]?.string ?? ""
        goal = p["goal"]?.string ?? ""
        targetWeight = (p["targetWeight"]?.number).map { (kg: Double) -> String in
            let shown = Units.weight(kg)
            return Fmt.decimal(shown, digits: shown.rounded() == shown ? 0 : 1)
        } ?? ""
        original = changes
    }

    private var changes: JSONObject {
        ["hrmax": .field(hrmax), "rhr": .field(rhr), "activity": .string(activity), "sportHours": .string(sportHours),
         "goal": .string(goal), "targetWeight": Self.metric(targetWeight, Units.kg, scale: 10)]
    }

    /// A value typed in the chosen unit, sent in metric (rounded to 1/scale).
    static func metric(_ text: String, _ toMetric: (Double) -> Double, scale: Double) -> JSONValue {
        let value = JSONValue.field(text)
        guard Units.imperial, case .number(let shown) = value else { return value }
        return .number((toMetric(shown) * scale).rounded() / scale)
    }

    private func save() async {
        if await store.saveProfile(changes) { fill() }
    }
}
