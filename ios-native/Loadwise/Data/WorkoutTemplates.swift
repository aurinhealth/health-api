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

/// A section of a ride or run: a length in time (or distance when running)
/// and the intensity as % of FTP or of threshold pace, low to high.
struct EnduranceStep: Codable, Hashable {
    var label: String
    var seconds: Int?
    var km: Double?
    var low: Int
    var high: Int
    var cadence: Int?

    var json: JSONValue {
        var out: JSONObject = ["label": .string(label), "low": .number(Double(low)), "high": .number(Double(high))]
        if let km { out["km"] = .number(km) } else { out["seconds"] = .number(Double(seconds ?? 60)) }
        if let cadence { out["cadence"] = .number(Double(cadence)) }
        return .object(out)
    }

    /// Minutes, a distance at 5:00 /km at threshold (as the server counts without the athlete's pace).
    func minutes(thresholdPace: Double? = nil) -> Double {
        if let km { return km * (thresholdPace ?? 300) * 100 / Double(low + high) * 2 / 60 }
        return Double(seconds ?? 0) / 60
    }
}

/// One section (repeats 1) or sections done in turn several times.
struct EnduranceBlock: Codable, Hashable {
    var repeats: Int
    var steps: [EnduranceStep]
}

/// A workout without weights, as it is saved and shared: exercises with sets
/// and repetitions for the gym, sections and repeats for a ride or run.
struct WorkoutTemplate: Codable, Hashable {
    var sport = "gym"
    var name: String
    var minutes: Int?
    var exercises: [TemplateExercise]
    var blocks: [EnduranceBlock]? = nil

    var isEndurance: Bool { sport == "ride" || sport == "run" }
    /// Nothing to save or share yet.
    var isEmpty: Bool { isEndurance ? (blocks ?? []).isEmpty : exercises.isEmpty }

    var json: JSONObject {
        var out: JSONObject = ["sport": .string(sport), "name": .string(name)]
        if isEndurance {
            out["blocks"] = .array((blocks ?? []).map { .object(["repeats": .number(Double($0.repeats)), "steps": .array($0.steps.map(\.json))]) })
        } else {
            out["exercises"] = .array(exercises.map { .object(["name": .string($0.name), "sets": .number(Double($0.sets)), "reps": .string($0.reps)]) })
            if let minutes { out["minutes"] = .number(Double(minutes)) }
        }
        return out
    }

    /// The length of a ride or run in minutes.
    func enduranceMinutes(thresholdPace: Double? = nil) -> Double {
        (blocks ?? []).reduce(0) { sum, b in sum + Double(b.repeats) * b.steps.reduce(0) { $0 + $1.minutes(thresholdPace: thresholdPace) } }
    }

    /// The sections as the library's step rows, for its chart and rows
    /// (WorkoutProfile, StepBlockRow); watts and paces when they are known.
    func profile(ftp: Double? = nil, thresholdPace: Double? = nil) -> [PlannedWorkout.Block] {
        let run = sport == "run"
        let blocks: [JSONValue] = (self.blocks ?? []).map { b in
            .object(["repeats": .number(Double(b.repeats)), "steps": .array(b.steps.map { s in
                var row: JSONObject = ["durationSeconds": .number((s.minutes(thresholdPace: thresholdPace) * 60).rounded()),
                                       "percentLow": .number(Double(s.low)), "percentHigh": .number(Double(s.high))]
                if !s.label.isEmpty { row["note"] = .string(s.label) }
                if let cadence = s.cadence, !run { row["cadence"] = .number(Double(cadence)) }
                if !run, let ftp { row["wattsLow"] = .number((ftp * Double(s.low) / 100).rounded()); row["wattsHigh"] = .number((ftp * Double(s.high) / 100).rounded()) }
                if run, let pace = thresholdPace { row["paceSlow"] = .number((pace * 100 / Double(s.low)).rounded()); row["paceFast"] = .number((pace * 100 / Double(s.high)).rounded()) }
                return .object(row)
            })])
        }
        guard let data = try? JSONEncoder().encode(blocks) else { return [] }
        return (try? JSONDecoder().decode([PlannedWorkout.Block].self, from: data)) ?? []
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
                            TemplateExercise(name: e.name, sets: min(e.workCount, 10), reps: cleanReps(reps(e.sets.first { !$0.warmup })))
                        })
    }

    /// The planned repetitions of a set, or the ones done when none were planned.
    private static func reps(_ set: GymSet?) -> String {
        set?.plannedReps?.nilIfBlank ?? set?.reps?.nilIfBlank ?? ""
    }

    static func cleanReps(_ text: String) -> String {
        let t = text.replacingOccurrences(of: "-", with: "–").trimmingCharacters(in: .whitespaces)
        return TemplateExercise.validReps(t) ? t : "10"
    }

    var summary: String {
        if isEndurance { return Fmt.duration(minutes ?? Int(enduranceMinutes().rounded())) }
        var parts = [L10n.f("%@ %@", String(exercises.count), Fmt.plural(exercises.count, "cvik", "cviky", "cviků"))]
        if let minutes { parts.append(Fmt.duration(minutes)) }
        return parts.joined(separator: " · ")
    }
}

/// A workout in Moje tréninky (source "own") or Od přátel ("friend").
struct SavedWorkout: Decodable, Identifiable, Hashable {
    static func == (a: Self, b: Self) -> Bool { a.id == b.id && a.name == b.name && a.seen == b.seen }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

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
    var blocks: [EnduranceBlock]? = nil
    /// A ride's or run's rows with the athlete's watts or paces.
    var steps: [PlannedWorkout.Block]? = nil
    let groups: [String]?

    var fromFriend: Bool { source == "friend" }
    var template: WorkoutTemplate { WorkoutTemplate(sport: sport, name: name, minutes: minutes, exercises: exercises, blocks: blocks) }
}

/// A shared link as the app opens it.
struct SharedWorkout: Decodable, Hashable {
    static func == (a: Self, b: Self) -> Bool { a.id == b.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    let id: String
    let sport: String
    let name: String
    let fromName: String?
    let date: String?
    let own: Bool
    let minutes: Int?
    let exercises: [TemplateExercise]
    var blocks: [EnduranceBlock]? = nil
    var steps: [PlannedWorkout.Block]? = nil
    let groups: [String]?

    var template: WorkoutTemplate { WorkoutTemplate(sport: sport, name: name, minutes: minutes, exercises: exercises, blocks: blocks) }
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
    let athlete: AthleteThresholds?
}

/// FTP and threshold pace (s/km) for watts and paces in the ride and run editor.
struct AthleteThresholds: Decodable, Hashable {
    var ftp: Double?
    var runThresholdPace: Double?
}

private struct DescribeResponse: Decodable {
    let template: WorkoutTemplate
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
    func myWorkouts() async throws -> (workouts: [SavedWorkout], unseen: Int, athlete: AthleteThresholds) {
        let r: SavedWorkoutsResponse = try await get("/app/api/my-workouts")
        return (r.workouts ?? [], r.unseen ?? 0, r.athlete ?? AthleteThresholds())
    }

    /// A library ride or run kept in Moje tréninky.
    func saveLibraryWorkout(id: String) async throws -> SavedWorkout? {
        let r: SavedWorkoutResponse = try await send("/app/api/my-workouts", method: "POST", body: ["fromLibrary": JSONValue.string(id)])
        return r.workout
    }

    /// A saved ride or run in the calendar and Intervals.icu.
    func scheduleSavedWorkout(id: String, date: String, indoor: Bool) async throws {
        let _: JSONValue = try await send("/app/api/my-workouts/" + id + "/schedule", method: "POST",
                                          body: ["date": JSONValue.string(date), "environment": .string(indoor ? "indoor" : "outdoor")])
    }

    /// A planned ride or run, or the plan a done one fulfilled, as an own workout; not saved yet.
    func templateFromPlanned(eventId: String) async throws -> WorkoutTemplate {
        let r: DescribeResponse = try await get("/app/api/my-workouts/from-planned?id=" + Self.query(eventId))
        return r.template
    }

    /// A ride or run put together by AI from the athlete's words; not saved yet.
    func describeWorkout(sport: String, text: String) async throws -> WorkoutTemplate {
        let r: DescribeResponse = try await send("/app/api/my-workouts/describe", method: "POST",
                                                 body: ["sport": JSONValue.string(sport), "text": .string(text)], timeout: 60)
        return r.template
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

extension WorkoutTemplate {
    /// A ride or run comes without exercises, a gym workout without blocks.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sport = try c.decodeIfPresent(String.self, forKey: .sport) ?? "gym"
        name = try c.decode(String.self, forKey: .name)
        minutes = try c.decodeIfPresent(Int.self, forKey: .minutes)
        exercises = try c.decodeIfPresent([TemplateExercise].self, forKey: .exercises) ?? []
        blocks = try c.decodeIfPresent([EnduranceBlock].self, forKey: .blocks)
    }
}
