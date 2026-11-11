import Foundation
import MetricKit

/// The app's crashes and freezes (hangs) as iOS reports them (MetricKit), kept
/// on the phone so "Nahlásit problém" can send the latest ones with the
/// diagnostics (ReportProblemView). iOS hands them over at most once a day, on
/// a launch after the crash. Only the kind of crash or how long the app froze,
/// the app and iOS versions and the top frames of the thread (binary and
/// offset): no personal or health data.
// Its stored list is read and written under lock.
final class CrashReports: NSObject, MXMetricManagerSubscriber, @unchecked Sendable {
    static let shared = CrashReports()

    struct Crash: Codable {
        let at: Date
        let app: String
        let ios: String
        var exception: String?
        var signal: Int?
        var reason: String?
        /// "Aurin +0x1a2b3c" from the top of the crashed thread.
        var frames: [String]
    }

    /// The app stopped answering for a while (MXHangDiagnostic), and for how long.
    struct Hang: Codable {
        let at: Date
        let app: String
        let ios: String
        let seconds: Double
        var frames: [String]
    }

    private static let key = "crashReports"
    /// Freezes are kept apart, so the more frequent ones never push out a crash.
    private static let hangKey = "hangReports"
    private static let limit = 3
    private static let keepFor: TimeInterval = 14 * 86400
    private let lock = NSLock()

    /// From AppDelegate's launch: also the reports iOS delivered before.
    func start() {
        MXMetricManager.shared.add(self)
        keep(MXMetricManager.shared.pastDiagnosticPayloads)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        keep(payloads)
    }

    /// Newest first, from the last two weeks.
    var entries: [Crash] {
        lock.lock()
        defer { lock.unlock() }
        let crashes: [Crash] = fresh(load(Self.key))
        return crashes.reversed()
    }

    /// Newest first, from the last two weeks.
    var hangs: [Hang] {
        lock.lock()
        defer { lock.unlock() }
        let hangs: [Hang] = fresh(load(Self.hangKey))
        return hangs.reversed()
    }

    private func keep(_ payloads: [MXDiagnosticPayload]) {
        let crashes = payloads.flatMap { payload in
            (payload.crashDiagnostics ?? []).map { Self.summary($0, at: payload.timeStampEnd) }
        }
        let hangs = payloads.flatMap { payload in
            (payload.hangDiagnostics ?? []).map { Self.summary($0, at: payload.timeStampEnd) }
        }
        lock.lock()
        defer { lock.unlock() }
        if !crashes.isEmpty { add(crashes, key: Self.key, same: { $0.at == $1.at && $0.frames == $1.frames }) }
        if !hangs.isEmpty { add(hangs, key: Self.hangKey, same: { $0.at == $1.at && $0.frames == $1.frames }) }
    }

    /// Called under the lock: the newest `limit` of the stored and the new ones.
    private func add<T: Codable & Dated>(_ new: [T], key: String, same: (T, T) -> Bool) {
        var all: [T] = fresh(load(key))
        for item in new where !all.contains(where: { same($0, item) }) {
            all.append(item)
        }
        all.sort { $0.at < $1.at }
        save(Array(all.suffix(Self.limit)), key: key)
    }

    private static func summary(_ diagnostic: MXCrashDiagnostic, at: Date) -> Crash {
        var crash = Crash(at: at, app: "\(diagnostic.applicationVersion) (\(diagnostic.metaData.applicationBuildVersion))",
                          ios: diagnostic.metaData.osVersion, frames: frames(diagnostic.callStackTree))
        if let type = diagnostic.exceptionType {
            crash.exception = "\(type)" + (diagnostic.exceptionCode.map { " code \($0)" } ?? "")
        }
        crash.signal = diagnostic.signal?.intValue
        crash.reason = diagnostic.terminationReason.map { String($0.prefix(300)) }
        return crash
    }

    private static func summary(_ diagnostic: MXHangDiagnostic, at: Date) -> Hang {
        Hang(at: at, app: "\(diagnostic.applicationVersion) (\(diagnostic.metaData.applicationBuildVersion))",
             ios: diagnostic.metaData.osVersion, seconds: diagnostic.hangDuration.converted(to: .seconds).value,
             frames: frames(diagnostic.callStackTree))
    }

    /// The top frames of the crashed (or frozen) thread, the crashing one first; each frame
    /// nests the one that called it (MetricKit's call stack tree).
    private static func frames(_ tree: MXCallStackTree) -> [String] {
        guard let json = try? JSONSerialization.jsonObject(with: tree.jsonRepresentation()) as? [String: Any],
              let stacks = json["callStacks"] as? [[String: Any]] else { return [] }
        let stack = stacks.first { $0["threadAttributed"] as? Bool == true } ?? stacks.first
        var frame = (stack?["callStackRootFrames"] as? [[String: Any]])?.first
        var out: [String] = []
        while let current = frame, out.count < 12 {
            let binary = current["binaryName"] as? String ?? "?"
            let offset = (current["offsetIntoBinaryTextSegment"] as? NSNumber)?.intValue ?? 0
            out.append("\(binary) +0x\(String(offset, radix: 16))")
            frame = (current["subFrames"] as? [[String: Any]])?.first
        }
        return out
    }

    private func fresh<T: Dated>(_ items: [T]) -> [T] {
        let since = Date().addingTimeInterval(-Self.keepFor)
        return items.filter { $0.at > since }
    }

    private func load<T: Codable>(_ key: String) -> [T] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([T].self, from: data)) ?? []
    }

    private func save<T: Codable>(_ items: [T], key: String) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}

protocol Dated { var at: Date { get } }
extension CrashReports.Crash: Dated {}
extension CrashReports.Hang: Dated {}
