import Foundation

/// The last answer of each screen (Today, Training, Health, Food) on disk, so
/// the app opens with data even without signal and shows it while it loads.
/// Only today's screens are kept; signing out deletes them.
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

    static func clear() {
        try? FileManager.default.removeItem(at: directory)
    }
}
