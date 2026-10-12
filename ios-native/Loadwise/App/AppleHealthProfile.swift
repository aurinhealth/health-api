import Foundation
import HealthKit

/// What the setup's "O tobě" page takes from Apple Health once "Apple Zdraví"
/// is on in "Odkud brát data": sex and the year of birth (characteristics)
/// and the latest height and weight. Read on the phone only; the profile the
/// user confirms goes to the server as his own values.
struct AppleHealthProfile: Equatable {
    /// "male" or "female" as the server's profile stores it; nil when not set.
    var sex: String?
    var birthYear: Int?
    var heightCm: Double?
    var weightKg: Double?

    var isEmpty: Bool { sex == nil && birthYear == nil && heightCm == nil && weightKg == nil }

    /// The types this needs, asked for in the same sheet as the health categories.
    static var readTypes: Set<HKObjectType> {
        [HKCharacteristicType(.biologicalSex), HKCharacteristicType(.dateOfBirth), HKQuantityType(.height), HKQuantityType(.bodyMass)]
    }

    /// One permission sheet for the categories AppleHealth reads and the
    /// profile; AppleHealth.connect then finds everything decided and shows
    /// no second sheet.
    static func requestAccess(_ categories: Set<HealthCategory>) async throws {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        var read = categories.reduce(into: Set<HKObjectType>()) { $0.formUnion($1.types) }
        read.formUnion(readTypes)
        try await HKHealthStore().requestAuthorization(toShare: [], read: read)
    }

    /// Whatever Apple Health gives; a type the user did not allow stays nil.
    static func read() async -> AppleHealthProfile {
        guard HKHealthStore.isHealthDataAvailable() else { return AppleHealthProfile() }
        let store = HKHealthStore()
        var profile = AppleHealthProfile()
        if let sex = try? store.biologicalSex().biologicalSex {
            switch sex {
            case .male: profile.sex = "male"
            case .female: profile.sex = "female"
            default: break
            }
        }
        if let year = (try? store.dateOfBirthComponents())?.year, year > 1900 {
            profile.birthYear = year
        }
        if let height = await latest(store, HKQuantityType(.height), unit: .meterUnit(with: .centi)), height >= 100, height <= 230 {
            profile.heightCm = height.rounded()
        }
        if let weight = await latest(store, HKQuantityType(.bodyMass), unit: .gramUnit(with: .kilo)), weight >= 35, weight <= 250 {
            profile.weightKg = (weight * 10).rounded() / 10
        }
        return profile
    }

    /// The most recent sample of the type, in the unit.
    private static func latest(_ store: HKHealthStore, _ type: HKQuantityType, unit: HKUnit) async -> Double? {
        await withCheckedContinuation { continuation in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                let sample = samples?.first as? HKQuantitySample
                continuation.resume(returning: sample?.quantity.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }
}
