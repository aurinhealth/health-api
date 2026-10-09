import Foundation

// The gym builder, equipment, the workout library, drinks and the first setup.
extension APIClient {
    // MARK: Equipment

    func gymEquipment() async throws -> GymEquipment {
        try await get("/app/api/gym/equipment")
    }

    func saveGymEquipment(equipment: String, stations: [String], gymName: String, gymUrl: String, dumbbellWeights: [Double] = []) async throws -> GymEquipment {
        try await send("/app/api/gym/equipment", method: "POST",
                       body: ["equipment": JSONValue.string(equipment), "stations": .array(stations.map { .string($0) }),
                              "gymName": .string(gymName), "gymUrl": .string(gymUrl),
                              "dumbbellWeights": .array(dumbbellWeights.map { .number($0) })])
    }

    /// AI reads photos of the gym (JPEG) or its web page and picks the stations.
    func detectGymEquipment(photos: [Data], url: String) async throws -> GymDetectResult {
        var body: JSONObject = ["images": .array(photos.map { .string("data:image/jpeg;base64," + $0.base64EncodedString()) })]
        if !url.isEmpty { body["url"] = .string(url) }
        return try await send("/app/api/gym/equipment/detect", method: "POST", body: body)
    }

    // MARK: Exercises and the AI builder

    func gymExercises() async throws -> [GymCatalogExercise] {
        struct Response: Decodable { let exercises: [GymCatalogExercise]? }
        let r: Response = try await get("/app/api/gym/exercises")
        return r.exercises ?? []
    }

    /// Muscle group id → weight for each exercise (the body figure).
    func gymMuscles(names: [String]) async throws -> [String: [String: Double]] {
        struct Response: Decodable { let muscles: [String: [String: Double]]? }
        let list = String(data: try JSONEncoder().encode(names), encoding: .utf8) ?? "[]"
        let r: Response = try await get("/app/api/gym/muscles?names=" + Self.query(list))
        return r.muscles ?? [:]
    }

    /// A proposal for the day (not saved): the length, and either a focus
    /// ("upper", "lower") or 1–5 muscle groups to work.
    func previewGym(date: String, minutes: Int, focus: String?, muscles: [String]) async throws -> GymProposal {
        var body: JSONObject = ["date": .string(date), "durationMinutes": .number(Double(minutes)), "preview": .bool(true), "userInitiated": .bool(true)]
        if !muscles.isEmpty { body["focusMuscles"] = .array(muscles.map { .string($0) }) }
        else if let focus { body["focus"] = .string(focus) }
        let r: GymPreviewResponse = try await send("/app/api/gym/generate", method: "POST", body: body)
        guard let plan = r.plan else { throw APIError.message(r.message ?? L10n.tr("Trénink se nepodařilo sestavit.")) }
        return GymProposal(draftId: r.draftId, planName: plan.planName ?? "Silový trénink", rationale: plan.rationale, rows: plan.rows, muscles: r.muscles ?? [:])
    }

    /// The AI changes the proposal by the athlete's words ("bez dřepů, víc ramen").
    func adjustGym(rows: [[JSONValue]], request: String) async throws -> (rows: [[JSONValue]], answer: String?, muscles: [String: [String: Double]]) {
        let r: GymAdjustResponse = try await send("/app/api/gym/adjust", method: "POST",
                                                  body: ["rows": JSONValue.array(rows.map { .array($0) }), "request": .string(request)])
        return (r.rows ?? rows, r.answer, r.muscles ?? [:])
    }

    /// Saves the proposal as the day's plan (and to Intervals.icu).
    func confirmGym(draftId: Int, rows: [[JSONValue]]) async throws {
        let _: JSONValue = try await send("/app/api/gym/confirm", method: "POST",
                                          body: ["draftId": JSONValue.number(Double(draftId)), "rows": .array(rows.map { .array($0) })])
    }

    // MARK: Workout library

    /// The ride or run library: a length with its ± tolerance, the type and a
    /// difficulty band (1–10, src/workout-model.js difficultyFromStructure).
    func searchWorkouts(sport: String, minutes: Int?, tolerance: Int? = nil, system: String?, indoor: Bool,
                        difficulty: ClosedRange<Double>? = nil) async throws -> [LibraryWorkout] {
        var path = "/app/api/workouts/search?sport=" + sport + "&environment=" + (indoor ? "indoor" : "outdoor") + "&limit=40"
        if let minutes { path += "&duration=\(minutes)" }
        if let tolerance, minutes != nil { path += "&durationTolerance=\(tolerance)" }
        if let system { path += "&system=" + system }
        if let difficulty { path += "&minDifficulty=\(difficulty.lowerBound)&maxDifficulty=\(difficulty.upperBound)" }
        let r: WorkoutSearchResponse = try await get(path)
        return r.workouts
    }

    /// The coach's workout for today (POST /app/api/workouts/generate): the
    /// library workout that fits the readiness, load and week plan best.
    /// Another variant gives the next of its few best picks.
    func generateWorkout(sport: String, minutes: Int?, indoor: Bool, variant: Int) async throws -> GeneratedWorkout {
        var body: JSONObject = ["date": .string(AppModel.localDate(Date())), "sport": .string(sport),
                                "environment": .string(indoor ? "indoor" : "outdoor"), "variant": .number(Double(variant))]
        if let minutes { body["availabilityMinutes"] = .number(Double(minutes)); body["userInitiated"] = .bool(true) }
        return try await send("/app/api/workouts/generate", method: "POST", body: body)
    }

    func scheduleWorkout(id: String, date: String, indoor: Bool) async throws {
        let _: JSONValue = try await send("/app/api/workouts/schedule", method: "POST",
                                          body: ["workoutId": JSONValue.string(id), "date": .string(date), "confirm": .bool(true),
                                                 "environment": .string(indoor ? "indoor" : "outdoor")])
    }

    // MARK: Drinks

    func deleteFluid(id: Int) async throws {
        let _: JSONValue = try await send("/app/api/fluids?id=\(id)", method: "DELETE", body: JSONObject())
    }

    // MARK: First setup

    func onboarding() async throws -> OnboardingStatus {
        try await get("/app/api/onboarding")
    }

    func onboardingCompleted() async throws -> Bool {
        try await onboarding().completed ?? false
    }

    func completeOnboarding(profile: JSONObject, weightKg: Double?, training: JSONObject) async throws {
        var body: JSONObject = ["profile": .object(profile), "training": .object(training)]
        if let weightKg { body["weightKg"] = .number(weightKg) }
        let _: JSONValue = try await send("/app/api/onboarding", method: "POST", body: body)
    }
}

// The training calendar and drinks changed afterwards.
extension APIClient {
    func trainingCalendar(start: String, end: String) async throws -> TrainingCalendar {
        try await get("/app/api/training/calendar?start=" + start + "&end=" + end)
    }

    func updateFluid(id: Int, ml: Int, kind: String) async throws {
        let _: JSONValue = try await send("/app/api/fluids", method: "PATCH",
                                          body: ["id": JSONValue.number(Double(id)), "ml": .number(Double(ml)), "kind": .string(kind)])
    }
}
