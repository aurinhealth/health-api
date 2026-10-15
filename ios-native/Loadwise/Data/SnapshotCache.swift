import Foundation

/// The last answer of each screen (Today, Training, Health, Food) on disk, so
/// the app opens with data even without signal and shows it while it loads.
/// Other days are kept for two weeks around today ("today-2026-10-14"), so
/// switching days shows them at once; signing out deletes them.
enum SnapshotCache {
    private static var directory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "snapshots", directoryHint: .isDirectory)
    }

    static func save(_ data: Data, key: String) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: directory.appending(path: key + ".json"), options: .atomic)
    }

    /// The saved value and when it was saved.
    static func load<T: Decodable>(_ type: T.Type, key: String) -> (value: T, savedAt: Date)? {
        let url = directory.appending(path: key + ".json")
        guard let data = try? Data(contentsOf: url),
              let value = try? JSONDecoder().decode(T.self, from: data) else { return nil }
        let saved = (try? FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate] as? Date) ?? Date()
        return (value, saved)
    }

    /// The saved JSON as it came, and when it was saved.
    static func data(key: String) -> (data: Data, savedAt: Date)? {
        let url = directory.appending(path: key + ".json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        let saved = (try? FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate] as? Date) ?? Date()
        return (data, saved)
    }

    static func remove(key: String) {
        try? FileManager.default.removeItem(at: directory.appending(path: key + ".json"))
    }

    /// A day's key: "today" for today's screen, "today-2026-10-14" for another day.
    static func dayKey(_ screen: String, _ date: String?) -> String {
        date.map { screen + "-" + $0 } ?? screen
    }

    /// Days further than two weeks from today go.
    static func prune(today: String, keep: Int = 14) {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: directory.path) else { return }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let now = f.date(from: today) else { return }
        for name in names where name.hasSuffix(".json") {
            let stem = name.dropLast(5)
            guard stem.count > 11, let day = f.date(from: String(stem.suffix(10))) else { continue }
            if abs(day.timeIntervalSince(now)) > Double(keep) * 86400 {
                try? FileManager.default.removeItem(at: directory.appending(path: name))
            }
        }
    }

    static func clear() {
        try? FileManager.default.removeItem(at: directory)
    }
}
