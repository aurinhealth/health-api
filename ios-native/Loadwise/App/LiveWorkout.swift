import Foundation
import HealthKit
import Observation
import SwiftUI

/// The clock, calories and heart rate of a gym session in progress (Režim
/// tréninku, Posilovna naživo).
///
/// From iOS 26 the iPhone runs a real HealthKit workout (HKWorkoutSession with
/// a live builder): calories come from HealthKit, the heart rate from whatever
/// sensor iOS has (AirPods, a chest strap, the watch's samples), and at the end
/// the workout is saved to Apple Health with them, so it counts in the
/// activity rings. On older iOS the clock runs, the calories are estimated from
/// the body weight (strength training ≈ 5 MET, 4 of them above rest, which is
/// what Apple Health counts as active) and the heart rate is the latest sample
/// Apple Health has from the last two minutes. A Bluetooth sensor paired in
/// Nastavení (HeartRateSensor) gives the heart rate live on any iOS, and its
/// beats go to Apple Health with the workout.
@MainActor
@Observable
final class LiveWorkout: NSObject {
    static let shared = LiveWorkout()

    private(set) var start: Date?
    private(set) var kcal: Double?
    private(set) var heartRate: Double?
    private(set) var avgHeartRate: Double?
    private(set) var maxHeartRate: Double?
    /// The session saved its own workout to Apple Health.
    private(set) var savedToHealth = false
    var running: Bool { start != nil }

    @ObservationIgnored private let store = HKHealthStore()
    @ObservationIgnored private var weightKg: Double = 80
    @ObservationIgnored private var hrSum = 0.0
    @ObservationIgnored private var hrCount = 0
    @ObservationIgnored private var poll: Task<Void, Never>?
    /// HKWorkoutSession / HKLiveWorkoutBuilder on iOS 26 (kept untyped for iOS 17).
    @ObservationIgnored private var session: AnyObject?
    @ObservationIgnored private var builder: AnyObject?
    @ObservationIgnored private var liveKcal = false
    /// Beats from the Bluetooth sensor, one per 5 s, saved with the workout.
    @ObservationIgnored private var sensorBeats: [(Date, Double)] = []
    private var sensor: HeartRateSensor { HeartRateSensor.shared }

    /// Starts once per session; `since` is when the gym sheet started.
    func begin(since: Date?, weightKg: Double?) async {
        // A session left running from another day (never finished) starts over.
        if let start, Date().timeIntervalSince(start) > 4 * 3600 { reset() }
        guard start == nil else { return }
        let begun = since ?? Date()
        start = begun
        if let weightKg, weightKg > 30 { self.weightKg = weightKg }
        savedToHealth = false
        kcal = nil; heartRate = nil; avgHeartRate = nil; maxHeartRate = nil; hrSum = 0; hrCount = 0
        sensorBeats = []
        sensor.onBeat = { [weak self] bpm in self?.sensorBeat(bpm) }
        sensor.connectSaved()
        guard HKHealthStore.isHealthDataAvailable() else { tick(); return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKQuantityType(.activeEnergyBurned), HKQuantityType(.heartRate)]
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned)]
        try? await store.requestAuthorization(toShare: share, read: read)
        if #available(iOS 26.0, *) { await startSession(at: begun) }
        tick()
    }

    /// Ends the clock. On iOS 26 the workout goes to Apple Health; returns
    /// whether it did.
    @discardableResult
    func finish() async -> Bool {
        guard let begun = start else { return false }
        poll?.cancel(); poll = nil
        stopSensor()
        var saved = false
        if #available(iOS 26.0, *) { saved = await endSession(from: begun) }
        if !saved { saved = await saveWorkout(from: begun, to: Date()) }
        savedToHealth = saved
        return saved
    }

    /// Clears everything after the summary was shown (or the screen left early).
    func reset() {
        poll?.cancel(); poll = nil
        stopSensor()
        sensorBeats = []
        if #available(iOS 26.0, *), let session = session as? HKWorkoutSession, session.state == .running { session.end() }
        session = nil; builder = nil; liveKcal = false
        start = nil
    }

    var minutes: Int { start.map { max(1, Int((Date().timeIntervalSince($0) / 60).rounded())) } ?? 0 }

    // MARK: Without a live builder

    private func tick() {
        poll?.cancel()
        poll = Task { [weak self] in
            while !Task.isCancelled {
                await self?.update()
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    private func update() async {
        guard let start else { return }
        if !liveKcal {
            // Strength training about 5 MET, 4 above rest: active kcal = 4 × kg × hours.
            kcal = 4.0 * weightKg * Date().timeIntervalSince(start) / 3600
        }
        if builder == nil, !sensor.connected, let bpm = await latestHeartRate(since: Date().addingTimeInterval(-120)) { note(bpm) }
    }

    private func sensorBeat(_ bpm: Double) {
        guard start != nil else { return }
        note(bpm)
        if let last = sensorBeats.last?.0, Date().timeIntervalSince(last) < 5 { return }
        sensorBeats.append((Date(), bpm))
    }

    private func stopSensor() {
        sensor.onBeat = nil
        sensor.disconnect()
    }

    /// The sensor's beats as Apple Health samples (write access granted).
    private func beatSamples() -> [HKQuantitySample] {
        guard store.authorizationStatus(for: HKQuantityType(.heartRate)) == .sharingAuthorized else { return [] }
        let unit = HKUnit.count().unitDivided(by: .minute())
        return sensorBeats.map { date, bpm in
            HKQuantitySample(type: HKQuantityType(.heartRate), quantity: HKQuantity(unit: unit, doubleValue: bpm), start: date, end: date)
        }
    }

    private func add(_ samples: [HKSample], to builder: HKWorkoutBuilder) async {
        guard !samples.isEmpty else { return }
        _ = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            builder.add(samples) { ok, _ in continuation.resume(returning: ok) }
        }
    }

    private func note(_ bpm: Double) {
        heartRate = bpm
        hrSum += bpm; hrCount += 1
        avgHeartRate = hrSum / Double(hrCount)
        maxHeartRate = max(maxHeartRate ?? 0, bpm)
    }

    private func latestHeartRate(since: Date) async -> Double? {
        await withCheckedContinuation { (continuation: CheckedContinuation<Double?, Never>) in
            let predicate = HKQuery.predicateForSamples(withStart: since, end: nil)
            let query = HKSampleQuery(sampleType: HKQuantityType(.heartRate), predicate: predicate, limit: 1,
                                      sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, samples, _ in
                let bpm = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
                continuation.resume(returning: bpm)
            }
            store.execute(query)
        }
    }

    /// Before iOS 26 (or when the live session could not start): the workout
    /// afterwards, with the estimated calories.
    private func saveWorkout(from begun: Date, to end: Date) async -> Bool {
        guard HKHealthStore.isHealthDataAvailable(), store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else { return false }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: .local())
        let began: Bool = await withCheckedContinuation { continuation in
            builder.beginCollection(withStart: begun) { ok, _ in continuation.resume(returning: ok) }
        }
        guard began else { return false }
        if let kcal, kcal > 0, store.authorizationStatus(for: HKQuantityType(.activeEnergyBurned)) == .sharingAuthorized {
            let sample = HKQuantitySample(type: HKQuantityType(.activeEnergyBurned), quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal), start: begun, end: end)
            await add([sample], to: builder)
        }
        await add(beatSamples(), to: builder)
        builder.addMetadata([HKMetadataKeyWorkoutBrandName: "Aurin"]) { _, _ in }
        let ended: Bool = await withCheckedContinuation { continuation in
            builder.endCollection(withEnd: end) { ok, _ in continuation.resume(returning: ok) }
        }
        guard ended else { return false }
        let workout: HKWorkout? = await withCheckedContinuation { continuation in
            builder.finishWorkout { workout, _ in continuation.resume(returning: workout) }
        }
        return workout != nil
    }

    // MARK: iOS 26: a HealthKit workout on the iPhone

    @available(iOS 26.0, *)
    private func startSession(at date: Date) async {
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        guard let session = try? HKWorkoutSession(healthStore: store, configuration: configuration) else { return }
        let builder = session.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: configuration)
        builder.delegate = self
        session.startActivity(with: date)
        let started: Bool = await withCheckedContinuation { continuation in
            builder.beginCollection(withStart: date) { ok, _ in continuation.resume(returning: ok) }
        }
        guard started else { session.end(); return }
        self.session = session
        self.builder = builder
    }

    @available(iOS 26.0, *)
    private func endSession(from begun: Date) async -> Bool {
        guard let session = session as? HKWorkoutSession, let builder = builder as? HKLiveWorkoutBuilder else { return false }
        await add(beatSamples(), to: builder)
        session.end()
        let end = Date()
        let ended: Bool = await withCheckedContinuation { continuation in
            builder.endCollection(withEnd: end) { ok, _ in continuation.resume(returning: ok) }
        }
        guard ended else { builder.discardWorkout(); return false }
        builder.addMetadata([HKMetadataKeyWorkoutBrandName: "Aurin"]) { _, _ in }
        let workout: HKWorkout? = await withCheckedContinuation { continuation in
            builder.finishWorkout { workout, _ in continuation.resume(returning: workout) }
        }
        self.session = nil
        self.builder = nil
        return workout != nil
    }

    fileprivate func collected(energy: Double?, bpm: Double?) {
        if let energy, energy > 0 { kcal = energy; liveKcal = true }
        if let bpm, bpm > 0, !sensor.connected { note(bpm) }
    }
}

@available(iOS 26.0, *)
extension LiveWorkout: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let energy = workoutBuilder.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie())
        let bpm = collectedTypes.contains(HKQuantityType(.heartRate))
            ? workoutBuilder.statistics(for: HKQuantityType(.heartRate))?.mostRecentQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            : nil
        Task { @MainActor in self.collected(energy: energy, bpm: bpm) }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}

/// "Čas · Kalorie · Tep" on top of the live gym screens.
struct LiveWorkoutStrip: View {
    let live: LiveWorkout

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            HStack(spacing: 0) {
                cell(L10n.tr("Čas"), clock(at: context.date), nil, Palette.ink)
                divider
                cell(L10n.tr("Kalorie"), live.kcal.map { Fmt.int($0) } ?? "–", "kcal", Palette.amber)
                // Only an iPhone, nothing measuring the heart: no tile at all.
                if let bpm = live.heartRate {
                    divider
                    cell(L10n.tr("Tep"), Fmt.int(bpm), "bpm", Palette.rust)
                }
            }
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .accessibilityElement(children: .combine)
    }

    private var divider: some View { Rectangle().fill(Palette.hairline).frame(width: 1) }

    private func clock(at now: Date) -> String {
        guard let start = live.start else { return "0:00" }
        let s = max(0, Int(now.timeIntervalSince(start)))
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }

    private func cell(_ title: String, _ value: String, _ unit: String?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(Typo.small).foregroundStyle(color == Palette.ink ? Palette.secondary : color)
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text(value).font(Typo.number(28)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
                if let unit { Text(unit).font(Typo.caption).foregroundStyle(Palette.muted) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14).padding(.vertical, 12)
    }
}
