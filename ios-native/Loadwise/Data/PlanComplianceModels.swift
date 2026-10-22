import Foundation

// "Splnění plánu" of one done session (GET /app/api/plan-compliance,
// src/plan-compliance-route.js): the percent of the plan that was done and
// what it is made of. A ride or run: load, time and distance against the plan
// and the planned steps against the recorded intervals; a gym day: sets,
// volume and every exercise.

struct PlanCompliance: Decodable, Equatable {
    let percent: Int
    /// "Podle plánu", "Výrazně víc"…, in the app language.
    let word: String?
    /// A ride or run: "tss", "time" and "distance", the plan's only.
    var rows: [Row]? = nil
    var steps: Steps? = nil
    /// "Pásmo prahu 95–100 % FTP, tedy 285–300 W při FTP 300 W."
    var target: String? = nil
    var planName: String? = nil
    /// A gym day.
    var sets: Count? = nil
    var volume: Count? = nil
    var exercises: [Exercise]? = nil

    struct Row: Decodable, Equatable, Identifiable {
        let kind: String
        let done: Double?
        let plan: Double?
        let percent: Int?
        var id: String { kind }
    }

    struct Steps: Decodable, Equatable {
        /// "W" (power) or "%" (a run's % of threshold speed).
        let unit: String
        let inBand: Int
        let of: Int
        let steps: [Step]
    }

    struct Step: Decodable, Equatable {
        let label: String
        let role: String?
        let seconds: Double?
        let plannedSeconds: Double?
        let lo: Double?
        let hi: Double?
        let value: Double?
        /// "8:00 · 291 W", "8:00 · 4:35 /km".
        let text: String?
        /// "in", "under", "over", "missing" or nil (not judged).
        let status: String?
    }

    struct Count: Decodable, Equatable {
        let done: Double
        let plan: Double
    }

    struct Exercise: Decodable, Equatable, Identifiable {
        let name: String
        let plannedSets: Int
        let doneSets: Int
        let sets: [GymSet]
        let percent: Int
        var id: String { name }
    }

    struct GymSet: Decodable, Equatable {
        let kg: Double?
        let reps: Double?
    }
}

extension APIClient {
    private struct ComplianceResponse: Decodable { let compliance: PlanCompliance? }

    /// A ride or run done to a plan; nil when there is nothing to compare.
    func planCompliance(activityId: String, plannedId: String) async throws -> PlanCompliance? {
        let r: ComplianceResponse = try await get("/app/api/plan-compliance?activity=" + Self.query(activityId) + "&planned=" + Self.query(plannedId))
        return r.compliance
    }

    /// A gym day logged in the app (yyyy-MM-dd).
    func gymCompliance(date: String) async throws -> PlanCompliance? {
        let r: ComplianceResponse = try await get("/app/api/plan-compliance?gym=" + Self.query(date))
        return r.compliance
    }
}
