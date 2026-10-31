import Foundation
import HealthKit
import WatchConnectivity

/// The gym as a HealthKit strength workout on the watch: it keeps the app on
/// the screen between sets, measures the heart rate and the calories, and
/// saves the workout to Apple Health when it is finished.
@MainActor
final class GymWorkout: NSObject, ObservableObject {
    static let shared = GymWorkout()

    @Published private(set) var start: Date?
    @Published private(set) var heartRate: Double?
    @Published private(set) var calories: Double = 0
    @Published private(set) var averageHeartRate: Double?
    @Published private(set) var maxHeartRate: Double?
    /// Paused (mockup 7): since when, and how long the pauses before took.
    @Published private(set) var pausedAt: Date?
    @Published private(set) var pausedTotal: TimeInterval = 0

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    var running: Bool { session != nil }
    private var lastLive = Date.distantPast

    func begin() async {
        // The iPhone hears of the start at once (Training mode opens there),
        // not only with the first heart rate.
        // Only with a HealthKit workout here: the iPhone then leaves Apple Health to it.
        defer { if session != nil { sendLive(force: true) } }
        guard session == nil, HKHealthStore.isHealthDataAvailable() else {
            if start == nil { start = Date() }
            return
        }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned), HKQuantityType(.heartRate)]
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned), HKObjectType.workoutType()]
        try? await store.requestAuthorization(toShare: share, read: read)
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        guard let session = try? HKWorkoutSession(healthStore: store, configuration: configuration) else {
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
        return true
    }

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
    func finish(save: Bool) async {
        guard let session, let builder else {
            reset()
            return
        }
        session.end()
        // Let go now, so the session's own "ended" isn't taken for a loss.
        self.session = nil
        let now = Date()
        try? await builder.endCollection(at: now)
        if save {
            _ = try? await builder.finishWorkout()
        } else {
            builder.discardWorkout()
        }
        reset()
    }

    private func reset() {
        session = nil
        builder = nil
        start = nil
        heartRate = nil
        calories = 0
        averageHeartRate = nil
        maxHeartRate = nil
        pausedAt = nil
        pausedTotal = 0
    }

    /// What the builder measured so far, read off its statistics.
    struct Reading: Sendable {
        var heartRate: Double?
        var average: Double?
        var max: Double?
        var calories: Double?
    }

    fileprivate func collected(_ r: Reading) {
        if let value = r.heartRate { heartRate = value }
        if let value = r.average { averageHeartRate = value }
        if let value = r.max { maxHeartRate = value }
        if let value = r.calories { calories = value }
        sendLive()
    }

    /// Every few seconds to Training mode on the iPhone, which then shows these
    /// and leaves Apple Health to this workout (WatchGym.Live).
    private func sendLive(force: Bool = false) {
        guard let start, force || Date().timeIntervalSince(lastLive) >= 5, WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable,
              let data = WatchGym.Live(start: start, heartRate: heartRate, calories: calories).encoded() else { return }
        lastLive = Date()
        session.sendMessage([WatchGym.liveKey: data], replyHandler: { _ in }, errorHandler: { _ in })
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
    fileprivate func lost(_ ended: ObjectIdentifier) {
        guard let session, ObjectIdentifier(session) == ended else { return }
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
        Task { @MainActor in GymWorkout.shared.lost(id) }
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
