import Foundation
import WatchKit
import WatchConnectivity

/// The alarm on the watch: the wake times come from the iPhone
/// (WatchSnapshot.Alarm); when "Wake me on the watch" is on, the next one is
/// a smart alarm session (WKExtendedRuntimeSession) that taps the wrist until
/// Stop or Snooze. watchOS starts such a session only while the app is open,
/// so it is set again each time the app opens and after each alarm.
@MainActor
final class WatchAlarm: NSObject, ObservableObject {
    static let shared = WatchAlarm()

    private static let onKey = "alarmOnWatch"
    private static let hapticKey = "alarmHaptic"
    private static let snooze: TimeInterval = 9 * 60

    @Published var onWatch: Bool = UserDefaults.standard.bool(forKey: WatchAlarm.onKey) {
        didSet {
            UserDefaults.standard.set(onWatch, forKey: Self.onKey)
            if !quiet { tellPhone() }
            schedule()
        }
    }
    /// Set from the iPhone: no message back.
    private var quiet = false
    /// gentle, rising or strong.
    @Published var haptic: String = UserDefaults.standard.string(forKey: WatchAlarm.hapticKey) ?? "rising" {
        didSet { UserDefaults.standard.set(haptic, forKey: Self.hapticKey) }
    }
    /// The alarm rings now (AlarmRinging on the screen).
    @Published private(set) var ringing = false
    @Published private(set) var next: Date?

    private var session: WKExtendedRuntimeSession?

    /// The wake time of a morning ("2026-10-28").
    static func wake(on morning: String, _ alarm: WatchSnapshot.Alarm) -> String? {
        W.day(morning).flatMap { alarm.wake(on: $0) }
    }

    static func weekend(_ morning: String) -> Bool {
        guard let day = W.day(morning) else { return false }
        let weekday = Calendar(identifier: .gregorian).component(.weekday, from: day)
        return weekday == 1 || weekday == 7
    }

    /// Sets the session for the next wake time, or takes it away.
    func schedule(at date: Date? = nil) {
        guard !ringing else { return }
        let when = date ?? WatchStore.shared.snapshot?.alarm?.nextWake()
        guard onWatch, let when else {
            session?.invalidate()
            session = nil
            next = nil
            return
        }
        if let session, next == when, session.state == .scheduled || session.state == .running { return }
        session?.invalidate()
        let fresh = WKExtendedRuntimeSession()
        fresh.delegate = self
        fresh.start(at: when)
        session = fresh
        next = when
    }

    func stop() {
        let wasRinging = ringing
        session?.invalidate()
        session = nil
        ringing = false
        next = nil
        schedule()
        if wasRinging { tellPhone([WatchSnapshot.alarmStoppedKey: true]) }
    }

    func snoozeNow() {
        session?.invalidate()
        session = nil
        ringing = false
        let until = Date().addingTimeInterval(Self.snooze)
        schedule(at: until)
        tellPhone([WatchSnapshot.alarmSnoozedKey: until])
    }

    /// Settings → Apple Watch → Rings on, changed on the iPhone.
    func fromPhone(_ on: Bool) {
        guard onWatch != on else { return }
        quiet = true
        onWatch = on
        quiet = false
    }

    /// A wake time moved by the crown, saved on the iPhone; shown at once.
    func move(wake: String, scope: String, evening: String?) async -> Bool {
        guard WCSession.isSupported() else { return false }
        let phone = WCSession.default
        guard phone.activationState == .activated, phone.isReachable,
              let data = WatchSnapshot.AlarmChange(wake: wake, scope: scope, evening: evening).encoded() else { return false }
        let ok = await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            phone.sendMessage([WatchSnapshot.AlarmChange.key: data], replyHandler: { reply in
                done.resume(returning: reply["ok"] as? Bool ?? false)
            }, errorHandler: { _ in done.resume(returning: false) })
        }
        guard ok else { return false }
        WatchStore.shared.moveAlarm(wake: wake, scope: scope)
        schedule()
        return true
    }

    private func ring(_ running: WKExtendedRuntimeSession) {
        ringing = true
        let type: WKHapticType = haptic == "gentle" ? .click : haptic == "strong" ? .failure : .notification
        running.notifyUser(hapticType: type) { pointer in
            pointer.pointee = type
            return 2
        }
    }

    /// Rings on the watch or not, stopped or snoozed: the iPhone keeps its
    /// backup alarm five minutes after the watch's (WatchAlarmBridge).
    private func tellPhone(_ about: [String: Any]? = nil) {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let message: [String: Any] = about ?? [WatchSnapshot.alarmOnWatchKey: onWatch]
        if session.isReachable {
            session.sendMessage(message, replyHandler: { _ in }, errorHandler: nil)
        } else {
            session.transferUserInfo(message)
        }
    }
}

extension WatchAlarm: WKExtendedRuntimeSessionDelegate {
    nonisolated func extendedRuntimeSessionDidStart(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        Task { @MainActor in WatchAlarm.shared.ring(extendedRuntimeSession) }
    }

    nonisolated func extendedRuntimeSessionWillExpire(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        Task { @MainActor in WatchAlarm.shared.stop() }
    }

    nonisolated func extendedRuntimeSession(_ extendedRuntimeSession: WKExtendedRuntimeSession,
                                            didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason, error: Error?) {
        Task { @MainActor in
            let alarm = WatchAlarm.shared
            guard alarm.session === extendedRuntimeSession else { return }
            alarm.session = nil
            if reason != .none { alarm.ringing = false }
        }
    }
}
