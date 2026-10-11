import Foundation

/// What the home-screen widgets show: the app writes it after every refresh of
/// Today into the shared App Group, the widgets only read it (they have no
/// session of their own).
struct WidgetSnapshot: Codable, Equatable {
    static let group = "group.eu.petrfitnessdata.loadwise"
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
        return s
    }

    static func clear() {
        UserDefaults(suiteName: group)?.removeObject(forKey: key)
    }

    static let sample = WidgetSnapshot(date: "2026-10-08", updated: Date(), readiness: 78, zone: "green", sleepMinutes: 432, sleepIndex: 82,
                                       strain: 8.4, strainPlanned: 14, hrv: 58, kcal: 1240, kcalTarget: 2650, waterMl: 1200, waterTarget: 2800,
                                       protein: 64, proteinTarget: 150, carbs: 140, carbsTarget: 320, fat: 38, fatTarget: 80,
                                       steps: 6400, stepsGoal: 10000, bedtime: "22:45", nextTitle: "Celé tělo", nextTime: "17:30")
}
