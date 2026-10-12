import Foundation

/// GET /app/api/training (src/app-training.js): everything the Training screen shows.
struct TrainingSnapshot: Decodable, Equatable {
    let date: String
    let week: Int
    let strain: Strain
    let days: [Day]
    let next: Session?
    let event: Event?
    let form: Form?
    let load: Load
    /// The acute:chronic workload ratio (src/workload-ratio.js); null without
    /// any load on record (older saved answers lack it).
    let acwr: ACWR?
    /// Foster's training monotony and the week's strain (older saved answers lack it).
    let monotony: Monotony?
    let zones: Zones?
    let vo2max: VO2max?
    let activeCalories: ActiveCalories?
    /// The week's sessions, done and planned (older saved answers lack it).
    let sessions: [WeekSession]?
    let thisWeek: ThisWeek
    /// No main sport and goal saved yet: Training shows "Nastav si zaměření a
    /// cíle" (older saved answers lack it).
    let profileIncomplete: Bool?

    struct Strain: Decodable, Equatable {
        let score: Double?
        /// Where today's plan takes the strain.
        let target: Double?
        let band: String?
    }

    struct Day: Decodable, Equatable, Identifiable {
        let date: String
        let strain: Double?
        let planned: Double?
        let today: Bool
        var id: String { date }
    }

    struct Session: Decodable, Equatable {
        let date: String
        let time: String?
        let minutes: Int?
        let title: String
        let sport: String?
        let tss: Double?
        let strain: Double?
        let exercises: [String]
        let description: String?
        let advice: String?
    }

    struct Phase: Decodable, Equatable, Identifiable {
        let key: String
        let label: String
        let from: String?
        let to: String?
        /// "done", "now" or "next".
        let state: String
        let week: Int?
        let weeks: Int?
        var id: String { key }
    }

    struct Event: Decodable, Equatable {
        let name: String?
        let date: String?
        let daysLeft: Int?
        let phase: String?
        let phases: [Phase]
    }

    struct FormPoint: Decodable, Equatable {
        let date: String
        let fitness: Double
        let fatigue: Double
    }

    struct Form: Decodable, Equatable {
        let fitness: Double
        let fatigue: Double
        let form: Double
        let zone: String
        let label: String
        let text: String
        let series: [FormPoint]
    }

    struct WeekLoad: Decodable, Equatable, Identifiable {
        let start: String
        let week: Int
        let load: Double
        let planned: Double?
        var id: String { start }
    }

    struct IntensityWeek: Decodable, Equatable {
        let low: Double
        let high: Double
        let anaerobic: Double
    }

    struct Intensity: Decodable, Equatable {
        let low: Double
        let high: Double
        let anaerobic: Double
        let weeks: [IntensityWeek]
    }

    struct Load: Decodable, Equatable {
        let weeks: [WeekLoad]
        let intensity: Intensity?
    }

    /// The mean daily load of the last 7 days (acute) over that of the last 28
    /// (chronic). value is null with under 21 days of history or no chronic load.
    struct ACWR: Decodable, Equatable {
        let value: Double?
        /// "low" (< 0.8), "sweetSpot" (0.8–1.3), "elevated" (1.3–1.5), "high" (> 1.5).
        let zone: String?
        let acute: Double?
        let chronic: Double?
    }

    /// Mean over standard deviation of the last 7 daily loads; strain is the
    /// week's load × monotony; high above 2.0.
    struct Monotony: Decodable, Equatable {
        let value: Double?
        let strain: Double?
        let high: Bool?
    }

    /// Minutes in Google's heart-rate zones over 4 weeks.
    struct Zones: Decodable, Equatable {
        let light: Double
        let moderate: Double
        let vigorous: Double
        let peak: Double
        let minutes: Double
        /// The same per week, Monday to Sunday, the current week last (older
        /// saved answers lack it).
        let weeks: [ZoneWeek]?
    }

    /// One week's minutes in the heart-rate zones.
    struct ZoneWeek: Decodable, Equatable, Identifiable {
        let start: String
        let week: Int?
        let light: Double
        let moderate: Double
        let vigorous: Double
        let peak: Double
        var id: String { start }

        /// WHO recommends 150 minutes of moderate activity a week, or 75 of
        /// vigorous: a vigorous (and peak) minute counts as two.
        static let whoTarget: Double = 150

        /// The minutes the WHO recommendation counts: vigorous and peak twice.
        var counted: Double { moderate + 2 * (vigorous + peak) }
    }

    struct VO2max: Decodable, Equatable {
        let value: Double
        let change: Double?
        let series: [TodaySnapshot.Point]
    }

    struct ActiveCalories: Decodable, Equatable {
        let today: Double?
        let usual: Double?
        let week: [TodaySnapshot.Point]
        /// The last 28 days for the detail (older saved answers lack it).
        let days: [TodaySnapshot.Point]?
        /// The watch's calories left out today: a gym session counted at the estimate.
        var excluded: Double? = nil
    }

    struct ThisWeek: Decodable, Equatable {
        let done: Int
        let planned: Int
        let doneLoad: Double
        let plannedLoad: Double
    }
}
