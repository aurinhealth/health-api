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
        /// "memory_check": a passing memory ("bolí mě koleno") to confirm or forget.
        var kind: String? = nil
        var memory: String? = nil
    }
}

private struct CoachMemoriesResponse: Decodable {
    let memories: [CoachMemory]?
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
        /// The n-th session of this sport that day in the week plan.
        let slot: Int?
        var id: String { date + "|" + sport + "|" + String(slot ?? 0) + "|" + (role ?? "") }

        enum CodingKeys: String, CodingKey { case date, sport, minutes, environment, label, reason, role, slot }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            date = try c.decode(String.self, forKey: .date)
            sport = try c.decode(String.self, forKey: .sport)
            minutes = (try? c.decodeIfPresent(Double.self, forKey: .minutes)).flatMap { $0 }.map { Int($0.rounded()) }
            environment = try? c.decodeIfPresent(String.self, forKey: .environment)
            label = try? c.decodeIfPresent(String.self, forKey: .label)
            reason = try? c.decodeIfPresent(String.self, forKey: .reason)
            role = try? c.decodeIfPresent(String.self, forKey: .role)
            slot = (try? c.decodeIfPresent(Double.self, forKey: .slot)).flatMap { $0 }.map { Int($0) }
        }
    }

    struct Warning: Decodable, Hashable {
        let date: String?
        let text: String?
    }
}

/// POST /app/api/coach/week-ai (src/week-ai.js): the AI's week with its
/// summary; `ai` is false when the rules made it.
struct WeekAIResponse: Decodable {
    let start: String?
    let ai: Bool?
    let summary: String?
    let items: [WeekAIItem]?
    let warnings: [WeekProposalResponse.Warning]?
    let message: String?
}

struct WeekAIItem: Decodable {
    let date: String
    let sport: String
    let minutes: Int?
    let environment: String?
    let kind: String?
    let focus: String?
    let label: String?
    let reason: String?
    let role: String?

    enum CodingKeys: String, CodingKey { case date, sport, minutes, environment, kind, focus, label, reason, role }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = try c.decode(String.self, forKey: .date)
        sport = try c.decode(String.self, forKey: .sport)
        minutes = (try? c.decodeIfPresent(Double.self, forKey: .minutes)).flatMap { $0 }.map { Int($0.rounded()) }
        environment = try? c.decodeIfPresent(String.self, forKey: .environment)
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
        focus = try? c.decodeIfPresent(String.self, forKey: .focus)
        label = try? c.decodeIfPresent(String.self, forKey: .label)
        reason = try? c.decodeIfPresent(String.self, forKey: .reason)
        role = try? c.decodeIfPresent(String.self, forKey: .role)
    }
}

/// GET/POST /app/api/coach/revision (src/week-revision.js).
struct WeekRevisionResponse: Decodable {
    let revision: WeekRevision?
}

struct WeekRevision: Decodable, Equatable {
    let date: String
    /// "pending", "applied" (or "kept", which the server does not show again).
    let status: String?
    let summary: String?
    let changes: [Change]?

    struct Change: Decodable, Equatable, Identifiable {
        let eventId: String
        let date: String
        let sport: String
        let from: Side?
        let to: Side?
        let reason: String?
        let applied: Bool?
        var id: String { eventId }
    }

    struct Side: Decodable, Equatable {
        let name: String?
        let minutes: Int?

        enum CodingKeys: String, CodingKey { case name, minutes }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            name = try? c.decodeIfPresent(String.self, forKey: .name)
            minutes = (try? c.decodeIfPresent(Double.self, forKey: .minutes)).flatMap { $0 }.map { Int($0.rounded()) }
        }
    }
}

/// POST /app/api/workouts/adjust: the session's new day, length, place and kind.
struct AdjustResponse: Decodable {
    let session: AdjustedSession?
    let message: String?
}

struct AdjustedSession: Decodable {
    let date: String
    /// nil from an older server: the sport stays.
    let sport: String?
    let minutes: Int
    let environment: String?
    let kind: String?
    let focus: String?
    let note: String?

    enum CodingKeys: String, CodingKey { case date, sport, minutes, environment, kind, focus, note }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = try c.decode(String.self, forKey: .date)
        sport = try? c.decodeIfPresent(String.self, forKey: .sport)
        minutes = Int(((try? c.decode(Double.self, forKey: .minutes)) ?? 60).rounded())
        environment = try? c.decodeIfPresent(String.self, forKey: .environment)
        kind = try? c.decodeIfPresent(String.self, forKey: .kind)
        focus = try? c.decodeIfPresent(String.self, forKey: .focus)
        note = try? c.decodeIfPresent(String.self, forKey: .note)
    }
}

/// GET /app/api/week-plan (src/week-planner.js): the week's plan with the
/// time per weekday, and the load the week aims for.
struct WeekPlanResponse: Decodable {
    let start: String?
    /// Kept whole: the editor changes a few keys and sends the object back.
    let prefs: JSONValue?
    let targets: Targets?

    struct Targets: Decodable {
        let status: String?
        let target: Double?
        let committed: Double?
        let recovery: Bool?
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

    /// What the coach remembers about the athlete.
    func coachMemories() async throws -> [CoachMemory] {
        let r: CoachMemoriesResponse = try await get("/app/api/athlete-state")
        return r.memories ?? []
    }

    @discardableResult
    func addMemory(_ text: String) async throws -> [CoachMemory] {
        try await changeMemories(["memory": .string(text)])
    }

    @discardableResult
    func editMemory(from: String, to: String) async throws -> [CoachMemory] {
        try await changeMemories(["edit": .object(["from": .string(from), "to": .string(to)])])
    }

    @discardableResult
    func forgetMemory(_ text: String) async throws -> [CoachMemory] {
        try await changeMemories(["forget": .string(text)])
    }

    /// A passing memory still holds: the coach asks again in two weeks.
    @discardableResult
    func keepMemory(_ text: String) async throws -> [CoachMemory] {
        try await changeMemories(["keep": .string(text)])
    }

    private func changeMemories(_ body: [String: JSONValue]) async throws -> [CoachMemory] {
        let r: CoachMemoriesResponse = try await send("/app/api/athlete-state", method: "POST", body: body)
        return r.memories ?? []
    }

    /// The sessions the coach would put into the rest of the week.
    func weekProposal(start: String) async throws -> WeekProposalResponse {
        try await send("/app/api/coach/week", method: "POST", body: ["start": JSONValue.string(start)])
    }

    /// The usual week's plan, or with `start` the plan of that one week.
    func weekPlan(start: String?) async throws -> WeekPlanResponse {
        try await get("/app/api/week-plan" + (start.map { "?start=" + $0 } ?? ""))
    }

    /// Saves the plan (days, roles and time per weekday): for one week with
    /// `start`, else as the usual week.
    @discardableResult
    func saveWeekPlan(start: String?, prefs: JSONValue) async throws -> WeekPlanResponse {
        try await send("/app/api/week-plan" + (start.map { "?start=" + $0 } ?? ""), method: "POST", body: prefs)
    }

    /// Drops one week's own plan, so the usual week applies again.
    @discardableResult
    func resetWeekPlan(start: String) async throws -> WeekPlanResponse {
        try await send("/app/api/week-plan?start=" + start, method: "DELETE", body: JSONObject())
    }

    /// One planned ride or run of the week: the coach's pick for its day and length.
    func generateWorkout(date: String, sport: String, minutes: Int?, environment: String?) async throws -> GeneratedWorkout {
        var body: JSONObject = ["date": .string(date), "sport": .string(sport), "environment": .string(environment ?? "auto")]
        if let minutes { body["availabilityMinutes"] = .number(Double(minutes)) }
        return try await send("/app/api/workouts/generate", method: "POST", body: body)
    }

    /// One session of the week plan: its kind (`focus`, src/week-ai.js FOCUS_OF)
    /// and length as the athlete or the AI chose them, or an existing workout
    /// made `resizeTo` minutes long.
    func generateWeekSession(date: String, sport: String, minutes: Int, environment: String?, focus: String?,
                             resize workoutId: String? = nil) async throws -> GeneratedWorkout {
        var body: JSONObject = ["date": .string(date), "sport": .string(sport), "environment": .string(environment ?? "auto"),
                                "availabilityMinutes": .number(Double(minutes)), "userInitiated": .bool(true)]
        if let focus { body["focus"] = .string(focus) }
        if let workoutId { body["workoutId"] = .string(workoutId); body["resizeTo"] = .number(Double(minutes)) }
        return try await send("/app/api/workouts/generate", method: "POST", body: body)
    }

    /// "Revize po tréninku": the coach's changes to the next sessions after
    /// today's (or a waiting yesterday's) ride or run; nil when there is none.
    func weekRevision() async throws -> WeekRevision? {
        let r: WeekRevisionResponse = try await get("/app/api/coach/revision")
        return r.revision
    }

    /// "Upravit" (apply) or "Nechat" (keep).
    func decideRevision(date: String, apply: Bool) async throws -> WeekRevision? {
        let r: WeekRevisionResponse = try await send("/app/api/coach/revision", method: "POST",
                                                     body: ["date": JSONValue.string(date), "decision": .string(apply ? "apply" : "keep")])
        return r.revision
    }

    /// "Navrhne AI": the whole week from the AI, or the rules' proposal without it.
    /// `correction` with `previous` fixes the AI's last proposal ("Opravit návrh").
    func weekAI(start: String, note: String, correction: String? = nil, previous: [WeekSessionDraft] = []) async throws -> WeekAIResponse {
        var body: JSONObject = ["start": .string(start), "note": .string(note)]
        if let correction {
            body["correction"] = .string(correction)
            body["previous"] = .array(previous.map { s in
                var x: JSONObject = ["date": .string(s.date), "sport": .string(s.sport), "minutes": .number(Double(s.minutes))]
                if let environment = s.environment { x["environment"] = .string(environment) }
                if let kind = s.kind { x["kind"] = .string(kind) }
                return .object(x)
            })
        }
        return try await send("/app/api/coach/week-ai", method: "POST", body: body)
    }

    /// "Upravit s AI": a quick chip ("shorter", "easier", "harder", "indoor") or
    /// the athlete's own words change one session of the week.
    func adjustSession(_ session: WeekSessionDraft, chip: String?, text: String?, others: [WeekSessionDraft]) async throws -> AdjustedSession {
        var body: JSONObject = ["date": .string(session.date), "sport": .string(session.sport), "minutes": .number(Double(session.minutes)),
                                "environment": .string(session.environment ?? "outdoor")]
        if let kind = session.kind { body["kind"] = .string(kind) }
        if let system = session.workout?.primary_system { body["system"] = .string(system) }
        if let chip { body["chip"] = .string(chip) }
        if let text { body["text"] = .string(text) }
        body["others"] = .array(others.map { o in
            var x: JSONObject = ["date": .string(o.date), "sport": .string(o.sport)]
            if let kind = o.kind { x["kind"] = .string(kind) }
            if let system = o.workout?.primary_system { x["system"] = .string(system) }
            return .object(x)
        })
        let r: AdjustResponse = try await send("/app/api/workouts/adjust", method: "POST", body: body)
        guard let changed = r.session else { throw APIError.message(r.message ?? L10n.tr("Úpravu se nepodařilo udělat.")) }
        return changed
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
