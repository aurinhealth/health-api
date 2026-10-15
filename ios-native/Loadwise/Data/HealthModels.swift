import Foundation

typealias Point = TodaySnapshot.Point

/// GET /app/api/health (src/app-health.js): everything the Health screen shows.
struct HealthSnapshot: Decodable, Equatable {
    let date: String
    let readiness: Readiness
    let sleep: Sleep
    let hrv: HRV?
    let restingHR: RestingHR?
    let respiration: Respiration?
    let skinTemp: SkinTemp?
    let oxygen: Oxygen?
    /// Apple Health only: average heart rate while walking, and the drop in
    /// the first minute after a workout.
    let walkingHR: Latest?
    let hrRecovery: Latest?
    let weight: Weight?
    /// Apple Watch only: wrist temperature in sleep (°C) and how far last
    /// night is from the athlete's own nights (null under 7 of them).
    var wristTemp: WristTemp? = nil

    struct Part: Decodable, Equatable, Identifiable {
        /// "hrv", "restingHR", "sleep", "respiration", "skinTemp", "wristTemp" or "checkin".
        let key: String
        let points: Int
        /// Today's value and the athlete's usual range (hrv, restingHR, sleep
        /// in minutes); older servers and the other parts have none.
        var value: Double? = nil
        var low: Double? = nil
        var high: Double? = nil
        var id: String { key }
    }

    struct Readiness: Decodable, Equatable {
        let score: Int?
        let zone: String?
        let flags: [String]
        let parts: [Part]
        let hrv: Double?
        let restingHR: Double?
        let sleepMinutes: Double?
        let strainYesterday: Double?
        let history: [Point]
        /// Today's "Jak se dnes cítíš?" answer, when it is part of the number.
        var checkin: String? = nil
    }

    struct Stages: Decodable, Equatable {
        let deep: Double
        let light: Double
        let rem: Double
        let awake: Double
    }

    struct Night: Decodable, Equatable {
        let date: String
        let minutes: Double?
        let inBedMinutes: Double?
        let index: Int?
        let start: String?
        let end: String?
        let latencyMinutes: Double?
        let efficiency: Int?
        let stages: Stages?
    }

    struct Tonight: Decodable, Equatable {
        let need: Int
        let base: Int
        let strain: Int
        let hrv: Int
        let debt: Int
        let naps: Int
        let bedtime: String?
        let wake: String?
        /// The user set an own sleep goal / an alarm (Nastavení spánku).
        var goalSet: Bool? = nil
        var wakeSet: Bool? = nil
    }

    struct Debt: Decodable, Equatable {
        let minutes: Int
        let nights: Int
    }

    struct Regularity: Decodable, Equatable {
        let bedtime: String
        /// Standard deviation of the bedtime in minutes.
        let spread: Int
        /// Bedtime as minutes after 18:00.
        let nights: [Point]
    }

    struct Sleep: Decodable, Equatable {
        let night: Night?
        let week: [Point]
        let need: Int
        let tonight: Tonight
        let debt: Debt?
        let regularity: Regularity?
    }

    struct HRV: Decodable, Equatable {
        let value: Double?
        let baseline: Double?
        let low: Double?
        let high: Double?
        let trend: String?
        let week: Double?
        let series: [Point]
    }

    struct RestingHR: Decodable, Equatable {
        let value: Double?
        let baseline: Double?
        let series: [Point]
    }

    struct Respiration: Decodable, Equatable {
        let value: Double
        let baseline: Double?
        let elevated: Bool
        let series: [Point]
    }

    struct SkinTemp: Decodable, Equatable {
        let deviation: Double
        let elevated: Bool
        let series: [Point]
    }

    struct WristTemp: Decodable, Equatable {
        let value: Double
        let deviation: Double?
        let series: [Point]
        /// The last 14 nights, each against its own baseline (older servers lack it).
        var deviations: [Point]? = nil
    }

    struct Latest: Decodable, Equatable {
        let value: Double
        let series: [Point]
    }

    struct Oxygen: Decodable, Equatable {
        let value: Double
        let low: Double
        let high: Double
        let series: [Point]
    }

    struct BodyFat: Decodable, Equatable {
        let value: Double
        let change: Double?
        let series: [Point]
    }

    struct Weight: Decodable, Equatable {
        let latest: Double
        let date: String
        let average: Double?
        let change: Double?
        let goal: Double?
        let series: [Point]
        let bodyFat: BodyFat?
        /// Muscle mass (lean body mass, kg) from a scale through Apple Health.
        var muscle: BodyFat? = nil
    }
}

/// GET /app/api/night?date= (src/night-detail.js): the hypnogram and the heart
/// rate through one night. Times in segments and heart rate are minutes after
/// falling asleep; bedClock and wakeClock minutes after midnight.
struct NightDetail: Decodable, Equatable {
    let night: Night?

    struct Segment: Decodable, Equatable {
        /// "DEEP", "LIGHT", "REM" or "AWAKE".
        let type: String
        let s: Double
        let e: Double
    }

    struct HeartRate: Decodable, Equatable {
        let m: Double
        let avg: Double?
    }

    struct Stats: Decodable, Equatable {
        let wakeups: Int?
        let avgHr: Double?
        let lowHr: Double?
        let lowHrAt: Double?
        let hrv: Double?
        let hrvLow: Double?
        let hrvHigh: Double?
    }

    struct Night: Decodable, Equatable {
        let bedClock: Double?
        let wakeClock: Double?
        let segments: [Segment]?
        let hr: [HeartRate]?
        let stats: Stats?
    }
}
