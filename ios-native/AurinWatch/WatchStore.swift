import Foundation
import WatchConnectivity

/// Today from the iPhone (App/WatchBridge.swift): the application context it
/// sends after every refresh, kept on the watch so the app opens with the last one.
@MainActor
final class WatchStore: NSObject, ObservableObject {
    static let shared = WatchStore()
    private static let savedKey = "watchSnapshot"

    @Published private(set) var snapshot: WatchSnapshot?

    override init() {
        super.init()
        if let data = UserDefaults.standard.data(forKey: Self.savedKey) {
            snapshot = WatchSnapshot.decode(data)
        }
    }

    func start() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.delegate == nil else { ask(); return }
        session.delegate = self
        session.activate()
    }

    /// The newest Today from the iPhone, when it is in reach.
    func ask() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else { return }
        session.sendMessage(["today": true], replyHandler: { reply in
            guard let data = reply[WatchSnapshot.contextKey] as? Data else { return }
            Task { @MainActor in WatchStore.shared.receive(data) }
        }, errorHandler: nil)
    }

    func receive(_ data: Data?) {
        guard let data else {
            // The iPhone signed out.
            snapshot = nil
            UserDefaults.standard.removeObject(forKey: Self.savedKey)
            return
        }
        guard let value = WatchSnapshot.decode(data) else { return }
        if let snapshot, snapshot.date == value.date, snapshot.updated > value.updated { return }
        snapshot = value
        UserDefaults.standard.set(data, forKey: Self.savedKey)
    }

    nonisolated static func localDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

extension WatchStore: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let context = session.receivedApplicationContext
        let data = context[WatchSnapshot.contextKey] as? Data
        let empty = context.isEmpty
        Task { @MainActor in
            if let data { WatchStore.shared.receive(data) } else if !empty { WatchStore.shared.receive(nil) }
            WatchStore.shared.ask()
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        let data = applicationContext[WatchSnapshot.contextKey] as? Data
        Task { @MainActor in WatchStore.shared.receive(data) }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        Task { @MainActor in WatchStore.shared.ask() }
    }
}
