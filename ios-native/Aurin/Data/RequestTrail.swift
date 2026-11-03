import Foundation

/// The app's last requests, also the ones that went fine, kept in memory only,
/// so "Nahlásit problém" (ReportProblemView) says what the user was doing and
/// how long the server took. The method and path without the query, the
/// status and the time; no bodies, tokens or health data.
enum RequestTrail {
    struct Entry: Equatable {
        let at: Date
        let path: String
        let status: Int?
        let ms: Int
    }

    private static let limit = 10
    private static let lock = NSLock()
    nonisolated(unsafe) private static var list: [Entry] = []

    static func add(_ request: URLRequest, status: Int?, started: Date, now: Date = Date()) {
        let path = "\(request.httpMethod ?? "GET") \(request.url?.path ?? "?")"
        add(path: path, status: status, ms: Int((now.timeIntervalSince(started) * 1000).rounded()), at: now)
    }

    static func add(path: String, status: Int?, ms: Int, at: Date = Date()) {
        let entry = Entry(at: at, path: String(path.prefix { $0 != "?" }.prefix(120)), status: status, ms: max(0, ms))
        lock.lock()
        defer { lock.unlock() }
        list.append(entry)
        if list.count > limit { list.removeFirst(list.count - limit) }
    }

    /// Newest first.
    static var entries: [Entry] {
        lock.lock()
        defer { lock.unlock() }
        return Array(list.reversed())
    }

    /// Signing out: the next account's report must not carry these.
    static func clear() {
        lock.lock()
        defer { lock.unlock() }
        list = []
    }
}
