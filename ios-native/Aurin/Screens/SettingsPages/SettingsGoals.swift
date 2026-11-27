import SwiftUI
import UserNotifications

// MARK: - Goals

/// Cíle: every goal in one place (concept 10, D-NAST-1). The main goal is the
/// onboarding's choice (Get fitter, Race, Lose weight, Strength and muscle); a race takes its name,
/// sport, day and distance, losing weight its pace and target weight. Training
/// has one time to train (the week plan's free time, Plan settings) and what
/// the athlete trains now (Auto from the records, or own hours), which sets
/// the calories. "Uložit" saves; leaving with changes asks first.
struct GoalsSettingsView: View {
    @Environment(AppModel.self) private var model
    let store: SettingsStore
    @State private var goalType = ""
    @State private var goal = ""
    @State private var targetWeight = ""
    @State private var activity = ""
    @State private var trainingNow = "auto"
    @State private var sportHours = ""
    @State private var sportGoal = ""
    @State private var eventName = ""
    @State private var eventSport = ""
    @State private var eventKm = ""
    @State private var eventDate = Date()
    @State private var weeklyHours = ""
    @State private var original: JSONObject = [:]
    @State private var filled = false
    /// The usual week's own minutes per weekday (-1 not set), from the week plan.
    @State private var freeTime: [Int]?
    @State private var planSettings = false

    var body: some View {
        SettingsPage(title: "Cíle", hero: SettingsHero(text: "Tvoje cíle pro spánek, jídlo, váhu a trénink.", art: AnyView(GoalsHeroArt()))) {
            if let error = store.errorMessage { Text(error).font(Typo.small).foregroundStyle(Palette.rust) }
            SettingsGroup(title: "Hlavní cíl", footer: goalType == "muscle" ? FocusChoice.muscleNote : nil) {
                ForEach(FocusChoice.goals.indices, id: \.self) { i in
                    let item = FocusChoice.goals[i]
                    if i > 0 { SettingsDivider() }
                    Button { pick(item.0) } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(L10n.tr(item.1)).font(.body).foregroundStyle(Palette.ink)
                                if let sub = SetupGoalPage.subtitles[item.0] {
                                    Text(L10n.tr(sub)).font(Typo.caption).foregroundStyle(Palette.muted)
                                }
                            }
                            Spacer(minLength: 8)
                            if goalType == item.0 {
                                Image(systemName: "checkmark").font(.body.weight(.semibold)).foregroundStyle(Palette.green)
                            }
                        }
                        .padding(.horizontal, 16).padding(.vertical, 11)
                        .frame(minHeight: 52)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(goalType == item.0 ? .isSelected : [])
                }
            }
            .sensoryFeedback(.selection, trigger: goalType)

            if goalType == "race" {
                SettingsGroup(title: "Hlavní závod", footer: weeksToRace) {
                    SettingsField(title: "Název", text: $eventName, keyboard: .default, placeholder: L10n.tr("Pražský půlmaraton"))
                    SettingsDivider()
                    SettingsPicker(title: "Sport", selection: $eventSport, options: Self.raceSports)
                    SettingsDivider()
                    DatePicker("Datum", selection: $eventDate, in: Date()..., displayedComponents: .date)
                        .environment(\.locale, Fmt.locale)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 50)
                    SettingsDivider()
                    SettingsField(title: "Vzdálenost", text: $eventKm, unit: "km")
                }
            }

            SettingsGroup(title: "Tělo") {
                NavigationLink { SleepSettingsView(given: store) } label: {
                    SettingsRow(title: "Spánek", value: sleepValue)
                }
                .buttonStyle(.plain)
                SettingsDivider()
                if goalType == "lose" {
                    SettingsPicker(title: "Tempo hubnutí", selection: $goal, options: goalOptions.filter { $0.0.hasPrefix("lose_") || $0.0 == goal })
                    SettingsDivider()
                    SettingsField(title: "Cílová váha", text: $targetWeight, unit: Units.weightUnit)
                } else {
                    SettingsPicker(title: "Váha", selection: $goal, options: goalOptions.filter { !$0.0.hasPrefix("lose_") || $0.0 == goal })
                }
            }
            SettingsGroup(title: "Jídlo a pití") {
                SettingsPicker(title: "Běžný den", selection: $activity, options: activityOptions)
                SettingsDivider()
                Button { editing = .kcal } label: { SettingsRow(title: "Kalorie", value: kcalValue) }
                    .buttonStyle(.plain)
                SettingsDivider()
                Button { editing = .water } label: { SettingsRow(title: "Pití", value: waterValue) }
                    .buttonStyle(.plain)
            }
            SettingsGroup(title: "Trénink", footer: "Čas na trénink je strop pro plán. Kolik trénuješ teď, počítá kalorie a první týden plánu.") {
                NavigationLink { SportsSettingsView(store: store) } label: {
                    SettingsRow(title: "Sporty", value: sportsValue)
                }
                .buttonStyle(.plain)
                SettingsDivider()
                Button { planSettings = true } label: {
                    SettingsRow(title: "Čas na tréninky", value: freeTimeValue)
                }
                .buttonStyle(.plain)
                .disabled(model.demo)
                SettingsDivider()
                SettingsPicker(title: "Teď trénuješ", selection: $trainingNow, options: trainingNowOptions)
                if trainingNow == "own" {
                    SettingsDivider()
                    SettingsField(title: "Hodin týdně", text: $weeklyHours, unit: "h")
                }
                SettingsDivider()
                TextField("Cíl vlastními slovy, třeba „zaběhnout půlmaraton pod 1:40“", text: $sportGoal, axis: .vertical)
                    .lineLimit(2...4)
                    .font(.body)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
            }
            if store.profile["mainSport"]?.string == "triathlon", !split.isEmpty {
                SettingsGroup(title: "Jak je týden rozdělený", footer: splitReason) {
                    ForEach(Array(split.enumerated()), id: \.element.sport.id) { index, row in
                        if index > 0 { SettingsDivider() }
                        SettingsRow(icon: SettingsIcon(systemImage: row.sport.symbol, color: row.sport.color), title: L10n.tr(row.sport.label), value: row.value, chevron: false)
                    }
                }
            }
        }
        .settingsSaveBar(enabled: changes != original, saving: store.saving) { Task { await save() } }
        .sheet(item: $editing) { goal in
            switch goal {
            case .kcal: CalorieGoalSheet(store: store, auto: model.settingsToday?.nutrition.autoTarget ?? model.todayGoals?.kcal)
            case .water: WaterGoalSheet(store: store, water: model.settingsToday?.nutrition.water, goalMl: model.todayGoals?.waterMl, today: AppModel.localDate(Date()))
            }
        }
        // The one screen of the time by weekday: Plan settings (week plan), here as there.
        .sheet(isPresented: $planSettings) {
            let monday = WeekPlanView.monday(), today = APIClient.localToday()
            WeekPlanSettingsView(monday: monday, today: today, calendar: model.calendar) { days in
                Task {
                    if let days {
                        _ = await WeekPlanGenerator.replan(model, weeks: [monday, ISODay.shift(monday, 7)], today: today, days: days.isEmpty ? nil : days, calendar: model.calendar)
                        await model.refreshTraining()
                    }
                    await loadFreeTime()
                }
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
        .task { await loadFreeTime() }
    }

    /// The main goal: losing weight starts at a pace (half a kilo, or a quarter
    /// under 50 kg); away from it a losing pace becomes maintain. Strength and
    /// muscle gains a quarter kilo a week; away from it gaining becomes maintain.
    private func pick(_ type: String) {
        withMotion(.snappy) {
            let before = goalType
            goalType = type
            if type == "lose", !goal.hasPrefix("lose_") {
                // Back to the saved pace, else half a kilo.
                let saved = original["goal"]?.string ?? ""
                goal = saved.hasPrefix("lose_") ? saved : goalOptions.contains { $0.0 == "lose_0.5" } ? "lose_0.5" : "lose_0.25"
            } else if type != "lose", goal.hasPrefix("lose_") {
                goal = "maintain"
            }
            if type == "muscle", !goal.hasPrefix("gain_") {
                goal = "gain_0.25"
            } else if before == "muscle", type != "muscle", goal.hasPrefix("gain_") {
                goal = "maintain"
            }
        }
    }

    static let raceSports = [("ride", "Kolo"), ("run", "Běh"), ("swim", "Plavání"), ("tri", "Triatlon")]

    /// "13 weeks to race day.": whole weeks from today.
    private var weeksToRace: String? {
        let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()), to: Calendar.current.startOfDay(for: eventDate)).day ?? 0
        guard days >= 7 else { return nil }
        return L10n.f("%@ do závodu.", L10n.plural("%lld týdnů", days / 7))
    }

    /// "23 h 30 min týdně", the week plan's own time, or "–" before it is set.
    private var freeTimeValue: String {
        guard let freeTime, freeTime.contains(where: { $0 >= 0 }) else { return "–" }
        return L10n.f("%@ týdně", Fmt.duration(freeTime.reduce(0) { $0 + max(0, $1) }))
    }

    /// "Auto, ≈ 4 h 30" from the last four weeks, or Vlastní.
    private var trainingNowOptions: [(String, String)] {
        let hours = history["weeklyHours"]?.number
        let auto = L10n.tr("Auto") + (hours.map { ", ≈ " + Fmt.duration(Int(($0 * 60).rounded())) } ?? "")
        return [("auto", auto), ("own", L10n.tr("Vlastní"))]
    }

    private func loadFreeTime() async {
        guard !model.demo else { freeTime = [60, 0, 60, 45, 0, 120, 90]; return }
        if let plan = try? await model.api.weekPlan(start: nil) { freeTime = WeekPlanPrefs.minutes(plan.prefs) }
    }

    enum OwnGoal: String, Identifiable { case kcal, water; var id: String { rawValue } }
    @State private var editing: OwnGoal?

    /// "Auto, 2 450 kcal" or "Vlastní, 2 200 kcal".
    private var kcalValue: String {
        let own = store.profile["kcalGoal"]?.number
        let value = own ?? model.todayGoals?.kcal
        return L10n.tr(own != nil ? "Vlastní" : "Auto") + (value.map { ", " + Fmt.int($0) + " kcal" } ?? "")
    }

    /// "Auto, 3,2 l", "Vlastní, 2,0 l" or "Postupně, 2,25 l".
    private var waterValue: String {
        let mode = store.profile["waterMode"]?.string ?? ""
        let word = mode == "custom" ? "Vlastní" : mode == "build" ? "Postupně" : "Auto"
        let ml = SettingsGoalsCard.waterGoal(store, model.todayGoals?.waterMl)
        return L10n.tr(word) + (ml.map { ", " + waterText($0) } ?? "")
    }

    /// "7 h 30", or "Auto (dnes 8 h 30 min)" while the goal follows age and the day.
    private var sleepValue: String {
        if let goal = store.profile["sleepGoal"]?.number { return Fmt.duration(Int(goal.rounded())) }
        // Auto shows tonight's need too, the number Settings shows (review 2026-11-25).
        guard let need = model.settingsToday?.tonight?.need else { return L10n.tr("Auto") }
        return L10n.f("Auto (dnes %@)", Fmt.duration(need))
    }

    static let activities = [("sedentary", "Sedavá práce"), ("light", "Lehce aktivní"), ("active", "Aktivní"), ("heavy", "Fyzicky náročná práce")]
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

    /// No pace of losing above 1 % of the body weight a week (55 kg: 0,25 and
    /// 0,5 kg); the server caps it there anyway (src/energy-profile.js
    /// weeklyGoalKg). A saved faster goal stays listed.
    private var goalOptions: [(String, String)] {
        guard let weight = model.settingsToday?.weight?.latest, weight > 0 else { return Self.goals }
        let saved = store.profile["goal"]?.string
        return Self.goals.filter { option in
            guard option.0.hasPrefix("lose_"), let kg = Double(option.0.dropFirst(5)) else { return true }
            return kg <= weight * 0.01 + 0.0001 || option.0 == saved
        }
    }

    /// "Auto, Aktivní": the usual day Aurin reads from the steps (one "Auto" wording, D-NAST-9).
    private var activityOptions: [(String, String)] {
        let guess = store.suggestions["activity"]?.string.flatMap { id in Self.activities.first { $0.0 == id }?.1 }
        return [("", Self.auto(guess.map { L10n.tr($0) }))] + Self.activities
    }

    private static func auto(_ value: String?) -> String {
        value.map { L10n.tr("Auto") + ", " + $0 } ?? L10n.tr("Auto")
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


    /// "Kolo, Běh, Posilovna", or "všechny" while the athlete never chose.
    private var sportsValue: String {
        guard case .array(_)? = store.profile["sports"] else { return L10n.tr("všechny") }
        let kinds = SportsChoice(profile: store.profile).kinds
        return kinds.isEmpty ? L10n.tr("žádný") : kinds.map(SportsChoice.name).joined(separator: ", ")
    }

    /// A triathlete's week (src/triathlon-split.js): "2×, 3 h" per sport, ride, run, swim.
    private var split: [(sport: LibrarySport, value: String)] {
        guard case .object(let s)? = store.suggestions["triathlonSplit"], case .object(let sessions)? = s["sessions"] else { return [] }
        let minutes: JSONObject = { if case .object(let m)? = s["minutes"] { return m }; return [:] }()
        return ["ride", "run", "swim"].compactMap { id in
            guard let sport = LibrarySport.find(id), let count = sessions[id]?.number, count > 0 else { return nil }
            return (sport, "\(Int(count))×" + (minutes[id]?.number.map { ", " + Fmt.duration(Int($0)) } ?? ""))
        }
    }

    private var splitReason: String? {
        guard case .object(let s)? = store.suggestions["triathlonSplit"] else { return nil }
        return s["reason"]?.string
    }

    private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// The hours a bucket of the older "Sport týdně" stood for (src/energy-profile.js
    /// SPORT_HOURS): shown as own hours, and saved as them on the next save.
    /// The server counted the bucket before any hours typed beside it, so the
    /// bucket wins here too and the calories stay the same.
    static let bucketHours: [String: Double] = ["0": 0, "1-3": 2, "3-6": 4.5, "6-10": 8, "10+": 12]

    private func fill() {
        let p = store.profile
        let words = p["sportGoal"]?.string ?? ""
        let fromWords = FocusChoice.goalTexts.first { $0.value == words.trimmingCharacters(in: .whitespaces).lowercased() }?.key
        goalType = p["goalType"]?.string.flatMap { FocusChoice.goalTexts[$0] != nil ? $0 : nil } ?? fromWords ?? ""
        // The goal's own words, not the onboarding's choice kept as words.
        sportGoal = fromWords == nil ? words : ""
        goal = p["goal"]?.string ?? ""
        targetWeight = (p["targetWeight"]?.number).map { (kg: Double) -> String in
            let shown = Units.weight(kg)
            return Fmt.decimal(shown, digits: shown.rounded() == shown ? 0 : 1)
        } ?? ""
        activity = p["activity"]?.string ?? ""
        sportHours = p["sportHours"]?.string ?? ""
        var hours = p["weeklyHours"]?.number
        trainingNow = sportHours == "auto" || (sportHours.isEmpty && hours == nil) ? "auto" : "own"
        if let bucket = Self.bucketHours[sportHours] { hours = bucket }
        weeklyHours = hours.map { Fmt.decimal($0, digits: $0.rounded() == $0 ? 0 : 1) } ?? ""
        eventName = p["eventName"]?.string ?? ""
        // An older race without a sport: the main sport, so its distance is kept.
        let mains = SportsChoice(profile: p).mains
        let mainSport = ["ride", "run", "swim"].allSatisfy { mains.contains($0) } ? "tri" : mains.first { ["ride", "run", "swim"].contains($0) }
        eventSport = p["eventSport"]?.string.flatMap { $0.isEmpty ? nil : $0 } ?? mainSport ?? ""
        eventKm = (p["eventKm"]?.number).map { Fmt.decimal($0, digits: $0.rounded() == $0 ? 0 : 1) } ?? ""
        let date = p["eventDate"]?.string.flatMap { Self.isoDay.date(from: $0) }
        // An older race saved without the choice: still a race, until its day passed.
        if goalType.isEmpty, let date, date >= Calendar.current.startOfDay(for: Date()) { goalType = "race" }
        // Never no choice: a losing pace means Lose weight, anything else Get fitter.
        if goalType.isEmpty { goalType = goal.hasPrefix("lose_") ? "lose" : "fitness" }
        eventDate = date ?? Calendar.current.date(byAdding: .month, value: 3, to: Date()) ?? Date()
        original = changes
    }

    private var changes: JSONObject {
        let race = goalType == "race"
        let own = sportGoal.trimmingCharacters(in: .whitespacesAndNewlines)
        var body: JSONObject = [
            "goal": .string(goal), "targetWeight": Self.metric(targetWeight, Units.kg, scale: 10),
            "activity": .string(activity),
            // Auto counts the recorded training; own hours replace an older bucket
            // ("0" stays a bucket: the server keeps no zero hours).
            "sportHours": .string(trainingNow == "auto" ? "auto" : Double(weeklyHours.replacingOccurrences(of: ",", with: ".")) == 0 ? "0" : ""),
            // Older apps read the choice from these words when no own words are set.
            "sportGoal": .string(own.isEmpty ? FocusChoice.goalTexts[goalType] ?? "" : own),
            "eventName": .string(race ? eventName : ""),
            "eventDate": .string(race ? Self.isoDay.string(from: eventDate) : ""),
            "eventSport": .string(race ? eventSport : ""),
            "eventKm": race ? .field(eventKm) : .null,
            // Auto: no hours, so the server counts the recorded training.
            "weeklyHours": trainingNow == "auto" ? .null : .field(weeklyHours)
        ]
        if !goalType.isEmpty { body["goalType"] = .string(goalType) }
        return body
    }

    private func save() async {
        if await store.saveProfile(changes) { fill() }
    }
}
