import Foundation
import WatchConnectivity
import WatchKit
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

    /// The newest Today from the iPhone, when it is in reach; else, or when
    /// it has nothing for today, from the server with the watch's sign-in.
    func ask() {
        guard WCSession.isSupported() else { Task { await fromServer() }; return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else {
            Task { await fromServer() }
            return
        }
        session.sendMessage(["today": true], replyHandler: { reply in
            let data = reply[WatchSnapshot.contextKey] as? Data
            Task { @MainActor in
                if let data { WatchStore.shared.receive(data) }
                await WatchStore.shared.fromServer()
            }
        }, errorHandler: { _ in
            Task { @MainActor in await WatchStore.shared.fromServer() }
        })
    }

    private var loading = false

    /// Today from the server when the watch has none for today (WatchToday).
    func fromServer() async {
        let today = Self.localDate(Date())
        guard snapshot?.date != today, !loading, WatchAPI.signedIn else { return }
        loading = true
        defer { loading = false }
        guard let value = await WatchToday.load(over: snapshot), value.date == today, let data = value.encoded() else { return }
        receive(data)
    }

    /// Wakes the app shortly after the usual wake time (or 6:30) to fetch
    /// today before the first look at the watch (AurinWatchApp backgroundTask).
    func scheduleMorning() {
        let calendar = Calendar.current
        let now = Date()
        let wake = snapshot?.alarm?.nextWake(after: now)
            ?? calendar.nextDate(after: now, matching: DateComponents(hour: 6, minute: 30), matchingPolicy: .nextTime)
        guard let wake else { return }
        WKApplication.shared().scheduleBackgroundRefresh(withPreferredDate: wake.addingTimeInterval(10 * 60),
                                                         userInfo: Self.morningTask as NSString) { _ in }
    }

    static let morningTask = "today"

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
        guard var value = WatchSnapshot.decode(data) else { return }
        if let snapshot, snapshot.date == value.date, snapshot.updated > value.updated { return }
        // A drink still waiting for Undo isn't in the iPhone's day yet.
        if let drink, var food = value.food {
            food.water = (food.water ?? 0) + drink.counted
            value.food = food
        }
        // The iPhone sends the same Today by context, reply and message: draw it once.
        if let snapshot, Self.same(snapshot, value) { return }
        snapshot = value
        UserDefaults.standard.set(data, forKey: Self.savedKey)
        WatchAlarm.shared.schedule()
        // The watch face draws the same day (AurinWatchWidgets).
        ComplicationShelf.save(value)
        WidgetCenter.shared.reloadAllTimelines()
        // The next ride's or run's steps for the Workout complication.
        if let next = (value.week ?? []).first(where: { $0.date == value.date && !$0.done && $0.eventId != nil }) {
            PlanStore.shared.load(next)
        }
    }

    /// The same day apart from when it was sent.
    private static func same(_ a: WatchSnapshot, _ b: WatchSnapshot) -> Bool {
        var a = a
        a.updated = b.updated
        return a == b
    }

    func receive(settings data: Data) {
        guard let value = WatchSettings.decode(data) else { return }
        UserDefaults.standard.set(data, forKey: WatchSettings.contextKey)
        if settings != value { settings = value }
        WatchAlarm.shared.fromPhone(value.alarmOnWatch)
    }

    /// A drink from the Food page: shown at once, sent to the iPhone after a
    /// few seconds in which Undo takes it back (mockup 9), then now when it
    /// is in reach, else as soon as it is.
    func addWater(ml: Int, kind: String = "water", name: String? = nil, factor: Double = 1) {
        sendDrink()
        count(ml: Double(ml) * factor)
        let id = UUID()
        drink = Drink(id: id, ml: ml, kind: kind, name: name, counted: Double(ml) * factor)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(Self.undoSeconds))
            guard WatchStore.shared.drink?.id == id else { return }
            WatchStore.shared.sendDrink()
        }
    }

    /// The drink just added, while Undo can still take it back.
    struct Drink: Equatable {
        let id: UUID
        let ml: Int
        let kind: String
        let name: String?
        let counted: Double
    }

    @Published private(set) var drink: Drink?
    static let undoSeconds = 5.0

    /// Undo: the drink never reaches the iPhone.
    func undoDrink() {
        guard let drink else { return }
        self.drink = nil
        count(ml: -drink.counted)
    }

    /// The drink waiting for Undo goes to the iPhone now (its time ran out,
    /// another drink came, or the app goes to the background).
    func sendDrink() {
        guard let drink else { return }
        self.drink = nil
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let message: [String: Any] = [WatchSnapshot.waterKey: drink.ml, WatchSnapshot.drinkKindKey: drink.kind]
        if session.isReachable {
            session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in
                WCSession.default.transferUserInfo(message)
            })
        } else {
            session.transferUserInfo(message)
        }
    }

    /// The water on the Food page and the drinks complications.
    private func count(ml: Double) {
        guard var value = snapshot, var food = value.food else { return }
        food.water = max(0, (food.water ?? 0) + ml)
        value.food = food
        value.updated = Date()
        snapshot = value
        if let data = value.encoded() { UserDefaults.standard.set(data, forKey: Self.savedKey) }
        ComplicationShelf.save(value)
        WidgetCenter.shared.reloadTimelines(ofKind: "aurin.small.drinks")
        WidgetCenter.shared.reloadTimelines(ofKind: "aurin.wide.drinks")
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
