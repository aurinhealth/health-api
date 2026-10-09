import Foundation

// One food of the diary changed after it was logged (/app/api/food/entry,
// src/food-entry-management.js), and the rating of a done workout with the
// coach's reply (/app/api/workouts/feedback, /app/api/coach/reflections).
extension APIClient {
    // MARK: Food entries

    /// A new amount (in the entry's own unit; the server rescales kcal and
    /// macros), another meal of the day or another day. Nil keeps the value.
    func updateFoodEntry(id: Int, amount: Double? = nil, mealType: String? = nil, date: String? = nil) async throws {
        var body: JSONObject = ["id": .number(Double(id))]
        if let amount { body["amount_g"] = .number(amount) }
        if let mealType { body["mealType"] = .string(mealType) }
        if let date { body["date"] = .string(date) }
        let _: JSONValue = try await send("/app/api/food/entry", method: "PATCH", body: body)
    }

    /// The same food once more on another day.
    func copyFoodEntry(id: Int, to date: String) async throws {
        let _: JSONValue = try await send("/app/api/food/entry", method: "POST",
                                          body: ["id": JSONValue.number(Double(id)), "targetDate": .string(date)])
    }

    // MARK: Workout ratings

    /// Library workouts put in the calendar, with their rating when there is one.
    func scheduledWorkouts() async throws -> [ScheduledWorkout] {
        struct Response: Decodable { let workouts: [ScheduledWorkout]? }
        let r: Response = try await get("/app/api/workouts/scheduled")
        return r.workouts ?? []
    }

    /// RPE and a note for a planned library workout: the server pairs it with
    /// the activity, writes the RPE to Intervals.icu and asks the coach.
    func workoutFeedback(workoutId: String, scheduledDate: String, rpe: Int, notes: String, minutes: Int? = nil) async throws -> WorkoutFeedbackResult {
        var body: JSONObject = ["workoutId": .string(workoutId), "scheduledDate": .string(scheduledDate),
                                "rpe": .number(Double(rpe)), "notes": .string(notes)]
        // A session written into the app by hand has no activity to pair with.
        if let minutes {
            body["manualComplete"] = .bool(true)
            body["minutes"] = .number(Double(minutes))
        }
        return try await send("/app/api/workouts/feedback", method: "POST", body: body)
    }

    /// RPE and a note for any session; the coach answers at once.
    func coachReflection(date: String, rpe: Int, notes: String) async throws -> CoachReflection? {
        struct Response: Decodable { let reflection: CoachReflection? }
        let r: Response = try await send("/app/api/coach/reflections", method: "POST",
                                         body: ["date": JSONValue.string(date), "rpe": .number(Double(rpe)), "notes": .string(notes)])
        return r.reflection
    }

    /// The coach's notes on one day, the newest first.
    func coachReflections(date: String) async throws -> [CoachReflection] {
        struct Response: Decodable { let reflections: [CoachReflection]? }
        let r: Response = try await get("/app/api/coach/reflections?date=" + date)
        return r.reflections ?? []
    }
}
