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

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    var running: Bool { session != nil }
    private var lastLive = Date.distantPast

    func begin() async {
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
        session = recovered
        self.builder = builder
        start = recovered.startDate ?? builder.startDate ?? Date()
        return true
    }

    /// Ends the workout; saved to Apple Health when sets were done, else thrown away.
    func finish(save: Bool) async {
        guard let session, let builder else {
            reset()
            return
        }
        session.end()
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
    private func sendLive() {
        guard let start, Date().timeIntervalSince(lastLive) >= 5, WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable,
              let data = WatchGym.Live(start: start, heartRate: heartRate, calories: calories).encoded() else { return }
        lastLive = Date()
        session.sendMessage([WatchGym.liveKey: data], replyHandler: { _ in }, errorHandler: { _ in })
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
