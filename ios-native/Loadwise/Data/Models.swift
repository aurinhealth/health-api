import Foundation

/// GET /app/api/today (src/app-today.js): everything the Today screen shows.
struct TodaySnapshot: Decodable, Equatable {
    let date: String
    let readiness: Readiness
    let sleep: Sleep?
    let strain: Strain
    let hrv: HRV?
    let restingHR: RestingHR?
    let summary: Summary?
    let nutrition: Nutrition
    let plan: [PlanItem]
    let tonight: Tonight?
    let steps: Steps
    let weight: Weight?

    struct Readiness: Decodable, Equatable {
        let score: Int?
        let zone: String?
    }

    struct Sleep: Decodable, Equatable {
        let minutes: Double?
        let inBedMinutes: Double?
        let index: Int?
        let need: Int?
        let start: String?
        let end: String?
    }

    struct Strain: Decodable, Equatable {
        let score: Double?
        let planned: Double?
    }

    struct Point: Decodable, Equatable {
        let date: String
        let value: Double
    }

    struct HRV: Decodable, Equatable {
        let value: Double?
        let baseline: Double?
        let low: Double?
        let high: Double?
        let trend: String?
        let series: [Point]
    }

    struct RestingHR: Decodable, Equatable {
        let value: Double?
        let baseline: Double?
        let series: [Point]
    }

    struct Summary: Decodable, Equatable {
        let headline: String?
        let text: String?
        let recommendation: String?
    }

    struct Macro: Decodable, Equatable {
        let eaten: Double?
        let target: Double?
    }

    struct Water: Decodable, Equatable {
        let ml: Double?
        let target: Double?
    }

    struct Nutrition: Decodable, Equatable {
        let kcal: Double?
        let target: Double?
        let trainingBonus: Double?
        let protein: Macro
        let carbs: Macro
        let fat: Macro
        let water: Water
    }

    struct PlanItem: Decodable, Equatable, Identifiable {
        let kind: String
        let time: String?
        let title: String
        let detail: String?
        let done: Bool

        var id: String { kind + "|" + (time ?? "") + "|" + title }
    }

    struct Tonight: Decodable, Equatable {
        let bedtime: String?
        let wake: String?
        let need: Int?
    }

    struct Steps: Decodable, Equatable {
        let today: Double?
        let goal: Double
        let week: [Point]
        /// Steps in each local hour of the day (24 values), when Google Health has them.
        let hourly: [Double]?
        /// The usual running total at the end of each hour (earlier days).
        let usual: [Double]?
        /// The current hour for today, nil for a past day.
        let hour: Int?
    }

    struct Weight: Decodable, Equatable {
        let latest: Double
        let goal: Double?
        let series: [Point]
    }
}
