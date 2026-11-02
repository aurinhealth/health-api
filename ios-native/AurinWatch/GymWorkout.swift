import Foundation
import HealthKit
import WatchConnectivity
import WatchKit

/// The gym as a HealthKit strength workout on the watch: it keeps the app on
/// the screen between sets, measures the heart rate and the calories, and
/// saves the workout to Apple Health when it is finished.
@MainActor
final class GymWorkout: NSObject, ObservableObject {
    static let shared = GymWorkout()

    @Published private(set) var start: Date?
    // The readings come every few seconds: the screen is told only when a
    // number it shows changes (collected), not at each reading.
    private(set) var heartRate: Double?
    private(set) var calories: Double = 0
    private(set) var averageHeartRate: Double?
    private(set) var maxHeartRate: Double?
    /// Paused (mockup 7): since when, and how long the pauses before took.
    @Published private(set) var pausedAt: Date?
    @Published private(set) var pausedTotal: TimeInterval = 0
    /// Apple Health didn't let the workout run (no permission for workouts or
    /// the heart rate, or the session failed): no heart rate will come, and the
    /// set screen says what to allow instead of a bare dash.
    @Published private(set) var noHealth = false
    /// No set or change for 10 min: the set screen asks "Still working out?"
    /// (GymSessionView). A workout nobody ended kept the heart rate sensor,
    /// the app and the messages to the iPhone going for hours.
    @Published private(set) var askStill = false
    /// No answer and no set for 30 min: the workout ends, with its end at the last set.
    @Published private(set) var idleEnd: Date?
    /// The last set or change on the watch or the iPhone (worked()).
    private(set) var lastWork: Date?
    private var idleWatch: Task<Void, Never>?
    /// Asked once since the last set (End workout doesn't bring it back).
    private var asked = false
    static let askAfter: TimeInterval = 10 * 60
    static let endAfter: TimeInterval = 30 * 60

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    var running: Bool { session != nil }
    private var lastLive = Date.distantPast

    /// The sample day's gym (WatchDemo): 12 minutes in, without HealthKit
    /// (its question would cover the screenshot).
    func demo() {
        start = Date().addingTimeInterval(-760)
        heartRate = 128
        calories = 86
    }

    func begin() async {
        // The iPhone hears of the start at once (Training mode opens there),
        // not only with the first heart rate.
        // Only with a HealthKit workout here: the iPhone then leaves Apple Health to it.
        defer { if session != nil { announceUntilHeard() } }
        defer { if start != nil, idleWatch == nil { watchIdle() } }
        guard session == nil, HKHealthStore.isHealthDataAvailable() else {
            if start == nil { start = Date() }
            return
        }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned), HKQuantityType(.heartRate)]
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned), HKObjectType.workoutType()]
        try? await store.requestAuthorization(toShare: share, read: read)
        // Without leave to save workouts the session doesn't run: said on the set screen.
        // (A denied heart rate can't be told apart from none yet; the session still tries.)
        noHealth = store.authorizationStatus(for: HKObjectType.workoutType()) != .sharingAuthorized
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        guard let session = try? HKWorkoutSession(healthStore: store, configuration: configuration) else {
            noHealth = true
            start = Date()
            return
        }
        let builder = session.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
        builder.delegate = self
        session.delegate = self
        self.session = session
        self.builder = builder
        let now = Date()
        start = now
        session.startActivity(with: now)
        try? await builder.beginCollection(at: now)
    }

    /// The app was relaunched during a workout (a crash, the system): the
    /// running session is taken back, with its start, heart rate and calories,
    /// instead of a new one from 0:00. True when there was one.
    func recover() async -> Bool {
        guard session == nil else { return true }
        let recovered: HKWorkoutSession? = await withCheckedContinuation { continuation in
            store.recoverActiveWorkoutSession { session, _ in continuation.resume(returning: session) }
        }
        guard let recovered, recovered.state == .running || recovered.state == .paused else { return false }
        let builder = recovered.associatedWorkoutBuilder()
        builder.delegate = self
        recovered.delegate = self
        session = recovered
        self.builder = builder
        start = recovered.startDate ?? builder.startDate ?? Date()
        // The pauses before the relaunch, as the builder counted them.
        pausedTotal = max(0, Date().timeIntervalSince(start ?? Date()) - builder.elapsedTime)
        if recovered.state == .paused { pausedAt = Date() }
        watchIdle()
        return true
    }

    // MARK: Left running

    /// A set, a change or Keep going: the question waits another 10 min.
    func worked() {
        guard start != nil, idleEnd == nil else { return }
        lastWork = Date()
        asked = false
        if askStill { askStill = false }
    }

    /// Every 30 s while the workout runs: the question after 10 min without
    /// a set (with a tap on the wrist), the end after 30 min.
    private func watchIdle() {
        idleWatch?.cancel()
        lastWork = Date()
        asked = false
        idleWatch = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled, let self, let start = self.start, self.idleEnd == nil else { return }
                let last = self.lastWork ?? start
                let idle = Date().timeIntervalSince(last)
                if idle >= Self.endAfter {
                    self.askStill = false
                    self.idleEnd = last
                    return
                }
                if idle >= Self.askAfter, !self.asked {
                    self.asked = true
                    self.askStill = true
                    WKInterfaceDevice.current().play(.notification)
                }
            }
        }
    }

    /// The question answered with End workout: the summary takes over.
    func dismissAsk() { askStill = false }

    /// The clock of the workout without its pauses: the time cell counts from here.
    var clockStart: Date? { start.map { $0.addingTimeInterval(pausedTotal) } }

    /// The workout's time so far, pauses left out.
    var elapsed: TimeInterval {
        guard let start else { return 0 }
        return max(0, (pausedAt ?? Date()).timeIntervalSince(start) - pausedTotal)
    }

    /// A pause: the time and heart rate stop; Apple Health leaves it out.
    func pause() {
        guard pausedAt == nil, start != nil else { return }
        pausedAt = Date()
        session?.pause()
    }

    func resume() {
        guard let pausedAt else { return }
        pausedTotal += Date().timeIntervalSince(pausedAt)
        self.pausedAt = nil
        session?.resume()
    }

    /// Ends the workout; saved to Apple Health when sets were done, else thrown away.
    /// `end`: when the workout ended (an idle one at its last set), else now.
    func finish(save: Bool, at end: Date? = nil) async {
        guard let session, let builder else {
            reset()
            return
        }
        session.end()
        // Let go now, so the session's own "ended" isn't taken for a loss.
        self.session = nil
        let now = max(end ?? Date(), builder.startDate ?? start ?? Date())
        try? await builder.endCollection(at: now)
        if save {
            _ = try? await builder.finishWorkout()
        } else {
            builder.discardWorkout()
        }
        reset()
    }

    private func reset() {
        objectWillChange.send()
        session = nil
        builder = nil
        start = nil
        heartRate = nil
        calories = 0
        averageHeartRate = nil
        maxHeartRate = nil
        pausedAt = nil
        pausedTotal = 0
        noHealth = false
        announced = false
        idleWatch?.cancel()
        idleWatch = nil
        lastWork = nil
        asked = false
        askStill = false
        idleEnd = nil
        if queued, WCSession.isSupported() {
            // A start still waiting for the iPhone would open a workout that is over.
            for transfer in WCSession.default.outstandingUserInfoTransfers where transfer.userInfo[WatchGym.liveKey] != nil {
                transfer.cancel()
            }
        }
        queued = false
    }

    /// What the builder measured so far, read off its statistics.
    struct Reading: Sendable {
        var heartRate: Double?
        var average: Double?
        var max: Double?
        var calories: Double?
    }

    fileprivate func collected(_ r: Reading) {
        let heart = r.heartRate ?? heartRate, average = r.average ?? averageHeartRate
        let top = r.max ?? maxHeartRate, kcal = r.calories ?? calories
        // Whole numbers, rounded as W.number shows them.
        let shown = { (values: [Double?]) in values.map { $0.map { Int($0.rounded(.toNearestOrEven)) } } }
        if shown([heart, average, top, kcal]) != shown([heartRate, averageHeartRate, maxHeartRate, calories]) {
            objectWillChange.send()
        }
        heartRate = heart
        averageHeartRate = average
        maxHeartRate = top
        calories = kcal
        sendLive()
    }

    /// Every few seconds to Training mode on the iPhone, which then shows these
    /// and leaves Apple Health to this workout (WatchGym.Live).
    /// Until the iPhone has heard of this workout once, each try goes out (no
    /// 5 s wait), and when it is out of reach the start is queued for it: an
    /// iPhone that hears nothing starts a workout of its own after a while,
    /// and the system then ends this one, with its heart rate.
    private func sendLive(force: Bool = false) {
        guard let start, force || !announced || Date().timeIntervalSince(lastLive) >= 5, WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated,
              let data = WatchGym.Live(start: start, heartRate: heartRate, calories: calories).encoded() else { return }
        guard session.isReachable else {
            if !queued {
                queued = true
                session.transferUserInfo([WatchGym.liveKey: data])
            }
            return
        }
        lastLive = Date()
        session.sendMessage([WatchGym.liveKey: data], replyHandler: { _ in
            Task { @MainActor in GymWorkout.shared.announced = true }
        }, errorHandler: { _ in })
    }

    /// The iPhone heard of this workout (a reply to a live message).
    private var announced = false
    /// The start went to the iPhone's queue while it was out of reach.
    private var queued = false

    /// The watch's connection came up (often after the workout started on a
    /// cold launch) or a few seconds passed: the start goes to the iPhone now.
    func announce() {
        guard session != nil, !announced else { return }
        sendLive(force: true)
    }

    /// Tries every 2 s for the first 30 s, until the iPhone answers.
    private func announceUntilHeard() {
        Task { @MainActor [weak self] in
            for _ in 0..<15 {
                guard let self, self.session != nil, !self.announced else { return }
                self.announce()
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    /// Finished here (the summary's Finish): Training mode on the iPhone ends
    /// too, queued for when the iPhone is out of reach.
    func endOnPhone() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        let message: [String: Any] = [WatchGym.watchEndKey: true]
        if session.isReachable {
            session.sendMessage(message, replyHandler: { _ in }, errorHandler: { _ in WCSession.default.transferUserInfo(message) })
        } else {
            session.transferUserInfo(message)
        }
    }

    /// The system ended the session (another workout started, an error): the
    /// gym goes on with its clock, the next workout starts from here.
    fileprivate func lost(_ ended: ObjectIdentifier, failed: Bool = false) {
        guard let session, ObjectIdentifier(session) == ended else { return }
        if failed { noHealth = true }
        let builder = self.builder
        self.session = nil
        self.builder = nil
        Task {
            try? await builder?.endCollection(at: Date())
            _ = try? await builder?.finishWorkout()
        }
    }
}

extension GymWorkout: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState, date: Date) {
        // Ended by Aurin itself (finish), it has already let go of the session.
        guard toState == .ended else { return }
        let id = ObjectIdentifier(workoutSession)
        Task { @MainActor in GymWorkout.shared.lost(id) }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        let id = ObjectIdentifier(workoutSession)
        Task { @MainActor in GymWorkout.shared.lost(id, failed: true) }
    }
}

extension GymWorkout: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        var r = GymWorkout.Reading()
        let bpm = HKUnit.count().unitDivided(by: .minute())
        if collectedTypes.contains(HKQuantityType(.heartRate)), let s = workoutBuilder.statistics(for: HKQuantityType(.heartRate)) {
            r.heartRate = s.mostRecentQuantity()?.doubleValue(for: bpm)
            r.average = s.averageQuantity()?.doubleValue(for: bpm)
            r.max = s.maximumQuantity()?.doubleValue(for: bpm)
        }
        if collectedTypes.contains(HKQuantityType(.activeEnergyBurned)), let s = workoutBuilder.statistics(for: HKQuantityType(.activeEnergyBurned)) {
            r.calories = s.sumQuantity()?.doubleValue(for: .kilocalorie())
        }
        let reading = r
        Task { @MainActor in GymWorkout.shared.collected(reading) }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
