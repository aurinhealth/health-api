import Foundation

// A saved gym plan without its Intervals.icu event (POST /app/api/gym):
// cancel it, put it back, move it to another day. A session that is an
// Intervals.icu event goes through movePlanned / deletePlanned instead.
extension APIClient {
    /// The plan and the logged sets stay saved; the session leaves the week.
    func cancelGym(date: String) async throws {
        let _: JSONValue = try await send("/app/api/gym", method: "POST",
                                          body: ["date": JSONValue.string(date), "action": .string("cancel")])
    }

    func uncancelGym(date: String) async throws {
        let _: JSONValue = try await send("/app/api/gym", method: "POST",
                                          body: ["date": JSONValue.string(date), "action": .string("uncancel")])
    }

    /// To today or later; the server refuses (409) a plan with logged sets or a day that has its own plan.
    func moveGym(from: String, to: String) async throws {
        let _: JSONValue = try await send("/app/api/gym", method: "POST",
                                          body: ["date": JSONValue.string(from), "action": .string("move"), "to": .string(to)])
    }
}

// MARK: - Feedback (POST /app/api/feedback/exercise and /workout, src/exercise-feedback.js)

/// How well a generated workout fitted: "good", "ok" or "bad", with an optional note.
struct WorkoutRating: Decodable, Equatable {
    let date: String
    let sessionId: String
    let sport: String?
    let rating: String
    let text: String?
}

extension APIClient {
    /// Thumbs up (true), down (false) or none (nil) per exercise; the gym plans
    /// leave out the disliked ones.
    func rateExercises(_ items: [(exercise: String, liked: Bool?)]) async throws {
        let list: [JSONValue] = items.map { (item: (exercise: String, liked: Bool?)) -> JSONValue in
            let liked: JSONValue = item.liked.map { JSONValue.bool($0) } ?? JSONValue.null
            return JSONValue.object(["exercise": JSONValue.string(item.exercise), "liked": liked])
        }
        let _: JSONValue = try await send("/app/api/feedback/exercise", method: "POST", body: ["items": JSONValue.array(list)])
    }

    func rateWorkout(date: String, sessionId: String, sport: String, rating: String, text: String) async throws {
        let body: JSONObject = ["date": .string(date), "sessionId": .string(sessionId), "sport": .string(sport),
                                "rating": .string(rating), "text": .string(text)]
        let _: JSONValue = try await send("/app/api/feedback/workout", method: "POST", body: body)
    }

    func workoutRatings(date: String) async throws -> [WorkoutRating] {
        struct Response: Decodable { let ratings: [WorkoutRating]? }
        let r: Response = try await get("/app/api/feedback/workout?date=" + date)
        return r.ratings ?? []
    }
}
