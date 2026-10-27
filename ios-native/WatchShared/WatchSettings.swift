import Foundation

/// Settings → Apple Watch on the iPhone (Screens/SettingsPages/SettingsWatch.swift),
/// sent to the watch with Today: the pages by the crown and their order, what
/// the end of a rest does, and whether the alarm rings on the watch.
struct WatchSettings: Codable, Equatable, Sendable {
    static let contextKey = "watchSettings"
    static let allPages = ["readiness", "training", "food"]

    /// Shown pages in order; Readiness is always first.
    var pages: [String] = WatchSettings.allPages
    /// "tapBeep", "tap" or "none".
    var restEnd: String = "tapBeep"
    var alarmOnWatch: Bool = false

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchSettings? { try? JSONDecoder().decode(WatchSettings.self, from: data) }
}
