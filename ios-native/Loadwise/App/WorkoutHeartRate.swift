import Foundation
import HealthKit

/// The heart rate and calories of a typed-in workout's time window: from Apple
/// Health on this phone, else from the Google Health samples on the server.
struct WindowHeartRate: Decodable, Equatable {
    let avgHr: Int?
    let maxHr: Int?
    let kcal: Int?
}

enum WorkoutHeartRate {
    private static let store = HKHealthStore()

    static func window(start: Date, end: Date, api: APIClient, appleHealth: Bool) async -> WindowHeartRate? {
        if appleHealth, HKHealthStore.isHealthDataAvailable(), let found = await apple(start: start, end: end) { return found }
        struct Response: Decodable { let heartRate: WindowHeartRate? }
        let f = ISO8601DateFormatter()
        let query = "start=\(f.string(from: start))&end=\(f.string(from: end))".replacingOccurrences(of: "+", with: "%2B")
        let response: Response? = try? await api.get("/app/api/workouts/manual/heart-rate?" + query)
        return response?.heartRate
    }

    private static func apple(start: Date, end: Date) async -> WindowHeartRate? {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let heart = await statistics(.heartRate, options: [.discreteAverage, .discreteMax], start: start, end: end)
        guard let avg = heart?.averageQuantity()?.doubleValue(for: bpm) else { return nil }
        let peak = heart?.maximumQuantity()?.doubleValue(for: bpm)
        let energy = await statistics(.activeEnergyBurned, options: .cumulativeSum, start: start, end: end)?.sumQuantity()?.doubleValue(for: .kilocalorie())
        return WindowHeartRate(avgHr: Int(avg.rounded()), maxHr: peak.map { Int($0.rounded()) }, kcal: energy.flatMap { $0 > 0 ? Int($0.rounded()) : nil })
    }

    private static func statistics(_ id: HKQuantityTypeIdentifier, options: HKStatisticsOptions, start: Date, end: Date) async -> HKStatistics? {
        await withCheckedContinuation { continuation in
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [])
            let query = HKStatisticsQuery(quantityType: HKQuantityType(id), quantitySamplePredicate: predicate, options: options) { _, result, _ in
                continuation.resume(returning: result)
            }
            store.execute(query)
        }
    }
}
