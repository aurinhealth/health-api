import SwiftUI
import UserNotifications

// MARK: - Goals

struct GoalsSettingsView: View {
    let store: SettingsStore
    @State private var mainSport = "general"
    @State private var sportGoal = ""
    @State private var eventName = ""
    @State private var hasEvent = false
    @State private var eventDate = Date()
    @State private var weeklyHours = ""
    @State private var original: JSONObject = [:]

    static let sports = [("cycling", "cyklistika"), ("running", "běh"), ("triathlon", "triatlon"), ("strength", "silový trénink"), ("general", "všeobecná kondice")]

    var body: some View {
        SettingsPage(title: "Cíle") {
            SettingsGroup(title: "Sport", footer: "Trenér podle hlavního sportu volí tréninky a ostatní sporty bere jako doplněk.") {
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
            SettingsGroup(title: "Hlavní závod", footer: "Podle data závodu se plánují fáze přípravy: základ, rozvoj v posledních 12 týdnech a ladění v posledním týdnu.") {
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
        .onAppear(perform: fill)
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
