import Foundation

/// The app's failed requests and unreadable answers of the last week, kept
/// across launches so "Nahlásit problém" can send them (ReportProblemView).
/// No bodies, tokens or health data: the method and path without the query,
/// the status and the server's message.
enum ErrorLog {
    struct Entry: Codable {
        var at: Date
        let path: String
        let status: Int?
        let message: String
        /// How many times the same failure came, the last one at `at`.
        var count: Int?
    }

    private static let key = "errorLog"
    private static let limit = 25
    private static let week: TimeInterval = 7 * 86400
    private static let lock = NSLock()

    static func add(_ request: URLRequest, status: Int?, message: String?) {
        let path = "\(request.httpMethod ?? "GET") \(request.url?.path ?? "?")"
        add(path: path, status: status, message: message ?? "")
    }

    /// The same failure again (an expired session on every screen) counts up
    /// instead of pushing the others out.
    static func add(path: String, status: Int?, message: String) {
        let path = String(path.prefix { $0 != "?" })
        let message = String(message.prefix(200))
        lock.lock()
        defer { lock.unlock() }
        var entries = fresh(load())
        if let index = entries.lastIndex(where: { $0.path == path && $0.status == status && $0.message == message }) {
            var same = entries.remove(at: index)
            same.at = Date()
            same.count = (same.count ?? 1) + 1
            entries.append(same)
        } else {
            entries.append(Entry(at: Date(), path: path, status: status, message: message))
        }
        save(Array(entries.suffix(limit)))
    }

    /// An unreadable answer by the key it stopped at, short enough to keep.
    static func describe(_ error: Error) -> String {
        guard let error = error as? DecodingError else { return error.localizedDescription }
        let context: DecodingError.Context
        switch error {
        case .typeMismatch(_, let c), .valueNotFound(_, let c), .keyNotFound(_, let c), .dataCorrupted(let c): context = c
        @unknown default: return String(describing: error)
        }
        var keys = context.codingPath.map { $0.intValue.map(String.init) ?? $0.stringValue }
        if case .keyNotFound(let key, _) = error { keys.append(key.stringValue) }
        return "unreadable answer at \(keys.joined(separator: ".")): \(context.debugDescription)"
    }

    /// Newest first.
    static var entries: [Entry] {
        lock.lock()
        defer { lock.unlock() }
        return Array(fresh(load()).reversed())
    }

    /// Signing out: the next account's report must not carry these.
    static func clear() {
        lock.lock()
        defer { lock.unlock() }
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func fresh(_ entries: [Entry]) -> [Entry] {
        let since = Date().addingTimeInterval(-week)
        return entries.filter { $0.at > since }
    }

    private static func load() -> [Entry] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
    }

    private static func save(_ entries: [Entry]) {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
