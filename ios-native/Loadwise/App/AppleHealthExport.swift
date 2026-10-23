import Foundation
import HealthKit
import Observation

/// Writing to Apple Health (Zdroje dat → Apple Health → Aurin posílá): done
/// workouts logged in Loadwise as HKWorkout, and the chosen health data the
/// app itself has: the weight typed in, the day's food (energy and macros)
/// and water. iOS asks for write permission only for the types switched on.
///
/// Each sample carries a sync identifier (loadwise:…) and a version, so a
/// newer value of the same day or workout replaces the older one in Apple
/// Health instead of adding a second. The reading side (AppleHealth.swift)
/// skips what Loadwise wrote, so nothing comes back as a second copy.
@MainActor
@Observable
final class AppleHealthExport {
    static let shared = AppleHealthExport()

    /// Apple Health's preferences; the server keeps a copy (sync_preferences).
    private(set) var prefs: SyncPrefs

    /// What the server already writes to Google Health ("activities", "weight",
    /// "nutrition"). The Google Health iPhone app also reads Apple Health, so the
    /// same data written here too counted twice there: Google's copy wins.
    private(set) var viaGoogle: Set<String>

    @ObservationIgnored private let store = HKHealthStore()
    private static let prefsKey = "appleHealth.export"
    private static let writtenKey = "appleHealth.written"
    private static let viaGoogleKey = "appleHealth.viaGoogle"

    static let healthTypes = ["weight", "nutrition", "water"]

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Something is written to Apple Health.
    var isOn: Bool { prefs.pushActivities || prefs.health.any }

    private init() {
        if let data = UserDefaults.standard.data(forKey: Self.prefsKey), let saved = try? JSONDecoder().decode(SyncPrefs.self, from: data) {
            prefs = saved
        } else {
            prefs = .off
        }
        viaGoogle = Set(UserDefaults.standard.stringArray(forKey: Self.viaGoogleKey) ?? [])
    }

    func setPrefs(_ next: SyncPrefs) {
        prefs = next
        if let data = try? JSONEncoder().encode(next) { UserDefaults.standard.set(data, forKey: Self.prefsKey) }
    }

    /// From Zdroje dat → Google Health → Aurin posílá: what really goes there (connected,
    /// switched on and with the permission to write it).
    func setGoogle(_ google: SyncDestination?) {
        var types = Set<String>()
        if let google, google.connected == true {
            let missing = Set(google.missingScopes ?? [])
            if google.prefs.pushActivities && !missing.contains("activityWrite") { types.insert("activities") }
            if google.prefs.health.allows("weight") && !missing.contains("weightWrite") { types.insert("weight") }
            if google.prefs.health.allows("nutrition") && !missing.contains("nutritionWrite") { types.insert("nutrition") }
        }
        viaGoogle = types
        UserDefaults.standard.set(types.sorted(), forKey: Self.viaGoogleKey)
    }

    /// Done workouts go to Apple Health (not when they go to Google Health).
    var writesWorkouts: Bool { prefs.pushActivities && !viaGoogle.contains("activities") }

    /// Signing out or another account: the next one writes what its own server settings say.
    func reset() {
        prefs = .off
        viaGoogle = []
        UserDefaults.standard.removeObject(forKey: Self.prefsKey)
        UserDefaults.standard.removeObject(forKey: Self.viaGoogleKey)
        UserDefaults.standard.removeObject(forKey: Self.writtenKey)
    }

    /// The types iOS is asked to let Loadwise write, for these preferences.
    static func shareTypes(_ prefs: SyncPrefs) -> Set<HKSampleType> {
        var types = Set<HKSampleType>()
        if prefs.pushActivities { types.insert(HKObjectType.workoutType()) }
        if prefs.health.allows("weight") { types.insert(HKQuantityType(.bodyMass)) }
        if prefs.health.allows("nutrition") {
            types.formUnion([HKQuantityType(.dietaryEnergyConsumed), HKQuantityType(.dietaryProtein),
                             HKQuantityType(.dietaryCarbohydrates), HKQuantityType(.dietaryFatTotal)])
        }
        if prefs.health.allows("water") { types.insert(HKQuantityType(.dietaryWater)) }
        return types
    }

    /// The iOS permission sheet for what these preferences write.
    func requestAccess(_ next: SyncPrefs) async throws {
        guard isAvailable else { throw APIError.message(L10n.tr("Apple Health na tomhle zařízení není.")) }
        let types = Self.shareTypes(next)
        guard !types.isEmpty else { return }
        try await store.requestAuthorization(toShare: types, read: [])
    }

    private func allowed(_ type: HKObjectType) -> Bool {
        store.authorizationStatus(for: type) == .sharingAuthorized
    }

    private func version() -> NSNumber { NSNumber(value: Int(Date().timeIntervalSince1970 * 1000)) }

    private func metadata(_ id: String) -> [String: Any] {
        [HKMetadataKeySyncIdentifier: "loadwise:" + id, HKMetadataKeySyncVersion: version()]
    }

    // MARK: Workouts

    /// A done workout. nil when it went in, else the message for the sheet.
    func saveWorkout(_ activity: ActivityToSync) async -> String? {
        guard isAvailable else { return L10n.tr("Apple Health na tomhle zařízení není.") }
        guard allowed(HKObjectType.workoutType()) else { return L10n.tr("Aurin nemá povolený zápis tréninků do Apple Health. Povol ho v aplikaci Zdraví → profil → Aplikace → Aurin.") }
        let end = (activity.start ?? Self.noon(activity.date)).addingTimeInterval(TimeInterval(activity.minutes * 60))
        let start = end.addingTimeInterval(-TimeInterval(activity.minutes * 60))
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = Self.activityType(activity.sport)
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: HKDevice.local())
        var meta = metadata("workout:" + activity.key)
        meta[HKMetadataKeyWorkoutBrandName] = "Aurin"
        do {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                builder.beginCollection(withStart: start) { _, error in
                    if let error { continuation.resume(throwing: error) } else { continuation.resume() }
                }
            }
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                builder.addMetadata(meta) { _, error in
                    if let error { continuation.resume(throwing: error) } else { continuation.resume() }
                }
            }
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                builder.endCollection(withEnd: end) { _, error in
                    if let error { continuation.resume(throwing: error) } else { continuation.resume() }
                }
            }
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                builder.finishWorkout { _, error in
                    if let error { continuation.resume(throwing: error) } else { continuation.resume() }
                }
            }
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    /// Změnit typ aktivity on a workout made in the app: its copy in Apple
    /// Health is saved again with the new type; the same sync identifier with
    /// a newer version replaces the old one.
    func changeWorkoutType(key: String, type: String) async {
        guard isAvailable, prefs.pushActivities, allowed(HKObjectType.workoutType()) else { return }
        let predicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: ["loadwise:workout:" + key])
        let found: HKWorkout? = await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: 1, sortDescriptors: nil) { _, samples, _ in
                continuation.resume(returning: samples?.first as? HKWorkout)
            }
            store.execute(query)
        }
        guard let old = found else { return }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = Self.workoutType(type)
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: HKDevice.local())
        var meta = metadata("workout:" + key)
        meta[HKMetadataKeyWorkoutBrandName] = "Aurin"
        do {
            try await builder.beginCollection(at: old.startDate)
            try await builder.addMetadata(meta)
            try await builder.endCollection(at: old.endDate)
            _ = try await builder.finishWorkout()
        } catch {
            // The old copy stays; the type is right in the app.
        }
    }

    /// An Intervals.icu activity type (src/activity-type.js) as Apple's.
    static func workoutType(_ type: String) -> HKWorkoutActivityType {
        switch type {
        case "Run", "TrailRun", "VirtualRun": return .running
        case "Walk": return .walking
        case "Hike", "Snowshoe": return .hiking
        case "Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "EBikeRide": return .cycling
        case "WeightTraining": return .traditionalStrengthTraining
        case "Crossfit": return .crossTraining
        case "HighIntensityIntervalTraining": return .highIntensityIntervalTraining
        case "Swim", "OpenWaterSwim": return .swimming
        case "Rowing", "VirtualRow": return .rowing
        case "Kayaking", "Canoeing": return .paddleSports
        case "StandUpPaddling": return .paddleSports
        case "Surfing", "Windsurf", "Kitesurf": return .surfingSports
        case "Sail": return .sailing
        case "NordicSki", "RollerSki": return .crossCountrySkiing
        case "AlpineSki", "BackcountrySki": return .downhillSkiing
        case "Snowboard": return .snowboarding
        case "IceSkate", "InlineSkate": return .skatingSports
        case "RockClimbing": return .climbing
        case "Yoga": return .yoga
        case "Pilates": return .pilates
        case "Elliptical": return .elliptical
        case "StairStepper": return .stairClimbing
        case "Tennis": return .tennis
        case "Squash": return .squash
        case "Badminton": return .badminton
        case "TableTennis": return .tableTennis
        case "Padel": return .paddleSports
        case "Pickleball": return .pickleball
        case "Soccer": return .soccer
        case "Hockey": return .hockey
        case "Rugby": return .rugby
        case "Golf": return .golf
        default: return .other
        }
    }

    static func activityType(_ sport: String) -> HKWorkoutActivityType {
        switch sport {
        case "gym", "strength": return .traditionalStrengthTraining
        case "run": return .running
        case "ride": return .cycling
        case "walk": return .walking
        case "swim": return .swimming
        default: return .other
        }
    }

    // MARK: Health data

    /// A weigh-in typed in Loadwise (one per day, the newest wins).
    func saveWeight(kg: Double, date: String) async {
        guard prefs.health.allows("weight"), !viaGoogle.contains("weight"), isAvailable, allowed(HKQuantityType(.bodyMass)) else { return }
        let now = Date()
        let sample = HKQuantitySample(type: HKQuantityType(.bodyMass), quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
                                      start: now, end: now, metadata: metadata("weight:" + date))
        _ = await save([sample])
    }

    /// The day's food and water as one total each (energy, protein, carbs,
    /// fat, water); written again only when a total changed.
    func saveFoodDay(_ food: FoodSnapshot) async {
        guard isAvailable, prefs.health.allows("nutrition") || prefs.health.allows("water") else { return }
        guard food.date <= AppModel.localDate(Date()) else { return }
        let start = Self.dayStart(food.date)
        let end = min(Date(), start.addingTimeInterval(86400 - 1))
        guard end > start else { return }
        var totals: [(String, HKQuantityTypeIdentifier, HKUnit, Double)] = []
        // What other apps wrote to Apple Health (and Aurin read back) is theirs:
        // only Aurin's own share is written, so nothing counts twice there.
        let entries = food.meals.flatMap(\.entries)
        let other = entries.filter { $0.app != nil }
        func theirs(_ key: KeyPath<FoodSnapshot.Entry, Double?>) -> Double { other.reduce(0.0) { $0 + ($1[keyPath: key] ?? 0) } }
        if prefs.health.allows("nutrition") {
            // Food that goes to Google Health: a zero replaces what was written here before.
            let mine = viaGoogle.contains("nutrition") ? 0.0 : 1.0
            let kcal = (food.kcal ?? entries.reduce(0.0) { $0 + ($1.kcal ?? 0) }) - theirs(\.kcal)
            totals.append(("kcal", .dietaryEnergyConsumed, .kilocalorie(), kcal * mine))
            totals.append(("protein", .dietaryProtein, .gram(), ((food.macros.protein.eaten ?? 0) - theirs(\.protein)) * mine))
            totals.append(("carbs", .dietaryCarbohydrates, .gram(), ((food.macros.carbs.eaten ?? 0) - theirs(\.carbs)) * mine))
            totals.append(("fat", .dietaryFatTotal, .gram(), ((food.macros.fat.eaten ?? 0) - theirs(\.fat)) * mine))
        }
        if prefs.health.allows("water") {
            let drinks = food.water.drinks ?? []
            let water = drinks.isEmpty ? (food.water.ml ?? 0) : drinks.filter { $0.kind == "water" && $0.app == nil }.reduce(0.0) { $0 + ($1.ml ?? 0) }
            totals.append(("water", .dietaryWater, .literUnit(with: .milli), water))
        }
        var written = UserDefaults.standard.dictionary(forKey: Self.writtenKey) as? [String: Double] ?? [:]
        var samples: [HKObject] = []
        var changed: [String: Double] = [:]
        for (name, id, unit, raw) in totals {
            let value = (max(0, raw) * 10).rounded() / 10
            let key = name + ":" + food.date
            // Nothing new; and a zero is written only to replace an earlier value.
            if written[key] == value || (value == 0 && written[key] == nil) { continue }
            guard allowed(HKQuantityType(id)) else { continue }
            samples.append(HKQuantitySample(type: HKQuantityType(id), quantity: HKQuantity(unit: unit, doubleValue: value),
                                            start: start, end: end, metadata: metadata(key)))
            changed[key] = value
        }
        guard !samples.isEmpty, await save(samples) else { return }
        written.merge(changed) { $1 }
        // Only the last few weeks are worth remembering.
        let oldest = AppModel.localDate(Date().addingTimeInterval(-40 * 86400))
        written = written.filter { String($0.key.split(separator: ":").last ?? "") >= oldest }
        UserDefaults.standard.set(written, forKey: Self.writtenKey)
    }

    private func save(_ objects: [HKObject]) async -> Bool {
        await withCheckedContinuation { continuation in
            store.save(objects) { ok, error in
                if let error { print("Apple Health write failed", error.localizedDescription) }
                continuation.resume(returning: ok)
            }
        }
    }

    // MARK: Days

    private static func dayStart(_ date: String) -> Date {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return Calendar.current.startOfDay(for: f.date(from: date) ?? Date())
    }

    private static func noon(_ date: String) -> Date {
        dayStart(date).addingTimeInterval(12 * 3600)
    }
}
