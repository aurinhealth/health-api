import Foundation

// The coach's planning from the web app: the week's sessions, the morning
// check-in, the AI review of a day and the records (src/entrypoint.js).

struct CoachCheckIn: Decodable {
    let advice: Advice?

    struct Advice: Decodable, Equatable {
        let id: String?
        let headline: String?
        let reasons: [String]?
        let message: String?
    }
}

struct WeekProposalResponse: Decodable {
    let start: String?
    let proposal: Proposal?

    struct Proposal: Decodable {
        let prefs: JSONValue?
        let items: [Item]?
        let warnings: [Warning]?
        let missingAvailability: Bool?
    }

    struct Item: Decodable, Identifiable, Hashable {
        let date: String
        let sport: String
        let minutes: Int?
        let environment: String?
        let label: String?
        let reason: String?
        let role: String?
        var id: String { date + "|" + sport + "|" + (role ?? "") }

        enum CodingKeys: String, CodingKey { case date, sport, minutes, environment, label, reason, role }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            date = try c.decode(String.self, forKey: .date)
            sport = try c.decode(String.self, forKey: .sport)
            minutes = (try? c.decodeIfPresent(Double.self, forKey: .minutes)).flatMap { $0 }.map { Int($0.rounded()) }
            environment = try? c.decodeIfPresent(String.self, forKey: .environment)
            label = try? c.decodeIfPresent(String.self, forKey: .label)
            reason = try? c.decodeIfPresent(String.self, forKey: .reason)
            role = try? c.decodeIfPresent(String.self, forKey: .role)
        }
    }

    struct Warning: Decodable, Hashable {
        let date: String?
        let text: String?
    }
}

struct DayReviewResponse: Decodable {
    let reviews: [Entry]?

    struct Entry: Decodable {
        let review: Review?
        let error: String?
    }

    struct Review: Decodable {
        /// "go", "adjust", "rest" and the like.
        let verdict: String?
        let headline: String?
        let reasons: [String]?
        let changes: [Change]?
        let missing: String?
    }

    struct Change: Decodable, Hashable {
        let what: String?
        let why: String?
    }
}

struct FitnessInsights: Decodable {
    let cardioFocus: CardioFocus?
    let records: Records?

    struct CardioFocus: Decodable {
        let days: Int?
        let activities: Int?
        let minutes: Int?
        let focus: String?
        let percent: Percent?
    }

    struct Percent: Decodable {
        let low: Double?
        let high: Double?
        let anaerobic: Double?
    }

    struct Records: Decodable {
        let strength: [Strength]?
        let cardio: [String: Record?]?
    }

    struct Record: Decodable {
        let value: Double?
        let unit: String?
        let date: String?
        let name: String?
    }

    struct Strength: Decodable, Identifiable {
        let exercise: String
        let e1rm: Lift?
        let heaviest: Lift?
        let recent: [String]?
        var id: String { exercise }
    }

    struct Lift: Decodable {
        let value: Double?
        let date: String?
        let kg: Double?
        let reps: Double?
    }
}

extension APIClient {
    /// The coach's own word when several signs say to slow down (nil otherwise).
    func coachCheckIn() async throws -> CoachCheckIn.Advice? {
        let r: CoachCheckIn = try await get("/app/api/coach/check-in")
        return r.advice
    }

    /// Hides one check-in advice until the signs change.
    func dismissAdvice(id: String) async throws {
        let _: JSONValue = try await send("/app/api/athlete-state", method: "POST", body: ["dismiss": JSONValue.string(id)])
    }

    /// The sessions the coach would put into the rest of the week.
    func weekProposal(start: String) async throws -> WeekProposalResponse {
        try await send("/app/api/coach/week", method: "POST", body: ["start": JSONValue.string(start)])
    }

    /// Saves the week's plan (days and roles) the proposal came with.
    func saveWeekPlan(start: String, prefs: JSONValue) async throws {
        let _: JSONValue = try await send("/app/api/week-plan?start=" + start, method: "POST", body: prefs)
    }

    /// One planned ride or run of the week: the coach's pick for its day and length.
    func generateWorkout(date: String, sport: String, minutes: Int?, environment: String?) async throws -> GeneratedWorkout {
        var body: JSONObject = ["date": .string(date), "sport": .string(sport), "environment": .string(environment ?? "auto")]
        if let minutes { body["availabilityMinutes"] = .number(Double(minutes)) }
        return try await send("/app/api/workouts/generate", method: "POST", body: body)
    }

    /// The AI's review of a day: what to keep, what to change and why.
    func reviewDay(date: String) async throws -> DayReviewResponse.Review {
        let r: DayReviewResponse = try await send("/app/api/coach/review", method: "POST", body: ["date": JSONValue.string(date)])
        if let review = r.reviews?.first?.review { return review }
        throw APIError.message(r.reviews?.first?.error ?? L10n.tr("Kouč den nezhodnotil."))
    }

    func fitnessInsights() async throws -> FitnessInsights {
        try await get("/app/api/fitness-insights")
    }
}
