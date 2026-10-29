import Foundation
import WatchConnectivity
import WidgetKit

/// Today from the iPhone (App/WatchBridge.swift): the application context it
/// sends after every refresh, kept on the watch so the app opens with the last one.
@MainActor
final class WatchStore: NSObject, ObservableObject {
    static let shared = WatchStore()
    private static let savedKey = "watchSnapshot"

    @Published private(set) var snapshot: WatchSnapshot?
    /// Settings → Apple Watch on the iPhone.
    @Published private(set) var settings: WatchSettings = UserDefaults.standard.data(forKey: WatchSettings.contextKey)
        .flatMap(WatchSettings.decode) ?? WatchSettings()

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
            GymStore.shared.clear()
            UserDefaults.standard.removeObject(forKey: Self.savedKey)
            ComplicationShelf.clear()
            WidgetCenter.shared.reloadAllTimelines()
            return
        }
        guard let value = WatchSnapshot.decode(data) else { return }
        if let snapshot, snapshot.date == value.date, snapshot.updated > value.updated { return }
        snapshot = value
        UserDefaults.standard.set(data, forKey: Self.savedKey)
        WatchAlarm.shared.schedule()
        // The watch face draws the same day (AurinWatchWidgets).
        ComplicationShelf.save(value)
        WidgetCenter.shared.reloadAllTimelines()
    }

    func receive(settings data: Data) {
        guard let value = WatchSettings.decode(data) else { return }
        UserDefaults.standard.set(data, forKey: WatchSettings.contextKey)
        if settings != value { settings = value }
        WatchAlarm.shared.fromPhone(value.alarmOnWatch)
    }

    /// A drink of water from the Food page: shown at once, sent to the iPhone
    /// now when it is in reach, else as soon as it is.
    func addWater(ml: Int) {
        if var value = snapshot, var food = value.food {
            food.water = (food.water ?? 0) + Double(ml)
            value.food = food
            value.updated = Date()
            snapshot = value
            if let data = value.encoded() { UserDefaults.standard.set(data, forKey: Self.savedKey) }
            ComplicationShelf.save(value)
            WidgetCenter.shared.reloadTimelines(ofKind: "aurin.small.drinks")
            WidgetCenter.shared.reloadTimelines(ofKind: "aurin.wide.drinks")
        }
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let message: [String: Any] = [WatchSnapshot.waterKey: ml]
        if session.isReachable {
            session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in
                WCSession.default.transferUserInfo(message)
            })
        } else {
            session.transferUserInfo(message)
        }
    }

    /// The wake time the iPhone just saved, until its new Today comes.
    func moveAlarm(wake: String, scope: String) {
        guard var value = snapshot, var alarm = value.alarm else { return }
        switch scope {
        case "once":
            alarm.wake = wake
            alarm.wakeOnce = true
        case "weekend":
            alarm.weekend = wake
        default:
            alarm.work = wake
        }
        if scope != "once", let evening = alarm.evening, let day = W.day(evening),
           let morning = Calendar.current.date(byAdding: .day, value: 1, to: day),
           WatchAlarm.weekend(WatchStore.localDate(morning)) == (scope == "weekend") {
            alarm.wake = wake
            alarm.wakeOnce = false
        }
        value.alarm = alarm
        value.updated = Date()
        snapshot = value
        if let data = value.encoded() { UserDefaults.standard.set(data, forKey: Self.savedKey) }
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
        let gym = context[WatchGym.replyKey] as? Data
        let settings = context[WatchSettings.contextKey] as? Data
        let empty = context.isEmpty
        Task { @MainActor in
            if let settings { WatchStore.shared.receive(settings: settings) }
            if let gym { GymStore.shared.received(gym) }
            if let data { WatchStore.shared.receive(data) } else if !empty { WatchStore.shared.receive(nil) }
            WatchStore.shared.ask()
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        let data = applicationContext[WatchSnapshot.contextKey] as? Data
        let gym = applicationContext[WatchGym.replyKey] as? Data
        let settings = applicationContext[WatchSettings.contextKey] as? Data
        let signIn = applicationContext[WatchSession.contextKey] as? Data
        let empty = applicationContext.isEmpty
        Task { @MainActor in
            // No sign-in with Today: the iPhone signed out.
            WatchAPI.store(signIn)
            if let settings { WatchStore.shared.receive(settings: settings) }
            if let gym { GymStore.shared.received(gym) }
            if data != nil || empty { WatchStore.shared.receive(data) }
        }
    }

    /// The iPhone saved today's gym (Training mode, or a change from here), or the coach answers.
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        received(message)
    }

    /// The coach's answer, queued while the watch was out of reach.
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        received(userInfo)
    }

    private nonisolated func received(_ message: [String: Any]) {
        let gym = message[WatchGym.replyKey] as? Data
        let progress = message[WatchCoach.progressKey] as? String
        let answer = message[WatchCoach.answerKey] as? Data
        let ended = message[WatchGym.endKey] as? Bool == true
        Task { @MainActor in
            if ended, GymWorkout.shared.running { GymStore.shared.endedOnPhone = true }
            if let gym { GymStore.shared.received(gym) }
            if let progress { CoachStore.shared.received(progress: progress) }
            if let answer { CoachStore.shared.received(answer: answer) }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        Task { @MainActor in WatchStore.shared.ask() }
    }
}
