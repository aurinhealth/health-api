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
    let zones: Zones?
    let vo2max: VO2max?
    let activeCalories: ActiveCalories?
    let thisWeek: ThisWeek

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

    /// Minutes in Google's heart-rate zones over 4 weeks.
    struct Zones: Decodable, Equatable {
        let light: Double
        let moderate: Double
        let vigorous: Double
        let peak: Double
        let minutes: Double
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
    }

    struct ThisWeek: Decodable, Equatable {
        let done: Int
        let planned: Int
        let doneLoad: Double
        let plannedLoad: Double
    }
}
