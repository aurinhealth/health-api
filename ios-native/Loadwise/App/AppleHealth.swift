import Foundation
import HealthKit
import Observation
import UIKit

/// What Loadwise may read from Apple Health, chosen in Zdroje dat. iOS then
/// asks once more for each type (and the user can untick any there too).
enum HealthCategory: String, CaseIterable, Identifiable {
    case sleep, workouts, heart, activity, breathing, body

    var id: String { rawValue }

    var title: String {
        switch self {
        case .sleep: return "Spánek"
        case .workouts: return "Tréninky"
        case .heart: return "Srdce"
        case .activity: return "Pohyb"
        case .breathing: return "Dech a kyslík"
        case .body: return "Tělo"
        }
    }

    var detail: String {
        switch self {
        case .sleep: return "noci a fáze spánku"
        case .workouts: return "tréninky z hodinek a aplikací, tep během tréninku"
        case .heart: return "tep, klidový tep, HRV, VO₂max"
        case .activity: return "kroky a aktivní energie"
        case .breathing: return "dechová frekvence a okysličení krve"
        case .body: return "hmotnost a tělesný tuk"
        }
    }

    var symbol: String {
        switch self {
        case .sleep: return "bed.double.fill"
        case .workouts: return "figure.run"
        case .heart: return "heart.fill"
        case .activity: return "flame.fill"
        case .breathing: return "lungs.fill"
        case .body: return "scalemass.fill"
        }
    }

    var types: Set<HKObjectType> {
        switch self {
        case .sleep:
            return [HKCategoryType(.sleepAnalysis)]
        case .workouts:
            return [HKObjectType.workoutType(), HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned),
                    HKQuantityType(.distanceWalkingRunning), HKQuantityType(.distanceCycling), HKQuantityType(.distanceSwimming),
                    HKQuantityType(.cyclingPower), HKQuantityType(.runningPower), HKQuantityType(.cyclingCadence)]
        case .heart:
            return [HKQuantityType(.heartRate), HKQuantityType(.restingHeartRate), HKQuantityType(.heartRateVariabilitySDNN),
                    HKSeriesType.heartbeat(), HKQuantityType(.vo2Max), HKQuantityType(.walkingHeartRateAverage),
                    HKQuantityType(.heartRateRecoveryOneMinute)]
        case .activity:
            return [HKQuantityType(.stepCount), HKQuantityType(.activeEnergyBurned)]
        case .breathing:
            return [HKQuantityType(.respiratoryRate), HKQuantityType(.oxygenSaturation)]
        case .body:
            return [HKQuantityType(.bodyMass), HKQuantityType(.bodyFatPercentage), HKQuantityType(.leanBodyMass)]
        }
    }

    /// New samples of these wake the app to sync (HKObserverQuery).
    var observed: [HKSampleType] {
        switch self {
        case .sleep: return [HKCategoryType(.sleepAnalysis)]
        case .workouts: return [HKObjectType.workoutType()]
        case .heart: return [HKQuantityType(.restingHeartRate), HKQuantityType(.heartRateVariabilitySDNN)]
        case .activity: return [HKQuantityType(.stepCount)]
        case .breathing: return [HKQuantityType(.respiratoryRate)]
        case .body: return [HKQuantityType(.bodyMass)]
        }
    }
}

/// Apple Health on this iPhone: the chosen categories, the permission prompt
/// and the sync to the server (POST /app/api/health/apple, src/apple-health.js).
/// The phone sums the data up (steps and energy per hour, one value a day,
/// minutes in heart-rate zones per day, nights, workouts) so the server gets
/// hundreds of records instead of the watch's hundreds of thousands of samples.
@MainActor
@Observable
final class AppleHealth {
    static let shared = AppleHealth()

    private(set) var enabled: Bool
    private(set) var categories: Set<HealthCategory>
    private(set) var syncing = false
    private(set) var lastSync: Date?
    var message: String?

    @ObservationIgnored private let reader = HealthReader()
    @ObservationIgnored private var observers: [HKObserverQuery] = []
    @ObservationIgnored private weak var api: APIClient?

    private static let enabledKey = "appleHealth.enabled"
    private static let categoriesKey = "appleHealth.categories"
    private static let lastSyncKey = "appleHealth.lastSync"

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private init() {
        let defaults = UserDefaults.standard
        enabled = defaults.bool(forKey: Self.enabledKey)
        let saved = (defaults.string(forKey: Self.categoriesKey) ?? "").split(separator: ",").compactMap { HealthCategory(rawValue: String($0)) }
        categories = saved.isEmpty ? Set(HealthCategory.allCases) : Set(saved)
        lastSync = defaults.object(forKey: Self.lastSyncKey) as? Date
    }

    /// The iOS permission sheet for these categories, then the history.
    func connect(_ chosen: Set<HealthCategory>, api: APIClient) async -> Bool {
        guard isAvailable else { message = L10n.tr("Apple Health na tomhle zařízení není."); return false }
        guard !chosen.isEmpty else { message = L10n.tr("Vyber aspoň jednu oblast."); return false }
        do {
            // What Synchronizace writes there stays allowed in the same sheet.
            let export = AppleHealthExport.shared
            try await reader.requestAccess(chosen, share: export.isOn ? AppleHealthExport.shareTypes(export.prefs) : [])
        } catch {
            message = error.localizedDescription
            return false
        }
        setCategories(chosen)
        enabled = true
        UserDefaults.standard.set(true, forKey: Self.enabledKey)
        // A new category needs its history, not just the last days.
        lastSync = nil
        UserDefaults.standard.removeObject(forKey: Self.lastSyncKey)
        start(api: api)
        return await sync(api: api, force: true)
    }

    /// Stops reading. The server keeps what it already has.
    func disconnect() {
        enabled = false
        UserDefaults.standard.set(false, forKey: Self.enabledKey)
        stopObservers()
    }

    /// Zdroje dat → Apple Health → Oprávnění: fewer categories only stop
    /// reading; a new one asks iOS and loads its history.
    func update(_ chosen: Set<HealthCategory>, api: APIClient) async {
        guard !chosen.isEmpty else { message = L10n.tr("Vyber aspoň jednu oblast."); return }
        if chosen.isSubset(of: categories) {
            setCategories(chosen)
            stopObservers()
            start(api: api)
        } else {
            _ = await connect(chosen, api: api)
        }
    }

    private func setCategories(_ chosen: Set<HealthCategory>) {
        categories = chosen
        UserDefaults.standard.set(chosen.map(\.rawValue).sorted().joined(separator: ","), forKey: Self.categoriesKey)
    }

    /// At launch: watch for new data while Apple Health is connected.
    func start(api: APIClient) {
        self.api = api
        guard enabled, isAvailable, observers.isEmpty else { return }
        let types = Set(categories.flatMap(\.observed))
        for type in types {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, error in
                guard error == nil else { completion(); return }
                Task { @MainActor in
                    if let api = AppleHealth.shared.api { _ = await AppleHealth.shared.sync(api: api) }
                    completion()
                }
            }
            reader.store.execute(query)
            observers.append(query)
            reader.store.enableBackgroundDelivery(for: type, frequency: .hourly) { _, _ in }
        }
    }

    private func stopObservers() {
        for query in observers { reader.store.stop(query) }
        observers = []
        reader.store.disableAllBackgroundDelivery { _, _ in }
    }

    /// Sends what is new. Without force at most every 10 minutes (each screen
    /// refresh and every wake from HealthKit asks). Returns false on an error.
    @discardableResult
    func sync(api: APIClient, force: Bool = false) async -> Bool {
        guard enabled, isAvailable, !syncing, api.hasSession else { return false }
        // A locked iPhone keeps Apple Health closed: nothing would be read and
        // the empty windows would delete nights and workouts on the server.
        guard UIApplication.shared.isProtectedDataAvailable else { return false }
        if !force, let lastSync, Date().timeIntervalSince(lastSync) < 600 { return true }
        syncing = true
        defer { syncing = false }
        // A type added in an update (muscle mass) is asked for once, in the app;
        // granted, its history comes with this sync.
        if UIApplication.shared.applicationState == .active, await reader.askNewTypes(categories) { lastSync = nil }
        let started = Date()
        // The first sync takes the history; later ones the days since the last
        // one and a day more (late watch data), at most a month.
        let days: Int? = lastSync.map { min(30, max(2, Int(started.timeIntervalSince($0) / 86400) + 2)) }
        do {
            guard let uploads = await reader.collect(categories, days: days, now: started) else { return false }
            for upload in uploads {
                let _: JSONValue = try await api.send("/app/api/health/apple", method: "POST", body: upload)
            }
            lastSync = started
            UserDefaults.standard.set(started, forKey: Self.lastSyncKey)
            message = nil
            return true
        } catch {
            message = error.localizedDescription
            return false
        }
    }
}

// MARK: - The upload

struct AppleHealthUpload: Encodable {
    var records: [AppleRecord]
    var windows: [String: Window]? = nil
    var categories: [String]

    struct Window: Encodable {
        let from: String
        let to: String
    }
}

/// One record as src/apple-health.js appleRow() reads it; unused fields stay out.
struct AppleRecord: Encodable {
    var type: String
    var id: String
    var date: String? = nil
    var start: String? = nil
    var end: String? = nil
    var time: String? = nil
    var value: Double? = nil
    var metric: String? = nil
    var zone: String? = nil
    var minutes: Double? = nil
    var stages: [Stage]? = nil
    var nap: Bool? = nil
    /// The night's start and end are the time in bed ("in bed" samples), not only the sleep.
    var inBed: Bool? = nil
    var activity: String? = nil
    var sourceName: String? = nil
    var kcal: Double? = nil
    var distanceMeters: Double? = nil
    var avgHr: Double? = nil
    var maxHr: Double? = nil
    var elevationGain: Double? = nil
    var avgPower: Double? = nil
    var avgCadence: Double? = nil
    var activeSeconds: Double? = nil
    var heartRate: [[Int]]? = nil

    struct Stage: Encodable {
        let type: String
        let start: String
        let end: String
    }
}

// MARK: - Reading HealthKit

/// HealthKit queries as async functions, off the main actor.
final class HealthReader: @unchecked Sendable {
    let store = HKHealthStore()
    /// A query found Apple Health closed (the iPhone locked) during collect.
    private let closed = ClosedFlag()

    private final class ClosedFlag: @unchecked Sendable {
        private let lock = NSLock()
        private var value = false
        func set(_ v: Bool) { lock.lock(); value = v; lock.unlock() }
        func get() -> Bool { lock.lock(); defer { lock.unlock() }; return value }
        func note(_ error: Error?) {
            if let error = error as? HKError, error.code == .errorDatabaseInaccessible { set(true) }
        }
    }

    private let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private let dayFormat: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private var calendar: Calendar { Calendar.current }

    /// Reading the categories; `share` are the types Synchronizace writes
    /// (AppleHealthExport), asked for only when the user switched them on.
    func requestAccess(_ categories: Set<HealthCategory>, share: Set<HKSampleType> = []) async throws {
        let read = categories.reduce(into: Set<HKObjectType>()) { $0.formUnion($1.types) }
        try await store.requestAuthorization(toShare: share, read: read)
    }

    /// Asks for the categories' types iOS has not asked about yet; true when it did.
    func askNewTypes(_ categories: Set<HealthCategory>) async -> Bool {
        let read = categories.reduce(into: Set<HKObjectType>()) { $0.formUnion($1.types) }
        guard (try? await store.statusForAuthorizationRequest(toShare: [], read: read)) == .shouldRequest else { return false }
        return (try? await store.requestAuthorization(toShare: [], read: read)) != nil
    }

    /// Not what Loadwise wrote itself from its own records (AppleHealthExport,
    /// marked with a loadwise: sync identifier): the server has it already.
    /// A workout recorded live in Režim tréninku (LiveWorkout) has no such
    /// mark and is read like a watch's, so its calories and heart rate count.
    private var notOurs: NSPredicate {
        NSCompoundPredicate(notPredicateWithSubpredicate: NSCompoundPredicate(andPredicateWithSubpredicates: [
            HKQuery.predicateForObjects(from: HKSource.default()),
            HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier)
        ]))
    }

    private func stamp(_ date: Date) -> String { iso.string(from: date) }
    private func day(_ date: Date) -> String {
        dayFormat.timeZone = calendar.timeZone
        return dayFormat.string(from: date)
    }

    /// Everything to send, split so one request stays well under the server's
    /// limit. Nights and workouts go in the first one with their windows: the
    /// server deletes what is missing in a window (deleted on the phone).
    /// nil when Apple Health could not be read (locked): nothing is sent then.
    func collect(_ categories: Set<HealthCategory>, days: Int?, now: Date) async -> [AppleHealthUpload]? {
        closed.set(false)
        let names = categories.map(\.rawValue).sorted()
        func from(_ fullDays: Int) -> Date {
            calendar.startOfDay(for: calendar.date(byAdding: .day, value: -((days ?? fullDays) - 1), to: now) ?? now)
        }
        var first: [AppleRecord] = []
        var rest: [AppleRecord] = []
        var windows: [String: AppleHealthUpload.Window] = [:]

        if categories.contains(.sleep) {
            // From noon the day before, so the first night is whole.
            let start = from(60).addingTimeInterval(-12 * 3600)
            first += await nights(from: start, to: now)
            windows["sleep"] = .init(from: stamp(start), to: stamp(now.addingTimeInterval(3600)))
        }
        if categories.contains(.workouts) {
            let start = from(180)
            first += await workouts(from: start, to: now)
            windows["exercise"] = .init(from: stamp(start), to: stamp(now.addingTimeInterval(3600)))
        }
        if categories.contains(.activity) {
            let start = from(30)
            rest += await hourly(.stepCount, unit: .count(), type: "steps", prefix: "steps", from: start, to: now)
            rest += await hourly(.activeEnergyBurned, unit: .kilocalorie(), type: "active-energy-burned", prefix: "kcal", from: start, to: now)
        }
        if categories.contains(.heart) {
            let start = from(90)
            rest += await daily(.restingHeartRate, unit: .count().unitDivided(by: .minute()), type: "daily-resting-heart-rate", prefix: "rhr", from: start, to: now)
            rest += await daily(.vo2Max, unit: HKUnit(from: "ml/kg*min"), type: "daily-vo2-max", prefix: "vo2", from: start, to: now)
            rest += await daily(.walkingHeartRateAverage, unit: .count().unitDivided(by: .minute()), type: "daily-walking-heart-rate", prefix: "whr", from: start, to: now)
            rest += await daily(.heartRateRecoveryOneMinute, unit: .count().unitDivided(by: .minute()), type: "daily-heart-rate-recovery", prefix: "hrr", from: start, to: now)
            rest += await dailyHRV(from: start, to: now)
            rest += await zones(from: from(30), to: now)
        }
        if categories.contains(.breathing) {
            let start = from(90)
            rest += await nightly(.respiratoryRate, unit: .count().unitDivided(by: .minute()), type: "daily-respiratory-rate", prefix: "resp", from: start, to: now)
            rest += await nightly(.oxygenSaturation, unit: .percent(), type: "daily-oxygen-saturation", prefix: "spo2", scale: 100, from: start, to: now)
        }
        if categories.contains(.body) {
            let start = from(365)
            rest += await measurements(.bodyMass, unit: .gramUnit(with: .kilo), type: "weight", from: start, to: now)
            rest += await measurements(.bodyFatPercentage, unit: .percent(), type: "body-fat", scale: 100, from: start, to: now)
            rest += await measurements(.leanBodyMass, unit: .gramUnit(with: .kilo), type: "lean-body-mass", from: start, to: now)
        }

        if closed.get() { return nil }
        var uploads = [AppleHealthUpload(records: first, windows: windows.isEmpty ? nil : windows, categories: names)]
        for i in stride(from: 0, to: rest.count, by: 1500) {
            uploads.append(AppleHealthUpload(records: Array(rest[i..<min(i + 1500, rest.count)]), categories: names))
        }
        return uploads
    }

    // MARK: Queries

    private func samples(_ type: HKSampleType, from: Date, to: Date, predicate extra: NSPredicate? = nil) async -> [HKSample] {
        await withCheckedContinuation { continuation in
            var predicate: NSPredicate = HKQuery.predicateForSamples(withStart: from, end: to, options: [])
            if let extra { predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [predicate, extra]) }
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [closed] _, samples, error in
                closed.note(error)
                continuation.resume(returning: samples ?? [])
            }
            store.execute(query)
        }
    }

    private func statistics(_ type: HKQuantityType, options: HKStatisticsOptions, from: Date, to: Date, step: DateComponents) async -> [HKStatistics] {
        await withCheckedContinuation { continuation in
            let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: from, end: to, options: []),
                                                    options: options, anchorDate: calendar.startOfDay(for: from), intervalComponents: step)
            query.initialResultsHandler = { [closed] _, results, error in
                closed.note(error)
                var out: [HKStatistics] = []
                results?.enumerateStatistics(from: from, to: to) { statistics, _ in out.append(statistics) }
                continuation.resume(returning: out)
            }
            store.execute(query)
        }
    }

    /// Sums per hour (steps, active energy).
    private func hourly(_ id: HKQuantityTypeIdentifier, unit: HKUnit, type: String, prefix: String, from: Date, to: Date) async -> [AppleRecord] {
        await statistics(HKQuantityType(id), options: .cumulativeSum, from: from, to: to, step: DateComponents(hour: 1)).compactMap { s -> AppleRecord? in
            guard let value = s.sumQuantity()?.doubleValue(for: unit), value > 0 else { return nil }
            return AppleRecord(type: type, id: prefix + ":" + stamp(s.startDate), start: stamp(s.startDate), end: stamp(s.endDate), value: (value * 10).rounded() / 10)
        }
    }

    /// The day's average (resting heart rate, VO2max, breathing, oxygen).
    private func daily(_ id: HKQuantityTypeIdentifier, unit: HKUnit, type: String, prefix: String, scale: Double = 1, from: Date, to: Date) async -> [AppleRecord] {
        await statistics(HKQuantityType(id), options: .discreteAverage, from: from, to: to, step: DateComponents(day: 1)).compactMap { s -> AppleRecord? in
            guard let value = s.averageQuantity()?.doubleValue(for: unit) else { return nil }
            let date = day(s.startDate)
            return AppleRecord(type: type, id: prefix + ":" + date, date: date, value: (value * scale * 10).rounded() / 10)
        }
    }

    /// The night's average (breathing, oxygen) on the day of waking up, as the
    /// nights themselves are dated: the watch measures them in sleep, and a
    /// calendar day would split one night between two days. A sample from
    /// 15:00 on belongs to the next day. The query starts at 15:00 the day
    /// before `from`, so the first day is whole; a day after today (this
    /// evening's samples) waits for the morning.
    private func nightly(_ id: HKQuantityTypeIdentifier, unit: HKUnit, type: String, prefix: String, scale: Double = 1, from: Date, to: Date) async -> [AppleRecord] {
        let list = await samples(HKQuantityType(id), from: from.addingTimeInterval(-9 * 3600), to: to).compactMap { $0 as? HKQuantitySample }
        var byDay: [String: [Double]] = [:]
        for q in list {
            byDay[wakeDay(q.startDate), default: []].append(q.quantity.doubleValue(for: unit))
        }
        let last = day(to)
        return byDay.keys.sorted().compactMap { date -> AppleRecord? in
            guard date <= last, let values = byDay[date], !values.isEmpty else { return nil }
            let value = values.reduce(0, +) / Double(values.count)
            return AppleRecord(type: type, id: prefix + ":" + date, date: date, value: (value * scale * 10).rounded() / 10)
        }
    }

    /// The day a night's sample counts for: from 15:00 on the next one.
    private func wakeDay(_ date: Date) -> String {
        guard calendar.component(.hour, from: date) >= 15 else { return day(date) }
        return day(calendar.date(byAdding: .day, value: 1, to: date) ?? date)
    }

    /// Each weighing (or body fat measurement) as it was taken.
    private func measurements(_ id: HKQuantityTypeIdentifier, unit: HKUnit, type: String, scale: Double = 1, from: Date, to: Date) async -> [AppleRecord] {
        await samples(HKQuantityType(id), from: from, to: to, predicate: notOurs).compactMap { sample -> AppleRecord? in
            guard let q = sample as? HKQuantitySample else { return nil }
            let value = q.quantity.doubleValue(for: unit) * scale
            return AppleRecord(type: type, id: q.uuid.uuidString, time: stamp(q.startDate), value: (value * 100).rounded() / 100)
        }
    }

    /// The night's HRV as RMSSD (what Google Health and the recovery model
    /// use), from the Apple Watch's beat-to-beat readings between midnight and
    /// 10:00. Without them the average SDNN Apple Health shows.
    private func dailyHRV(from: Date, to: Date) async -> [AppleRecord] {
        let unit = HKUnit.secondUnit(with: .milli)
        let sdnn = await samples(HKQuantityType(.heartRateVariabilitySDNN), from: from, to: to).compactMap { $0 as? HKQuantitySample }
        let beats = await samples(HKSeriesType.heartbeat(), from: from, to: to).compactMap { $0 as? HKHeartbeatSeriesSample }
        var rmssd: [String: [Double]] = [:]
        for series in beats where calendar.component(.hour, from: series.startDate) < 10 {
            if let value = await rmssdOf(series) { rmssd[day(series.startDate), default: []].append(value) }
        }
        var bySdnn: [String: [Double]] = [:]
        for s in sdnn {
            let morning = calendar.component(.hour, from: s.startDate) < 10
            bySdnn[day(s.startDate) + (morning ? "" : "+"), default: []].append(s.quantity.doubleValue(for: unit))
        }
        let days = Set(rmssd.keys).union(bySdnn.keys.map { String($0.prefix(10)) })
        return days.sorted().compactMap { date -> AppleRecord? in
            let mean = { (xs: [Double]) -> Double in xs.reduce(0, +) / Double(xs.count) }
            if let values = rmssd[date], !values.isEmpty {
                return AppleRecord(type: "daily-heart-rate-variability", id: "hrv:" + date, date: date, value: (mean(values) * 10).rounded() / 10, metric: "rmssd")
            }
            guard let values = bySdnn[date] ?? bySdnn[date + "+"], !values.isEmpty else { return nil }
            return AppleRecord(type: "daily-heart-rate-variability", id: "hrv:" + date, date: date, value: (mean(values) * 10).rounded() / 10, metric: "sdnn")
        }
    }

    private final class BeatBox: @unchecked Sendable {
        var times: [Double] = []
        var gaps: [Bool] = []
        var done = false
    }

    private func rmssdOf(_ series: HKHeartbeatSeriesSample) async -> Double? {
        await withCheckedContinuation { continuation in
            let box = BeatBox()
            let query = HKHeartbeatSeriesQuery(heartbeatSeries: series) { _, time, gap, done, error in
                guard !box.done else { return }
                if error != nil { box.done = true; continuation.resume(returning: nil); return }
                box.times.append(time)
                box.gaps.append(gap)
                if done { box.done = true; continuation.resume(returning: Self.rmssd(times: box.times, gaps: box.gaps)) }
            }
            store.execute(query)
        }
    }

    /// Root mean square of successive differences of the beat intervals, in ms.
    static func rmssd(times: [Double], gaps: [Bool]) -> Double? {
        guard times.count >= 3, gaps.count == times.count else { return nil }
        var intervals: [Double?] = []
        for i in 1..<times.count {
            let ms = (times[i] - times[i - 1]) * 1000
            intervals.append(gaps[i] || ms < 300 || ms > 2000 ? nil : ms)
        }
        var squares: [Double] = []
        for i in 1..<intervals.count {
            if let a = intervals[i - 1], let b = intervals[i] { squares.append((b - a) * (b - a)) }
        }
        guard squares.count >= 10 else { return nil }
        return (squares.reduce(0, +) / Double(squares.count)).squareRoot()
    }

    /// Minutes per day in the heart-rate zones Google Health uses for the day's
    /// strain, as % of heart-rate reserve (Karvonen): light 40–59 %, moderate
    /// 60–74 %, vigorous 75–84 %, peak 85 % and more. Each sample counts until
    /// the next one, at most 5 minutes.
    private func zones(from: Date, to: Date) async -> [AppleRecord] {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let rest = await samples(HKQuantityType(.restingHeartRate), from: to.addingTimeInterval(-30 * 86400), to: to)
            .compactMap { ($0 as? HKQuantitySample)?.quantity.doubleValue(for: bpm) }
        let resting = rest.isEmpty ? 60 : rest.reduce(0, +) / Double(rest.count)
        let peak = await maxHeartRate(to: to)
        let reserve = peak - resting
        guard reserve > 40 else { return [] }
        var out: [AppleRecord] = []
        var dayStart = calendar.startOfDay(for: from)
        while dayStart < to {
            let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) ?? to
            let hr = await samples(HKQuantityType(.heartRate), from: dayStart, to: min(dayEnd, to)).compactMap { $0 as? HKQuantitySample }
            var minutes: [String: Double] = [:]
            for (i, s) in hr.enumerated() {
                let share = (s.quantity.doubleValue(for: bpm) - resting) / reserve
                let zone = share >= 0.85 ? "PEAK" : share >= 0.75 ? "VIGOROUS" : share >= 0.6 ? "MODERATE" : share >= 0.4 ? "LIGHT" : nil
                guard let zone else { continue }
                let next = i + 1 < hr.count ? hr[i + 1].startDate : s.endDate
                let length = min(300, max(1, next.timeIntervalSince(s.startDate), s.endDate.timeIntervalSince(s.startDate)))
                minutes[zone, default: 0] += length / 60
            }
            let date = day(dayStart)
            for (zone, value) in minutes where value >= 0.5 {
                out.append(AppleRecord(type: "time-in-heart-rate-zone", id: "zone:" + date + ":" + zone, start: stamp(dayStart), zone: zone, minutes: (value * 10).rounded() / 10))
            }
            dayStart = dayEnd
        }
        return out
    }

    /// The highest workout heart rate of half a year (a reading in a workout,
    /// not a spike at rest), 190 without workouts.
    private func maxHeartRate(to: Date) async -> Double {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let workouts = await samples(HKObjectType.workoutType(), from: to.addingTimeInterval(-183 * 86400), to: to).compactMap { $0 as? HKWorkout }
        let peaks = workouts.compactMap { $0.statistics(for: HKQuantityType(.heartRate))?.maximumQuantity()?.doubleValue(for: bpm) }.filter { $0 > 120 && $0 < 225 }.sorted()
        guard !peaks.isEmpty else { return 190 }
        // The second highest when there are several: one sensor spike does not count.
        return peaks.count >= 3 ? peaks[peaks.count - 2] : peaks[peaks.count - 1]
    }

    /// Nights (and naps) with their stages. Several apps can record the same
    /// night; the one with stages (the watch) wins, else the one with most sleep.
    /// "In bed" samples (often the iPhone's, not the watch's) that overlap the
    /// sleep widen the night to the time in bed, so the server gets the real
    /// efficiency and the time it took to fall asleep (src/apple-health.js).
    private func nights(from: Date, to: Date) async -> [AppleRecord] {
        let recorded = await samples(HKCategoryType(.sleepAnalysis), from: from, to: to).compactMap { $0 as? HKCategorySample }
        let inBed = recorded.filter { $0.value == 0 }  // 0 = in bed, not sleep
        let all = recorded.filter { $0.value != 0 }
        // Samples closer than an hour belong to one sleep.
        var clusters: [[HKCategorySample]] = []
        var clusterEnd = Date.distantPast
        for s in all.sorted(by: { $0.startDate < $1.startDate }) {
            if clusters.isEmpty || s.startDate.timeIntervalSince(clusterEnd) > 3600 {
                clusters.append([s])
            } else {
                clusters[clusters.count - 1].append(s)
            }
            clusterEnd = max(clusterEnd, s.endDate)
        }
        return clusters.compactMap { cluster -> AppleRecord? in
            let bySource = Dictionary(grouping: cluster) { $0.sourceRevision.source.bundleIdentifier }
            func minutes(_ xs: [HKCategorySample], _ values: Set<Int>) -> Double { xs.filter { values.contains($0.value) }.reduce(0) { $0 + $1.endDate.timeIntervalSince($1.startDate) / 60 } }
            let staged: Set<Int> = [3, 4, 5]
            guard let best = bySource.values.max(by: { a, b in
                let (sa, sb) = (minutes(a, staged), minutes(b, staged))
                return sa != sb ? sa < sb : minutes(a, [1, 3, 4, 5]) < minutes(b, [1, 3, 4, 5])
            }), let start = best.map(\.startDate).min(), let end = best.map(\.endDate).max() else { return nil }
            let asleep = minutes(best, [1, 3, 4, 5])
            guard asleep >= 20 else { return nil }
            let stages = best.compactMap { s -> AppleRecord.Stage? in
                let type: String? = [1: "ASLEEP", 2: "AWAKE", 3: "CORE", 4: "DEEP", 5: "REM"][s.value]
                return type.map { AppleRecord.Stage(type: $0, start: stamp(s.startDate), end: stamp(s.endDate)) }
            }
            // A short sleep in the day is a nap.
            let hour = calendar.component(.hour, from: start)
            let nap = asleep < 180 && hour >= 9 && hour < 20
            // The time in bed around this sleep; the id stays the sleep's start.
            let bed = inBed.filter { $0.endDate > start && $0.startDate < end }
            let bedStart = min(start, bed.map(\.startDate).min() ?? start)
            let bedEnd = max(end, bed.map(\.endDate).max() ?? end)
            var record = AppleRecord(type: "sleep", id: "sleep:" + stamp(start), start: stamp(bedStart), end: stamp(bedEnd), stages: stages, nap: nap)
            if !bed.isEmpty { record.inBed = true }
            return record
        }
    }

    /// Workouts with their summary and the heart rate for the chart.
    private func workouts(from: Date, to: Date) async -> [AppleRecord] {
        let list = await samples(HKObjectType.workoutType(), from: from, to: to, predicate: notOurs).compactMap { $0 as? HKWorkout }
        let bpm = HKUnit.count().unitDivided(by: .minute())
        var out: [AppleRecord] = []
        for w in list {
            func sum(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit) -> Double? { w.statistics(for: HKQuantityType(id))?.sumQuantity()?.doubleValue(for: unit) }
            func average(_ id: HKQuantityTypeIdentifier, _ unit: HKUnit) -> Double? { w.statistics(for: HKQuantityType(id))?.averageQuantity()?.doubleValue(for: unit) }
            let indoor = (w.metadata?[HKMetadataKeyIndoorWorkout] as? NSNumber)?.boolValue == true
            let distance = sum(.distanceCycling, .meter()) ?? sum(.distanceWalkingRunning, .meter()) ?? sum(.distanceSwimming, .meter())
            let heart = w.statistics(for: HKQuantityType(.heartRate))
            let elevation = (w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity)?.doubleValue(for: .meter())
            var record = AppleRecord(type: "exercise", id: w.uuid.uuidString, start: stamp(w.startDate), end: stamp(w.endDate))
            record.activity = Self.activityName(w.workoutActivityType, indoor: indoor)
            record.sourceName = w.sourceRevision.source.name
            record.activeSeconds = w.duration
            record.kcal = sum(.activeEnergyBurned, .kilocalorie())
            record.distanceMeters = distance
            record.avgHr = heart?.averageQuantity()?.doubleValue(for: bpm)
            record.maxHr = heart?.maximumQuantity()?.doubleValue(for: bpm)
            record.elevationGain = elevation
            record.avgPower = average(.cyclingPower, .watt()) ?? average(.runningPower, .watt())
            record.avgCadence = average(.cyclingCadence, bpm)
            record.heartRate = await heartRateSeries(from: w.startDate, to: w.endDate)
            out.append(record)
        }
        return out
    }

    /// Heart rate through a workout as [seconds from the start, bpm], averaged
    /// per 10 s (longer steps for long workouts, at most 2000 points).
    private func heartRateSeries(from: Date, to: Date) async -> [[Int]]? {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let hr = await samples(HKQuantityType(.heartRate), from: from, to: to).compactMap { $0 as? HKQuantitySample }
        guard hr.count >= 2 else { return nil }
        let step = max(10, to.timeIntervalSince(from) / 2000)
        var buckets: [Int: (sum: Double, count: Double)] = [:]
        for s in hr {
            let key = Int(s.startDate.timeIntervalSince(from) / step)
            let v = buckets[key] ?? (0, 0)
            buckets[key] = (v.sum + s.quantity.doubleValue(for: bpm), v.count + 1)
        }
        return buckets.keys.sorted().map { key -> [Int] in
            let v = buckets[key]!
            return [Int(Double(key) * step), Int((v.sum / v.count).rounded())]
        }
    }

    /// HKWorkoutActivityType as the names src/apple-health.js knows.
    static func activityName(_ type: HKWorkoutActivityType, indoor: Bool) -> String {
        switch type {
        case .running: return indoor ? "indoorRunning" : "running"
        case .cycling: return indoor ? "indoorCycling" : "cycling"
        case .walking: return "walking"
        case .hiking: return "hiking"
        case .swimming: return "swimming"
        case .traditionalStrengthTraining: return "traditionalStrengthTraining"
        case .functionalStrengthTraining: return "functionalStrengthTraining"
        case .highIntensityIntervalTraining: return "highIntensityIntervalTraining"
        case .yoga: return "yoga"
        case .rowing: return "rowing"
        case .elliptical: return "elliptical"
        case .crossTraining: return "crossTraining"
        case .coreTraining: return "coreTraining"
        case .pilates: return "pilates"
        case .soccer: return "soccer"
        case .tennis: return "tennis"
        case .crossCountrySkiing: return "crossCountrySkiing"
        case .downhillSkiing: return "downhillSkiing"
        case .stairClimbing: return "stairClimbing"
        case .mixedCardio: return "mixedCardio"
        default: return "other"
        }
    }
}
