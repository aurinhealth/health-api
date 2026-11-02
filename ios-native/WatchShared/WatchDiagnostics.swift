import Foundation

/// The watch app about itself, sent to the iPhone as the watch's application
/// context (AurinWatch/WatchReport.swift), so "Nahlásit problém" on the iPhone
/// (ReportProblemView) says which watch app runs, where it was and what failed
/// there. Page and case names, request paths and statuses only; no health data.
struct WatchDiagnostics: Codable, Equatable, Sendable {
    static let contextKey = "watchDiagnostics"

    struct Screen: Codable, Equatable, Sendable {
        var name: String
        var at: Date
    }

    struct Failure: Codable, Equatable, Sendable {
        var at: Date
        /// "GET /app/api/today", or what failed without a request ("coach").
        var what: String
        var status: Int?
        var message: String?
    }

    /// "1.4 (312)"
    var app: String
    var watchOS: String
    /// "Watch7,3"
    var model: String
    /// The watch's own sign-in for its requests without the iPhone (WatchAPI).
    var signedIn: Bool
    /// The day of the Today the watch shows.
    var todayDate: String?
    var screens: [Screen] = []
    var errors: [Failure] = []
    var sentAt: Date

    func encoded() -> Data? { try? JSONEncoder().encode(self) }
    static func decode(_ data: Data) -> WatchDiagnostics? { try? JSONDecoder().decode(WatchDiagnostics.self, from: data) }

    /// The app's version and build, like "1.4 (312)".
    static var appVersion: String {
        let info = Bundle.main.infoDictionary
        return "\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
    }

    /// The hardware name, like "iPhone16,1" or "Watch7,3"; the system's model name only says "iPhone".
    static var hardwareModel: String {
        var info = utsname()
        uname(&info)
        let name = withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
        }
        return name.isEmpty ? "?" : name
    }

    /// The list with `item` last, at most `limit` long.
    static func appending<T>(_ item: T, to list: [T], limit: Int) -> [T] {
        Array((list + [item]).suffix(limit))
    }
}
