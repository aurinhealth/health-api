import CoreLocation
import Foundation
import HealthKit

/// The route of an Apple Health workout, read on the iPhone (it never goes to
/// the server): seconds from the workout's start and the position, as the
/// detail's latlng stream.
enum AppleWorkoutRoute {
    private static let store = HKHealthStore()

    static func points(workout uuid: UUID) async -> [ActivityDetail.StreamPoint] {
        guard HKHealthStore.isHealthDataAvailable() else { return [] }
        // iOS asks once; a refusal leaves the detail without a map.
        try? await store.requestAuthorization(toShare: [], read: [HKObjectType.workoutType(), HKSeriesType.workoutRoute()])
        guard let workout = await workout(uuid) else { return [] }
        var out: [ActivityDetail.StreamPoint] = []
        for route in await routes(of: workout) {
            for location in await locations(of: route) where location.horizontalAccuracy >= 0 && location.horizontalAccuracy < 50 {
                out.append(.init(t: location.timestamp.timeIntervalSince(workout.startDate), v: nil,
                                 ll: [location.coordinate.latitude, location.coordinate.longitude]))
            }
        }
        // About 1500 points are plenty for a phone-wide map.
        let step = max(1, out.count / 1500)
        return out.enumerated().filter { $0.offset % step == 0 || $0.offset == out.count - 1 }.map(\.element)
    }

    private static func workout(_ uuid: UUID) async -> HKWorkout? {
        await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: .workoutType(), predicate: HKQuery.predicateForObject(with: uuid), limit: 1, sortDescriptors: nil) { _, samples, _ in
                continuation.resume(returning: samples?.first as? HKWorkout)
            }
            store.execute(query)
        }
    }

    private static func routes(of workout: HKWorkout) async -> [HKWorkoutRoute] {
        await withCheckedContinuation { continuation in
            let query = HKSampleQuery(sampleType: HKSeriesType.workoutRoute(), predicate: HKQuery.predicateForObjects(from: workout),
                                      limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, _ in
                continuation.resume(returning: (samples as? [HKWorkoutRoute]) ?? [])
            }
            store.execute(query)
        }
    }

    private static func locations(of route: HKWorkoutRoute) async -> [CLLocation] {
        await withCheckedContinuation { continuation in
            // HealthKit hands the batches over one after another on its queue;
            // the box holds them until the last one.
            let all = LocationBatches()
            let query = HKWorkoutRouteQuery(route: route) { _, batch, done, error in
                all.items.append(contentsOf: batch ?? [])
                if done || error != nil { continuation.resume(returning: all.items) }
            }
            store.execute(query)
        }
    }
}

/// The route's points as HealthKit hands them over, batch by batch, on one queue.
private final class LocationBatches: @unchecked Sendable {
    var items: [CLLocation] = []
}
