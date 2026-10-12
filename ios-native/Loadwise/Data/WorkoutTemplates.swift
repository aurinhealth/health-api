import Foundation

// Moje tréninky, Od přátel and shared links (src/workout-templates.js).

/// One exercise of a saved workout: its sets and repetitions ("8", "8–12", "30 s"), no weights.
struct TemplateExercise: Codable, Hashable {
    var name: String
    var sets: Int
    var reps: String

    /// Repetitions the server takes: a number, a range or a time.
    static func validReps(_ text: String) -> Bool {
        let t = text.replacingOccurrences(of: "-", with: "–").trimmingCharacters(in: .whitespaces)
        return t.range(of: #"^\d{1,3}(?:–\d{1,3})?(?: ?s)?$"#, options: .regularExpression) != nil
    }
}

/// A workout without weights, as it is saved and shared.
struct WorkoutTemplate: Codable, Hashable {
    var sport = "gym"
    var name: String
    var minutes: Int?
    var exercises: [TemplateExercise]

    var json: JSONObject {
        var out: JSONObject = [
            "sport": .string(sport), "name": .string(name),
            "exercises": .array(exercises.map { .object(["name": .string($0.name), "sets": .number(Double($0.sets)), "reps": .string($0.reps)]) })
        ]
        if let minutes { out["minutes"] = .number(Double(minutes)) }
        return out
    }

    /// The day's plan as a workout: the work sets of each exercise in order,
    /// the repetitions of its first work set.
    static func from(_ p: GymProposal, minutes: Int?) -> WorkoutTemplate {
        // The repetitions of the first work set: a warm-up set's are fewer.
        var reps: [String: String] = [:]
        for row in p.rows where row.count > 4 && (row[0].string ?? "WORK").uppercased() != "WARMUP" {
            if let name = row[1].string, reps[name] == nil { reps[name] = row[4].string ?? "" }
        }
        return WorkoutTemplate(name: p.planName, minutes: minutes,
                               exercises: p.exercises.filter { $0.sets > 0 }.map { TemplateExercise(name: $0.name, sets: min($0.sets, 10), reps: cleanReps(reps[$0.name] ?? $0.reps)) })
    }

    static func from(_ day: GymDay, minutes: Int?) -> WorkoutTemplate {
        WorkoutTemplate(name: day.planName ?? L10n.tr("Silový trénink"), minutes: minutes,
                        exercises: day.exercises.filter { $0.workCount > 0 }.map { e in
                            TemplateExercise(name: e.name, sets: min(e.workCount, 10), reps: cleanReps(e.sets.first { !$0.warmup }?.plannedReps ?? ""))
                        })
    }

    static func cleanReps(_ text: String) -> String {
        let t = text.replacingOccurrences(of: "-", with: "–").trimmingCharacters(in: .whitespaces)
        return TemplateExercise.validReps(t) ? t : "10"
    }

    var summary: String {
        var parts = [L10n.f("%@ %@", String(exercises.count), Fmt.plural(exercises.count, "cvik", "cviky", "cviků"))]
        if let minutes { parts.append(Fmt.duration(minutes)) }
        return parts.joined(separator: " · ")
    }
}

/// A workout in Moje tréninky (source "own") or Od přátel ("friend").
struct SavedWorkout: Decodable, Identifiable, Hashable {
    let id: String
    let sport: String
    let name: String
    let source: String
    let fromName: String?
    let shareId: String?
    let date: String?
    let seen: Bool
    let minutes: Int?
    let exercises: [TemplateExercise]
    let groups: [String]?

    var fromFriend: Bool { source == "friend" }
    var template: WorkoutTemplate { WorkoutTemplate(sport: sport, name: name, minutes: minutes, exercises: exercises) }
}

/// A shared link as the app opens it.
struct SharedWorkout: Decodable, Hashable {
    let id: String
    let sport: String
    let name: String
    let fromName: String?
    let date: String?
    let own: Bool
    let minutes: Int?
    let exercises: [TemplateExercise]
    let groups: [String]?

    var template: WorkoutTemplate { WorkoutTemplate(sport: sport, name: name, minutes: minutes, exercises: exercises) }
}

/// A saved or received workout to plan for a day (GymBuilderView).
struct TemplatePlanRequest: Hashable {
    var template: WorkoutTemplate
    var date: String?
    var fromName: String?
}

private struct SavedWorkoutsResponse: Decodable {
    let workouts: [SavedWorkout]?
    let unseen: Int?
}

private struct SavedWorkoutResponse: Decodable {
    let status: String?
    let workout: SavedWorkout?
}

private struct ShareResponse: Decodable {
    let id: String
    let url: String
}

private struct SharedWorkoutResponse: Decodable {
    let share: SharedWorkout
}

extension APIClient {
    func myWorkouts() async throws -> (workouts: [SavedWorkout], unseen: Int) {
        let r: SavedWorkoutsResponse = try await get("/app/api/my-workouts")
        return (r.workouts ?? [], r.unseen ?? 0)
    }

    func saveWorkout(_ template: WorkoutTemplate) async throws -> SavedWorkout? {
        let r: SavedWorkoutResponse = try await send("/app/api/my-workouts", method: "POST", body: template.json)
        return r.workout
    }

    func updateWorkout(id: String, _ template: WorkoutTemplate) async throws -> SavedWorkout? {
        let r: SavedWorkoutResponse = try await send("/app/api/my-workouts/" + id, method: "PUT", body: template.json)
        return r.workout
    }

    func deleteWorkout(id: String) async throws {
        let _: JSONValue = try await send("/app/api/my-workouts/" + id, method: "DELETE", body: JSONObject())
    }

    /// A friend's workout into Moje tréninky, to change it there.
    func copyWorkout(id: String) async throws -> SavedWorkout? {
        let r: SavedWorkoutResponse = try await send("/app/api/my-workouts", method: "POST", body: ["copyOf": JSONValue.string(id)])
        return r.workout
    }

    /// A link opened in the app lands in Od přátel (once); nil for one's own link.
    @discardableResult
    func receiveShare(id: String) async throws -> SavedWorkout? {
        let r: SavedWorkoutResponse = try await send("/app/api/my-workouts", method: "POST", body: ["fromShare": JSONValue.string(id), "seen": .bool(true)])
        return r.workout
    }

    func markFriendWorkoutsSeen() async throws {
        let _: JSONValue = try await send("/app/api/my-workouts/seen", method: "POST", body: JSONObject())
    }

    /// The link to a workout, with the preview image the app drew (PNG).
    func shareWorkout(_ template: WorkoutTemplate, date: String?, image: Data?) async throws -> URL {
        var body = template.json
        if let date { body["date"] = .string(date) }
        if let image { body["image"] = .string(image.base64EncodedString()) }
        let r: ShareResponse = try await send("/app/api/shares", method: "POST", body: body)
        guard let url = URL(string: r.url) else { throw APIError.message(L10n.tr("Odkaz se nepodařilo vytvořit.")) }
        return url
    }

    func sharedWorkout(id: String) async throws -> SharedWorkout {
        let r: SharedWorkoutResponse = try await get("/app/api/shares/" + id)
        return r.share
    }

    /// The workout for a day with the athlete's own weights: a proposal to confirm (confirmGym).
    func planTemplate(_ request: TemplatePlanRequest, date: String) async throws -> GymProposal {
        var body: JSONObject = ["template": .object(request.template.json), "date": .string(date)]
        if let from = request.fromName { body["fromName"] = .string(from) }
        let r: GymPreviewResponse = try await send("/app/api/gym/template", method: "POST", body: body)
        guard let plan = r.plan else { throw APIError.message(r.message ?? L10n.tr("Trénink se nepodařilo sestavit.")) }
        return GymProposal(draftId: r.draftId, planName: plan.planName ?? request.template.name, rationale: plan.rationale, rows: plan.rows, muscles: r.muscles ?? [:])
    }
}
