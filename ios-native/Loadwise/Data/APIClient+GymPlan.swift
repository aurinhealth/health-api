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
