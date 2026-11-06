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
        /// Days of baseline so far while a new athlete has under 14 (TodaySnapshot.Readiness).
        var learningDays: Int? = nil
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
        /// What makes up the index (src/app-health.js indexParts); nil from an
        /// older server or when the index is the device's own score.
        var parts: IndexParts? = nil
        /// The usual share of deep and REM sleep, from 7 nights of the same source.
        var usual: UsualStages? = nil
    }

    /// The index's three parts as the night's own values, each with how full
    /// it is (0–1) for its bar. No points: they don't always add up.
    struct IndexParts: Decodable, Equatable {
        let length: Length
        let quality: Quality
        let stages: StageShare?

        struct Length: Decodable, Equatable {
            let minutes: Double
            let need: Double
            let fill: Double
        }

        struct Quality: Decodable, Equatable {
            let efficiency: Int
            let latency: Double?
            let waso: Double?
            let fill: Double
        }

        /// Deep and REM sleep together, % of the sleep.
        struct StageShare: Decodable, Equatable {
            let share: Int
            let fill: Double
        }
    }

    struct UsualStages: Decodable, Equatable {
        let deep: Range
        let rem: Range
        let nights: Int

        struct Range: Decodable, Equatable {
            let low: Int
            let high: Int
        }
    }

    /// The sleep index of the last 14 nights, its average and the usual range
    /// (the middle half of them, nil under 7 nights).
    struct IndexNights: Decodable, Equatable {
        let nights: [Point]
        let average: Int
        let low: Double?
        let high: Double?
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
        /// The planned night (Spánek): its evening, the sleep it plans (the need
        /// or the user's own length), the time in bed, the own length chosen for
        /// tonight (nil = the whole need) and whether the wake time is for
        /// tomorrow only.
        var date: String? = nil
        var sleep: Int? = nil
        var inBed: Int? = nil
        var chosen: Int? = nil
        var wakeOnce: Bool? = nil
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
        /// Last 14 nights of the index (sleep detail); nil from an older server.
        var index: IndexNights? = nil
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
        /// The usual range readiness weighs it against; nil from an older server.
        var low: Double? = nil
        var high: Double? = nil
        let series: [Point]

        var usual: ClosedRange<Double>? { TodaySnapshot.RestingHR.usual(low: low, high: high, baseline: baseline) }
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

    /// Heart rate in a 5-minute bucket, minutes from the start of the night.
    struct HeartRate: Decodable, Equatable {
        let m: Double
        let avg: Double?
        var min: Double? = nil
        var max: Double? = nil
    }

    /// A bucket whose peak is 15 bpm or more above the night's average.
    struct Spike: Decodable, Equatable {
        let m: Double
        let max: Double
    }

    /// One night's average heart rate (Tep po nocích).
    struct NightHR: Decodable, Equatable {
        let date: String
        let avgHr: Double
    }

    struct Stats: Decodable, Equatable {
        let wakeups: Int?
        let avgHr: Double?
        let lowHr: Double?
        let lowHrAt: Double?
        var spikes: [Spike]? = nil
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
        /// The nights up to this one, oldest first.
        var hrNights: [NightHR]? = nil
    }
}
