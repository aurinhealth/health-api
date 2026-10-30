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

    /// The snapshot as it stands on `today`: from an earlier day the day's
    /// counts start again at zero (the targets stay), and the night and the
    /// plan are unknown until the app refreshes. Without this the widgets
    /// showed yesterday's calories, water and steps as today's after midnight.
    func current(today: String) -> WidgetSnapshot {
        guard date != today else { return self }
        var s = self
        s.date = today
        s.readiness = nil
        s.zone = nil
        s.sleepMinutes = nil
        s.sleepIndex = nil
        s.hrv = nil
        s.strain = 0
        s.kcal = 0
        s.waterMl = 0
        s.protein = protein == nil ? nil : 0
        s.carbs = carbs == nil ? nil : 0
        s.fat = fat == nil ? nil : 0
        s.steps = 0
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

    static let sample = WidgetSnapshot(date: "2026-10-08", updated: Date(), readiness: 78, zone: "green", sleepMinutes: 432, sleepIndex: 82,
                                       strain: 8.4, strainPlanned: 14, hrv: 58, kcal: 1240, kcalTarget: 2650, waterMl: 1200, waterTarget: 2800,
                                       protein: 64, proteinTarget: 150, carbs: 140, carbsTarget: 320, fat: 38, fatTarget: 80,
                                       steps: 6400, stepsGoal: 10000, bedtime: "22:45", nextTitle: "Celé tělo", nextTime: "17:30",
                                       hrvLow: 48, hrvHigh: 66, restingHR: 52, restingLow: 49, restingHigh: 56, nextSport: "strength", nextMinutes: 60,
                                       hrvSeries: [51, 55, 49, 60, 57, 53, 58], restingSeries: [53, 52, 54, 51, 52, 53, 52])
}

/// The week for the large widget: Monday to Sunday's training time, how many
/// planned sessions are done and the next ones. Written when Training loads.
struct WidgetWeek: Codable, Equatable {
    static let key = "widgetWeek"

    struct Day: Codable, Equatable {
        var date: String
        var minutes: Double
        /// What the plan still has that day (a dashed bar).
        var planned: Double = 0

        init(date: String, minutes: Double, planned: Double = 0) {
            self.date = date
            self.minutes = minutes
            self.planned = planned
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            date = try c.decode(String.self, forKey: .date)
            minutes = try c.decode(Double.self, forKey: .minutes)
            planned = try c.decodeIfPresent(Double.self, forKey: .planned) ?? 0
        }
    }

    struct Session: Codable, Equatable {
        var title: String
        var sport: String
        var date: String
        var time: String?
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
        days: [("2026-10-05", 60, 0), ("2026-10-06", 45, 0), ("2026-10-07", 90, 0), ("2026-10-08", 0, 75), ("2026-10-09", 75, 0), ("2026-10-10", 0, 60), ("2026-10-11", 0, 120)]
            .map { Day(date: $0.0, minutes: Double($0.1), planned: Double($0.2)) },
        minutes: 390, done: 5, planned: 6,
        next: [Session(title: "Sweet spot 2×15", sport: "ride", date: "2026-10-08", time: "17:30"),
               Session(title: "Horní část těla", sport: "strength", date: "2026-10-10", time: nil),
               Session(title: "Dlouhý běh", sport: "run", date: "2026-10-11", time: nil)])
}
