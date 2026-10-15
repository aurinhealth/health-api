import Foundation
import MetricKit

/// The app's crashes as iOS reports them (MetricKit), kept on the phone so
/// "Nahlásit problém" can send the latest ones with the diagnostics
/// (ReportProblemView). iOS hands them over at most once a day, on a launch
/// after the crash. Only the kind of crash, the app and iOS versions and the
/// top frames of the crashed thread (binary and offset): no personal or health data.
final class CrashReports: NSObject, MXMetricManagerSubscriber {
    static let shared = CrashReports()

    struct Crash: Codable {
        let at: Date
        let app: String
        let ios: String
        var exception: String?
        var signal: Int?
        var reason: String?
        /// "Loadwise +0x1a2b3c" from the top of the crashed thread.
        var frames: [String]
    }

    private static let key = "crashReports"
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
        return Array(fresh(load()).reversed())
    }

    private func keep(_ payloads: [MXDiagnosticPayload]) {
        let crashes = payloads.flatMap { payload in
            (payload.crashDiagnostics ?? []).map { Self.summary($0, at: payload.timeStampEnd) }
        }
        guard !crashes.isEmpty else { return }
        lock.lock()
        defer { lock.unlock() }
        var all = fresh(load())
        for crash in crashes where !all.contains(where: { $0.at == crash.at && $0.frames == crash.frames }) {
            all.append(crash)
        }
        all.sort { $0.at < $1.at }
        save(Array(all.suffix(Self.limit)))
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

    /// The top frames of the crashed thread, the crashing one first; each frame
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

    private func fresh(_ crashes: [Crash]) -> [Crash] {
        let since = Date().addingTimeInterval(-Self.keepFor)
        return crashes.filter { $0.at > since }
    }

    private func load() -> [Crash] {
        guard let data = UserDefaults.standard.data(forKey: Self.key) else { return [] }
        return (try? JSONDecoder().decode([Crash].self, from: data)) ?? []
    }

    private func save(_ crashes: [Crash]) {
        guard let data = try? JSONEncoder().encode(crashes) else { return }
        UserDefaults.standard.set(data, forKey: Self.key)
    }
}
