import Foundation
import WatchConnectivity
import WatchKit

/// What the iPhone's "Nahlásit problém" says about the watch (WatchDiagnostics):
/// the last pages opened here and the watch's failed requests of the last week,
/// sent to the iPhone as the watch's application context whenever one is added.
/// Only the newest context travels, so frequent updates cost nothing.
@MainActor
enum WatchReport {
    private static let errorsKey = "watchReportErrors"
    private static let screenLimit = 6
    private static let errorLimit = 10
    private static let week: TimeInterval = 7 * 86400

    private static var screens: [WatchDiagnostics.Screen] = []

    /// A page or detail opened ("training", "readiness/sleep", "gym").
    static func visit(_ name: String) {
        guard screens.last?.name != name else { return }
        screens = WatchDiagnostics.appending(WatchDiagnostics.Screen(name: name, at: Date()), to: screens, limit: screenLimit)
        send()
    }

    /// A request or step that failed on the watch; kept across launches for a week.
    static func failed(_ what: String, status: Int? = nil, message: String? = nil) {
        let what = String(what.prefix { $0 != "?" }.prefix(120))
        let failure = WatchDiagnostics.Failure(at: Date(), what: what, status: status, message: message.map { String($0.prefix(200)) })
        var kept = errors
        // The same failure again (offline on every page) moves up instead of pushing the others out.
        if let last = kept.last, last.what == failure.what, last.status == failure.status, last.message == failure.message { kept.removeLast() }
        let list = WatchDiagnostics.appending(failure, to: kept, limit: errorLimit)
        if let data = try? JSONEncoder().encode(list) { UserDefaults.standard.set(data, forKey: errorsKey) }
        send()
    }

    private static var errors: [WatchDiagnostics.Failure] {
        guard let data = UserDefaults.standard.data(forKey: errorsKey),
              let list = try? JSONDecoder().decode([WatchDiagnostics.Failure].self, from: data) else { return [] }
        let since = Date().addingTimeInterval(-week)
        return list.filter { $0.at > since }
    }

    static var current: WatchDiagnostics {
        WatchDiagnostics(app: WatchDiagnostics.appVersion, watchOS: WKInterfaceDevice.current().systemVersion,
                         model: WatchDiagnostics.hardwareModel, signedIn: WatchAPI.signedIn,
                         todayDate: WatchStore.shared.snapshot?.date, screens: screens, errors: errors, sentAt: Date())
    }

    /// To the iPhone, which reads it when a report is written (WatchBridge.watchDiagnostics).
    static func send() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, let data = current.encoded() else { return }
        try? session.updateApplicationContext([WatchDiagnostics.contextKey: data])
    }
}
