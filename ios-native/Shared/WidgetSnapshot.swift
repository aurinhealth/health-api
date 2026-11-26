import Foundation

/// What the home-screen widgets show: the app writes it after every refresh of
/// Today into the shared App Group, the widgets only read it (they have no
/// session of their own).
struct WidgetSnapshot: Codable, Equatable {
    static let group = "group.health.aurin"
    static let key = "widgetSnapshot"

    var date: String
    var updated: Date
    var readiness: Int?
    /// green, yellow or red.
    var zone: String?
    var sleepMinutes: Double?
    var sleepIndex: Int?
    var strain: Double?
    var strainPlanned: Double?
    var hrv: Double?
    var kcal: Double?
    var kcalTarget: Double?
    var waterMl: Double?
    var waterTarget: Double?
    var protein: Double? = nil
    var proteinTarget: Double? = nil
    var carbs: Double? = nil
    var carbsTarget: Double? = nil
    var fat: Double? = nil
    var fatTarget: Double? = nil
    var steps: Double?
    var stepsGoal: Double?
    var bedtime: String?
    var nextTitle: String?
    var nextTime: String?
    /// The usual ranges for the metric widget ("in your range"), the resting
    /// heart rate and Monday to Sunday's readiness zones for the week widget.
    var hrvLow: Double? = nil
    var hrvHigh: Double? = nil
    var restingHR: Double? = nil
    var restingLow: Double? = nil
    var restingHigh: Double? = nil
    var nextSport: String? = nil
    var nextMinutes: Int? = nil
    var weekZones: [String: String]? = nil
    /// The last seven days of HRV and resting heart rate, oldest first (the trend line).
    var hrvSeries: [Double]? = nil
    var restingSeries: [Double]? = nil
    /// The redesign's widgets (concept v3): the night's ends and need (the
    /// night arc), today's strain target, the usual steps a day, and why
    /// readiness has no number yet (no watch or ring, still learning).
    var sleepStart: String? = nil
    var sleepEnd: String? = nil
    var sleepNeed: Int? = nil
    var strainLow: Double? = nil
    var strainHigh: Double? = nil
    var stepsAverage: Double? = nil
    var noWearable: Bool? = nil
    var learningDays: Int? = nil
    /// What the day's numbers say, a key of src/day-verdict.js ("hard"): the
    /// free Today card's line (the free morning push says the same).
    var verdict: String? = nil
    /// What the day's numbers say, never advice (D-DNES-2): a key of
    /// src/day-verdict.js NUMBERS_LINE_KEYS and what is off ("sleep", "hrv",
    /// "restingHR"), the line under Today's readiness.
    var numbersLine: String? = nil
    var numbersOff: [String]? = nil
    /// The calories today's training adds to the target ("Includes 350 kcal for today's training").
    var trainingKcal: Double? = nil

    static func load() -> WidgetSnapshot? {
        guard let data = UserDefaults(suiteName: group)?.data(forKey: key) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return try? decoder.decode(WidgetSnapshot.self, from: data)
    }

    func save() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        guard let data = try? encoder.encode(self) else { return }
        UserDefaults(suiteName: Self.group)?.set(data, forKey: Self.key)
        AurinControls.reload(AurinControls.water)
    }

    /// The snapshot as it stands on `today`: from an earlier day what the app
    /// logs (calories, water) starts again at zero (the targets stay), and the
    /// night, the plan, the steps and the strain are unknown ("–") until the app
    /// refreshes: a "0 kroků" at 9:00 read as a real count. Without this the
    /// widgets showed yesterday's calories, water and steps as today's after midnight.
    func current(today: String) -> WidgetSnapshot {
        guard date != today else { return self }
        var s = self
        s.date = today
        s.readiness = nil
        s.zone = nil
        s.sleepMinutes = nil
        s.sleepIndex = nil
        s.sleepStart = nil
        s.sleepEnd = nil
        s.strainLow = nil
        s.strainHigh = nil
        s.verdict = nil
        s.numbersLine = nil
        s.numbersOff = nil
        s.hrv = nil
        s.strain = nil
        s.kcal = 0
        s.waterMl = 0
        s.protein = protein == nil ? nil : 0
        s.carbs = carbs == nil ? nil : 0
        s.fat = fat == nil ? nil : 0
        s.steps = nil
        s.bedtime = nil
        s.nextTitle = nil
        s.nextTime = nil
        s.nextSport = nil
        s.nextMinutes = nil
        s.restingHR = nil
        return s
    }

    static func clear() {
        UserDefaults(suiteName: group)?.removeObject(forKey: key)
    }

    /// How many hours old the data is at `now`, from 2 hours on (Background App
    /// Refresh off, Low Power Mode): the widgets then say "před 3 h". Nil while fresh.
    func hoursOld(at now: Date) -> Int? {
        let hours = Int(now.timeIntervalSince(updated) / 3600)
        return hours >= 2 ? hours : nil
    }

    static let sample = WidgetSnapshot(date: "2026-10-08", updated: Date(), readiness: 78, zone: "green", sleepMinutes: 432, sleepIndex: 82,
                                       strain: 8.4, strainPlanned: 14, hrv: 58, kcal: 1240, kcalTarget: 2650, waterMl: 1200, waterTarget: 2800,
                                       protein: 64, proteinTarget: 150, carbs: 140, carbsTarget: 320, fat: 38, fatTarget: 80,
                                       steps: 6400, stepsGoal: 10000, bedtime: "22:45", nextTitle: "Celé tělo", nextTime: "17:30",
                                       hrvLow: 48, hrvHigh: 66, restingHR: 52, restingLow: 49, restingHigh: 56, nextSport: "strength", nextMinutes: 60,
                                       hrvSeries: [51, 55, 49, 60, 57, 53, 58], restingSeries: [53, 52, 54, 51, 52, 53, 52],
                                       sleepStart: "23:36", sleepEnd: "06:42", sleepNeed: 420, strainLow: 11, strainHigh: 14, stepsAverage: 9212)
}

/// The coach's word on Today for the Coach widget: what the card on Today
/// shows (the AI's sentence or the rule-based one, the advice in green), saved
/// by CoachTextCard. `free`: the account has the paywall on without Aurin Pro,
/// so the widget shows the free Today card (concept v3) instead.
struct WidgetCoach: Codable, Equatable {
    static let key = "widgetCoach"

    var date: String
    var text: String?
    var advice: String?
    var free: Bool

    static func load() -> WidgetCoach? {
        guard let data = UserDefaults(suiteName: WidgetSnapshot.group)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetCoach.self, from: data)
    }

    /// True when it changed (the Coach widget then reloads).
    @discardableResult
    func save() -> Bool {
        guard Self.load() != self, let data = try? JSONEncoder().encode(self) else { return false }
        UserDefaults(suiteName: WidgetSnapshot.group)?.set(data, forKey: Self.key)
        return true
    }

    static func clear() {
        UserDefaults(suiteName: WidgetSnapshot.group)?.removeObject(forKey: key)
    }
}

/// The week for the large widget: Monday to Sunday's training time, how many
/// planned sessions are done and the next ones. Written when Training loads,
/// and when Today shows the saved week is out of date (WidgetBridge.followWeek).
struct WidgetWeek: Codable, Equatable {
    static let key = "widgetWeek"

    struct Day: Codable, Equatable {
        var date: String
        var minutes: Double
        /// What the plan still has that day (a dashed bar).
        var planned: Double = 0
        /// The day's sport for its disc (This week widget): the first done
        /// session's, else the first planned one's; nil on a rest day.
        var sport: String? = nil

        init(date: String, minutes: Double, planned: Double = 0, sport: String? = nil) {
            self.date = date
            self.minutes = minutes
            self.planned = planned
            self.sport = sport
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            date = try c.decode(String.self, forKey: .date)
            minutes = try c.decode(Double.self, forKey: .minutes)
            planned = try c.decodeIfPresent(Double.self, forKey: .planned) ?? 0
            sport = try c.decodeIfPresent(String.self, forKey: .sport)
        }
    }

    struct Session: Codable, Equatable {
        var title: String
        var sport: String
        var date: String
        var time: String?
        var minutes: Int? = nil
    }

    var days: [Day]
    var minutes: Double
    /// Sessions from the plan done and all of the week's planned ones.
    var done: Int
    var planned: Int
    var next: [Session]

    static func load() -> WidgetWeek? {
        guard let data = UserDefaults(suiteName: WidgetSnapshot.group)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetWeek.self, from: data)
    }

    /// True when it changed (the widgets then reload).
    @discardableResult
    func save() -> Bool {
        guard Self.load() != self, let data = try? JSONEncoder().encode(self) else { return false }
        UserDefaults(suiteName: WidgetSnapshot.group)?.set(data, forKey: Self.key)
        return true
    }

    static func clear() {
        UserDefaults(suiteName: WidgetSnapshot.group)?.removeObject(forKey: key)
    }

    /// Still this week on `today` (yyyy-MM-dd).
    func covers(_ today: String) -> Bool {
        guard let first = days.first?.date, let last = days.last?.date else { return false }
        return first <= today && today <= last
    }

    static let sample = WidgetWeek(
        days: [("2026-10-05", 60, 0), ("2026-10-06", 75, 0), ("2026-10-07", 72, 0), ("2026-10-08", 42, 45), ("2026-10-09", 0, 72), ("2026-10-10", 0, 96), ("2026-10-11", 0, 0)]
            .map { Day(date: $0.0, minutes: Double($0.1), planned: Double($0.2)) },
        minutes: 249, done: 3, planned: 6,
        next: [Session(title: "Silový trénink, celé tělo", sport: "strength", date: "2026-10-08", time: "17:30"),
               Session(title: "Lehká jízda Z2", sport: "ride", date: "2026-10-09", time: nil),
               Session(title: "Dlouhý běh", sport: "run", date: "2026-10-10", time: nil)])
}

/// Health for the Aurin Age, Night values and Sleep (medium) widgets: written
/// when Health loads (WidgetBridge.update(health:)), on its own key so
/// Today's snapshot never overwrites it.
struct WidgetHealth: Codable, Equatable {
    static let key = "widgetHealth"

    /// One of last night's values on the Health monitor card, as it drew it.
    struct Value: Codable, Equatable {
        /// The app's word for it ("Tep v klidu", "Dech" …), translated when shown.
        var label: String
        var text: String
        var unit: String
        /// Where the dot sits, and the usual range for the green arc.
        var drawn: Double
        var low: Double?
        var high: Double?
    }

    /// A night of this week (Monday on), and whether it reached the need.
    struct Night: Codable, Equatable {
        var date: String
        var reached: Bool
    }

    var date: String
    /// The estimate and the real age; nil without Pro or while it collects data.
    var aurinAge: Double?
    var realAge: Double?
    /// "2.4 years younger" in the app's words.
    var aurinAgeWords: String?
    var pro: Bool
    /// The Health monitor card's sentence and its five values.
    var nightTitle: String?
    var values: [Value]
    var nights: [Night]
    var need: Int?

    static func load() -> WidgetHealth? {
        guard let data = UserDefaults(suiteName: WidgetSnapshot.group)?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetHealth.self, from: data)
    }

    /// True when it changed (the widgets then reload).
    @discardableResult
    func save() -> Bool {
        guard Self.load() != self, let data = try? JSONEncoder().encode(self) else { return false }
        UserDefaults(suiteName: WidgetSnapshot.group)?.set(data, forKey: Self.key)
        return true
    }

    static func clear() {
        UserDefaults(suiteName: WidgetSnapshot.group)?.removeObject(forKey: key)
    }

    static let sample = WidgetHealth(
        date: "2026-10-08", aurinAge: 29.6, realAge: 32, aurinAgeWords: "2.4 years younger", pro: true,
        nightTitle: "Breathing above your usual range.",
        values: [Value(label: "Tep v klidu", text: "53", unit: "bpm", drawn: 53, low: 50, high: 56),
                 Value(label: "HRV", text: "68", unit: "ms", drawn: 68, low: 60, high: 74),
                 Value(label: "Kyslík", text: "96", unit: "%", drawn: 96, low: 94, high: 98),
                 Value(label: "Dech", text: "16.1", unit: "/min", drawn: 16.25, low: 15, high: 16),
                 Value(label: "Teplota kůže", text: "0.1", unit: "°C", drawn: 0.1, low: -0.5, high: 0.5)],
        nights: [Night(date: "2026-10-05", reached: true), Night(date: "2026-10-06", reached: false),
                 Night(date: "2026-10-07", reached: false), Night(date: "2026-10-08", reached: false)],
        need: 420)
}
