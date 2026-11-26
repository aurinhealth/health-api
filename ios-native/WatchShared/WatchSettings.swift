import Foundation

/// Settings → Apple Watch on the iPhone (Screens/SettingsPages/SettingsWatch.swift),
/// sent to the watch with Today: the pages by the crown and their order, what
/// the end of a rest does, whether Training mode opens the gym on the watch,
/// whether the alarm rings on the watch and when the iPhone's backup rings.
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
    /// The day of the last gym workout and its number of exercises, for
    /// Repeat last workout on a day without a plan; nil before the first.
    var lastGym: String? = nil
    var lastGymExercises: Int? = nil
    /// When the iPhone's backup for the watch's alarm rings; nil when none is set.
    var alarmBackup: Date? = nil
    /// "sick" or "injured" while Stav sportovce pauses training: the watch then
    /// offers no gym of its own (Repeat last, Empty), as the server builds none
    /// (load ramp-back review 2026-11-25, C12); nil otherwise.
    var trainingPaused: String? = nil

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
        lastGym = try c.decodeIfPresent(String.self, forKey: .lastGym)
        lastGymExercises = try c.decodeIfPresent(Int.self, forKey: .lastGymExercises)
        alarmBackup = try c.decodeIfPresent(Date.self, forKey: .alarmBackup)
        trainingPaused = try c.decodeIfPresent(String.self, forKey: .trainingPaused)
    }

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchSettings? { try? JSONDecoder().decode(WatchSettings.self, from: data) }
}
