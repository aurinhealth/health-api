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
    /// Today's weather at the week plan's place; nil without a place (or from
    /// an older server).
    let weather: Weather?
    /// "Regenerace na dnes" after a training day (Data/RecoveryModels.swift).
    let recovery: RecoveryToday?
    /// The morning check-in: "fresh", "normal", "tired", "sick" or nil
    /// (not answered, or an older server).
    let checkin: String?
    /// The active training plan in one line (GET /app/api/plans has the rest).
    let trainingPlan: PlanLine?

    struct PlanLine: Decodable, Equatable {
        let name: String
        let week: Int
        let weeksCount: Int
        let phaseLabel: String?
        /// Sick, injured or on a break: the plan waits.
        let paused: Bool?
        /// What the plan asks now (a missed session, last week, back from a break).
        let proposal: PlanProposal?
    }

    /// src/training-plans.js proposalView.
    struct PlanProposal: Decodable, Equatable {
        struct Option: Decodable, Equatable, Identifiable {
            let id: String
            let label: String
            let date: String?
            let recommended: Bool?
        }
        let type: String
        let title: String
        let text: String
        let options: [Option]
        /// For a missed session: the days left in the week.
        let days: [String]?
        let button: String
    }

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
        /// The range to aim for today and what set it (src/app-today.js strainTarget).
        var target: Target? = nil

        struct Target: Decodable, Equatable {
            let low: Double
            let high: Double
            let readiness: Int?
            let debt: Double?
            let feeling: String?
            let plan: String?
        }
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
        /// Workouts: ride, run, strength or other.
        var sport: String? = nil
        /// Workouts: "done", "planned" or "missed".
        var status: String? = nil
        /// Workouts: the session as Training lists it, to open its detail.
        var session: WeekSession? = nil

        var id: String { session.map { "session|" + $0.id } ?? kind + "|" + (time ?? "") + "|" + title }
    }

    struct Tonight: Decodable, Equatable {
        let bedtime: String?
        let wake: String?
        let need: Int?
        /// The wake time comes from the user's alarm setting (not the usual nights).
        var wakeSet: Bool? = nil
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
        var month: [Point]? = nil
        var activeKcal: Double? = nil
        var activeMinutes: ActiveMinutes? = nil

        /// Minutes at moderate heart rate or above, vigorous counted twice.
        struct ActiveMinutes: Decodable, Equatable {
            let today: Double
            let week: Double
            var target: Double? = nil
        }
    }

    struct Weight: Decodable, Equatable {
        let latest: Double
        let goal: Double?
        let series: [Point]
    }

    /// The forecast for today from Open-Meteo (src/app-today.js todayWeather).
    struct Weather: Decodable, Equatable {
        let place: String?
        /// WMO weather code.
        let code: Double?
        /// Highest and lowest temperature, °C.
        let max: Double?
        let min: Double?
        /// Strongest wind, km/h.
        let wind: Double?
        /// Rain, mm, and its probability, %.
        let rain: Double?
        let rainProb: Double?
        /// Where a ride (outdoor) and a run (outdoorRun) belong today.
        let outdoor: Advice?
        let outdoorRun: Advice?
        /// A few hours of the day (8, 11, 14, 17, 20 h).
        var hours: [Hour]? = nil

        struct Hour: Decodable, Equatable {
            let hour: Int
            let temp: Double
            let code: Double?
        }
    }

    struct Advice: Decodable, Equatable {
        /// "indoor" or "outdoor".
        let environment: String?
        let reason: String?
    }
}
