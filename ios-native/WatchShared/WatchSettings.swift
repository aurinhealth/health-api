import Foundation

/// Settings → Apple Watch on the iPhone (Screens/SettingsPages/SettingsWatch.swift),
/// sent to the watch with Today: the pages by the crown and their order, what
/// the end of a rest does, whether Training mode opens the gym on the watch,
/// and whether the alarm rings on the watch.
struct WatchSettings: Codable, Equatable, Sendable {
    static let contextKey = "watchSettings"
    static let allPages = ["readiness", "training", "food"]

    /// Shown pages in order; Readiness is always first.
    var pages: [String] = WatchSettings.allPages
    /// "tapBeep", "tap" or "none".
    var restEnd: String = "tapBeep"
    var alarmOnWatch: Bool = false
    /// Training mode on the iPhone opens the gym on the watch too.
    var openOnWatch: Bool = true
    /// Nastavení → Pauzy v posilovně (-1: the plan's for each exercise) and the
    /// rest before the next exercise, for a plan the watch loads without the iPhone.
    var restSets: Int = -1
    var restExercises: Int = 120

    init() {}

    /// Keys a newer iPhone added stay at their defaults on an older watch, and the other way round.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        pages = try c.decodeIfPresent([String].self, forKey: .pages) ?? WatchSettings.allPages
        restEnd = try c.decodeIfPresent(String.self, forKey: .restEnd) ?? "tapBeep"
        alarmOnWatch = try c.decodeIfPresent(Bool.self, forKey: .alarmOnWatch) ?? false
        openOnWatch = try c.decodeIfPresent(Bool.self, forKey: .openOnWatch) ?? true
        restSets = try c.decodeIfPresent(Int.self, forKey: .restSets) ?? -1
        restExercises = try c.decodeIfPresent(Int.self, forKey: .restExercises) ?? 120
    }

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchSettings? { try? JSONDecoder().decode(WatchSettings.self, from: data) }
}
