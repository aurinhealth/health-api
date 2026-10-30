import Foundation

/// GET /app/api/today (src/app-today.js): everything the Today screen shows.
struct TodaySnapshot: Decodable, Equatable {
    let date: String
    /// Connected services that need the user (src/connection-health.js connectionProblems).
    var connectionProblems: [ConnectionProblem]?
    let readiness: Readiness
    let sleep: Sleep?
    let strain: Strain
    let hrv: HRV?
    let restingHR: RestingHR?
    let summary: Summary?
    let nutrition: Nutrition
    var plan: [PlanItem]
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
    /// Cycle tracking, nil when off (Data/CycleModels.swift).
    var cycle: TodayCycle? = nil
    /// Regenerace: when hard training is fine again (Data/RecoveryModels.swift);
    /// nil when nothing is left to recover from, on another day or from an older server.
    var recoveryTime: RecoveryTime? = nil
    /// The week strip above Dnes: Monday to Sunday of the day's week, each
    /// day up to it with its readiness zone (src/app-today.js readinessWeek).
    var week: [WeekDay]? = nil
    /// The day's naps for Dnes → Den, each from its start to its end
    /// (src/app-today.js napsOn); nil from an older server.
    var naps: [Nap]? = nil
    /// Parts the server could not load this time ("sleep", "fluids"): their
    /// place says so instead of looking empty; nil from an older server.
    var unavailable: [String]? = nil

    struct Nap: Decodable, Equatable {
        let start: String?
        let end: String?
        let minutes: Int
    }

    struct WeekDay: Decodable, Equatable {
        let date: String
        /// "green", "yellow", "red"; nil without a readiness or after the day.
        let zone: String?
    }

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
        /// The baseline is carried over from an earlier data source until the
        /// new one has 14 days of its own; `provisionalDays` is how many are left.
        var provisional: Bool? = nil
        var provisionalDays: Int? = nil
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
        /// The score split into the done training and the rest of the day's
        /// movement (src/recovery-model.js dayStrainParts).
        var training: Double? = nil
        var movement: Double? = nil
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
        /// The athlete's usual range (the Apple Watch app's "Your normal"); nil from an older server.
        var low: Double? = nil
        var high: Double? = nil
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
        /// The target from body weight and training, also while an own goal is set.
        var autoTarget: Double? = nil
        /// "auto", "custom" or "build" (Cíle → Pití, src/water-goal.js).
        var mode: String? = nil
        var build: WaterBuild? = nil
    }

    /// Build-up: this week's goal without training, and the last finished weeks.
    struct WaterBuild: Decodable, Equatable {
        let weekMl: Double
        let step: String
        let weeks: [Week]

        struct Week: Decodable, Equatable {
            let week: String
            let targetMl: Double
            let avgMl: Double
            let percent: Double
        }
    }

    struct Nutrition: Decodable, Equatable {
        let kcal: Double?
        let target: Double?
        /// The computed target, also while an own goal (kcalGoal) replaces it.
        var autoTarget: Double? = nil
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
        /// A hard session shown as an easy one on a hard cycle day; `title`
        /// is the original, back with "vrátit".
        var eased: Eased? = nil
        /// Stretching or sauna: which one, and its saved row to delete it from the day.
        var recovery: String? = nil
        var recoveryId: Int? = nil
        /// A done workout: what it added to the day's strain (Den: "+5,1 tréninkem").
        var strain: Double? = nil
        /// Bedtime: the planned wake time, the end of the dashed night ahead.
        var end: String? = nil
        /// A ride or run still ahead outdoors on a hot day: "Horko 30 °C · …" (src/heat-advice.js).
        var heat: String? = nil

        struct Eased: Decodable, Equatable {
            let title: String
        }

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

    /// The forecast for today from Apple Weather (src/app-today.js todayWeather, src/weatherkit.js).
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
        /// "apple": Apple Weather's forecast, credited with its mark and legal link.
        var source: String? = nil
        /// The detail, from Apple Weather only: the temperature now, the hours
        /// from now to the end of today and the next seven days.
        var now: Now? = nil
        var next: [Hour]? = nil
        var week: [Day]? = nil

        struct Hour: Decodable, Equatable {
            let hour: Int
            let temp: Double
            let code: Double?
            /// Chance of rain, %.
            var rainProb: Double? = nil
        }

        struct Now: Decodable, Equatable {
            let temp: Double
            let code: Double?
            /// Wind now, km/h, and the compass degrees it blows from.
            var wind: Double? = nil
            var windDirection: Double? = nil
            /// False at night (the detail's sky turns to night).
            var daylight: Bool? = nil
        }

        /// One day of the week: its range, its hours (6–22 h) and where a ride and a run belong.
        struct Day: Decodable, Equatable {
            let date: String
            let code: Double?
            let max: Double?
            let min: Double?
            let rainProb: Double?
            let hours: [Hour]?
            let ride: Advice?
            let run: Advice?
        }
    }

    struct Advice: Decodable, Equatable {
        /// "indoor" or "outdoor".
        let environment: String?
        let reason: String?
    }
}

/// A connected service whose access was refused or whose permissions are missing.
struct ConnectionProblem: Decodable, Equatable {
    let provider: String
    let name: String?
    let needsReconnect: Bool?
    let missingPermissions: [JSONValue]?

    /// In the shape of GET /app/api/connections, for the card's rows.
    var asProvider: ConnectionsResponse.Provider {
        ConnectionsResponse.Provider(id: provider, name: name, connected: true, configured: true, missingPermissions: missingPermissions,
                                     metrics: nil, note: nil, needsReconnect: needsReconnect)
    }
}
