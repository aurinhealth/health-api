import Foundation

/// What the Apple Watch app (AurinWatch) shows: the iPhone builds it from Today
/// and Health (App/WatchBridge.swift) and sends it over WatchConnectivity; the
/// watch keeps the last one and only draws it (it has no session of its own).
struct WatchSnapshot: Codable, Equatable, Sendable {
    static let contextKey = "snapshot"

    var date: String
    var updated: Date
    /// "cs" or "en", the iPhone app's language (L10n): the watch speaks the same.
    var language: String
    var readiness: Int?
    /// green, yellow or red.
    var zone: String?
    /// Today's summary from the server (src/app-today.js), in the app's language.
    var headline: String?
    var summary: String?
    var sleep: Sleep?
    var restingHR: Metric?
    var hrv: Metric?
    var strain: Strain
    var steps: Double?
    /// This week's sessions, done and planned (Training on the iPhone), for the
    /// watch's Training page and its row of days.
    var week: [Session]? = nil
    /// Today's food and drink (Food on the iPhone), for the watch's Food page.
    var food: Food? = nil

    struct Food: Codable, Equatable, Sendable {
        var kcal: Double?
        /// The day's energy goal, training included.
        var target: Double?
        var carbs: Macro
        var protein: Macro
        var fat: Macro
        /// Drunk today and the day's goal, ml.
        var water: Double?
        var waterTarget: Double?
    }

    struct Macro: Codable, Equatable, Sendable {
        var eaten: Double?
        var target: Double?
    }

    /// The watch asks the iPhone to add a drink of water: its ml.
    static let waterKey = "addWater"

    struct Session: Codable, Equatable, Sendable {
        var date: String
        var time: String?
        var title: String
        /// ride, run, strength, swim, walk or other.
        var sport: String
        var minutes: Int?
        var done: Bool
    }

    struct Day: Codable, Equatable, Sendable {
        /// yyyy-MM-dd.
        let date: String
        let value: Double
    }

    struct Sleep: Codable, Equatable, Sendable {
        var minutes: Double?
        /// The night's need in minutes.
        var need: Double?
        /// Clock times "23:05", "6:30".
        var start: String?
        var end: String?
        var deep: Double?
        var rem: Double?
        var light: Double?
        /// The last nights' sleep in minutes, oldest first.
        var nights: [Day]
    }

    /// Resting HR or HRV: today's value, the athlete's normal and the history.
    struct Metric: Codable, Equatable, Sendable {
        var value: Double?
        var low: Double?
        var high: Double?
        /// Up to 90 days, oldest first.
        var series: [Day]
    }

    struct Strain: Codable, Equatable, Sendable {
        var score: Double?
        var low: Double?
        var high: Double?
        var training: Double?
        var movement: Double?
        /// What the next planned workout adds.
        var planned: Double?
        var nextTitle: String?
        var nextTime: String?
    }

    func encoded() -> Data? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        return try? encoder.encode(self)
    }

    static func decode(_ data: Data) -> WatchSnapshot? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        return try? decoder.decode(WatchSnapshot.self, from: data)
    }
}
